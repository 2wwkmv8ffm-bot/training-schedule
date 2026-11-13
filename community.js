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
  let scope = (() => { try { return localStorage.getItem(SCOPE_KEY) || "all"; } catch (e) { return "all"; } })();
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
    if (!isImg(file)) throw new Error("사진 파일만 올릴 수 있어요");
    const heic = /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name || "");
    try {
      let bmp;
      try { bmp = await createImageBitmap(file); }
      catch (e1) { // 일부 휴대폰(HEIC 등)은 <img>로는 열려요
        bmp = await new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = URL.createObjectURL(file); });
      }
      const W = bmp.width || bmp.naturalWidth, H = bmp.height || bmp.naturalHeight;
      const s = Math.min(1, max / Math.max(W, H));
      const c = document.createElement("canvas");
      c.width = Math.round(W * s); c.height = Math.round(H * s);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      const out = await new Promise((r) => c.toBlob((b) => r(b), "image/jpeg", 0.85));
      if (out) return out;
    } catch (e) { /* 아래에서 처리 */ }
    if (heic) throw new Error("이 휴대폰에서는 HEIC 사진을 바꿀 수 없어요. '앨범에서 고르기'나 '카메라로 찍기'로 올려 주세요.");
    return file;
  }
  // 사진인지 확인 (안드로이드 파일 앱은 형식이 비어 있을 때가 있어서 확장자도 봐요)
  function isImg(f) { return /^image\//.test(f.type) || /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp)$/i.test(f.name || ""); }
  async function uploadImage(file, path, max) {
    const blob = await shrink(file, max);
    const { error } = await db.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: true });
    if (error) throw new Error(/bucket|not found/i.test(error.message) ? "지금은 사진을 올릴 수 없어요. 잠시 뒤 다시 시도해 주세요." : error.message);
    return path;
  }
  TS.uploadImage = uploadImage;
  TS.pubUrl = pubUrl;

  // ---------- 👣 팔로우 + 배지 (팔로워 10명 ⭐ · 100명 🌟 · 1000명 👑) ----------
  const fol = { ok: true, following: new Set(), count: {} };
  async function loadFollows(ids) {
    if (!fol.ok || !me()) return;
    const { data: mine, error } = await db.from("follows").select("followee").eq("follower", me());
    if (error) { fol.ok = false; return; } // schema_follow.sql 실행 전
    fol.following = new Set((mine || []).map((r) => r.followee));
    const want = [...new Set([me(), ...ids])].filter(Boolean);
    if (!want.length) return;
    const { data } = await db.from("follows").select("followee").in("followee", want).limit(10000);
    want.forEach((u) => { fol.count[u] = 0; });
    (data || []).forEach((r) => { fol.count[r.followee] = (fol.count[r.followee] || 0) + 1; });
  }
  const BADGES = [[1000, "👑", "팔로워 1000명"], [100, "🌟", "팔로워 100명"], [10, "⭐", "팔로워 10명"]];
  // 🛡️ 운영자(앱 주인) — app_admins 표에 있는 계정만, 다른 사람에게는 없는 배지
  let owners = new Set();
  (async () => { try { const { data } = await db.from("app_admins").select("user_id"); owners = new Set((data || []).map((r) => r.user_id)); } catch (e) { /* 표 없음 */ } })();
  window.addEventListener("ts:auth", async () => { try { const { data } = await db.from("app_admins").select("user_id"); owners = new Set((data || []).map((r) => r.user_id)); } catch (e) { /* 무시 */ } });
  TS.isOwner = (uid) => owners.has(uid || me());
  function badge(uid) {
    const own = owners.has(uid) ? '<span class="obadge" title="ZONE 운영자">✔ ZONE</span>' : "";
    const n = fol.count[uid] || 0, b = BADGES.find(([k]) => n >= k);
    return own + (b ? `<span class="fbadge" title="${b[2]} 달성 (지금 ${n}명)">${b[1]}</span>` : "");
  }
  // 🔢 이름 뒤 번호 (예: 박찬욱#4821) — 아이디로 자동으로 정해져서 바뀌지 않고, 같은 닉네임끼리 구분돼요
  function tagNo(uid) { return uid ? String(parseInt(String(uid).replace(/-/g, "").slice(0, 8), 16) % 9000 + 1000) : ""; }
  function nameTag(nick, uid) { return `${esc(nick || "?")}<span class="ntag">#${tagNo(uid)}</span>`; }
  TS.tagNo = tagNo;
  async function toggleFollow(uid) {
    if (!fol.ok) { toast("팔로우 기능은 준비 중이에요 (서버 설정 필요)"); return; }
    const on = fol.following.has(uid);
    const { error } = on ? await db.from("follows").delete().eq("follower", me()).eq("followee", uid)
      : await db.from("follows").insert({ follower: me(), followee: uid });
    if (error) { toast("팔로우를 저장하지 못했어요"); return; }
    if (on) fol.following.delete(uid); else fol.following.add(uid);
    fol.count[uid] = Math.max(0, (fol.count[uid] || 0) + (on ? -1 : 1));
    toast(on ? "팔로우를 취소했어요" : "👣 팔로우했어요 — 친구 탭에서 이 사람 글이 보여요");
  }

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

  // ---------- 피드 (인스타그램처럼: 스토리 · 사진 넘기기 · 두 번 탭 좋아요 · 인기 · 저장 · 해시태그 · 프로필) ----------
  const SEL = "id,user_id,body,media,visibility,created_at,activity_id,members!posts_user_id_fkey(nickname,sport,avatar_url),activities(id,sport,title,distance_m,duration_s,avg_hr,route,started_at,source),post_likes(user_id),post_comments(count)";
  const SAVE_KEY = "training.savedPosts";
  const saved = new Set((() => { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "[]"); } catch (e) { return []; } })());
  const keepSaved = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify([...saved])); } catch (e) { /* 무시 */ } };
  let tag = null, stories = [], board = [];
  const clean = (rows) => (rows || []).map((p) => ({ ...p, activities: p.activities && p.activities.source !== "strava" ? p.activities : null }));
  const monday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };

  async function render() {
    const box = $("comBody");
    if (!box) return;
    clearMaps();
    const A = TS.auth;
    if (!A || !A.ready) { box.innerHTML = '<p class="hint">불러오는 중…</p>'; return; }
    if (!A.user) {
      box.innerHTML = `<div class="card" style="text-align:center">
        <div style="font-size:44px">👟</div><h3>친구들의 운동을 같이 봐요</h3>
        <p class="hint">로그인하면 사진·운동 기록을 올리고, 스토리·좋아요·댓글·친구 랭킹을 함께 할 수 있어요.</p>
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
    if (!feed.length) box.innerHTML = '<p class="hint">불러오는 중…</p>';
    await loadFriends();
    await loadFollows([]);
    const circle = [...new Set([me(), ...fr.accepted, ...fol.following])]; // 친구 + 내가 팔로우한 사람
    let q = db.from("posts").select(SEL).order("created_at", { ascending: false }).limit(scope === "hot" ? 60 : 30);
    if (scope === "friends") q = q.in("user_id", circle);
    else if (scope === "saved") q = q.in("id", saved.size ? [...saved] : ["00000000-0000-0000-0000-000000000000"]);
    else q = q.neq("visibility", "private");
    if (scope === "hot") q = q.gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString());
    if (tag) q = q.ilike("body", `%#${tag}%`);
    // 스토리(24시간)와 이번 주 랭킹은 친구 + 나 기준
    const [main, st, bd] = await Promise.all([
      q,
      db.from("posts").select(SEL).in("user_id", circle).gte("created_at", new Date(Date.now() - 864e5).toISOString()).order("created_at", { ascending: true }).limit(60),
      db.from("posts").select("user_id,members!posts_user_id_fkey(nickname,avatar_url),activities(sport,distance_m,duration_s,started_at,source)").in("user_id", circle).not("activity_id", "is", null).gte("created_at", monday().toISOString()).limit(200),
    ]);
    feed = clean(main.data);
    if (scope === "hot") feed.sort((a, b) => (b.post_likes || []).length - (a.post_likes || []).length);
    stories = clean(st.data);
    board = rank(bd.data || []);
    await loadFollows([...feed, ...stories].map((p) => p.user_id).concat(board.map((o) => o.id)));
    paint(box, main.error);
  }
  // 이번 주 친구 랭킹: 운동 시간 기준 (종목이 달라도 공평하게) + 거리
  function rank(rows) {
    const by = {};
    rows.forEach((r) => {
      const a = r.activities;
      if (!a || a.source === "strava") return;
      const o = by[r.user_id] = by[r.user_id] || { id: r.user_id, m: r.members || {}, sec: 0, km: 0, n: 0 };
      o.sec += a.duration_s || 0; o.km += (a.distance_m || 0) / 1000; o.n++;
    });
    return Object.values(by).sort((a, b) => b.sec - a.sec).slice(0, 10);
  }
  // 화면 그리기 (데이터와 분리 — 미리보기·테스트에도 써요)
  function paint(box, err) {
    const nIn = fr.incoming.length;
    const byUser = {};
    stories.forEach((p) => { (byUser[p.user_id] = byUser[p.user_id] || []).push(p); });
    const ring = Object.keys(byUser).sort((a, b) => (a === me() ? -1 : b === me() ? 1 : 0));
    const grid = scope === "hot" || scope === "saved";
    box.innerHTML = `
      <div class="story-bar">
        <button type="button" class="story me" id="comStoryAdd"><span class="ring add">${avatar(TS.auth && TS.auth.member, 58)}<i>＋</i></span><b>내 스토리</b></button>
        ${ring.map((u) => { const m = byUser[u][0].members || {}; return `<button type="button" class="story" data-story="${esc(u)}"><span class="ring">${avatar(m, 58)}</span><b>${esc(u === me() ? "나" : m.nickname || "?")}</b></button>`; }).join("")}
      </div>
      <div class="spread" style="margin:4px 0 10px">
        <div class="seg com-seg" style="margin:0;flex:1">${[["friends", "👥 친구"], ["all", "🌏 전체"], ["hot", "🔥 인기"], ["saved", "🔖 저장"]].map(([k, l]) => `<button type="button" data-scope="${k}" class="${scope === k ? "on" : ""}">${l}</button>`).join("")}</div>
        <button type="button" class="pill com-fr" id="comFriends" title="친구 추가">➕친구${nIn ? ` <span class="zb z5">${nIn}</span>` : ""}</button>
        <button type="button" class="pill com-fr" id="comMe" title="내 사진 모아보기">🖼️</button></div>
      ${tag ? `<div class="tag-bar"><b>#${esc(tag)}</b><span class="hint">태그가 달린 글</span><button type="button" class="link" id="comTagX">✕ 태그 해제</button></div>` : ""}
      ${board.length && scope === "friends" && !tag ? `<details class="card board" open><summary><b>🏆 이번 주 친구 랭킹</b> <span class="hint">운동 시간 기준 · 월요일부터</span></summary>
        ${board.map((o, i) => `<div class="bd-row${o.id === me() ? " me" : ""}" data-prof="${esc(o.id)}"><span class="bd-n">${["🥇", "🥈", "🥉"][i] || i + 1}</span>${avatar(o.m, 30)}<b>${esc(o.id === me() ? "나" : o.m.nickname || "?")}</b>${badge(o.id)}<span class="hint">${o.n}회 · ${o.km.toFixed(1)}km</span><b class="num" style="margin-left:auto">${fmtDur(o.sec)}</b></div>`).join("")}</details>` : ""}
      <button type="button" class="primary" id="comWrite" style="width:100%;padding:13px;border-radius:14px;margin-bottom:12px">✍️ 사진·글 올리기</button>
      ${err ? `<div class="note">글을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 열어 주세요.</div>` : ""}
      ${!feed.length ? `<div class="card" style="text-align:center"><p class="hint">${scope === "saved" ? "저장한 글이 없어요. 글 오른쪽 아래 🔖를 누르면 여기에 모여요." : scope === "hot" ? "이번 주 인기 글이 아직 없어요." : scope === "friends"
        ? (fr.accepted.length ? "친구들의 글이 아직 없어요." : "아직 친구가 없어요. 친구를 추가하거나 🌏 전체를 눌러 보세요.") : "아직 올라온 글이 없어요. 첫 글을 올려 보세요!"}</p></div>`
        : grid ? `<div class="ex-grid">${feed.map((p) => gridCell(p)).join("")}</div>` : feed.map(card).join("")}
      <p class="hint">운동 지도에는 출발·도착 근처 200m가 가려진 경로만 보여요 (나 → 공개 설정).</p>`;
    bindFeed(box);
  }
  function gridCell(p) {
    const ph = Array.isArray(p.media) && p.media[0], a = p.activities, n = (p.post_likes || []).length;
    return `<button type="button" class="ex-cell" data-open="${esc(p.id)}">${ph ? `<img src="${esc(pubUrl(ph))}" alt="" loading="lazy" />`
      : `<span class="ex-txt">${a ? `${SP[a.sport] ? SP[a.sport].icon : ""}<b>${dist(a)}</b>` : esc((p.body || "").slice(0, 40))}</span>`}
      ${Array.isArray(p.media) && p.media.length > 1 ? '<i class="ex-multi">❐</i>' : ""}${n ? `<i class="ex-like">❤️ ${n}</i>` : ""}</button>`;
  }
  function bindFeed(box) {
    $("comWrite").onclick = openComposer;
    $("comStoryAdd").onclick = openComposer;
    box.querySelectorAll("[data-story]").forEach((b) => { b.onclick = () => openStory(b.dataset.story); });
    box.querySelectorAll("[data-scope]").forEach((b) => { b.onclick = () => { scope = b.dataset.scope; tag = null; try { localStorage.setItem(SCOPE_KEY, scope); } catch (e) { /* 무시 */ } feed = []; render(); }; });
    if ($("comTagX")) $("comTagX").onclick = () => { tag = null; render(); };
    $("comFriends").onclick = openFriends;
    $("comMe").onclick = () => openProfile(me());
    bindPosts(box);
    box.querySelectorAll("[data-open]").forEach((b) => { b.onclick = () => openPost(b.dataset.open); });
    drawMaps(box);
    if (deepPost) { // 공유 링크(?post=…)로 들어왔으면 그 글로 이동
      const el = box.querySelector(`[data-share="${CSS.escape(deepPost)}"]`);
      if (el) { const art = el.closest("article"); art.scrollIntoView({ block: "center" }); art.style.boxShadow = "0 0 0 3px var(--accent)"; }
      else if (feed.some((x) => String(x.id) === deepPost)) openPost(deepPost);
      deepPost = null;
    }
  }
  // 글 카드 안의 버튼들 (피드·글 상세·프로필에서 같이 써요)
  function bindPosts(root) {
    root.querySelectorAll("[data-like]").forEach((b) => { b.onclick = () => toggleLike(b.dataset.like); });
    root.querySelectorAll("[data-cmt]").forEach((b) => { b.onclick = () => toggleComments(b.dataset.cmt); });
    root.querySelectorAll("[data-delpost]").forEach((b) => { b.onclick = () => deletePost(b.dataset.delpost); });
    root.querySelectorAll("[data-pin]").forEach((b) => { b.onclick = () => togglePin(b.dataset.pin); });
    root.querySelectorAll("[data-share]").forEach((b) => { b.onclick = () => openShare(findPost(b.dataset.share)); });
    root.querySelectorAll("[data-save]").forEach((b) => { b.onclick = () => toggleSave(b.dataset.save); });
    root.querySelectorAll("[data-tag]").forEach((b) => { b.onclick = (e) => { e.preventDefault(); closeOverlays(); tag = b.dataset.tag; if (scope === "saved") scope = "all"; render(); }; });
    root.querySelectorAll("[data-prof]").forEach((b) => { b.onclick = () => openProfile(b.dataset.prof); });
    root.querySelectorAll("[data-follow]").forEach((b) => { b.onclick = async () => { b.disabled = true; await toggleFollow(b.dataset.follow); document.querySelectorAll(`[data-follow="${CSS.escape(b.dataset.follow)}"]`).forEach((x) => { x.textContent = fol.following.has(b.dataset.follow) ? "팔로잉" : "팔로우"; x.disabled = false; }); }; });
    root.querySelectorAll(".car").forEach((c) => { // 사진 넘기기 점 표시
      const dots = c.parentElement.querySelectorAll(".car-dots i");
      c.onscroll = () => { const k = Math.round(c.scrollLeft / Math.max(1, c.clientWidth)); dots.forEach((d, i) => d.classList.toggle("on", i === k)); };
    });
    root.querySelectorAll("[data-dbl]").forEach((el) => { // 사진을 두 번 탭하면 좋아요 ❤️
      let last = 0;
      el.addEventListener("click", (e) => {
        const now = Date.now();
        if (now - last < 320) {
          e.preventDefault();
          const p = findPost(el.dataset.dbl);
          if (p && !(p.post_likes || []).some((l) => l.user_id === me())) toggleLike(el.dataset.dbl);
          const h = document.createElement("span"); h.className = "heart-pop"; h.textContent = "❤️"; el.appendChild(h); setTimeout(() => h.remove(), 800);
        }
        last = now;
      });
    });
  }
  const extra = {}; // 프로필·스토리에서 불러온 글 (피드에 없는 글)
  const findPost = (id) => feed.find((x) => String(x.id) === String(id)) || stories.find((x) => String(x.id) === String(id)) || extra[id];
  function closeOverlays() { ["postView", "profDlg", "storyDlg"].forEach((k) => { const d = $(k); if (d && d.open) d.close(); }); }
  function toggleSave(id) {
    if (saved.has(id)) saved.delete(id); else saved.add(id);
    keepSaved();
    document.querySelectorAll(`[data-save="${CSS.escape(id)}"]`).forEach((b) => { b.textContent = saved.has(id) ? "🔖" : "📑"; b.classList.toggle("on", saved.has(id)); });
    toast(saved.has(id) ? "🔖 저장했어요 — 저장 탭에서 다시 볼 수 있어요" : "저장을 취소했어요");
  }
  // 글 하나 크게 보기
  function openPost(id) {
    const p = findPost(id);
    if (!p) return;
    let d = $("postView");
    if (!d) { d = document.createElement("dialog"); d.id = "postView"; d.className = "sheet-dlg"; document.body.appendChild(d); d.onclick = (e) => { if (e.target === d) d.close(); }; }
    d.innerHTML = `<div style="padding:12px;max-height:90vh;overflow:auto"><div class="spread" style="margin-bottom:6px"><b>게시물</b><button type="button" class="link" style="font-size:20px" id="pvX">✕</button></div>${card(p)}</div>`;
    $("pvX").onclick = () => d.close();
    if (!d.open) d.showModal();
    bindPosts(d); drawMaps(d);
  }
  // 👤 프로필: 글 수 · 친구 수 · 이번 달 운동 · 글 모아보기(3칸 격자)
  let profView = "posts"; // posts: 게시물 격자 · photos: 사진만 모아보기
  async function openProfile(uid, view) {
    if (view) profView = view;
    let d = $("profDlg");
    if (!d) { d = document.createElement("dialog"); d.id = "profDlg"; d.className = "sheet-dlg"; document.body.appendChild(d); d.onclick = (e) => { if (e.target === d) d.close(); }; }
    d.innerHTML = '<div style="padding:18px"><p class="hint">불러오는 중…</p></div>';
    if (!d.open) d.showModal();
    const isMe = uid === me();
    let q = db.from("posts").select(SEL).eq("user_id", uid).order("created_at", { ascending: false }).limit(60);
    if (!isMe && !fr.accepted.includes(uid)) q = q.eq("visibility", "public");
    const [{ data: mm }, { data: ps }] = await Promise.all([db.from("members").select("id,nickname,sport,avatar_url").eq("id", uid).maybeSingle(), q]);
    const m = mm || fr.names[uid] || {};
    const pinIds = await loadPins(uid);
    const posts = clean(ps).sort((a, b) => (pinIds.includes(String(b.id)) ? 1 : 0) - (pinIds.includes(String(a.id)) ? 1 : 0)
      || pinIds.indexOf(String(a.id)) - pinIds.indexOf(String(b.id)));
    const photos = [];
    posts.forEach((p) => (Array.isArray(p.media) ? p.media : []).forEach((ph) => photos.push({ ph, id: p.id })));
    posts.forEach((p) => { extra[p.id] = p; });
    const mon = new Date(); mon.setDate(1); mon.setHours(0, 0, 0, 0);
    const monthActs = posts.filter((p) => p.activities && new Date(p.activities.started_at || p.created_at) >= mon).map((p) => p.activities);
    const km = monthActs.reduce((a, x) => a + (x.distance_m || 0) / 1000, 0), sec = monthActs.reduce((a, x) => a + (x.duration_s || 0), 0);
    const likes = posts.reduce((a, p) => a + (p.post_likes || []).length, 0);
    const st = isMe ? "me" : fr.accepted.includes(uid) ? "friend" : fr.outgoing.includes(uid) ? "sent" : fr.incoming.includes(uid) ? "got" : "none";
    await loadFollows([uid]);
    let nFing = 0;
    if (fol.ok) { const { count } = await db.from("follows").select("followee", { count: "exact", head: true }).eq("follower", uid); nFing = count || 0; }
    const nFol = fol.count[uid] || 0, nextB = [10, 100, 1000].find((k) => nFol < k);
    const isF = fol.following.has(uid);
    d.innerHTML = `<div style="padding:16px;max-height:90vh;overflow:auto;display:grid;gap:12px">
      <div class="spread"><b>${nameTag(m.nickname, uid)} ${badge(uid)}</b><button type="button" class="link" style="font-size:20px" data-pf="x">✕</button></div>
      <div class="prof-hd">${avatar(m, 76)}<div class="prof-st"><div><b>${posts.length}</b><span>게시물</span></div><div><b>${fol.ok ? nFol : "-"}</b><span>팔로워</span></div><div><b>${fol.ok ? nFing : "-"}</b><span>팔로잉</span></div><div><b>${likes}</b><span>받은 ❤️</span></div></div></div>
      <div class="hint">${m.sport ? esc(m.sport) + " · " : ""}이번 달 운동 ${monthActs.length}회 · ${km.toFixed(0)}km · ${fmtDur(sec)}${fol.ok && nextB ? ` · 다음 배지까지 팔로워 ${nextB - nFol}명 (${{ 10: "⭐", 100: "🌟", 1000: "👑" }[nextB]})` : ""}</div>
      <div style="display:flex;gap:8px">
        ${st === "me" ? "" : `<button type="button" class="${isF ? "pill" : "primary"}" data-pf="follow" style="flex:1">${isF ? "✓ 팔로잉" : "👣 팔로우"}</button>`}
        ${st === "me" ? "" : st === "friend" ? '<button type="button" class="pill" disabled style="flex:1">✓ 친구</button>' : st === "sent" ? '<button type="button" class="pill" disabled style="flex:1">친구 요청 보냄</button>'
        : st === "got" ? `<button type="button" class="primary" data-pf="acc" style="flex:1">친구 요청 수락</button>` : `<button type="button" class="pill" data-pf="ask" style="flex:1">＋ 친구 요청</button>`}</div>
      <p class="hint" style="margin:0">배지: 팔로워 10명 ⭐ · 100명 🌟 · 1000명 👑 — 이름 옆에 작게 붙어요.</p>
      <div class="seg" style="margin:0"><button type="button" data-pv="posts" class="${profView === "posts" ? "on" : ""}">▦ 게시물 ${posts.length}</button><button type="button" data-pv="photos" class="${profView === "photos" ? "on" : ""}">🖼️ 사진 ${photos.length}</button></div>
      ${isMe && posts.length ? `<p class="hint" style="margin:0">사진을 누르면 크게 보고 <b>📌 고정</b>·<b>삭제</b>할 수 있어요. 고정한 글은 맨 위에 보여요 (최대 ${MAX_PINS}개).</p>` : ""}
      ${profView === "photos"
        ? (photos.length ? `<div class="ex-grid">${photos.map((x) => `<button type="button" class="ex-cell" data-open="${esc(x.id)}"><img src="${esc(pubUrl(x.ph))}" alt="" loading="lazy" />${pins.has(String(x.id)) ? '<i class="ex-pin">📌</i>' : ""}</button>`).join("")}</div>`
          : `<p class="hint" style="text-align:center">${isMe ? "아직 올린 사진이 없어요." : "볼 수 있는 사진이 없어요."}</p>`)
        : (posts.length ? `<div class="ex-grid">${posts.map((p) => gridCell(p).replace("</button>", `${pins.has(String(p.id)) ? '<i class="ex-pin">📌</i>' : ""}</button>`)).join("")}</div>`
          : `<p class="hint" style="text-align:center">${isMe ? "아직 올린 글이 없어요." : "볼 수 있는 글이 없어요 (친구가 되면 친구 공개 글도 보여요)."}</p>`)}</div>`;
    d.querySelector('[data-pf="x"]').onclick = () => d.close();
    d.querySelectorAll("[data-pv]").forEach((b) => { b.onclick = () => openProfile(uid, b.dataset.pv); });
    d.querySelectorAll("[data-open]").forEach((b) => { b.onclick = () => openPost(b.dataset.open); });
    const fb = d.querySelector('[data-pf="follow"]'); if (fb) fb.onclick = async () => { fb.disabled = true; await toggleFollow(uid); openProfile(uid); };
    const act = d.querySelector('[data-pf="ask"],[data-pf="acc"]');
    if (act) act.onclick = async () => {
      act.disabled = true;
      const { error } = act.dataset.pf === "ask" ? await db.from("friendships").insert({ requester: me(), addressee: uid, status: "pending" })
        : await db.from("friendships").update({ status: "accepted" }).eq("requester", uid).eq("addressee", me());
      if (error) { toast("저장하지 못했어요. 잠시 뒤 다시 시도해 주세요"); act.disabled = false; return; }
      await loadFriends(); openProfile(uid);
    };
  }
  // 📸 스토리: 24시간 안에 올린 글을 한 장씩 (탭: 왼쪽 이전 · 오른쪽 다음, 5초마다 넘어가요)
  let stTimer = null;
  function openStory(uid) {
    const users = [...new Set(stories.map((p) => p.user_id))].sort((a, b) => (a === me() ? -1 : b === me() ? 1 : 0));
    let ui = users.indexOf(uid), k = 0;
    if (ui < 0) return;
    let d = $("storyDlg");
    if (!d) { d = document.createElement("dialog"); d.id = "storyDlg"; document.body.appendChild(d); }
    const list = () => stories.filter((p) => p.user_id === users[ui]);
    const close = () => { clearTimeout(stTimer); if (d.open) d.close(); };
    const step = (dir) => {
      k += dir;
      if (k >= list().length) { ui++; k = 0; }
      if (k < 0) { ui--; k = ui >= 0 ? list().length - 1 : 0; }
      if (ui < 0 || ui >= users.length) { close(); return; }
      draw();
    };
    function draw() {
      clearTimeout(stTimer);
      const ps = list(), p = ps[k], m = p.members || {}, a = p.activities, ph = Array.isArray(p.media) && p.media[0];
      d.innerHTML = `<div class="story-view">
        <div class="sv-bars">${ps.map((_, i) => `<i class="${i < k ? "done" : i === k ? "run" : ""}"></i>`).join("")}</div>
        <div class="sv-hd">${avatar(m, 32)}<b>${esc(m.nickname || "?")}</b><span>${ago(p.created_at)}</span><button type="button" data-sv="x">✕</button></div>
        <div class="sv-media">${ph ? `<img src="${esc(pubUrl(ph))}" alt="" />` : `<div class="sv-card">${a ? `<div style="font-size:54px">${SP[a.sport] ? SP[a.sport].icon : "🏅"}</div><b>${esc(a.title || "")}</b><div class="sv-stats"><span>${dist(a)}</span><span>${speed(a)}</span><span>${fmtDur(a.duration_s)}</span></div>` : `<div style="font-size:54px">💬</div>`}</div>`}</div>
        ${p.body ? `<div class="sv-txt">${esc(p.body.slice(0, 160))}</div>` : ""}
        ${ph && a ? `<div class="sv-chip">${SP[a.sport] ? SP[a.sport].icon : ""} ${dist(a)} · ${speed(a)} · ${fmtDur(a.duration_s)}</div>` : ""}
        <div class="sv-nav"><button type="button" data-sv="p" aria-label="이전"></button><button type="button" data-sv="n" aria-label="다음"></button></div>
        <div class="sv-ft"><button type="button" data-sv="like">${(p.post_likes || []).some((l) => l.user_id === me()) ? "❤️" : "🤍"} 좋아요</button><button type="button" data-sv="open">💬 댓글·자세히</button></div></div>`;
      d.querySelector('[data-sv="x"]').onclick = close;
      d.querySelector('[data-sv="p"]').onclick = () => step(-1);
      d.querySelector('[data-sv="n"]').onclick = () => step(1);
      d.querySelector('[data-sv="like"]').onclick = async () => { clearTimeout(stTimer); await toggleLike(p.id); draw(); };
      d.querySelector('[data-sv="open"]').onclick = () => { close(); openPost(p.id); };
      stTimer = setTimeout(() => step(1), 5000);
    }
    d.onclose = () => clearTimeout(stTimer);
    draw();
    if (!d.open) d.showModal();
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

  // #해시태그는 눌러서 모아보기
  const withTags = (s) => esc(s).replace(/#([0-9A-Za-zㄱ-ㅎ가-힣_]{1,30})/g, (_, t) => `<a href="#" class="htag" data-tag="${t}">#${t}</a>`);
  function card(p) {
    const m = p.members || {};
    const a = p.activities;
    const liked = (p.post_likes || []).some((l) => l.user_id === me());
    const nLikes = (p.post_likes || []).length;
    const nCmt = (p.post_comments && p.post_comments[0] && p.post_comments[0].count) || 0;
    const mine = p.user_id === me();
    const photos = Array.isArray(p.media) ? p.media : [];
    const id = esc(p.id);
    const sv = saved.has(String(p.id));
    return `<article class="card post ig">
      <div class="post-hd"><button type="button" class="link" data-prof="${esc(p.user_id)}" style="padding:0">${avatar(m, 36)}</button>
        <div style="flex:1;min-width:0"><button type="button" class="link nm" data-prof="${esc(p.user_id)}">${nameTag(m.nickname || "알 수 없음", p.user_id)}</button>${badge(p.user_id)}${!mine && fol.ok && !fol.following.has(p.user_id) && !fr.accepted.includes(p.user_id) ? ` <button type="button" class="link fol-btn" data-follow="${esc(p.user_id)}">팔로우</button>` : ""}${mine ? ' <span class="hint">(나)</span>' : ""}
          <div class="hint">${a && SP[a.sport] ? `${SP[a.sport].icon} ${SP[a.sport].name} · ` : ""}${VIS[p.visibility] || ""}</div></div>
        ${mine ?`<button type="button" class="link" data-pin="${id}">${pins.has(String(p.id)) ? "고정 해제" : "📌 고정"}</button> <button type="button" class="link" data-delpost="${id}">삭제</button>` : ""}</div>
      ${photos.length ? `<div class="car-wrap" data-dbl="${id}"><div class="car">${photos.map((ph) => `<img src="${esc(pubUrl(ph))}" alt="운동 사진" loading="lazy" />`).join("")}</div>
        ${photos.length > 1 ? `<div class="car-dots">${photos.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("")}</div><span class="car-n">${photos.length}장</span>` : ""}</div>` : ""}
      ${a ? `<div class="post-act-card"${photos.length ? "" : ` data-dbl="${id}"`}><div class="post-title">${SP[a.sport] ? SP[a.sport].icon + " " : ""}${esc(a.title || "")}</div>
        <div class="post-stats">
          <div><span>거리</span><b class="num">${dist(a)}</b></div>
          <div><span>${a.sport === "bike" || a.sport === "tri" ? "속도" : "페이스"}</span><b class="num">${speed(a)}</b></div>
          <div><span>시간</span><b class="num">${fmtDur(a.duration_s)}</b></div>
          ${a.avg_hr ? `<div><span>심박</span><b class="num">${a.avg_hr}</b></div>` : ""}</div>
        ${a.route && a.route.length > 1 ? `<div class="post-map" data-map="${id}"></div>` : ""}</div>` : ""}
      ${!photos.length && !a && p.body ? `<div class="txt-post" data-dbl="${id}">${withTags(p.body.slice(0, 200))}</div>` : ""}
      <div class="post-act">
        <button type="button" data-like="${id}" class="ic${liked ? " on" : ""}" aria-label="좋아요">${liked ? "❤️" : "🤍"}</button>
        <button type="button" data-cmt="${id}" class="ic" aria-label="댓글">💬</button>
        <button type="button" data-share="${id}" class="ic" aria-label="공유">📤</button>
        <button type="button" data-save="${id}" class="ic${sv ? " on" : ""}" style="margin-left:auto" aria-label="저장">${sv ? "🔖" : "📑"}</button></div>
      <div class="post-likes" data-likes="${id}">${nLikes ? `좋아요 <b>${nLikes}</b>개` : "가장 먼저 좋아요를 눌러 보세요"}</div>
      ${p.body && (photos.length || a) ? `<div class="post-body"><button type="button" class="link nm" data-prof="${esc(p.user_id)}">${esc(m.nickname || "")}</button> ${withTags(p.body)}</div>` : ""}
      ${nCmt ? `<button type="button" class="link cm-more" data-cmt="${id}">댓글 <span>${nCmt}</span>개 모두 보기</button>` : ""}
      <div class="hint post-time">${ago(p.created_at)}</div>
      <div class="post-cmts" id="cm-${id}" hidden></div>
    </article>`;
  }

  function drawMaps(root) {
    if (!window.L) return;
    (root || document).querySelectorAll("[data-map]").forEach((el) => {
      if (el._map) return;
      const p = findPost(el.dataset.map);
      if (!p || !p.activities) return;
      const map = L.map(el, { zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false });
      el._map = map;
      map.attributionControl.setPrefix(false);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "&copy; OpenStreetMap" }).addTo(map);
      const line = L.polyline(p.activities.route.map((r) => [r[0], r[1]]), { color: "#e11d48", weight: 4, opacity: 0.95 }).addTo(map);
      map.fitBounds(line.getBounds(), { padding: [16, 16] });
      maps.push(map);
    });
  }

  const liking = new Set();
  async function toggleLike(id) {
    const p = findPost(id);
    if (!p || liking.has(id)) return;
    liking.add(id);
    const liked = (p.post_likes || []).some((l) => l.user_id === me());
    p.post_likes = liked ? p.post_likes.filter((l) => l.user_id !== me()) : [...(p.post_likes || []), { user_id: me() }];
    paintLike(id, p); // 먼저 화면부터 바꾸고 (빠르게), 실패하면 되돌려요
    const { error } = liked
      ? await db.from("post_likes").delete().eq("post_id", id).eq("user_id", me())
      : await db.from("post_likes").insert({ post_id: id, user_id: me() });
    liking.delete(id);
    if (error) {
      p.post_likes = liked ? [...p.post_likes, { user_id: me() }] : p.post_likes.filter((l) => l.user_id !== me());
      paintLike(id, p); toast("좋아요를 저장하지 못했어요");
    }
  }
  function paintLike(id, p) {
    const on = (p.post_likes || []).some((l) => l.user_id === me()), n = (p.post_likes || []).length;
    document.querySelectorAll(`[data-like="${CSS.escape(String(id))}"]`).forEach((b) => { b.classList.toggle("on", on); b.textContent = on ? "❤️" : "🤍"; if (on) { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); } });
    document.querySelectorAll(`[data-likes="${CSS.escape(String(id))}"]`).forEach((el) => { el.innerHTML = n ? `좋아요 <b>${n}</b>개` : "가장 먼저 좋아요를 눌러 보세요"; });
  }

  async function toggleComments(id, keepOpen) {
    const pv = $("postView"), box = (pv && pv.open && pv.querySelector(`[id="cm-${CSS.escape(String(id))}"]`)) || $("cm-" + id);
    if (!box) return;
    if (!box.hidden && !keepOpen) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '<p class="hint">불러오는 중…</p>';
    const { data, error } = await db.from("post_comments").select("id,body,created_at,user_id,members!post_comments_user_id_fkey(nickname,avatar_url)").eq("post_id", id).order("created_at");
    if (error) { box.innerHTML = `<p class="hint">댓글을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요</p>`; return; }
    const owner = (findPost(id) || {}).user_id === me();
    box.innerHTML = (data || []).map((c) => `<div class="cmt">${avatar(c.members, 26)}<div><b>${esc((c.members || {}).nickname || "?")}</b> ${esc(c.body)}
        <span class="hint">${ago(c.created_at)}</span>${c.user_id === me() || owner ? ` <button type="button" class="link" data-delc="${esc(c.id)}">삭제</button>` : ""}</div></div>`).join("") +
      `<div class="emo-row">${["🔥", "👏", "💪", "😍", "👍", "🏃"].map((x) => `<button type="button" data-emo="${x}">${x}</button>`).join("")}</div><form class="cmt-form"><input maxlength="500" placeholder="댓글 달기…" required /><button type="submit" class="primary pill">게시</button></form>`;
    box.querySelectorAll("[data-emo]").forEach((b) => { b.onclick = () => { const i = box.querySelector("form input"); i.value += b.dataset.emo; i.focus(); }; });
    const form = box.querySelector("form");
    form.onsubmit = async (e) => {
      e.preventDefault();
      const body = form.querySelector("input").value.trim();
      if (!body) return;
      const { error: e2 } = await db.from("post_comments").insert({ post_id: id, user_id: me(), body });
      if (e2) { toast("댓글을 올리지 못했어요. 인터넷 연결을 확인해 주세요"); return; }
      bumpCount(id, 1);
      toggleComments(id, true);
    };
    box.querySelectorAll("[data-delc]").forEach((b) => {
      b.onclick = async () => {
        if (!await TS.ask("이 댓글을 지울까요?", "삭제")) return;
        const { error: e3 } = await db.from("post_comments").delete().eq("id", b.dataset.delc);
        if (e3) { toast("댓글을 지우지 못했어요"); return; }
        bumpCount(id, -1);
        toggleComments(id, true);
      };
    });
  }
  function bumpCount(id, d) {
    document.querySelectorAll(`.cm-more[data-cmt="${CSS.escape(String(id))}"] span`).forEach((b) => { b.textContent = Math.max(0, +b.textContent + d); });
    const p = findPost(id);
    if (p && p.post_comments && p.post_comments[0]) p.post_comments[0].count = Math.max(0, (p.post_comments[0].count || 0) + d);
  }
  // 📌 고정 (인스타그램처럼 내 프로필 맨 위에, 최대 3개) — schema_pin.sql 실행 후 작동
  const MAX_PINS = 3;
  let pinOk = true;
  const pins = new Set();
  async function loadPins(uid) {
    if (!pinOk || !uid) return [];
    const { data, error } = await db.from("posts").select("id,pinned_at").eq("user_id", uid).not("pinned_at", "is", null).order("pinned_at", { ascending: false });
    if (error) { pinOk = false; return []; }
    (data || []).forEach((r) => pins.add(String(r.id)));
    return (data || []).map((r) => String(r.id));
  }
  async function togglePin(id) {
    id = String(id);
    const mineNow = await loadPins(me());
    if (!pinOk) { toast("고정 기능은 서버 설정이 필요해요 (schema_pin.sql 실행)"); return; }
    const on = mineNow.includes(id);
    if (!on && mineNow.length >= MAX_PINS) { toast(`고정은 ${MAX_PINS}개까지예요. 다른 글의 고정을 먼저 풀어 주세요`); return; }
    const { error } = await db.from("posts").update({ pinned_at: on ? null : new Date().toISOString() }).eq("id", id).eq("user_id", me());
    if (error) { toast("고정하지 못했어요. 잠시 뒤 다시 시도해 주세요"); return; }
    if (on) pins.delete(id); else pins.add(id);
    toast(on ? "고정을 풀었어요" : "📌 내 프로필 맨 위에 고정했어요 (피드 순서는 그대로예요)");
    const pv = $("postView"); if (pv && pv.open) openPost(id);
    const pd = $("profDlg"); if (pd && pd.open) openProfile(me());
  }
  async function deletePost(id) {
    const p = findPost(id);
    if (!p || !await TS.ask("이 글을 지울까요? 사진·댓글·좋아요도 함께 지워져요.", "삭제")) return;
    closeOverlays();
    const { error } = await db.from("posts").delete().eq("id", id);
    if (error) { toast("글을 지우지 못했어요. 잠시 뒤 다시 시도해 주세요"); return; }
    if (Array.isArray(p.media) && p.media.length) await db.storage.from(BUCKET).remove(p.media);
    render();
  }

  // ---------- 글쓰기 (사진 + 글 + 운동 기록 + 공개 범위) ----------
  let picked = [];
  async function openComposer() {
    picked = [];
    $("postBody").innerHTML = `<div class="spread"><h2 style="margin:0">✍️ 사진·글 올리기</h2><button type="button" id="pcClose">닫기</button></div>
      <textarea id="pcText" rows="4" maxlength="1000" placeholder="오늘 운동 어땠어요? #오운완 처럼 태그를 달면 같은 태그 글을 모아 볼 수 있어요"></textarea>
      <div class="chips">${["#오운완", "#러닝", "#수영", "#자전거", "#철인3종", "#인터벌", "#롱런", "#대회", "#새벽운동"].map((t) => `<button type="button" class="chip" data-addtag="${t}">${t}</button>`).join("")}
        <button type="button" class="chip" id="pcToday">📋 오늘 훈련 불러오기</button></div>
      <div><div class="spread"><span class="eyebrow" style="margin:0">📷 사진 (최대 ${MAX_PHOTOS}장)</span>
        </div>
        <div class="chips" style="margin-top:6px">
          <button type="button" class="pill" data-pick="pcCam">📷 카메라로 찍기</button>
          <button type="button" class="pill" data-pick="pcAlb">🖼️ 앨범에서 고르기</button>
          <button type="button" class="pill" data-pick="pcDoc">📁 파일에서 고르기</button></div>
        <input type="file" id="pcCam" accept="image/*" capture="environment" hidden />
        <input type="file" id="pcAlb" accept="image/*" multiple hidden />
        <input type="file" id="pcDoc" accept="image/*,.heic,.heif" multiple hidden />
        <div class="media" id="pcPrev" style="margin-top:8px"></div></div>
      <label>공개 범위
        <select id="pcVis">${["public", "friends", "private"].map((v) => `<option value="${v}"${v === "public" ? " selected" : ""}>${VIS[v]}</option>`).join("")}</select></label>
      <p class="hint" style="margin:-6px 0 0">🌏 전체 공개로 올리면 모든 ZONE 사람들이 보고 응원할 수 있어요.</p>
      <p class="hint" style="margin:0">⚠️ 사진에 집 주소·다른 사람 얼굴이나 개인정보가 보이지 않는지 확인하고 올려 주세요.</p>
      <p class="warn" id="pcMsg" style="margin:0"></p>
      <div class="actions"><div class="right"><button type="button" class="primary" id="pcGo" style="padding:12px 22px">올리기</button></div></div>`;
    $("postDlg").showModal();
    $("pcClose").onclick = () => $("postDlg").close();
    $("postBody").querySelectorAll("[data-pick]").forEach((b) => { b.onclick = () => {
      if (picked.length >= MAX_PHOTOS) { $("pcMsg").textContent = `사진은 최대 ${MAX_PHOTOS}장까지 올릴 수 있어요.`; return; }
      $(b.dataset.pick).click();
    }; });
    $("postBody").querySelectorAll("[data-addtag]").forEach((b) => { b.onclick = () => { const t = $("pcText"); if (!t.value.includes(b.dataset.addtag)) t.value = (t.value.trim() + " " + b.dataset.addtag).trim(); b.classList.add("on"); }; });
    $("pcToday").onclick = () => { // 오늘 달력의 훈련·일지로 문구 만들기
      const today = TS.iso(new Date()), ss = (TS.getSessions ? TS.getSessions() : []).filter((s) => s.date === today);
      const j = TS.journal && TS.journal.get(today);
      const lines = ss.map((s) => `${s.completed ? "✅" : "▫️"} ${s.title}${s.duration_min ? ` (${s.duration_min}분)` : ""}`);
      if (j && j.condition) lines.push(`컨디션 ${["", "😫", "😕", "🙂", "😀", "🤩"][j.condition]}${j.rpe ? ` · 힘든 정도 ${j.rpe}/10` : ""}`);
      const t = $("pcText"); t.value = (t.value ? t.value + "\n" : "") + (lines.length ? lines.join("\n") + "\n#오운완" : "#오운완");
    };
    ["pcCam", "pcAlb", "pcDoc"].forEach((id) => { $(id).onchange = (e) => {
      const files = [...e.target.files], ok = files.filter(isImg), before = picked.length;
      picked = picked.concat(ok).slice(0, MAX_PHOTOS);
      e.target.value = "";
      $("pcMsg").textContent = ok.length < files.length ? "사진이 아닌 파일은 빼고 담았어요."
        : before + ok.length > MAX_PHOTOS ? `사진은 최대 ${MAX_PHOTOS}장까지라 ${MAX_PHOTOS}장만 담았어요.` : "";
      drawPreview();
    }; });
    $("pcGo").onclick = submitPost;
  }
  function drawPreview() {
    $("pcPrev").innerHTML = picked.map((f, i) => `<div class="m"><img src="${URL.createObjectURL(f)}" alt="" /><button type="button" class="x" data-rmp="${i}">✕</button></div>`).join("");
    $("pcPrev").querySelectorAll("[data-rmp]").forEach((b) => { b.onclick = () => { picked.splice(+b.dataset.rmp, 1); drawPreview(); }; });
  }
  async function submitPost() {
    const vis = $("pcVis").value, text = $("pcText").value.trim(), actId = null;
    const msg = $("pcMsg"), btn = $("pcGo");
    if (!text && !picked.length) { msg.textContent = "글이나 사진 중 하나는 있어야 해요."; return; }
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
  function who(id) { const m = fr.names[id]; return m ? `<button type="button" class="link nm" data-frprof="${esc(id)}">${nameTag(m.nickname, id)}</button>${m.sport ? ` <span class="hint">${esc(m.sport)}</span>` : ""}` : "?"; }
  function renderFriends(results) {
    const myNick = (TS.auth && TS.auth.member && TS.auth.member.nickname) || "";
    $("friendBody").innerHTML = `<div class="spread"><h2 style="margin:0">👥 친구</h2><button type="button" id="frClose">닫기</button></div>
      <div class="card" style="margin:0;padding:12px;display:grid;gap:8px">
        <div class="eyebrow" style="margin:0">➕ 친구 추가</div>
        <form id="frSearch" class="cmt-form"><input placeholder="닉네임 또는 닉네임#번호 (예: 박찬욱#1234)" maxlength="26" required /><button type="submit" class="primary pill">찾기</button></form>
        <p class="hint" style="margin:0">내 이름: <b>${nameTag(myNick, me())}</b> — 같은 닉네임이 있어도 #번호로 구분돼요. 친구에게 알려 주세요.</p></div>
      <div id="frResults"></div>
      ${fr.incoming.length ? `<div><div class="eyebrow">받은 요청</div>${fr.incoming.map((id) => `<div class="pr-row"><span>${who(id)}</span>
        <span class="row"><button type="button" class="primary pill" data-acc="${id}">수락</button><button type="button" class="pill" data-rm="${id}">거절</button></span></div>`).join("")}</div>` : ""}
      <div><div class="eyebrow">친구 ${fr.accepted.length}명</div>${fr.accepted.length ? fr.accepted.map((id) => `<div class="pr-row"><span>${who(id)}</span>
        <button type="button" class="link" data-rm="${id}">친구 끊기</button></div>`).join("") : '<p class="hint" style="margin:0">아직 친구가 없어요.</p>'}</div>
      ${fr.outgoing.length ? `<div><div class="eyebrow">보낸 요청</div>${fr.outgoing.map((id) => `<div class="pr-row"><span>${who(id)}</span>
        <button type="button" class="link" data-rm="${id}">취소</button></div>`).join("")}</div>` : ""}
      `;
    if (results) {
      const box = $("frResults");
      box.innerHTML = `<div class="eyebrow">찾은 사람</div>` + (results.length ? results.map((m) => {
        const st = fr.accepted.includes(m.id) ? "✓ 친구" : fr.outgoing.includes(m.id) ? "요청 보냄" : fr.incoming.includes(m.id) ? "요청 받음 (위에서 수락)" : null;
        return `<div class="pr-row"><span>${avatar(m, 30)} ${who(m.id)}</span>
          ${st ? `<span class="hint">${st}</span>` : `<button type="button" class="primary pill" data-ask="${m.id}">➕ 친구 요청</button>`}</div>`;
      }).join("") : '<p class="hint" style="margin:0">찾는 사람이 없어요. 닉네임을 다시 확인해 주세요.</p>');
      $("friendBody").appendChild(box); // 검색 결과는 맨 아래
    }
    $("frClose").onclick = () => { $("friendDlg").close(); render(); };
    $("friendBody").querySelectorAll("[data-frprof]").forEach((b) => { b.onclick = () => openProfile(b.dataset.frprof); });
    $("frSearch").onsubmit = async (e) => {
      e.preventDefault();
      const raw = e.target.querySelector("input").value.trim();
      const [nick, no] = raw.split("#").map((s) => (s || "").trim());
      const term = nick.replace(/[%_,()]/g, "");
      if (!term && !no) return;
      let { data } = await db.from("members").select("id,nickname,sport,avatar_url").ilike("nickname", `%${term}%`).neq("id", me()).limit(no ? 200 : 20);
      data = (data || []).filter((m) => !no || tagNo(m.id) === no.replace(/\D/g, "")).slice(0, 20);
      data.forEach((m) => { fr.names[m.id] = m; });
      renderFriends(data);
    };
    $("friendBody").querySelectorAll("[data-ask]").forEach((b) => {
      b.onclick = async () => {
        const { error } = await db.from("friendships").insert({ requester: me(), addressee: b.dataset.ask, status: "pending" });
        if (error) { toast(/duplicate/i.test(error.message) ? "이미 친구 요청을 보냈어요" : "친구 요청을 보내지 못했어요"); return; }
        await loadFriends(); renderFriends();
      };
    });
    $("friendBody").querySelectorAll("[data-acc]").forEach((b) => {
      b.onclick = async () => {
        const { error } = await db.from("friendships").update({ status: "accepted" }).eq("requester", b.dataset.acc).eq("addressee", me());
        if (error) { toast("수락하지 못했어요. 잠시 뒤 다시 시도해 주세요"); return; }
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

  TS.community = { render, _paint: (f, s, b) => { feed = f; stories = s; board = b; paint($("comBody")); } }; // _paint: 화면 미리보기·점검용
  window.addEventListener("ts:auth", () => {
    if (deepPost && TS.showTab && !document.getElementById("tab-community").classList.contains("show")) { TS.showTab("community"); return; }
    if (document.getElementById("tab-community").classList.contains("show")) render();
  });
})();
