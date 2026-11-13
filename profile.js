// 선수 프로필 설정(9단계) + 훈련 계획 화면(주간·월간·연간·강도 기준)
(function () {
  const TS = window.TS;
  const E = TS.E;
  const { db, SPORTS, iso, addDays, mondayOf } = TS;
  const { parseTime, fmt, minLabel, num, DISC, discsOf, sportKey } = E;
  const esc = (s) => TS.escapeHtml(s == null ? "" : s);
  const $ = (id) => document.getElementById(id);

  const PROFILE_TABLE = "athlete_profiles";
  // 로그인하면 사람마다 따로, 아니면 이 기기 공용("me")
  const PROFILE_ID_GUEST = "me";
  const pid = () => (TS.auth && TS.auth.user ? TS.auth.user.id : PROFILE_ID_GUEST);
  const LS_KEY = "training.profile";
  const DAY = ["월", "화", "수", "목", "금", "토", "일"];
  const COLS = [["pr", "최고 기록"], ["year", "올해 목표"], ["final", "최종 목표"]];
  const ENV = {
    swim: [["indoor", "실내 수영장"], ["outdoor", "야외 오픈워터"]],
    bike: [["indoor", "실내 트레이너"], ["outdoor", "야외 도로"]],
    run: [["indoor", "트레드밀·실내 트랙"], ["outdoor", "야외 도로·트랙"]],
  };
  const SESSION_MIN = [30, 45, 60, 75, 90, 120, 150, 180];
  const STEPS = ["종목", "신체 정보", "기준점 테스트", "훈련 일정", "주간 훈련량", "기록과 목표", "훈련 방식", "대회·목표", "확인"];
  const LV_COLOR = window.ZONE ? window.ZONE.colors : ["#60a5fa", "#22c55e", "#eab308", "#f97316", "#ef4444"]; // Z1~Z5 (zones.js와 같은 색)
  const LV_FG = (l) => (l === 3 ? "#422006" : "#fff");

  let profile = null, draft = null, step = 0, cloudOk = true;
  let planTab = "week", weekIdx = 0, monthIdx = 0, qIdx = 0, plan = null;

  const clone = (o) => JSON.parse(JSON.stringify(o));
  function getPath(o, p) { return p.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o); }
  function setPath(o, p, v) {
    const ks = p.split("."); let a = o;
    ks.slice(0, -1).forEach((k) => { if (a[k] == null || typeof a[k] !== "object") a[k] = {}; a = a[k]; });
    a[ks[ks.length - 1]] = v;
  }
  const rec = (p, key, col = "pr") => (p.records && p.records[key] ? p.records[key][col] || "" : "");
  function emptyProfile() {
    return {
      sport: null, nickname: "", weight: "", height: "", age: "", maxHr: "", restHr: "",
      tests: {}, daysPerWeek: 3, days: [], weeklyHours: "", sessionMin: 60,
      volume: {}, env: { swim: "indoor", bike: "outdoor", run: "outdoor" },
      records: {}, goal: { event: "", time: "" }, philosophy: "polarized", lowPct: "80", mafAdj: "0", races: [],
    };
  }

  // ---------- 저장 ----------
  // 이 기기에 저장된 프로필이 누구 것인지 (다른 계정으로 바꿔 로그인하면 남의 프로필을 가져오지 않게)
  const OWNER_KEY = "training.profileOwner";
  const localOwner = () => { try { return localStorage.getItem(OWNER_KEY) || ""; } catch (e) { return ""; } };
  async function loadProfile() {
    let local = null;
    try { local = JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch (e) { /* 무시 */ }
    const uid = TS.auth && TS.auth.user ? TS.auth.user.id : "";
    const own = localOwner();
    if (uid && own && own !== uid) local = null; // 다른 계정의 프로필 → 쓰지 않아요
    const { data, error } = await db.from(PROFILE_TABLE).select("data").eq("id", pid()).maybeSingle();
    if (error) { cloudOk = false; return local; }
    cloudOk = true;
    return (data && data.data) || local;
  }
  async function saveProfile(p) {
    if (p && TS.auth && TS.auth.user) p.owner = TS.auth.user.id; // 이 프로필의 주인 (계정이 바뀌면 섞이지 않게)
    try { localStorage.setItem(LS_KEY, JSON.stringify(p)); localStorage.setItem(OWNER_KEY, TS.auth && TS.auth.user ? TS.auth.user.id : ""); } catch (e) { /* 무시 */ }
    const { error } = await db.from(PROFILE_TABLE).upsert({ id: pid(), data: p, updated_at: new Date().toISOString() });
    cloudOk = !error;
  }
  // 📅 계획이 바뀌면 달력의 '앞으로 할' 자동 계획도 같이 바꿔요
  //  (오늘 이후 · 완료 안 한 · [자동 계획] 일정만. 완료한 날·코치로 바꾼 날·직접 넣은 일정은 그대로)
  let syncTimer = null, syncBusy = false;
  function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(() => { syncCalendar().catch(() => {}); }, 1500); }
  function rowOf(s, d) {
    return { date: d, title: s.title, start_time: s.slot === "오전" ? "07:00" : s.slot === "오후" ? "18:30" : null,
      category: s.disc === "brick" ? "브릭" : DISC[s.disc].cat, duration_min: s.minutes || null,
      intensity: s.lvl <= 2 ? "낮음" : s.lvl === 3 ? "보통" : "높음", notes: notesText(s), completed: false };
  }
  async function syncCalendar() {
    if (!profile || syncBusy || profile.holdSync) return 0; // 대회를 추가하고 "나중에"를 고르면 자동으로 바꾸지 않아요
    syncBusy = true;
    try {
      const P = makeVariants(profile)[0].plan;
      const today = iso(new Date()), end = iso(addDays(P.week(0).start, 7 * 8 - 1));
      const { data: old, error } = await TS.mine(db.from(TS.TABLE).select("id,date,title,category,notes,completed")).gte("date", today).lte("date", end).like("notes", "[자동 계획]%");
      if (error || !old || !old.length) return 0;
      const cats = new Set([...discsOf(profile.sport).map((x) => DISC[x].cat), "브릭"]);
      if (!old.some((s) => cats.has(s.category))) return 0; // 다른 종목 계획이 들어 있으면 건드리지 않아요
      const keep = new Set(old.filter((s) => s.completed || /🧑‍🏫 코치:/.test(s.notes || "")).map((s) => s.date));
      const weeks = new Set(old.map((s) => iso(mondayOf(new Date(s.date + "T00:00:00")))));
      const rows = [];
      for (let i = 0; i < 8; i++) {
        const W = P.week(i);
        if (!weeks.has(iso(W.start))) continue; // 달력에 넣어 둔 주만
        W.sessions.forEach((s) => { const d = iso(addDays(W.start, s.day)); if (d >= today && d <= end && !keep.has(d)) rows.push(rowOf(s, d)); });
      }
      const oldRep = old.filter((s) => !keep.has(s.date));
      const sig = (a) => a.map((x) => `${x.date}|${x.title}`).sort().join(";");
      if (sig(oldRep) === sig(rows)) return 0;
      if (oldRep.length) await db.from(TS.TABLE).delete().in("id", oldRep.map((x) => x.id));
      if (rows.length) await db.from(TS.TABLE).insert(rows);
      const el = document.createElement("div"); el.className = "toast"; el.textContent = `📅 바뀐 계획을 달력에도 반영했어요 (${rows.length}개)`;
      document.body.appendChild(el); setTimeout(() => el.remove(), 3500);
      TS.reload();
      return rows.length;
    } finally { syncBusy = false; }
  }
  // 🏁 홈에서 대회 추가 → 이 대회에 맞춰 스케줄을 바꿀지 물어보기
  const RACE_PRI = [["A", "A 메인", "시즌 목표 대회 — 이 날짜에서 거꾸로 연간 계획을 짜고, 2주 조정기 + 대회 후 회복까지 넣어요. 목표 거리도 이 대회로 맞춰요."],
    ["B", "B 중요", "전력으로 뛰지만 1~2주 전부터 양을 조금만 줄여요 (A 대회 준비 흐름은 유지)."],
    ["C", "C 연습", "훈련 삼아 뛰는 대회 — 조정기 없이 강한 훈련 하루로 생각해요."]];
  function openRaceAdd() {
    if (!profile) { openWizard(0); return; }
    const sk = sportKey(profile.sport), goals = E.GOALS[sk] || [];
    const hasA = (profile.races || []).some((r) => r.priority === "A" && r.date >= iso(new Date()));
    const st = { name: "", date: "", ev: (goals.find((g) => g[0] === (profile.goal || {}).event) || goals[1] || goals[0] || [""])[0], evText: "", pri: hasA ? "B" : "A" };
    let d = $("raceDlg");
    if (!d) { d = document.createElement("dialog"); d.id = "raceDlg"; document.body.appendChild(d); }
    const draw = () => {
      d.innerHTML = `<div style="padding:18px;display:grid;gap:12px;max-height:88vh;overflow:auto">
        <div class="spread"><b style="font-size:17px">🏁 대회 추가</b><button type="button" class="link" data-r="x" style="font-size:20px">✕</button></div>
        <div class="fields" style="grid-template-columns:1fr 1fr"><label>대회 이름<input id="rName" value="${esc(st.name)}" placeholder="예: 춘천마라톤" /></label>
          <label>날짜<input id="rDate" type="date" min="${iso(new Date())}" value="${esc(st.date)}" /></label></div>
        ${(() => { // 종목과 대회가 안 맞으면 알려주기 (예: 수영 종목인데 마라톤 대회)
          const nm = (st.name || "").toLowerCase();
          const want = /마라톤|러닝|10k|5k|하프|풀코스/.test(nm) && !/철인|트라이|아이언/.test(nm) ? "육상" : /철인|트라이|아이언/.test(nm) ? "철인3종" : /그란폰도|자전거|사이클|라이딩/.test(nm) ? "자전거" : /수영|오픈워터/.test(nm) ? "수영" : null;
          return want && want !== profile.sport && !(want === "육상" && profile.sport === "철인3종") ? `<div class="note" style="margin:0">💡 지금 종목은 <b>${esc(profile.sport)}</b>이에요. '${esc(st.name)}'가 ${want} 대회라면 홈 오른쪽 위 종목 버튼에서 <b>${want}</b>으로 바꾼 뒤 추가해 주세요 — 그래야 거리·훈련이 맞게 짜여요.</div>` : "";
        })()}
        <div><div class="eyebrow" style="margin:0 0 6px">어떤 거리를 뛰나요? <span class="hint">(${esc(profile.sport)} 종목 기준)</span></div>
          <div class="chips">${goals.map(([k, n]) => `<button type="button" class="chip${st.ev === k ? " on" : ""}" data-ev="${k}">${esc(n)}</button>`).join("")}<button type="button" class="chip${st.ev === "etc" ? " on" : ""}" data-ev="etc">기타</button></div>
          ${st.ev === "etc" ? `<input id="rEv" class="mt" value="${esc(st.evText)}" placeholder="예: 트레일 30km" style="width:100%" />` : ""}</div>
        <div><div class="eyebrow" style="margin:0 0 6px">얼마나 중요한 대회인가요?</div>
          <div class="chips">${RACE_PRI.map(([k, n]) => `<button type="button" class="chip${st.pri === k ? " on" : ""}" data-pri="${k}">${n}</button>`).join("")}</div>
          <p class="hint" style="margin:6px 0 0">${esc(RACE_PRI.find((x) => x[0] === st.pri)[2])}</p></div>
        <div class="actions"><div class="right"><button type="button" data-r="x">취소</button><button type="button" class="primary" data-r="save">대회 저장</button></div></div></div>`;
      const keep = () => { st.name = d.querySelector("#rName").value; st.date = d.querySelector("#rDate").value; const e = d.querySelector("#rEv"); if (e) st.evText = e.value; };
      d.querySelectorAll('[data-r="x"]').forEach((b) => { b.onclick = () => d.close(); });
      d.querySelector("#rName").onchange = () => { keep(); draw(); }; // 이름을 다 쓰면 종목이 맞는지 다시 확인
      d.querySelectorAll("[data-ev]").forEach((b) => { b.onclick = () => { keep(); st.ev = b.dataset.ev; draw(); }; });
      d.querySelectorAll("[data-pri]").forEach((b) => { b.onclick = () => { keep(); st.pri = b.dataset.pri; draw(); }; });
      d.querySelector('[data-r="save"]').onclick = async () => {
        keep();
        if (!st.date) { d.querySelector("#rDate").focus(); return; }
        const evName = st.ev === "etc" ? st.evText : ((goals.find((g) => g[0] === st.ev) || [0, st.ev])[1]); // 화면에 보이는 이름으로 저장 (예: "하프 마라톤")
        const p = clone(profile);
        p.races = (p.races || []).concat([{ name: st.name, date: st.date, event: evName, priority: st.pri }]);
        if (st.pri === "A" && st.ev !== "etc") { p.goal = Object.assign({}, p.goal, { event: st.ev }); p.races.forEach((r) => { if (r.priority === "A" && r.date !== st.date && r.date >= iso(new Date())) r.priority = "B"; }); }
        p.holdSync = true; // 바꿀지 물어보기 전까지 달력은 그대로
        p.bySport = p.bySport || {}; if (p.sport) p.bySport[p.sport] = pickSport(p);
        await saveProfile(p); setProfile(p);
        d.close();
        await askScheduleChange(`🏁 ${st.name || "대회"} (${(goals.find((g) => g[0] === st.ev) || [0, evName])[1]}) · ${st.date.slice(5).replace("-", "/")} 를 등록했어요.`, st.pri);
      };
    };
    draw();
    d.showModal();
  }
  // 🚴 자전거 실내 ↔ 야외 바꾸기 (계획·달력이 따라 바뀌어요)
  async function setBikeEnv(v, kind = "bike") { // 자전거·달리기 실내/야외
    if (!profile) return;
    const p = clone(profile);
    p.env = Object.assign({}, p.env, { [kind]: v });
    p.bySport = p.bySport || {}; if (p.sport) p.bySport[p.sport] = pickSport(p);
    await saveProfile(p); setProfile(p);
    toastP(kind === "run" ? (v === "indoor" ? "🏠 트레드밀로 바꿨어요 — 페이스 옆에 속도(km/h), 언덕은 경사(%)로 알려 드려요" : "🌳 야외로 바꿨어요") : v === "indoor" ? "🏠 실내로 바꿨어요 — 자전거 훈련에 8분 이내 페달링 드릴이 들어가요" : "🌳 야외로 바꿨어요");
  }
  async function removeRace(idx) {
    if (!profile || !profile.races || !profile.races[idx]) return;
    const r = profile.races[idx];
    if (!await TS.ask(`🏁 ${r.name || "대회"} (${r.date})를 삭제할까요?`, "삭제", "취소")) return;
    const p = clone(profile);
    p.races.splice(idx, 1);
    p.holdSync = true;
    p.bySport = p.bySport || {}; if (p.sport) p.bySport[p.sport] = pickSport(p);
    await saveProfile(p); setProfile(p);
    await askScheduleChange(`🗑 ${r.name || "대회"}를 삭제했어요.`, r.priority);
  }
  async function askScheduleChange(head, pri) {
    const yes = await TS.ask(`${head}\n\n이 대회 일정에 맞춰 스케줄도 바꿀까요?\n• 대회 2주 전 조정기 · 대회 날 · 대회 후 회복이 들어가요${pri === "A" ? "\n• A 대회라 시즌 계획(기초 → 강화 → 조정기)도 이 날짜에 맞춰져요" : ""}\n• 완료한 훈련 · 코치로 바꾼 날 · 직접 넣은 일정은 그대로예요`, "네, 바꿔줘", "나중에");
    if (yes) {
      const n = await applyPlanToCalendar();
      const p = clone(profile); delete p.holdSync; await saveProfile(p); profile = p;
      toastP(`📅 대회에 맞춰 스케줄을 바꿨어요 (${n}개)`);
    } else toastP("대회만 저장했어요. 계획 화면에서 '지금 반영'을 누르면 언제든 스케줄에 넣을 수 있어요.");
    TS.reload();
    window.dispatchEvent(new Event("ts:profile"));
  }
  function toastP(msg) { const el = document.createElement("div"); el.className = "toast"; el.textContent = msg; document.body.appendChild(el); setTimeout(() => el.remove(), 4000); }
  // 오늘부터 대회(+회복)까지 (4~16주) 앞으로의 자동 계획을 새 계획으로 바꿔요
  async function applyPlanToCalendar() {
    clearTimeout(syncTimer);
    const P = makeVariants(profile)[0].plan;
    const today = iso(new Date());
    const up = (profile.races || []).filter((r) => r.date >= today).map((r) => r.date).sort();
    const lastRace = up.length ? new Date(up[up.length - 1] + "T00:00:00") : null;
    const nW = lastRace ? Math.min(16, Math.max(4, Math.ceil((lastRace - P.week(0).start) / (7 * 864e5)) + 2)) : 4;
    const end = iso(addDays(P.week(0).start, 7 * nW - 1));
    const { data: old } = await TS.mine(db.from(TS.TABLE).select("id,date,notes,completed")).gte("date", today).lte("date", end).like("notes", "[자동 계획]%");
    const keep = new Set((old || []).filter((s) => s.completed || /🧑‍🏫 코치:/.test(s.notes || "")).map((s) => s.date));
    const del = (old || []).filter((s) => !keep.has(s.date));
    if (del.length) await db.from(TS.TABLE).delete().in("id", del.map((x) => x.id));
    const rows = [];
    for (let i = 0; i < nW; i++) { const W = P.week(i); W.sessions.forEach((s) => { const dd = iso(addDays(W.start, s.day)); if (dd >= today && dd <= end && !keep.has(dd)) rows.push(rowOf(s, dd)); }); }
    if (rows.length) await db.from(TS.TABLE).insert(rows);
    return rows.length;
  }
  function setProfile(p) {
    // 예전에 "middle"처럼 내부 이름으로 저장된 대회 거리는 화면용 이름으로 바꿔서 보여줘요
    if (p && p.races && p.sport) { const G = E.GOALS[sportKey(p.sport)] || []; p.races.forEach((r) => { const g = G.find((x) => x[0] === r.event); if (g) r.event = g[1]; }); }
    profile = p;
    if (p) scheduleSync();
    TS.setSport(p ? p.sport : null);
    const b = $("sportBtn");
    if (b) b.textContent = p && p.sport ? `${SPORTS[p.sport].icon} ${p.sport} ▾` : "종목 선택";
    window.dispatchEvent(new Event("ts:profile"));
  }

  // ---------- 설정 화면 ----------
  // 종목마다 따로 저장하는 문진표 항목 (이름·몸무게·나이·심박 같은 신체 정보는 공통)
  const SPORT_FIELDS = ["tests", "daysPerWeek", "days", "dayOpts", "weeklyHours", "sessionMin", "volume", "env", "records", "goal", "philosophy", "lowPct", "mafAdj", "races", "goalSetAt", "allowHi"];
  const pickSport = (p) => { const o = {}; SPORT_FIELDS.forEach((k) => { if (p[k] !== undefined) o[k] = clone(p[k]); }); return o; };
  // 지금 종목 설정은 보관하고, 바꿀 종목의 저장된 설정을 불러와요 (없으면 지금 설정을 그대로 시작점으로)
  function withSport(p, sport) {
    const next = clone(p);
    next.bySport = next.bySport || {};
    if (p.sport) next.bySport[p.sport] = pickSport(p);
    if (next.bySport[sport]) Object.assign(next, clone(next.bySport[sport]));
    next.sport = sport;
    if (!E.GOALS[sportKey(sport)].some((g) => g[0] === (next.goal || {}).event)) next.goal = { event: "", time: (next.goal || {}).time || "" };
    return next;
  }
  const hasSaved = (sport) => !!(profile && (profile.sport === sport || (profile.bySport && profile.bySport[sport])));

  function openWizard(startStep = 0, sport) {
    draft = Object.assign(emptyProfile(), profile ? clone(sport && sport !== profile.sport ? withSport(profile, sport) : profile) : {});
    if (!draft.nickname && TS.auth && TS.auth.member) draft.nickname = TS.auth.member.nickname; // 새 문진표: 계정 닉네임으로 시작
    if (sport && !profile) draft.sport = sport;
    draft.env = Object.assign({ swim: "indoor", bike: "outdoor", run: "outdoor" }, draft.env);
    draft.tests = draft.tests || {};
    draft.goal = draft.goal || { event: "", time: "" };
    step = startStep;
    $("wizard").classList.add("show");
    document.body.style.overflow = "hidden";
    $("wzClose").style.visibility = profile ? "visible" : "hidden";
    renderStep();
  }
  function closeWizard() { $("wizard").classList.remove("show"); document.body.style.overflow = ""; }

  // type "time": 숫자만 쳐도 31:00처럼 자동으로 콜론이 들어가요
  function field(label, path, unit, ph, type = "number") {
    const v = getPath(draft, path);
    const isTime = type === "time";
    const attrs = isTime ? 'type="text" inputmode="decimal" data-time="1"' : `type="${type}" ${type === "number" ? 'inputmode="decimal"' : ""}`;
    return `<label>${label}<div class="unit"><input ${attrs} data-f="${path}" value="${esc(v)}" placeholder="${esc(ph)}" />${unit ? `<span>${unit}</span>` : ""}</div></label>`;
  }

  function stepSport() {
    return `<h2>어떤 종목을 훈련하나요?</h2><p class="sub">종목에 맞춰 기록 칸과 훈련 계획이 만들어져요.</p>
      <div class="sport-grid">${Object.entries(SPORTS).map(([n, s]) =>
        `<button type="button" class="sport-card${draft.sport === n ? " selected" : ""}" data-sport="${n}"><span class="ico">${s.icon}</span><span class="nm">${n}</span><span class="ds">${s.desc}</span></button>`).join("")}</div>`;
  }

  function hrHintText() {
    const age = num(draft.age), mx = num(draft.maxHr);
    if (mx) return `측정한 최대심박 ${Math.round(mx)}bpm을 써요.`;
    if (age) return `나이로 추정한 최대심박 약 <b>${Math.round(208 - 0.7 * age)}bpm</b>, MAF 약 <b>${180 - age}</b>. 추정값은 틀릴 수 있어서, 다음 단계의 LTHR 테스트를 권해요.`;
    return "나이를 적으면 최대심박·MAF를 계산해 드려요.";
  }
  function stepBody() {
    return `<h2>신체 정보</h2><p class="sub">파워(W/kg)와 심박 계산에 쓰여요.</p>
      <div class="card"><div class="fields">
        ${field("이름(닉네임)", "nickname", "", "예: 찬욱", "text")}
        ${field("몸무게", "weight", "kg", "예: 68")}${field("키", "height", "cm", "예: 175")}${field("나이", "age", "세", "예: 28")}
      </div>
      <div class="eyebrow mt" style="margin-bottom:6px">성별 <span class="hint">(레벨 기준 기록이 달라요)</span></div>
      <div class="chips">${[["m", "남자"], ["f", "여자"]].map(([k, l]) => `<button type="button" class="chip${(draft.sex || "m") === k ? " on" : ""}" data-sex="${k}">${l}</button>`).join("")}</div></div>
      <div class="card"><h3>❤️ 심박 (알면)</h3><div class="fields">
        ${field("최대심박", "maxHr", "bpm", "예: 192")}${field("안정시 심박", "restHr", "bpm", "예: 52")}
      </div><div class="note" id="hrHint">${hrHintText()}</div></div>`;
  }

  function testPreview() {
    const out = [], ds = discsOf(draft.sport); // 고른 종목의 기준점만 (수영이면 수영만, 철인3종은 세 종목)
    const b = E.bikeInfo(draft), s = E.swimInfo(draft);
    if (ds.includes("swim") && s && s.tested) out.push(`🏊 CSS <b>${fmt(s.css)}/100m</b>`);
    if (ds.includes("bike") && b) out.push(`🚴 FTP <b>${b.ftp}W</b>${b.wkg ? ` (${b.wkg.toFixed(2)}W/kg)` : ""}`);
    if (ds.includes("bike") && num((draft.tests || {}).lthrBike)) out.push(`🚴 사이클 LTHR <b>${draft.tests.lthrBike}bpm</b>`);
    const r = ds.includes("run") ? E.runInfo(draft) : null;
    if (r && /테스트/.test(r.src)) out.push(`🏃 VDOT <b>${r.vdot.toFixed(1)}</b> (T ${fmt(r.T)}/km)`);
    if (ds.includes("run") && num((draft.tests || {}).lthrRun)) out.push(`🏃 러닝 LTHR <b>${draft.tests.lthrRun}bpm</b>`);
    return out.length ? out.join(" · ") : "아직 입력한 테스트가 없어요. 비워두면 기록·나이로 추정하고, 계획 첫 주에 테스트를 넣어 드려요.";
  }
  function stepTests() {
    const ds = discsOf(draft.sport);
    const card = {
      run: `<div class="card"><h3>🏃 달리기 — VDOT · LTHR</h3>
        <p class="hint" style="margin-top:0">최근 5K·10K를 <b>최대로 달린 기록</b>을 적으면 VDOT와 E/M/T/I/R 페이스를 계산해요. 대회 기록이나 혼자 잰 타임트라이얼 모두 괜찮아요.</p>
        <div class="fields">${field("5K 기록", "tests.run5k", "", "예: 22:30", "time")}${field("10K 기록", "tests.run10k", "", "예: 47:00", "time")}</div>
        <p class="hint mt" style="margin-bottom:6px"><b>LTHR:</b> 혼자 30분 최대로 달리기 → 10분째 랩 버튼 → 마지막 20분 평균 심박</p>
        <div class="fields">${field("러닝 LTHR", "tests.lthrRun", "bpm", "예: 172")}</div></div>`,
      bike: `<div class="card"><h3>🚴 자전거 — FTP</h3>
        <p class="hint" style="margin-top:0">충분히 워밍업 → <b>20분 최대</b>로 타기 → 평균 파워 × 0.95 = FTP. 예: 260W → 247W. 매번 같은 테스트 방식을 쓰세요.</p>
        <div class="fields">${field("20분 테스트 평균", "tests.ftp20", "W", "예: 260")}${field("또는 FTP 직접", "tests.ftp", "W", "예: 247")}
        ${field("사이클 LTHR", "tests.lthrBike", "bpm", "예: 165")}</div>
        <p class="hint">사이클 LTHR: 20분(또는 30분) 테스트 마지막 20분 평균 심박. 러닝과 따로 재야 해요.</p></div>`,
      swim: `<div class="card"><h3>🏊 수영 — CSS</h3>
        <p class="hint" style="margin-top:0">다이빙 없이 벽을 밀고 <b>400m 최대 → 완전 회복 → 200m 최대</b>. (400 − 200) ÷ 2 = 100m당 CSS. 예: 6:30, 3:10 → 1:40/100m</p>
        <div class="fields">${field("400m 테스트", "tests.css400", "", "예: 6:30", "time")}${field("200m 테스트", "tests.css200", "", "예: 3:10", "time")}</div>
        <p class="hint mt" style="margin-bottom:6px">CSS 테스트를 안 했다면 <b>1500m 대회(또는 최대) 기록</b>으로도 계산해요 (CSS ≈ 1500m 평균 페이스).</p>
        <div class="fields">${field("1500m 대회 기록", "tests.swim1500", "", "예: 26:40", "time")}</div></div>`,
    };
    return `<h2>기준점 테스트</h2>
      <p class="sub">모든 훈련 강도는 '내 기준점'의 %로 정해져요. 최근 4~8주 안에 한 테스트 결과를 적어주세요.<br>모르면 비워두세요 — 계획 첫 주에 테스트를 넣어 드려요.</p>
      ${ds.map((d) => card[d]).join("")}
      <div class="card"><div class="fields">${field("테스트한 날", "tests.date", "", "", "date")}</div>
        <div class="note" id="testPrev">${testPreview()}</div></div>`;
  }

  const dayMin = (d) => num(((draft.dayOpts || {})[d] || {}).min) || num(draft.sessionMin) || 60;
  const dayTotal = (d) => { const o = (draft.dayOpts || {})[d] || {}; return dayMin(d) + (o.slot === "both" ? num(o.min2) || 45 : 0); };
  function timeHint() {
    const n = draft.days.length, wh = num(draft.weeklyHours);
    if (!n) return "요일을 고르면 주간 훈련 시간을 계산해 드려요.";
    const tot = draft.days.reduce((a, d) => a + dayTotal(d), 0);
    if (wh && wh * 60 < tot) return `요일별 시간 합계 ${minLabel(tot)}인데 주당 ${wh}시간이에요. 주당 시간에 맞춰 줄여서 계획할게요.`;
    return `요일별 시간 합계 주 ${minLabel(tot)}로 계획할게요.`;
  }
  function dayOptsCard() {
    if (!draft.days.length) return "";
    const tri = discsOf(draft.sport).length > 1;
    const o = (d) => (draft.dayOpts || {})[d] || {};
    const sel = (d, key, opts, cur) => `<select data-dopt="${d}:${key}">${opts.map(([v, l]) => `<option value="${v}"${String(cur) === String(v) ? " selected" : ""}>${l}</option>`).join("")}</select>`;
    return `<div class="card"><h3>요일별 설정</h3>
      <p class="hint" style="margin-top:0">시간이 많은 날은 길게, 강하게 하고 싶은 날은 '강하게'로 정해 주세요.${tri ? " 철인3종은 그날 할 종목도 정할 수 있어요 (예: 수 수영, 목 달리기)." : ""}</p>
      ${draft.days.map((d) => {
        const both = o(d).slot === "both";
        return `<div class="dayopt-wrap"><div class="dayopt"><b>${DAY[d]}</b>
        ${sel(d, "slot", [["", "시간대: 상관없음"], ["am", "🌅 오전"], ["pm", "🌇 오후"], ["both", "🌅+🌇 오전·오후 두 번"]], o(d).slot || "")}
        ${sel(d, "min", SESSION_MIN.map((m) => [m, (both ? "오전 " : "") + minLabel(m)]), dayMin(d))}
        ${sel(d, "pref", [["auto", "강도: 자동"], ["hard", "💥 강하게"], ["easy", "🌿 가볍게"]], o(d).pref || "auto")}
        ${tri ? sel(d, "disc", [["auto", both ? "오전 종목: 자동" : "종목: 자동"], ["swim", "🏊 수영"], ["bike", "🚴 자전거"], ["run", "🏃 달리기"], ["brick", "🚴🏃 브릭"]], o(d).disc || "auto") : ""}
        </div>${both ? `<div class="dayopt dayopt2"><span class="hint">🌇 오후</span>
          ${sel(d, "min2", SESSION_MIN.map((m) => [m, "오후 " + minLabel(m)]), num(o(d).min2) || 45)}
          ${tri ? sel(d, "disc2", [["auto", "오후 종목: 자동"], ["swim", "🏊 수영"], ["bike", "🚴 자전거"], ["run", "🏃 달리기"]], o(d).disc2 || "auto") : `<span class="hint">오후는 가벼운 두 번째 훈련</span>`}
        </div>` : ""}</div>`;
      }).join("")}
      <p class="hint">'자동'으로 두면 80/20 원칙에 맞춰 강한 날과 쉬운 날을 띄워서 배치해요. 시간이 가장 많은 날이 롱 세션이 돼요.<br>
      🌅+🌇 하루 두 번이면 오후는 쉬운 강도로 넣어요 (철인3종은 오전과 다른 종목). 노르웨이 방식이면 오전·오후 모두 역치 바로 아래(더블 역치)로 짜요.</p></div>`;
  }
  function stepSchedule() {
    const n = draft.daysPerWeek;
    return `<h2>훈련 일정</h2><p class="sub">운동할 수 있는 요일과 시간을 알려주세요. 계획은 이 시간에 맞춰 반복 횟수까지 계산돼요.</p>
      <div class="card"><h3>일주일에 몇 번 운동하나요?</h3>
        <div class="chips">${[1, 2, 3, 4, 5, 6, 7].map((c) => `<button type="button" class="chip${c === n ? " on" : ""}" data-cnt="${c}">${c}회</button>`).join("")}</div>
        <h3 class="mt">무슨 요일에 하나요? <span class="hint">${draft.days.length}/${n}개 선택</span></h3>
        <div class="chips">${DAY.map((d, i) => `<button type="button" class="chip${draft.days.includes(i) ? " on" : ""}" data-day="${i}">${d}</button>`).join("")}</div>
        ${draft.days.length ? (() => {
          const dbl = draft.days.filter((d) => ((draft.dayOpts || {})[d] || {}).slot === "both");
          return `<h3 class="mt">🌅🌇 하루에 2번 운동하는 날이 있나요? <span class="hint">(오전·오후)</span></h3>
          <div class="chips">${draft.days.map((d) => `<button type="button" class="chip${dbl.includes(d) ? " on" : ""}" data-dbl="${d}">${DAY[d]}</button>`).join("")}</div>
          <p class="hint" style="margin-bottom:0">${dbl.length ? `👉 주 ${draft.days.length}일 · 총 <b>${draft.days.length + dbl.length}회</b> 운동 (${dbl.map((d) => DAY[d]).join(", ")}요일은 오전·오후 두 번). 오후 시간·종목은 아래 '요일별 설정'에서 정해요.` : "없으면 넘어가세요. 고른 요일은 오전·오후 두 번 훈련으로 짜드려요."}</p>`;
        })() : ""}
      </div>
      <div class="card"><div class="fields">${field("일주일에 운동할 수 있는 시간", "weeklyHours", "시간", "예: 6")}</div>
        <h3 class="mt">평소 1회 운동 시간</h3>
        <div class="chips">${SESSION_MIN.map((m) => `<button type="button" class="chip${+draft.sessionMin === m ? " on" : ""}" data-smin="${m}">${minLabel(m)}</button>`).join("")}</div>
        <div class="note" id="timeHint">${timeHint()}</div></div>
      ${dayOptsCard()}
      <div class="card"><h3>주로 어디서 훈련하나요?</h3>
        ${discsOf(draft.sport).map((d) => `<div style="margin-bottom:12px"><div class="hint" style="margin-bottom:6px">${DISC[d].icon} ${DISC[d].name}</div>
          <div class="chips">${ENV[d].map(([v, l]) => `<button type="button" class="chip${draft.env[d] === v ? " on" : ""}" data-env="${d}:${v}">${l}</button>`).join("")}</div></div>`).join("")}</div>`;
  }

  function stepVolume() {
    const ds = discsOf(draft.sport);
    return `<h2>주간 훈련량</h2>
      <p class="sub">지금 일주일에 실제로 하는 양을 적어주세요. 이 양을 기준으로 강도별 상한(예: 달리기 T는 주간 거리의 10%)을 계산해요.</p>
      <div class="card"><div class="fields">${ds.map((d) => field(`${DISC[d].icon} ${DISC[d].name} 주간 거리`, `volume.${d}`, DISC[d].unit, DISC[d].ph)).join("")}</div>
      <p class="hint mt">비워두면 운동 시간으로 거리를 추정해요.</p></div>
      <div class="card"><h3>🔄 요즘 운동을 쉬었나요?</h3>
        <p class="hint" style="margin:0 0 8px">쉬다가 다시 시작하면 처음 몇 주는 양을 줄이고 쉬운 강도로 몸을 깨운 뒤, 천천히 원래 훈련으로 돌아가요. 쉰 기간만큼 페이스·파워도 낮춰 잡아요.</p>
        <div class="chips">${CB_OPTS.map(([k, l]) => `<button type="button" class="chip${(draft.comeback || "") === k ? " on" : ""}" data-cb="${k}">${l}</button>`).join("")}</div>
        ${draft.comeback && E.COMEBACK[draft.comeback] ? `<p class="hint" style="margin:8px 0 0">→ 복귀 ${E.COMEBACK[draft.comeback].weeks}주: 평소 양의 ${E.COMEBACK[draft.comeback].ramp.map((x) => Math.round(x * 100) + "%").join(" → ")}. 앞 ${Math.ceil(E.COMEBACK[draft.comeback].weeks / 2)}주는 쉬운 강도만, 그 뒤 가벼운 질 훈련 1회.</p>` : ""}</div>
      <div class="card" id="lvPreview">${levelCard(E.levelOf(draft))}${hiAsk(draft, E.levelOf(draft))}</div>`;
  }

  // rows: [키, 이름, 예시] — 키가 "#"이면 종목 제목 줄. FTP·W/kg 말고는 모두 시간 칸(자동 콜론)
  function recTable(rows) {
    return `<div class="rec-head"><span></span>${COLS.map((c) => `<span>${c[1]}</span>`).join("")}</div>` +
      rows.map(([k, l, ph]) => k === "#" ? `<div class="rec-group">${l}</div>` : `<div class="rec-row"><span class="rec-lbl">${l}</span>${COLS.map(([c]) =>
        `<input data-rec="${k}" data-col="${c}" ${/bike\.(ftp|wkg)/.test(k) ? 'inputmode="decimal"' : 'inputmode="decimal" data-time="1"'} value="${esc(rec(draft, k, c))}" placeholder="${c === "pr" ? esc(ph || "") : ""}" />`).join("")}</div>`).join("");
  }
  const swimRows = (st, ds) => ds.map((d) => [`swim.${st}.${d}`, `${d}m`, E.SWIM_PH[d]]);
  const runRows = (list) => E.RUN_EVENTS.filter((e) => !list || list.includes(e[0])).map(([l, , ph]) => [`run.${l}`, l, ph]);
  const bikeRows = () => [["bike.ftp", "FTP (W)", "250"], ["bike.wkg", "FTP (W/kg)", "5.0"], ["bike.tt40", "40km 기록", "1:00:00"]];
  function stepRecords() {
    const s = draft.sport;
    let body;
    if (s === "수영") body = Object.entries(E.SWIM_EVENTS).map(([st, ds], i) => `<details class="card"${i === 0 ? " open" : ""}><summary>${st}</summary>${recTable(swimRows(st, ds))}</details>`).join("");
    else if (s === "자전거") body = `<div class="card">${recTable(bikeRows())}</div>`;
    else if (s === "육상") body = `<div class="card">${recTable(runRows())}<p class="hint mt">1500m 이상 기록으로 VDOT를 계산해요. 최근 레이스 기록일수록 정확해요.</p></div>`;
    else body = E.TRI_RACES.map(([k, n, dist, ph], i) => `<details class="card"${i === 1 ? " open" : ""}><summary>${n} <span class="hint">${dist}</span></summary>
        ${recTable(E.TRI_LEGS.map(([lk, ll], j) => [`tri.${k}.${lk}`, ll, ph[j]]))}</details>`).join("") +
      `<details class="card" open><summary>종목별 기록 <span class="hint">(VDOT·CSS 계산에 쓰여요)</span></summary>
        ${recTable([["#", "🏊 수영 (자유형)"], ...swimRows("자유형", [100, 200, 400, 1500]), ["#", "🚴 자전거"], ...bikeRows(), ["#", "🏃 달리기"], ...runRows(["5km", "10km", "하프마라톤", "마라톤"])])}</details>`;
    return `<h2>기록과 목표</h2>
      <p class="sub">적을 수 있는 칸만. 숫자만 쳐도 돼요 — <b>3100</b> → 31:00, <b>13000</b> → 1:30:00, 수영은 <b>105.32</b> → 1:05.32</p>${body}`;
  }

  function stepGoal() {
    const sk = sportKey(draft.sport);
    const goals = E.GOALS[sk];
    const g = E.goalOf(draft);
    const avail = (() => { const wh = num(draft.weeklyHours), tot = draft.days.reduce((a, d) => a + dayTotal(d), 0); return (wh ? Math.min(wh * 60, tot) : tot) / 60; })();
    const R = E.runInfo(draft);
    let gapTxt = "";
    if (sk === "run" && g.time && g.dist) {
      const need = E.vdotFrom(g.dist, g.time);
      gapTxt = `<div class="note">목표 ${esc(g.timeText)} → 필요한 VDOT <b>${need.toFixed(1)}</b>${R ? ` · 지금 VDOT <b>${R.vdot.toFixed(1)}</b> (${need - R.vdot > 0 ? `${(need - R.vdot).toFixed(1)} 올려야 해요` : "이미 가능한 수준!"})` : ""}<br>목표 페이스 ${fmt(g.time / (g.dist / 1000))}/km</div>`;
    }
    const PH = { "5K": "20:00", "10K": "42:00", half: "1:35:00", full: "3:30:00" };
    void PH; void gapTxt; void avail; void goals;
    return `<h2>훈련 방식</h2>
      <p class="sub">어떤 방식이 맞는지 골라 주세요.</p>
      <div class="card"><h3>🧭 훈련 방식</h3>
        <div style="display:grid;gap:8px">${Object.entries(E.PHIL).map(([k, v]) => `<button type="button" class="sport-card${draft.philosophy === k ? " selected" : ""}" data-phil="${k}" style="justify-items:start;text-align:left;padding:14px">
          <span class="nm" style="font-size:16px">${v.name}${k === "polarized" ? " <span class=\"lvl\">추천</span>" : ""}</span><span class="ds" style="line-height:1.6">${v.desc}</span></button>`).join("")}</div>
      </div>
      <div class="card"><h3>⚖️ 강도 비율 (저강도 : 고강도)</h3>
        <p class="hint" style="margin-top:0">한 주 훈련 시간 중 쉬운 강도(Z1–Z2)와 힘든 강도(Z3 이상)의 비율이에요. 계획이 이 비율에 가장 가깝게 질 훈련 횟수를 맞춰요.</p>
        <div class="chips">${[90, 85, 80, 75, 70].map((v) => `<button type="button" class="chip${(num(draft.lowPct) || 80) === v ? " on" : ""}" data-low="${v}">${v} : ${100 - v}${v === 80 ? " 추천" : ""}</button>`).join("")}</div>
        <div class="fields mt">${field("직접 입력 — 저강도", "lowPct", "%", "80")}</div>
        <p class="hint">${(() => { const l = num(draft.lowPct) || 80; return `지금: 저강도 <b>${l}%</b> · 고강도 <b>${100 - l}%</b> — ${l > 85 ? "부상 위험이 적고 기초 체력 위주예요. 초보·복귀 시즌에 좋아요." : l >= 78 ? "가장 많이 검증된 비율이에요 (80/20)." : l >= 70 ? "고강도가 많아 회복 관리가 중요해요. 경험 많은 선수용이에요." : "고강도가 너무 많아요. 피로·부상 위험이 커서 권하지 않아요."}`; })()}
          ${draft.philosophy === "maf" ? "<br>MAF 방식은 기초기 동안 고강도를 하지 않아서 이 비율보다 저강도가 더 많아요." : ""}
          <br>회복 주·테이퍼·대회 주는 비율보다 회복이 우선이라 저강도가 더 많아요.</p>
        ${draft.philosophy === "maf" ? `<h3 class="mt">MAF 보정 (180 − 나이 ${num(draft.age) ? `= ${180 - num(draft.age)}` : ""})</h3>
          <div style="display:grid;gap:6px">${E.MAF_ADJ.map(([v, l]) => `<button type="button" class="chip${String(draft.mafAdj) === v ? " on" : ""}" data-maf="${v}" style="text-align:left;border-radius:12px">${l}</button>`).join("")}</div>` : ""}
      </div>`;
  }

  function eventSuggestions() {
    const sk = sportKey(draft.sport);
    if (sk === "swim") return ["자유형 50m", "자유형 100m", "자유형 200m", "자유형 400m", "자유형 1500m", "오픈워터 3km"];
    if (sk === "bike") return ["로드레이스", "타임트라이얼(TT)", "그란폰도", "크리테리움", "힐클라임"];
    if (sk === "run") return E.RUN_EVENTS.map((e) => e[0]);
    return E.TRI_RACES.map((r) => r[1]);
  }
  function stepRaces() {
    const rows = draft.races.map((r, i) => `<div class="race-row">
        <input data-race="${i}" data-k="name" value="${esc(r.name)}" placeholder="대회 이름" />
        <input type="date" data-race="${i}" data-k="date" value="${esc(r.date)}" />
        <input list="evList" data-race="${i}" data-k="event" value="${esc(r.event)}" placeholder="종목·거리" />
        <select data-race="${i}" data-k="priority">${[["A", "A 메인"], ["B", "B 중요"], ["C", "C 연습"]].map(([v, l]) => `<option value="${v}"${r.priority === v ? " selected" : ""}>${l}</option>`).join("")}</select>
        <button type="button" class="icon" data-rmrace="${i}" aria-label="삭제">✕</button></div>`).join("");
    const sk = sportKey(draft.sport), goals = E.GOALS[sk] || [], g = E.goalOf(draft);
    const PRK = { "5K": "run.5km", "10K": "run.10km", half: "run.하프마라톤", full: "run.마라톤" }[g.key];
    const PH = { "5K": ["23:00", "21:30"], "10K": ["48:00", "45:00"], half: ["1:45:00", "1:39:00"], full: ["3:45:00", "3:30:00"] }[g.key] || ["", "예: 2:20:00"];
    return `<h2>올해 나가는 대회와 목표</h2>
      <p class="sub">마지막이에요! 올해 나가는 대회를 모두 알려주세요. 대회 날짜·거리·중요도에 맞춰 <b>기초 → 강화 → 조정기(대회 2주 전) → 대회 → 회복</b>까지 스케줄을 도와드려요.</p>
      <div class="card"><h3>🏁 어떤 대회를 뛰나요?</h3>
        ${rows || '<p class="hint">아직 등록한 대회가 없어요. 대회가 없으면 24주 뒤를 시즌 목표로 잡고 짜요.</p>'}
        <datalist id="evList">${eventSuggestions().map((e) => `<option value="${esc(e)}">`).join("")}</datalist>
        <button type="button" data-addrace="1" class="mt">+ 대회 추가</button>
        <div class="note mt" style="line-height:1.7"><b>A 메인</b> — 시즌 목표. 이 날짜에서 거꾸로 연간 계획을 짜고, 2주 조정기 + 대회 후 회복까지 넣어요.<br>
          <b>B 중요</b> — 전력으로 뛰지만, 1~2주 전부터 양을 조금만 줄여요 (A 대회 준비 흐름은 유지).<br>
          <b>C 연습</b> — 훈련 삼아 뛰는 대회. 조정기 없이 강한 훈련 하루로 생각해요.</div></div>
      <div class="card"><h3>🎯 어떤 거리에 맞춰 훈련하고 싶나요?</h3>
        <p class="hint" style="margin-top:0">보통 A 대회 거리와 같게 해요. 이 거리에 맞춰 핵심 훈련·레이스 강도·페이스가 정해져요.</p>
        <div class="chips">${goals.map(([k, n]) => `<button type="button" class="chip${g.key === k && draft.goal.event ? " on" : ""}" data-goal="${k}">${n}</button>`).join("")}</div>
        <p class="hint">${draft.goal.event ? "" : `선택 안 하면 ${esc(g.from)}: <b>${esc(g.name)}</b>`}</p>
        <div class="note">핵심 훈련: <b>${esc(g.focus)}</b><br>레이스 강도: <b>${esc(g.race)}</b><br>권장 주간 시간: <b>${g.hours[0]}~${g.hours[1]}시간</b></div>
        <div class="fields mt" style="grid-template-columns:1fr 1fr">
          ${PRK ? `<label>이 거리 최고기록<div class="unit"><input type="text" inputmode="decimal" data-time="1" data-rec="${PRK}" data-col="pr" value="${esc((draft.records && draft.records[PRK] && draft.records[PRK].pr) || "")}" placeholder="${PH[0]}" /></div></label>` : ""}
          ${field("목표 기록", "goal.time", "", PH[1], "time")}</div>
        <div id="goalAn">${goalAnalysis(draft)}</div>
      </div>`;
  }
  // 목표 분석 (현재 기록 → 목표 기록, 남은 기간으로 현실적인지)
  function goalAnalysis(dd) {
    const sk = sportKey(dd.sport), g = E.goalOf(dd);
    const DM = { "5K": 5000, "10K": 10000, half: 21097, full: 42195 };
    const PRK = { "5K": "run.5km", "10K": "run.10km", half: "run.하프마라톤", full: "run.마라톤" }[g.key];
    const today = iso(new Date());
    const A = (dd.races || []).filter((r) => r.date && r.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    const race = A.find((r) => r.priority === "A") || A[0];
    const weeksLeft = race ? Math.max(1, Math.round((new Date(race.date + "T00:00:00") - new Date()) / (7 * 864e5))) : null;
    if (sk !== "run" || !DM[g.key]) return weeksLeft ? `<div class="goal-an">🏁 ${esc(race.name || "A 대회")}까지 <b>${weeksLeft}주</b> — 이 기간에 맞춰 기초·강화·조정기를 나눠요.</div>` : "";
    const pr = parseTime(((dd.records || {})[PRK] || {}).pr), tg = g.time, D = DM[g.key];
    const now = pr ? E.vdotFrom(D, pr) : (E.runInfo(dd) || {}).vdot, need = tg ? E.vdotFrom(D, tg) : null;
    const lines = [];
    if (now) { const R = E.runFrom(now); lines.push(`지금 수준 <b>VDOT ${now.toFixed(1)}</b>${pr ? "" : " (다른 기록 기준)"} · 훈련 페이스 E ${fmt(R.E[0])}–${fmt(R.E[1])} · T ${fmt(R.T)} · I ${fmt(R.I)} /km`); }
    else lines.push("최고기록을 넣으면 지금 수준에 맞는 훈련 페이스를 계산해요.");
    if (need) lines.push(`목표 ${esc(g.timeText)} → <b>VDOT ${need.toFixed(1)}</b> · 목표 레이스 페이스 <b>${fmt(tg / (D / 1000))}/km</b>`);
    if (now && need) {
      const diff = need - now, lv = (E.levelOf(dd) || { band: 2 }).band, step = lv <= 1 ? 1.5 : 1, wkNeed = diff > 0 ? Math.ceil(diff / step) * 4 : 0;
      const v = diff <= 0 ? ["✅ 이미 가능한 기록", "#16a34a"] : !weeksLeft ? ["📅 대회 날짜를 넣으면 판단해요", "#64748b"] : wkNeed <= weeksLeft * 0.8 ? ["✅ 현실적인 목표", "#16a34a"] : wkNeed <= weeksLeft * 1.3 ? ["💪 도전적인 목표", "#ea580c"] : ["⚠️ 기간에 비해 무리한 목표", "#dc2626"];
      lines.push(`<b style="color:${v[1]}">${v[0]}</b> — VDOT ${diff > 0 ? "+" : ""}${diff.toFixed(1)}, 보통 ${wkNeed}주${weeksLeft ? ` (A 대회까지 ${weeksLeft}주)` : ""}. 계획은 지금 페이스로 시작해 4주마다 VDOT +${step}씩 올려요.`);
    }
    return `<div class="goal-an">${lines.map((l) => `<div>${l}</div>`).join("")}</div>`;
  }

  function stepReview() {
    const ds = discsOf(draft.sport), g = E.goalOf(draft), h = E.hrInfo(draft);
    const vol = ds.filter((d) => num((draft.volume || {})[d])).map((d) => `${DISC[d].name} ${draft.volume[d]}${DISC[d].unit}`).join(" · ");
    const rs = draft.races.filter((r) => r.name || r.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return `<h2>확인</h2><p class="sub">끝까지 들었어요! 이 내용으로 연간·월간·주간 스케줄을 짜 드릴게요.</p>
      ${rs.length ? `<div class="card"><h3>🏁 올해 대회</h3>${rs.map((r) => `<div class="spread" style="padding:6px 0;border-top:1px solid var(--line)"><span><b>${esc(r.name || "대회")}</b> <span class="hint">${esc(r.event || "")}</span></span><span>${esc(r.date || "날짜 미정")} <span class="zb" style="background:${r.priority === "A" ? "#ef4444" : r.priority === "B" ? "#f97316" : "#94a3b8"}">${r.priority || "B"}</span></span></div>`).join("")}<p class="hint" style="margin:8px 0 0">A 대회 2주 전부터 조정기, 대회 뒤에는 거리에 맞는 회복 기간이 들어가요.</p></div>` : ""}
      <div class="card"><div class="kv">
        <span>종목</span><b>${SPORTS[draft.sport].icon} ${draft.sport}</b>
        <span>목표</span><b>${esc(g.name)}${g.timeText ? ` · ${esc(g.timeText)}` : ""}</b>
        <span>훈련 방식</span><b>${E.PHIL[draft.philosophy || "polarized"].name}</b>
        <span>강도 비율</span><b>저강도 ${num(draft.lowPct) || 80}% : 고강도 ${100 - (num(draft.lowPct) || 80)}%</b>
        <span>신체</span><b>${[draft.weight && draft.weight + "kg", draft.height && draft.height + "cm", draft.age && draft.age + "세"].filter(Boolean).join(" · ") || "-"}</b>
        <span>기준점</span><b>${testPreview().replace(/<[^>]+>/g, "")}</b>
        <span>최대심박</span><b>${h.max ? `${h.max}bpm ${h.maxMeasured ? "(측정)" : "(추정)"}` : "-"}</b>
        <span>훈련 요일</span><b>주 ${draft.days.length}회 · ${draft.days.map((d) => DAY[d]).join(", ")}</b>
        <span>운동 시간</span><b>1회 ${minLabel(+draft.sessionMin)}${num(draft.weeklyHours) ? ` · 주 ${draft.weeklyHours}시간` : ""}</b>
        <span>주간 거리</span><b>${vol || "-"}</b>
        <span>대회</span><b>${draft.races.filter((r) => r.name || r.date).length}개</b>
      </div></div>`;
  }

  function renderStep() {
    const html = [stepSport, stepBody, stepTests, stepSchedule, stepVolume, stepRecords, stepGoal, stepRaces, stepReview][step]();
    $("wzBody").innerHTML = html + '<p class="warn" id="wzErr"></p>';
    $("wzBar").style.width = `${((step + 1) / STEPS.length) * 100}%`;
    $("wzStep").textContent = `${step + 1}/${STEPS.length} ${STEPS[step]}`;
    $("wzPrev").style.visibility = step === 0 ? "hidden" : "visible";
    $("wzNext").textContent = step === STEPS.length - 1 ? "훈련 계획 만들기 ✨" : "다음 ›";
  }
  function validate() {
    if (step === 0 && !draft.sport) return "종목을 골라주세요.";
    if (step === 1) { const age = num(draft.age); if (!(age >= 10 && age <= 90)) return "심박·MAF 계산에 필요해요. 나이를 적어주세요."; }
    if (step === 3 && draft.days.length !== draft.daysPerWeek) return `운동할 요일을 ${draft.daysPerWeek}개 골라주세요.`;
    return "";
  }
  async function finish() {
    $("wzNext").disabled = true;
    draft.races = draft.races.filter((r) => r.name || r.date);
    draft.goalSetAt = draft.goalSetAt || new Date().toISOString(); // 목표를 끝까지 들었으니 계획 전에 다시 묻지 않아요
    draft.updatedAt = new Date().toISOString();
    draft.bySport = draft.bySport || {};
    draft.bySport[draft.sport] = pickSport(draft); // 이 종목 문진표로 저장
    await saveProfile(draft);
    $("wzNext").disabled = false;
    setProfile(clone(draft));
    closeWizard();
    planTab = "week"; weekIdx = 0; monthIdx = 0; qIdx = 0;
    openPlan();
  }

  function onWzInput(e) {
    const t = e.target;
    if (t.dataset.time && e.type === "input") { // 3100 → 31:00
      const f = E.autoTime(t.value);
      if (f !== t.value) { t.value = f; try { t.setSelectionRange(f.length, f.length); } catch (x) { /* 무시 */ } }
    }
    if (t.dataset.dopt) { // 요일별 시간·강도·종목
      const [d, key] = t.dataset.dopt.split(":");
      draft.dayOpts = draft.dayOpts || {};
      draft.dayOpts[d] = Object.assign({}, draft.dayOpts[d], { [key]: t.value });
      if ($("timeHint")) $("timeHint").textContent = timeHint();
      if (key === "slot" && e.type === "change") { const y = $("wizard").scrollTop; renderStep(); $("wizard").scrollTop = y; } // 오후 칸 보이기/숨기기
      return;
    }
    if (t.dataset.f) {
      setPath(draft, t.dataset.f, t.value);
      if ($("hrHint")) $("hrHint").innerHTML = hrHintText();
      if ($("timeHint")) $("timeHint").textContent = timeHint();
      if ($("testPrev")) $("testPrev").innerHTML = testPreview();
    } else if (t.dataset.rec) {
      draft.records = draft.records || {};
      draft.records[t.dataset.rec] = Object.assign({}, draft.records[t.dataset.rec], { [t.dataset.col]: t.value });
    } else if (t.dataset.race !== undefined && t.dataset.k) draft.races[+t.dataset.race][t.dataset.k] = t.value;
    if ($("goalAn")) $("goalAn").innerHTML = goalAnalysis(draft); // 대회·목표 단계: 입력하면 바로 다시 분석
  }
  $("wzBody").addEventListener("input", (e) => { onWzInput(e); const lp = $("lvPreview"); if (lp) { const L = E.levelOf(draft); lp.innerHTML = levelCard(L) + hiAsk(draft, L); } });
  $("wzBody").addEventListener("change", (e) => {
    onWzInput(e);
    if (step === 6 && e.target.dataset.f === "goal.time") renderStep();
  });
  $("wzBody").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const d = b.dataset;
    if (d.lvtable) { openLevel(draft); return; }
    if (d.hi !== undefined) { draft.allowHi = d.hi === "1"; const lp = $("lvPreview"); if (lp) { const L = E.levelOf(draft); lp.innerHTML = levelCard(L) + hiAsk(draft, L); } return; }
    if (d.sex || d.cb !== undefined) {
      if (d.sex) draft.sex = d.sex;
      else { draft.comeback = d.cb; draft.comebackAt = d.cb ? iso(new Date()) : ""; }
      const y = $("wizard").scrollTop; renderStep(); $("wizard").scrollTop = y; return;
    }
    if (d.sport) {
      // 다른 종목을 고르면 그 종목에 저장된 문진표를 불러와요 (없으면 지금 내용에서 시작)
      if (draft.sport && draft.sport !== d.sport) draft = Object.assign(emptyProfile(), withSport(draft, d.sport));
      draft.sport = d.sport;
      draft.env = Object.assign({ swim: "indoor", bike: "outdoor", run: "outdoor" }, draft.env);
      draft.tests = draft.tests || {};
      draft.goal = draft.goal || { event: "", time: "" };
      step = 1; renderStep(); $("wizard").scrollTop = 0; return;
    }
    if (d.cnt) { draft.daysPerWeek = +d.cnt; if (draft.days.length > draft.daysPerWeek) draft.days = draft.days.slice(-draft.daysPerWeek); }
    else if (d.day !== undefined) {
      const i = +d.day;
      if (draft.days.includes(i)) draft.days = draft.days.filter((x) => x !== i);
      else { if (draft.days.length >= draft.daysPerWeek) draft.days.shift(); draft.days.push(i); }
      draft.days.sort((a, b2) => a - b2);
    }
    else if (d.dbl !== undefined) { // 하루 2번(오전·오후) 켜고 끄기
      draft.dayOpts = draft.dayOpts || {};
      const o = Object.assign({}, draft.dayOpts[d.dbl]);
      if (o.slot === "both") o.slot = ""; else { o.slot = "both"; o.min2 = o.min2 || "45"; }
      draft.dayOpts[d.dbl] = o;
    }
    else if (d.smin) { // 평소 시간을 바꾸면, 요일별 시간을 따로 안 바꾼 날도 같이 맞춰져요
      const old = +draft.sessionMin;
      draft.sessionMin = +d.smin;
      Object.values(draft.dayOpts || {}).forEach((o) => { if (+o.min === old) delete o.min; });
    }
    else if (d.env) { const [k, v] = d.env.split(":"); draft.env[k] = v; }
    else if (d.goal) draft.goal.event = d.goal;
    else if (d.phil) draft.philosophy = d.phil;
    else if (d.low) draft.lowPct = d.low;
    else if (d.maf !== undefined) draft.mafAdj = d.maf;
    else if (d.addrace) draft.races.push({ name: "", date: "", event: "", priority: draft.races.length ? "B" : "A" });
    else if (d.rmrace !== undefined) draft.races.splice(+d.rmrace, 1);
    else return;
    const y = $("wizard").scrollTop;
    renderStep();
    $("wizard").scrollTop = y;
  });
  $("wzNext").onclick = () => {
    const err = validate();
    if (err) { $("wzErr").textContent = err; return; }
    if (step < STEPS.length - 1) { step++; renderStep(); $("wizard").scrollTop = 0; } else finish();
  };
  $("wzPrev").onclick = () => { if (step > 0) { step--; renderStep(); $("wizard").scrollTop = 0; } };
  $("wzClose").onclick = closeWizard;

  // ---------- 계획 화면 ----------
  // 계획 2개: A안(추천) + B안(다른 훈련 방식)
  let variants = [], vSel = 0;
  function makeVariants(p) {
    const chosen = E.PHIL[p.philosophy] ? p.philosophy : "polarized";
    const t = p.tests || {};
    const tested = !!(num(t.lthrRun) || num(t.ftp20) || num(t.ftp) || t.css400 || t.run5k || t.run10k);
    const base = E.buildPlan(p);
    let rec = chosen, why;
    if (chosen === "norwegian" && (base.availHours < 5 || !tested)) {
      rec = "polarized";
      why = "노르웨이 방식은 역치를 정확히 알고 주 5시간 이상 훈련할 때 효과가 커요. 지금 조건에서는 80/20이 더 안전하고 효과적이라 추천해요.";
    } else {
      why = {
        polarized: "쉬운 날·힘든 날을 확실히 나눠서, 시간 대비 효과가 가장 검증된 방식이에요.",
        norwegian: "역치 기준점이 있고 시간이 충분해서, 역치 바로 아래 볼륨으로 빠르게 성장할 수 있어요.",
        maf: "직접 고른 방식이에요. 부상 없이 기초 체력을 만드는 데 집중해요.",
      }[chosen];
    }
    const other = rec === chosen ? (chosen === "polarized" ? "norwegian" : "polarized") : chosen;
    const mk = (ph) => (ph === chosen ? base : E.buildPlan(Object.assign({}, p, { philosophy: ph })));
    return [
      { key: rec, plan: mk(rec), rec: true, why },
      { key: other, plan: mk(other), rec: false, why: E.PHIL[other].desc },
    ];
  }
  // A안·B안 비교: 지금 보고 있는 주(강도가 있는 주 기준) 저강도 비율·질 훈련 수·핵심 훈련
  function vWeek(v) { // 회복 주면 다음 주를 대표로
    let i = weekIdx, w = v.plan.week(i);
    while (w.recovery && i < weekIdx + 3) w = v.plan.week(++i);
    return w;
  }
  function vStats(v) {
    const w = vWeek(v), q = w.sessions.filter((s) => s.lvl >= 3 && s.type !== "Test" && s.type !== "Long");
    return { low: w.lowPct, q: q.length, dbl: w.sessions.filter((s) => s.type === "Double" || /더블/.test(s.tag || "")).length, min: w.total, keys: [...new Set(q.map((s) => s.name || s.tag))] };
  }
  function vCompare() {
    if (variants.length < 2) return "";
    const [a, b] = variants.map(vStats);
    const line = (n, s) => `<b>${n}</b> 핵심 훈련: ${esc(s.keys.slice(0, 4).join(" · ") || "쉬운 훈련 위주")}`;
    return `<div class="note" style="margin:8px 0 0;font-size:13px;line-height:1.7">🔍 두 안의 차이 (${weekIdx + 1}주차 기준)<br>${line("A안", a)}<br>${line("B안", b)}<br>
      고강도 비중: A안 ${100 - a.low}% vs B안 ${100 - b.low}% · 질 훈련: A안 주 ${a.q}회 vs B안 주 ${b.q}회</div>`;
  }
  // ---------- 🎯 목표 먼저: 어떤 대회 · 어떤 거리 · 목표 기록 · 현재 최고기록 ----------
  const PR_KEY = { "5K": "run.5km", "10K": "run.10km", half: "run.하프마라톤", full: "run.마라톤" };
  const DIST_M = { "5K": 5000, "10K": 10000, half: 21097, full: 42195 };
  // ---------- 🏅 레벨 1~10 카드·기준표 ----------
  const CB_OPTS = [["", "쉬지 않고 하고 있어요"], ["w2", "2~4주 쉬었어요"], ["m1", "1~3개월 쉬었어요"], ["m3", "3~6개월 쉬었어요"], ["m6", "6개월 이상 쉬었어요"]];
  // 🌱 레벨 1~3이면 Z4·Z5를 넣을지 물어봐요 (Z3까지만을 적극 추천)
  function hiAsk(p, L) {
    if (!L || L.lv > 3) return "";
    const on = !!p.allowHi;
    return `<div class="card" style="margin:10px 0 0;padding:12px;display:grid;gap:8px">
      <b>🌱 레벨 ${L.lv}이에요 — 강한 훈련(Z4·Z5)도 넣을까요?</b>
      <div class="chips"><button type="button" class="chip${on ? "" : " on"}" data-hi="0">✅ Z3까지만 (추천)</button><button type="button" class="chip${on ? " on" : ""}" data-hi="1">Z4·Z5도 넣기</button></div>
      <p class="hint" style="margin:0;line-height:1.6"><b>Z3까지만을 적극 추천해요.</b> 지금 단계에서는 쉬운 강도로 쌓는 시간이 실력을 가장 많이 올려요. 심폐는 몇 주면 좋아지지만 힘줄·인대·뼈는 몇 달이 걸려서, 강한 훈련을 일찍 넣으면 다치기 쉽고 회복에 2~3일이 걸려 꾸준함이 무너져요. 레벨 4가 되면 강한 훈련이 자동으로 들어가요.</p>
      ${on ? '<p class="warn" style="margin:0">⚠️ Z4·Z5를 넣으면 부상·과로 위험이 커져요. 통증이 있거나 다음 날까지 피곤하면 바로 \'Z3까지만\'으로 바꿔 주세요.</p>' : ""}</div>`;
  }
  function levelCard(L, compact) {
    if (!L) return `<div class="note">기록이나 주간 거리를 넣으면 레벨(1~10)을 계산해요.</div>`;
    const seg = Array.from({ length: 10 }, (_, k) => `<i style="background:${k < L.lv ? `hsl(${210 - k * 21},80%,${55 - k}%)` : "var(--line)"}"></i>`).join("");
    const rows = Object.entries(L.per).map(([x, v]) => `<div class="ratio-row"><span>${E.DISC[x].icon} ${E.DISC[x].name} <b>레벨 ${v.lv}</b></span><span class="hint">${v.perf != null ? `${esc(v.perfTxt)} → ${v.perf}` : "기록 없음"} · ${v.volLv != null ? `주 ${x === "swim" ? v.vol.toLocaleString() + "m" : v.vol + "km"} → ${v.volLv}` : "주간 거리 없음"}</span></div>`).join("");
    return `<div class="lv-card"><div class="spread"><b style="font-size:16px">레벨 ${L.lv}<span class="hint">/10</span> · ${esc(L.name)}</b>${compact ? "" : '<button type="button" class="pill" data-lvtable="1">레벨 기준표</button>'}</div>
      <div class="lv-bar">${seg}</div>
      ${L.comeback ? `<p class="hint" style="margin:4px 0;color:#ea580c">🔄 ${esc(L.comeback.name)} — 복귀 기간이라 ${L.before ? `레벨 ${L.before} → ${L.lv}로 낮춰서 ` : ""}${L.comeback.weeks - L.comeback.since}주 동안 천천히 올려요</p>` : ""}
      <p style="margin:4px 0;font-size:13.5px;line-height:1.6">질 훈련 <b>${esc(L.q)}</b> · ${L.lv <= 3 ? "<b>Z3까지만</b> (Z4·Z5 없음)" : `고강도 최대 <b>${E.LEVEL_HI_MAX[L.lv]}%</b>`} — ${esc(L.desc)}</p>
      ${rows ? `<div class="ratio-box">${rows}</div>` : ""}
      <p class="hint" style="margin:6px 0 0">레벨 = 기록 60% + 주간 거리 40%${Object.keys(L.per).length > 1 ? " · 철인3종은 자전거 45 · 달리기 35 · 수영 20 비중" : ""}. ${esc(L.next)}</p></div>`;
  }
  function openLevel(p0) {
    const p = p0 || profile || {}; // 문진표 전이어도 기준표는 볼 수 있어요
    let d = $("lvDlg");
    if (!d) { d = document.createElement("dialog"); d.id = "lvDlg"; document.body.appendChild(d); }
    const mine = p.sport ? discsOf(p.sport) : [], ds = [...mine, ...["run", "bike", "swim"].filter((x) => !mine.includes(x))]; // 내 종목 먼저, 다른 종목 기준표도 볼 수 있게
    let cur = ds[0], fem = p.sex === "f";
    const L = p.sport ? E.levelOf(p) : null;
    function draw() {
      const t = E.levelTable(cur, fem), my = L && L.per[cur] ? L.per[cur].lv : null;
      d.innerHTML = `<div style="padding:18px;display:grid;gap:12px;max-height:88vh;overflow:auto">
        <div class="spread"><b style="font-size:17px">🏅 레벨 기준표 (1~10)</b><button type="button" class="link" data-lv="x" style="font-size:20px">✕</button></div>
        <p class="hint" style="margin:0">레벨은 잘하고 못하고의 순위가 아니라, 지금 내 몸에 맞는 훈련 단계예요. 1 = 막 시작한 단계 · 10 = 엘리트 상위 그룹. 기록과 주간 거리를 함께 보고 정해요. 레벨이 높을수록 질 훈련 횟수·한 번의 고강도 양·고강도 비중이 커져요.</p>
        ${levelCard(L, true)}
        <div class="chips">${ds.map((x) => `<button type="button" class="chip${cur === x ? " on" : ""}" data-lvd="${x}">${E.DISC[x].icon} ${E.DISC[x].name}</button>`).join("")}
          <span style="flex:1"></span><button type="button" class="chip${!fem ? " on" : ""}" data-lvs="m">남자 기준</button><button type="button" class="chip${fem ? " on" : ""}" data-lvs="f">여자 기준</button></div>
        <div class="lv-table">${t.map((r) => `<div class="lv-row${my === r.lv ? " me" : ""}"><b>${r.lv}</b><span><b>${esc(r.name)}</b>${my === r.lv ? " 👈 나" : ""}<br><span class="hint">${esc(r.rec)}<br>${esc(r.vol)} · 질 훈련 ${esc(r.q)} · ${r.lv <= 3 ? "<b>Z3까지만</b> (Z4·Z5 없음)" : `고강도 최대 ${r.hiMax}%`}</span></span></div>`).join("")}</div>
        ${mine.length > 1 ? '<p class="hint" style="margin:0">철인3종 레벨은 세 종목 레벨을 자전거 45% · 달리기 35% · 수영 20%로 합쳐요 (완주 기록에 미치는 영향 순서).</p>' : ""}
      </div>`;
    }
    d.onclick = (e) => {
      const b = e.target.closest("[data-lv],[data-lvd],[data-lvs]");
      if (e.target === d || (b && b.dataset.lv === "x")) { d.close(); return; }
      if (!b) return;
      if (b.dataset.lvd) cur = b.dataset.lvd;
      if (b.dataset.lvs) fem = b.dataset.lvs === "f";
      draw();
    };
    draw();
    if (!d.open) d.showModal();
  }

  function openGoal(after) {
    if (!profile) { openWizard(0); return; }
    const g0 = clone(profile);
    const sk = sportKey(g0.sport);
    const goals = E.GOALS[sk] || [];
    g0.goal = g0.goal || { event: "", time: "" };
    g0.records = g0.records || {};
    g0.races = g0.races || [];
    const today = iso(new Date());
    let raceSel = (() => { const up = g0.races.map((r, i) => [r, i]).filter(([r]) => r.date && r.date >= today).sort((a, b) => a[0].date.localeCompare(b[0].date)); const a = up.find(([r]) => r.priority === "A") || up[0]; return a ? a[1] : -1; })();
    let ev = g0.goal.event || (goals[1] || goals[0])[0];
    let d = $("goalDlg");
    if (!d) { d = document.createElement("dialog"); d.id = "goalDlg"; document.body.appendChild(d); }
    const prOf = () => (PR_KEY[ev] && g0.records[PR_KEY[ev]] && g0.records[PR_KEY[ev]].pr) || "";
    function analysis() {
      if (sk !== "run") {
        const r = g0.races[raceSel];
        return `<div class="goal-an"><b>${esc((goals.find((x) => x[0] === ev) || [])[1] || "")}</b> 맞춤 계획 — 핵심 훈련: ${esc((goals.find((x) => x[0] === ev) || [])[2] || "")}${r && r.date ? `<br>대회까지 <b>${Math.max(0, Math.round((new Date(r.date) - new Date()) / (7 * 864e5)))}주</b>` : ""}</div>`;
      }
      const D = DIST_M[ev], pr = parseTime(prOf()), tg = parseTime(g0.goal.time);
      if (!D) return "";
      const lines = [];
      const now = pr ? E.vdotFrom(D, pr) : null, need = tg ? E.vdotFrom(D, tg) : null;
      if (now) { const R = E.runFrom(now); lines.push(`현재 최고기록 ${prOf()} → <b>VDOT ${now.toFixed(1)}</b> · 지금 훈련 페이스 E ${fmt(R.E[0])}–${fmt(R.E[1])} · T ${fmt(R.T)} · I ${fmt(R.I)} /km`); }
      else lines.push("현재 최고기록을 넣으면 지금 수준에 딱 맞는 훈련 페이스를 계산해요. (없으면 최근 5K·10K 기록도 OK)");
      if (need) lines.push(`목표 ${g0.goal.time} → <b>VDOT ${need.toFixed(1)}</b> · 목표 레이스 페이스 <b>${fmt(tg / (D / 1000))}/km</b>`);
      if (now && need) {
        const r = g0.races[raceSel];
        const weeksLeft = r && r.date ? Math.max(1, Math.round((new Date(r.date + "T00:00:00") - new Date()) / (7 * 864e5))) : null;
        const diff = need - now, lv = (E.levelOf(g0) || { band: 2 }).band, step = lv <= 1 ? 1.5 : 1;
        const wkNeed = diff > 0 ? Math.ceil(diff / step) * 4 : 0;
        const verdict = diff <= 0 ? ["✅ 이미 가능한 기록", "#16a34a"] : !weeksLeft ? ["📅 대회 날짜를 정하면 판단해요", "#64748b"] : wkNeed <= weeksLeft * 0.8 ? ["✅ 현실적인 목표", "#16a34a"] : wkNeed <= weeksLeft * 1.3 ? ["💪 도전적인 목표", "#ea580c"] : ["⚠️ 기간에 비해 무리한 목표", "#dc2626"];
        lines.push(`<b style="color:${verdict[1]}">${verdict[0]}</b> — VDOT ${diff > 0 ? "+" : ""}${diff.toFixed(1)} 필요, 보통 ${wkNeed || 0}주 걸려요${weeksLeft ? ` (대회까지 ${weeksLeft}주)` : ""}.`);
        if (diff > 0) lines.push(`계획은 지금 기록(VDOT ${now.toFixed(1)}) 페이스로 시작해서 <b>4주마다 VDOT +${step}</b>씩 올려 목표 페이스에 다가가요. 처음부터 목표 페이스로 훈련하면 부상·과훈련 위험이 커요.`);
        if (verdict[0].includes("무리")) lines.push(`추천: 이번 대회 목표를 ${(() => { const v = Math.min(need, now + step * Math.floor((weeksLeft || 4) / 4)); return TS.E.fmt(Math.round(E.predict(v, D))); })()} 정도로 잡고, 다음 시즌에 ${g0.goal.time}에 도전해요.`);
      }
      return `<div class="goal-an">${lines.map((l) => `<div>${l}</div>`).join("")}</div>`;
    }
    function draw() {
      const up = g0.races.map((r, i) => [r, i]).filter(([r]) => !r.date || r.date >= today);
      d.innerHTML = `<div style="padding:18px;display:grid;gap:14px;max-height:88vh;overflow:auto">
        <div class="spread"><b style="font-size:17px">🎯 목표부터 정해요</b><button type="button" class="link" data-g="x" style="font-size:20px">✕</button></div>
        <p class="hint" style="margin:0">목표 대회·거리·기록에 맞춰 훈련 페이스와 훈련 종류를 정확하게 짜요.</p>
        <div><div class="eyebrow" style="margin:0 0 6px">1. 어떤 대회를 앞두고 있나요?</div>
          <div class="chips">${up.map(([r, i]) => `<button type="button" class="chip${raceSel === i ? " on" : ""}" data-race="${i}">🏁 ${esc(r.name || r.event || "대회")}${r.date ? ` · ${r.date.slice(5).replace("-", "/")}` : ""}</button>`).join("")}
            <button type="button" class="chip${raceSel === -1 ? " on" : ""}" data-race="-1">아직 없음</button><button type="button" class="chip" data-race="new">+ 대회 추가</button></div>
          ${raceSel === -2 ? `<div class="fields mt" style="grid-template-columns:1fr 1fr"><label>대회 이름<input id="gRaceName" placeholder="예: 춘천마라톤" /></label><label>날짜<input id="gRaceDate" type="date" min="${today}" /></label></div>` : ""}</div>
        <div><div class="eyebrow" style="margin:0 0 6px">2. 어떤 거리를 가장 잘하고 싶나요?</div>
          <div class="chips">${goals.map(([k, n]) => `<button type="button" class="chip${ev === k ? " on" : ""}" data-ev="${k}">${esc(n)}</button>`).join("")}</div></div>
        <div class="fields" style="grid-template-columns:1fr 1fr">
          ${sk === "run" ? `<label>3. 이 거리 최고기록<input id="gPr" inputmode="decimal" data-time="1" placeholder="${ev === "full" ? "3:45:00" : ev === "half" ? "1:45:00" : ev === "10K" ? "48:00" : "23:00"}" value="${esc(prOf())}" /></label>` : ""}
          <label>${sk === "run" ? "4" : "3"}. 목표 기록<input id="gTime" inputmode="decimal" data-time="1" placeholder="${ev === "full" ? "3:30:00" : ev === "half" ? "1:39:00" : ev === "10K" ? "45:00" : "21:30"}" value="${esc(g0.goal.time || "")}" /></label></div>
        <div id="gAn">${analysis()}</div>
        <div class="actions"><div class="right"><button type="button" data-g="x">나중에</button><button type="button" class="primary" data-g="save">이 목표로 계획 만들기</button></div></div>
      </div>`;
      d.querySelectorAll('[data-g="x"]').forEach((b) => { b.onclick = () => { d.close(); if (after) after(); }; });
      d.querySelectorAll("[data-race]").forEach((b) => { b.onclick = () => { raceSel = b.dataset.race === "new" ? -2 : +b.dataset.race; const r = g0.races[raceSel]; if (r) { const k = E.GOALS[sk].find((x) => new RegExp(x[0] === "half" ? "half|하프" : x[0] === "full" ? "full|풀|마라톤" : x[0], "i").test(`${r.event} ${r.name}`)); if (k) ev = k[0]; } draw(); }; });
      d.querySelectorAll("[data-ev]").forEach((b) => { b.onclick = () => { ev = b.dataset.ev; draw(); }; });
      d.querySelectorAll("[data-time]").forEach((inp) => { inp.oninput = () => {
        const f = E.autoTime(inp.value); if (f !== inp.value) inp.value = f;
        if (inp.id === "gPr" && PR_KEY[ev]) g0.records[PR_KEY[ev]] = Object.assign({}, g0.records[PR_KEY[ev]], { pr: inp.value });
        if (inp.id === "gTime") g0.goal.time = inp.value;
        $("gAn").innerHTML = analysis();
      }; });
      d.querySelector('[data-g="save"]').onclick = async (e) => {
        e.target.disabled = true;
        g0.goal.event = ev;
        if (raceSel === -2) {
          const nm = (d.querySelector("#gRaceName") || {}).value || "", dt = (d.querySelector("#gRaceDate") || {}).value || "";
          if (nm || dt) g0.races.push({ name: nm, date: dt, event: ev, priority: "A" });
        } else if (raceSel >= 0 && g0.races[raceSel]) { g0.races[raceSel].priority = "A"; if (!g0.races[raceSel].event) g0.races[raceSel].event = ev; }
        g0.goalSetAt = new Date().toISOString();
        g0.bySport = g0.bySport || {};
        if (g0.sport) g0.bySport[g0.sport] = pickSport(g0);
        await saveProfile(g0);
        setProfile(g0);
        d.close();
        if (after) after();
      };
    }
    draw();
    if (!d.open) d.showModal();
  }
  function openPlan(force) {
    if (!profile) { openWizard(0); return; }
    // 계획을 보여주기 전에: 어떤 대회·거리를 목표로, 목표 기록·현재 최고기록이 얼마인지 먼저 확인
    if (!profile.goalSetAt && force !== true) { openGoal(() => openPlan(true)); return; }
    variants = makeVariants(profile);
    vSel = 0;
    plan = variants[0].plan;
    renderPlan();
    $("planOv").classList.add("show");
    $("planOv").scrollTop = 0;
    document.body.style.overflow = "hidden";
  }
  function closePlan() { $("planOv").classList.remove("show"); document.body.style.overflow = ""; }
  const dlabel = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  const zb = (lvl, tag) => `<span class="zb" style="background:${LV_COLOR[lvl - 1]};color:${LV_FG(lvl)}">${esc(tag)}</span>`;

  const rangeTxt = (s) => (s.range && s.range[1] > s.range[0] ? `${s.range[0]}~${s.range[1]}분` : `${s.minutes}분`);
  // 구성 한 줄 → [구간 | 내용 | 시간·거리]  예) "워밍업: E 페이스 15분 + 스트라이드" → 워밍업 | … | 15분
  function stepParts(t) {
    let m = /^([^:：]{1,14})[:：]\s*(.+)$/.exec(t);
    // "워밍업:", "메인:", "자전거 65분:" 같은 구간 이름만 왼쪽 칸으로 (세트 설명은 본문에)
    if (m && /\d/.test(m[1]) && !/^(자전거|달리기|수영|메인)/.test(m[1])) m = null; // "메인 1:"·"메인 2:"는 이름 칸으로
    const label = m ? m[1].trim() : /드릴/.test(t) ? "드릴" : /T2|전환/.test(t) ? "전환" : /쿨다운/.test(t) ? "쿨다운" : /워밍업/.test(t) ? "워밍업" : /^(야외라면|언덕은|오르내림|끝나고|마지막에|중간에|보급)/.test(t) ? "팁" : "메인";
    const body = m ? m[2] : t;
    const chips = [];
    let rep = /(\d+(?:\.\d+)?)\s?(km|m)\s*×\s*(\d+)/.exec(body);
    const rep2 = /(\d+)\s*×\s*(\d+(?:\.\d+)?)\s?(km|m)\b/.exec(body); // "7 × 100m" 순서
    if (!rep && rep2) rep = [rep2[0], rep2[2], rep2[3], rep2[1]];
    if (rep) {
      const tot = +rep[1] * +rep[3];
      chips.push(rep[2] === "km" ? `${Math.round(tot * 10) / 10}km` : tot >= 1000 ? `${(tot / 1000).toFixed(1)}km` : `${tot}m`);
    } else {
      const d = /(\d+(?:\.\d+)?)\s?km(?![/a-z])/.exec(body) || /(\d{3,5})m(?![a-z/])/.exec(body);
      if (d) chips.push(d[0].replace(/\s/g, ""));
    }
    const repT = /(\d+)분\s*×\s*(\d+)/.exec(body);
    if (repT) chips.push(`${+repT[1] * +repT[2]}분`);
    else { const tm = /(\d+)분/.exec(body); if (tm && !/마지막|처음/.test(body.slice(0, tm.index))) chips.push(`${tm[1]}분`); }
    return { label, body, chips };
  }
  function stepTable(steps) {
    return `<div class="steps">${steps.map((x) => {
      const p = stepParts(x);
      const cls = /워밍업/.test(p.label) ? "wu" : /쿨다운/.test(p.label) ? "cd" : /드릴|스컬링/.test(p.label) ? "dr" : /이지|팁/.test(p.label) ? "ez" : "main";
      return `<div class="step ${cls}"><span class="st-l">${esc(p.label)}</span><span class="st-b">${esc(p.body)}</span><span class="st-c">${p.chips.map((c) => `<b>${esc(c)}</b>`).join("")}</span></div>`;
    }).join("")}</div>`;
  }
  TS.stepTable = stepTable;
  TS.openLevel = () => openLevel();
  function sessionCard(s, start) {
    const date = addDays(start, s.day);
    const zoneTxt = { 1: "회복", 2: "쉬움", 3: "보통", 4: "강함", 5: "아주 강함" }[s.lvl] || "";
    return `<div class="card sess" style="border-left-color:${LV_COLOR[s.lvl - 1]}">
      <div class="hd"><b>${DAY[s.day]} ${dlabel(date)} · ${esc(s.title)}</b>${zb(s.lvl, `Z${s.lvl} ${s.tag}`)}</div>
      <div class="tiles">
        <div><span>거리</span><b>${s.dist ? esc(s.dist.replace(/(수영|자전거|달리기)\s*/g, "").replace(/\s*\(.*?\)/g, "")) : "-"}</b></div>
        <div><span>시간</span><b>${s.minutes ? rangeTxt(s) : "-"}</b></div>
        <div><span>강도</span><b style="color:${s.lvl === 3 ? "#a16207" : LV_COLOR[s.lvl - 1]}">Z${s.lvl} ${zoneTxt}</b></div>
        <div><span>힘든 정도</span><b>RPE ${s.rpe}</b></div>
      </div>
      ${window.ZONE && s.type !== "Race" ? window.ZONE.guideLine(s.lvl) : ""}
      ${s.hiText && window.ZONE ? window.ZONE.mixBar(s.hiText, "이 훈련 강도 구성") : ""}
      <div class="lbl">구성</div>${stepTable(s.steps)}
      ${s.steps.some((t) => /드릴/.test(t)) ? `<button type="button" class="pill drill-btn" data-drills="${s.disc === "brick" ? "bike" : s.disc}" data-focus="${esc(s.drill || "")}">📖 드릴 가이드${s.drill ? ` · 이번 주 '${esc(s.drill)}'` : ""}</button>` : ""}
      ${s.alt ? `<div class="alt-box"><div class="alt-h">✅ 추천: <b>${esc(s.name)}</b> <span class="hint">— ${esc(s.recWhy || "이번 시기 목적에 가장 잘 맞아요")}</span></div><details><summary>🔁 대안: <b>${esc(s.alt.name)}</b> <span class="hint">— ${esc(s.alt.why)}</span></summary>${stepTable(s.alt.steps)}<div class="txt" style="margin-top:6px">${esc(s.alt.point || "")}</div></details></div>` : ""}
      ${s.targets.length ? `<div class="lbl">강도 목표</div><ul class="tg">${s.targets.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      <details class="why"><summary>설명 보기 — 포인트 · 효과</summary>
        <div class="lbl">훈련 포인트</div><div class="txt">${esc(s.point)}</div>
        ${s.effect ? `<div class="lbl">효과</div><div class="txt">${esc(s.effect)}</div>` : ""}
        ${s.range && s.range[1] > s.range[0] && s.type !== "Race" ? `<div class="hint mt">⏱ 기본 ${s.range[0]}분, 여유가 있으면 ${s.disc === "swim" ? "지구력 수영으로" : s.disc === "bike" ? "Z2로" : "E 조깅으로"} ${s.range[1]}분까지 늘려도 좋아요</div>` : ""}
        ${s.envNotes.map((x) => `<div class="hint mt">📍 ${esc(x)}</div>`).join("")}
      </details>
    </div>`;
  }
  // 계획 화면에서 바로 강도 비율 바꾸기 → '적용'하면 계획·달력이 새 비율로 바뀌어요
  let ratioDraft = null;
  function ratioCtl(W) {
    const cur = (W && W.lowTarget) || 80, v = ratioDraft || cur;
    return `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line)">
      <div class="spread"><b style="font-size:14px">⚖️ 강도 비율 조절</b><span id="ratioVal" style="font-size:14px">저강도 <b>${v}</b> : 고강도 <b>${100 - v}</b></span></div>
      <input type="range" id="ratioRange" min="50" max="95" step="5" value="${v}" style="width:100%;margin:10px 0 6px;accent-color:var(--accent)" />
      <div class="chips">${[90, 85, 80, 75, 70].map((x) => `<button type="button" class="chip${x === v ? " on" : ""}" data-ratio="${x}">${x}:${100 - x}${x === 80 ? " 추천" : ""}</button>`).join("")}</div>
      <button type="button" class="primary" data-ratioapply="1" style="width:100%;padding:12px;border-radius:12px;margin-top:10px" ${v === cur ? "disabled" : ""}>${v === cur ? `지금 비율 ${cur}:${100 - cur}` : `✓ ${v}:${100 - v}로 적용하고 스케줄 바꾸기`}</button>
    </div>`;
  }
  async function applyRatio(btn) {
    const v = ratioDraft;
    if (!v || !profile) return;
    btn.disabled = true;
    const p = clone(profile);
    p.lowPct = String(v);
    p.bySport = p.bySport || {};
    if (p.sport) p.bySport[p.sport] = Object.assign({}, p.bySport[p.sport] || pickSport(p), { lowPct: String(v) });
    await saveProfile(p);
    setProfile(p);
    ratioDraft = null;
    variants = makeVariants(profile);
    plan = variants[Math.min(vSel, variants.length - 1)].plan;
    renderPlan();
    const W = plan.week(weekIdx);
    if (await TS.ask(`강도 비율을 ${v}:${100 - v}로 바꿨어요.\n이번 계획: 저강도 ${W.lowPct}% · 고강도 ${100 - W.lowPct}%\n\n달력의 ${weekIdx + 1}주차부터 4주 일정도 새 계획으로 바꿀까요?`, "달력도 바꾸기", "계획만 보기")) {
      const b = $("planBody").querySelector(`[data-add="${weekIdx}:4"]`) || btn;
      addToCalendar(weekIdx, 4, b, true);
    }
  }
  function distBar(low, W) {
    const tg = (W && W.lowTarget) || 80;
    const easyWk = W && (W.recovery || W.key === "trans" || (W.comeback && W.comeback.easy));
    const tapWk = W && ["taper", "race"].includes(W.key);
    const ok = Math.abs(low - tg) <= 2;
    // 왜 설정한 비율과 다른지 꼭 설명해요
    const why = [];
    if (plan && plan.ctx && plan.ctx.phil === "maf") why.push("💚 지금 훈련 방식이 MAF(심박 낮게 유지)라 기초기에는 저강도 100%로 짜요. 80:20으로 하려면 아래 ‘80/20으로 바꾸기’를 누르세요");
    if (tapWk) why.push(`🏁 조정기라 운동량은 줄이고(평소의 50~90%) 고강도는 ${100 - tg}%만 넣었어요 — 레이스 페이스 감각은 유지하고 피로는 빼는 시기예요`);
    else if (W && W.levelCap && plan && plan.level) why.push(`🏅 레벨 ${plan.level.lv}(${plan.level.name})이라 고강도를 최대 ${100 - tg}%까지만 넣었어요 (설정 ${W.userLow}:${100 - W.userLow}). 몸이 적응해 레벨이 오르면 설정한 비율에 가까워져요`);
    if (W && W.comeback) why.push(`🔄 복귀 ${W.comeback.k}/${W.comeback.n}주차라 ${W.comeback.easy ? "강한 훈련 없이" : "가벼운 질 훈련 1회만"} 넣었어요`);
    const msg = ok ? `✓ 이번 주 목표 비율(${tg}:${100 - tg})에 맞췄어요`
      : low > tg ? (easyWk ? (W.recovery ? "회복 주라 쉬운 강도로만 짰어요 — 쌓인 피로를 빼고 다음 주에 다시 비율대로 해요" : "전환기·복귀 초기라 쉬운 강도로만 짰어요") : "거리 목표가 없는 종목은 시간 기준이라 조금 차이가 날 수 있어요")
      : `고강도 비중이 목표(${100 - tg}%)보다 높은 주예요 — 쉬운 날은 꼭 쉽게`;
    const fv = (x, v) => (x === "swim" ? `${(Math.round(v / 50) * 50).toLocaleString()}m` : `${Math.round(v * 10) / 10}km`);
    const rows = W && W.ratio ? Object.entries(W.ratio).map(([x, r]) => `<div class="ratio-row"><span>${E.DISC[x].icon} ${E.DISC[x].name} ${fv(x, r.total)}</span>
        <span><b style="color:#16a34a">저강도 ${fv(x, r.total - r.hi)}</b> · <b style="color:#ea580c">고강도 ${fv(x, r.hi)}</b> <span class="hint">(질 훈련 ${r.n}회에 나눠서)</span></span></div>`).join("") : "";
    return `<div class="spread" style="font-size:13px;margin-bottom:4px"><span>저강도 <b>${low}%</b></span><span class="hint">목표 ${tg} : ${100 - tg}${W && W.byDist ? " · 거리 기준" : " · 시간 기준"}</span><span>중·고강도 <b>${100 - low}%</b></span></div>
      <div class="progress" style="height:10px;background:#fde68a;position:relative"><i style="width:${low}%;background:linear-gradient(90deg,#16a34a,#4ade80)"></i>
        <span style="position:absolute;left:${tg}%;top:-3px;bottom:-3px;width:2px;background:#0f172a" title="목표"></span></div>
      ${rows ? `<div class="ratio-box">${rows}</div>` : ""}
      <p class="hint" style="margin:6px 0 0">${msg}</p>${why.map((w) => `<p class="note" style="margin:6px 0 0;font-size:13px">${esc(w)}</p>`).join("")}${plan && plan.ctx && plan.ctx.phil === "maf" ? `<button type="button" class="primary pill" data-setphil="polarized" style="margin-top:6px">80/20으로 바꾸기</button>` : ""}`;
  }

  function renderWeekTab() {
    const W = plan.week(weekIdx);
    const end = addDays(W.start, 6);
    return `<div class="weeknav">
        <button type="button" class="icon" data-wk="-1" ${weekIdx === 0 ? "disabled" : ""}>‹</button>
        <div class="range">${weekIdx + 1}주차 · ${dlabel(W.start)}–${dlabel(end)}</div>
        <button type="button" class="icon" data-wk="1" ${weekIdx >= 51 ? "disabled" : ""}>›</button></div>
      <div class="card">
        <div class="spread"><span><span class="zb" style="background:${W.phase.color};color:#0f172a">${esc(W.phase.name)}</span>
          ${W.recovery ? '<span class="zb" style="background:#94a3b8">회복 주</span>' : ""}${W.races.length ? '<span class="zb z5">대회</span>' : ""}</span>
          <b>${minLabel(W.total)}</b></div>
        <p class="hint">${esc(W.phase.desc)} · 이번 주 집중: <b>${esc(W.phase.focus)}</b></p>
        ${distBar(W.lowPct, W)}
        ${profile.holdSync ? `<div class="note" style="margin:10px 0 0">🏁 새 대회 일정이 아직 달력에 반영되지 않았어요. <button type="button" class="pill" data-syncnow="1">지금 반영</button></div>` : ""}
        ${ratioCtl(W)}
        ${W.tss && plan.pmc ? (() => { const pw = plan.pmc(weekIdx + 1).weeks[weekIdx]; return `<p class="hint" style="margin:10px 0 0">📈 이번 주 훈련 부하 약 <b>${W.tss} TSS</b> · 주말 예상 체력 CTL <b>${Math.round(pw.ctl)}</b> (${pw.ramp >= 0 ? "+" : ""}${pw.ramp.toFixed(1)}) · 컨디션 TSB <b>${pw.tsb >= 0 ? "+" : ""}${Math.round(pw.tsb)}</b> <span>— 연간 탭에 그래프가 있어요</span></p>`; })() : ""}
      </div>
      ${plan.level && weekIdx === 0 ? `<div class="card">${levelCard(plan.level)}</div>` : ""}
      ${W.prep && W.prep.advice ? W.prep.advice.map((a) => `<div class="prep-box"><b>${esc(a.title)}</b><span class="zb" style="background:#ef4444;margin-left:6px">${esc(a.stage)}</span><ul>${a.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div>`).join("") : ""}
      ${(() => { const nt = plan.intensityNote(weekIdx); return `<div class="note" style="margin:0 0 12px;${nt.level === "high" ? "background:#fff1e6" : ""}">${nt.level === "high" ? "🔥" : "🌱"} ${esc(nt.text)}</div>`; })()}
      ${W.notes.length ? `<div class="card"><h3>📏 이번 주 강도·양 기준</h3><ul style="margin:0;padding-left:18px;line-height:1.7;font-size:14px">${W.notes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
      <div class="plan-actions">
        <button type="button" class="primary" data-add="${weekIdx}:1">📅 이 주를 달력에 넣기</button>
        <button type="button" data-add="${weekIdx}:4">4주 한꺼번에 넣기</button></div>
      ${W.sessions.map((s) => sessionCard(s, W.start)).join("") || '<p class="hint">훈련 요일이 없어요.</p>'}`;
  }

  function renderMonthTab() {
    const weeks = [0, 1, 2, 3].map((k) => monthIdx + k).filter((i) => i < 52).map((i) => plan.week(i));
    const s = weeks[0].start, e = addDays(weeks[weeks.length - 1].start, 6);
    const tot = weeks.reduce((a, w) => a + w.total, 0);
    return `<div class="weeknav">
        <button type="button" class="icon" data-mo="-4" ${monthIdx === 0 ? "disabled" : ""}>‹</button>
        <div class="range">${monthIdx + 1}~${monthIdx + weeks.length}주차 · ${dlabel(s)}–${dlabel(e)}</div>
        <button type="button" class="icon" data-mo="4" ${monthIdx + 4 >= 52 ? "disabled" : ""}>›</button></div>
      <div class="card"><div class="spread"><b>4주 블록</b><span class="hint">총 ${minLabel(tot)}</span></div>
        <p class="hint" style="margin-bottom:0">3주 동안 양을 조금씩 늘리고(적응 → 발전 → 최대) 4주째에 줄여서 회복해요 (3:1 주기). 회복 주에는 기준점 테스트를 넣어 존을 업데이트해요.</p>
        <div class="bars" style="height:90px">${weeks.map((w) => `<div class="b"><i style="height:${Math.max(6, (w.total / Math.max(...weeks.map((x) => x.total), 1)) * 100)}%;background:${w.recovery ? "#94a3b8" : w.phase.color}"></i><span>${w.i + 1}주</span></div>`).join("")}</div></div>
      ${weeks.map((w) => `<div class="card" data-goweek="${w.i}" style="cursor:pointer">
        <div class="spread"><b>${w.i + 1}주차 · ${dlabel(w.start)}~</b><span class="hint">${minLabel(w.total)} · 저강도 ${w.lowPct}%</span></div>
        <div class="row" style="margin:6px 0 8px"><span class="zb" style="background:${w.phase.color};color:#0f172a">${esc(w.phase.name)}</span>${w.recovery ? '<span class="zb" style="background:#94a3b8">회복·테스트</span>' : ""}${w.races.map((r) => `<span class="zb z5">🏁 ${esc(r.name)}</span>`).join("")}</div>
        ${w.sessions.map((x) => `<div class="pr-row" style="align-items:center"><span>${DAY[x.day]} · ${esc(x.title)}</span><span class="row">${zb(x.lvl, `Z${x.lvl} ${x.tag}`)}<span class="hint">${x.minutes ? rangeTxt(x) : ""}</span></span></div>`).join("")}
        <p class="hint" style="margin:6px 0 0">눌러서 자세히 보기 ›</p></div>`).join("")}
      <div class="plan-actions"><button type="button" class="primary" data-add="${monthIdx}:4">📅 이 4주를 달력에 넣기</button></div>`;
  }

  // 🗓️ 3개월(13주) 스케줄 — 주간·월간과 연간 사이
  function renderQuarterTab() {
    const first = qIdx * 13, all = [];
    for (let i = first; i < Math.min(52, first + 13); i++) all.push(plan.week(i));
    const s = all[0].start, e = addDays(all[all.length - 1].start, 6);
    const totMin = all.reduce((a, w) => a + w.total, 0), maxT = Math.max(...all.map((w) => w.total), 1);
    const fv = (x, v) => (x === "swim" ? `${(Math.round(v / 100) * 100).toLocaleString()}m` : `${Math.round(v)}km`);
    const disc = {}; // 종목별 3개월 거리 · 저강도/고강도
    all.forEach((w) => Object.entries(w.ratio || {}).forEach(([x, r]) => { const d = disc[x] = disc[x] || { total: 0, hi: 0 }; d.total += r.total; d.hi += r.hi; }));
    const lowAvg = Math.round(all.reduce((a, w) => a + w.lowPct * w.total, 0) / Math.max(1, totMin));
    const tg = all[0].lowTarget || 80;
    const trn = all.filter((w) => !w.recovery && !["trans", "taper", "race", "prep"].includes(w.key) && !w.races.length);
    const lowTrn = trn.length ? Math.round(trn.reduce((a, w) => a + w.lowPct * w.total, 0) / Math.max(1, trn.reduce((a, w) => a + w.total, 0))) : null;
    const hard = [];
    all.forEach((w) => w.sessions.forEach((x) => { if (x.lvl >= 4 && !["Race", "Test", "Opener"].includes(x.type)) hard.push({ w, x, key: `${x.name}|${(x.steps || []).filter((t) => !/워밍업|쿨다운/.test(t)).join("/")}` }); }));
    const uniq = new Set(hard.map((h) => h.key)).size;
    const types = new Set(); all.forEach((w) => w.sessions.forEach((x) => types.add(`${x.disc}|${x.name}`)));
    const segs = []; all.forEach((w) => { const l = segs[segs.length - 1]; if (l && l.key === w.key) l.ws.push(w); else segs.push({ key: w.key, phase: w.phase, ws: [w] }); });
    const races = all.flatMap((w) => w.races.map((r) => ({ r, w })));
    const months = [all.slice(0, 4), all.slice(4, 8), all.slice(8)].filter((m) => m.length);
    const prog = (m) => {
      const a = m[0], b = m[m.length - 1], out = [];
      if (a.vdotWeek && b.vdotWeek && Math.abs(b.vdotWeek - a.vdotWeek) >= 0.1) out.push(`달리기 페이스 기준 ${a.vdotWeek.toFixed(1)} → ${b.vdotWeek.toFixed(1)}`);
      out.push(`주 평균 ${minLabel(Math.round(m.reduce((x, w) => x + w.total, 0) / m.length))}`);
      out.push(`강한 훈련 ${m.reduce((x, w) => x + w.sessions.filter((t) => t.lvl >= 4 && t.type !== "Race").length, 0)}회`);
      return out.join(" · ");
    };
    const mGoal = (m) => {
      const ks = [...new Set(m.map((w) => w.phase.name))], ph = m[Math.floor(m.length / 2)].phase;
      const rc = m.some((w) => w.races.length) ? " · 🏁 대회 있음" : m.some((w) => w.key === "taper") ? " · 조정기" : "";
      return `<b>${esc(ks.join(" → "))}</b>${rc}<br><span class="hint">중점: ${esc(ph.focus || "")}</span>`;
    };
    const mainOf = (x) => { const st = x.steps || []; const mn = st.find((t) => /^메인/.test(t)) || st.find((t) => !/워밍업|쿨다운|스컬링|드릴|장비|쉬운 강도|^이지|^킥|^풀|^합계|^IM|^기술/.test(t)); return mn ? ` — ${esc(mn.replace(/^[^:]+:\s*/, "").slice(0, 70))}` : ""; };
    return `<div class="weeknav">
        <button type="button" class="icon" data-q="-1" ${qIdx === 0 ? "disabled" : ""}>‹</button>
        <div class="range">${qIdx + 1}분기 · ${first + 1}~${first + all.length}주차 · ${dlabel(s)}–${dlabel(e)}</div>
        <button type="button" class="icon" data-q="1" ${qIdx >= 3 ? "disabled" : ""}>›</button></div>
      <div class="card"><div class="spread"><b>3개월 한눈에</b><span class="hint">총 ${minLabel(totMin)} · ${all.length}주</span></div>
        <div style="display:flex;height:18px;border-radius:8px;overflow:hidden;margin:10px 0 4px">${segs.map((g) => `<div title="${esc(g.phase.name)}" style="flex:${g.ws.length};background:${g.phase.color}"></div>`).join("")}</div>
        <div class="row" style="flex-wrap:wrap;gap:4px;margin-bottom:8px">${segs.map((g) => `<span class="zb" style="background:${g.phase.color};color:#0f172a">${esc(g.phase.name)} ${g.ws.length}주</span>`).join("")}</div>
        <div class="bars" style="height:80px;gap:3px">${all.map((w) => `<div class="b" data-goweek="${w.i}" style="cursor:pointer"><i style="height:${Math.max(6, (w.total / maxT) * 100)}%;background:${w.races.length ? "#ef4444" : w.recovery ? "#94a3b8" : w.phase.color}"></i><span>${w.i + 1}</span></div>`).join("")}</div>
        <p class="hint" style="margin:4px 0 10px">막대 = 주간 훈련 시간 · 빨강 = 대회 · 회색 = 회복 주 (누르면 그 주로)</p>
        <div class="spread" style="font-size:13px"><span>3개월 저강도 <b>${lowAvg}%</b> : 고강도 <b>${100 - lowAvg}%</b></span><span class="hint">목표 ${tg}:${100 - tg}</span></div>
        ${lowTrn != null && lowTrn !== lowAvg ? `<p class="hint" style="margin:2px 0 0">훈련 주(${trn.length}주)만 보면 저강도 <b>${lowTrn}%</b> : 고강도 <b>${100 - lowTrn}%</b> — 회복·대회·전환 주는 쉬운 강도만 해서 전체 평균이 조금 높아요</p>` : ""}
        <div class="progress" style="height:8px;background:#fde68a;position:relative;margin:4px 0 8px"><i style="width:${lowAvg}%;background:linear-gradient(90deg,#16a34a,#4ade80)"></i><span style="position:absolute;left:${tg}%;top:-3px;bottom:-3px;width:2px;background:#0f172a"></span></div>
        ${Object.keys(disc).length ? `<div class="ratio-box">${Object.entries(disc).map(([x, d]) => `<div class="ratio-row"><span>${E.DISC[x].icon} ${E.DISC[x].name} ${fv(x, d.total)}</span><span><b style="color:#16a34a">저강도 ${fv(x, d.total - d.hi)}</b> · <b style="color:#ea580c">고강도 ${fv(x, d.hi)}</b> <span class="hint">(${Math.round((d.hi / Math.max(1, d.total)) * 100)}%)</span></span></div>`).join("")}</div>` : ""}
        <p class="hint" style="margin:8px 0 0">🔄 훈련 종류 ${types.size}가지 · 강한 훈련(Z4·Z5) ${hard.length}개 중 <b>${uniq}개 서로 다름</b>${races.length ? ` · 🏁 ${races.map((o) => `${esc(o.r.name || o.r.event || "대회")}(${o.w.i + 1}주차)`).join(", ")}` : ""}</p></div>
      ${months.map((m, mi) => `<div class="card"><div class="spread"><h3 style="margin:0">${mi + 1}개월째 <span class="hint">${m[0].i + 1}~${m[m.length - 1].i + 1}주차</span></h3><span class="hint">${minLabel(m.reduce((a, w) => a + w.total, 0))}</span></div>
        <p style="margin:6px 0;font-size:14px;line-height:1.6">${mGoal(m)}</p><p class="hint" style="margin:0 0 8px">📈 ${prog(m)}</p>
        ${m.map((w) => {
          const hs = w.sessions.filter((x) => x.lvl >= 4 && x.type !== "Race");
          const km = Object.entries(w.ratio || {}).map(([x, r]) => `${E.DISC[x].icon}${fv(x, r.total)}`).join(" ");
          return `<div class="q-wk" data-goweek="${w.i}">
            <div class="spread"><b>${w.i + 1}주 · ${dlabel(w.start)}~</b><span class="hint">${minLabel(w.total)}${km ? " · " + km : ""}</span></div>
            <div class="row" style="flex-wrap:wrap;gap:4px;margin:4px 0"><span class="zb" style="background:${w.phase.color};color:#0f172a">${esc(w.phase.name)}</span>${w.recovery ? '<span class="zb" style="background:#94a3b8">회복·테스트</span>' : ""}${w.key === "taper" ? '<span class="zb" style="background:#f59e0b">조정기</span>' : ""}${w.races.map((r) => `<span class="zb z5">🏁 ${esc(r.name || r.event || "대회")}</span>`).join("")}<span class="hint">저강도 ${w.lowPct}%</span></div>
            ${w.sessions.map((x) => `<div class="q-ses${x.lvl >= 4 ? " hard" : ""}"><span class="q-d">${DAY[x.day]}</span>${zb(x.lvl, `Z${x.lvl}`)}<span class="q-t"><b>${esc(x.title.replace(/^.*?· /, ""))}</b> <span class="hint">${x.type === "Race" ? "🏁" : `${x.minutes ? x.minutes + "분" : ""}${x.dist ? " · " + esc(String(x.dist).replace(/(수영|자전거|달리기)\s*/g, "")) : ""}`}</span>${mainOf(x) ? `<br><span class="q-m">${mainOf(x).replace(/^ — /, "")}</span>` : ""}${(x.steps || []).some((t) => /^보강/.test(t)) ? ' <span class="hint">💪 보강</span>' : ""}</span></div>`).join("")}
          </div>`;
        }).join("")}</div>`).join("")}
      <div class="plan-actions"><button type="button" class="primary" data-add="${first}:${all.length}">📅 이 3개월을 달력에 넣기</button></div>`;
  }

  // 📈 체력·피로·컨디션 예상 그래프 (TrainingPeaks 퍼포먼스 매니지먼트 차트 · 앨런/코건 TSS 방식)
  function pmcCard() {
    if (!plan.pmc) return "";
    const P = plan.pmc(52), W = P.weeks;
    const maxV = Math.max(10, ...W.map((w) => Math.max(w.ctl, w.atl))), minT = Math.min(-30, ...W.map((w) => w.tsb)), maxT = Math.max(30, ...W.map((w) => w.tsb));
    const X = (i) => (i / (W.length - 1)) * 100, Y = (v) => 60 - (v / maxV) * 56, YT = (v) => 100 - ((v - minT) / (maxT - minT)) * 34;
    const line = (f, c, w = 1.6) => `<polyline fill="none" stroke="${c}" stroke-width="${w}" vector-effect="non-scaling-stroke" points="${W.map((x, i) => `${X(i).toFixed(2)},${f(x).toFixed(2)}`).join(" ")}" />`;
    const ramps = W.filter((w) => w.ramp > 7);
    const races = P.races.map((r) => { const ok = r.tsb >= 5 && r.tsb <= 30; return `<div class="pr-row"><span>🏁 ${esc(r.name)} <span class="hint">${r.week + 1}주차</span></span><span>체력 CTL <b>${Math.round(r.ctl)}</b> · 컨디션 TSB <b style="color:${ok ? "#16a34a" : "#ea580c"}">${r.tsb >= 0 ? "+" : ""}${Math.round(r.tsb)}</b> ${ok ? "✅" : r.tsb < 5 ? "⚠️ 피로가 남아요" : "⚠️ 너무 쉬었어요"}</span></div>`; }).join("");
    return `<div class="card"><div class="spread"><h3 style="margin:0">📈 체력·피로·컨디션 예상</h3><span class="hint">TSS 기준</span></div>
      <svg viewBox="0 0 100 104" preserveAspectRatio="none" style="width:100%;height:180px;margin-top:8px;background:var(--panel2,#f8fafc);border-radius:10px">
        <line x1="0" x2="100" y1="${YT(0)}" y2="${YT(0)}" stroke="#94a3b8" stroke-dasharray="1 1" stroke-width=".4" vector-effect="non-scaling-stroke" />
        ${P.races.map((r) => `<line x1="${X(r.week)}" x2="${X(r.week)}" y1="0" y2="104" stroke="#ef4444" stroke-width="1.2" vector-effect="non-scaling-stroke" opacity=".6" />`).join("")}
        ${line((w) => Y(w.atl), "#ec4899", 1.2)}${line((w) => Y(w.ctl), "#2563eb", 2.2)}${line((w) => YT(w.tsb), "#eab308", 1.6)}</svg>
      <div class="race-legend" style="margin-top:6px"><span><i style="background:#2563eb"></i>체력 CTL (42일 평균 부하)</span><span><i style="background:#ec4899"></i>피로 ATL (7일)</span><span><i style="background:#eab308"></i>컨디션 TSB = 체력 − 피로</span><span><i style="background:#ef4444"></i>대회</span></div>
      <p class="hint" style="margin:6px 0 0">체력은 천천히 오르고, 대회 전 조정기에 피로가 빠지면서 컨디션(TSB)이 플러스로 올라와요. A 대회 날 TSB +5~+25가 목표예요. 체력 상승(램프)은 주당 +5~7 이내가 안전해요.</p>
      ${races ? `<div style="margin-top:8px">${races}</div>` : ""}
      ${ramps.length ? `<div class="note" style="margin:8px 0 0">⚠️ ${ramps.map((w) => `${w.i + 1}주차`).slice(0, 4).join(", ")}에 체력이 주당 7 넘게 올라요 — 부상 위험이 있으니 컨디션을 잘 살펴보세요.</div>` : ""}</div>`;
  }
  // 💪 1년 동안의 강한 훈련(Z4·Z5) 목록 — 같은 구성이 다시 나오지 않는지 직접 확인할 수 있게
  function hardListCard(all) {
    const rows = [];
    all.forEach((w) => w.sessions.forEach((s) => {
      if (s.lvl < 4 || ["Race", "Test", "Opener"].includes(s.type)) return;
      const main = (s.steps || []).filter((t) => !/워밍업|쿨다운|스컬링|드릴|장비|쉬운 수영|^킥|^풀/.test(t)).join(" / ");
      rows.push({ w, s, main, key: `${s.name}|${(s.steps || []).filter((t) => !/워밍업|쿨다운/.test(t)).join("/")}` });
    }));
    if (!rows.length) return "";
    const uniq = new Set(rows.map((r) => r.key)).size;
    const blocks = [];
    rows.forEach((r) => { const b = Math.floor(r.w.i / 4); (blocks[b] = blocks[b] || []).push(r); });
    return `<div class="card"><div class="spread"><h3 style="margin:0">💪 1년 강한 훈련 (Z4·Z5)</h3><span class="zb" style="background:${uniq === rows.length ? "#16a34a" : "#f97316"}">${rows.length}개 중 ${uniq}개 서로 다름</span></div>
      <p class="hint" style="margin:6px 0 8px">4주 블록마다 묶었어요. 쉬운 훈련(Z2)은 같아도 괜찮지만, 강한 훈련은 1년 동안 같은 구성이 다시 나오지 않게 짜요.</p>
      ${blocks.map((bl, bi) => bl ? `<details class="sg" ${bi === 0 ? "open" : ""}><summary><b>블록 ${bi + 1}</b> <span class="hint">${bi * 4 + 1}~${bi * 4 + 4}주차 · ${dlabel(all[bi * 4].start)}~ · 강한 훈련 ${bl.length}개</span></summary>
        ${bl.map((r) => `<div class="pr-row" data-goweek="${r.w.i}" style="cursor:pointer;align-items:flex-start"><span><b>${r.w.i + 1}주 ${DAY[r.s.day]}</b> ${zb(r.s.lvl, `Z${r.s.lvl}`)} ${esc(r.s.title.replace(/^.*?· /, ""))}<br><span class="hint">${esc(r.main.slice(0, 120))}</span></span></div>`).join("")}</details>` : "").join("")}
    </div>`;
  }
  function renderYearTab() {
    const ss = plan.season;
    const all = ss.weeks.map((w) => plan.week(w.i));
    const segs = [];
    all.forEach((w) => { const l = segs[segs.length - 1]; if (l && l.key === w.key) l.n++; else segs.push({ key: w.key, phase: w.phase, n: 1, start: w.start, i: w.i }); });
    const totalH = all.reduce((a, w) => a + w.total, 0) / 60;
    const maxT = Math.max(...all.map((w) => w.total), 1);
    const raceTxt = ss.virtual ? "등록한 A 대회가 없어서 24주 뒤를 시즌 목표로 잡았어요." : `A 대회 ${esc(ss.A.name)} (${ss.A.date}) — ${ss.raceIdx + 1}주차`;
    return `<div class="card"><div class="spread"><b>52주 시즌 계획</b><span class="hint">총 약 ${Math.round(totalH)}시간</span></div>
        <p class="hint">${raceTxt}</p>
        <div style="display:flex;height:22px;border-radius:8px;overflow:hidden;margin:10px 0">${segs.map((s) => `<div title="${esc(s.phase.name)} ${s.n}주" style="flex:${s.n};background:${s.phase.color}"></div>`).join("")}</div>
        <div class="bars" style="height:70px;gap:1px;margin-top:6px">${all.map((w) => `<div class="b" data-goweek="${w.i}" style="cursor:pointer"><i style="height:${Math.max(4, (w.total / maxT) * 100)}%;background:${w.races.length ? "#ef4444" : w.recovery ? "#cbd5e1" : w.phase.color};border-radius:2px"></i></div>`).join("")}</div>
        <p class="hint">막대 = 주간 훈련 시간 · 빨강 = 대회 주 · 회색 = 회복 주 (막대를 누르면 그 주로 이동)</p></div>
      ${pmcCard()}
      ${hardListCard(all)}
      <div class="card"><h3>시즌 단계</h3>
        ${segs.map((s) => `<div class="pr-row" data-goweek="${s.i}" style="cursor:pointer;align-items:flex-start">
          <span><span class="zb" style="background:${s.phase.color};color:#0f172a">${esc(s.phase.name)}</span> <span class="hint">${s.n}주</span><br><span class="hint">${esc(s.phase.focus)}</span></span>
          <span class="hint" style="white-space:nowrap">${s.i + 1}주차 · ${dlabel(s.start)}~</span></div>`).join("")}</div>
      <div class="card"><h3>주별 한눈에 보기</h3><div class="zt-wrap"><table class="zt" style="min-width:420px">
        <tr><th>주</th><th>날짜</th><th>단계</th><th>시간</th><th>비고</th></tr>
        ${all.map((w) => `<tr data-goweek="${w.i}" style="cursor:pointer"><td>${w.i + 1}</td><td>${dlabel(w.start)}</td><td>${esc(w.phase.name)}</td><td>${minLabel(w.total)}</td>
          <td>${[w.recovery ? "회복·테스트" : "", ...w.races.map((r) => `🏁 ${r.priority} ${r.name}`), w.virtualRace ? "🏁 시즌 목표(가상)" : ""].filter(Boolean).map(esc).join(" · ")}</td></tr>`).join("")}
      </table></div></div>`;
  }

  function renderBasisTab() {
    const { ctx, gap } = plan;
    const g = ctx.goal, R = ctx.run, B = ctx.bike, S = ctx.swim, H = ctx.H;
    const ds = discsOf(profile.sport);
    const ph = E.PHIL[ctx.phil];
    let html = `<div class="card"><h3>🎯 목표: ${esc(g.name)}${g.timeText ? ` · ${esc(g.timeText)}` : ""}</h3>
        <div class="kv"><span>핵심 훈련</span><b>${esc(g.focus)}</b><span>레이스 강도</span><b>${esc(g.race)}</b>
        <span>권장 주간 시간</span><b>${g.hours[0]}~${g.hours[1]}시간 (지금 ${plan.availHours.toFixed(1)}시간)</b></div>
        ${plan.availHours < g.hours[0] ? `<div class="note">가능한 시간이 권장보다 적어요. 이 시간 안에서 핵심 훈련(질 훈련)과 롱 세션을 우선으로 짰어요. 시간을 늘릴 수 있으면 쉬운 날부터 늘리세요.</div>` : ""}
        ${gap ? `<div class="note">목표 페이스 <b>${fmt(gap.pace)}/km</b> · 필요 VDOT <b>${gap.need.toFixed(1)}</b>${gap.now ? ` · 지금 <b>${gap.now.toFixed(1)}</b>` : ""}</div>` : ""}
      </div>
      <div class="card"><h3>🧭 ${esc(ph.name)}</h3><p class="txt" style="margin:0">${esc(ph.desc)}</p></div>`;

    if (ds.includes("run")) {
      html += `<div class="card"><h3>🏃 달리기 — VDOT ${R ? `<b>${R.vdot.toFixed(1)}</b>` : ""}</h3>
        ${R ? `<p class="hint" style="margin-top:0">기준: ${esc(R.src)}</p>
          <div class="zt-wrap"><table class="zt" style="min-width:520px"><tr><th>페이스</th><th>속도</th><th>설명 · 한 주 상한</th><th>효과</th></tr>
          ${E.RUN_PACES.map(([k, n, lvl, d, eff]) => `<tr><td>${zb(lvl, k)} <b>${n}</b></td><td><b>${esc(E.runPaceText(R, k))}</b></td><td>${esc(d)}</td><td>${esc(eff)}</td></tr>`).join("")}</table></div>
          <p class="hint">예상 기록: ${Object.entries(R.pred).map(([k, v]) => `${k} ${fmt(v)}`).join(" · ")} — 4~6주마다 새 기록으로 다시 계산하세요.</p>`
          : `<p class="hint">1500m 이상 달리기 기록을 입력하면 VDOT와 E/M/T/I/R 페이스를 계산해요.</p>`}
        ${H.lthrRun ? `<h3 class="mt">❤️ 러닝 심박 (LTHR ${H.lthrRun}bpm ${H.runMeasured ? "측정" : "추정"})</h3>
          <div class="zt-wrap"><table class="zt" style="min-width:360px"><tr><th>존</th><th>심박(bpm)</th><th>% LTHR</th></tr>
          ${E.FRIEL_RUN.map((r, i) => `<tr><td><b>${r[0]}</b> ${r[1]}</td><td>${E.frielRange(E.FRIEL_RUN, H.lthrRun, i)}</td><td>${!r[2] ? `~${r[3]}%` : !r[3] ? `${r[2]}%+` : `${r[2]}–${r[3]}%`}</td></tr>`).join("")}</table></div>` : ""}
      </div>`;
    }
    if (ds.includes("bike")) {
      html += `<div class="card"><h3>🚴 자전거 — FTP ${B ? `<b>${B.ftp}W</b>${B.wkg ? ` (${B.wkg.toFixed(2)}W/kg)` : ""}` : ""}</h3>
        ${B ? `<p class="hint" style="margin-top:0">기준: ${esc(B.src)}</p><div class="zt-wrap"><table class="zt" style="min-width:460px"><tr><th>존</th><th>파워</th><th>% FTP</th><th>효과</th></tr>
          ${E.COGGAN.map(([z, n, lo, hi, lvl, eff]) => `<tr><td>${zb(lvl, z)} <b>${n}</b></td><td><b>${E.watt(B.ftp, lo, hi)}</b></td><td>${lo}${hi ? "–" + hi : "+"}%</td><td>${esc(eff)}</td></tr>`).join("")}</table></div>
          <p class="hint">스윗스팟: FTP 88~93% (${E.watt(B.ftp, 88, 93)})</p>` : `<p class="hint">FTP(또는 20분 테스트)를 입력하면 7개 파워 존을 계산해요.</p>`}
        ${H.lthrBike ? `<h3 class="mt">❤️ 사이클 심박 (LTHR ${H.lthrBike}bpm ${H.bikeMeasured ? "측정" : "추정"})</h3>
          <div class="zt-wrap"><table class="zt" style="min-width:360px"><tr><th>존</th><th>심박(bpm)</th><th>% LTHR</th></tr>
          ${E.FRIEL_BIKE.map((r, i) => `<tr><td><b>${r[0]}</b> ${r[1]}</td><td>${E.frielRange(E.FRIEL_BIKE, H.lthrBike, i)}</td><td>${!r[2] ? `~${r[3]}%` : !r[3] ? `${r[2]}%+` : `${r[2]}–${r[3]}%`}</td></tr>`).join("")}</table></div>` : ""}
      </div>`;
    }
    if (ds.includes("swim")) {
      html += `<div class="card"><h3>🏊 수영 — CSS ${S ? `<b>${fmt(S.css)}/100m</b>` : ""}</h3>
        ${S ? `<p class="hint" style="margin-top:0">기준: ${esc(S.src)}</p><div class="zt-wrap"><table class="zt" style="min-width:420px"><tr><th>구간</th><th>100m당</th><th>쓰임·효과</th></tr>
          ${E.SWIM_Z.map((z, i) => `<tr><td>${zb(z[3], z[0])}</td><td><b>${E.swimPace(S.css, i)}</b></td><td>${esc(z[4])}</td></tr>`).join("")}</table></div>`
          : `<p class="hint">CSS 테스트(400m·200m)를 입력하면 수영 페이스를 계산해요.</p>`}</div>`;
    }
    if (H.maf) html += `<div class="card"><h3>💚 MAF 심박</h3><p class="txt" style="margin:0">180 − 나이${num(profile.mafAdj) ? ` ${num(profile.mafAdj) > 0 ? "+" : "−"} ${Math.abs(num(profile.mafAdj))}` : ""} = <b>${H.maf}bpm</b> → 기초 훈련 범위 <b>${H.maf - 10}–${H.maf}bpm</b></p>
      <p class="hint">${ctx.phil === "maf" ? "MAF 방식이라 기초기에는 이 범위만 써요." : "참고용 — 쉬운 날 심박 상한으로 써도 좋아요."}</p></div>`;
    return html;
  }

  function renderPlan() {
    const p = profile, { ctx } = plan;
    const g = ctx.goal;
    const body = { week: renderWeekTab, month: renderMonthTab, quarter: renderQuarterTab, year: renderYearTab, basis: renderBasisTab }[planTab]();
    $("planBody").innerHTML = `
      <div class="wz-top"><h2 style="margin:0;flex:1">📋 내 훈련 계획</h2><button type="button" class="pill" data-home="1">🏠 홈</button><button type="button" id="planEdit">⚙️ 설정</button><button type="button" id="planClose">닫기</button></div>
      ${cloudOk ? "" : `<div class="note" style="margin:0 0 12px">⚠️ 프로필이 지금은 이 기기에만 저장됐어요. 로그인하고 인터넷이 연결되면 다른 기기에서도 보여요.</div>`}
      <div class="card"><div class="kv">
        <span>종목 · 목표</span><b>${SPORTS[p.sport].icon} ${esc(g.name)}${g.timeText ? ` · ${esc(g.timeText)}` : ""}</b>
        ${plan.feas ? `<span>목표 판단</span><b>VDOT ${plan.feas.now.toFixed(1)} → ${plan.feas.need.toFixed(1)} · 목표 페이스 ${fmt(plan.feas.pace)}/km · <span style="color:${plan.feas.verdict === "무리" ? "#dc2626" : plan.feas.verdict === "도전적" ? "#ea580c" : "#16a34a"}">${plan.feas.verdict}</span>${plan.feas.weeksLeft ? ` <span class="hint">(필요 약 ${plan.feas.weeksNeed}주 · 대회까지 ${plan.feas.weeksLeft}주)</span>` : ""}</b>` : ""}
        <span></span><b><button type="button" class="pill" data-goaledit="1">🎯 목표 바꾸기</button> <button type="button" class="pill" data-predict="1">🔮 기록 예측</button></b>
        <span>훈련 시간</span><b>주 ${(p.days || []).length}회 · 주 최대 ${plan.availHours.toFixed(1)}시간</b>
        ${discsOf(p.sport).includes("bike") ? `<span>자전거 타는 곳</span><b><span class="chips" style="display:inline-flex">${[["indoor", "🏠 실내"], ["outdoor", "🌳 야외"]].map(([k, l]) => `<button type="button" class="chip${((p.env || {}).bike || "outdoor") === k ? " on" : ""}" data-benv="${k}">${l}</button>`).join("")}</span> <span class="hint">실내면 8분 이내 페달링 드릴이 들어가요</span></b>` : ""}
        ${discsOf(p.sport).includes("run") ? `<span>달리는 곳</span><b><span class="chips" style="display:inline-flex">${[["indoor", "🏠 트레드밀"], ["outdoor", "🌳 야외"]].map(([k, l]) => `<button type="button" class="chip${((p.env || {}).run || "outdoor") === k ? " on" : ""}" data-renv="${k}">${l}</button>`).join("")}</span> <span class="hint">트레드밀이면 속도(km/h)·경사(%)로 알려 드려요</span></b>` : ""}
        ${plan.level ? `<span>레벨</span><b>레벨 ${plan.level.lv}/10 · ${plan.level.name}${plan.level.comeback ? " · 🔄 복귀 중" : ""} <button type="button" class="pill" data-lvtable="1">레벨 기준표</button></b>` : ""}
      </div>
      <div class="eyebrow mt">계획 2가지 — 골라서 보세요</div>
      <div class="vpick">${variants.map((v, i) => { const st = vStats(v); return `<button type="button" data-v="${i}" class="${vSel === i ? "on" : ""}">
          <span class="vt">${i === 0 ? "A안" : "B안"}${v.rec ? " ⭐ 추천" : ""}</span><span class="vn">${E.PHIL[v.key].name}</span>
          <span class="hint" style="font-size:12px;line-height:1.5;margin-top:4px">저강도 ${st.low}% : 고강도 ${100 - st.low}%<br>질 훈련 주 ${st.q}회${st.dbl ? ` (더블 ${st.dbl})` : ""} · ${minLabel(st.min)}</span></button>`; }).join("")}</div>
      ${vCompare()}
      <div class="note">${variants[vSel].rec ? "⭐ 추천 이유: " : ""}${esc(variants[vSel].why)}</div></div>
      <div class="seg">${[["week", "주간"], ["month", "월간"], ["quarter", "3개월"], ["year", "연간"], ["basis", "강도 기준"]].map(([k, l]) => `<button type="button" data-tab="${k}" class="${planTab === k ? "on" : ""}">${l}</button>`).join("")}</div>
      ${body}`;
    $("planClose").onclick = closePlan;
    $("planEdit").onclick = () => { closePlan(); openWizard(1); };
  }
  $("planBody").addEventListener("click", (e) => {
    const el = e.target.closest("[data-tab],[data-wk],[data-mo],[data-q],[data-goweek],[data-add],[data-v],[data-ratio],[data-ratioapply],[data-goaledit],[data-syncnow],[data-benv],[data-renv],[data-lvtable],[data-setphil]");
    if (!el) return;
    const d = el.dataset;
    if (d.ratio) { ratioDraft = +d.ratio; const y = $("planOv").scrollTop; renderPlan(); $("planOv").scrollTop = y; return; }
    if (d.ratioapply) { applyRatio(el); return; }
    if (d.goaledit) { openGoal(() => openPlan(true)); return; }
    if (d.lvtable) { openLevel(); return; }
    if (d.setphil) { updateProfile({ philosophy: d.setphil }).then(() => { variants = makeVariants(profile); plan = variants[0].plan; vSel = 0; renderPlan(); toastP("⚖️ 폴라리제드 80/20으로 바꿨어요"); }); return; }
    if (d.benv) { setBikeEnv(d.benv).then(() => { variants = makeVariants(profile); plan = variants[Math.min(vSel, variants.length - 1)].plan; renderPlan(); }); return; }
    if (d.renv) { setBikeEnv(d.renv, "run").then(() => { variants = makeVariants(profile); plan = variants[Math.min(vSel, variants.length - 1)].plan; renderPlan(); }); return; }
    if (d.syncnow) { el.disabled = true; applyPlanToCalendar().then(async (n) => { const p = clone(profile); delete p.holdSync; await saveProfile(p); profile = p; toastP(`📅 대회에 맞춰 스케줄을 바꿨어요 (${n}개)`); TS.reload(); renderPlan(); }); return; }
    if (d.v !== undefined) { vSel = +d.v; plan = variants[vSel].plan; renderPlan(); return; }
    if (d.tab) planTab = d.tab;
    else if (d.wk) weekIdx = Math.max(0, Math.min(51, weekIdx + +d.wk));
    else if (d.q) qIdx = Math.max(0, Math.min(3, qIdx + +d.q));
    else if (d.mo) monthIdx = Math.max(0, Math.min(48, monthIdx + +d.mo));
    else if (d.goweek !== undefined) { weekIdx = +d.goweek; planTab = "week"; }
    else if (d.add) { const [i, c] = d.add.split(":").map(Number); addToCalendar(i, c, el); return; }
    renderPlan();
    $("planOv").scrollTop = 0;
  });

  $("planBody").addEventListener("input", (e) => { // 슬라이더 움직이면 숫자만 바로 바꾸기
    if (e.target.id !== "ratioRange") return;
    ratioDraft = +e.target.value;
    $("ratioVal").innerHTML = `저강도 <b>${ratioDraft}</b> : 고강도 <b>${100 - ratioDraft}</b>`;
  });
  $("planBody").addEventListener("change", (e) => {
    if (e.target.id !== "ratioRange") return;
    const y = $("planOv").scrollTop; renderPlan(); $("planOv").scrollTop = y;
  });

  function notesText(s) {
    return [
      `[자동 계획] Z${s.lvl} · ${s.tag} · RPE ${s.rpe}`,
      `포인트: ${s.point}`, "", "구성:", ...s.steps.map((x) => `- ${x}`), "",
      ...s.targets.map((x) => `목표: ${x}`), s.dist ? `목표: 권장 거리 ${s.dist}` : null, s.hiText ? `목표: 강도 거리 ${s.hiText}` : null, "",
      s.effect ? `효과: ${s.effect}` : null, ...s.envNotes,
      ...(s.alt ? ["", `대안: ${s.alt.name} — ${s.alt.why}`, "대안구성:", ...s.alt.steps.map((x) => `- ${x}`)] : []),
    ].filter((x) => x !== null).join("\n");
  }
  async function addToCalendar(first, count, btn, noAsk) {
    clearTimeout(syncTimer); // 직접 넣는 중에는 자동 맞춤을 잠시 멈춰요
    const last = Math.min(51, first + count - 1);
    const from = iso(plan.week(first).start), to = iso(addDays(plan.week(last).start, 6));
    btn.disabled = true;
    const { data: old, error: e1 } = await TS.mine(db.from(TS.TABLE).select("id")).gte("date", from).lte("date", to).like("notes", "[자동 계획]%");
    if (e1) { alert(TS.explainError(e1).replace(/<[^>]+>/g, "")); btn.disabled = false; return; }
    if (old.length) {
      if (!noAsk && !await TS.ask(`이 기간에 이미 자동 계획 ${old.length}개가 있어요. 새 계획으로 바꿀까요?`)) { btn.disabled = false; return; }
      await db.from(TS.TABLE).delete().in("id", old.map((x) => x.id));
    }
    const rows = [];
    for (let i = first; i <= last; i++) {
      const W = plan.week(i);
      W.sessions.forEach((s) => rows.push({
        date: iso(addDays(W.start, s.day)), title: s.title,
        start_time: s.slot === "오전" ? "07:00" : s.slot === "오후" ? "18:30" : null, // 오전·오후 순서대로 보이게
        category: s.disc === "brick" ? "브릭" : DISC[s.disc].cat,
        duration_min: s.minutes || null,
        intensity: s.lvl <= 2 ? "낮음" : s.lvl === 3 ? "보통" : "높음",
        notes: notesText(s), completed: false,
      }));
    }
    const { error } = await db.from(TS.TABLE).insert(rows);
    btn.disabled = false;
    if (error) { alert(TS.explainError(error).replace(/<[^>]+>/g, "")); return; }
    closePlan();
    TS.setWeek(plan.week(first).start);
    if (TS.showTab) TS.showTab("plan");
  }

  // 다른 화면(심박 존 계산기 등)에서 프로필 일부만 바꿔 저장
  async function updateProfile(patch) {
    if (!profile) return;
    const p = Object.assign(clone(profile), patch);
    await saveProfile(p);
    setProfile(p);
  }
  Object.assign(TS, { getProfile: () => profile, openWizard, openPlan, openGoal, isProfileCloud: () => cloudOk, discsOf, updateProfile, openRaceAdd, removeRace, setBikeEnv, openLevel });
  // 오른쪽 위 종목 버튼: 종목만 바꾸고 바로 스케줄 보기 (문진표는 '설정'에서만)
  function openSportQuick() {
    if (!profile) { openWizard(0); return; }
    let d = $("sportDlg");
    if (!d) { d = document.createElement("dialog"); d.id = "sportDlg"; document.body.appendChild(d); }
    d.innerHTML = `<div style="padding:18px;display:grid;gap:12px">
      <div class="spread"><h2 style="margin:0">종목 바꾸기</h2><button type="button" data-sq="close">닫기</button></div>
      <p class="hint" style="margin:0">종목을 누르면 홈이 바로 그 종목으로 바뀌어요. 문진표는 종목마다 따로 저장돼서, 각 종목의 <b>✏️ 문진표</b>를 누르면 그 종목 것만 고칠 수 있어요.</p>
      <div class="sport-grid">${Object.entries(SPORTS).map(([n, s]) => `<div class="sq-cell"><button type="button" class="sport-card${profile.sport === n ? " selected" : ""}" data-sq="${n}">
          <span class="ico">${s.icon}</span><span class="nm">${n}</span><span class="ds">${profile.sport === n ? "✓ 지금 종목" : hasSaved(n) ? "설정 저장됨" : "설정 전 — 눌러서 시작"}</span></button>
          <button type="button" class="pill" data-sqset="${n}">✏️ ${n} 문진표</button></div>`).join("")}</div>
      <p class="hint" style="margin:0;text-align:center">이름·몸무게·나이·심박은 모든 종목 공통이에요.</p></div>`;
    d.onclick = async (e) => {
      if (e.target === d) { d.close(); return; }
      const set = e.target.closest("[data-sqset]");
      if (set) { d.close(); openWizard(1, set.dataset.sqset); return; } // 그 종목 문진표를 바로 (종목 고르는 장은 건너뛰고)
      const b = e.target.closest("[data-sq]");
      if (!b) return;
      const v = b.dataset.sq;
      d.close();
      if (v === "close" || v === profile.sport) return;
      if (!hasSaved(v)) { openWizard(1, v); return; } // 처음 고르는 종목은 문진표부터
      const next = withSport(profile, v);
      next.updatedAt = new Date().toISOString();
      await saveProfile(next);
      setProfile(next);
      toastP(`${SPORTS[v].icon} ${v}(으)로 바꿨어요`);
    };
    d.showModal();
  }
  $("sportBtn").onclick = openSportQuick;
  $("planBtn").onclick = openPlan;
  (async () => {
    const p = await loadProfile();
    if (p && p.sport && SPORTS[p.sport]) setProfile(p);
    else { window.dispatchEvent(new Event("ts:profile")); openWizard(0); }
  })();
  // 로그인·로그아웃하면 그 사람의 프로필로 바꾸기
  let lastUid = null;
  window.addEventListener("ts:auth", async () => {
    const uid = TS.auth && TS.auth.user ? TS.auth.user.id : null;
    if (uid === lastUid) return;
    lastUid = uid;
    let p = await loadProfile();
    if (p && uid) {
      // 다른 계정 것인지 확인: 주인 표시가 다르거나, (예전 데이터) 문진표 이름이 계정 닉네임과 다르면 남의 프로필이에요
      const nick = TS.auth.member && TS.auth.member.nickname;
      const foreign = p.owner ? p.owner !== uid : !!(p.nickname && nick && p.nickname.trim() !== nick.trim());
      if (foreign) {
        p = null;
        // 잘못 복사된 프로필을 빈 프로필(주인 표시만)로 덮어써요 → 문진표를 처음부터
        await db.from(PROFILE_TABLE).upsert({ id: uid, data: { owner: uid }, updated_at: new Date().toISOString() });
        const today = iso(new Date()); // 그 프로필로 넣은 앞으로의 자동 계획도 지우기 (완료한 기록은 그대로)
        await TS.mine(db.from(TS.TABLE).delete()).gte("date", today).eq("completed", false).like("notes", "[자동 계획]%");
        // 이 기기에 남은 이전 사람의 일지·활동·사진도 비우고 새로 열어요
        try { ["training.profile", "training.journal", "training.activities", "training.savedPosts", "training.avatar", "training.stravaState"].forEach((k) => localStorage.removeItem(k)); } catch (e) { /* 무시 */ }
        let again = false; try { again = sessionStorage.getItem("zone.reset." + uid) === "1"; sessionStorage.setItem("zone.reset." + uid, "1"); } catch (e) { /* 무시 */ }
        if (!again) { location.reload(); return; } // 한 번만 (계속 새로고침되지 않게)
      }
    }
    if (p && p.sport && SPORTS[p.sport]) {
      setProfile(p);
      if (uid) saveProfile(p); // 이 기기 프로필을 내 계정에도 저장 (이때 이 기기 프로필의 주인도 이 계정으로 표시돼요)
    } else if (uid) {
      setProfile(null); // 새 계정: 다른 사람 프로필 대신 빈 상태로 시작 → 문진표를 새로 써요
      try { localStorage.removeItem(LS_KEY); localStorage.setItem(OWNER_KEY, uid); } catch (e) { /* 무시 */ }
    }
  });
})();
