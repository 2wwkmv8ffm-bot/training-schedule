// 💌 건의사항 — 사용자가 앱 주인에게 "이런 게 불편해요 · 고쳐주세요"를 보내는 칸 ('나' 탭)
// 보낸 글은 Supabase feedback 표에 저장돼요. 앱 주인(app_admins에 등록된 계정)은 받은 건의를 모두 볼 수 있어요.
(function () {
  const TS = window.TS;
  const esc = (s) => TS.escapeHtml(s == null ? "" : s);
  const CATS = [["불편해요", "😣"], ["고쳐주세요", "🛠"], ["이런 기능 있으면", "💡"], ["오류·버그", "🐞"], ["칭찬해요", "👏"]];
  const QKEY = "zone.feedbackQueue";
  let cat = CATS[0][0];
  const queue = () => { try { return JSON.parse(localStorage.getItem(QKEY) || "[]"); } catch (e) { return []; } };
  const setQueue = (q) => { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch (e) { /* 무시 */ } };
  const device = () => {
    const ua = navigator.userAgent;
    const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : "기타";
    return `${os} · ${window.innerWidth}px${window.matchMedia && window.matchMedia("(display-mode: standalone)").matches ? " · 홈 화면 앱" : ""}`;
  };
  const appVersion = () => { const s = [...document.scripts].map((x) => x.src).find((x) => /app\.js\?v=/.test(x)); return s ? s.split("v=")[1] : ""; };

  // 📧 건의가 오면 앱 주인 메일로도 보내요 (FormSubmit 무료 서비스 — 처음 한 번 'Activate' 메일 확인 필요)
  //    메일 주소를 숨기려면: Activate 후 FormSubmit이 알려 주는 임의 문자열로 아래 MAIL_TO를 바꾸면 돼요
  const MAIL_TO = "cksdnr990605@naver.com";
  function mailOwner(row) {
    if (!MAIL_TO) return;
    fetch(`https://formsubmit.co/ajax/${MAIL_TO}`, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ _subject: `[ZONE 건의] ${row.category}`, _template: "table", _captcha: "false",
        분류: row.category, 내용: row.body, 보낸사람: row.nickname || "익명", 기기: row.device || "", 앱버전: row.app_version || "" }),
    }).catch(() => {}); // 메일이 실패해도 건의는 서버(받은 건의)에 저장돼 있어요
  }
  async function send(row) {
    const { error } = await TS.db.from("feedback").insert(row);
    if (!error) mailOwner(row);
    return !error;
  }
  async function flushQueue() { // 못 보낸 건의는 다음에 '나' 탭을 열 때 다시 보내요
    const q = queue();
    if (!q.length) return;
    const left = [];
    for (const row of q) if (!(await send(row))) left.push(row);
    setQueue(left);
  }

  async function mount(box) {
    if (!box) return;
    const A = TS.auth || {};
    const me = A.user ? A.user.id : null;
    box.innerHTML = `<div class="card fb-card">
      <div class="spread"><h3 style="margin:0">💌 건의사항</h3><span class="hint">앱 만든 사람에게 바로 전달돼요</span></div>
      <p class="hint" style="margin:6px 0 10px">쓰다가 불편한 점, 고쳐 줬으면 하는 것, 있었으면 하는 기능을 편하게 적어 주세요. 하나하나 읽고 반영할게요.</p>
      <div class="chips">${CATS.map(([c, ic]) => `<button type="button" class="chip${cat === c ? " on" : ""}" data-fbcat="${esc(c)}">${ic} ${esc(c)}</button>`).join("")}</div>
      <textarea id="fbText" rows="4" maxlength="2000" placeholder="예: 계획 화면에서 달력 찾기가 어려워요 / 수영 기록도 지도로 보고 싶어요" style="width:100%;margin-top:10px"></textarea>
      <div class="spread" style="margin-top:8px"><span class="hint" id="fbMsg">${A.user ? "" : "로그인하지 않아도 보낼 수 있어요 (답장을 받으려면 로그인)"}</span>
        <button type="button" class="primary" id="fbSend">보내기</button></div>
      <div id="fbMine"></div><div id="fbAdmin"></div></div>`;
    box.querySelectorAll("[data-fbcat]").forEach((b) => { b.onclick = () => { cat = b.dataset.fbcat; box.querySelectorAll("[data-fbcat]").forEach((x) => x.classList.toggle("on", x === b)); }; });
    box.querySelector("#fbSend").onclick = async (e) => {
      const body = box.querySelector("#fbText").value.trim(), msg = box.querySelector("#fbMsg");
      if (body.length < 2) { msg.textContent = "내용을 조금만 더 적어 주세요."; return; }
      e.target.disabled = true;
      const nick = (A.member && A.member.nickname) || ((TS.getProfile && TS.getProfile()) || {}).nickname || null;
      const row = { user_id: me, nickname: nick, category: cat, body, device: device(), app_version: appVersion() };
      if (await send(row)) {
        box.querySelector("#fbText").value = "";
        msg.innerHTML = "✅ 보냈어요! 소중한 의견 고마워요.";
        loadLists(box, me);
      } else {
        setQueue(queue().concat([row]));
        msg.innerHTML = "📮 지금은 보낼 수 없어서 이 기기에 보관했어요. 다음에 '나' 탭을 열면 자동으로 보낼게요.";
        box.querySelector("#fbText").value = "";
      }
      e.target.disabled = false;
    };
    flushQueue().catch(() => {});
    loadLists(box, me);
  }

  async function loadLists(box, me) {
    const { data, error } = await TS.db.from("feedback").select("id,created_at,user_id,nickname,category,body,device,app_version,status").order("created_at", { ascending: false }).limit(100);
    if (error || !data) return;
    const mine = me ? data.filter((r) => r.user_id === me) : [];
    const others = data.filter((r) => r.user_id !== me);
    const ST = { new: ["새 글", "#ef4444"], read: ["읽음", "#64748b"], done: ["반영 완료", "#16a34a"] };
    const item = (r, admin) => `<div class="fb-item"><div class="spread"><b>${esc(r.category)}</b><span class="hint">${new Date(r.created_at).toLocaleDateString("ko-KR")} <span class="zb" style="background:${(ST[r.status] || ST.new)[1]}">${(ST[r.status] || ST.new)[0]}</span></span></div>
      <div style="white-space:pre-wrap;margin-top:4px">${esc(r.body)}</div>
      ${admin ? `<div class="hint" style="margin-top:4px">${esc(r.nickname || "익명")} · ${esc(r.device || "")} · v${esc(r.app_version || "-")}</div>
        <div style="display:flex;gap:6px;margin-top:6px">${["read", "done"].map((s) => `<button type="button" class="pill" data-fbst="${r.id}:${s}">${ST[s][0]}</button>`).join("")}</div>` : ""}</div>`;
    const mineBox = box.querySelector("#fbMine"), adminBox = box.querySelector("#fbAdmin");
    if (mineBox) mineBox.innerHTML = mine.length ? `<details class="mt"><summary>내가 보낸 건의 ${mine.length}개</summary>${mine.map((r) => item(r, false)).join("")}</details>` : "";
    // 다른 사람 글이 보이면 = 이 계정이 앱 주인(관리자)
    if (adminBox) adminBox.innerHTML = others.length ? `<details class="mt" open><summary>📬 받은 건의 ${others.length}개 <span class="zb" style="background:#ef4444">${others.filter((r) => r.status === "new").length} 새 글</span></summary>${others.map((r) => item(r, true)).join("")}</details>` : "";
    box.querySelectorAll("[data-fbst]").forEach((b) => { b.onclick = async () => { const [id, s] = b.dataset.fbst.split(":"); await TS.db.from("feedback").update({ status: s }).eq("id", id); loadLists(box, me); }; });
    // 🚩 받은 신고 (운영자만 보여요)
    const { data: reps } = await TS.db.from("post_reports").select("id,created_at,post_id,reason,status").order("created_at", { ascending: false }).limit(100);
    if (adminBox && reps && reps.length) {
      adminBox.insertAdjacentHTML("beforeend", `<details class="mt" open><summary>🚩 받은 신고 ${reps.length}개 <span class="zb" style="background:#ef4444">${reps.filter((r) => r.status === "new").length} 새 신고</span></summary>${reps.map((r) => `<div class="fb-item"><div class="spread"><b>${esc(r.reason)}</b><span class="hint">${new Date(r.created_at).toLocaleDateString("ko-KR")}</span></div>
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">${r.post_id ? `<button type="button" class="pill" data-rpdel="${r.id}:${r.post_id}" style="color:#dc2626">글 지우기</button>` : ""}<button type="button" class="pill" data-rpok="${r.id}">${r.status === "done" ? "✓ 처리됨" : "문제없음 · 처리"}</button></div></div>`).join("")}</details>`);
      box.querySelectorAll("[data-rpok]").forEach((b) => { b.onclick = async () => { await TS.db.from("post_reports").update({ status: "done" }).eq("id", b.dataset.rpok); loadLists(box, me); }; });
      box.querySelectorAll("[data-rpdel]").forEach((b) => { b.onclick = async () => { const [rid, pid] = b.dataset.rpdel.split(":"); if (!await TS.ask("신고된 글을 지울까요?", "삭제")) return; await TS.db.from("posts").delete().eq("id", pid); await TS.db.from("post_reports").update({ status: "done" }).eq("id", rid); loadLists(box, me); }; });
    }
  }

  TS.feedback = { mount };
})();
