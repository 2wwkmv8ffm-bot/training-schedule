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
  async function setUser(u) {
    const changed = (A.user && A.user.id) !== (u && u.id);
    A.user = u || null;
    await loadMember();
    A.ready = true;
    if (changed) await TS.setUser(A.user);
    window.dispatchEvent(new Event("ts:auth"));
  }

  // ---------- 화면 ----------
  let mode = "login";
  function open(m = "login", why = "") {
    mode = m;
    render(why);
    $("authOv").classList.add("show");
    document.body.style.overflow = "hidden";
  }
  function close() { $("authOv").classList.remove("show"); document.body.style.overflow = ""; }
  const backUrl = () => location.origin + location.pathname; // 메일 링크를 누르면 이 앱으로 돌아와요
  function render(why = "") {
    if (mode === "reset" || mode === "find" || mode === "newpw") { renderHelp(why); return; }
    $("authBody").innerHTML = `
      <div class="wz-top"><h2 style="margin:0;flex:1">${mode === "login" ? "로그인" : "회원가입"}</h2>
        <button type="button" class="pill" data-home="1">🏠 홈</button><button type="button" id="auClose">닫기</button></div>
      ${why ? `<div class="note" style="margin:0 0 12px">${esc(why)}</div>` : ""}
      <div class="seg"><button type="button" data-mode="login" class="${mode === "login" ? "on" : ""}">로그인</button>
        <button type="button" data-mode="signup" class="${mode === "signup" ? "on" : ""}">회원가입</button></div>
      <form id="auForm" class="card" style="display:grid;gap:12px">
        ${mode === "signup" ? `<label>닉네임 (커뮤니티에 보여요)<input name="nick" maxlength="20" required placeholder="예: 찬욱" /></label>` : ""}
        <label>이메일<input name="email" type="email" autocomplete="email" required /></label>
        <label>비밀번호 ${mode === "signup" ? "(6자 이상)" : ""}<input name="pw" type="password" minlength="6" autocomplete="${mode === "signup" ? "new-password" : "current-password"}" required /></label>
        ${mode === "signup" ? `<label class="check" style="font-size:13px;line-height:1.5"><input type="checkbox" name="agree" required /> 만 14세 이상이며, <a href="terms.html" target="_blank" rel="noopener">이용약관</a>과 <a href="privacy.html" target="_blank" rel="noopener">개인정보처리방침</a>에 동의해요 (필수)</label>` : ""}
        <button type="submit" class="primary" style="padding:13px">${mode === "login" ? "로그인" : "가입하기"}</button>
        <p class="warn" id="auMsg" style="margin:0"></p>
        ${mode === "login" ? `<div style="text-align:center;font-size:13px"><button type="button" class="link" data-mode="reset">비밀번호 찾기</button> · <button type="button" class="link" data-mode="find">이메일 찾기</button></div>` : ""}
      </form>
      <p class="hint">로그인하면 내 활동이 계정에 저장되고, 커뮤니티에서 친구 기록을 보고 좋아요·댓글을 남길 수 있어요. 기록의 공개 범위(전체·친구만·나만)는 직접 정해요.</p>`;
    $("auClose").onclick = close;
    $("authBody").querySelectorAll("[data-mode]").forEach((b) => { b.onclick = () => { mode = b.dataset.mode; render(why); }; });
    $("auForm").onsubmit = submit;
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
      <div class="wz-top"><h2 style="margin:0;flex:1">${title}</h2><button type="button" id="auClose">닫기</button></div>
      ${why ? `<div class="note" style="margin:0 0 12px">${esc(why)}</div>` : ""}
      <form id="auForm" class="card" style="display:grid;gap:12px">${body}<p class="warn" id="auMsg" style="margin:0"></p>
        ${mode !== "newpw" ? `<div style="text-align:center;font-size:13px"><button type="button" class="link" data-mode="login">‹ 로그인으로</button></div>` : ""}</form>`;
    $("auClose").onclick = close;
    $("authBody").querySelectorAll("[data-mode]").forEach((b) => { b.onclick = () => { mode = b.dataset.mode; render(); }; });
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
    if (!A.user || !nick) return;
    const { data, error } = await db.from("members").update({ nickname: nick.slice(0, 20) }).eq("id", A.user.id).select().single();
    if (!error) { A.member = data; window.dispatchEvent(new Event("ts:auth")); }
  }
  Object.assign(A, { open, close, signOut, updateNickname, reloadMember: async () => { await loadMember(); window.dispatchEvent(new Event("ts:auth")); } });

  db.auth.onAuthStateChange((ev, s) => {
    setTimeout(() => setUser(s ? s.user : null), 0);
    if (ev === "PASSWORD_RECOVERY") setTimeout(() => open("newpw"), 300); // 비밀번호 찾기 메일 링크로 들어왔어요
  });
  db.auth.getSession().then(({ data }) => setUser(data.session ? data.session.user : null));
  // 메일 링크가 만료됐거나 잘못된 경우 (주소 뒤에 error=… 가 붙어 와요)
  const linkErr = /error_description=([^&]+)/.exec(location.hash + "&" + location.search);
  if (linkErr) {
    const recovery = /type=recovery|otp_expired/i.test(location.hash + location.search);
    history.replaceState(null, "", location.pathname);
    setTimeout(() => { mode = recovery ? "reset" : "login"; open(mode, "메일 링크가 만료됐거나 이미 사용됐어요. " + (recovery ? "아래에서 링크를 다시 받아 주세요." : "다시 로그인해 주세요.")); }, 500);
  }
})();
