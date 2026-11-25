// 🎁 친구 초대(추천인 코드 · 카톡 공유) + 💎 ZONE 코칭 멤버십(신청 · 운영자 승인)
// 서버 규칙: schema_referral.sql (추천은 서버 함수 set_referrer 로만 기록돼요)
(function () {
  const TS = window.TS;
  const { db } = TS;
  const esc = (s) => TS.escapeHtml(s == null ? "" : s);
  const $ = (id) => document.getElementById(id);
  const me = () => (TS.auth && TS.auth.user && TS.auth.user.id) || null;
  const isAdmin = () => !!(TS.isOwner && me() && TS.isOwner(me()));
  const toast = (t) => { const el = document.createElement("div"); el.className = "toast"; el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 3500); };

  const KAKAO_KEY = "ee9e0b82806e798dec6b0f27abe7ae45"; // 카카오 JavaScript 키 (공개 키 · 등록한 주소에서만 작동)
  const KAKAO_SDK = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js";
  const PRICE = "99,000원";
  const NEED = 10; // 추천 10명마다 1개월권
  const BENEFITS = [
    ["🏊", "한 달에 한 번 모임", "코치에게 2시간 직접 배우는 시간"],
    ["💬", "개인 카톡 자세 피드백", "영상을 보내면 자세를 봐 드려요"],
    ["📞", "코치 통화", "훈련 · 대회 고민을 전화로 상담"],
  ];

  // 내 추천 코드 = Z + 계정 번호 앞 8자리 (서버 함수와 같은 규칙)
  const codeOf = (uid) => (uid ? "Z" + uid.replace(/-/g, "").slice(0, 8).toUpperCase() : "");
  const cleanCode = (s) => String(s || "").replace(/[^0-9A-Za-z]/g, "").toUpperCase().replace(/^Z?/, "Z");
  const codeOk = (s) => /^Z[0-9A-F]{8}$/.test(cleanCode(s));
  const inviteUrl = (code) => new URL(`invite.html?c=${encodeURIComponent(code)}`, location.href).href;
  const inviteText = (code) => `🏊🚴🏃 ZONE 같이 해요!\n아침마다 코치가 내 훈련을 짜 줘요. 부상 없이 쉽게 늘어요.\n가입할 때 추천인 코드에 ${code} 적어 주세요.\n${inviteUrl(code)}`;

  const st = { loaded: false, left: 0, total: 0, coupons: [], endsOn: null, req: null, adminReq: 0, adminCp: 0 };
  const today = () => { const d = new Date(Date.now() + 9 * 3600e3); return d.toISOString().slice(0, 10); }; // 한국 날짜
  const daysLeft = () => (st.endsOn ? Math.round((new Date(st.endsOn + "T00:00:00Z") - new Date(today() + "T00:00:00Z")) / 864e5) : -1);
  const isMember = () => daysLeft() >= 0;

  async function load() {
    const uid = me(); if (!uid) { st.loaded = false; return; }
    const [r1, r2, r3, r4] = await Promise.all([
      db.from("referrals").select("referee,coupon_id").eq("referrer", uid),
      db.from("coupons").select("id,source,period,note,status,created_at").eq("user_id", uid).order("created_at"),
      db.from("memberships").select("ends_on").eq("user_id", uid).maybeSingle(),
      db.from("membership_requests").select("id,status,created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(1),
    ]);
    if (r1.error) { st.loaded = false; return; } // 서버 설정(SQL) 전
    st.total = (r1.data || []).length;
    st.left = (r1.data || []).filter((r) => !r.coupon_id).length;
    st.coupons = r2.data || [];
    st.endsOn = (r3.data && r3.data.ends_on) || null;
    st.req = (r4.data && r4.data[0]) || null;
    if (isAdmin()) {
      const [a1, a2] = await Promise.all([
        db.from("membership_requests").select("id", { count: "exact", head: true }).eq("status", "new"),
        db.from("coupons").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ]);
      st.adminReq = a1.count || 0; st.adminCp = a2.count || 0;
    }
    st.loaded = true;
  }

  // ---------- "나" 탭 카드 ----------
  const monthKo = (p) => (p ? `${+p.slice(5, 7)}월 ` : "");
  const cpName = (c) => (c.source === "referral" ? "🎁 친구 10명 초대" : c.source === "likes" ? `❤️ ${monthKo(c.period)}좋아요 1등` : `👑 ${monthKo(c.period)}팔로워 1등`);
  function cardsHtml() {
    if (!me() || !st.loaded) return "";
    const code = codeOf(me());
    const pct = Math.min(100, Math.round((st.left / NEED) * 100));
    const usable = st.coupons.filter((c) => c.status === "approved");
    const pend = st.coupons.filter((c) => c.status === "pending");
    return `
      ${usable.length || pend.length ? `<div class="card cp-card"><div class="spread"><h3 style="margin:0">🎟️ 내 쿠폰</h3><span class="hint">1장 = 멤버십 30일</span></div>
        ${usable.map((c) => `<div class="set-row"><span><b>${esc(cpName(c))}</b><br><span class="hint">원할 때 사용하세요 · 사용한 날부터 30일${isMember() ? " (지금 멤버 기간 뒤에 이어져요)" : ""}</span></span><button type="button" class="primary pill" data-usecp="${c.id}">사용하기</button></div>`).join("")}
        ${pend.map((c) => `<div class="set-row"><span><b>${esc(cpName(c))}</b><br><span class="hint">운영자 확인 중 · 승인되면 사용할 수 있어요</span></span><span class="hint">승인 대기</span></div>`).join("")}</div>` : ""}
      <div class="card inv-card"><div class="spread"><h3 style="margin:0">🎁 친구 초대</h3><span class="hint">${NEED}명 초대하면 쿠폰 1장</span></div>
        <div class="inv-code"><span class="hint">내 추천 코드</span><b id="invCode">${esc(code)}</b></div>
        <div class="inv-bar" aria-label="추천 ${st.left}/${NEED}명"><i style="width:${pct}%"></i></div>
        <div class="spread hint" style="margin-top:4px"><span>다음 쿠폰까지 <b style="color:var(--text)">${st.left}/${NEED}명</b></span><span>지금까지 ${st.total}명 초대</span></div>
        <div class="inv-btns"><button type="button" class="inv-kakao" id="invKakao">카카오톡으로 초대</button><button type="button" class="pill" id="invCopy">문구 복사</button></div></div>
      ${isAdmin() ? `<div class="card"><h3>🛡️ 운영자 · 멤버십</h3>
        <div class="set-row"><span>새 멤버십 신청 <b style="color:#dc2626">${st.adminReq}건</b></span><button type="button" class="pill" id="admMsReq">보기</button></div>
        <div class="set-row"><span>쿠폰 승인 대기 <b style="color:#dc2626">${st.adminCp}건</b> <span class="hint">(추천 · 월간 1등)</span></span><button type="button" class="pill" id="admCp">보기</button></div></div>` : ""}`;
  }
  // ⚙️ 설정의 "내 요금제" 줄 → 멤버십 줄 (누르면 안내 · 신청)
  function msRowHtml() {
    if (!me()) return "";
    const ready = st.loaded;
    const line = ready && isMember() ? `<b style="color:#15803d">멤버 · ${daysLeft()}일 남음</b>`
      : ready && st.req && st.req.status === "new" ? `<b style="color:#b45309">신청 완료</b>` : `<span class="hint">지금은 무료 버전</span>`;
    return `<div class="set-row"><span>💎 ZONE 코칭 멤버십 <span class="hint">(월 ${PRICE})</span><br>${line}</span><button type="button" class="primary pill" id="msOpen">${ready && isMember() ? "혜택 보기" : "알아보기"}</button></div>`;
  }
  function bind(rerender) {
    if ($("msOpen")) $("msOpen").onclick = () => openMembership(rerender);
    if ($("invKakao")) $("invKakao").onclick = () => shareKakao(codeOf(me()));
    if ($("invCopy")) $("invCopy").onclick = () => copyText(inviteText(codeOf(me())));
    if ($("admMsReq")) $("admMsReq").onclick = () => openAdminRequests(rerender);
    if ($("admCp")) $("admCp").onclick = () => openAdminCoupons(rerender);
    document.querySelectorAll("[data-usecp]").forEach((b) => { b.onclick = async () => {
      if (!await TS.ask(isMember() ? "쿠폰을 사용할까요? 지금 멤버 기간이 끝나는 날에서 30일이 더해져요." : "쿠폰을 사용할까요? 오늘부터 30일 동안 멤버예요.", "사용하기", "나중에")) return;
      const { data, error } = await db.rpc("use_coupon", { cid: +b.dataset.usecp });
      if (error || !data) { alert("쿠폰을 사용하지 못했어요. 잠시 뒤 다시 시도해 주세요."); return; }
      toast(`✅ 멤버십 시작 · ${data}까지`);
      if (TS.notifyOwner) TS.notifyOwner("[ZONE] 쿠폰 사용 · 멤버십 시작", { 닉네임: (TS.auth.member && TS.auth.member.nickname) || "", 끝나는날: data, 안내: "모임 · 피드백 일정을 카톡으로 안내해 주세요" });
      await load(); if (rerender) rerender();
    }; });
  }

  // ---------- 복사 · 카톡 공유 ----------
  async function copyText(t) {
    let ok = false;
    try { await navigator.clipboard.writeText(t); ok = true; } catch (e) { /* 아래 방법으로 */ }
    if (!ok) { const ta = document.createElement("textarea"); ta.value = t; ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select(); try { ok = document.execCommand("copy"); } catch (e) { /* 무시 */ } ta.remove(); }
    toast(ok ? "📋 초대 문구를 복사했어요. 카톡 대화창에 붙여 넣어 보내 주세요." : "복사하지 못했어요. 추천 코드를 길게 눌러 복사해 주세요.");
  }
  let kakaoP = null;
  function loadKakao() {
    if (window.Kakao) return Promise.resolve(window.Kakao);
    if (!kakaoP) kakaoP = new Promise((res, rej) => {
      const s = document.createElement("script"); s.src = KAKAO_SDK; s.crossOrigin = "anonymous";
      s.onload = () => (window.Kakao ? res(window.Kakao) : rej(new Error("no Kakao")));
      s.onerror = () => { kakaoP = null; rej(new Error("load")); };
      document.head.appendChild(s);
    });
    return kakaoP;
  }
  async function shareKakao(code) {
    const url = inviteUrl(code);
    try {
      const K = await loadKakao();
      if (!K.isInitialized()) K.init(KAKAO_KEY);
      K.Share.sendDefault({
        objectType: "feed",
        content: {
          title: "ZONE 같이 해요! 🏊🚴🏃",
          description: `아침마다 코치가 내 훈련을 짜 줘요. 가입할 때 추천인 코드 ${code} 적어 주세요.`,
          imageUrl: new URL("app-icon-1024.png", location.href).href,
          link: { mobileWebUrl: url, webUrl: url },
        },
        buttons: [{ title: "초대 받기", link: { mobileWebUrl: url, webUrl: url } }],
      });
    } catch (e) {
      if (await TS.ask("카카오톡을 열지 못했어요. 대신 초대 문구를 복사할까요? 카톡 대화창에 붙여 넣으면 돼요.", "문구 복사", "닫기")) copyText(inviteText(code));
    }
  }

  // ---------- 멤버십 안내 · 신청 ----------
  function dlg(id) {
    let d = $(id);
    if (!d) { d = document.createElement("dialog"); d.id = id; d.className = "wide-dlg"; document.body.appendChild(d); }
    return d;
  }
  function openMembership(rerender) {
    const d = dlg("msDlg");
    const waiting = st.req && st.req.status === "new";
    d.innerHTML = `<div class="wide-hd"><b>💎 ZONE 코칭 멤버십</b><span class="hint">월 ${PRICE}</span><button type="button" class="wide-x" aria-label="닫기">✕</button></div>
      <div class="rep-body">
        <div class="ms-ben">${BENEFITS.map(([i, t, s]) => `<div><span>${i}</span><div><b>${t}</b><p class="hint">${s}</p></div></div>`).join("")}</div>
        ${isMember() ? `<div class="note">✅ 멤버 이용 중이에요 · ${daysLeft()}일 남음 (${esc(st.endsOn)}까지). 모임 · 피드백 일정은 운영자가 카톡으로 안내해요.</div>`
          : waiting ? `<div class="note">📨 신청이 접수됐어요. 운영자가 적어 주신 연락처로 <b>카카오톡 결제 안내</b>를 드려요.</div>`
          : `<form id="msForm" class="ms-form">
            <p class="hint" style="margin:0">신청하면 운영자가 <b>카카오톡으로 결제(카카오페이) 안내</b>를 드려요. 결제가 확인되면 그날부터 30일 동안 멤버예요.</p>
            <label>이름<input id="msName" maxlength="30" required placeholder="예: 박찬욱" /></label>
            <label>카톡 아이디 또는 전화번호<input id="msContact" maxlength="60" required placeholder="예: zone_runner 또는 010-1234-5678" /></label>
            <label class="check" style="font-size:13px"><input type="checkbox" id="msAgree" required /> 연락을 위해 이름 · 연락처를 운영자에게 보내는 데 동의해요</label>
            <button type="submit" class="primary" style="width:100%">멤버십 신청하기</button>
            <p class="hint" style="margin:0">아직 돈이 나가지 않아요. 결제는 운영자와 카톡으로 확인한 뒤에 해요.</p></form>`}
      </div>`;
    d.querySelector(".wide-x").onclick = () => d.close();
    const f = d.querySelector("#msForm");
    if (f) f.onsubmit = async (e) => {
      e.preventDefault();
      const name = $("msName").value.trim(), contact = $("msContact").value.trim();
      if (!name || contact.length < 3) return;
      const btn = f.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "보내는 중…";
      const { error } = await db.from("membership_requests").insert({ user_id: me(), name, contact });
      if (error) { btn.disabled = false; btn.textContent = "멤버십 신청하기"; alert("신청을 보내지 못했어요. 잠시 뒤 다시 시도해 주세요."); return; }
      if (TS.notifyOwner) TS.notifyOwner("[ZONE] 새 멤버십 신청", { 닉네임: (TS.auth.member && TS.auth.member.nickname) || "", 이름: name, 연락처: contact, 안내: "앱 → 나 → 운영자 · 멤버십에서 확인" });
      await load(); openMembership(rerender); if (rerender) rerender();
    };
    if (!d.open) d.showModal();
  }

  // ---------- 운영자: 신청서 · 1개월권 ----------
  async function names(ids) {
    const nm = {}; if (!ids.length) return nm;
    const { data } = await db.from("members").select("id,nickname").in("id", ids);
    (data || []).forEach((m) => { nm[m.id] = m.nickname; }); return nm;
  }
  const tag = (u) => (TS.tagNo ? `<span class="ntag">#${TS.tagNo(u)}</span>` : "");
  async function openAdminRequests(rerender) {
    if (!isAdmin()) return;
    const d = dlg("admMsDlg");
    const { data } = await db.from("membership_requests").select("id,user_id,name,contact,status,created_at").order("created_at", { ascending: false }).limit(100);
    const rows = data || [];
    const nm = await names([...new Set(rows.map((r) => r.user_id))]);
    d.innerHTML = `<div class="wide-hd"><b>🛡️ 멤버십 신청</b><span class="hint">운영자만 보여요</span><button type="button" class="wide-x" aria-label="닫기">✕</button></div>
      <div class="rep-body"><p class="hint" style="margin:0 0 8px">카톡으로 결제 안내 → 결제 확인 → <b>멤버 시작(30일)</b>. 이미 멤버면 끝나는 날에서 30일 더해져요.</p>
      ${rows.length ? rows.map((r) => `<div class="card rep-card${r.status === "done" ? " done" : ""}">
        <div class="spread"><b>${esc(nm[r.user_id] || "알 수 없음")}${tag(r.user_id)}</b><span class="hint">${esc(String(r.created_at).slice(0, 10))}</span></div>
        <div style="margin:6px 0">이름 <b>${esc(r.name)}</b> · 연락처 <b class="sel">${esc(r.contact)}</b></div>
        ${r.status === "new" ? `<div class="spread" style="gap:6px"><button type="button" class="primary pill" data-grant="${esc(r.user_id)}" data-req="${r.id}">결제 확인 · 멤버 시작</button><button type="button" class="pill" data-done="${r.id}">처리 완료만</button></div>` : '<span class="hint">✔ 처리 완료</span>'}
      </div>`).join("") : '<div class="note">아직 신청이 없어요.</div>'}</div>`;
    d.querySelector(".wide-x").onclick = () => d.close();
    d.querySelectorAll("[data-grant]").forEach((b) => { b.onclick = async () => {
      if (!await TS.ask("결제를 확인했나요? 이 회원에게 멤버십 30일을 줄게요.", "멤버 시작", "취소")) return;
      const { data: ends, error } = await db.rpc("admin_grant_month", { target: b.dataset.grant });
      if (error) { alert("처리하지 못했어요. 잠시 뒤 다시 시도해 주세요."); return; }
      await db.from("membership_requests").update({ status: "done" }).eq("id", +b.dataset.req);
      toast(`✅ 멤버 시작 · ${ends}까지`);
      await load(); openAdminRequests(rerender); if (rerender) rerender();
    }; });
    d.querySelectorAll("[data-done]").forEach((b) => { b.onclick = async () => {
      await db.from("membership_requests").update({ status: "done" }).eq("id", +b.dataset.done);
      await load(); openAdminRequests(rerender); if (rerender) rerender();
    }; });
    if (!d.open) d.showModal();
  }
  async function openAdminCoupons(rerender) {
    if (!isAdmin()) return;
    const d = dlg("admCpDlg");
    // 지난달 좋아요 1등 · 팔로워 1등 쿠폰을 (없으면) 만들어 둬요 — 여러 번 열어도 한 번만 생겨요
    const k = new Date(Date.now() + 9 * 3600e3); k.setUTCDate(1); k.setUTCMonth(k.getUTCMonth() - 1);
    const lastMonth = k.toISOString().slice(0, 7);
    await db.rpc("admin_make_champion_coupons", { month: lastMonth });
    const { data } = await db.from("coupons").select("id,user_id,source,period,note,status,created_at,used_at").order("created_at", { ascending: false }).limit(150);
    const rows = data || [];
    const refIds = rows.filter((r) => r.source === "referral").map((r) => r.id);
    const { data: refs } = refIds.length ? await db.from("referrals").select("referee,coupon_id,created_at").in("coupon_id", refIds) : { data: [] };
    const nm = await names([...new Set(rows.map((r) => r.user_id).concat((refs || []).map((x) => x.referee)))]);
    const ST = { pending: "승인 대기", approved: "✔ 승인 · 아직 안 씀", used: "✔ 사용함", rejected: "거절" };
    d.innerHTML = `<div class="wide-hd"><b>🛡️ 멤버십 쿠폰</b><span class="hint">운영자만 보여요</span><button type="button" class="wide-x" aria-label="닫기">✕</button></div>
      <div class="rep-body"><p class="hint" style="margin:0 0 8px">승인하면 회원 쿠폰함에 들어가고, 회원이 원할 때 [사용하기]를 누르면 30일이 시작돼요. 매달 1일이 지나면 이 화면을 열 때 <b>지난달 1등 쿠폰</b>이 자동으로 생겨요. 추천 쿠폰은 10명이 진짜 사람인지 확인해 주세요.</p>
      ${rows.length ? rows.map((r) => { const list = (refs || []).filter((x) => x.coupon_id === r.id); return `<div class="card rep-card${r.status !== "pending" ? " done" : ""}">
        <div class="spread"><b>${esc(nm[r.user_id] || "알 수 없음")}${tag(r.user_id)}</b><span class="hint">${ST[r.status] || ""}</span></div>
        <div style="margin:4px 0">${esc(cpName(r))}${r.note && r.source !== "referral" ? ` <span class="hint">· ${esc(r.note)}</span>` : ""}</div>
        ${r.source === "referral" ? `<details style="margin:6px 0"><summary class="hint">초대한 ${list.length}명 보기</summary><div class="hint" style="line-height:1.8">${list.map((x) => `${esc(nm[x.referee] || "?")}${tag(x.referee)} · ${esc(String(x.created_at).slice(0, 10))}`).join("<br>")}</div></details>` : ""}
        ${r.status === "pending" ? `<div class="spread" style="gap:6px"><button type="button" class="primary pill" data-ok="${r.id}">승인</button><button type="button" class="pill" data-no="${r.id}">거절</button></div>` : ""}
      </div>`; }).join("") : '<div class="note">아직 쿠폰이 없어요.</div>'}</div>`;
    d.querySelector(".wide-x").onclick = () => d.close();
    d.querySelectorAll("[data-ok],[data-no]").forEach((b) => { b.onclick = async () => {
      const ok = !!b.dataset.ok;
      if (!await TS.ask(ok ? "이 쿠폰을 승인할까요? 회원 쿠폰함에 들어가요." : "이 쿠폰을 거절할까요?", ok ? "승인" : "거절", "취소")) return;
      const { error } = await db.rpc("admin_decide_coupon", { cid: +(b.dataset.ok || b.dataset.no), ok });
      if (error) { alert("처리하지 못했어요. 잠시 뒤 다시 시도해 주세요."); return; }
      await load(); openAdminCoupons(rerender); if (rerender) rerender();
    }; });
    if (!d.open) d.showModal();
  }

  // ---------- 가입할 때 적은 추천인 코드 → 서버에 기록 (처음 로그인할 때 한 번) ----------
  const MSG = { bad: "추천인 코드 모양이 맞지 않아요.", notfound: "추천인 코드를 찾지 못했어요.", self: "내 코드는 추천인으로 쓸 수 없어요.", late: "추천인 코드는 가입 후 7일 안에만 넣을 수 있어요." };
  let refBusy = false;
  async function applyPendingRef() {
    const u = TS.auth && TS.auth.user; if (!u || refBusy) return;
    const code = u.user_metadata && u.user_metadata.ref;
    const k = "zone.refDone." + u.id;
    try { if (!code || localStorage.getItem(k)) return; } catch (e) { if (!code) return; }
    refBusy = true;
    let data = null, error = null;
    try { ({ data, error } = await db.rpc("set_referrer", { code })); } catch (e) { error = e; } finally { refBusy = false; }
    if (error) return; // 서버 설정 전이면 다음에 다시
    try { localStorage.setItem(k, "1"); } catch (e) { /* 무시 */ }
    if (data === "ok") toast("🎁 추천인 코드가 등록됐어요. 함께 시작해요!");
    else if (MSG[data]) toast(`🎁 ${MSG[data]}`);
  }
  window.addEventListener("ts:auth", () => { applyPendingRef(); });

  // 초대 링크(invite.html?c=코드)로 들어왔으면 가입 화면에 코드를 미리 채워 둬요
  try { const c = new URLSearchParams(location.search).get("c"); if (c && codeOk(c)) localStorage.setItem("zone.refCode", cleanCode(c)); } catch (e) { /* 무시 */ }
  const savedRef = () => { try { return localStorage.getItem("zone.refCode") || ""; } catch (e) { return ""; } };

  TS.invite = { savedRef, load, cardsHtml, msRowHtml, bind, codeOf, cleanCode, codeOk, inviteText };
})();
