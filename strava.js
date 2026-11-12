// 스트라바 연동: 가민 시계 → 가민 커넥트 → 스트라바(자동 동기화) → ZONE
// 스트라바 공식 API(OAuth)만 써요. 비밀키는 Supabase 서버 함수(strava)에만 있어요.
// 스트라바 약관에 따라: 가져온 기록은 본인만 보기(🔒), 커뮤니티 공유 안 함, 'Powered by Strava' 표시.
(function () {
  const TS = window.TS;
  const { db, fmtDur } = TS;
  const esc = (s) => TS.escapeHtml(s == null ? "" : s);
  const $ = (id) => document.getElementById(id);
  const STATE_KEY = "training.stravaState";
  const AUTO_KEY = "training.stravaAuto";
  const S = { connected: null, athlete: null, error: null, checking: false };
  const autoOn = () => { try { return localStorage.getItem(AUTO_KEY) !== "off"; } catch (e) { return true; } };

  let fnMissing = null; // 서버 함수가 없으면 한 번만 시도하고 더는 부르지 않아요
  async function call(action, body = {}) {
    if (fnMissing) throw new Error(fnMissing);
    const { data, error } = await db.functions.invoke("strava", { body: { action, ...body } });
    if (error) {
      let msg = error.message || "서버 함수 호출 실패";
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) { /* 무시 */ }
      if (/Failed to send|not found|404/i.test(msg)) { msg = "스트라바 서버 함수(strava)가 아직 없어요. 안내대로 Supabase에 배포해 주세요."; fnMissing = msg; }
      throw new Error(msg);
    }
    if (data && data.error) throw new Error(data.error);
    return data;
  }
  async function refreshStatus() {
    if (!(TS.auth && TS.auth.user)) { S.connected = false; S.error = null; emit(); return; }
    S.checking = true; emit();
    try { const r = await call("status"); S.connected = r.connected; S.athlete = r.athlete; S.error = null; }
    catch (e) { S.connected = false; S.error = e.message; }
    S.checking = false; emit();
  }
  const emit = () => window.dispatchEvent(new Event("ts:strava"));

  // ---------- 연결 (스트라바 로그인 화면으로 이동 → 돌아오기) ----------
  async function connect() {
    if (!(TS.auth && TS.auth.user)) { TS.auth.open("login", "스트라바 연동은 로그인한 뒤에 할 수 있어요."); return; }
    try {
      const { clientId } = await call("config");
      const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
      try { sessionStorage.setItem(STATE_KEY, state); } catch (e) { /* 무시 */ }
      const redirect = location.origin + location.pathname;
      location.href = "https://www.strava.com/oauth/authorize?" + new URLSearchParams({
        client_id: clientId, response_type: "code", redirect_uri: redirect, approval_prompt: "auto", scope: "read,activity:read_all", state,
      });
    } catch (e) { alert(e.message); }
  }
  async function handleCallback() {
    const q = new URLSearchParams(location.search);
    if (!q.has("state") || (!q.has("code") && !q.has("error"))) return;
    const code = q.get("code"), scope = q.get("scope") || "", state = q.get("state"), err = q.get("error");
    ["code", "scope", "state", "error"].forEach((k) => q.delete(k));
    history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : ""));
    let saved = null;
    try { saved = sessionStorage.getItem(STATE_KEY); sessionStorage.removeItem(STATE_KEY); } catch (e) { /* 무시 */ }
    if (err) { toast("스트라바 연결을 취소했어요."); return; }
    if (!saved || saved !== state) { toast("⚠️ 스트라바 연결 확인에 실패했어요. 다시 시도해 주세요."); return; }
    try {
      const r = await call("exchange", { code, scope });
      S.connected = true; S.athlete = r.athlete; emit();
      toast(`✅ 스트라바 연결 완료${r.athlete ? ` (${r.athlete})` : ""}`);
      if (TS.showTab) TS.showTab("activity");
      openImport();
    } catch (e) { toast("⚠️ " + e.message); }
  }
  async function disconnect() {
    const n = (await TS.listActivities()).filter((a) => a.source === "strava").length;
    if (!await TS.ask(`스트라바 연결을 끊을까요?${n ? `\n스트라바 약관에 따라 가져온 기록 ${n}개도 함께 지워요.` : ""}`)) return;
    try {
      await call("disconnect");
      if (n) for (const a of (await TS.listActivities()).filter((x) => x.source === "strava")) await TS.deleteActivity(a);
      S.connected = false; S.athlete = null; emit();
      toast("스트라바 연결을 끊었어요.");
    } catch (e) { alert(e.message); }
  }

  // ---------- 가져오기 ----------
  const SPORT = (t) => (/Swim/i.test(t) ? "swim" : /Ride|Cycl|Bike|Velo/i.test(t) ? "bike" : /Walk|Hike/i.test(t) ? "walk" : /Run/i.test(t) ? "run" : "run");
  function build(item, streams) {
    const start = Date.parse(item.start_date) / 1000;
    const g = (k) => (streams && streams[k] && streams[k].data) || [];
    const t = g("time"), ll = g("latlng"), hr = g("heartrate"), ds = g("distance");
    const pts = t.map((tt, i) => ({ t: start + tt, lat: ll[i] ? ll[i][0] : null, lng: ll[i] ? ll[i][1] : null, hr: hr[i] || null, dist: ds[i] != null ? ds[i] : null }));
    const a = TS.garmin.toActivity({
      sport: SPORT(item.sport_type), start, duration: item.moving_time, dist: item.distance,
      avgHr: item.average_heartrate ? Math.round(item.average_heartrate) : null, maxHr: item.max_heartrate ? Math.round(item.max_heartrate) : null, pts,
    }, item.name);
    return Object.assign(a, {
      title: item.name || a.title, notes: "Strava에서 가져온 기록", source: "strava", external_id: `strava:${item.id}`,
      visibility: "private", device: item.device_name || null,
    });
  }
  let page = 1, items = [], have = new Set();
  async function openImport() {
    if (!(TS.auth && TS.auth.user)) { TS.auth.open("login", "스트라바 연동은 로그인한 뒤에 할 수 있어요."); return; }
    $("stravaDlg").showModal();
    $("stravaBody").innerHTML = `<h2 style="margin:0">스트라바에서 가져오기</h2><p class="hint">불러오는 중…</p>`;
    page = 1; items = [];
    have = new Set((await TS.listActivities()).map((a) => a.external_id).filter(Boolean));
    await loadMore();
  }
  async function loadMore() {
    try {
      const r = await call("list", { page, per_page: 30 });
      items = items.concat(r.items);
      page++;
      renderList(r.items.length === 30);
    } catch (e) {
      $("stravaBody").innerHTML = `<h2 style="margin:0">스트라바에서 가져오기</h2><div class="note">⚠️ ${esc(e.message)}</div>
        <div class="actions"><div class="right"><button type="button" id="svClose">닫기</button></div></div>`;
      $("svClose").onclick = () => $("stravaDlg").close();
    }
  }
  function renderList(more) {
    const SPI = TS.ACT_SPORTS;
    $("stravaBody").innerHTML = `<div class="spread"><h2 style="margin:0">스트라바에서 가져오기</h2><span class="hint">Powered by Strava</span></div>
      <p class="hint" style="margin:0">가민 시계 기록이 가민 커넥트 → 스트라바로 자동 동기화돼 있으면 여기 보여요. 가져온 기록은 스트라바 약관상 <b>🔒 나만 보기</b>로 저장돼요.</p>
      <div style="display:grid;gap:8px;max-height:52vh;overflow:auto">
      ${items.length ? items.map((x, i) => {
        const dup = have.has(`strava:${x.id}`);
        const sp = SPI[SPORT(x.sport_type)];
        return `<label class="check" style="align-items:flex-start;border-top:1px solid var(--line);padding-top:8px">
          <input type="checkbox" data-sv="${i}" ${dup ? "disabled" : "checked"} />
          <span><b>${sp.icon} ${esc(x.name)}</b><br><span class="hint">${new Date(x.start_date).toLocaleString("ko-KR", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" })}
          · ${(x.distance / 1000).toFixed(2)}km · ${fmtDur(x.moving_time)}${x.average_heartrate ? ` · ❤️ ${Math.round(x.average_heartrate)}` : ""}${dup ? " · ✓ 이미 가져옴" : ""}</span></span></label>`;
      }).join("") : '<p class="hint">스트라바에 기록이 없어요.</p>'}</div>
      ${more ? '<button type="button" class="pill" id="svMore">더 보기</button>' : ""}
      <label class="check"><input type="checkbox" id="svAuto" ${autoOn() ? "checked" : ""} /> 앱을 열 때 새 기록 자동으로 가져오기</label>
      <div class="actions"><button type="button" class="link" id="svOff">연결 끊기</button>
        <div class="right"><button type="button" id="svClose">닫기</button><button type="button" class="primary" id="svGo">선택한 기록 가져오기</button></div></div>`;
    $("svClose").onclick = () => $("stravaDlg").close();
    if ($("svMore")) $("svMore").onclick = () => { $("svMore").disabled = true; loadMore(); };
    $("svAuto").onchange = (e) => { try { localStorage.setItem(AUTO_KEY, e.target.checked ? "on" : "off"); } catch (x) { /* 무시 */ } };
    $("svOff").onclick = async () => { $("stravaDlg").close(); await disconnect(); };
    $("svGo").onclick = async () => {
      const sel = [...$("stravaBody").querySelectorAll("[data-sv]:checked")].map((c) => items[+c.dataset.sv]);
      if (!sel.length) return;
      const btn = $("svGo");
      btn.disabled = true;
      const n = await importItems(sel, (i) => { btn.textContent = `가져오는 중… ${i}/${sel.length}`; });
      $("stravaDlg").close();
      toast(`✅ 스트라바 기록 ${n}개를 가져왔어요`);
      if (TS.showTab) TS.showTab("activity");
    };
  }
  async function importItems(list, onStep) {
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      if (onStep) onStep(i + 1);
      try {
        const { streams } = await call("detail", { id: list[i].id });
        await TS.addActivity(build(list[i], streams));
        have.add(`strava:${list[i].id}`);
        n++;
      } catch (e) { console.warn("스트라바 가져오기 실패", list[i].id, e.message); }
    }
    return n;
  }
  // 앱을 열 때 새 기록 자동 가져오기 (최대 10개)
  let autoDone = false;
  async function autoSync() {
    if (autoDone || !autoOn() || !S.connected) return;
    autoDone = true;
    const acts = await TS.listActivities();
    const mine = acts.filter((a) => a.source === "strava");
    have = new Set(acts.map((a) => a.external_id).filter(Boolean));
    const after = mine.length ? Math.max(...mine.map((a) => Date.parse(a.started_at) / 1000)) : Date.now() / 1000 - 14 * 86400;
    try {
      const r = await call("list", { after, per_page: 10 });
      const fresh = r.items.filter((x) => !have.has(`strava:${x.id}`));
      if (!fresh.length) return;
      const n = await importItems(fresh);
      if (n) toast(`⌚ 스트라바에서 새 기록 ${n}개를 가져왔어요`);
    } catch (e) { /* 조용히 넘어가기 */ }
  }

  function toast(msg) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  // 활동 상세·설정 화면에서 쓰는 작은 조각
  function statusHtml() {
    if (!(TS.auth && TS.auth.user)) return `<button type="button" class="pill" data-strava="login">로그인 후 연결</button>`;
    if (S.checking) return `<span class="hint">확인 중…</span>`;
    if (S.connected) return `<span class="row"><span class="hint">✓ ${esc(S.athlete || "연결됨")}</span><button type="button" class="pill" data-strava="import">가져오기</button></span>`;
    return `<button type="button" class="pill strava-btn" data-strava="connect">스트라바 연결</button>`;
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-strava]");
    if (!b) return;
    const a = b.dataset.strava;
    if (a === "connect") connect();
    else if (a === "import") openImport();
    else if (a === "login") TS.auth.open("login", "스트라바 연동은 로그인한 뒤에 할 수 있어요.");
  });

  TS.strava = { S, connect, openImport, disconnect, statusHtml, refreshStatus, build };
  window.addEventListener("ts:auth", async () => {
    await refreshStatus();
    await handleCallback();
    autoSync();
  });
})();
