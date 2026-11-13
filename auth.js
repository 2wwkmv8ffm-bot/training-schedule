// 로그인 · 회원가입 (Supabase Auth, 이메일 + 비밀번호)
// 로그인하면: 내 활동이 계정에 저장되고, 커뮤니티에서 친구·좋아요·댓글을 쓸 수 있어요.
(function () {
  const TS = window.TS;
  const { db } = TS;
  const esc = (s) => TS.escapeHtml(s == null ? "" : s);
  const $ = (id) => document.getElementById(id);
  const A = { user: null, member: null, ready: false };
  TS.auth = A;

  async function loadMember() {
    if (!A.user) { A.member = null; return; }
    const { data, error } = await db.from("members").select("*").eq("id", A.user.id).maybeSingle();
    if (error) { A.member = null; A.memberError = error; return; } // schema_community.sql 실행 전
    A.memberError = null;
    if (data) { A.member = data; return; }
    const p = TS.getProfile ? TS.getProfile() : null;
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
  function render(why = "") {
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
      </form>
      <p class="hint">로그인하면 내 활동이 계정에 저장되고, 커뮤니티에서 친구 기록을 보고 좋아요·댓글을 남길 수 있어요. 기록의 공개 범위(전체·친구만·나만)는 직접 정해요.</p>`;
    $("auClose").onclick = close;
    $("authBody").querySelectorAll("[data-mode]").forEach((b) => { b.onclick = () => { mode = b.dataset.mode; render(why); }; });
    $("auForm").onsubmit = submit;
  }
  async function submit(e) {
    e.preventDefault();
    const f = e.target, msg = $("auMsg");
    const btn = f.querySelector("button[type=submit]");
    btn.disabled = true; msg.textContent = "";
    try {
      if (mode === "signup") {
        const { data, error } = await db.auth.signUp({ email: f.email.value.trim(), password: f.pw.value, options: { data: { nickname: f.nick.value.trim() } } });
        if (error) throw error;
        if (!data.session) {
          msg.style.color = "var(--text)";
          msg.innerHTML = "가입 확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.<br><span class='hint'>메일이 안 보이면 스팸함도 확인해 주세요. 몇 분 뒤에 도착할 수도 있어요.</span>";
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
      msg.textContent = /Invalid login/i.test(m) ? "이메일 또는 비밀번호가 맞지 않아요."
        : /not confirmed/i.test(m) ? "가입 확인 메일의 링크를 먼저 눌러 주세요."
        : /already registered/i.test(m) ? "이미 가입된 이메일이에요. 로그인해 주세요."
        : /Password should/i.test(m) ? "비밀번호는 6자 이상이어야 해요."
        : "오류: " + m;
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

  db.auth.onAuthStateChange((_e, s) => { setTimeout(() => setUser(s ? s.user : null), 0); });
  db.auth.getSession().then(({ data }) => setUser(data.session ? data.session.user : null));
})();
