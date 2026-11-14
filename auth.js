// 로그인 · 회원가입 (Supabase Auth, 이메일 + 비밀번호)
// 로그인하면: 내 활동이 계정에 저장되고, 커뮤니티에서 친구·좋아요·댓글을 쓸 수 있어요.
(function () {
  const TS = window.TS;
  const { db } = TS;
  const esc = (s) => TS.escapeHtml(s == null ? "" : s);
  const $ = (id) => document.getElementById(id);
  const A = { user: null, member: null, ready: false };
  TS.auth = A;

  // 로그인·가입 오류를 한국어로 (서버는 영어로 알려 줘요)
  function korAuthErr(m) {
    const wait = (m.match(/after (\d+) seconds?/i) || [])[1];
    if (wait) return `보안을 위해 잠시 기다려야 해요. ${wait}초 뒤에 다시 눌러 주세요.`;
    const R = [
      [/Invalid login/i, "이메일 또는 비밀번호가 맞지 않아요."],
      [/not confirmed/i, "가입 확인 메일의 링크를 먼저 눌러 주세요. (메일이 안 보이면 스팸함도 확인해 주세요)"],
      [/already (registered|been registered)|User already/i, "이미 가입된 이메일이에요. 로그인해 주세요."],
      [/Password should|password.*(at least|characters)/i, "비밀번호는 6자 이상이어야 해요."],
      [/weak password|pwned|leaked/i, "너무 쉬운 비밀번호예요. 다른 비밀번호를 써 주세요."],
      [/rate limit|too many/i, "요청이 너무 많아요. 잠시(1분~1시간) 뒤에 다시 시도해 주세요."],
      [/invalid.*email|email.*invalid|Unable to validate email/i, "이메일 주소를 다시 확인해 주세요."],
      [/Signups not allowed|signup.*disabled/i, "지금은 회원가입을 받을 수 없어요."],
      [/Email not allowed|not authorized/i, "이 이메일로는 가입할 수 없어요."],
      [/Failed to fetch|NetworkError|network/i, "인터넷 연결을 확인하고 다시 시도해 주세요."],
      [/User not found/i, "가입되지 않은 이메일이에요. 회원가입을 해 주세요."],
      [/same.*password|different from the old/i, "예전과 다른 비밀번호를 써 주세요."],
      [/expired|invalid.*(token|link)/i, "링크가 만료됐어요. 다시 요청해 주세요."],
    ];
    const hit = R.find(([re]) => re.test(m));
    return hit ? hit[1] : "문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.";
  }
  TS.korAuthErr = korAuthErr;

  async function loadMember() {
    if (!A.user) { A.member = null; return; }
    const { data, error } = await db.from("members").select("*").eq("id", A.user.id).maybeSingle();
    if (error) { A.member = null; A.memberError = error; return; } // schema_community.sql 실행 전
    A.memberError = null;
    if (data) { A.member = data; return; }
    const own = (() => { try { return localStorage.getItem("training.profileOwner") || ""; } catch (e) { return ""; } })();
    const p = TS.getProfile && (!own || own === A.user.id) ? TS.getProfile() : null; // 다른 계정의 프로필 이름은 쓰지 않아요
    const nick = (A.user.user_metadata && A.user.user_metadata.nickname) || (p && p.nickname) || A.user.email.split("@")[0];
    const { data: made } = await db.from("members").insert({ id: A.user.id, nickname: nick.slice(0, 20), sport: p && p.sport }).select().single();
    A.member = made || null;
  }
  // 💎 요금제 (유료 서비스 준비) — PAID_ON 을 true 로 바꾸면 프로 기능에 잠금이 걸려요. 지금은 false = 모두 무료
  const PAID_ON = false;
  const PRO_FEATURES = { // 나중에 유료로 돌릴 수 있는 기능 (이름: 화면에 보일 설명)
    yearPlan: "연간 계획 · 3개월 계획",
    coachHarder: "코치 맞춤 강도 조절",
    racePredict: "대회 기록 예측",
    planVariants: "계획 B안(다른 훈련 방식)",
  };
  const plan = { tier: "free", until: null };
  async function loadPlan() {
    plan.tier = "free"; plan.until = null;
    if (!A.user) return;
    const { data, error } = await db.from("subscriptions").select("plan,until").eq("user_id", A.user.id).maybeSingle();
    if (error || !data) return; // 표가 없거나 기록이 없으면 무료
    if (data.plan === "pro" && (!data.until || new Date(data.until) > new Date())) { plan.tier = "pro"; plan.until = data.until; }
  }
  TS.plan = {
    get tier() { return plan.tier; }, get until() { return plan.until; },
    paidOn: PAID_ON, features: PRO_FEATURES,
    isPro: () => plan.tier === "pro" || (A.member && TS.isOwner && TS.isOwner(A.user && A.user.id)),
    // 프로 기능을 쓰기 전에 부르면 돼요: 쓸 수 있으면 true, 아니면 안내창을 띄우고 false
    can(feature) {
      if (!PAID_ON || !PRO_FEATURES[feature] || this.isPro()) return true;
      TS.ask(`💎 '${PRO_FEATURES[feature]}'는 ZONE 프로 기능이에요.\n\n프로 요금제는 곧 열릴 예정이에요.`, "확인", "닫기");
      return false;
    },
    reload: loadPlan,
  };
  // 🔐 로그인 상태 유지: 켜 두면 다음에 앱을 열 때 바로 들어와요. 끄면 앱(브라우저)을 닫을 때 로그아웃돼요
  const KEEP_KEY = "training.keepLogin", OPEN_KEY = "zone.openNow";
  const keepOn = () => { try { return localStorage.getItem(KEEP_KEY) !== "0"; } catch (e) { return true; } };
  function rememberChoice(f) {
    try {
      localStorage.setItem(KEEP_KEY, f.keep && !f.keep.checked ? "0" : "1");
      sessionStorage.setItem(OPEN_KEY, "1");
    } catch (e) { /* 무시 */ }
  }
  // 다른 계정으로 로그인하면 이 기기에 남은 이전 사람의 기록(프로필·대회·일지·활동·사진)을 지우고 처음부터 시작해요
  const LAST_KEY = "training.lastUser";
  const PERSONAL = ["training.profile", "training.profileOwner", "training.activities", "training.journal", "training.savedPosts", "training.avatar", "training.stravaState", "training.stravaAuto"];
  function wipeIfOtherAccount(uid) {
    try {
      const last = localStorage.getItem(LAST_KEY) || localStorage.getItem("training.profileOwner") || "";
      const other = last && last !== uid;
      if (other) PERSONAL.forEach((k) => localStorage.removeItem(k));
      localStorage.setItem(LAST_KEY, uid);
      if (other) { location.reload(); return true; } // 메모리에 남은 이전 사람 기록까지 비우려고 새로 열어요
    } catch (e) { /* 무시 */ }
  }
  async function setUser(u) {
    const changed = (A.user && A.user.id) !== (u && u.id);
    A.user = u || null;
    if (changed && u && wipeIfOtherAccount(u.id)) return;
    await loadMember();
    await loadPlan().catch(() => {});
    A.ready = true;
    if (changed) await TS.setUser(A.user);
    window.dispatchEvent(new Event("ts:auth"));
    if (A.user && $("authOv").classList.contains("show") && !/newpw/.test(mode)) close(); // 로그인되면 로그인 화면 닫기
  }

  // ---------- 화면 ----------
  let mode = "login";
  function open(m = "login", why = "") {
    mode = m;
    render(why);
    $("authOv").classList.add("show");
    document.body.style.overflow = "hidden";
  }
  // 🔒 ZONE은 로그인해야 쓸 수 있어요 — 로그인 전에는 로그인 화면을 닫을 수 없어요
  function close() { if (!A.user) return; $("authOv").classList.remove("show"); document.body.style.overflow = ""; }
  new MutationObserver(() => { // 다른 곳(홈 버튼·뒤로 가기)에서 로그인 화면을 닫아도 로그인 전이면 다시 열어요
    const ov = $("authOv");
    if (A.ready && !A.user && ov && !ov.classList.contains("show")) { if (!$("authBody").innerHTML.trim()) render(); ov.classList.add("show"); document.body.style.overflow = "hidden"; }
  }).observe(document.getElementById("authOv"), { attributes: true, attributeFilter: ["class"] });
  // 👁 비밀번호 보기: 눈 버튼을 누르면 내가 쓴 비밀번호가 보여요
  function addEyes() {
    $("authBody").querySelectorAll('input[type="password"]').forEach((inp) => {
      if (inp.dataset.eye) return;
      inp.dataset.eye = "1";
      const wrap = document.createElement("span"); wrap.className = "pw-wrap";
      inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(inp);
      const b = document.createElement("button"); b.type = "button"; b.className = "pw-eye"; b.setAttribute("aria-label", "비밀번호 보기"); b.textContent = "👁";
      b.onclick = () => { const show = inp.type === "password"; inp.type = show ? "text" : "password"; b.textContent = show ? "🙈" : "👁"; b.setAttribute("aria-label", show ? "비밀번호 숨기기" : "비밀번호 보기"); inp.focus(); };
      wrap.appendChild(b);
    });
  }
  const backUrl = () => location.origin + location.pathname; // 메일 링크를 누르면 이 앱으로 돌아와요
  function render(why = "") {
    if (mode === "reset" || mode === "find" || mode === "newpw") { renderHelp(why); return; }
    $("authBody").innerHTML = `
      ${!A.user ? `<div style="text-align:center;margin:8px 0 14px"><img src="icon-192.png?v=3" width="64" height="64" alt="ZONE" style="border-radius:16px;box-shadow:0 2px 8px rgba(0,0,0,.12)" />
        <div style="font-size:15px;font-weight:700;margin-top:8px">내 기록에 맞춘 수영·자전거·러닝·철인3종 훈련</div>
        <div class="hint" style="margin-top:4px">⏱️ 가입하는 데 5분도 안 걸려요</div>
        <button type="button" class="link" style="font-size:13px" onclick="window.ZONE_INSTALL && window.ZONE_INSTALL()">📲 휴대폰에 앱으로 설치하는 법</button></div>` : ""}
      <div class="wz-top"><h2 style="margin:0;flex:1">${mode === "login" ? "로그인" : "회원가입"}</h2>
        ${A.user ? '<button type="button" class="pill" data-home="1">🏠 홈</button><button type="button" id="auClose">닫기</button>' : ""}</div>
      ${why ? `<div class="note" style="margin:0 0 12px">${esc(why)}</div>` : ""}
      <div class="seg"><button type="button" data-mode="login" class="${mode === "login" ? "on" : ""}">로그인</button>
        <button type="button" data-mode="signup" class="${mode === "signup" ? "on" : ""}">회원가입</button></div>
      <form id="auForm" class="card" style="display:grid;gap:12px">
        ${mode === "signup" ? `<label>닉네임 (커뮤니티에 보여요)<input name="nick" maxlength="20" required placeholder="예: 찬욱" /></label>` : ""}
        <label>이메일<input name="email" type="email" autocomplete="email" required /></label>
        <label>비밀번호 ${mode === "signup" ? "(6자 이상)" : ""}<input name="pw" type="password" minlength="6" autocomplete="${mode === "signup" ? "new-password" : "current-password"}" required /></label>
        <label class="check" style="font-size:14px"><input type="checkbox" name="keep" ${keepOn() ? "checked" : ""} /> 로그인 상태 유지 <span class="hint">(다음에 앱을 켜면 바로 들어와요)</span></label>
        ${mode === "signup" ? `<label class="check" style="font-size:13px;line-height:1.5"><input type="checkbox" name="agree" required /> 만 14세 이상이며, <a href="terms.html" target="_blank" rel="noopener">이용약관</a>과 <a href="privacy.html" target="_blank" rel="noopener">개인정보처리방침</a>에 동의해요 (필수)</label>` : ""}
        <button type="submit" class="primary" style="padding:13px">${mode === "login" ? "로그인" : "가입하기"}</button>
        <p class="warn" id="auMsg" style="margin:0"></p>
        ${mode === "login" ? `<div style="text-align:center;font-size:13px"><button type="button" class="link" data-mode="reset">비밀번호 찾기</button> · <button type="button" class="link" data-mode="find">이메일 찾기</button></div>` : ""}
      </form>
      <p class="hint">로그인하면 내 활동이 계정에 저장되고, 커뮤니티에서 친구 기록을 보고 좋아요·댓글을 남길 수 있어요. 기록의 공개 범위(전체·친구만·나만)는 직접 정해요.</p>`;
    if ($("auClose")) $("auClose").onclick = close;
    $("authBody").querySelectorAll("[data-mode]").forEach((b) => { b.onclick = () => { mode = b.dataset.mode; render(why); }; });
    $("auForm").onsubmit = submit;
    addEyes();
  }
  function toastMsg(t) { const m = $("auMsg"); if (m) { m.style.color = "var(--text)"; m.textContent = t; } }
  // 🔑 비밀번호 찾기 · 이메일 찾기 · 새 비밀번호 정하기
  function renderHelp(why = "") {
    const title = { reset: "비밀번호 찾기", find: "이메일 찾기", newpw: "새 비밀번호 정하기" }[mode];
    const body = mode === "reset"
      ? `<p class="hint" style="margin:0">가입한 이메일을 넣으면 비밀번호를 새로 정하는 링크를 보내 드려요.</p>
         <label>이메일<input name="email" type="email" autocomplete="email" required /></label>
         <button type="submit" class="primary" style="padding:13px">링크 보내기</button>`
      : mode === "find"
      ? `<p class="hint" style="margin:0">닉네임(또는 닉네임#번호)을 넣으면 가입한 이메일을 일부 가려서 보여 드려요.</p>
         <label>닉네임<input name="nick" maxlength="26" required placeholder="예: 박찬욱#1234" /></label>
         <button type="submit" class="primary" style="padding:13px">찾기</button>`
      : `<p class="hint" style="margin:0">새로 쓸 비밀번호를 두 번 넣어 주세요.</p>
         <label>새 비밀번호 (6자 이상)<input name="pw" type="password" minlength="6" autocomplete="new-password" required /></label>
         <label>한 번 더<input name="pw2" type="password" minlength="6" autocomplete="new-password" required /></label>
         <button type="submit" class="primary" style="padding:13px">바꾸기</button>`;
    $("authBody").innerHTML = `
      <div class="wz-top"><h2 style="margin:0;flex:1">${title}</h2>${A.user ? '<button type="button" id="auClose">닫기</button>' : ""}</div>
      ${why ? `<div class="note" style="margin:0 0 12px">${esc(why)}</div>` : ""}
      <form id="auForm" class="card" style="display:grid;gap:12px">${body}<p class="warn" id="auMsg" style="margin:0"></p>
        ${mode !== "newpw" ? `<div style="text-align:center;font-size:13px"><button type="button" class="link" data-mode="login">‹ 로그인으로</button></div>` : ""}</form>`;
    if ($("auClose")) $("auClose").onclick = close;
    $("authBody").querySelectorAll("[data-mode]").forEach((b) => { b.onclick = () => { mode = b.dataset.mode; render(); }; });
    addEyes();
    $("auForm").onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target, msg = $("auMsg"), btn = f.querySelector("button[type=submit]");
      btn.disabled = true; msg.style.color = ""; msg.textContent = "";
      try {
        if (mode === "reset") {
          const { error } = await db.auth.resetPasswordForEmail(f.email.value.trim(), { redirectTo: backUrl() });
          if (error) throw error;
          toastMsg("메일을 보냈어요. 메일의 링크를 누르면 새 비밀번호를 정할 수 있어요. (스팸함도 확인해 주세요)");
        } else if (mode === "find") {
          const [nick, no] = f.nick.value.trim().split("#").map((s) => (s || "").trim());
          const { data, error } = await db.rpc("find_email", { p_nick: nick, p_tag: no ? no.replace(/\D/g, "") : null });
          if (error) throw new Error(/function|schema cache/i.test(error.message) ? "준비 중이에요 (서버 설정 필요)" : error.message);
          msg.style.color = "var(--text)";
          msg.innerHTML = data && data.length ? `가입한 이메일이에요:<br>${data.map((r) => `<b>${esc(r.email)}</b> <span class="hint">(${esc(nick)}#${esc(r.tag)})</span>`).join("<br>")}`
            : "그 닉네임으로 가입한 계정이 없어요.";
        } else {
          if (f.pw.value !== f.pw2.value) throw new Error("두 비밀번호가 달라요. 다시 확인해 주세요.");
          const { error } = await db.auth.updateUser({ password: f.pw.value });
          if (error) throw error;
          toastMsg("비밀번호를 바꿨어요. 이제 새 비밀번호로 로그인하면 돼요.");
          setTimeout(close, 1500);
        }
      } catch (err) {
        const m = err.message || String(err);
        msg.style.color = ""; msg.textContent = /[가-힣]/.test(m) ? m : korAuthErr(m);
      }
      btn.disabled = false;
    };
  }
  async function submit(e) {
    e.preventDefault();
    const f = e.target, msg = $("auMsg");
    const btn = f.querySelector("button[type=submit]");
    btn.disabled = true; msg.textContent = "";
    try {
      if (mode === "signup") {
        const email = f.email.value.trim();
        const { data, error } = await db.auth.signUp({ email, password: f.pw.value, options: { emailRedirectTo: backUrl(), data: { nickname: f.nick.value.trim() } } });
        if (error) throw error;
        if (!data.session) {
          msg.style.color = "var(--text)";
          msg.innerHTML = `가입 확인 메일을 보냈어요. 메일의 링크를 누르면 바로 로그인돼요.<br><span class='hint'>메일이 안 보이면 스팸함도 확인해 주세요.</span>
            <br><button type="button" class="link" id="auResend">📧 확인 메일 다시 보내기</button>`;
          $("auResend").onclick = async () => {
            const { error: e2 } = await db.auth.resend({ type: "signup", email, options: { emailRedirectTo: backUrl() } });
            toastMsg(e2 ? korAuthErr(e2.message) : "확인 메일을 다시 보냈어요.");
          };
          btn.disabled = false;
          return;
        }
      } else {
        const { error } = await db.auth.signInWithPassword({ email: f.email.value.trim(), password: f.pw.value });
        if (error) throw error;
      }
      rememberChoice(f);
      close();
    } catch (err) {
      const m = err.message || String(err);
      msg.style.color = "";
      msg.textContent = korAuthErr(m);
    }
    btn.disabled = false;
  }
  async function signOut() {
    if (!await TS.ask("로그아웃할까요?")) return;
    await db.auth.signOut();
  }
  async function updateNickname(nick) {
    if (!A.user || !nick) return "로그인이 필요해요.";
    const { data, error } = await db.from("members").update({ nickname: nick.slice(0, 20) }).eq("id", A.user.id).select().single();
    if (error) return "닉네임을 바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요.";
    A.member = data; window.dispatchEvent(new Event("ts:auth"));
    return null;
  }
  Object.assign(A, { open, close, signOut, updateNickname, reloadMember: async () => { await loadMember(); window.dispatchEvent(new Event("ts:auth")); } });

  db.auth.onAuthStateChange((ev, s) => {
    if (ev === "INITIAL_SESSION") return; // 처음 열 때는 아래 getSession에서 (탈퇴·유지 설정을 확인한 뒤) 처리해요
    setTimeout(() => setUser(s ? s.user : null), 0);
    if (ev === "PASSWORD_RECOVERY") setTimeout(() => open("newpw"), 300); // 비밀번호 찾기 메일 링크로 들어왔어요
  });
  db.auth.getSession().then(async ({ data }) => {
    let s = data.session;
    let fresh = false; // 이번에 앱을 새로 열었는지 (새로고침이 아니라)
    try { fresh = !sessionStorage.getItem(OPEN_KEY); sessionStorage.setItem(OPEN_KEY, "1"); } catch (e) { /* 무시 */ }
    if (s && fresh && !keepOn()) { await db.auth.signOut({ scope: "local" }); s = null; } // 유지 안 함 → 다시 로그인
    if (s) { // 탈퇴했거나 지워진 계정이면 남아 있는 로그인 정보를 지우고 로그인 화면으로
      const { data: gu, error: ge } = await db.auth.getUser();
      if ((ge && /not.*found|does not exist|invalid|jwt|403|401/i.test((ge.message || "") + (ge.status || ""))) || (!ge && !(gu && gu.user))) { await db.auth.signOut({ scope: "local" }); s = null; }
    }
    await setUser(s ? s.user : null);
    // 로그인 안 했으면 앱을 열자마자 로그인 · 회원가입 화면
    if (!s && !/error_description=|type=recovery/.test(location.hash + location.search)) open("login");
  });
  // 메일 링크가 만료됐거나 잘못된 경우 (주소 뒤에 error=… 가 붙어 와요)
  const linkErr = /error_description=([^&]+)/.exec(location.hash + "&" + location.search);
  if (linkErr) {
    const recovery = /type=recovery|otp_expired/i.test(location.hash + location.search);
    history.replaceState(null, "", location.pathname);
    setTimeout(() => { mode = recovery ? "reset" : "login"; open(mode, "메일 링크가 만료됐거나 이미 사용됐어요. " + (recovery ? "아래에서 링크를 다시 받아 주세요." : "다시 로그인해 주세요.")); }, 500);
  }
})();
