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
  const STEPS = ["종목", "신체 정보", "기준점 테스트", "훈련 일정", "주간 훈련량", "기록과 목표", "목표·훈련 방식", "대회 일정", "확인"];
  const LV_COLOR = window.ZONE ? window.ZONE.colors : ["#60a5fa", "#22c55e", "#eab308", "#f97316", "#ef4444"]; // Z1~Z5 (zones.js와 같은 색)
  const LV_FG = (l) => (l === 3 ? "#422006" : "#fff");

  let profile = null, draft = null, step = 0, cloudOk = true;
  let planTab = "week", weekIdx = 0, monthIdx = 0, plan = null;

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
  async function loadProfile() {
    let local = null;
    try { local = JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch (e) { /* 무시 */ }
    const { data, error } = await db.from(PROFILE_TABLE).select("data").eq("id", pid()).maybeSingle();
    if (error) { cloudOk = false; return local; }
    cloudOk = true;
    return (data && data.data) || local;
  }
  async function saveProfile(p) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch (e) { /* 무시 */ }
    const { error } = await db.from(PROFILE_TABLE).upsert({ id: pid(), data: p, updated_at: new Date().toISOString() });
    cloudOk = !error;
  }
  function setProfile(p) {
    profile = p;
    TS.setSport(p ? p.sport : null);
    const b = $("sportBtn");
    if (b) b.textContent = p && p.sport ? `${SPORTS[p.sport].icon} ${p.sport} ▾` : "종목 선택";
    window.dispatchEvent(new Event("ts:profile"));
  }

  // ---------- 설정 화면 ----------
  // 종목마다 따로 저장하는 문진표 항목 (이름·몸무게·나이·심박 같은 신체 정보는 공통)
  const SPORT_FIELDS = ["tests", "daysPerWeek", "days", "dayOpts", "weeklyHours", "sessionMin", "volume", "env", "records", "goal", "philosophy", "lowPct", "mafAdj", "races"];
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
      </div></div>
      <div class="card"><h3>❤️ 심박 (알면)</h3><div class="fields">
        ${field("최대심박", "maxHr", "bpm", "예: 192")}${field("안정시 심박", "restHr", "bpm", "예: 52")}
      </div><div class="note" id="hrHint">${hrHintText()}</div></div>`;
  }

  function testPreview() {
    const out = [];
    const b = E.bikeInfo(draft), s = E.swimInfo(draft), h = E.hrInfo(draft);
    if (b) out.push(`🚴 FTP <b>${b.ftp}W</b>${b.wkg ? ` (${b.wkg.toFixed(2)}W/kg)` : ""}`);
    if (s && s.tested) out.push(`🏊 CSS <b>${fmt(s.css)}/100m</b>`);
    const r = E.runInfo(draft);
    if (r && /테스트/.test(r.src)) out.push(`🏃 VDOT <b>${r.vdot.toFixed(1)}</b> (T ${fmt(r.T)}/km)`);
    if (num((draft.tests || {}).lthrRun)) out.push(`🏃 러닝 LTHR <b>${draft.tests.lthrRun}bpm</b>`);
    if (num((draft.tests || {}).lthrBike)) out.push(`🚴 사이클 LTHR <b>${draft.tests.lthrBike}bpm</b>`);
    void h;
    return out.length ? out.join(" · ") : "아직 입력한 테스트가 없어요. 비워두면 기록·나이로 추정하고, 계획 첫 주에 테스트를 넣어 드려요.";
  }
  function stepTests() {
    const ds = discsOf(draft.sport);
    const card = {
      run: `<div class="card"><h3>🏃 달리기 — VDOT (다니엘스) · LTHR (프릴)</h3>
        <p class="hint" style="margin-top:0">최근 5K·10K를 <b>최대로 달린 기록</b>을 적으면 VDOT와 E/M/T/I/R 페이스를 계산해요. 대회 기록이나 혼자 잰 타임트라이얼 모두 괜찮아요.</p>
        <div class="fields">${field("5K 기록", "tests.run5k", "", "예: 22:30", "time")}${field("10K 기록", "tests.run10k", "", "예: 47:00", "time")}</div>
        <p class="hint mt" style="margin-bottom:6px"><b>LTHR:</b> 혼자 30분 최대로 달리기 → 10분째 랩 버튼 → 마지막 20분 평균 심박</p>
        <div class="fields">${field("러닝 LTHR", "tests.lthrRun", "bpm", "예: 172")}</div></div>`,
      bike: `<div class="card"><h3>🚴 자전거 — FTP (코건)</h3>
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
      <p class="hint mt">비워두면 운동 시간으로 거리를 추정해요.</p></div>`;
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
    else if (s === "육상") body = `<div class="card">${recTable(runRows())}<p class="hint mt">1500m 이상 기록으로 다니엘스 VDOT를 계산해요. 최근 레이스 기록일수록 정확해요.</p></div>`;
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
    return `<h2>목표와 훈련 방식</h2>
      <p class="sub">목표 거리에 따라 핵심 훈련과 레이스 강도가 달라져요.</p>
      <div class="card"><h3>🎯 목표 종목·거리</h3>
        <div class="chips">${goals.map(([k, n, , , , h]) => `<button type="button" class="chip${g.key === k && draft.goal.event ? " on" : ""}" data-goal="${k}">${n}</button>`).join("")}</div>
        <p class="hint">${draft.goal.event ? "" : `선택 안 하면 ${esc(g.from)}: <b>${esc(g.name)}</b>`}</p>
        <div class="note">핵심 훈련: <b>${esc(g.focus)}</b><br>레이스 강도: <b>${esc(g.race)}</b><br>
          권장 주간 시간: <b>${g.hours[0]}~${g.hours[1]}시간</b> · 지금 가능한 시간: <b>${avail.toFixed(1)}시간</b>${avail < g.hours[0] ? " — 부족한 만큼 핵심 훈련 위주로 짜요" : ""}</div>
        <div class="fields mt">${field("목표 기록", "goal.time", "", sk === "run" ? PH[g.key] || "" : "예: 2:20:00", "time")}</div>
        ${gapTxt}
      </div>
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
    return `<h2>올해 나가는 대회</h2>
      <p class="sub">A 대회 날짜에서 거꾸로 계산해 연간 계획(기초 → 강화 → 피크 → 테이퍼)을 짜요. 없으면 24주 뒤를 시즌 목표로 잡아요.</p>
      <div class="card">${rows || '<p class="hint">아직 등록한 대회가 없어요.</p>'}
        <datalist id="evList">${eventSuggestions().map((e) => `<option value="${esc(e)}">`).join("")}</datalist>
        <button type="button" data-addrace="1" class="mt">+ 대회 추가</button>
        <p class="hint mt"><b>A</b> = 시즌 목표 · <b>B</b> = 중요 (그 주는 양을 15% 줄여요) · <b>C</b> = 연습 삼아</p></div>`;
  }

  function stepReview() {
    const ds = discsOf(draft.sport), g = E.goalOf(draft), h = E.hrInfo(draft);
    const vol = ds.filter((d) => num((draft.volume || {})[d])).map((d) => `${DISC[d].name} ${draft.volume[d]}${DISC[d].unit}`).join(" · ");
    return `<h2>확인</h2><p class="sub">이대로 연간·월간·주간 계획을 만들까요?</p>
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
    draft.updatedAt = new Date().toISOString();
    draft.bySport = draft.bySport || {};
    draft.bySport[draft.sport] = pickSport(draft); // 이 종목 문진표로 저장
    await saveProfile(draft);
    $("wzNext").disabled = false;
    setProfile(clone(draft));
    closeWizard();
    planTab = "week"; weekIdx = 0; monthIdx = 0;
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
  }
  $("wzBody").addEventListener("input", onWzInput);
  $("wzBody").addEventListener("change", (e) => {
    onWzInput(e);
    if (step === 6 && e.target.dataset.f === "goal.time") renderStep();
  });
  $("wzBody").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const d = b.dataset;
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
  function openPlan() {
    if (!profile) { openWizard(0); return; }
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
    if (m && /\d/.test(m[1]) && !/^(자전거|달리기|수영)/.test(m[1])) m = null;
    const label = m ? m[1].trim() : /쿨다운/.test(t) ? "쿨다운" : /워밍업/.test(t) ? "워밍업" : "메인";
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
      const cls = /워밍업/.test(p.label) ? "wu" : /쿨다운/.test(p.label) ? "cd" : "main";
      return `<div class="step ${cls}"><span class="st-l">${esc(p.label)}</span><span class="st-b">${esc(p.body)}</span><span class="st-c">${p.chips.map((c) => `<b>${esc(c)}</b>`).join("")}</span></div>`;
    }).join("")}</div>`;
  }
  TS.stepTable = stepTable;
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
    const easyWk = W && (W.recovery || ["trans", "taper", "race"].includes(W.key));
    const msg = Math.abs(low - tg) <= 2 ? `✓ 설정한 비율(${tg}:${100 - tg})에 맞췄어요`
      : low > tg ? (easyWk ? "회복·테이퍼·대회 주라 고강도 없이 쉬운 강도로만 짰어요 (비율은 다음 훈련 주부터 적용)" : "거리 목표가 없는 종목은 시간 기준이라 조금 차이가 날 수 있어요")
      : `고강도 비중이 목표(${100 - tg}%)보다 높은 주예요 — 쉬운 날은 꼭 쉽게`;
    const fv = (x, v) => (x === "swim" ? `${(Math.round(v / 50) * 50).toLocaleString()}m` : `${Math.round(v * 10) / 10}km`);
    const rows = W && W.ratio ? Object.entries(W.ratio).map(([x, r]) => `<div class="ratio-row"><span>${E.DISC[x].icon} ${E.DISC[x].name} ${fv(x, r.total)}</span>
        <span><b style="color:#16a34a">저강도 ${fv(x, r.total - r.hi)}</b> · <b style="color:#ea580c">고강도 ${fv(x, r.hi)}</b> <span class="hint">(질 훈련 ${r.n}회에 나눠서)</span></span></div>`).join("") : "";
    return `<div class="spread" style="font-size:13px;margin-bottom:4px"><span>저강도 <b>${low}%</b></span><span class="hint">목표 ${tg} : ${100 - tg}${W && W.byDist ? " · 거리 기준" : " · 시간 기준"}</span><span>중·고강도 <b>${100 - low}%</b></span></div>
      <div class="progress" style="height:10px;background:#fde68a;position:relative"><i style="width:${low}%;background:linear-gradient(90deg,#16a34a,#4ade80)"></i>
        <span style="position:absolute;left:${tg}%;top:-3px;bottom:-3px;width:2px;background:#0f172a" title="목표"></span></div>
      ${rows ? `<div class="ratio-box">${rows}</div>` : ""}
      <p class="hint" style="margin:6px 0 0">${msg}</p>`;
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
        ${ratioCtl(W)}
      </div>
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
      <div class="card"><h3>🧭 ${esc(ph.name)}</h3><p class="txt" style="margin:0">${esc(ph.desc)}</p><p class="hint">${esc(ph.by)}</p></div>`;

    if (ds.includes("run")) {
      html += `<div class="card"><h3>🏃 달리기 — 다니엘스 VDOT ${R ? `<b>${R.vdot.toFixed(1)}</b>` : ""}</h3>
        ${R ? `<p class="hint" style="margin-top:0">기준: ${esc(R.src)}</p>
          <div class="zt-wrap"><table class="zt" style="min-width:520px"><tr><th>페이스</th><th>속도</th><th>설명 · 한 주 상한</th><th>효과</th></tr>
          ${E.RUN_PACES.map(([k, n, lvl, d, eff]) => `<tr><td>${zb(lvl, k)} <b>${n}</b></td><td><b>${esc(E.runPaceText(R, k))}</b></td><td>${esc(d)}</td><td>${esc(eff)}</td></tr>`).join("")}</table></div>
          <p class="hint">예상 기록: ${Object.entries(R.pred).map(([k, v]) => `${k} ${fmt(v)}`).join(" · ")} — 4~6주마다 새 기록으로 다시 계산하세요.</p>`
          : `<p class="hint">1500m 이상 달리기 기록을 입력하면 VDOT와 E/M/T/I/R 페이스를 계산해요.</p>`}
        ${H.lthrRun ? `<h3 class="mt">❤️ 러닝 심박 (프릴 LTHR ${H.lthrRun}bpm ${H.runMeasured ? "측정" : "추정"})</h3>
          <div class="zt-wrap"><table class="zt" style="min-width:360px"><tr><th>존</th><th>심박(bpm)</th><th>% LTHR</th></tr>
          ${E.FRIEL_RUN.map((r, i) => `<tr><td><b>${r[0]}</b> ${r[1]}</td><td>${E.frielRange(E.FRIEL_RUN, H.lthrRun, i)}</td><td>${!r[2] ? `~${r[3]}%` : !r[3] ? `${r[2]}%+` : `${r[2]}–${r[3]}%`}</td></tr>`).join("")}</table></div>` : ""}
      </div>`;
    }
    if (ds.includes("bike")) {
      html += `<div class="card"><h3>🚴 자전거 — 코건 FTP ${B ? `<b>${B.ftp}W</b>${B.wkg ? ` (${B.wkg.toFixed(2)}W/kg)` : ""}` : ""}</h3>
        ${B ? `<p class="hint" style="margin-top:0">기준: ${esc(B.src)}</p><div class="zt-wrap"><table class="zt" style="min-width:460px"><tr><th>존</th><th>파워</th><th>% FTP</th><th>효과</th></tr>
          ${E.COGGAN.map(([z, n, lo, hi, lvl, eff]) => `<tr><td>${zb(lvl, z)} <b>${n}</b></td><td><b>${E.watt(B.ftp, lo, hi)}</b></td><td>${lo}${hi ? "–" + hi : "+"}%</td><td>${esc(eff)}</td></tr>`).join("")}</table></div>
          <p class="hint">스윗스팟: FTP 88~93% (${E.watt(B.ftp, 88, 93)})</p>` : `<p class="hint">FTP(또는 20분 테스트)를 입력하면 7개 파워 존을 계산해요.</p>`}
        ${H.lthrBike ? `<h3 class="mt">❤️ 사이클 심박 (프릴 LTHR ${H.lthrBike}bpm ${H.bikeMeasured ? "측정" : "추정"})</h3>
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
    html += `<div class="card"><h3>📚 참고한 방법</h3><ul style="margin:0;padding-left:18px;line-height:1.7;font-size:13px;color:var(--muted)">
      <li>달리기: 잭 다니엘스 『러닝 포뮬러』(VDOT, 4단계 시즌, 질 훈련 양 상한), 맷 피츠제럴드 『80/20 러닝』·『Run Like a Pro』</li>
      <li>수영: Swim Smooth, 『Science of Swimming Faster』 (CSS 기반 세트, 기술 → CSS → 레이스 특화)</li>
      <li>자전거: 조 프릴 『Cyclist's Training Bible』 (준비 → 기초 1~3 → 강화 1~2 → 피크 → 레이스), 코건 파워 존</li>
      <li>철인3종: 80/20 트라이애슬론, 프릴 『Your Best Triathlon』, 스티븐 세일러 폴라리제드 연구, 거리별 권장 주간 시간</li>
      <li>심박: 조 프릴 LTHR 존 · 필 마페톤 MAF</li></ul>
      <p class="hint">책 내용을 그대로 옮긴 게 아니라 원칙을 요약해 계산에 반영했어요. 참고용 계획이니 몸 상태에 따라 조절하세요.</p></div>`;
    return html;
  }

  function renderPlan() {
    const p = profile, { ctx } = plan;
    const g = ctx.goal;
    const body = { week: renderWeekTab, month: renderMonthTab, year: renderYearTab, basis: renderBasisTab }[planTab]();
    $("planBody").innerHTML = `
      <div class="wz-top"><h2 style="margin:0;flex:1">📋 내 훈련 계획</h2><button type="button" class="pill" data-home="1">🏠 홈</button><button type="button" id="planEdit">⚙️ 설정</button><button type="button" id="planClose">닫기</button></div>
      ${cloudOk ? "" : `<div class="note" style="margin:0 0 12px">⚠️ 프로필이 이 기기에만 저장됐어요. Supabase SQL Editor에서 <code>schema_profile.sql</code>을 실행하면 다른 기기에서도 보여요.</div>`}
      <div class="card"><div class="kv">
        <span>종목 · 목표</span><b>${SPORTS[p.sport].icon} ${esc(g.name)}${g.timeText ? ` · ${esc(g.timeText)}` : ""}</b>
        <span>훈련 시간</span><b>주 ${(p.days || []).length}회 · 주 최대 ${plan.availHours.toFixed(1)}시간</b>
      </div>
      <div class="eyebrow mt">계획 2가지 — 골라서 보세요</div>
      <div class="vpick">${variants.map((v, i) => { const st = vStats(v); return `<button type="button" data-v="${i}" class="${vSel === i ? "on" : ""}">
          <span class="vt">${i === 0 ? "A안" : "B안"}${v.rec ? " ⭐ 추천" : ""}</span><span class="vn">${E.PHIL[v.key].name}</span>
          <span class="hint" style="font-size:12px;line-height:1.5;margin-top:4px">저강도 ${st.low}% : 고강도 ${100 - st.low}%<br>질 훈련 주 ${st.q}회${st.dbl ? ` (더블 ${st.dbl})` : ""} · ${minLabel(st.min)}</span></button>`; }).join("")}</div>
      ${vCompare()}
      <div class="note">${variants[vSel].rec ? "⭐ 추천 이유: " : ""}${esc(variants[vSel].why)}</div></div>
      <div class="seg">${[["week", "주간"], ["month", "월간"], ["year", "연간"], ["basis", "강도 기준"]].map(([k, l]) => `<button type="button" data-tab="${k}" class="${planTab === k ? "on" : ""}">${l}</button>`).join("")}</div>
      ${body}`;
    $("planClose").onclick = closePlan;
    $("planEdit").onclick = () => { closePlan(); openWizard(1); };
  }
  $("planBody").addEventListener("click", (e) => {
    const el = e.target.closest("[data-tab],[data-wk],[data-mo],[data-goweek],[data-add],[data-v],[data-ratio],[data-ratioapply]");
    if (!el) return;
    const d = el.dataset;
    if (d.ratio) { ratioDraft = +d.ratio; const y = $("planOv").scrollTop; renderPlan(); $("planOv").scrollTop = y; return; }
    if (d.ratioapply) { applyRatio(el); return; }
    if (d.v !== undefined) { vSel = +d.v; plan = variants[vSel].plan; renderPlan(); return; }
    if (d.tab) planTab = d.tab;
    else if (d.wk) weekIdx = Math.max(0, Math.min(51, weekIdx + +d.wk));
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
    ].filter((x) => x !== null).join("\n");
  }
  async function addToCalendar(first, count, btn, noAsk) {
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
  Object.assign(TS, { getProfile: () => profile, openWizard, openPlan, isProfileCloud: () => cloudOk, discsOf, updateProfile });
  // 오른쪽 위 종목 버튼: 종목만 바꾸고 바로 스케줄 보기 (문진표는 '설정'에서만)
  function openSportQuick() {
    if (!profile) { openWizard(0); return; }
    let d = $("sportDlg");
    if (!d) { d = document.createElement("dialog"); d.id = "sportDlg"; document.body.appendChild(d); }
    d.innerHTML = `<div style="padding:18px;display:grid;gap:12px">
      <div class="spread"><h2 style="margin:0">종목 선택</h2><button type="button" data-sq="close">닫기</button></div>
      <p class="hint" style="margin:0">종목을 누르면 그 종목 스케줄이 바로 나와요. 종목마다 문진표(거리·요일·기록·목표)가 따로 저장돼요.</p>
      <div class="sport-grid">${Object.entries(SPORTS).map(([n, s]) => `<button type="button" class="sport-card${profile.sport === n ? " selected" : ""}" data-sq="${n}">
          <span class="ico">${s.icon}</span><span class="nm">${n}</span><span class="ds">${profile.sport === n ? "지금 종목" : hasSaved(n) ? "✓ 설정 저장됨" : "설정 전"}</span></button>`).join("")}</div>
      <button type="button" class="primary" data-sqset="1" style="padding:12px">⚙️ 문진표 수정 (처음부터)</button>
      <p class="hint" style="margin:0;text-align:center">문진표 첫 장에서 종목을 고르면 그 종목에 저장된 내용을 불러와요. 이름·몸무게·나이·심박은 모든 종목 공통이에요.</p></div>`;
    d.onclick = async (e) => {
      const set = e.target.closest("[data-sqset]");
      if (set) { d.close(); openWizard(0); return; } // 문진표 1번째 장(종목)부터
      const b = e.target.closest("[data-sq]");
      if (!b) return;
      const v = b.dataset.sq;
      d.close();
      if (v === "close") return;
      if (v !== profile.sport) {
        const next = withSport(profile, v);
        next.updatedAt = new Date().toISOString();
        await saveProfile(next);
        setProfile(next);
      }
      planTab = "week"; weekIdx = 0;
      openPlan();
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
    const p = await loadProfile();
    if (p && p.sport && SPORTS[p.sport]) {
      setProfile(p);
      if (uid) saveProfile(p); // 이 기기 프로필을 내 계정에도 저장
    }
  });
})();
