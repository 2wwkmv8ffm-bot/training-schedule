// 탭 이동 + 홈 / 활동(통계) / 활동 상세 / 나(레벨·기록·배지·챌린지)
(function () {
  const TS = window.TS;
  const { db, iso, addDays, mondayOf, fmtDur, fmtPace, fmtKm, hav } = TS;
  const esc = (s) => TS.escapeHtml(s == null ? "" : s);
  const $ = (id) => document.getElementById(id);
  const SP = TS.ACT_SPORTS;
  const DAY = TS.DAYS;

  let acts = [];
  let period = "week";
  let offset = 0;
  let filter = "all";
  let current = "home";
  let map = null;

  // ---------- 탭 ----------
  function showTab(name, opts) {
    if (name === "record") { TS.openTracker(); return; }
    // 탭을 옮길 때마다 기록해서, 휴대폰 '뒤로'로 이전 탭에 돌아갈 수 있게
    if (!(opts && opts.fromPop) && name !== current) { try { history.pushState({ tab: name }, ""); } catch (e) { /* 무시 */ } }
    current = name;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("show", t.id === "tab-" + name));
    document.querySelectorAll(".tabbar button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
    window.scrollTo(0, 0);
    renderCurrent();
  }
  function renderCurrent() {
    if (current === "home") renderHome();
    if (current === "activity") renderActivity();
    if (current === "me") renderMe();
    if (current === "community" && TS.community) TS.community.render();
  }
  TS.showTab = showTab;
  TS.currentTab = () => current;

  // 🏠 어느 화면에서든 홈으로 (기록 중인 GPS는 계속 측정돼요)
  function goHome() {
    ["wizard", "planOv", "detailOv", "trackerOv", "authOv"].forEach((id) => $(id) && $(id).classList.remove("show"));
    document.querySelectorAll("dialog[open]").forEach((d) => d.close());
    if (map) { map.remove(); map = null; }
    document.body.style.overflow = "";
    showTab("home");
  }
  TS.goHome = goHome;
  document.addEventListener("click", (e) => { if (e.target.closest("[data-home]")) goHome(); });
  document.querySelectorAll(".tabbar button").forEach((b) => { b.onclick = () => showTab(b.dataset.tab); });
  $("manualBtn").onclick = () => TS.openManual();

  // ---------- ⌚ 가민 기록 가져오기 (FIT · GPX · TCX · ZIP) ----------
  let pending = [];
  function bleHtml() {
    const H = TS.HR;
    if (!H || !H.supported) return `<div class="note" style="margin:0">이 브라우저는 블루투스 연결을 지원하지 않아요. <b>안드로이드 크롬</b> 또는 <b>PC 크롬·엣지</b>에서 열어 주세요 (아이폰은 애플 정책으로 불가).</div>`;
    if (H.status === "on") return `<div class="note" style="margin:0">❤️ <b>${esc(H.name)}</b> 연결됨 · ${H.bpm ? `<b>${H.bpm}bpm</b>` : "심박 기다리는 중…"}<br>
      <button type="button" class="primary pill" id="bleGo" style="margin-top:8px">▶ 이 심박으로 기록 시작</button> <button type="button" class="link" id="bleOff">연결 끊기</button></div>`;
    return `<button type="button" class="primary" id="bleOn" style="padding:13px">❤️ 블루투스로 가민 시계 연결</button>
      <p class="hint" style="margin:0">시계: <b>설정 → 센서 및 액세서리(또는 심박) → 심박 전송</b> 켜기 → 위 버튼 → 목록에서 시계 선택${H.error ? `<br>⚠️ ${esc(H.error)}` : ""}</p>`;
  }
  function bindBle() {
    if ($("bleOn")) $("bleOn").onclick = () => TS.HR.connect().catch(() => {});
    if ($("bleOff")) $("bleOff").onclick = () => TS.HR.disconnect();
    if ($("bleGo")) $("bleGo").onclick = () => { $("importDlg").close(); TS.openTracker(); };
  }
  if (TS.HR) TS.HR.on(() => { if ($("bleBox")) { $("bleBox").innerHTML = bleHtml(); bindBle(); } });
  if ($("importBtn")) $("importBtn").onclick = () => {
    $("importBody").innerHTML = `<h2 style="margin:0">⌚ 시계 기록 파일 가져오기</h2>
      <p class="hint" style="margin:0">가민·코로스·순토 등 시계 기록을 파일(FIT · GPX · TCX · ZIP)로 내보내서 가져와요.</p>
      <div class="note" style="margin:0">
        <b>1.</b> PC나 휴대폰 브라우저에서 <b>connect.garmin.com</b> 로그인<br>
        <b>2.</b> 활동 → 가져올 운동 선택 → 오른쪽 위 <b>⚙️</b><br>
        <b>3.</b> <b>원본 내보내기</b>(.zip, FIT) 또는 <b>GPX·TCX로 내보내기</b><br>
        <b>4.</b> 아래 버튼으로 받은 파일 선택 (여러 개 한 번에 가능)</div>
      <p class="hint" style="margin:0">거리·시간·경로·심박·구간 기록이 그대로 들어와요. 파일은 이 기기에서만 읽고, 기록만 저장해요.</p>
      <p class="hint" style="margin:0">휴대폰에서는 가민 커넥트 앱 대신 <b>브라우저로 connect.garmin.com</b>에 들어가야 내보내기 메뉴가 있어요. 받은 파일은 '파일' 앱(다운로드 폴더)에 있어요.</p>
      <div class="actions"><div class="right"><button type="button" id="impCancel">닫기</button><button type="button" class="primary" id="impPick">파일 선택</button></div></div>`;
    $("importDlg").showModal();
    $("impCancel").onclick = () => $("importDlg").close();
    $("impPick").onclick = () => $("importFile").click();
  };
  if ($("importFile")) $("importFile").onchange = async (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    if (!files.length) return;
    if (!$("importDlg").open) $("importDlg").showModal();
    $("importBody").innerHTML = `<h2 style="margin:0">⌚ 읽는 중…</h2><p class="hint">${files.length}개 파일</p>`;
    const res = await TS.garmin.readFiles(files);
    const dup = (a) => acts.some((x) => x.sport === a.sport && Math.abs(new Date(x.started_at) - new Date(a.started_at)) < 120000);
    pending = res.map((r) => ({ ...r, dup: r.act ? dup(r.act) : false }));
    renderImport();
  };
  function renderImport() {
    const ok = pending.filter((r) => r.act);
    $("importBody").innerHTML = `<h2 style="margin:0">⌚ 가져올 기록 ${ok.length}개</h2>
      ${pending.map((r, i) => r.act ? `<label class="check" style="align-items:flex-start;border-top:1px solid var(--line);padding-top:10px">
          <input type="checkbox" data-imp="${i}" ${r.dup ? "" : "checked"} />
          <span><b>${SP[r.act.sport].icon} ${new Date(r.act.started_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" })}</b><br>
          <span class="hint">${distText(r.act)} · ${fmtDur(r.act.duration_s)} · ${speedText(r.act)}${r.act.avg_hr ? ` · ❤️ 평균 ${r.act.avg_hr}` : ""}${r.act.route ? " · 🗺 경로" : ""}${r.dup ? " · ⚠️ 이미 있는 기록 같아요" : ""}</span><br>
          <span class="hint">${esc(r.name)}</span></span></label>`
        : `<p class="hint" style="margin:0">⚠️ ${esc(r.name)}: ${esc(r.error)}</p>`).join("")}
      <div class="actions"><div class="right"><button type="button" id="impCancel">취소</button>
        <button type="button" class="primary" id="impSave" ${ok.length ? "" : "disabled"}>선택한 기록 저장</button></div></div>`;
    $("impCancel").onclick = () => $("importDlg").close();
    $("impSave").onclick = async () => {
      const sel = [...$("importBody").querySelectorAll("[data-imp]:checked")].map((c) => pending[+c.dataset.imp].act);
      if (!sel.length) return;
      $("impSave").disabled = true;
      let last = null;
      for (let i = 0; i < sel.length; i++) { $("impSave").textContent = `저장 중… ${i + 1}/${sel.length}`; last = await TS.addActivity(sel[i]); }
      $("importDlg").close();
      showTab("activity");
      if (sel.length === 1 && last) openActivity(last, true);
    };
  }

  async function refresh() { acts = await TS.listActivities(); renderCurrent(); }
  window.addEventListener("ts:activities", refresh);
  window.addEventListener("ts:profile", renderCurrent);
  window.addEventListener("ts:auth", () => { if (current === "me") renderMe(); });
  window.addEventListener("ts:strava", () => { if (current === "me") renderMe(); });
  window.addEventListener("ts:sessions", () => { if (current === "home") renderHome(); });

  // ---------- 계산 도구 ----------
  const km = (a) => (+a.distance_m || 0) / 1000;
  const dateOf = (a) => new Date(a.started_at);
  const sum = (list, f) => list.reduce((x, a) => x + f(a), 0);
  function inRange(list, from, to) { return list.filter((a) => { const d = dateOf(a); return d >= from && d < to; }); }
  function paceOf(a) { return a.distance_m > 0 ? (a.duration_s * 1000) / a.distance_m : 0; }
  function speedText(a) { return a.sport === "bike" ? `${((a.distance_m / Math.max(a.duration_s, 1)) * 3.6).toFixed(1)} km/h` : a.sport === "swim" ? `${fmtDur((a.duration_s * 100) / Math.max(a.distance_m, 1))} /100m` : fmtPace(paceOf(a)); }
  function distText(a) { return a.sport === "swim" ? `${Math.round(a.distance_m || 0)}m` : `${fmtKm(a.distance_m)}km`; }
  function zoneOfNotes(n) { const m = /\bZ(\d)/.exec(n || ""); return m ? +m[1] : null; }
  const sessSport = (cat) => ({ 러닝: "run", 사이클: "bike", 브릭: "bike", 수영: "swim" }[cat] || "run");

  function weeklyTargetKm(p) {
    if (!p || !p.volume) return null;
    const v = p.volume;
    const t = (+v.run || 0) + (+v.bike || 0) + (+v.swim || 0) / 1000;
    return t > 0 ? t : null;
  }
  function monthTargetKm(p) {
    const w = weeklyTargetKm(p);
    if (w) return Math.max(10, Math.round((w * 4.3) / 10) * 10);
    return p && p.sport === "수영" ? 20 : p && p.sport === "자전거" ? 300 : 100;
  }

  // 경로에서 가장 빠른 구간 찾기 (예: 이 활동 안의 최고 5km)
  function bestEffort(a, d) {
    const r = a.route;
    if (!r || r.length < 2 || (a.distance_m || 0) < d) return null;
    const cum = [0];
    for (let i = 1; i < r.length; i++) cum.push(cum[i - 1] + hav(r[i - 1][0], r[i - 1][1], r[i][0], r[i][1]));
    let j = 0, best = null;
    for (let i = 1; i < r.length; i++) {
      while (j < i && cum[i] - cum[j + 1] >= d) j++;
      if (cum[i] - cum[j] >= d) {
        const t = ((r[i][2] - r[j][2]) * d) / (cum[i] - cum[j]);
        if (best == null || t < best) best = t;
      }
    }
    return best;
  }
  const EFFORTS = [["1km", 1000], ["5km", 5000], ["10km", 10000], ["하프", 21097], ["풀코스", 42195]];
  function appPRs() {
    const out = [];
    for (const [l, d] of EFFORTS) {
      let best = null, from = null;
      acts.filter((a) => a.sport === "run").forEach((a) => {
        let t = bestEffort(a, d);
        if (t == null && a.distance_m >= d && a.distance_m <= d * 1.05) t = a.duration_s * (d / a.distance_m);
        if (t != null && (best == null || t < best)) { best = t; from = a; }
      });
      if (best != null) out.push({ label: `달리기 ${l}`, sec: best, from });
    }
    return out;
  }

  // 연속 훈련일
  function streaks() {
    const days = [...new Set(acts.map((a) => iso(dateOf(a))))].sort();
    let max = 0, run = 0, prev = null;
    days.forEach((d) => {
      run = prev && iso(addDays(new Date(prev + "T00:00:00"), 1)) === d ? run + 1 : 1;
      max = Math.max(max, run); prev = d;
    });
    let cur = 0, day = new Date();
    const set = new Set(days);
    if (!set.has(iso(day))) day = addDays(day, -1);
    while (set.has(iso(day))) { cur++; day = addDays(day, -1); }
    return { max, cur };
  }

  // ---------- 배지 ----------
  function stats() {
    const byWeek = {}, byMonth = {};
    acts.forEach((a) => {
      const w = iso(mondayOf(dateOf(a)));
      (byWeek[w] = byWeek[w] || { n: 0, sports: new Set() }).n++;
      byWeek[w].sports.add(a.sport);
      const m = a.started_at.slice(0, 7);
      byMonth[m] = (byMonth[m] || 0) + km(a);
    });
    const maxOf = (s) => Math.max(0, ...acts.filter((a) => a.sport === s).map((a) => a.distance_m || 0));
    return {
      count: acts.length,
      total: sum(acts, km),
      maxRun: maxOf("run"), maxBike: maxOf("bike"), maxSwim: maxOf("swim"),
      maxWeekN: Math.max(0, ...Object.values(byWeek).map((w) => w.n)),
      triWeek: Object.values(byWeek).some((w) => ["run", "bike", "swim"].every((s) => w.sports.has(s))),
      maxMonth: Math.max(0, ...Object.values(byMonth)),
      early: acts.some((a) => dateOf(a).getHours() < 6),
      night: acts.some((a) => dateOf(a).getHours() >= 21),
      streak: streaks().max,
    };
  }
  const BADGES = [
    { icon: "🌱", name: "첫 기록", desc: "첫 활동 기록", p: (s) => [s.count, 1] },
    { icon: "🎯", name: "5K 완주", desc: "한 번에 5km 달리기", p: (s) => [s.maxRun / 1000, 5] },
    { icon: "🔟", name: "10K 완주", desc: "한 번에 10km 달리기", p: (s) => [s.maxRun / 1000, 10] },
    { icon: "🥈", name: "하프 완주", desc: "한 번에 21.1km 달리기", p: (s) => [s.maxRun / 1000, 21.1] },
    { icon: "🥇", name: "풀코스 완주", desc: "한 번에 42.2km 달리기", p: (s) => [s.maxRun / 1000, 42.2] },
    { icon: "🚴", name: "50km 라이드", desc: "한 번에 50km 자전거", p: (s) => [s.maxBike / 1000, 50] },
    { icon: "💯", name: "100km 라이드", desc: "한 번에 100km 자전거", p: (s) => [s.maxBike / 1000, 100] },
    { icon: "🌊", name: "1500m 수영", desc: "한 번에 1500m 수영", p: (s) => [s.maxSwim, 1500] },
    { icon: "🏅", name: "트라이 위크", desc: "한 주에 수영·자전거·달리기 모두", p: (s) => [s.triWeek ? 1 : 0, 1] },
    { icon: "📅", name: "주 3회", desc: "한 주에 3번 이상 훈련", p: (s) => [s.maxWeekN, 3] },
    { icon: "🔥", name: "7일 연속", desc: "7일 연속 훈련", p: (s) => [s.streak, 7] },
    { icon: "🚀", name: "한 달 100km", desc: "한 달 동안 100km", p: (s) => [s.maxMonth, 100] },
    { icon: "🌍", name: "누적 500km", desc: "지금까지 500km", p: (s) => [s.total, 500] },
    { icon: "🌅", name: "새벽 훈련", desc: "오전 6시 전에 시작", p: (s) => [s.early ? 1 : 0, 1] },
    { icon: "🌙", name: "야간 훈련", desc: "오후 9시 이후 시작", p: (s) => [s.night ? 1 : 0, 1] },
  ];
  const LEVELS = [[0, "스타터"], [50, "무버"], [200, "챌린저"], [500, "애슬리트"], [1000, "엘리트"], [2500, "마스터"], [5000, "레전드"]];
  function levelOf(total) {
    let i = 0;
    LEVELS.forEach((l, k) => { if (total >= l[0]) i = k; });
    const next = LEVELS[i + 1];
    return { n: i + 1, name: LEVELS[i][1], next, pct: next ? ((total - LEVELS[i][0]) / (next[0] - LEVELS[i][0])) * 100 : 100 };
  }

  // ---------- 막대 그래프 ----------
  function bars(values, labels) {
    const max = Math.max(...values, 0.001);
    return `<div class="bars">${values.map((v, i) => `<div class="b" title="${v.toFixed(1)}km">
      <i class="${v ? "" : "zero"}" style="height:${v ? Math.max(4, (v / max) * 100) : 3}%"></i><span>${labels[i] || ""}</span></div>`).join("")}</div>`;
  }

  // ---------- 홈 ----------
  // 달력 메모(자동 계획)에서 존·거리·구성 꺼내기
  let homeDay = null;
  const ZC = window.ZONE ? window.ZONE.colors : ["#60a5fa", "#22c55e", "#eab308", "#f97316", "#ef4444"]; // Z1~Z5
  const ZFG = (z) => (z === 3 ? "#422006" : "#fff");
  const CAT_ICON = { 러닝: "🏃", 사이클: "🚴", 수영: "🏊", 브릭: "🚴", 근력: "💪", 유연성: "🧘", 휴식: "😴", 기타: "•" };
  function parseNotes(s) {
    const lines = (s.notes || "").split("\n");
    const head = lines[0] || "";
    const z = zoneOfNotes(head);
    const hp = head.replace("[자동 계획]", "").split("·").map((x) => x.trim());
    const steps = [], altSteps = [];
    let inAlt = false;
    let inSteps = false;
    lines.forEach((l) => {
      if (l.startsWith("구성:")) { inSteps = true; return; }
      if (l.startsWith("대안구성:")) { inAlt = true; inSteps = false; return; }
      if (inAlt && l.startsWith("- ")) { altSteps.push(l.slice(2)); return; }
      if (inSteps && l.startsWith("- ")) steps.push(l.slice(2));
      else if (inSteps && !l.trim()) inSteps = false;
    });
    const distLine = lines.find((l) => l.startsWith("목표: 권장 거리 "));
    const dist = distLine ? distLine.replace("목표: 권장 거리 ", "").replace(/(수영|자전거|달리기)\s*/g, "").replace(/\s*\(.*?\)/g, "") : "";
    return {
      z, tag: head.startsWith("[자동 계획]") ? hp[1] : "", rpe: head.startsWith("[자동 계획]") ? (hp[2] || "").replace("RPE ", "") : "",
      steps, dist, point: ((lines.find((l) => l.startsWith("포인트:")) || "").replace("포인트: ", "")),
      hiText: ((lines.find((l) => l.startsWith("목표: 강도 거리 ")) || "").replace("목표: 강도 거리 ", "")),
      alt: (() => { const a = lines.find((l) => l.startsWith("대안: ")); if (!a) return null; const [name, why] = a.replace("대안: ", "").split(" — "); return { name, why: why || "", steps: altSteps }; })(),
    };
  }

  // 훈련 한 개를 깔끔한 카드로 (홈·계획 탭에서 같이 씀)
  function sessHtml(s, canStart) {
    const n = parseNotes(s);
    return `<div class="hsess${s.completed ? " done" : ""}">
      <div class="spread"><b class="t">${esc(s.title)}</b>${n.z ? `<span class="zb" style="background:${ZC[n.z - 1]};color:${ZFG(n.z)}">Z${n.z}${n.tag ? " " + esc(n.tag) : ""}</span>` : ""}</div>
      <div class="tiles mt" style="margin-top:8px">
        <div><span>거리</span><b>${n.dist ? esc(n.dist) : "-"}</b></div>
        <div><span>시간</span><b>${s.duration_min ? s.duration_min + "분" : "-"}</b></div>
        <div><span>강도</span><b style="color:${n.z ? (n.z === 3 ? "#a16207" : ZC[n.z - 1]) : "inherit"}">${n.z ? `Z${n.z}` : esc(s.intensity || "-")}</b></div>
        <div><span>힘든 정도</span><b>${n.rpe ? "RPE " + esc(n.rpe) : "-"}</b></div></div>
      ${window.ZONE ? (n.hiText ? window.ZONE.mixBar(n.hiText) : n.dist && n.z && n.z <= 2 ? window.ZONE.mixBar(`고강도 0% 0km · 저강도 100% ${n.dist}`) : n.dist && n.z ? `<p class="hint" style="margin:8px 0 0">⚖️ 계획에서 '달력에 넣기'를 다시 누르면 고강도·저강도 km가 보여요.</p>` : "") : ""}
      ${window.ZONE && n.z ? window.ZONE.guideLine(n.z) : ""}
      ${n.steps.length && TS.stepTable ? `<div style="margin-top:8px">${TS.stepTable(n.steps)}</div>` : ""}
      ${n.alt && TS.stepTable ? `<div class="alt-box"><div class="alt-h">✅ 추천: <b>${esc(s.title.replace(/^.*?· /, ""))}</b> <span class="hint">— 이번 시기 목적에 가장 잘 맞아요</span></div><details><summary>🔁 대안: <b>${esc(n.alt.name)}</b> <span class="hint">— ${esc(n.alt.why)}</span></summary>${TS.stepTable(n.alt.steps)}</details></div>` : ""}
      ${n.point && !s.completed ? `<p class="hint" style="margin:8px 0 0">💡 ${esc(n.point)}</p>` : ""}
      <div class="spread" style="margin-top:10px">${s.completed ? '<span class="hint">완료 ✓</span>' : `<span class="hint">${canStart ? "준비되면 시작하세요" : ""}</span>`}
        ${s.completed || !canStart ? "" : `<button type="button" class="primary pill" data-start="${esc(s.id)}">${s.category === "수영" ? "📝 기록하기" : "▶ 이 훈련 시작"}</button>`}</div>
    </div>`;
  }
  function startSession(s) {
    if (!s) return;
    const note = (s.notes || "").split("\n").filter((l) => l.startsWith("목표:")).map((l) => l.replace("목표: ", "")).join("\n");
    if (s.category === "수영") TS.openManual({ sport: "swim", sessionId: s.id, title: s.title });
    else TS.openTracker({ sport: sessSport(s.category), sessionId: s.id, title: s.title, note });
  }
  TS.sessHtml = sessHtml;
  TS.startSession = startSession;

  // 이번 주 목표 거리: 설정한 주간 거리를 종목별로 (수영 m · 자전거/달리기 km)
  function weekGoalCard(p, wk, wkKm, target, perDay) {
    let tg = {};
    try { if (p && TS.E) tg = TS.E.buildPlan(p).week(0).targets || {}; } catch (e) { tg = {}; }
    const keys = ["swim", "bike", "run"].filter((k) => tg[k]);
    const timeTxt = `${wk.length}회 · ${fmtDur(sum(wk, (a) => a.duration_s || 0))}`;
    if (!keys.length) {
      return `<div class="card"><div class="spread"><div class="eyebrow">이번 주 기록</div><span class="hint">${timeTxt}</span></div>
        <div class="num hero">${wkKm.toFixed(1)}</div><div class="hero-unit">킬로미터${target ? ` / 목표 ${target.toFixed(0)}km` : ""}</div>
        <p class="hint" style="margin:6px 0 0">설정에서 종목별 주간 거리를 적으면 목표가 종목별로 보여요.</p>${bars(perDay, DAY)}</div>`;
    }
    const NAME = { swim: ["🏊", "수영"], bike: ["🚴", "자전거"], run: ["🏃", "달리기"] };
    const doneOf = (k) => sum(wk.filter((a) => a.sport === k), (a) => a.distance_m || 0) / (k === "swim" ? 1 : 1000);
    const f = (k, v) => (k === "swim" ? `${Math.round(v).toLocaleString()}m` : `${v.toFixed(1)}km`);
    return `<div class="card"><div class="spread"><div class="eyebrow" style="margin:0">🎯 이번 주 목표 거리</div><span class="hint">${timeTxt}</span></div>
      ${keys.map((k) => {
        const d = doneOf(k), t = tg[k], pct = Math.min(100, (d / t) * 100);
        return `<div class="goal-row"><div class="spread"><b>${NAME[k][0]} ${NAME[k][1]}</b>
          <span><b class="num" style="font-size:20px">${f(k, d)}</b> <span class="hint">/ ${f(k, t)}</span></span></div>
          <div class="progress"><i style="width:${pct}%"></i></div>
          <div class="hint" style="margin-top:2px">${d >= t ? "달성! 🎉" : `${f(k, t - d)} 남음`}</div></div>`;
      }).join("")}
      <p class="hint" style="margin:8px 0 0">설정에 적은 주간 거리예요. 회복 주에는 70%로 줄어요.</p></div>`;
  }

  async function renderHome() {
    const p = TS.getProfile ? TS.getProfile() : null;
    const now = new Date();
    const h = now.getHours();
    const greet = h < 5 ? "늦은 밤이에요" : h < 11 ? "좋은 아침이에요" : h < 17 ? "좋은 오후예요" : "좋은 저녁이에요";
    const name = p && p.nickname ? `${esc(p.nickname)}님, ` : "";
    const mon = mondayOf(now);
    const { data: weekSess } = await TS.mine(db.from(TS.TABLE).select("*")).gte("date", iso(mon)).lte("date", iso(addDays(mon, 6)))
      .order("date").order("start_time", { nullsFirst: true });
    const plan = weekSess || [];
    if (!homeDay || homeDay < iso(mon) || homeDay > iso(addDays(mon, 6))) homeDay = iso(now);
    const list = plan.filter((s) => s.date === homeDay);

    const wk = inRange(acts, mon, addDays(mon, 7));
    const wkKm = sum(wk, km);
    const perDay = DAY.map((_, i) => sum(inRange(wk, addDays(mon, i), addDays(mon, i + 1)), km));
    const target = weeklyTargetKm(p);

    const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const mEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const mKm = sum(inRange(acts, mStart, mEnd), km);
    const mTarget = monthTargetKm(p);
    const left = Math.round((mEnd - now) / 864e5);

    const today0 = new Date(now.toDateString());
    const race = ((p && p.races) || []).filter((r) => r.date && new Date(r.date + "T00:00:00") >= today0)
      .sort((a, b) => a.date.localeCompare(b.date))[0];

    // ---- 이번 주 스케줄 (한눈에) ----
    const todayIso = iso(now);
    const planMin = sum(plan, (s) => s.duration_min || 0);
    const doneN = plan.filter((s) => s.completed).length;
    const strip = DAY.map((dn, i) => {
      const d = addDays(mon, i), dIso = iso(d);
      const ss = plan.filter((s) => s.date === dIso);
      return `<button type="button" class="wd${dIso === todayIso ? " today" : ""}${dIso === homeDay ? " sel" : ""}" data-hday="${dIso}">
        <span class="wn ${i === 6 ? "sun" : i === 5 ? "sat" : ""}">${dn}</span><span class="wdt">${d.getDate()}</span>
        ${ss.length ? ss.slice(0, 2).map((s) => { const n = parseNotes(s); return `<span class="wi${s.completed ? " dn" : ""}" style="background:${s.completed ? "#cbd5e1" : ZC[(n.z || 2) - 1]};color:${s.completed ? "#475569" : ZFG(n.z || 2)}">${CAT_ICON[s.category] || "•"}${n.z ? `<small>Z${n.z}</small>` : ""}</span>`; }).join("") : '<span class="wrest">휴식</span>'}
      </button>`;
    }).join("");
    const sd = new Date(homeDay + "T00:00:00");
    const dayTitle = homeDay === todayIso ? "오늘의 훈련" : `${sd.getMonth() + 1}/${sd.getDate()} ${DAY[(sd.getDay() + 6) % 7]}요일 훈련`;
    const todayHtml = list.length ? list.map((s) => sessHtml(s, homeDay === todayIso)).join("") : `<p class="hint" style="margin:0">${plan.length ? "이날은 쉬는 날이에요. 푹 쉬세요 😴" : "이번 주 계획이 아직 없어요."}</p>`;

    $("homeBody").innerHTML = `
      <div style="margin-bottom:14px"><div class="eyebrow">${now.getMonth() + 1}월 ${now.getDate()}일 ${DAY[(now.getDay() + 6) % 7]}요일</div>
        <h1 class="big">${name}${greet}</h1></div>
      ${(() => { // 🏁 대회 2주 전부터: 조정기 안내
        if (!race || !TS.E || !TS.E.prepAdvice) return "";
        const dd = Math.round((new Date(race.date + "T00:00:00") - today0) / 864e5);
        const a = TS.E.prepAdvice(race, dd, TS.E.sportKey ? TS.E.sportKey(p.sport) : "run");
        if (!a || dd < 1) return "";
        return `<div class="card prep-home"><div class="spread"><b>${esc(a.title)}</b><span class="zb" style="background:#ef4444">${esc(a.stage)}</span></div><ul>${a.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div>`;
      })()}

      <div class="card">
        <div class="spread"><div class="eyebrow" style="margin:0">📅 이번 주 스케줄</div>
          <span class="hint">${plan.length ? `${plan.length}회 · ${Math.floor(planMin / 60)}시간${planMin % 60 ? ` ${planMin % 60}분` : ""} · 완료 ${doneN}` : ""}</span></div>
        ${plan.length ? `<div class="progress" style="margin:8px 0 10px"><i style="width:${(doneN / plan.length) * 100}%"></i></div>` : ""}
        <div class="wstrip">${strip}</div>
        ${plan.length ? "" : `<button type="button" class="primary" id="hMakePlan" style="width:100%;padding:14px;margin-top:12px;border-radius:12px">📋 이번 주 훈련 계획 만들기</button>`}
      </div>

      <div class="card"><div class="spread"><div class="eyebrow" style="margin:0">${dayTitle}</div>
        <button type="button" class="link" id="hToPlan">전체 계획 ›</button></div>${todayHtml}</div>

      ${TS.coach ? `<div class="card coach-card"><div class="spread" style="align-items:flex-start;gap:10px">
          <div><div class="eyebrow" style="margin:0 0 2px">🧑‍🏫 코치</div><span class="hint">컨디션·시간에 맞춰 ${homeDay === todayIso ? "오늘" : "이날"} 훈련을 조정하거나, 궁금한 걸 물어보세요</span></div></div>
        <div style="display:flex;gap:8px;margin-top:10px"><button type="button" class="primary" data-coach="adjust" style="flex:1;padding:12px;border-radius:12px">${list.some((s) => !s.completed) ? "컨디션 맞춤" : "훈련 짜 주기"}</button>
          <button type="button" data-coach="chat" style="flex:1;padding:12px;border-radius:12px">💬 질문하기</button></div></div>` : ""}

      ${TS.isRecording && TS.isRecording() ? `<button type="button" class="primary" id="hGo" style="width:100%;padding:14px;font-size:15px;border-radius:14px;margin-bottom:12px">⏺ 기록 중 — 돌아가기</button>` : ""}

      ${weekGoalCard(p, wk, wkKm, target, perDay)}

      <div class="card">
        <div class="spread"><div class="eyebrow">이번 달 챌린지 · ${mTarget}km</div><span class="hint">${left}일 남음</span></div>
        <div class="spread" style="margin:6px 0 10px"><b class="num" style="font-size:34px">${mKm.toFixed(1)}km</b>
          <span class="hint">${mKm >= mTarget ? "달성! 🎉" : `${(mTarget - mKm).toFixed(1)}km 남음`}</span></div>
        <div class="progress"><i style="width:${Math.min(100, (mKm / mTarget) * 100)}%"></i></div>
      </div>

      ${race ? `<div class="card"><div class="eyebrow">다음 대회</div><div class="spread"><b>${esc(race.name || "대회")}</b>
        <b class="num" style="font-size:34px;color:var(--accent)">D-${Math.round((new Date(race.date + "T00:00:00") - today0) / 864e5)}</b></div>
        <div class="hint">${esc(race.event || "")} · ${esc(race.date)}</div></div>` : ""}

      ${acts[0] ? `<div class="eyebrow mt">최근 활동</div>${actCard(acts[0])}` : ""}
    `;
    if ($("hGo")) $("hGo").onclick = () => TS.openTracker();
    if ($("hMakePlan")) $("hMakePlan").onclick = () => TS.openPlan();
    $("hToPlan").onclick = () => showTab("plan");
    $("homeBody").querySelectorAll("[data-coach]").forEach((b) => {
      b.onclick = () => b.dataset.coach === "chat" ? TS.coach.openChat() : TS.coach.openAdjust(homeDay, list.find((s) => !s.completed) || null);
    });
    $("homeBody").querySelectorAll("[data-hday]").forEach((b) => { b.onclick = () => { homeDay = b.dataset.hday; renderHome(); }; });
    $("homeBody").querySelectorAll("[data-start]").forEach((b) => {
      b.onclick = () => startSession(list.find((x) => x.id === b.dataset.start));
    });
    bindActCards($("homeBody"));
  }

  // ---------- 활동 목록·통계 ----------
  function actCard(a) {
    const d = dateOf(a);
    const route = a.route && a.route.length > 1 ? TS.routeSvg(a.route, 64, 64) : SP[a.sport].icon;
    return `<button type="button" class="act" data-act="${esc(a.id)}">
      <div class="route">${route}</div>
      <div class="main"><div class="d">${d.getMonth() + 1}/${d.getDate()} ${DAY[(d.getDay() + 6) % 7]} · ${esc(a.title || SP[a.sport].name)}</div>
        <div class="km num">${distText(a)}</div>
        <div class="meta">${speedText(a)} · ${fmtDur(a.duration_s)}${a.rpe ? ` · RPE ${a.rpe}` : ""}${a.local ? " · 이 기기에만 저장" : ""}</div></div>
    </button>`;
  }
  function bindActCards(root) {
    root.querySelectorAll("[data-act]").forEach((b) => {
      b.onclick = () => { const a = acts.find((x) => String(x.id) === b.dataset.act); if (a) openActivity(a); };
    });
  }

  function periodRange() {
    const now = new Date();
    if (period === "week") { const s = addDays(mondayOf(now), 7 * offset); return [s, addDays(s, 7)]; }
    if (period === "month") { const s = new Date(now.getFullYear(), now.getMonth() + offset, 1); return [s, new Date(s.getFullYear(), s.getMonth() + 1, 1)]; }
    if (period === "year") { const s = new Date(now.getFullYear() + offset, 0, 1); return [s, new Date(s.getFullYear() + 1, 0, 1)]; }
    return [new Date(2000, 0, 1), new Date(2100, 0, 1)];
  }
  function periodLabel(s) {
    if (period === "week") { const e = addDays(s, 6); return `${s.getMonth() + 1}/${s.getDate()} – ${e.getMonth() + 1}/${e.getDate()}`; }
    if (period === "month") return `${s.getFullYear()}년 ${s.getMonth() + 1}월`;
    if (period === "year") return `${s.getFullYear()}년`;
    return "전체 기간";
  }
  function renderActivity() {
    const [s, e] = periodRange();
    const pool = filter === "all" ? acts : acts.filter((a) => a.sport === filter);
    const list = inRange(pool, s, e);
    const totKm = sum(list, km), totT = sum(list, (a) => a.duration_s || 0);
    const runs = list.filter((a) => a.sport === "run");
    const runPace = sum(runs, (a) => a.distance_m || 0) ? (sum(runs, (a) => a.duration_s || 0) * 1000) / sum(runs, (a) => a.distance_m || 0) : 0;

    let vals = [], labels = [];
    if (period === "week") { vals = DAY.map((_, i) => sum(inRange(list, addDays(s, i), addDays(s, i + 1)), km)); labels = DAY; }
    else if (period === "month") {
      const n = new Date(s.getFullYear(), s.getMonth() + 1, 0).getDate();
      for (let i = 0; i < n; i++) { vals.push(sum(inRange(list, addDays(s, i), addDays(s, i + 1)), km)); labels.push((i + 1) % 5 === 1 ? String(i + 1) : ""); }
    } else if (period === "year") {
      for (let m = 0; m < 12; m++) { vals.push(sum(inRange(list, new Date(s.getFullYear(), m, 1), new Date(s.getFullYear(), m + 1, 1)), km)); labels.push(String(m + 1)); }
    }

    $("actBody").innerHTML = `
      <div class="seg">${[["week", "주"], ["month", "월"], ["year", "년"], ["all", "전체"]].map(([k, l]) =>
        `<button type="button" data-period="${k}" class="${period === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <div class="chips" style="margin-bottom:12px">${[["all", "전체"], ["run", "🏃 달리기"], ["bike", "🚴 자전거"], ["swim", "🏊 수영"], ["tri", "🏅 철인3종"]].map(([k, l]) =>
        `<button type="button" class="chip${filter === k ? " on" : ""}" data-filter="${k}">${l}</button>`).join("")}</div>
      <div class="card">
        <div class="spread">${period !== "all" ? `<button type="button" class="icon" data-off="-1">‹</button>` : "<span></span>"}
          <b>${periodLabel(s)}</b>
          ${period !== "all" ? `<button type="button" class="icon" data-off="1" ${offset >= 0 ? "disabled" : ""}>›</button>` : "<span></span>"}</div>
        <div style="text-align:center;margin-top:12px"><div class="num hero">${totKm.toFixed(1)}</div><div class="hero-unit">킬로미터</div></div>
        <div class="trio" style="text-align:center">
          <div><b class="num">${list.length}</b><span>활동</span></div>
          <div><b class="num">${fmtDur(totT)}</b><span>시간</span></div>
          <div><b class="num">${runs.length ? fmtPace(runPace) : "-"}</b><span>평균 달리기 페이스</span></div>
        </div>
        ${vals.length ? bars(vals, labels) : ""}
      </div>
      ${TS.store.cloud ? "" : `<div class="note" style="margin-bottom:12px">⚠️ 활동 기록이 이 기기에만 저장되고 있어요. ${TS.auth && TS.auth.user ? "Supabase SQL Editor에서 <code>schema_profile.sql</code> → <code>schema_garmin.sql</code> → <code>schema_community.sql</code> 순서로 실행하면 계정에 저장돼요." : "로그인하면 계정에 저장돼요 (나 → 로그인)."}</div>`}
      ${list.length ? list.map(actCard).join("") : `<div class="card" style="text-align:center"><p class="hint">이 기간에 기록이 없어요.</p>
        <button type="button" class="primary" id="aGo">▶ 첫 기록 시작하기</button></div>`}
    `;
    $("actBody").querySelectorAll("[data-period]").forEach((b) => { b.onclick = () => { period = b.dataset.period; offset = 0; renderActivity(); }; });
    $("actBody").querySelectorAll("[data-filter]").forEach((b) => { b.onclick = () => { filter = b.dataset.filter; renderActivity(); }; });
    $("actBody").querySelectorAll("[data-off]").forEach((b) => { b.onclick = () => { offset = Math.min(0, offset + +b.dataset.off); renderActivity(); }; });
    if ($("aGo")) $("aGo").onclick = () => TS.openTracker();
    bindActCards($("actBody"));
  }

  // ---------- 활동 상세 ----------
  function openActivity(a, fresh) {
    if (fresh && !acts.some((x) => x.id === a.id)) acts = [a, ...acts]; // 방금 저장한 기록도 배지 계산에 포함
    const d = dateOf(a);
    const bike = a.sport === "bike";
    const efforts = a.sport === "run" ? EFFORTS.map(([l, dist]) => [l, bestEffort(a, dist)]).filter((x) => x[1]) : [];
    const sp = a.splits || [];
    const unit = bike ? 5 : 1;
    const maxSec = Math.max(...sp.map((x) => x.sec), 1), minSec = Math.min(...sp.map((x) => x.sec), maxSec);
    $("detailBody").innerHTML = `
      <div class="wz-top"><button type="button" class="icon" id="dBack" aria-label="뒤로">‹</button>
        <div style="flex:1"><b>${esc(a.title || SP[a.sport].name)}</b>
        <div class="hint">${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()} ${DAY[(d.getDay() + 6) % 7]}요일 ${TS.pad(d.getHours())}:${TS.pad(d.getMinutes())}</div></div>
        <button type="button" class="pill" data-home="1">🏠 홈</button>
        <button type="button" class="danger pill" id="dDel">삭제</button></div>
      ${fresh ? `<div class="note" style="margin:0 0 12px">저장했어요! 💪 ${newBadgeText()}</div>` : ""}
      ${a.route && a.route.length > 1 ? `<div class="map" id="dMap"></div>` : ""}
      ${a.source === "strava" ? `<div class="card"><div class="spread"><span class="hint">🔒 스트라바 기록은 약관상 본인만 볼 수 있어요</span>
        ${a.external_id ? `<a class="strava-link" href="https://www.strava.com/activities/${esc(String(a.external_id).replace("strava:", ""))}" target="_blank" rel="noopener">Strava에서 보기 ›</a>` : ""}</div>
        <div class="hint" style="margin-top:4px">Powered by Strava</div></div>` : ""}
      ${a.source !== "strava" && !a.local && a.visibility && TS.auth && TS.auth.user && a.user_id === TS.auth.user.id ? `<div class="card"><div class="set-row" style="border:0;padding:0">
        <span>커뮤니티 공개 범위</span><select id="dVis" style="width:auto">${[["friends", "👥 친구만"], ["public", "🌏 전체 공개"], ["private", "🔒 나만"]].map(([v, l]) => `<option value="${v}"${a.visibility === v ? " selected" : ""}>${l}</option>`).join("")}</select></div></div>` : ""}
      <div class="card"><div class="stats4">
        <div><b class="num">${distText(a)}</b><span>거리</span></div>
        <div><b class="num">${fmtDur(a.duration_s)}</b><span>시간</span></div>
        <div><b class="num">${speedText(a)}</b><span>${bike ? "평균 속도" : a.sport === "swim" ? "100m 평균" : "평균 페이스"}</span></div>
        <div><b class="num">${a.rpe || "-"}</b><span>운동 자각도${a.rpe && TS.RPE_TXT ? ` · ${TS.RPE_TXT[a.rpe]}` : ""}</span></div>
      </div></div>
      ${sp.length ? `<div class="card"><h3>구간 기록 (${unit}km)</h3>${sp.map((x) => `<div class="split"><span>${x.km}</span>
        <b>${bike ? ((unit * 3600) / x.sec).toFixed(1) : fmtPace(x.sec / unit)}</b>
        <i style="width:${Math.max(8, 100 - ((x.sec - minSec) / Math.max(maxSec - minSec, 1)) * 60)}%;${x.sec === minSec ? "" : "opacity:.6"}"></i></div>`).join("")}
        <p class="hint">가장 긴 막대가 가장 빠른 구간이에요.</p></div>` : ""}
      ${efforts.length ? `<div class="card"><h3>이 활동의 최고 구간</h3>${efforts.map(([l, t]) => `<div class="pr-row"><span>${l}</span><b>${fmtDur(t)}</b></div>`).join("")}</div>` : ""}
      ${hrCard(a)}
      <div class="card"><div class="spread"><h3 style="margin:0">📷 사진·동영상</h3>
          <button type="button" class="pill primary" id="dAddMedia">+ 올리기</button></div>
        <input type="file" id="dFile" accept="image/*,video/*" multiple hidden />
        <p class="hint" id="dMediaMsg" style="margin:8px 0">불러오는 중…</p>
        <div class="media" id="dMedia"></div></div>
      ${a.notes ? `<div class="card"><h3>메모</h3><div class="txt" style="white-space:pre-line">${esc(a.notes)}</div></div>` : ""}
      <p class="hint">${a.source === "manual" ? "직접 입력한 기록" : a.source === "demo" ? "테스트 모드 기록" : "GPS 기록"}${a.local ? " · 이 기기에만 저장됨" : ""}</p>`;
    $("detailOv").classList.add("show");
    $("detailOv").scrollTop = 0;
    document.body.style.overflow = "hidden";
    $("dBack").onclick = closeDetail;
    $("dDel").onclick = async () => {
      if (!await TS.ask("이 활동을 삭제할까요? 되돌릴 수 없어요.")) return;
      if (await TS.deleteActivity(a)) closeDetail();
    };
    if ($("dVis")) $("dVis").onchange = (e) => TS.setVisibility(a, e.target.value);
    $("dAddMedia").onclick = () => $("dFile").click();
    $("dFile").onchange = (e) => uploadMedia(a, [...e.target.files]);
    loadMedia(a);
    if ($("dMap") && window.L) {
      setTimeout(() => {
        map = L.map("dMap", { zoomControl: false, attributionControl: true });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(map);
        const ll = a.route.map((p) => [p[0], p[1]]);
        const line = L.polyline(ll, { color: "#1d6bf3", weight: 5 }).addTo(map);
        L.circleMarker(ll[0], { radius: 6, color: "#22c55e", fillOpacity: 1 }).addTo(map);
        L.circleMarker(ll[ll.length - 1], { radius: 6, color: "#f05252", fillOpacity: 1 }).addTo(map);
        map.fitBounds(line.getBounds(), { padding: [24, 24] });
      }, 50);
    }
  }
  // ---------- ❤️ 심박 (가민 시계·심박 벨트·가져온 파일) ----------
  function hrSeriesOf(a) {
    if (a.hr_series && a.hr_series.length) return a.hr_series;
    return (a.route || []).filter((p) => p[3]).map((p) => [p[2], p[3]]);
  }
  function hrCard(a) {
    const s = hrSeriesOf(a);
    if (!s.length && !a.avg_hr) return "";
    const vals = s.map((x) => x[1]);
    const avg = a.avg_hr || Math.round(vals.reduce((x, y) => x + y, 0) / vals.length);
    const max = a.max_hr || Math.max(...vals);
    // 존별 시간
    const zt = {};
    let zoneHtml = "";
    if (s.length > 1 && TS.hrZone && TS.hrZone(avg, a.sport)) {
      for (let i = 1; i < s.length; i++) { const z = TS.hrZone(s[i][1], a.sport); if (z) zt[z.z] = (zt[z.z] || 0) + Math.min(60, s[i][0] - s[i - 1][0]); }
      const tot = Object.values(zt).reduce((x, y) => x + y, 0) || 1;
      const T = a.sport === "bike" ? TS.E.FRIEL_BIKE : TS.E.FRIEL_RUN;
      const col = ["#94a3b8", "#16a34a", "#ca8a04", "#ea580c", "#dc2626", "#b91c1c", "#7f1d1d"];
      zoneHtml = `<div class="lbl" style="font-size:12px;color:var(--muted);font-weight:700;margin-top:12px">존별 시간 (프릴 LTHR 기준)</div>` +
        T.map((r, i) => zt[r[0]] ? `<div class="split" style="grid-template-columns:70px 52px 1fr"><span>${r[0]} ${r[1]}</span><b>${fmtDur(zt[r[0]])}</b><i style="width:${Math.max(4, (zt[r[0]] / tot) * 100)}%;background:${col[i]}"></i></div>` : "").join("");
    }
    let chart = "";
    if (s.length > 2) {
      const W = 320, Hh = 90, t1 = s[s.length - 1][0] || 1, lo = Math.min(...vals) - 5, hi = Math.max(...vals) + 5;
      const pts = s.map(([t, v]) => `${((t / t1) * W).toFixed(1)},${(Hh - ((v - lo) / (hi - lo)) * Hh).toFixed(1)}`).join(" ");
      chart = `<svg viewBox="0 0 ${W} ${Hh}" width="100%" style="max-height:110px;margin-top:8px"><polyline points="${pts}" fill="none" stroke="#e11d48" stroke-width="2" stroke-linejoin="round"/></svg>`;
    }
    return `<div class="card"><h3>❤️ 심박${a.device ? ` <span class="hint">${esc(a.device)}</span>` : ""}</h3>
      <div class="stats4"><div><b class="num">${avg}</b><span>평균 bpm</span></div><div><b class="num">${max}</b><span>최고 bpm</span></div></div>
      ${chart}${zoneHtml}</div>`;
  }

  // ---------- 사진·동영상 (Supabase Storage 'media' 버킷, 활동 id 폴더) ----------
  const BUCKET = "media";
  const MEDIA_HELP = "사진·동영상 저장 공간이 아직 없어요. Supabase SQL Editor에서 schema_media.sql을 실행해 주세요.";
  const isVideo = (name) => /\.(mp4|mov|webm|m4v|3gp)$/i.test(name);
  async function loadMedia(a) {
    const box = $("dMedia"), msg = $("dMediaMsg");
    if (!box) return;
    const folder = String(a.id);
    const { data, error } = await db.storage.from(BUCKET).list(folder, { limit: 100, sortBy: { column: "name", order: "asc" } });
    if (!$("dMedia")) return;
    if (error) { msg.textContent = /not found|bucket/i.test(error.message) ? MEDIA_HELP : "불러오기 실패: " + error.message; return; }
    const files = (data || []).filter((f) => f.name && !f.name.startsWith("."));
    msg.textContent = files.length ? `${files.length}개` : "아직 없어요. 운동 사진이나 영상을 올려 보세요. (파일 1개 최대 50MB)";
    box.innerHTML = files.map((f) => {
      const path = `${folder}/${f.name}`;
      const url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      return `<div class="m">${isVideo(f.name)
        ? `<video src="${esc(url)}" controls playsinline preload="metadata"></video>`
        : `<a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="운동 사진" loading="lazy" /></a>`}
        <button type="button" class="x" data-rm="${esc(path)}" aria-label="삭제">✕</button></div>`;
    }).join("");
    box.querySelectorAll("[data-rm]").forEach((b) => {
      b.onclick = async () => {
        if (!await TS.ask("이 파일을 지울까요? 되돌릴 수 없어요.")) return;
        const { error: e2 } = await db.storage.from(BUCKET).remove([b.dataset.rm]);
        if (e2) alert("삭제 실패: " + e2.message);
        loadMedia(a);
      };
    });
  }
  async function uploadMedia(a, files) {
    const msg = $("dMediaMsg");
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.size > 50 * 1024 * 1024) { alert(`${f.name}: 50MB보다 커서 올릴 수 없어요.`); continue; }
      msg.textContent = `올리는 중… (${i + 1}/${files.length}) ${f.name}`;
      const ext = (f.name.match(/\.[a-z0-9]+$/i) || [""])[0].toLowerCase();
      const path = `${a.id}/${Date.now()}-${i}${ext}`;
      const { error } = await db.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined, upsert: false });
      if (error) { msg.textContent = /not found|bucket/i.test(error.message) ? MEDIA_HELP : "올리기 실패: " + error.message; return; }
    }
    $("dFile").value = "";
    loadMedia(a);
  }

  function closeDetail() {
    if (map) { map.remove(); map = null; }
    $("detailOv").classList.remove("show");
    document.body.style.overflow = "";
  }
  TS.openActivity = openActivity;
  function newBadgeText() {
    const s = stats();
    const got = BADGES.filter((b) => { const [c, g] = b.p(s); return c >= g; });
    return got.length ? `지금까지 배지 ${got.length}개를 모았어요.` : "";
  }

  // ---------- 나 ----------
  async function renderMe() {
    const p = TS.getProfile ? TS.getProfile() : null;
    const s = stats();
    const lv = levelOf(s.total);
    const st = streaks();
    const mon = mondayOf(new Date());
    const { data: wkSess } = await TS.mine(db.from(TS.TABLE).select("completed")).gte("date", iso(mon)).lte("date", iso(addDays(mon, 6)));
    const ws = wkSess || [];
    const done = ws.filter((x) => x.completed).length;
    const now = new Date();
    const mKm = sum(inRange(acts, new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1)), km);
    const mTarget = monthTargetKm(p);

    const myPR = p ? Object.entries(p.records || {}).filter(([, r]) => r && r.pr) : [];
    const appPR = appPRs();
    const badgeHtml = BADGES.map((b) => {
      const [c, g] = b.p(s);
      const ok = c >= g;
      return `<div class="badge${ok ? "" : " locked"}" title="${esc(b.desc)}"><div class="em">${b.icon}</div><div class="bn">${b.name}</div>
        <div class="bp">${ok ? "획득 ✓" : g > 1 ? `${Math.floor(Math.min(c, g) * 10) / 10}/${g}` : esc(b.desc)}</div></div>`;
    }).join("");
    const earned = BADGES.filter((b) => { const [c, g] = b.p(s); return c >= g; }).length;

    $("meBody").innerHTML = `
      <div class="card" style="text-align:center">
        <button type="button" class="avatar avatar-btn" id="meAvatar" style="margin:0 auto 6px" aria-label="프로필 사진 바꾸기">${avatarSrc() ? `<img src="${esc(avatarSrc())}" alt="프로필 사진" />` : (p && p.sport ? TS.SPORTS[p.sport].icon : "🏁")}<span class="cam">📷</span></button>
        <input type="file" id="meAvatarFile" accept="image/*" hidden />
        <div><button type="button" class="link" id="meAvatarEdit">${avatarSrc() ? "사진 바꾸기" : "프로필 사진 등록"}</button>${avatarSrc() ? ` <button type="button" class="link" id="meAvatarDel">삭제</button>` : ""}</div>
        <b style="font-size:20px">${esc((p && p.nickname) || "나")}</b>
        <div class="hint">${p && p.sport ? `${p.sport} 선수` : "종목을 골라주세요"}</div>
        <div class="mt"><span class="lvl">Lv.${lv.n} ${lv.name}</span></div>
        <div class="progress mt"><i style="width:${lv.pct}%"></i></div>
        <div class="hint" style="margin-top:6px">${lv.next ? `다음 레벨(${lv.next[1]})까지 ${(lv.next[0] - s.total).toFixed(1)}km` : "최고 레벨이에요!"}</div>
        <div class="trio">
          <div><b class="num">${s.total.toFixed(1)}</b><span>총 km</span></div>
          <div><b class="num">${s.count}</b><span>활동</span></div>
          <div><b class="num">${fmtDur(sum(acts, (a) => a.duration_s || 0))}</b><span>총 시간</span></div>
        </div>
      </div>

      <div class="card"><h3>🏆 챌린지</h3>
        <div class="spread"><span>이번 달 ${mTarget}km</span><span class="hint">${mKm.toFixed(1)}km</span></div>
        <div class="progress" style="margin:6px 0 14px"><i style="width:${Math.min(100, (mKm / mTarget) * 100)}%"></i></div>
        <div class="spread"><span>이번 주 계획 완수</span><span class="hint">${done}/${ws.length}</span></div>
        <div class="progress" style="margin:6px 0 14px"><i style="width:${ws.length ? (done / ws.length) * 100 : 0}%"></i></div>
        <div class="spread"><span>🔥 연속 훈련</span><b class="num" style="font-size:24px">${st.cur}일 <span class="hint">(최고 ${st.max}일)</span></b></div>
      </div>

      <div class="card"><h3>⏱ 개인 최고 기록</h3>
        ${appPR.map((x) => `<div class="pr-row"><span>${x.label} <span class="hint">앱 기록</span></span><b>${fmtDur(x.sec)}</b></div>`).join("")}
        ${myPR.map(([k, r]) => `<div class="pr-row"><span>${esc(prLabel(k))}${r.year ? ` <span class="hint">올해 목표 ${esc(r.year)}</span>` : ""}</span><b>${esc(r.pr)}</b></div>`).join("")}
        ${!appPR.length && !myPR.length ? '<p class="hint">아직 기록이 없어요. 설정에서 최고 기록을 적거나 달리기를 기록해 보세요.</p>' : ""}
      </div>

      <div class="card"><div class="spread"><h3 style="margin:0">🎖 배지</h3><span class="hint">${earned}/${BADGES.length}</span></div>
        <div class="badges mt">${badgeHtml}</div></div>

      ${accountCard()}
      <div class="card"><h3>⚙️ 설정</h3>
        <div class="set-row"><span>프로필 · 종목 · 기록 · 대회</span><button type="button" class="pill" id="meEdit">수정</button></div>
        <div class="set-row"><span>자동 훈련 계획</span><button type="button" class="pill" id="mePlan">보기</button></div>
        <div class="set-row"><span>❤️ 심박 존 가이드 (최대심박 계산기)</span><button type="button" class="pill" data-zguide="0">열기</button></div>
        <div class="set-row"><span>🔮 대회 기록 예측</span><button type="button" class="pill" data-predict="1">보기</button></div>
        <div class="set-row"><span>🎯 목표 대회·기록</span><button type="button" class="pill" id="meGoal">바꾸기</button></div>
        <div class="set-row"><span>기록 중 음성 안내</span><button type="button" class="pill" id="meVoice">${voiceOn() ? "켜짐 🔊" : "꺼짐 🔇"}</button></div>
        <div class="set-row"><span>데이터 저장</span><span class="hint">${TS.store.cloud && TS.isProfileCloud() ? "Supabase ✓" : "일부 이 기기에만 저장 — <code>schema_profile.sql</code> 실행 필요"}</span></div>
      </div>`;
    bindAccount();
    bindAvatar();
    $("meEdit").onclick = () => TS.openWizard(1);
    $("mePlan").onclick = () => TS.openPlan();
    if ($("meGoal")) $("meGoal").onclick = () => TS.openGoal(() => TS.openPlan(true));
    $("meVoice").onclick = () => {
      try { localStorage.setItem("training.voice", voiceOn() ? "off" : "on"); } catch (e) { /* 무시 */ }
      renderMe();
    };
  }
  // ---------- 프로필 사진 ----------
  // 로그인 + SQL 실행 시: Supabase에 저장(커뮤니티에도 보여요) / 아니면 이 기기에만 저장
  const AV_KEY = "training.avatar";
  function avatarSrc() {
    const m = TS.auth && TS.auth.member;
    if (m && m.avatar_url) return m.avatar_url;
    try { return localStorage.getItem(AV_KEY) || ""; } catch (e) { return ""; }
  }
  async function smallDataUrl(file, size = 256) {
    const bmp = await createImageBitmap(file);
    const s = Math.min(bmp.width, bmp.height);
    const c = document.createElement("canvas");
    c.width = c.height = size;
    c.getContext("2d").drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size); // 가운데를 정사각형으로 자르기
    return c.toDataURL("image/jpeg", 0.85);
  }
  async function setAvatar(file) {
    if (!file || !/^image\//.test(file.type)) { alert("사진 파일을 골라 주세요."); return; }
    const A = TS.auth || {};
    let saved = false;
    try {
      const dataUrl = await smallDataUrl(file);
      if (A.user && A.member && TS.uploadImage) {
        const blob = await (await fetch(dataUrl)).blob();
        const path = `avatars/${A.user.id}.jpg`;
        const { error: upErr } = await db.storage.from("media").upload(path, blob, { contentType: "image/jpeg", upsert: true });
        if (!upErr) {
          const url = `${TS.pubUrl(path)}?v=${Date.now()}`;
          const { data, error } = await db.from("members").update({ avatar_url: url }).eq("id", A.user.id).select().single();
          if (!error) { A.member = data; saved = true; }
        }
      }
      try { localStorage.setItem(AV_KEY, dataUrl); } catch (e) { /* 저장 공간 없음 */ }
      if (!saved && A.user) alert("사진을 이 기기에만 저장했어요. 커뮤니티에도 보이게 하려면 Supabase에서 schema_community.sql을 실행해 주세요.");
    } catch (e) { alert("사진을 읽지 못했어요: " + (e.message || e)); }
    renderMe();
  }
  async function removeAvatar() {
    if (!await TS.ask("프로필 사진을 지울까요?", "삭제")) return;
    try { localStorage.removeItem(AV_KEY); } catch (e) { /* 무시 */ }
    const A = TS.auth || {};
    if (A.user && A.member && A.member.avatar_url) {
      await db.storage.from("media").remove([`avatars/${A.user.id}.jpg`]);
      const { data } = await db.from("members").update({ avatar_url: null }).eq("id", A.user.id).select().single();
      if (data) A.member = data;
    }
    renderMe();
  }
  function bindAvatar() {
    const pick = () => $("meAvatarFile").click();
    $("meAvatar").onclick = pick;
    $("meAvatarEdit").onclick = pick;
    $("meAvatarFile").onchange = (e) => { const f = e.target.files[0]; e.target.value = ""; setAvatar(f); };
    if ($("meAvatarDel")) $("meAvatarDel").onclick = removeAvatar;
  }

  // ---------- 계정 · 공개 설정 ----------
  function accountCard() {
    const A = TS.auth || {};
    const pv = TS.privacy();
    const nLocal = TS.lsLocalCount();
    const acct = !A.user
      ? `<div class="set-row"><span>로그인하면 기록이 계정에 저장되고 커뮤니티를 쓸 수 있어요</span><button type="button" class="primary pill" id="acLogin">로그인</button></div>`
      : `<div class="set-row"><span>👤 <b>${esc((A.member && A.member.nickname) || "")}</b> <span class="hint">${esc(A.user.email || "")}</span></span><button type="button" class="pill" id="acNick">닉네임 변경</button></div>
         ${nLocal ? `<div class="set-row"><span>이 기기에만 있는 기록 ${nLocal}개</span><button type="button" class="pill" id="acUp">계정에 올리기</button></div>` : ""}
         <div class="set-row"><span>로그아웃</span><button type="button" class="pill" id="acOut">로그아웃</button></div>`;
    return `<div class="card"><h3>👤 계정 · 공개 설정</h3>${acct}
      <div class="set-row"><span>🟧 스트라바 연동 <span class="hint">(내 기록 자동 가져오기 · 나만 보기)</span></span>${TS.strava ? TS.strava.statusHtml() : ""}</div>
      <div class="set-row"><span>새 기록 기본 공개 범위</span>
        <select id="acVis" style="width:auto">${[["friends", "👥 친구만"], ["public", "🌏 전체 공개"], ["private", "🔒 나만"]].map(([v, l]) => `<option value="${v}"${pv.visibility === v ? " selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="set-row"><span>지도에서 출발·도착 200m 가리기 <span class="hint">(집 위치 보호)</span></span>
        <label class="check"><input type="checkbox" id="acHide" ${pv.hideEnds ? "checked" : ""} /> 켜기</label></div>
      ${A.user && !TS.store.cloud && TS.store.reason === "sql" ? `<div class="note">⚠️ 계정 저장을 쓰려면 Supabase에서 <code>schema_community.sql</code>을 실행해 주세요. 지금은 이 기기에 저장돼요.</div>` : ""}</div>`;
  }
  function bindAccount() {
    const A = TS.auth || {};
    if ($("acLogin")) $("acLogin").onclick = () => A.open("login");
    if ($("acOut")) $("acOut").onclick = () => A.signOut();
    if ($("acNick")) $("acNick").onclick = () => { const n = prompt("새 닉네임 (20자 이내)", (A.member && A.member.nickname) || ""); if (n && n.trim()) A.updateNickname(n.trim()); };
    if ($("acUp")) $("acUp").onclick = async (e) => {
      e.target.disabled = true; e.target.textContent = "올리는 중…";
      const r = await TS.uploadLocal();
      alert(`${r.ok}개 올렸어요${r.fail ? `, ${r.fail}개 실패 (schema_community.sql 실행 필요)` : ""}.`);
      refresh();
    };
    $("acVis").onchange = (e) => TS.setPrivacy({ visibility: e.target.value });
    $("acHide").onchange = (e) => TS.setPrivacy({ hideEnds: e.target.checked });
  }

  const voiceOn = () => { try { return localStorage.getItem("training.voice") !== "off"; } catch (e) { return true; } };
  function prLabel(k) {
    const [a, b, c] = k.split(".");
    if (a === "swim") return `수영 ${b} ${c}m`;
    if (a === "run") return `달리기 ${b}`;
    if (a === "bike") return { ftp: "FTP (W)", wkg: "FTP (W/kg)", tt40: "자전거 40km" }[b] || b;
    if (a === "tri") return `철인3종 ${{ sprint: "스프린트", olympic: "올림픽", half: "하프", full: "아이언맨" }[b] || b} · ${{ swim: "수영", bike: "자전거", run: "달리기", total: "총" }[c] || c}`;
    return k;
  }

  refresh();
})();
