// 커뮤니티: 사진·글 올리기, 친구/전체 피드, 운동 기록(빨간 경로 지도), 좋아요, 댓글, 친구 관리
(function () {
  const TS = window.TS;
  const { db, fmtDur, fmtPace } = TS;
  const esc = (s) => TS.escapeHtml(s == null ? "" : s);
  const $ = (id) => document.getElementById(id);
  const SP = TS.ACT_SPORTS;
  const VIS = { public: "🌏 전체 공개", friends: "👥 친구만", private: "🔒 나만" };
  const SCOPE_KEY = "training.feedScope";
  const BUCKET = "media";
  const MAX_PHOTOS = 6;
  let scope = (() => { try { return localStorage.getItem(SCOPE_KEY) || "friends"; } catch (e) { return "friends"; } })();
  let feed = [], maps = [];
  const fr = { accepted: [], incoming: [], outgoing: [], names: {} };

  const me = () => TS.auth && TS.auth.user && TS.auth.user.id;
  const pubUrl = (path) => db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  function ago(iso) {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))}분 전`;
    if (s < 86400) return `${Math.round(s / 3600)}시간 전`;
    if (s < 86400 * 7) return `${Math.round(s / 86400)}일 전`;
    const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  const dist = (a) => (a.sport === "swim" ? `${Math.round(a.distance_m || 0)}m` : `${((a.distance_m || 0) / 1000).toFixed(2)}km`);
  const speed = (a) => (a.sport === "bike" || a.sport === "tri" ? `${(((a.distance_m || 0) / Math.max(a.duration_s, 1)) * 3.6).toFixed(1)}km/h`
    : a.sport === "swim" ? `${fmtDur(((a.duration_s || 0) * 100) / Math.max(a.distance_m || 1, 1))}/100m` : fmtPace(a.distance_m ? (a.duration_s * 1000) / a.distance_m : 0));
  function clearMaps() { maps.forEach((m) => { try { m.remove(); } catch (e) { /* 무시 */ } }); maps = []; }
  function avatar(m, size = 40) {
    const s = `width:${size}px;height:${size}px`;
    return m && m.avatar_url ? `<img class="av" style="${s};object-fit:cover" src="${esc(m.avatar_url)}" alt="" />`
      : `<div class="av" style="${s}">${esc(((m && m.nickname) || "?").slice(0, 1))}</div>`;
  }

  // 사진 줄이기 (긴 쪽 최대 px, JPEG) — 휴대폰 사진도 빠르게 올라가요
  async function shrink(file, max = 1600) {
    if (!/^image\//.test(file.type)) throw new Error("사진 파일만 올릴 수 있어요");
    try {
      const bmp = await createImageBitmap(file);
      const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      return await new Promise((r) => c.toBlob((b) => r(b || file), "image/jpeg", 0.85));
    } catch (e) { return file; }
  }
  async function uploadImage(file, path, max) {
    const blob = await shrink(file, max);
    const { error } = await db.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(/bucket|not found/i.test(error.message) ? "지금은 사진을 올릴 수 없어요. 잠시 뒤 다시 시도해 주세요." : error.message);
    return path;
  }
  TS.uploadImage = uploadImage;
  TS.pubUrl = pubUrl;

  // ---------- 친구 ----------
  async function loadFriends() {
    const uid = me();
    const { data, error } = await db.from("friendships").select("requester,addressee,status");
    if (error) return error;
    fr.accepted = data.filter((f) => f.status === "accepted").map((f) => (f.requester === uid ? f.addressee : f.requester));
    fr.incoming = data.filter((f) => f.status === "pending" && f.addressee === uid).map((f) => f.requester);
    fr.outgoing = data.filter((f) => f.status === "pending" && f.requester === uid).map((f) => f.addressee);
    const ids = [...new Set([...fr.accepted, ...fr.incoming, ...fr.outgoing])];
    if (ids.length) {
      const { data: ms } = await db.from("members").select("id,nickname,sport,avatar_url").in("id", ids);
      (ms || []).forEach((m) => { fr.names[m.id] = m; });
    }
    return null;
  }

  // ---------- 피드 ----------
  async function render() {
    const box = $("comBody");
    if (!box) return;
    clearMaps();
    const A = TS.auth;
    if (!A || !A.ready) { box.innerHTML = '<p class="hint">불러오는 중…</p>'; return; }
    if (!A.user) {
      box.innerHTML = `<div class="card" style="text-align:center">
        <div style="font-size:44px">👟</div><h3>친구들의 운동을 같이 봐요</h3>
        <p class="hint">로그인하면 사진·운동 기록을 올리고, 친구·전체 글에 좋아요·댓글을 남길 수 있어요.</p>
        <button type="button" class="primary" id="comLogin" style="padding:12px 24px">로그인 · 회원가입</button></div>`;
      $("comLogin").onclick = () => A.open("login");
      return;
    }
    if (A.memberError) {
      box.innerHTML = `<div class="card"><h3>⚙️ 커뮤니티 준비가 필요해요</h3>
        <p class="txt">커뮤니티 서버가 아직 준비 중이에요. 잠시 뒤 다시 확인해 주세요.</p>
        <p class="hint">${esc(A.memberError.message || "")}</p><button type="button" id="comRetry">다시 확인</button></div>`;
      $("comRetry").onclick = async () => { await A.reloadMember(); render(); };
      return;
    }
    box.innerHTML = '<p class="hint">불러오는 중…</p>';
    await loadFriends();
    let q = db.from("posts")
      .select("id,user_id,body,media,visibility,created_at,activity_id,members!posts_user_id_fkey(nickname,sport,avatar_url),activities(id,sport,title,distance_m,duration_s,avg_hr,route,started_at,source),post_likes(user_id),post_comments(count)")
      .order("created_at", { ascending: false }).limit(30);
    if (scope === "friends") q = q.in("user_id", [me(), ...fr.accepted]);
    else q = q.neq("visibility", "private");
    const { data, error } = await q;
    feed = (data || []).map((p) => ({ ...p, activities: p.activities && p.activities.source !== "strava" ? p.activities : null }));
    const nIn = fr.incoming.length;
    box.innerHTML = `
      <button type="button" class="primary" id="comWrite" style="width:100%;padding:14px;border-radius:14px;margin-bottom:12px">✍️ 사진·글 올리기</button>
      <div class="spread" style="margin-bottom:12px">
        <div class="seg" style="margin:0;flex:1"><button type="button" data-scope="friends" class="${scope === "friends" ? "on" : ""}">👥 친구</button>
          <button type="button" data-scope="all" class="${scope === "all" ? "on" : ""}">🌏 전체</button></div>
        <button type="button" class="pill" id="comFriends">친구 ${fr.accepted.length}${nIn ? ` <span class="zb z5">${nIn}</span>` : ""}</button></div>
      ${error ? `<div class="note">글을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 열어 주세요.</div>` : ""}
      ${feed.length ? feed.map(card).join("") : `<div class="card" style="text-align:center"><p class="hint">${scope === "friends"
        ? (fr.accepted.length ? "친구들의 글이 아직 없어요." : "아직 친구가 없어요. 친구를 추가하거나 🌏 전체를 눌러 보세요.")
        : "아직 올라온 글이 없어요. 첫 글을 올려 보세요!"}</p></div>`}
      <p class="hint">운동 지도에는 출발·도착 근처 200m가 가려진 경로만 보여요 (나 → 공개 설정).</p>`;
    $("comWrite").onclick = openComposer;
    box.querySelectorAll("[data-scope]").forEach((b) => { b.onclick = () => { scope = b.dataset.scope; try { localStorage.setItem(SCOPE_KEY, scope); } catch (e) { /* 무시 */ } render(); }; });
    $("comFriends").onclick = openFriends;
    box.querySelectorAll("[data-like]").forEach((b) => { b.onclick = () => toggleLike(b.dataset.like, b); });
    box.querySelectorAll("[data-cmt]").forEach((b) => { b.onclick = () => toggleComments(b.dataset.cmt); });
    box.querySelectorAll("[data-delpost]").forEach((b) => { b.onclick = () => deletePost(b.dataset.delpost); });
    box.querySelectorAll("[data-share]").forEach((b) => { b.onclick = () => openShare(feed.find((x) => String(x.id) === b.dataset.share)); });
    drawMaps();
    if (deepPost) { // 공유 링크(?post=…)로 들어왔으면 그 글로 이동
      const el = box.querySelector(`[data-share="${CSS.escape(deepPost)}"]`);
      if (el) { const art = el.closest("article"); art.scrollIntoView({ block: "center" }); art.style.boxShadow = "0 0 0 3px var(--accent)"; }
      deepPost = null;
    }
  }

  // ---------- 📤 공유: 카톡·인스타·페이스북·X·밴드·라인·링크 복사·이미지 저장 ----------
  let deepPost = (() => { try { return new URLSearchParams(location.search).get("post"); } catch (e) { return null; } })();
  const appUrl = () => location.origin + location.pathname;
  const postUrl = (p) => `${appUrl()}?post=${encodeURIComponent(p.id)}`;
  function shareText(p) {
    const a = p.activities, m = p.members || {};
    const head = a ? `${SP[a.sport] ? SP[a.sport].icon + " " + SP[a.sport].name : "운동"} ${dist(a)} · ${speed(a)} · ${fmtDur(a.duration_s)}` : "";
    return [`${m.nickname || "ZONE"}님의 운동${head ? " — " + head : ""}`, p.body ? p.body.slice(0, 120) : "", "ZONE에서 같이 훈련해요 💪"].filter(Boolean).join("\n");
  }
  const loadImg = (src) => new Promise((ok) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => ok(im); im.onerror = () => ok(null); im.src = src; });
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  // 인스타그램용 4:5 이미지 카드 (사진 또는 경로 + 기록)
  async function makeCard(p) {
    const W = 1080, H = 1350, cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const c = cv.getContext("2d"), a = p.activities, m = p.members || {};
    const photos = Array.isArray(p.media) ? p.media : [];
    const img = photos.length ? await loadImg(pubUrl(photos[0])) : null;
    if (img) { // 사진을 꽉 차게
      const s = Math.max(W / img.width, H / img.height);
      c.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
    } else {
      const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#0f172a"); g.addColorStop(1, "#1d4ed8");
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      if (a && a.route && a.route.length > 1) { // 지도 없이 경로 선만 그리기
        const la = a.route.map((r) => r[0]), lo = a.route.map((r) => r[1]);
        const [y0, y1, x0, x1] = [Math.min(...la), Math.max(...la), Math.min(...lo), Math.max(...lo)];
        const kx = Math.cos(((y0 + y1) / 2) * Math.PI / 180);
        const bw = (x1 - x0) * kx || 1e-6, bh = y1 - y0 || 1e-6, box = 760, s = Math.min(box / bw, box / bh);
        const ox = (W - bw * s) / 2, oy = 200 + (box - bh * s) / 2;
        c.strokeStyle = "#ff3b5c"; c.lineWidth = 12; c.lineJoin = c.lineCap = "round"; c.shadowColor = "rgba(255,59,92,.6)"; c.shadowBlur = 24;
        c.beginPath();
        a.route.forEach((r, i) => { const x = ox + (r[1] - x0) * kx * s, y = oy + (y1 - r[0]) * s; i ? c.lineTo(x, y) : c.moveTo(x, y); });
        c.stroke(); c.shadowBlur = 0;
      }
    }
    const g2 = c.createLinearGradient(0, H * 0.5, 0, H); g2.addColorStop(0, "rgba(0,0,0,0)"); g2.addColorStop(1, "rgba(0,0,0,.78)");
    c.fillStyle = g2; c.fillRect(0, 0, W, H);
    c.fillStyle = "rgba(0,0,0,.35)"; c.fillRect(0, 0, W, 130);
    const F = "'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif";
    c.fillStyle = "#fff"; c.font = `900 56px ${F}`; c.fillText("ZONE", 56, 86);
    c.font = `600 34px ${F}`; c.textAlign = "right";
    c.fillText(`${m.nickname || ""} · ${new Date((a && a.started_at) || p.created_at).toLocaleDateString("ko-KR")}`, W - 56, 82);
    c.textAlign = "left";
    let y = H - 70;
    if (a) {
      const stats = [["거리", dist(a)], [a.sport === "bike" || a.sport === "tri" ? "속도" : "페이스", speed(a)], ["시간", fmtDur(a.duration_s)]];
      if (a.avg_hr) stats.push(["심박", String(a.avg_hr)]);
      const cw = (W - 112) / stats.length;
      stats.forEach(([k, v], i) => {
        c.font = `600 30px ${F}`; c.fillStyle = "rgba(255,255,255,.75)"; c.fillText(k, 56 + i * cw, y - 76);
        c.font = `800 ${stats.length > 3 ? 52 : 60}px ${F}`; c.fillStyle = "#fff"; c.fillText(v, 56 + i * cw, y - 10);
      });
      y -= 150;
      const t = (a.title || (SP[a.sport] ? SP[a.sport].name : "")).slice(0, 22);
      c.font = `800 64px ${F}`; c.fillText(`${SP[a.sport] ? SP[a.sport].icon + " " : ""}${t}`, 56, y);
      y -= 90;
    }
    if (p.body) {
      c.font = `500 38px ${F}`; c.fillStyle = "rgba(255,255,255,.92)";
      const line = p.body.replace(/\s+/g, " ").slice(0, 40) + (p.body.length > 40 ? "…" : "");
      roundRect(c, 44, y - 52, Math.min(W - 88, c.measureText(line).width + 40), 70, 18); c.fillStyle = "rgba(0,0,0,.35)"; c.fill();
      c.fillStyle = "#fff"; c.fillText(line, 64, y - 4);
    }
    return new Promise((ok) => { try { cv.toBlob((b) => ok(b), "image/jpeg", 0.92); } catch (e) { ok(null); } });
  }
  function toast(msg) {
    const el = document.createElement("div"); el.className = "toast"; el.textContent = msg; document.body.appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select();
      let ok = false; try { ok = document.execCommand("copy"); } catch (x) { ok = false; } t.remove(); return ok;
    }
  }
  function download(blob, name) {
    const u = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 3000);
  }
  async function openShare(p) {
    if (!p) return;
    let d = $("shareDlg");
    if (!d) { d = document.createElement("dialog"); d.id = "shareDlg"; document.body.appendChild(d); d.onclick = (e) => { if (e.target === d) d.close(); }; }
    const url = postUrl(p), text = shareText(p);
    d.innerHTML = `<div style="padding:18px;display:grid;gap:12px;max-height:88vh;overflow:auto">
      <div class="spread"><b style="font-size:17px">📤 공유하기</b><button type="button" class="link" data-s="x" style="font-size:20px">✕</button></div>
      <div id="shPrev" style="aspect-ratio:4/5;border-radius:14px;background:#0f172a;display:grid;place-items:center;color:#94a3b8;overflow:hidden">이미지 만드는 중…</div>
      <button type="button" class="primary" data-s="native" style="padding:13px;border-radius:12px">📱 카톡 · 인스타 · 문자로 보내기</button>
      <div class="share-grid">
        <button type="button" data-s="kakao"><span style="background:#fee500;color:#191919">💬</span>카카오톡</button>
        <button type="button" data-s="insta"><span style="background:linear-gradient(45deg,#f58529,#dd2a7b,#8134af)">📸</span>인스타그램</button>
        <button type="button" data-s="fb"><span style="background:#1877f2">f</span>페이스북</button>
        <button type="button" data-s="tw"><span style="background:#000">𝕏</span>X</button>
        <button type="button" data-s="band"><span style="background:#2db400">B</span>밴드</button>
        <button type="button" data-s="line"><span style="background:#06c755">L</span>라인</button>
        <button type="button" data-s="copy"><span style="background:#64748b">🔗</span>링크 복사</button>
        <button type="button" data-s="save"><span style="background:#334155">⬇️</span>이미지 저장</button>
      </div>
      <p class="hint" id="shHint" style="margin:0">${p.visibility === "public" ? "" : "🔒 이 글은 전체 공개가 아니라서, 링크를 받은 사람은 로그인·친구여야 볼 수 있어요. 이미지로 공유하면 누구나 볼 수 있어요."}</p>
    </div>`;
    d.querySelector('[data-s="x"]').onclick = () => d.close();
    if (!d.open) d.showModal();
    const blob = await makeCard(p);
    const file = blob ? new File([blob], `ZONE_${String(p.id).slice(0, 8)}.jpg`, { type: "image/jpeg" }) : null;
    const prev = d.querySelector("#shPrev");
    if (blob && prev) { prev.innerHTML = ""; const im = new Image(); im.src = URL.createObjectURL(blob); im.style.cssText = "width:100%;height:100%;object-fit:cover"; prev.appendChild(im); }
    else if (prev) prev.textContent = "이미지를 만들 수 없어요 (링크로 공유해 주세요)";
    const canFiles = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
    const hint = (t) => { const h = d.querySelector("#shHint"); if (h) h.innerHTML = t; };
    const nativeShare = async (withFile) => {
      if (!navigator.share) return false;
      try { await navigator.share(withFile && canFiles ? { files: [file], text: `${text}\n${url}` } : { title: "ZONE", text, url }); return true; }
      catch (e) { return e && e.name === "AbortError"; } // 사용자가 취소한 건 실패 아님
    };
    const open = (u) => window.open(u, "_blank", "noopener,width=600,height=640");
    const enc = encodeURIComponent;
    d.querySelectorAll("[data-s]").forEach((b) => {
      const k = b.dataset.s;
      if (k === "x") return;
      b.onclick = async () => {
        if (k === "native") { if (!await nativeShare(true)) { await copy(`${text}\n${url}`); hint("이 기기는 바로 보내기를 지원하지 않아요. 글과 링크를 복사했어요 — 카톡·문자에 붙여넣기 하세요."); } }
        else if (k === "kakao") {
          if (await nativeShare(true)) hint("공유 목록에서 <b>카카오톡</b>을 고르세요.");
          else { await copy(`${text}\n${url}`); hint("글과 링크를 복사했어요. 카카오톡 채팅방에 <b>붙여넣기</b> 하세요. (이미지는 '이미지 저장' 후 보내기)"); }
        } else if (k === "insta") {
          if (canFiles && await nativeShare(true)) hint("공유 목록에서 <b>Instagram</b>(스토리·피드)을 고르세요.");
          else if (file) { download(file, file.name); await copy(text); hint("이미지를 저장했어요. 인스타그램 앱에서 <b>새 게시물·스토리 → 사진 선택</b>으로 올리세요. 글은 복사돼 있어요."); }
        } else if (k === "fb") open(`https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`);
        else if (k === "tw") open(`https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`);
        else if (k === "band") open(`https://band.us/plugin/share?body=${enc(`${text}\n${url}`)}&route=${enc(appUrl())}`);
        else if (k === "line") open(`https://social-plugins.line.me/lineit/share?url=${enc(url)}&text=${enc(text)}`);
        else if (k === "copy") { if (await copy(url)) toast("🔗 링크를 복사했어요"); }
        else if (k === "save" && file) { download(file, file.name); toast("⬇️ 이미지를 저장했어요"); }
      };
    });
  }

  function card(p) {
    const m = p.members || {};
    const a = p.activities;
    const liked = (p.post_likes || []).some((l) => l.user_id === me());
    const nLikes = (p.post_likes || []).length;
    const nCmt = (p.post_comments && p.post_comments[0] && p.post_comments[0].count) || 0;
    const mine = p.user_id === me();
    const photos = Array.isArray(p.media) ? p.media : [];
    return `<article class="card post">
      <div class="post-hd">${avatar(m)}
        <div style="flex:1;min-width:0"><b>${esc(m.nickname || "알 수 없음")}${mine ? " <span class=\"hint\">(나)</span>" : ""}</b>
          <div class="hint">${ago(p.created_at)}${a && SP[a.sport] ? ` · ${SP[a.sport].icon} ${SP[a.sport].name}` : ""} · ${VIS[p.visibility] || ""}</div></div>
        ${mine ? `<button type="button" class="link" data-delpost="${esc(p.id)}">삭제</button>` : ""}</div>
      ${p.body ? `<div class="post-body">${esc(p.body)}</div>` : ""}
      ${photos.length ? `<div class="post-photos n${Math.min(photos.length, 4)}">${photos.slice(0, 4).map((ph, i) =>
        `<a href="${esc(pubUrl(ph))}" target="_blank" rel="noopener"><img src="${esc(pubUrl(ph))}" alt="운동 사진" loading="lazy" />${i === 3 && photos.length > 4 ? `<span class="more">+${photos.length - 4}</span>` : ""}</a>`).join("")}</div>` : ""}
      ${a ? `<div class="post-title">${esc(a.title || "")}</div>
        <div class="post-stats">
          <div><span>거리</span><b class="num">${dist(a)}</b></div>
          <div><span>${a.sport === "bike" || a.sport === "tri" ? "속도" : "페이스"}</span><b class="num">${speed(a)}</b></div>
          <div><span>시간</span><b class="num">${fmtDur(a.duration_s)}</b></div>
          ${a.avg_hr ? `<div><span>심박</span><b class="num">${a.avg_hr}</b></div>` : ""}</div>
        ${a.route && a.route.length > 1 ? `<div class="post-map" data-map="${esc(p.id)}"></div>` : ""}` : ""}
      <div class="post-act">
        <button type="button" data-like="${esc(p.id)}" class="${liked ? "on" : ""}">${liked ? "❤️" : "🤍"} <span>${nLikes}</span></button>
        <button type="button" data-cmt="${esc(p.id)}">💬 <span>${nCmt}</span></button>
        <button type="button" data-share="${esc(p.id)}" style="margin-left:auto">📤 공유</button></div>
      <div class="post-cmts" id="cm-${esc(p.id)}" hidden></div>
    </article>`;
  }

  function drawMaps() {
    if (!window.L) return;
    document.querySelectorAll("#comBody [data-map]").forEach((el) => {
      const p = feed.find((x) => String(x.id) === el.dataset.map);
      if (!p || !p.activities) return;
      const map = L.map(el, { zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false });
      map.attributionControl.setPrefix(false);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "&copy; OpenStreetMap" }).addTo(map);
      const line = L.polyline(p.activities.route.map((r) => [r[0], r[1]]), { color: "#e11d48", weight: 4, opacity: 0.95 }).addTo(map);
      map.fitBounds(line.getBounds(), { padding: [16, 16] });
      maps.push(map);
    });
  }

  async function toggleLike(id, btn) {
    const p = feed.find((x) => String(x.id) === id);
    if (!p) return;
    btn.disabled = true;
    const liked = (p.post_likes || []).some((l) => l.user_id === me());
    const { error } = liked
      ? await db.from("post_likes").delete().eq("post_id", id).eq("user_id", me())
      : await db.from("post_likes").insert({ post_id: id, user_id: me() });
    btn.disabled = false;
    if (error) { alert("좋아요 실패: " + error.message); return; }
    p.post_likes = liked ? p.post_likes.filter((l) => l.user_id !== me()) : [...(p.post_likes || []), { user_id: me() }];
    btn.className = liked ? "" : "on";
    btn.innerHTML = `${liked ? "🤍" : "❤️"} <span>${p.post_likes.length}</span>`;
  }

  async function toggleComments(id, keepOpen) {
    const box = $("cm-" + id);
    if (!box) return;
    if (!box.hidden && !keepOpen) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '<p class="hint">불러오는 중…</p>';
    const { data, error } = await db.from("post_comments").select("id,body,created_at,user_id,members!post_comments_user_id_fkey(nickname,avatar_url)").eq("post_id", id).order("created_at");
    if (error) { box.innerHTML = `<p class="hint">댓글을 불러오지 못했어요: ${esc(error.message)}</p>`; return; }
    const owner = (feed.find((x) => String(x.id) === id) || {}).user_id === me();
    box.innerHTML = (data || []).map((c) => `<div class="cmt">${avatar(c.members, 26)}<div><b>${esc((c.members || {}).nickname || "?")}</b> ${esc(c.body)}
        <span class="hint">${ago(c.created_at)}</span>${c.user_id === me() || owner ? ` <button type="button" class="link" data-delc="${esc(c.id)}">삭제</button>` : ""}</div></div>`).join("") +
      `<form class="cmt-form"><input maxlength="500" placeholder="댓글 달기…" required /><button type="submit" class="primary pill">등록</button></form>`;
    const form = box.querySelector("form");
    form.onsubmit = async (e) => {
      e.preventDefault();
      const body = form.querySelector("input").value.trim();
      if (!body) return;
      const { error: e2 } = await db.from("post_comments").insert({ post_id: id, user_id: me(), body });
      if (e2) { alert("댓글 실패: " + e2.message); return; }
      bumpCount(id, 1);
      toggleComments(id, true);
    };
    box.querySelectorAll("[data-delc]").forEach((b) => {
      b.onclick = async () => {
        if (!await TS.ask("이 댓글을 지울까요?", "삭제")) return;
        const { error: e3 } = await db.from("post_comments").delete().eq("id", b.dataset.delc);
        if (e3) { alert("삭제 실패: " + e3.message); return; }
        bumpCount(id, -1);
        toggleComments(id, true);
      };
    });
  }
  function bumpCount(id, d) {
    const b = document.querySelector(`#comBody [data-cmt="${CSS.escape(id)}"] span`);
    if (b) b.textContent = Math.max(0, +b.textContent + d);
  }
  async function deletePost(id) {
    const p = feed.find((x) => String(x.id) === id);
    if (!p || !await TS.ask("이 글을 지울까요? 사진·댓글·좋아요도 함께 지워져요.", "삭제")) return;
    const { error } = await db.from("posts").delete().eq("id", id);
    if (error) { alert("삭제 실패: " + error.message); return; }
    if (Array.isArray(p.media) && p.media.length) await db.storage.from(BUCKET).remove(p.media);
    render();
  }

  // ---------- 글쓰기 (사진 + 글 + 운동 기록 + 공개 범위) ----------
  let picked = [];
  async function openComposer() {
    picked = [];
    const acts = (await TS.listActivities()).filter((a) => !a.local && a.source !== "strava").slice(0, 30);
    $("postBody").innerHTML = `<div class="spread"><h2 style="margin:0">✍️ 사진·글 올리기</h2><button type="button" id="pcClose">닫기</button></div>
      <textarea id="pcText" rows="4" maxlength="1000" placeholder="오늘 운동 어땠어요?"></textarea>
      <div><div class="spread"><span class="eyebrow" style="margin:0">📷 사진 (최대 ${MAX_PHOTOS}장)</span>
        <button type="button" class="pill" id="pcPick">사진 고르기</button></div>
        <input type="file" id="pcFile" accept="image/*" multiple hidden />
        <div class="media" id="pcPrev" style="margin-top:8px"></div></div>
      <label>운동 기록 붙이기 (빨간 경로 지도가 같이 보여요)
        <select id="pcAct"><option value="">붙이지 않기</option>${acts.map((a) => {
          const d = new Date(a.started_at);
          return `<option value="${esc(a.id)}">${d.getMonth() + 1}/${d.getDate()} · ${SP[a.sport] ? SP[a.sport].icon : ""} ${esc(a.title || "")} · ${dist(a)}</option>`;
        }).join("")}</select></label>
      ${acts.length ? "" : '<p class="hint" style="margin:0">계정에 저장된 운동 기록이 없어서 붙일 기록이 없어요.</p>'}
      <label>공개 범위
        <select id="pcVis">${["friends", "public", "private"].map((v) => `<option value="${v}"${TS.privacy().visibility === v ? " selected" : ""}>${VIS[v]}</option>`).join("")}</select></label>
      <p class="hint" style="margin:0">⚠️ 사진에 집 주소·다른 사람 얼굴이나 개인정보가 보이지 않는지 확인하고 올려 주세요.</p>
      <p class="warn" id="pcMsg" style="margin:0"></p>
      <div class="actions"><div class="right"><button type="button" class="primary" id="pcGo" style="padding:12px 22px">올리기</button></div></div>`;
    $("postDlg").showModal();
    $("pcClose").onclick = () => $("postDlg").close();
    $("pcPick").onclick = () => $("pcFile").click();
    $("pcFile").onchange = (e) => {
      picked = picked.concat([...e.target.files].filter((f) => /^image\//.test(f.type))).slice(0, MAX_PHOTOS);
      e.target.value = "";
      drawPreview();
    };
    $("pcGo").onclick = submitPost;
  }
  function drawPreview() {
    $("pcPrev").innerHTML = picked.map((f, i) => `<div class="m"><img src="${URL.createObjectURL(f)}" alt="" /><button type="button" class="x" data-rmp="${i}">✕</button></div>`).join("");
    $("pcPrev").querySelectorAll("[data-rmp]").forEach((b) => { b.onclick = () => { picked.splice(+b.dataset.rmp, 1); drawPreview(); }; });
  }
  async function submitPost() {
    const text = $("pcText").value.trim(), actId = $("pcAct").value || null, vis = $("pcVis").value;
    const msg = $("pcMsg"), btn = $("pcGo");
    if (!text && !picked.length && !actId) { msg.textContent = "글, 사진, 운동 기록 중 하나는 있어야 해요."; return; }
    btn.disabled = true; msg.textContent = "";
    try {
      const paths = [];
      for (let i = 0; i < picked.length; i++) {
        btn.textContent = `사진 올리는 중… ${i + 1}/${picked.length}`;
        paths.push(await uploadImage(picked[i], `posts/${me()}/${Date.now()}-${i}.jpg`));
      }
      btn.textContent = "올리는 중…";
      const { error } = await db.from("posts").insert({ user_id: me(), body: text || null, media: paths, activity_id: actId, visibility: vis });
      if (error) { if (paths.length) await db.storage.from(BUCKET).remove(paths); throw error; }
      $("postDlg").close();
      if (scope === "all" && vis !== "public") scope = "friends";
      render();
    } catch (e) {
      msg.textContent = "올리지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.";
      btn.disabled = false; btn.textContent = "올리기";
    }
  }

  // ---------- 친구 관리 ----------
  function openFriends() { renderFriends(); $("friendDlg").showModal(); }
  function who(id) { const m = fr.names[id]; return m ? `${esc(m.nickname)}${m.sport ? ` <span class="hint">${esc(m.sport)}</span>` : ""}` : "?"; }
  function renderFriends(results) {
    $("friendBody").innerHTML = `<div class="spread"><h2 style="margin:0">👥 친구</h2><button type="button" id="frClose">닫기</button></div>
      ${fr.incoming.length ? `<div><div class="eyebrow">받은 요청</div>${fr.incoming.map((id) => `<div class="pr-row"><span>${who(id)}</span>
        <span class="row"><button type="button" class="primary pill" data-acc="${id}">수락</button><button type="button" class="pill" data-rm="${id}">거절</button></span></div>`).join("")}</div>` : ""}
      <div><div class="eyebrow">친구 ${fr.accepted.length}명</div>${fr.accepted.length ? fr.accepted.map((id) => `<div class="pr-row"><span>${who(id)}</span>
        <button type="button" class="link" data-rm="${id}">친구 끊기</button></div>`).join("") : '<p class="hint" style="margin:0">아직 친구가 없어요.</p>'}</div>
      ${fr.outgoing.length ? `<div><div class="eyebrow">보낸 요청</div>${fr.outgoing.map((id) => `<div class="pr-row"><span>${who(id)}</span>
        <button type="button" class="link" data-rm="${id}">취소</button></div>`).join("")}</div>` : ""}
      <form id="frSearch" class="cmt-form"><input placeholder="닉네임으로 친구 찾기" maxlength="20" required /><button type="submit" class="pill">찾기</button></form>
      ${results ? (results.length ? results.map((m) => {
        const st = fr.accepted.includes(m.id) ? "친구" : fr.outgoing.includes(m.id) ? "요청 보냄" : fr.incoming.includes(m.id) ? "요청 받음" : null;
        return `<div class="pr-row"><span>${esc(m.nickname)}${m.sport ? ` <span class="hint">${esc(m.sport)}</span>` : ""}</span>
          ${st ? `<span class="hint">${st}</span>` : `<button type="button" class="primary pill" data-ask="${m.id}">친구 요청</button>`}</div>`;
      }).join("") : '<p class="hint" style="margin:0">찾는 닉네임이 없어요.</p>') : ""}`;
    $("frClose").onclick = () => { $("friendDlg").close(); render(); };
    $("frSearch").onsubmit = async (e) => {
      e.preventDefault();
      const term = e.target.querySelector("input").value.trim().replace(/[%_,()]/g, "");
      if (!term) return;
      const { data } = await db.from("members").select("id,nickname,sport,avatar_url").ilike("nickname", `%${term}%`).neq("id", me()).limit(10);
      (data || []).forEach((m) => { fr.names[m.id] = m; });
      renderFriends(data || []);
    };
    $("friendBody").querySelectorAll("[data-ask]").forEach((b) => {
      b.onclick = async () => {
        const { error } = await db.from("friendships").insert({ requester: me(), addressee: b.dataset.ask, status: "pending" });
        if (error) { alert("요청 실패: " + error.message); return; }
        await loadFriends(); renderFriends();
      };
    });
    $("friendBody").querySelectorAll("[data-acc]").forEach((b) => {
      b.onclick = async () => {
        const { error } = await db.from("friendships").update({ status: "accepted" }).eq("requester", b.dataset.acc).eq("addressee", me());
        if (error) { alert("수락 실패: " + error.message); return; }
        await loadFriends(); renderFriends();
      };
    });
    $("friendBody").querySelectorAll("[data-rm]").forEach((b) => {
      b.onclick = async () => {
        const other = b.dataset.rm;
        if (!await TS.ask("정말 할까요?")) return;
        await db.from("friendships").delete().or(`and(requester.eq.${me()},addressee.eq.${other}),and(requester.eq.${other},addressee.eq.${me()})`);
        await loadFriends(); renderFriends();
      };
    });
  }

  TS.community = { render };
  window.addEventListener("ts:auth", () => {
    if (deepPost && TS.showTab && !document.getElementById("tab-community").classList.contains("show")) { TS.showTab("community"); return; }
    if (document.getElementById("tab-community").classList.contains("show")) render();
  });
})();
