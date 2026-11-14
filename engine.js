// 훈련 과학 계산 + 연간·월간·주간 훈련 계획
// 참고한 방법 (내용을 요약해 앱 계산에 반영)
//  - 달리기: 잭 다니엘스 『러닝 포뮬러』 VDOT · E/M/T/I/R · 4단계 시즌 · 질 훈련 양 상한
//            맷 피츠제럴드 『80/20 러닝』·『Run Like a Pro』 강도 분배
//  - 수영:   Swim Smooth · 『Science of Swimming Faster』 CSS 기반 세트, 기술 → CSS → 레이스 특화
//  - 자전거: 조 프릴 『Cyclist's Training Bible』 준비 → 기초 1~3 → 강화 1~2 → 피크 → 레이스, 코건 FTP 7존
//  - 철인3종: 80/20 트라이애슬론 · 프릴 『Your Best Triathlon』 · 세일러 폴라리제드, 거리별 권장 주간 시간
(function () {
  const TS = window.TS;
  const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : null; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const r5 = (v) => Math.max(5, Math.round(v / 5) * 5);
  const round1 = (v) => Math.round(v * 10) / 10;
  const DAYS_KO = ["월", "화", "수", "목", "금", "토", "일"];

  // ---------- 시간 ----------
  function parseTime(s) {
    if (s == null) return null;
    s = String(s).trim().replace(/시간/g, ":").replace(/분/g, ":").replace(/초/g, "").replace(/\s+/g, "").replace(/:$/, ":0");
    if (!s || !/^[\d:.]+$/.test(s)) return null;
    const parts = s.split(":").map(Number);
    if (parts.some(isNaN)) return null;
    const v = parts.reduce((a, x) => a * 60 + x, 0);
    return v > 0 ? v : null;
  }
  function fmt(sec) {
    if (sec == null || !isFinite(sec)) return "-";
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  }
  // 숫자만 입력해도 시간 형식으로: 3100 → 31:00, 13000 → 1:30:00, 105.32 → 1:05.32
  function autoTime(v) {
    v = String(v || "");
    if (/[^\d:.]/.test(v)) return v;
    const [ip, dp] = v.replace(/:/g, "").split(".");
    const d = ip.replace(/\D/g, "").slice(0, 6);
    let out;
    if (d.length <= 2) out = d;
    else if (d.length <= 4) out = `${+d.slice(0, -2)}:${d.slice(-2)}`;
    else out = `${+d.slice(0, -4)}:${d.slice(-4, -2)}:${d.slice(-2)}`;
    return dp !== undefined ? `${out}.${dp.replace(/\D/g, "").slice(0, 2)}` : out;
  }
  const minLabel = (m) => (m < 60 ? `${m}분` : m % 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m / 60}시간`);

  // ---------- 종목·기록 ----------
  const DISC = {
    swim: { name: "수영", cat: "수영", icon: "🏊", unit: "m", ph: "예: 6000" },
    bike: { name: "자전거", cat: "사이클", icon: "🚴", unit: "km", ph: "예: 150" },
    run: { name: "달리기", cat: "러닝", icon: "🏃", unit: "km", ph: "예: 40" },
  };
  const sportKey = (s) => ({ 수영: "swim", 자전거: "bike", 육상: "run" }[s] || "tri");
  const discsOf = (s) => ({ 수영: ["swim"], 자전거: ["bike"], 육상: ["run"] }[s] || ["swim", "bike", "run"]);
  const SWIM_EVENTS = { 자유형: [50, 100, 200, 400, 800, 1500], 배영: [50, 100, 200], 평영: [50, 100, 200], 접영: [50, 100, 200], 개인혼영: [200, 400] };
  const SWIM_PH = { 50: "0:28.50", 100: "1:05.00", 200: "2:20.00", 400: "4:50.00", 800: "10:00.00", 1500: "19:00.00" };
  const RUN_EVENTS = [
    ["100m", 100, "12.50"], ["200m", 200, "25.80"], ["400m", 400, "58.00"], ["800m", 800, "2:10"],
    ["1500m", 1500, "4:40"], ["3000m", 3000, "10:00"], ["5km", 5000, "17:30"], ["10km", 10000, "35:07"],
    ["하프마라톤", 21097, "1:18:00"], ["마라톤", 42195, "2:50:00"],
  ];
  const TRI_RACES = [
    ["sprint", "스프린트", "수영 750m · 자전거 20km · 달리기 5km", ["11:00", "35:00", "20:00", "1:10:00"]],
    ["olympic", "올림픽", "수영 1.5km · 자전거 40km · 달리기 10km", ["22:00", "1:05:00", "38:00", "2:10:00"]],
    ["half", "하프 아이언맨 (70.3)", "수영 1.9km · 자전거 90km · 달리기 21.1km", ["30:00", "2:30:00", "1:35:00", "4:45:00"]],
    ["full", "아이언맨", "수영 3.8km · 자전거 180km · 달리기 42.2km", ["1:05:00", "5:10:00", "3:30:00", "10:00:00"]],
  ];
  const TRI_LEGS = [["swim", "수영"], ["bike", "자전거"], ["run", "달리기"], ["total", "총 기록"]];
  const TRI_RUN_D = { sprint: 5000, olympic: 10000, half: 21097, full: 42195 };
  const rec = (p, key, col = "pr") => (p.records && p.records[key] ? p.records[key][col] || "" : "");

  // ---------- 목표 거리 (+ 권장 주간 시간) ----------
  // [키, 이름, 핵심 훈련, 레이스 강도, 거리(m), 권장 주간 시간(최소, 최대)]
  const GOALS = {
    run: [
      ["5K", "5K", "I·R 페이스 인터벌 비중을 높여요 (VO2max·스피드)", "VDOT 인터벌(I) 페이스 근처", 5000, [3, 5]],
      ["10K", "10K", "T 페이스 크루즈 인터벌이 핵심, I 인터벌로 보조", "T와 I 사이 (10K 예상 페이스)", 10000, [3.5, 6]],
      ["half", "하프 마라톤", "T 페이스 템포런이 핵심 + 긴 E 장거리", "역치(T) 페이스 근처", 21097, [4, 7]],
      ["full", "풀코스 마라톤", "M 페이스 장거리 + T 페이스", "M 페이스", 42195, [5, 9]],
    ],
    tri: [
      ["sprint", "스프린트", "역치·VO2max 인터벌", "바이크 FTP 85~95%", null, [4, 6.5]],
      ["olympic", "올림픽", "역치·VO2max 인터벌", "바이크 FTP 85~95%", null, [6, 9]],
      ["half", "하프 아이언맨 (70.3)", "스윗스팟 (FTP 88~93%)", "바이크 FTP 75~85%", null, [8, 12]],
      ["full", "아이언맨", "Z2 장거리 볼륨 위주", "바이크 FTP 65~75%, 수영은 CSS보다 느리게", null, [12, 18]],
    ],
    swim: [
      ["sprint", "단거리 (50~100m)", "R 스피드·파워 + CSS 이하 짧은 반복", "최대 스피드", null, [3, 6]],
      ["middle", "중거리 (200~400m)", "CSS 역치 + VO2 세트", "CSS보다 3~5초 빠르게", null, [4, 8]],
      ["distance", "장거리 (800~1500m)", "CSS 역치 볼륨 (짧은 휴식)", "CSS 페이스 근처", null, [5, 10]],
      ["ow", "오픈워터", "CSS+α 연속 수영, 사이팅·드래프팅", "CSS보다 2~5초 느리게", null, [4, 8]],
    ],
    bike: [
      ["crit", "크리테리움", "VO2max·무산소(Z5–Z6)·스프린트(Z7)", "반복 가속 + 최대 스프린트", null, [5, 8]],
      ["road", "로드레이스", "역치(Z4) + VO2max(Z5) + 긴 Z2", "변화가 큰 강도, 언덕은 Z5", null, [6, 10]],
      ["tt", "타임트라이얼", "역치(Z4)·스윗스팟 지속", "FTP 95~105% (40km 기준)", null, [5, 8]],
      ["gran", "그란폰도·장거리", "Z2 장거리 + 스윗스팟, 보급 연습", "FTP 65~80%", null, [6, 12]],
    ],
  };
  const DEFAULT_GOAL = { run: "10K", tri: "olympic", swim: "middle", bike: "road" };
  function goalFromText(sk, t) {
    t = String(t || "");
    if (sk === "run") return /하프|21/.test(t) ? "half" : /풀|마라톤|42/.test(t) ? "full" : /10/.test(t) ? "10K" : /5/.test(t) ? "5K" : null;
    if (sk === "tri") return /하프|70\.3|half/i.test(t) ? "half" : /아이언맨|full|226/i.test(t) ? "full" : /스프린트|sprint/i.test(t) ? "sprint" : /올림픽|olympic|51\.5/i.test(t) ? "olympic" : null;
    if (sk === "swim") return /오픈|ow/i.test(t) ? "ow" : /800|1500|장거리/.test(t) ? "distance" : /200|400/.test(t) ? "middle" : /50|100/.test(t) ? "sprint" : null;
    if (sk === "bike") return /크리|crit/i.test(t) ? "crit" : /TT|타임/i.test(t) ? "tt" : /그란|폰도|장거리/.test(t) ? "gran" : /로드|road/i.test(t) ? "road" : null;
    return null;
  }
  function upcomingRaces(p) {
    const today = new Date(new Date().toDateString());
    return (p.races || []).filter((r) => r.date).map((r) => ({ ...r, d: new Date(r.date + "T00:00:00") }))
      .filter((r) => r.d >= today).sort((a, b) => a.d - b.d);
  }
  function goalOf(p) {
    const sk = sportKey(p.sport);
    const g = p.goal || {};
    let key = GOALS[sk].some((x) => x[0] === g.event) ? g.event : null;
    let from = key ? "설정한 목표" : "";
    if (!key) {
      const up = upcomingRaces(p);
      const race = up.find((r) => r.priority === "A") || up[0];
      if (race) { key = goalFromText(sk, `${race.event} ${race.name}`); if (key) from = `대회 '${race.name}'`; }
    }
    if (!key) { key = DEFAULT_GOAL[sk]; from = "기본값 (설정에서 바꿀 수 있어요)"; }
    const row = GOALS[sk].find((x) => x[0] === key);
    return { sk, key, name: row[1], focus: row[2], race: row[3], dist: row[4], hours: row[5], time: parseTime(g.time), timeText: g.time || "", from };
  }

  // ---------- 달리기: 다니엘스 VDOT ----------
  const vo2 = (v) => -4.6 + 0.182258 * v + 0.000104 * v * v;
  const pctMax = (t) => 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
  const vdotFrom = (d, sec) => vo2(d / (sec / 60)) / pctMax(sec / 60);
  function velAt(o) { const a = 0.000104, b = 0.182258, c = -4.6 - o; return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a); }
  const paceAt = (vdot, f) => 60000 / velAt(vdot * f);
  function predict(vdot, d) {
    let lo = (d / 1000) * 100, hi = (d / 1000) * 1200;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (vdotFrom(d, mid) > vdot) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  function runInfo(p) {
    let best = null, src = "";
    const tt = p.tests || {};
    [["5km", 5000, tt.run5k], ["10km", 10000, tt.run10k]].forEach(([l, d, v]) => { // 기준점 테스트의 5K·10K
      const t = parseTime(v);
      if (!t) return;
      const x = vdotFrom(d, t);
      if (best == null || x > best) { best = x; src = `${l} 테스트 ${v}`; }
    });
    for (const [l, d] of RUN_EVENTS) {
      if (d < 1500) continue;
      const t = parseTime(rec(p, `run.${l}`));
      if (!t) continue;
      const v = vdotFrom(d, t);
      if (best == null || v > best) { best = v; src = `달리기 ${l} ${rec(p, `run.${l}`)}`; }
    }
    if (best == null) for (const [k, n] of TRI_RACES) {
      const t = parseTime(rec(p, `tri.${k}.run`));
      if (!t) continue;
      const v = vdotFrom(TRI_RUN_D[k], t) * 1.03;
      if (best == null || v > best) { best = v; src = `철인3종 ${n} 달리기 (자전거 뒤 기록이라 3% 보정)`; }
    }
    if (best == null || best < 20 || best > 90) return null;
    return runFrom(best, src);
  }
  // VDOT 하나로 모든 훈련 페이스 계산 (다니엘스)
  function runFrom(v, src) {
    const I = paceAt(v, 0.975);
    return {
      vdot: v, src, E: [paceAt(v, 0.70), paceAt(v, 0.645)], M: predict(v, 42195) / 42.195, T: paceAt(v, 0.88), I, R: I - 15,
      pred: { "5K": predict(v, 5000), "10K": predict(v, 10000), "하프": predict(v, 21097), "풀코스": predict(v, 42195) },
    };
  }
  const RUN_PACES = [
    ["E", "이지", 2, "VO2max의 약 59~74%. 대화가 가능한 강도, 주간 거리의 대부분.", "심장·모세혈관·미토콘드리아 발달, 부상 없이 거리 쌓기"],
    ["M", "마라톤", 3, "마라톤 레이스 페이스. 한 번에 주간 거리의 20% 또는 29km 이하.", "마라톤 페이스 효율·연료 사용 적응"],
    ["T", "역치", 4, "약 60분 유지할 수 있는 페이스. 템포 20분 또는 크루즈 인터벌. 한 주 합계 주간 거리의 10% 이하.", "젖산 역치 향상 — 빠른 속도를 더 오래"],
    ["I", "인터벌", 5, "VO2max 자극, 한 번 3~5분. 한 주 합계 주간 거리의 8%·10km 이하.", "최대산소섭취량(VO2max) 향상"],
    ["R", "반복", 5, "200~400m, 완전 회복. 한 주 합계 주간 거리의 5%·8km 이하.", "스피드·러닝 경제성·무산소 파워"],
  ];
  function runPaceText(R, k) {
    if (!R) return null;
    if (k === "E") return `${fmt(R.E[0])}–${fmt(R.E[1])} /km`;
    const x = R[k];
    return k === "I" || k === "R" ? `${fmt(x)} /km (400m ${fmt(x * 0.4)})` : `${fmt(x)} /km`;
  }

  // ---------- 자전거: 코건 FTP ----------
  function bikeInfo(p) {
    const t = p.tests || {};
    let ftp = null, src = "";
    if (num(t.ftp)) { ftp = num(t.ftp); src = "직접 입력한 FTP"; }
    else if (num(t.ftp20)) { ftp = Math.round(num(t.ftp20) * 0.95); src = `20분 테스트 평균 ${t.ftp20}W × 0.95`; }
    else if (num(rec(p, "bike.ftp"))) { ftp = num(rec(p, "bike.ftp")); src = "최고 기록의 FTP"; }
    else {
      const wkg = num(rec(p, "bike.wkg")), kg = num(p.weight);
      if (wkg && kg) { ftp = Math.round(wkg * kg); src = `${wkg}W/kg × 몸무게 ${kg}kg`; }
    }
    if (!ftp) return null;
    const kg = num(p.weight);
    return { ftp, src, wkg: kg ? ftp / kg : null };
  }
  const COGGAN = [
    ["Z1", "회복", 0, 55, 1, "혈액순환으로 회복 촉진"],
    ["Z2", "지구력", 56, 75, 2, "유산소 기반, 지방 대사, 장거리 지구력"],
    ["Z3", "템포", 76, 90, 3, "근지구력, 장거리 레이스 강도 적응"],
    ["Z4", "역치", 91, 105, 4, "FTP(젖산 역치) 자체를 끌어올림"],
    ["Z5", "VO2max", 106, 120, 5, "최대산소섭취량 향상 (3~8분 반복)"],
    ["Z6", "무산소", 121, 150, 5, "무산소 능력, 반복 가속 (30초~2분)"],
    ["Z7", "최대 스프린트", 151, null, 5, "신경근 파워, 순간 최대 스프린트"],
  ];
  const watt = (ftp, lo, hi) => (hi ? `${Math.round((ftp * lo) / 100)}–${Math.round((ftp * hi) / 100)}W` : `${Math.round((ftp * lo) / 100)}W 이상`);

  // ---------- 수영: CSS ----------
  function swimInfo(p) {
    const t = p.tests || {};
    const a = parseTime(t.css400), b = parseTime(t.css200);
    if (a && b && a > b) return { css: (a - b) / 2, src: `CSS 테스트 (400m ${t.css400} − 200m ${t.css200}) ÷ 2`, tested: true };
    const s15 = parseTime(t.swim1500);
    if (s15) return { css: s15 / 15, src: `1500m 대회 기록 ${t.swim1500} ÷ 15 (CSS ≈ 1500m 페이스)`, tested: true };
    const g = (d) => parseTime(rec(p, `swim.자유형.${d}`));
    const r4 = g(400), r2 = g(200);
    if (r4 && r2 && r4 > r2) return { css: (r4 - r2) / 2, src: "자유형 400m·200m 최고 기록 (400 − 200) ÷ 2", tested: false };
    const est = [[1500, (x) => x / 15], [800, (x) => (x / 8) * 0.99], [400, (x) => (x / 4) * 1.03], [200, (x) => (x / 2) * 1.07], [100, (x) => x * 1.12]];
    for (const [d, f] of est) { const x = g(d); if (x) return { css: f(x), src: `자유형 ${d}m 기록으로 추정 — CSS 테스트를 하면 더 정확해요`, tested: false }; }
    return null;
  }
  const SWIM_Z = [
    ["회복·기술", 15, 20, 1, "회복, 드릴로 자세 다듬기"],
    ["지구력", 5, 10, 2, "유산소 기반, 긴 세트 (CSS보다 5~10초 느리게)"],
    ["템포", 2, 4, 3, "장거리·오픈워터 레이스 페이스, 긴 CSS 지구 세트"],
    ["CSS 역치", -1, 1, 4, "역치 향상 — 짧은 휴식(10~20초)으로 반복"],
    ["스피드·VO2", -6, -3, 5, "VO2max·스피드, 휴식 길게"],
  ];
  const swimPace = (css, i) => `${fmt(css + SWIM_Z[i][1])}–${fmt(css + SWIM_Z[i][2])} /100m`;

  // ---------- 심박: 프릴 LTHR, MAF ----------
  const FRIEL_RUN = [["Z1", "회복", null, 84], ["Z2", "유산소", 85, 89], ["Z3", "템포", 90, 94], ["Z4", "역치 아래", 95, 99], ["Z5a", "역치 위", 100, 102], ["Z5b", "유산소 능력", 103, 106], ["Z5c", "무산소", 107, null]];
  const FRIEL_BIKE = [["Z1", "회복", null, 80], ["Z2", "유산소", 81, 89], ["Z3", "템포", 90, 93], ["Z4", "역치 아래", 94, 99], ["Z5a", "역치 위", 100, 102], ["Z5b", "유산소 능력", 103, 106], ["Z5c", "무산소", 107, null]];
  const MAF_ADJ = [
    ["-10", "−10: 큰 병·수술에서 회복 중이거나 약을 꾸준히 먹음"],
    ["-5", "−5: 부상, 잦은 감기·알레르기, 기록 정체·하락, 훈련 공백"],
    ["0", "0: 2년 이내 꾸준히 훈련, 위 문제 없음"],
    ["5", "+5: 2년 넘게 문제없이 훈련했고 기록이 계속 좋아짐"],
  ];
  function hrInfo(p) {
    const age = num(p.age), t = p.tests || {};
    const maxM = num(p.maxHr);
    const max = maxM || (age ? Math.round(208 - 0.7 * age) : null);
    const lr = num(t.lthrRun), lb = num(t.lthrBike);
    const lthrRun = lr || (max ? Math.round(max * 0.9) : null);
    const lthrBike = lb || (lr ? lr - 5 : max ? Math.round(max * 0.86) : null);
    const maf = age ? 180 - age + (num(p.mafAdj) || 0) : null;
    return { max, maxMeasured: !!maxM, lthrRun, lthrBike, runMeasured: !!lr, bikeMeasured: !!lb, maf, rest: num(p.restHr) };
  }
  function frielRange(table, lthr, i) {
    const [, , lo, hi] = table[i];
    const a = lo ? Math.round((lthr * lo) / 100) : null, b = hi ? Math.round((lthr * hi) / 100) : null;
    return !a ? `${b} 이하` : !b ? `${a} 이상` : `${a}–${b}`;
  }
  function hrText(disc, lvl, H, phil) {
    if (phil === "maf" && H.maf && lvl <= 2) return `심박 ${H.maf - 10}–${H.maf}bpm (MAF ${H.maf})`;
    const l = disc === "bike" ? H.lthrBike : H.lthrRun;
    if (!l) return null;
    const T = disc === "bike" ? FRIEL_BIKE : FRIEL_RUN;
    const idx = { 1: [0], 2: [1], 3: [2], 4: [3, 4], 5: [5, 6] }[lvl];
    const lo = T[idx[0]][2], hi = T[idx[idx.length - 1]][3];
    const a = lo ? Math.round((l * lo) / 100) : null, b = hi ? Math.round((l * hi) / 100) : null;
    const range = !a ? `${b}bpm 이하` : !b ? `${a}bpm 이상` : `${a}–${b}bpm`;
    return `심박 ${idx.map((i) => T[i][0]).join("–")}: ${range}${disc === "swim" ? " (수영은 10~15 낮게 나와요 — RPE 우선)" : ""}`;
  }
  const RPE = { 1: "1–2", 2: "3–4", 3: "5–6", 4: "7–8", 5: "9–10" };

  // ---------- 훈련 방식 ----------
  const PHIL = {
    polarized: { name: "폴라리제드 80/20", by: "스티븐 세일러 · 맷 피츠제럴드",
      desc: "훈련 시간의 약 80%는 저강도(Z1–2), 20%는 중·고강도. 쉬운 날은 확실히 쉽게, 힘든 날은 확실히 힘들게. 고강도는 주 2회면 충분해요." },
    norwegian: { name: "노르웨이 방식 (더블 역치)", by: "잉에브릭트센·블루멘펠트·이덴",
      desc: "역치 바로 아래(젖산 2.0~3.0mmol)에서 많은 양을 쌓고 나머지 날은 진짜 쉽게. 아마추어는 3주에 한 번 더블 역치(하루 2회)부터 시작해요." },
    maf: { name: "MAF (심박 상한 훈련)", by: "필 마페톤",
      desc: "180 − 나이(건강 상태로 보정)를 상한으로, 그보다 10 낮은 범위에서 훈련해 유산소 기초를 만들어요. 기초기에는 고강도를 하지 않아요." },
  };

  // ---------- 시즌 단계 ----------
  const PHASES = {
    r1: { name: "1단계 · 기초", vol: 0.85, color: "#93c5fd", focus: "E 페이스 거리 쌓기 + 스트라이드", desc: "E 페이스로 거리를 늘리고 스트라이드로 다리 스피드를 유지해요. 부상 없이 몸을 만드는 시기예요." },
    r2: { name: "2단계 · 초기 질", vol: 0.95, color: "#60a5fa", focus: "R(반복)으로 스피드·경제성", desc: "짧고 빠른 R 훈련으로 스피드와 러닝 경제성을 먼저 만들어요. 아직 I·T는 적게." },
    r3: { name: "3단계 · 전환 질", vol: 1.0, color: "#2563eb", focus: "I(인터벌)로 VO2max", desc: "I 인터벌로 VO2max를 끌어올리는 시즌에서 가장 힘든 시기예요." },
    r4: { name: "4단계 · 마지막 질", vol: 0.95, color: "#1e40af", focus: "T + 목표 레이스 페이스", desc: "T(역치)와 목표 레이스 페이스로 대회를 준비해요." },
    prep: { name: "준비기", vol: 0.7, color: "#bae6fd", focus: "가벼운 Z1–2, 기술, 보강 운동", desc: "다시 몸을 깨우는 시기. 가벼운 유산소와 기술, 근력 보강 위주예요." },
    base1: { name: "기초 1", vol: 0.8, color: "#93c5fd", focus: "Z2 지구력 + 근력(언덕·큰 기어) + 기술", desc: "유산소 지구력·근력·기술(스피드 스킬)을 쌓기 시작해요." },
    base2: { name: "기초 2", vol: 0.9, color: "#60a5fa", focus: "Z2 + 템포(Z3) 시작", desc: "볼륨을 늘리고 템포(Z3)로 근지구력을 시작해요." },
    base3: { name: "기초 3", vol: 1.0, color: "#3b82f6", focus: "Z2 + 근지구력(스윗스팟·역치 아래)", desc: "볼륨이 가장 많은 시기. 스윗스팟·역치 아래 훈련이 들어가요." },
    build1: { name: "강화 1", vol: 1.0, color: "#2563eb", focus: "역치(Z4) + VO2max(Z5)", desc: "강도를 올려 역치와 VO2max를 키워요. 볼륨은 유지하거나 살짝 줄여요." },
    build2: { name: "강화 2", vol: 0.95, color: "#1d4ed8", focus: "목표 레이스 강도 + 브릭", desc: "목표 대회와 같은 강도·형태로 훈련해요." },
    peak: { name: "피크", vol: 0.75, color: "#f59e0b", focus: "레이스 시뮬레이션, 양 줄이기", desc: "양을 줄이고 레이스 강도의 짧은 자극으로 컨디션을 끌어올려요." },
    s1: { name: "기술·기초", vol: 0.85, color: "#93c5fd", focus: "드릴·자세 + 지구력", desc: "자세(스트로크)를 다듬고 유산소 기초를 쌓아요." },
    s2: { name: "CSS 개발", vol: 1.0, color: "#3b82f6", focus: "CSS 역치 세트", desc: "CSS 페이스 세트로 역치 스피드를 키워요." },
    s3: { name: "레이스 특화", vol: 0.95, color: "#1d4ed8", focus: "목표 거리 페이스", desc: "목표 거리의 레이스 페이스와 형태로 훈련해요." },
    taper: { name: "테이퍼", vol: 0.6, color: "#f59e0b", focus: "양 40% 줄이고 짧은 자극", desc: "훈련량을 크게 줄이고 짧은 자극만 유지해 피로를 빼요." },
    race: { name: "대회 주간", vol: 0.45, color: "#ef4444", focus: "오프너 + 휴식", desc: "가볍게 몸만 깨우고 푹 쉬어요." },
    trans: { name: "전환기", vol: 0.5, color: "#cbd5e1", focus: "가볍게 회복", desc: "대회 후 1~3주는 가볍게, 즐겁게. 쉬어야 다음 시즌이 좋아져요." },
  };
  const rep = (k, n) => Array.from({ length: Math.max(0, n) }, () => k);
  function allocate(N, sk, goalKey) {
    if (N <= 1) return ["race"];
    if (sk === "run") {
      const taperN = goalKey === "full" && N >= 14 ? 2 : N >= 6 ? 1 : 0;
      const M = N - 1 - taperN;
      let r1, r2, r3, r4;
      if (M >= 24) { r2 = 6; r3 = 6; r4 = 6; r1 = M - 18; }
      else { r4 = Math.max(1, Math.round(M * 0.25)); r3 = Math.round(M * 0.25); r2 = Math.round(M * 0.2); r1 = Math.max(0, M - r2 - r3 - r4); }
      return [...rep("r1", r1), ...rep("r2", r2), ...rep("r3", r3), ...rep("r4", r4), ...rep("taper", taperN), "race"].slice(-N);
    }
    if (sk === "swim") {
      const taperN = N >= 6 ? 1 : 0, M = N - 1 - taperN;
      const s3 = Math.round(M * 0.3), s2 = Math.round(M * 0.35);
      return [...rep("s1", M - s2 - s3), ...rep("s2", s2), ...rep("s3", s3), ...rep("taper", taperN), "race"].slice(-N);
    }
    // 자전거·철인3종 (프릴 주기화)
    const peak = N >= 10 ? 2 : N >= 5 ? 1 : 0;
    const M = N - 1 - peak;
    const build = Math.min(8, Math.round(M * 0.35));
    const prep = Math.min(4, Math.max(0, Math.round(M * 0.12)));
    const base = M - build - prep;
    const b1 = Math.round(base / 3), b2 = Math.round(base / 3), b3 = base - b1 - b2;
    const bd1 = Math.ceil(build / 2), bd2 = build - bd1;
    return [...rep("prep", prep), ...rep("base1", b1), ...rep("base2", b2), ...rep("base3", b3), ...rep("build1", bd1), ...rep("build2", bd2), ...rep("peak", peak), "race"].slice(-N);
  }
  const TRAINING = (k) => !["taper", "race", "trans", "peak"].includes(k);

  // 🏁 대회 2주 전 조정기 — 전문 코치의 단계별 안내 (D-14 ~ D-1)
  function prepAdvice(r, to, sk) {
    const e = String(r.event || "").toLowerCase();
    const long = sk === "tri" ? /full|half|하프|풀|아이언|70/.test(e) : sk === "run" ? /half|full|하프|풀|마라톤|21|42/.test(e) : sk === "bike" ? /그란|gran|100|160/.test(e) : false;
    const nm = `${r.name || "대회"}${r.event ? ` (${r.event})` : ""}`;
    if (to > 14) return null;
    if (to >= 8) return { stage: "조정기 1주차", title: `🏁 ${nm} D-${to} · 대회 준비기간(조정기) 시작`, lines: [
      "지금부터는 '더 강해지는' 시기가 아니라 '쌓인 피로를 빼고 날을 세우는' 시기예요. 이 2주에 체력이 새로 생기지 않아요 — 욕심내서 더 하면 손해예요.",
      `훈련량은 평소의 ${r.priority === "A" ? "80~85%" : "85~90%"}로 줄이되, 훈련 횟수와 강도는 유지해요 (강도까지 빼면 몸이 둔해져요).`,
      long ? `마지막 롱 세션은 이번 주가 끝이에요 — ${sk === "run" ? (/full|풀|마라톤|42/.test(e) ? "풀코스는 D-21에 마지막 30km, 이번 주는 20km 안팎" : "하프는 16~18km") : "평소의 70% 길이"}로 레이스 페이스 구간을 섞어 보급·장비를 대회처럼 연습하세요.` : "레이스 페이스 구간을 짧게 넣어 대회 속도에 몸을 맞춰요.",
      "대회 신발·옷·젤·시계 설정은 지금 정하고 훈련에서 꼭 한 번 써 보세요. 새 장비는 이제 금지.",
      "수면 7~9시간, 술은 줄이고, 몸이 무거우면 쉬운 날을 더 쉽게.",
    ] };
    if (to >= 3) return { stage: "조정기 2주차 · 대회 주", title: `🏁 ${nm} D-${to} · 대회 주간`, lines: [
      `훈련량은 평소의 ${r.priority === "A" ? "50~60%" : "65~75%"}. 짧은 레이스 페이스 자극만 1~2번 (예: ${sk === "swim" ? "100m × 4 레이스 페이스" : sk === "bike" ? "3분 × 3 레이스 강도" : "1km × 3 레이스 페이스"}) — 끝나고 '더 하고 싶다'가 정답이에요.`,
      "롱 세션·고강도 인터벌은 없어요. 지금 피로를 남기면 그대로 대회로 가져가요.",
      long ? "D-3부터 탄수화물 위주 식사(체중 1kg당 하루 7~10g: 밥·면·빵·바나나). 기름진 음식·새로운 음식은 피하기." : "평소처럼 먹되 대회 전날 저녁은 익숙하고 소화 잘 되는 탄수화물로.",
      "코스·출발 시간·날씨 확인, 준비물 체크리스트 만들기. 레이스 페이스와 구간별 계획을 미리 정해 두세요.",
      "긴장으로 잠을 못 자도 괜찮아요 — 대회 전 이틀 밤의 잠이 더 중요해요.",
    ] };
    return { stage: to === 2 ? "D-2" : "D-1", title: `🏁 ${nm} D-${to}`, lines: to === 2
      ? ["휴식 또는 20~30분 아주 가볍게. 다리를 쉬게 하는 날이에요.", "물을 자주 마시고, 준비물(번호표·옷·신발·젤·시계 충전)을 미리 챙겨 두세요.", "오늘 밤 잠을 푹 — 내일 밤은 긴장으로 못 자도 괜찮아요."]
      : ["20~30분 가볍게 + 레이스 페이스 1분 × 3~4로 몸만 깨워요 (오프너).", "저녁은 평소 먹던 탄수화물 위주로, 일찍 자기.", `내일 전략: 처음 ${sk === "run" ? "2~3km는 목표 페이스보다 5초/km 느리게" : "10분은 계획보다 살짝 여유 있게"} 출발하고, 후반에 올리기 (네거티브 스플릿). 시작부터 오버페이스가 가장 흔한 실수예요.`] };
  }
  // 대회 뒤 회복 일수 (대회 거리·종목 기준). 앞 25%는 휴식·아주 가볍게, 나머지는 쉬운 강도만 (질 훈련 없음)
  function recoveryDays(r, sk) { // 대회 뒤 쉬운 강도 기간: A·B 대회는 최소 10일 (풀코스·아이언맨은 더 길게), C(연습) 대회는 짧게
    const n = recoveryBase(r, sk);
    return r && r.priority === "C" ? n : Math.max(10, n);
  }
  function recoveryBase(r, sk) {
    const e = String(r.event || "").toLowerCase();
    if (sk === "tri") return /full|풀|아이언|ironman|140/.test(e) ? 21 : /half|하프|70/.test(e) ? 10 : /olympic|올림픽|standard|51/.test(e) ? 5 : 3;
    if (sk === "swim") return /3km|5km|10km|오픈|ow|1500/.test(e) ? 3 : 2;
    if (sk === "bike") return /그란|gran|로드|road|100|160/.test(e) ? 4 : 2;
    return /full|풀|마라톤|42/.test(e) && !/하프|half/.test(e) ? 14 : /half|하프|21/.test(e) ? 7 : /10/.test(e) ? 3 : 2;
  }
  function season(p, ctx) {
    const sk = ctx.goal.sk;
    const start = TS.mondayOf(new Date());
    const up = upcomingRaces(p);
    const A = up.find((r) => r.priority === "A") || up[0] || null;
    const wkOf = (d) => Math.floor((TS.mondayOf(d) - start) / (7 * 864e5));
    let raceIdx = A ? wkOf(A.d) : null, virtual = false;
    if (raceIdx == null || raceIdx > 51) { raceIdx = 23; virtual = true; }
    const keys = allocate(raceIdx + 1, sk, ctx.goal.key);
    const afterBase = sk === "run" ? "r1" : sk === "swim" ? "s1" : "prep";
    while (keys.length < 52) keys.push(keys.length <= raceIdx + 2 ? "trans" : afterBase);
    let cyc = 0;
    const weeks = keys.map((k, i) => {
      const s = TS.addDays(start, 7 * i);
      const e = TS.addDays(s, 7);
      let recovery = false, load = 1;
      if (TRAINING(k)) { recovery = cyc % 4 === 3; load = [0.92, 1, 1.08, 0.65][cyc % 4]; cyc++; } else cyc = 0;
      const races = up.filter((r) => r.d >= s && r.d < e);
      const isA = races.some((r) => A && r === A) || (virtual && i === raceIdx);
      let factor = PHASES[k].vol * load;
      const bRace = races.find((r) => r !== A && r.priority === "B");
      if (bRace && TRAINING(k)) factor *= 0.85;
      const aw = Math.round((TS.mondayOf(s) - new Date(2024, 0, 1)) / (7 * 864e5)); // 달력 기준 주 번호 (언제 계획을 다시 받아도 같은 주는 같은 번호)
      return { i, aw, start: s, key: k, phase: PHASES[k], recovery, factor, meso: cyc ? (cyc - 1) % 4 : 0, races, isA, virtualRace: virtual && i === raceIdx, raceDays: {} };
    });
    // 대회 앞뒤 날짜 표시: 전날 오프너, 이틀 전 가볍게, 대회 뒤 회복 기간(거리에 따라)
    up.forEach((r) => {
      const n = recoveryDays(r, sk), r0 = new Date(r.d.getFullYear(), r.d.getMonth(), r.d.getDate());
      const mark = (off, info) => {
        const d = TS.addDays(r0, off), wi = wkOf(d);
        if (wi < 0 || wi > 51) return;
        const di = (d.getDay() + 6) % 7, cur = weeks[wi].raceDays[di];
        if (!cur || info.pri < cur.pri) weeks[wi].raceDays[di] = info; // 같은 날 겹치면 더 강한 회복 우선
      };
      if (r.priority !== "C") for (let k = 3; k <= 14; k++) mark(-k, { kind: "taper", to: k, race: r, pri: 5 }); // 대회 2주 전부터 조정기
      mark(-2, { kind: "pre2", race: r, pri: 4 });
      mark(-1, { kind: "pre1", race: r, pri: 3 });
      for (let k = 1; k <= n; k++) mark(k, { kind: k <= Math.max(1, Math.round(n * 0.25)) ? "rest" : "post", day: k, of: n, race: r, pri: k <= Math.max(1, Math.round(n * 0.25)) ? 1 : 2 });
    });
    return { weeks, A, raceIdx, virtual };
  }

  // ---------- 운동 라이브러리 ----------
  // o = { min, prog(0~2), ctx, goal, phase, weekKm }
  function frame(min) { // 워밍업·쿨다운 길이를 운동 시간에 맞추기
    const wu = min >= 75 ? 15 : min >= 50 ? 12 : 10;
    const cd = min >= 75 ? 10 : min >= 50 ? 8 : 5;
    return { wu, cd, main: Math.max(5, min - wu - cd) };
  }
  function runW(type, o) {
    const { min, prog, ctx, goal, weekKm } = o, R = ctx.run, H = ctx.H;
    const f = frame(min);
    const P = (k) => runPaceText(R, k);
    const t = (k, lvl) => [P(k) ? `${k} 페이스: ${P(k)}` : `${k} 페이스: 달리기 기록을 입력하면 계산돼요 — RPE·심박으로`, hrText("run", lvl, H, ctx.phil)].filter(Boolean);
    const wu = `워밍업: E 페이스 ${f.wu}분 + 스트라이드 20초 × 4`;
    const cd = `쿨다운: E 페이스 ${f.cd}분`;
    const wk = round1(weekKm || 0);
    const timeKm = (pace, minutes) => (R ? (minutes * 60) / pace : minutes / 5); // 메인 시간 안에 가능한 거리
    // 질 훈련 양이 상한에 걸려 시간이 남으면, 남은 시간은 E로 채우기
    const fill = (steps, usedMain) => {
      const left = Math.round(f.main - usedMain);
      if (left >= 8) steps.splice(steps.length - 1, 0, `남은 ${left}분은 E 페이스 조깅 (질 훈련 양은 주간 거리 상한을 지켜요)`);
      return steps;
    };
    switch (type) {
      case "Rec": return { lvl: 1, tag: "회복", name: "회복 조깅", point: "E 페이스보다도 느리게. 다리를 풀어주는 날이에요.",
        steps: [`${min}분 아주 천천히 (걷기 섞어도 OK)`, "끝나고 가벼운 스트레칭 5분"],
        targets: [R ? `E 페이스(${fmt(R.E[1])}/km)보다 느리게` : "RPE 1–2", hrText("run", 1, H, ctx.phil)].filter(Boolean), effect: "혈류를 늘려 회복을 앞당겨요." };
      case "E": {
        const ek = o.z3 ? (o.v || 0) % 3 : (o.v || 0) % 4; // Z3까지만인 레벨은 언덕 전력 스프린트를 빼요
        const V = [
          [`E 페이스 ${Math.max(15, min - 5)}분`, "마지막에 스트라이드 20초 × 6 (가볍고 빠르게, 사이 40초 걷기)"],
          [`E 페이스 ${min}분`, "끝나고 러닝 드릴 10분 — A스킵 · B스킵 · 하이니 · 버트킥 각 30m × 2"],
          [`E 페이스 ${Math.max(15, min - 10)}분`, "마지막 10분은 E 페이스 빠른 쪽으로 조금씩 올리기 (빌드업, 숨차지 않게)"],
          [`흙길·공원 같은 부드러운 길에서 E 페이스 ${Math.max(15, min - 5)}분`, "언덕 스프린트 8~10초 × 6 (오르막 전력, 사이 2분 걷기로 완전 회복)"],
        ][ek];
        return { lvl: 2, tag: "E", name: ["이지 런 + 스트라이드", "이지 런 + 드릴", "이지 빌드업 런", "이지 런 + 언덕 스프린트"][ek],
          point: "대화가 되는 강도. 주간 거리의 대부분이 이 페이스예요. 빨리 뛰고 싶어도 참는 게 핵심!", steps: V, targets: t("E", 2), effect: RUN_PACES[0][4] };
      }
      case "Fartlek": {
        const [on, off] = [[1, 2], [2, 2], [3, 2]][prog] || [1, 2];
        const n = clamp(Math.floor(f.main / (on + off)), 4, 10);
        return { lvl: 3, tag: "파틀렉", name: "파틀렉 (속도 놀이)", point: "정해진 페이스보다 '느낌'으로. 빠른 구간은 10K 레이스 느낌, 쉬는 구간은 E 페이스.",
          steps: fill([wu, `${on}분 빠르게 / ${off}분 E 페이스 × ${n}회`, cd], n * (on + off)),
          targets: ["빠른 구간 RPE 6–7 · 쉬는 구간 RPE 3", hrText("run", 3, H, ctx.phil)].filter(Boolean),
          effect: "기초기에 부담 없이 속도 감각과 유산소 능력을 함께 키워요.", hiFrac: (n * on) / min };
      }
      case "Long": {
        const late = (goal.key === "half" || goal.key === "full") && o.phase === "r4" && !o.noFinish;
        const fin = late ? clamp(10 + 5 * prog, 10, 25) : 0;
        const alt = ["끝까지 같은 페이스 유지", "마지막 15분은 E 페이스 빠른 쪽으로 (빌드업)", "오르내림 있는 코스 — 오르막은 페이스 대신 노력(RPE 4)으로"][(o.v || 0) % 3];
        return { lvl: 2, tag: late ? "E+M" : "E 롱", name: "롱런", point: "이번 주 가장 긴 달리기 — 주간 거리의 25~30% 또는 150분 이하. 20~30분마다 물·에너지 젤 연습.",
          steps: [`E 페이스 ${min - fin}분`, fin ? `마지막 ${fin}분 M 페이스로 올리기` : alt],
          targets: [...t("E", 2), ...(fin ? [`M 페이스: ${P("M") || "-"}`] : [])], effect: "지구력의 핵심. 지방 대사·근지구력·멘탈을 키워요.", hiFrac: fin / min };
      }
      case "M_long": {
        const cap = Math.min(wk * 0.2 || 8, 29);
        const mKm = Math.max(4, Math.floor(Math.min(cap, timeKm(R ? R.M : 300, min - 25))));
        return { lvl: 3, tag: "M 롱", name: "마라톤 페이스 롱런", point: `풀코스 핵심. M 구간은 주간 거리의 20%·29km 이하 (이번 주 최대 ${round1(cap)}km). 레이스처럼 보급 연습.`,
          steps: [`E 페이스 ${Math.min(20, f.wu + 5)}분`, `M 페이스 ${mKm}km`, `나머지는 E 페이스 (총 ${min}분)`], targets: [...t("M", 3), `E 페이스: ${P("E") || "-"}`], effect: RUN_PACES[1][4], hiFrac: 0.45 };
      }
      case "M_mid": {
        const cap = Math.min(wk * 0.2 || 8, 29);
        const km = Math.max(3, Math.floor(Math.min(cap, R ? (f.main * 60) / R.M : f.main / 5)));
        return { lvl: 3, tag: "M", name: "M 페이스 지속주", point: `마라톤 페이스를 몸에 새겨요. M은 주간 거리의 20%·29km 이하 (이번 주 최대 ${round1(cap)}km).`,
          steps: fill([wu, `M 페이스 ${km}km 지속`, cd], (km * (R ? R.M : 300)) / 60), targets: t("M", 3), effect: RUN_PACES[1][4], hiFrac: 0.6 };
      }
      case "T_tempo": {
        const cap = Math.max(2, wk * 0.1);
        const m = clamp(Math.round(Math.min(R ? (cap * R.T) / 60 : 20, f.main)), 10, 40);
        return { lvl: 4, tag: "T", name: "템포런", point: `'편하게 힘든' 페이스를 끝까지 일정하게. T는 한 주 합계 주간 거리의 10% 이하 (이번 주 최대 ${round1(cap)}km).`,
          steps: fill([wu, `T 페이스 ${m}분 지속`, cd], m), targets: t("T", 4), effect: RUN_PACES[2][4], hiFrac: m / min };
      }
      case "T_cruise": {
        const cap = Math.max(2, wk * 0.1);
        const room = R ? (f.main * 60 * 0.85) / R.T : f.main / 5; // 휴식 1분 포함 시간 안에 가능한 거리(km)
        const km = Math.min(cap, room);
        const want = [1, 1.6, 2][(o.v || 0) % 3];
        const rep = km >= want * 2.5 ? want : km >= 4.8 ? 1.6 : 1;
        const n = Math.max(2, Math.round(km / rep));
        return { lvl: 4, tag: "T", name: "크루즈 인터벌", point: `T 페이스를 끊어서 더 많이 쌓는 방법. 이번 주 T 최대 ${round1(cap)}km (주간 ${wk || "-"}km의 10%). 모든 반복을 같은 페이스로!`,
          steps: fill([wu, `${rep === 1 ? "1km" : rep + "km"} × ${n}회 T 페이스, 사이 1분 조깅 (T 합계 ${round1(n * rep)}km)`, cd], (n * rep * (R ? R.T : 300)) / 60 + n),
          targets: t("T", 4), effect: RUN_PACES[2][4],
          hiFrac: R ? Math.min(0.7, (n * rep * R.T) / 60 / min) : 0.4 };
      }
      case "I": {
        const cap = Math.max(2, Math.min(wk * 0.08, 10));
        const per = R ? R.I / 60 + 3 : 7;
        const len = (cap < 3.2 ? [0.8, 0.6, 0.8] : [1, 0.8, 1.2])[(o.v || 0) % 3];
        const rest = len >= 1.2 ? 3.5 : len >= 1 ? 3 : len >= 0.8 ? 2.5 : 2;
        const n = clamp(Math.min(Math.floor(cap / len), Math.floor(f.main / (len * (R ? R.I / 60 : 5) + rest))), 2, 8);
        const restTxt = rest % 1 ? `${Math.floor(rest)}분 30초` : `${rest}분`;
        return { lvl: 5, tag: "I", name: "VO2max 인터벌", point: `I는 한 주 합계 주간 거리의 8%·10km 이하 (이번 주 최대 ${round1(cap)}km). 휴식은 달린 시간만큼 조깅. 자세가 무너지면 멈춰요.`,
          steps: fill([wu, `${Math.round(len * 1000)}m × ${n}회 I 페이스, 사이 ${restTxt} 조깅 (I 합계 ${round1(n * len)}km)`, cd], (n * len * (R ? R.I : 300)) / 60 + n * rest),
          targets: t("I", 5), effect: RUN_PACES[3][4], hiFrac: Math.min(0.5, (n * len * (R ? R.I : 300)) / 60 / min) || 0.3 };
      }
      case "R": {
        const cap = Math.max(1.2, Math.min(wk * 0.05, 8));
        const n2 = clamp(Math.floor((cap * 1000 * 0.7) / 200), 4, 16), n4 = clamp(Math.floor((cap * 1000 - n2 * 200) / 400), 0, 6);
        if ((o.v || 0) % 2) {
          const n3 = clamp(Math.floor((cap * 1000) / 300), 4, 12);
          return { lvl: 5, tag: "R", name: "R 반복 (300m)", point: `짧고 빠르게, 완전히 회복하고 다음 반복. R은 한 주 합계 주간 거리의 5%·8km 이하 (이번 주 최대 ${round1(cap)}km).`,
            steps: fill([wu, `300m × ${n3}회 R 페이스, 사이 300m 천천히 조깅 (R 합계 ${round1(n3 * 0.3)}km)`, cd], n3 * (((R ? R.R : 270) * 0.3) / 60 + 2)),
            targets: t("R", 5), effect: RUN_PACES[4][4], hiFrac: 0.2 };
        }
        return { lvl: 5, tag: "R", name: "R 반복 (스피드)", point: `짧고 빠르게, 완전히 회복하고 다음 반복. R은 한 주 합계 주간 거리의 5%·8km 이하 (이번 주 최대 ${round1(cap)}km).`,
          steps: fill([wu, `200m × ${n2}회 R 페이스, 사이 200m 천천히 조깅`, n4 ? `400m × ${n4}회 R 페이스, 사이 400m 조깅` : null, cd].filter(Boolean),
            n2 * (((R ? R.R : 270) * 0.2) / 60 + 1.5) + n4 * (((R ? R.R : 270) * 0.4) / 60 + 3)),
          targets: t("R", 5), effect: RUN_PACES[4][4], hiFrac: 0.2 };
      }
      case "Steady": {
        const m = clamp(15 + 5 * prog, 15, Math.max(15, f.main));
        return { lvl: 3, tag: "지속주", name: "지속주 (가벼운 템포)", point: "기초기에 주 1회 넣는 가벼운 자극. E 빠른 쪽~M 페이스로 '편하지만 집중은 필요한' 정도. 숨이 가빠지면 너무 빠른 거예요.",
          steps: fill([wu, `${m}분 지속주 (E 빠른 쪽 ~ M 페이스)`, cd], m),
          targets: [R ? `페이스: ${fmt(R.M)}–${fmt(R.E[0])} /km` : "RPE 5–6", hrText("run", 3, H, ctx.phil)].filter(Boolean),
          effect: "몸을 만드는 시기에 부담 없이 유산소 능력과 페이스 감각을 끌어올려요.", hiFrac: m / min };
      }
      case "Hills": return { lvl: 4, tag: "언덕", name: "언덕 반복", point: "근력과 자세를 함께 키우는 기초기 훈련. 오르막에서 무릎을 들고 팔을 힘차게.",
        steps: [wu, `오르막 60~90초 × ${clamp(6 + prog, 5, Math.floor(f.main / 3.5))}회 (RPE 7–8), 내려오며 걷기·조깅으로 회복`, cd],
        targets: ["RPE 7–8 (심박보다 느낌 우선)"], effect: "다리 근력·러닝 경제성을 부상 위험 적게 키워요.", hiFrac: 0.25 };
      case "Nor": {
        const [n, m] = [[5, 6], [6, 6], [5, 8]][prog] || [5, 6];
        const fitN = clamp(Math.min(n, Math.floor(f.main / (m + 1))), 2, n);
        return { lvl: 4, tag: "T−", name: "역치 바로 아래 인터벌 (노르웨이)", point: "젖산 2~3mmol 수준 — T 페이스보다 3~6초/km 느리게. 마지막 반복이 처음보다 힘들면 너무 빠른 거예요.",
          steps: [wu, `${m}분 × ${fitN}회 (T +3~6초/km), 사이 1분 조깅`, cd],
          targets: [R ? `페이스: ${fmt(R.T + 3)}–${fmt(R.T + 6)} /km` : "RPE 6–7", hrText("run", 4, H, ctx.phil)].filter(Boolean),
          effect: "역치 바로 아래에서 많은 양을 쌓아 피로는 적게, 젖산 역치는 크게 올려요.", hiFrac: (fitN * m) / min };
      }
      case "Double": return { lvl: 4, tag: "더블 T", name: "더블 역치 (하루 2회)", point: "오전·오후 4~6시간 간격. 둘 다 역치 '바로 아래' — 절대 넘기지 않기.",
        steps: ["오전: 워밍업 15분 → 6분 × 5회 (T +3~6초/km), 사이 1분 → 쿨다운 10분", "오후: 워밍업 15분 → 1km × 6회 (T +3초/km), 사이 1분 → 쿨다운 10분"],
        targets: [R ? `페이스: ${fmt(R.T + 3)}–${fmt(R.T + 6)} /km` : "RPE 6–7", hrText("run", 4, H, ctx.phil)].filter(Boolean),
        effect: "하루에 역치 근처 훈련량을 두 배로 쌓아요 (노르웨이 방식의 핵심).", hiFrac: 0.5 };
      case "MAF": return { lvl: 2, tag: "MAF", name: "MAF 런", point: "심박이 MAF 상한을 넘으면 속도를 줄이거나 걸어요. 같은 심박에서 점점 빨라지는 게 목표예요.",
        steps: [`${min}분 내내 MAF 심박 범위`], targets: [hrText("run", 2, H, "maf") || "MAF: 나이를 입력해 주세요"], effect: "지방 대사와 유산소 기초를 부상 없이 키워요." };
      case "Test": return ctx.phil === "maf"
        ? { lvl: 3, tag: "테스트", name: "MAF 테스트", point: "같은 코스에서 4주마다 비교. 같은 심박에서 빨라지면 성장한 거예요.",
          steps: ["워밍업 15분", "MAF 심박으로 5km — 1km마다 페이스 기록", "쿨다운 10분"], targets: [hrText("run", 2, H, "maf") || "-"], effect: "유산소 기초 성장 확인.", hiFrac: 0 }
        : { lvl: 5, tag: "테스트", name: "5K 타임트라이얼 / LTHR 테스트", point: "결과를 설정에 입력하면 VDOT·페이스·심박 존이 다시 계산돼요. (4~6주마다 다시 측정하면 좋아요)",
          steps: [wu, "A) 5km 최대 노력 → '5km 최고 기록'에 입력", "B) 또는 혼자 30분 최대로: 10분째 랩 → 마지막 20분 평균 심박 = 러닝 LTHR", cd],
          targets: ["처음 1km를 너무 빠르게 가지 않기 — 끝까지 고르게"], effect: "지금 체력에 맞게 훈련 강도를 업데이트해요.", hiFrac: 0.35 };
      case "Opener": return { lvl: 3, tag: "오프너", name: "컨디션 조절", point: "짧은 자극만. 끝나고 '더 하고 싶다' 정도가 딱 좋아요.",
        steps: [`E 페이스 ${Math.max(15, min - 20)}분`, "1분 × 4회 레이스 페이스, 사이 2분 조깅", "쿨다운 5분"], targets: t("E", 2), effect: "대회 날 몸이 가볍게 반응하게 해요.", hiFrac: 0.1 };
    }
    return runW("E", o);
  }

  function bikeW(type, o) {
    const { min, prog, ctx, goal } = o, B = ctx.bike, H = ctx.H;
    const f = frame(min);
    const W = (lo, hi) => (B ? `FTP ${lo}–${hi}%: ${watt(B.ftp, lo, hi)}` : `FTP ${lo}–${hi}% (FTP를 입력하면 와트로 계산돼요)`);
    const t = (lo, hi, l) => [W(lo, hi), hrText("bike", l, H, ctx.phil)].filter(Boolean);
    const wu = `워밍업: Z1–Z2 ${f.wu}분 (마지막에 1분 빠르게 × 3)`;
    const cd = `쿨다운: Z1 ${f.cd}분`;
    const fitReps = (want, len, rest) => clamp(Math.min(want, Math.floor((f.main + rest) / (len + rest))), 1, want);
    switch (type) {
      case "Rec": return { lvl: 1, tag: "Z1", name: "회복 라이딩", point: "페달만 가볍게. 케이던스 90 이상, 다리에 힘 주지 않기.", steps: [`${min}분 Z1`], targets: t(0, 55, 1), effect: COGGAN[0][5] };
      case "Z2": return { lvl: 2, tag: "Z2", name: "지구력 라이딩", point: "Z2를 꾸준히. 기초기에는 중간에 케이던스 드릴(스피드 스킬)을 넣어요.",
        steps: [`워밍업 ${f.wu}분`, (() => { const vv = Math.abs(o.v || 0), a = Math.round(f.main * 0.4), b = Math.max(5, f.main - a - 10); return [`Z2 ${f.main}분 (케이던스 85~95)`, `Z2 ${f.main}분 — 앞 절반은 Z2 낮게, 뒤 절반은 Z2 높게 (점점 올리기)`, `Z2 ${a}분 → 고케이던스(110+) 1분 × 5, 사이 1분 → Z2 ${b}분`, `언덕 코스 Z2 ${f.main}분 — 오르막은 앉아서 기어 가볍게 (Z3 넘지 않게)`, `Z2 ${f.main}분 — 10분마다 1분 일어서서 타기 (자세 바꾸기)`, `Z2 ${f.main}분 — 평지에서 에어로 자세 오래 유지하기 연습`, `Z2 ${f.main}분 — 15분마다 한 다리 페달링 30초 × 2 (각 다리)`][vv % 7]; })(), [
          o.phase && /prep|base/.test(o.phase) ? "중간에 1분 고케이던스(110+) × 5 — 페달링 기술" : null,
          "중간에 한 다리 페달링 30초씩 × 4 (각 다리, 실내) 또는 30초 고케이던스 × 6 (야외)",
          "야외라면 언덕은 기어를 가볍게 — Z3를 넘지 않게. 1시간마다 보급 연습",
        ][(o.v || 0) % 3], `쿨다운 ${f.cd}분`].filter(Boolean),
        targets: t(56, 75, 2), effect: COGGAN[1][5] };
      case "Long": {
        const extra = o.noFinish ? "언덕은 Z3까지만, 평지는 Z2 (고강도는 질 훈련 날에)" : goal.sk === "tri" && goal.key === "full" && /build|peak/.test(o.phase) ? `마지막 ${Math.round(min / 3 / 5) * 5}분은 아이언맨 레이스 강도 (FTP 65~75%)`
          : goal.sk === "tri" && goal.key === "half" && /build|peak/.test(o.phase) ? `중간에 ${15 + 5 * prog}분 × 2회 하프 레이스 강도 (FTP 75~85%)`
          : "언덕은 Z3까지만, 평지는 Z2";
        return { lvl: 2, tag: "Z2 롱", name: "장거리 라이딩", point: "이번 주 가장 긴 라이딩. 시간당 탄수화물 60~90g, 물 500~750ml 보급 연습.",
          steps: [[`Z2 ${min}분 — 평지 위주, 일정한 파워`, `Z2 ${min}분 — 언덕 많은 코스`, `Z2 ${min}분 — 마지막 20분은 Z2 높은 쪽으로 점점`, `Z2 ${min}분 — 30분마다 보급(탄수화물 30g) 연습`][(Math.abs(o.v || 0) + Math.floor(Math.abs(o.v || 0) / 5)) % 4], extra], targets: t(56, 75, 2), effect: "장거리 지구력과 보급 능력 — 철인·그란폰도의 기초예요.", hiFrac: /레이스/.test(extra) ? 0.3 : 0 };
      }
      case "Force": { const n = fitReps(3 + prog, 6, 4);
        return { lvl: 3, tag: "근력", name: "근력 (언덕·큰 기어)", point: "낮은 케이던스(50~60)로 큰 기어를 밟아요. 무릎이 아프면 바로 중단.",
          steps: [wu, `6분 × ${n}회 오르막 또는 큰 기어, 케이던스 50~60, Z3`, "사이 4분 Z1 가볍게", cd], targets: t(76, 90, 3), effect: "페달을 미는 근력(포스)을 키워 언덕·가속이 쉬워져요.", hiFrac: (n * 6) / min, used: n * 6 + (n - 1) * 4 }; }
      case "Tempo": { const m = Math.min([20, 30, 40][prog] || 20, f.main);
        return { lvl: 3, tag: "Z3", name: "템포", point: "꾸준한 Z3. 말은 짧게 할 수 있는 정도.",
          steps: [wu, [`Z3 ${m}분 지속`, `Z3 ${m}분 지속 — 케이던스 70~75로 낮춰 근지구력`, `Z3 ${Math.round(m / 2)}분 × 2회, 사이 5분 Z1`][(o.v || 0) % 3], cd], targets: t(76, 90, 3), effect: COGGAN[2][5], hiFrac: m / min, used: m }; }
      case "SS": { const len = [12, 15, 20][prog] || 12, n = fitReps(3, len, 5);
        return { lvl: 3, tag: "SS", name: "스윗스팟", point: "FTP 88~93% — 회복 부담 대비 FTP가 가장 효율적으로 올라요.",
          steps: [wu, `${len}분 × ${n}회 스윗스팟, 사이 5분 Z1`, cd], targets: t(88, 93, 3), effect: "근지구력과 FTP 향상 (하프 아이언맨·그란폰도 핵심).", hiFrac: (n * len) / min, used: n * len + (n - 1) * 5 }; }
      case "Thr": { const [want, len] = [[2, 15], [2, 20], [3, 15]][prog] || [2, 15]; const n = fitReps(want, len, 5);
        if ((o.v || 0) % 2) { const sets = fitReps(2 + (prog > 0 ? 1 : 0), 9, 5);
          return { lvl: 4, tag: "Z4", name: "오버-언더 인터벌", point: "FTP 위아래를 오가며 젖산을 처리하는 연습. '언더'에서 쉬지 말고 그대로 밀어요.",
            steps: [wu, `(2분 FTP 95% / 1분 FTP 105%) × 3 = 9분, × ${sets}세트, 세트 사이 5분 Z1`, cd], targets: t(95, 105, 4),
            effect: "역치 위에서 쌓인 피로를 역치 근처에서 회복하는 능력 — 언덕·어택 대응력.", hiFrac: (sets * 9) / min, used: sets * 9 + (sets - 1) * 5 }; }
        return { lvl: 4, tag: "Z4", name: "역치 인터벌", point: "FTP 근처를 일정하게. 처음 2분에 너무 세게 들어가지 않기.",
          steps: [wu, `${len}분 × ${n}회 Z4, 사이 5분 Z1`, cd], targets: t(91, 105, 4), effect: COGGAN[3][5], hiFrac: (n * len) / min, used: n * len + (n - 1) * 5 }; }
      case "VO2": { const n = fitReps([4, 5, 6][prog] || 4, 4, 4);
        const vv = (o.v || 0) % 3;
        if (vv === 1) { const m = fitReps(n + 1, 3, 3);
          return { lvl: 5, tag: "Z5", name: "VO2max 3분 인터벌", point: "3분을 고르게, 마지막 30초에 처지지 않게.",
            steps: [wu, `3분 × ${m}회 Z5, 사이 3분 Z1`, cd], targets: t(106, 120, 5), effect: COGGAN[4][5], hiFrac: (m * 3) / min, used: m * 6 - 3 }; }
        if (vv === 2) { const s = fitReps(2 + (prog > 0 ? 1 : 0), 10, 5);
          return { lvl: 5, tag: "Z5", name: "30/15 인터벌", point: "30초 강하게 / 15초 가볍게를 13번. 짧은 휴식 덕분에 VO2max 근처에 오래 머물러요.",
            steps: [wu, `(30초 FTP 120% / 15초 FTP 50%) × 13 = 약 10분, × ${s}세트, 세트 사이 5분 Z1`, cd], targets: t(115, 125, 5),
            effect: COGGAN[4][5], hiFrac: (s * 6.5) / min, used: s * 10 + (s - 1) * 5 }; }
        return { lvl: 5, tag: "Z5", name: "VO2max 인터벌", point: "4분을 고르게. 마지막 반복도 첫 반복과 같은 파워가 목표.",
          steps: [wu, `4분 × ${n}회 Z5, 사이 4분 Z1`, cd], targets: t(106, 120, 5), effect: COGGAN[4][5], hiFrac: (n * 4) / min, used: n * 8 - 4 }; }
      case "Ana": { const n = [6, 8, 10][prog] || 6;
        return { lvl: 5, tag: "Z6–7", name: "무산소·스프린트", point: "크리테리움처럼 반복 가속. 30초는 정말 세게, 30초는 정말 쉽게.",
          steps: [wu, `(30초 Z6 / 30초 Z1) × ${n} — ${f.main >= 30 ? "2세트, 세트 사이 5분" : "1세트"}`, "10초 최대 스프린트(Z7) × 4~6, 사이 2분 완전 회복", cd],
          targets: [B ? `Z6: ${watt(B.ftp, 121, 150)} · Z7: ${watt(B.ftp, 151)}` : "Z6 FTP 121~150% · Z7 최대", hrText("bike", 5, H, ctx.phil)].filter(Boolean), effect: COGGAN[5][5], hiFrac: 0.25 }; }
      case "Race": {
        const [lo, hi] = goal.key === "full" ? [65, 75] : goal.key === "half" ? [75, 85] : goal.key === "gran" ? [65, 80] : goal.key === "tt" ? [95, 105] : [85, 95];
        const len = goal.key === "full" ? [30, 40, 45][prog] : goal.key === "half" || goal.key === "gran" ? [20, 25, 30][prog] : [10, 12, 15][prog];
        const n = fitReps(2, len, 5);
        return { lvl: lo >= 85 ? 4 : 3, tag: "레이스", name: `${goal.name} 레이스 강도`, point: "대회 바이크 강도를 몸에 새기고, 그 강도에서 보급까지 연습해요.",
          steps: [wu, `${len}분 × ${n}회 레이스 강도, 사이 5분 Z1`, cd], targets: t(lo, hi, lo >= 85 ? 4 : 3),
          effect: "대회 페이스 효율을 높이고 '이 강도면 끝까지 간다'는 감각을 만들어요.", hiFrac: (n * len) / min, used: n * len + (n - 1) * 5 };
      }
      case "Nor": { const [want, len] = [[4, 8], [5, 8], [5, 10]][prog] || [4, 8]; const n = fitReps(want, len, 2.5);
        return { lvl: 4, tag: "Z3–4", name: "역치 바로 아래 인터벌 (노르웨이)", point: "FTP 88~92%. 젖산 2~3mmol — 숨은 차지만 몇 마디는 가능한 수준을 넘지 않기.",
          steps: [wu, `${len}분 × ${n}회 FTP 88~92%, 사이 2~3분 Z1`, cd], targets: t(88, 92, 4), effect: "역치 근처 볼륨으로 FTP를 올리면서 회복 부담은 적어요.", hiFrac: (n * len) / min, used: n * len + (n - 1) * 2.5 }; }
      case "Double": return { lvl: 4, tag: "더블 T", name: "더블 역치 (하루 2회)", point: "오전·오후 4~6시간 간격. 둘 다 FTP 88~92%를 넘지 않기.",
        steps: ["오전: 워밍업 15분 → 8분 × 5회 FTP 88~92%, 사이 2분 → 쿨다운", "오후: 워밍업 15분 → 10분 × 3회 FTP 88~92%, 사이 3분 → 쿨다운"],
        targets: t(88, 92, 4), effect: "하루에 역치 근처 훈련량을 두 배로 쌓아요.", hiFrac: 0.5 };
      case "MAF": return { lvl: 2, tag: "MAF", name: "MAF 라이딩", point: "심박이 MAF 상한을 넘지 않게. 언덕에서는 기어를 가볍게.",
        steps: [`${min}분 MAF 심박 범위`], targets: [hrText("bike", 2, H, "maf") || "MAF: 나이를 입력해 주세요"], effect: "지방 대사·유산소 기초." };
      case "Test": return { lvl: 5, tag: "테스트", name: "20분 FTP 테스트", point: "평균 파워 × 0.95 = 새 FTP. 매번 같은 방식으로 (램프 테스트와 섞지 않기).",
        steps: ["워밍업 20분 (중간에 1분 빠르게 × 3)", "5분 강하게 → 10분 편하게", "20분 최대 노력 (처음 5분은 조금 아껴서)", "쿨다운 10분", "같이 측정: 20분 평균 심박 ≈ 사이클 LTHR"],
        targets: ["20분 평균 파워 → 설정 '20분 테스트 평균'에 입력"], effect: "4~8주마다 다시 측정해 파워 존을 업데이트해요.", hiFrac: 0.35 };
      case "Opener": return { lvl: 3, tag: "오프너", name: "컨디션 조절", point: "짧은 자극만, 피로는 남기지 않기.",
        steps: [`Z2 ${Math.max(15, min - 15)}분 중 1분 Z5 × 3회 (사이 3분)`, "쿨다운 10분"], targets: t(56, 75, 2), effect: "대회 전 다리를 깨워요.", hiFrac: 0.1 };
    }
    return bikeW("Z2", o);
  }

  // 수영: 그날 목표 거리(m)가 있으면 세트를 거리에 딱 맞게 짜요 (워밍업 + 메인 + 쿨다운 = 목표 거리)
  // ---------- 🏊 수영 한 세션 전체 구성 ----------
  // 워밍업(자유형 + IM + 리버스 IM) → 스컬링 200m → 이번 주 드릴 → 킥 또는 풀(이틀에 한 번씩 번갈아) → 쉬운 50m
  // → 메인1 (100~400m, Z2~3) → 메인2 (50~100m, Z4~5) → 쿨다운
  const SWIM_DRILLS = ["6킥 스위치", "핑거팁 드래그", "10/10 킥", "피스트(주먹) 수영", "캐치업", "한팔 수영"];
  // 🏊 주 종목(영법)별 드릴 6가지
  const STROKE_DRILLS = {
    free: SWIM_DRILLS,
    back: ["한팔 배영 (다른 팔은 옆구리)", "더블암 배영 (두 팔 동시에)", "6킥 사이드 (옆으로 누워 킥 6번 → 한 번 젓기)", "컵 올리기 배영 (이마에 컵·물병 올리고 머리 고정)", "피스트(주먹) 배영", "스트림라인 배영 킥 (두 팔 위로 쭉)"],
    breast: ["스트림라인 평영 킥 (킥판 없이)", "2킥 1풀", "헤드업 평영 (팔 동작은 짧고 빠르게)", "평영 팔 + 돌핀킥", "글라이드 3초 평영 (한 번 젓고 3초 쭉 뻗기)", "스컬링 → 평영 팔 (손을 안쪽으로 모으는 감각)"],
    fly: ["한팔 접영 (오른팔 3 · 왼팔 3 · 양팔 3)", "수중 접영 킥 (엎드려, 팔 앞으로)", "옆으로 누워 접영 킥 (좌·우 번갈아)", "3킥 1풀 접영", "바디 돌핀 (팔 없이 가슴 누르기)", "접영 팔 + 자유형 킥"],
    im: ["한팔 접영 (3-3-3)", "한팔 배영 (다른 팔은 옆구리)", "2킥 1풀 (평영)", "캐치업 (자유형)", "영법 바꾸는 턴 연습 (접→배 · 배→평 · 평→자)", "피스트(주먹) 수영"],
  };
  const STROKE_NAME = { free: "자유형", back: "배영", breast: "평영", fly: "접영", im: "개인혼영" };
  // 실내 자전거 드릴 (모두 8분 이내)
  const BIKE_DRILLS = [
    "실내 6분 — 한 발 페달링 30초씩 × 3 (왼발·오른발 번갈아, 쉬는 발은 뒤쪽 받침에) — 페달을 끝까지 '원'으로",
    "실내 6분 — 스핀업 1분 × 3 (90 → 110 → 120rpm까지, 엉덩이가 들썩이지 않는 데까지), 사이 1분 쉽게",
    "실내 8분 — 저케이던스 근력 2분 × 2 (50~60rpm, Z3 · 상체는 고정), 사이 2분 쉽게",
    "실내 6분 — 원 그리기 — 9시~12시 '발로 긁어 올리기'에만 집중 1분 × 3, 사이 1분 쉽게",
    "실내 5분 — 케이던스 사다리 85 → 95 → 105rpm 각 1분, 다시 95 → 85rpm (같은 기어)",
  ];
  const RUN_DRILL_TXT = "드릴: 러닝 드릴 약 8분 — A스킵 → B스킵 → 하이니 → 버트킥 → 카리오카 → 바운딩, 각 20m × 2 · 사이 걸어서 돌아오기 — 📖 드릴 가이드";
  // 💪 보강 운동(근력·코어): 기초기엔 근력 만들기, 강화기엔 파워 유지, 조정기·회복 주엔 가볍게 — 주 1~2회, 쉬운 날 뒤에
  const STR = {
    leg: ["스쿼트 3×12", "런지 3×10(한쪽)", "루마니안 데드리프트 3×10", "카프레이즈 3×15", "스텝업 3×10(한쪽)", "싱글레그 데드리프트 3×8(한쪽)", "불가리안 스플릿 스쿼트 3×8(한쪽)", "월싯 3×40초"],
    core: ["플랭크 3×40초", "사이드 플랭크 3×30초(한쪽)", "글루트 브릿지 3×12", "데드버그 3×10(한쪽)", "버드독 3×10(한쪽)", "클램쉘 3×15(한쪽)", "할로우 홀드 3×20초"],
    pow: ["점프 스쿼트 3×6", "박스 점프 3×5", "바운딩 3×20m", "한발 홉 3×8(한쪽)"],
    swim: ["밴드 어깨 외회전 3×15", "Y-T-W 레이즈 2×10", "푸시업 3×10", "랫풀다운·턱걸이 3×8", "밴드 풀어파트 3×15", "슈퍼맨 3×12"],
    bw: ["스쿼트 3×15", "런지 3×10(한쪽)", "한발 카프레이즈 3×15(한쪽)", "한발 글루트 브릿지 3×10(한쪽)", "스텝업 3×10(한쪽)", "플랭크 3×40초", "사이드 플랭크 3×30초(한쪽)", "데드버그 3×10(한쪽)", "버드독 3×10(한쪽)", "점프 스쿼트 3×8"], // 🏃 달리기 맨몸 보강 10가지 (보강 가이드와 같아요)
    mob: ["고관절 90/90 스트레칭", "폼롤러 종아리·허벅지 각 1분", "햄스트링 스트레칭", "흉추 회전", "발목 가동성 (무릎 벽 대기)"],
  };
  const rot = (arr, k, n) => Array.from({ length: Math.min(n, arr.length) }, (_, i) => arr[(k + i) % arr.length]); // 겹치지 않게 연속으로
  function addStrength(sessions, wk, sk) {
    if (["race"].includes(wk.key)) return null;
    const light = wk.recovery || ["taper", "trans"].includes(wk.key) || (wk.comeback && wk.comeback.easy);
    const maxN = light ? 1 : 2;
    const RD = wk.raceDays || {};
    const cand = sessions.filter((s) => s.lvl <= 2 && s.minutes && !["Long", "M_long", "Race", "Test"].includes(s.type) && s.disc !== "brick" && !(RD[s.day] && RD[s.day].kind !== "taper"))
      .sort((a, b) => a.day - b.day);
    const pick = [];
    cand.forEach((s) => { if (pick.length < maxN && pick.every((p) => Math.abs(p.day - s.day) >= 2) && !pick.some((p) => p.day === s.day)) pick.push(s); });
    const k = (wk.aw || wk.i) * 2;
    const base = BASE_LIKE.includes(wk.key);
    pick.forEach((s, j) => {
      let txt;
      if (light) txt = `보강: 가벼운 코어·가동성 10분 — ${rot(STR.core, k + j, 2).concat(rot(STR.mob, k + j, 2)).join(" · ")} (무게 없이, 땀나지 않게)`;
      else if (sk === "run") txt = `보강: 맨몸 보강 15~20분 — ${rot(STR.bw.slice(0, base ? 9 : 10), k * 2 + j * 5, 5).join(" · ")} (기구 없이 집에서, 동작은 천천히) — 💪 보강 가이드`;
      else if (sk === "swim") txt = `보강: 육상 보강(드라이랜드) 20분 — ${rot(STR.swim, k + j, 3).concat(rot(STR.core, k + j, 2)).join(" · ")}`;
      else if (base) txt = `보강: 근력 만들기 20~25분 — ${rot(STR.leg, k + j, 3).concat(rot(STR.core, k + j, 2)).join(" · ")} (마지막 2회가 힘든 무게·속도로)`;
      else txt = `보강: 파워 유지 15~20분 — ${rot(STR.pow, k + j, 1).concat(rot(STR.leg, k + j, 2), rot(STR.core, k + j, 2)).map((x) => x.replace(" 3×", " 2×")).join(" · ")} (세트 수는 줄이고 빠르게)`;
      s.steps = [...(s.steps || []), txt];
    });
    return pick.length ? `💪 보강 운동 주 ${pick.length}회 (${pick.map((s) => "월화수목금토일"[s.day]).join("·")}) — ${light ? "이번 주는 가볍게 코어·가동성만" : base ? "기초기라 근력을 만드는 시기예요. 부상 예방과 달리기·페달링 효율에 도움이 돼요" : `${wk.phase.name} 시기라 무게보다 빠른 동작으로 파워를 유지해요`}. 쉬운 훈련 뒤에 바로 하세요.` : null;
  }
  // 🏠 트레드밀: 페이스 옆에 속도(km/h), 언덕은 경사(%)로, 드릴은 트레드밀 옆 바닥에서
  const kmh = (a, b) => (3600 / (+a * 60 + +b)).toFixed(1);
  function treadmill(steps, brick) {
    return steps.map((t) => {
      let s = t.replace(/(\d{1,2}):(\d{2})(?:\s?[–~-]\s?(\d{1,2}):(\d{2}))?\s?\/km/g, (m, a, b, c, d) => `${m} (${c ? `${kmh(c, d)}–${kmh(a, b)}` : kmh(a, b)}km/h)`);
      if (brick) return s;
      if (/^드릴:/.test(s) && /러닝 드릴/.test(s)) s = "드릴: 트레드밀 옆 평평한 바닥에서 제자리 A스킵 · 하이니 · 버트킥 각 20초 × 2 → 트레드밀 위에서 빠른 걸음 → 가속 20초 × 3 (약 6분) — 📖 드릴 가이드";
      if (/^메인:/.test(s) && /언덕|오르막/.test(s)) { // 🏠 트레드밀 언덕: 순서대로 쉽게
        const m = s.match(/(\d+)m[^×]*× (\d+)회/), g = (s.match(/경사 ([\d~]+)%/) || [])[1] || "5~7", fast = /평지 100m|빠르게 ×/.test(s) && /꼭대기/.test(s);
        if (m) s = `메인: 🏠 트레드밀 언덕 ${m[2]}번 반복 — ① 경사를 ${g}%로 올리고 ${m[1]}m 달리기 (숨이 차지만 짧게 말할 수 있는 정도) → ${fast ? "② 경사를 0%로 내리고 100m만 빠르게 → ③" : "②"} 경사 0%에서 천천히 걷거나 조깅하며 숨 고르기 (1~2분) → 다시 ①부터`;
        else s = s.replace(/^메인: /, "메인: 🏠 트레드밀 — ");
      }
      if (/^워밍업:/.test(s) && !/경사/.test(s)) s += " · 트레드밀 경사 1% (야외와 비슷해요)";
      return s;
    });
  }
  // 달리기·자전거·브릭 구간 이름: 워밍업 / 드릴 / 메인 / 이지 / 쿨다운
  function labelSteps(steps, type) {
    const LAB = /^(워밍업|쿨다운|드릴|메인|이지|오전|오후|A\)|B\)|같이 측정|바로 T2|보강|마무리|휴식|회복)/;
    const TIP = /^(야외라면|언덕은|오르내림|끝나고|마지막에|중간에|보급|레이스 강도:)/;
    let main = false;
    return steps.map((t, i) => {
      if (/^워밍업[^:]/.test(t)) return `워밍업: ${t.replace(/^워밍업\s*/, "")}`;
      if (/^쿨다운[^:]/.test(t)) return `쿨다운: ${t.replace(/^쿨다운\s*/, "")}`;
      if (LAB.test(t)) { if (/^메인/.test(t)) main = true; return t; }
      if (/^🏠/.test(t) || /러닝 드릴/.test(t)) return `드릴: ${t.replace(/^끝나고 /, "")}`;
      if (/^(언덕 스프린트|마지막에 스트라이드|스트라이드)/.test(t)) return `마무리: ${t.replace(/^마지막에 /, "")}`;
      if (TIP.test(t)) return t;
      if (type === "Opener" && steps.filter((z) => !/^🏠|^드릴|러닝 드릴/.test(z)).length > 2 && i === steps.findIndex((z) => !/^🏠|^드릴|러닝 드릴/.test(z))) return `워밍업: ${t}`;
      if (!main) { main = true; return `메인: ${t}`; }
      if (/쉬운 강도|^Z2 지구력|^자전거 Z2|^E 페이스/.test(t)) return `이지: ${t}`;
      if (/^달리기 /.test(t)) return `메인: ${t}`; // 브릭의 달리기 구간
      return t;
    });
  }
  // 코치 수영 시트 형식 (계룡 수영 연습 참고):
  // W-up 400m → Sculling 200m → Drill 200m × n (드릴 4개 묶음) → [IM 100m × n, 절반은 Reverse] → ○50m 기술 세트(홀수/짝수)
  // → easy 50m → 메인 1 (100~800m, Z2~Z3, 반복마다 다른 내용) → Kick / Pull → easy 50m → 메인 2 (50~100m, Z4~Z5 · Start/Drafting) → CD
  function swimFull(type, D, hiM, o) {
    const S = o.ctx && o.ctx.swim, C = S ? S.css : 110;
    const tri = o.tri, V = Math.abs(o.v || 0), wk = Math.abs(o.week || 0), si = o.sIdx || 0;
    const r50 = (v) => Math.max(0, Math.round(v / 50) * 50);
    const mmss = (s) => `${Math.floor(s / 60)}'${String(s % 60).padStart(2, "0")}"`;
    // 출발 간격(@): 거리 × 그 존 페이스 + 휴식, 5초 단위로 올림
    const at = (d, z, rest) => { const p = C + ({ 2: 12, 3: 6, 4: 0, 5: -4 }[z] || 8); return `@${mmss(Math.ceil(((d / 100) * p + rest) / 5) * 5)}`; };
    const isEasy = ["Rec", "Tech", "EN", "Long", "MAF"].includes(type);
    // 고정 구간
    const wu = 400, scull = D < 2000 ? 100 : 200, dU = 50; // 드릴은 50m씩
    let drillN = D >= 3500 ? 8 : 6; // 🏊 드릴 6가지 × 50m = 300m (긴 날은 중점 드릴 2개 더 → 400m)
    const imOn = !tri && si % 2 === 0 && D >= 3000 && type !== "Rec";
    let imN = imOn ? (D >= 5000 ? 6 : 4) : 0;
    let techN = D >= 5000 ? 12 : D >= 3500 ? 8 : 6;
    const easy = D >= 5000 ? 100 : 50, cd = 200; // 쿨다운 200m 고정 // easy 50m 줄 수만큼 (메인 1·2로 나누는 날은 2번)
    const both = D >= 4500; // 길게 하는 날은 킥·풀 둘 다
    const kickDay = both || si % 2 === 1, pullDay = both || si % 2 === 0;
    let kick = kickDay ? (D >= 4500 ? 600 : 400) : 0, pull = pullDay ? (D >= 4500 ? 600 : 400) : 0;
    // 메인 2(Start·스프린트)는 짧게 — 사진처럼 50m × 4~8 또는 100m × 4 정도. 남는 고강도는 메인 1의 z4 구간에 넣어요
    const split = D >= 5000; // 하루 5000m 이상일 때만 메인 1·메인 2로 나눠요
    let m2 = !split ? 0 : type === "Rec" ? 0 : hiM != null ? r50(Math.min(hiM, Math.max(200, D * 0.12), 600)) : isEasy ? 200 : 300;
    const fixed = () => wu + scull + drillN * dU + imN * 100 + techN * 50 + easy + cd + kick + pull + m2;
    // 거리가 모자라면 줄이는 순서: 킥/풀 → 기술 세트 → IM → 드릴 횟수
    // 강한 날은 설정한 고강도 거리를 담을 만큼 메인을 키워요 (고강도는 메인의 85%까지) — 그래도 모자라면 킥·풀·IM·기술·드릴 순으로 줄여요
    const needMain = Math.max(hiM != null ? (split ? Math.ceil(Math.max(0, hiM - m2) / 0.7) : Math.ceil(hiM / 0.85)) : 400, r50(D * 0.4)); // 메인은 최소 전체의 40% (짧은 날에도 메인이 주인공)
    for (let g = 0; g < 12 && D - fixed() < needMain; g++) {
      if (kick > 200 || pull > 200) { kick = kick ? Math.max(200, kick - 200) : 0; pull = pull ? Math.max(200, pull - 200) : 0; }
      else if (techN > 6) techN = 6;
      else if (imN) imN = 0;
      else if (drillN > 6) drillN--; // 드릴 6가지(300m)는 꼭 해요
      else if (techN > 4) techN = 4; // 짧은 날은 기술 세트를 4개로
      else if (D < 1500 && techN > 2) techN = 2; // 1500m 미만은 기술 세트 2개만 — 메인에 집중
      else if (m2 > 200) m2 -= 100;
      else if (kick || pull) { kick = 0; pull = 0; }
      else break;
    }
    const m1 = Math.max(200, r50(D - fixed()));
    const T = fixed() + m1;
    // 드릴 묶음: 이번 주 중점 드릴 + 나머지 3개 (주마다 돌아가요)
    const SD = STROKE_DRILLS[o.stroke] || SWIM_DRILLS, focus = SD[wk % SD.length]; // 주 종목(영법)에 맞는 드릴
    const six = [0, 1, 2, 3, 4, 5].map((k) => SD[(wk + k) % SD.length]); // 6가지 모두, 주마다 시작 순서를 바꿔요
    const combo = six;
    const L = [];
    L.push(`워밍업: W-up ${wu}m (자유형 위주로 편하게)`);
    L.push(`스컬링: Sculling ${scull}m (앞 → 가운데 → 뒤 스컬링, 손바닥으로 물 느끼기)`);
    L.push(`드릴: ${STROKE_NAME[o.stroke] && o.stroke !== "free" ? STROKE_NAME[o.stroke] + " " : ""}드릴 6가지 × 50m${drillN > 6 ? ` + 중점 드릴 50m × ${drillN - 6}` : ""} (총 ${drillN * dU}m) R ${[15, 20][wk % 2]}" — ${combo.map((x, i) => `${i + 1}) ${x}`).join(" · ")} — 이번 주 중점: ${focus}`);
    if (imN) L.push(`IM: IM 100m × ${imN} (${imN / 2}-Reverse) ${at(100, 3, 15)} — 앞 ${imN / 2}개는 접→배→평→자, 뒤 ${imN / 2}개는 거꾸로 자→평→배→접`);
    const TECH = tri ? [
      "[홀=15m 맥스 킥 + 35m DPS 전방주시 2회 · 짝=15m 맥스 스트로크 + 35m DPS 전방주시 2회]",
      "[홀=25m 헤드업 킥 + 25m 캐치업 · 짝=25m ST킥 + 25m 에이스(z3~z5)]",
      "[홀=25m ST킥 + 25m DPS 전방주시 2회 · 짝=15m 돌핀 + 10m 맥스 스트로크 + 25m DPS 전방주시 2회]",
      "[홀=25m 언더워터 + 25m 헤드업 수영 · 짝=25m 수영(전방주시 5회) + 25m DPS]",
    ] : [
      "[홀=25m ST킥 + 25m 캐치업 · 짝=25m 헤드업 킥 + 25m 수영]",
      "(15m 맥스 스트로크 + 35m DPS)",
      "(10m 돌핀 + 15m 맥스 스트로크 + 25m 캐치업)",
      "(15m 돌핀 + 10m 맥스 스트로크 + 25m DPS)",
    ];
    if (techN) L.push(`기술: ○50m × ${techN} ${at(50, 3, 15)} ${TECH[(wk + si) % TECH.length]}`);
    L.push(`이지: easy 50m`);
    let hiMain = 0, main1 = "";
    if (!split) {
      // 5000m 미만: 메인 하나 — 설정한 강도 비율(고강도 거리)에 맞춰 강한 반복 개수를 정해요
      const hiT = type === "Rec" ? 0 : hiM != null ? Math.min(hiM, m1 * 0.85) : isEasy ? 0 : m1 * 0.25;
      const hz = "(z4~z5)", lz = isEasy ? "(z2)" : "(z2~z3)";
      // 🔄 메인 구성은 요일마다·주마다 바꿔요 (예: 메인 800m → 월 100m×8 · 화 200m×4 · 수 400m×2 · 목 800m×1 · 금 피라미드)
      const MASTER = [100, 200, 400, "one", "pyr", 50, "ladder"], okS = (s) => (s === 50 ? m1 <= 1200 : s === 400 ? m1 >= 800 : s === "one" ? m1 >= 400 : s === "pyr" ? m1 >= 600 : s === "ladder" ? m1 >= 1000 : true);
      let shape = 100; for (let j = 0; j < 7; j++) { const c = MASTER[(wk * 3 + (o.day || 0) + j) % 7]; if (okS(c)) { shape = c; break; } } // 요일마다 다른 칸에서 시작 → 같은 주에 겹치지 않게
      if (shape === "pyr" || shape === "ladder") {
        const unit = shape === "pyr" ? 800 : 1000, sets = Math.max(1, Math.round(m1 / unit));
        const parts = shape === "pyr" ? "50-50-100-100-200-100-100-50-50m" : "400-300-200-100m";
        const hp = shape === "pyr" ? (hiT ? `[200m·100m 구간 ${hz}, 나머지 ${lz}]` : `${lz} — 올라갈수록 길게, 내려올수록 빠르게`) : (hiT ? `[짧아질수록 빠르게: 200m·100m ${hz}]` : `${lz} — 짧아질수록 조금씩 빠르게`);
        hiMain = hiT ? Math.min(hiT, (shape === "pyr" ? 400 : 300) * sets) : 0;
        L.push(`메인: ○${shape === "pyr" ? "피라미드" : "사다리"} ${parts}${sets > 1 ? ` × ${sets}세트 (세트 사이 1분)` : ""} (=${unit * sets}m × 1) 휴식 15~20초 ${hp}${tri ? " · 6~8스트로크마다 전방주시" : ""}`);
      } else if (shape === "one") {
        const Lone = m1 <= 1000 ? r50(m1) : 800, n1 = Math.max(1, Math.round(m1 / Lone)), hh = hiT ? Math.min(n1 > 1 ? n1 - 1 : 1, Math.max(1, Math.round(hiT / Lone))) : 0;
        hiMain = hh * Lone;
        L.push(`메인: ○${Lone}m × ${n1} ${at(Lone, hh ? 4 : 3, 30)} ${n1 === 1 ? (hh ? `— 끊지 않고: 앞 ${r50(Lone - Math.max(50, r50(Lone / 3)))}m ${lz} → 마지막 ${Math.max(50, r50(Lone / 3))}m ${hz}` : `— 끊지 않고 일정한 페이스 ${lz}`) : hh ? `[앞 ${n1 - hh}개 ${lz} → 마지막 ${hh}개 ${hz}]` : lz}${tri ? " · 6~8스트로크마다 전방주시" : ""}`);
      }
      const Lm = typeof shape === "number" ? shape : 100;
      const n = Math.max(2, Math.round(m1 / Lm)), h = Math.max(0, Math.min(n, Math.round(hiT / Lm)));
      if (typeof shape === "number") {
      let pat;
      if (!h) pat = lz;
      else if (h >= n) pat = hz;
      else { const k = n / h; pat = Math.abs(k - 2) < 0.35 ? `[홀=${hz}, 짝=${lz}]` : Math.abs(k - 3) < 0.5 ? `[3개마다 마지막 1개 ${hz}, 나머지 ${lz}]` : Math.abs(k - 4) < 0.6 ? `[4개마다 마지막 1개 ${hz}, 나머지 ${lz}]` : `[앞 ${n - h}개 ${lz} → 마지막 ${h}개 ${hz}]`; }
      hiMain = h * Lm;
      // 반복이 많으면 세트로 나눠요 (코치 시트처럼, 세트 사이 1분)
      const sets = n >= 16 ? Math.ceil(n / 10) : 1;
      if (sets > 1 && h) { const per = Math.round(n / sets), hs = Math.min(per, Math.round(h / sets)); pat = `= ${sets}세트 × ${per}개 (세트마다 ${per - hs}개 ${lz} → ${hs}개 ${hz}), 세트 사이 1분`; }
      L.push(`메인: ○${Lm}m × ${n} ${at(Lm, h ? 4 : 3, Lm >= 200 ? 20 : 15)} ${pat}${(V + wk) % 3 === 1 && !isEasy ? " · Gear Choice(장비 자유)" : ""}${tri ? " · 6~8스트로크마다 전방주시" : ""}`);
      }
    } else {
    // 메인 1 (Z2~Z3, 100~800m) — 반복마다 다른 내용
    const m1Opts = [];
    if (m1 >= 800) m1Opts.push(() => { const n = Math.max(1, Math.round(m1 / 800)); return `○800m × ${n} ${at(800, 3, 20)} [1=${pull ? "PD+Fins (z2)" : "Pull (Bre 3·5·7)"}${n > 1 ? ", 2=25m(z4)+25m(z2)+50m(z4)+100m(z2~z3) 반복" : ""}${n > 2 ? ", 3=(z3) 일정하게" : ""}]`; });
    if (m1 >= 1200) m1Opts.push(() => { const n = Math.max(2, Math.round(m1 / 400)); return `○400m × ${n} ${at(400, 3, 20)} [1=PD+Fins, 2=PD 또는 Fins, 3=50m(z4)+50m(z2) 반복, 4=(z3)${n > 4 ? ", 5=100m(z4)+200m(z2)+100m(z4)" : ""}]`; });
    m1Opts.push(() => { const n = Math.max(2, Math.round(m1 / 200)); return `○200m × ${n} (Gear Choice) ${at(200, 3, 15)} [홀=(z3), 짝=(z2)]`; });
    m1Opts.push(() => { const n = Math.max(2, Math.round(m1 / 100)); return isEasy ? `○100m × ${n} (Gear Choice)(z2~z3) ${at(100, 3, 10)}` : `○100m × ${n} (Gear Choice) ${at(100, 3, 10)} [4개마다 마지막 1개는 (z4)]`; });
    if (m1 >= 2400 && !isEasy) m1Opts.push(() => `○피라미드 100-200-400-800-400-200-100m [홀=(z3), 짝=(z2)] — 남은 거리는 200m 단위로`);
    main1 = m1Opts[(wk + (o.day || 0)) % m1Opts.length](); // 요일마다·주마다 다른 구성
    if (isEasy) main1 = main1.replace(/z4/g, "z3");
    if (!isEasy && hiM != null) { // 강한 날: 메인 2로 못 채운 고강도 거리를 메인 1의 z4 반복으로 정확히
      const left = Math.max(0, hiM - m2), Ls = [200, 300, 400, 100], Lm = Ls[(V + wk) % Ls.length];
      const n = Math.max(2, Math.round(m1 / Lm)), h = Math.max(0, Math.min(n - 1, Math.round(left / Lm)));
      const k = h ? n / h : 0;
      const pat = !h ? "(z2~z3)" : Math.abs(k - 2) < 0.35 ? "[홀=(z4), 짝=(z2)]" : Math.abs(k - 3) < 0.5 ? "[3개마다 마지막 1개 (z4), 나머지 (z2~z3)]" : `[앞 ${n - h}개 (z2~z3) → 마지막 ${h}개 (z4)]`;
      main1 = `○${Lm}m × ${n} ${at(Lm, 3, 20)} ${pat}${(V + wk) % 2 ? " · Gear Choice(장비 자유)" : ""}`;
      hiMain = h * Lm + m2;
    }
    L.push(`메인 1: ${main1} — Z2~Z3${tri ? " · 오픈워터처럼 6~8스트로크마다 전방주시" : ""}`);
    }
    if (kick) L.push(`킥: Kick 50m × ${kick / 50} ${at(50, 2, 20)} (${["F-S-B-F", "Free, Back, Free, 10/10", "F-S-B-F"][(wk + si) % 3]}) — F=자유형 킥, S=사이드킥, B=백킥(뒤돌아 누워서)`);
    if (pull) L.push(`풀: Pull ${pull >= 600 && (wk + si) % 2 ? `${pull}m 연속` : `100m × ${pull / 100}`} ${pull >= 600 && (wk + si) % 2 ? "" : at(100, 3, 15)} (Bre 3·5·7 — 힘들면 3·5) · 풀부이${(wk + si) % 3 === 2 ? " + 패들" : ""}`);
    if (m2 > 0) {
      L.push(`이지: easy 50m`);
      const n50 = Math.max(4, Math.round(m2 / 50)), n100 = Math.max(4, Math.round(m2 / 100));
      const M2 = isEasy ? [`○50m × ${n50} ${at(50, 3, 20)} 빌드업 [홀=(z3), 짝=25m(z3)+25m(z4)]`] : tri ? [
        `○Start 50m × ${n50} ${at(50, 4, 25)} [홀=25m(z5)+25m(z2), 짝=25m(z3)+25m(z4)]`,
        `○Start 100m × ${n100} Drafting ${at(100, 4, 25)} [홀=(z3), 짝=(z4)] — 앞사람 발끝 따라가기`,
        `○50m × ${n50} ${at(50, 4, 25)} [홀=25m 언더워터 + 25m 헤드업 수영(z4), 짝=25m 수영(z4 + 전방주시 5회) + 25m DPS]`,
        `○Start 100m × ${n100} Drafting ${at(100, 4, 25)} [홀=50m(z5)+50m(z3), 짝=(z4)]`,
      ] : [
        `○50m × ${n50} ${at(50, 4, 20)} [홀=25m 접영(z4)+25m 자유형(z4), 짝=자유형(z4)]`,
        `○Start 50m × ${n50} ${at(50, 4, 25)} [홀=25m(z5)+25m(z2), 짝=25m(z3)+25m(z5)]`,
        `○100m × ${n100} ${at(100, 4, 20)} [홀=(z4), 짝=(z2)]${m2 >= 600 ? " + 200m × 1 (z4)" : ""}`,
        `○Start 100m × ${n100} ${at(100, 4, 25)} [홀=50m(z5)+50m(z3), 짝=(z4)]`,
      ];
      L.push(`메인 2: ${M2[(V + wk + si) % M2.length]} — ${isEasy ? "점점 빠르게, 마지막만 Z4" : "Z4~Z5"}`);
    }
    L.push(`쿨다운: CD ${cd}m (편하게${D >= 4500 ? " · 뒤에 Cordz + Core 10분" : ""})`);
    const Tsum = L.reduce((a, t) => { const s = t.replace(/@\S+/g, ""), ms = s.match(/(\d+)m × (\d+)/g); if (ms) return a + ms.reduce((b, x) => { const m = x.match(/(\d+)m × (\d+)/); return b + +m[1] * +m[2]; }, 0); const one = s.match(/(\d+)m\b/); return a + (one ? +one[1] : 0); }, 0); // 실제 적힌 구간을 더한 합계
    L.push(`합계: T = ${Tsum || T}m · 🧰 장비: ${[kick ? "킥판·오리발" : "", pull ? "풀부이·패들" : "", /PD|Gear/.test(main1) ? "패들·핀(Gear Choice = 장비 자유)" : ""].filter(Boolean).join(" · ") || "없음"}`);
    // 고강도 거리 = 메인 2 + 메인 1 안의 z4 구간(약 25%)
    return { steps: L, drill: focus, hi: hiMain || (split && !isEasy ? m2 + r50(m1 * 0.25) : 0), total: Tsum || T };
  }
  function swimW(type, o) {
    const base = swimTime(type, o);
    const D = o.dist && o.dist.swim ? Math.round(o.dist.swim / 50) * 50 : null;
    if (!D || type === "Test" || type === "Opener") return base;
    return { ...base, steps: swimDistSteps(type, D, o) };
  }
  function swimDistSteps(type, D, o) {
    const { prog, ctx, goal } = o;
    const wuM = D >= 2500 ? 400 : D >= 1200 ? 300 : 200;
    const drill = D >= 1200 ? 200 : 100;
    const cdM = D >= 2500 ? 200 : 100;
    let main = Math.max(100, D - wuM - drill - cdM);
    const sets = [];
    const add = (text, m) => { sets.push(text); main = Math.max(0, main - m); };
    const fill = () => { // 남은 거리는 지구력 반복으로
      if (main >= 100) {
        const vv = (o.v || 0) % 3;
        const len = main >= 1600 ? [400, 300, 500][vv] : main >= 400 ? [200, 300, 200][vv] : 100;
        const n = Math.floor(main / len);
        add(vv === 2 && len >= 200 ? `풀부이(+패들) ${len}m × ${n}회 (CSS +5~8초, 상체 위주), 휴식 20초`
          : `지구력 ${len}m × ${n}회 (CSS +5~10초), 휴식 20초`, len * n);
      }
      if (main >= 50) add(`편하게 ${Math.round(main / 50) * 50}m`, main);
    };
    const tri = goal.sk === "tri" || goal.key === "ow" || goal.key === "distance";
    switch (type) {
      case "Rec": {
        const dr = Math.min(300, Math.floor((main * 0.3) / 50) * 50);
        if (dr) add(`드릴 ${dr / 50} × 50m (휴식 20초)`, dr);
        const k = Math.min(200, Math.floor((main * 0.25) / 50) * 50);
        if (k) add(`킥 ${k / 50} × 50m`, k);
        if (main >= 50) add(`${Math.round(main / 50) * 50}m 아주 편하게 (여러 영법)`, main);
        break;
      }
      case "Tech": {
        const n = clamp(Math.floor((main * 0.35) / 50), 4, 12);
        add(`드릴 ${n} × 50m — 사이드 킥 → 한 팔 → 캐치업 → 손끝 끌기 (휴식 15초)`, n * 50);
        if (main >= 300) add("25m × 4 스트로크 수 세기 — 매번 1개씩 줄여보기", 100);
        fill();
        break;
      }
      case "Long": {
        const n = Math.floor(main / 400);
        if (n) add(tri ? `${n * 400}m 연속 또는 400m × ${n}회 (CSS +5~10초)` : `400m × ${n}회 (CSS +5~10초), 휴식 30초`, n * 400);
        if (main >= 50) add(`풀부이 ${Math.round(main / 50) * 50}m (상체 위주)`, main);
        break;
      }
      case "CSS": {
        const vv = (o.v || 0) % 3;
        if (vv === 1 && main >= 1100) { // 피라미드
          const k = clamp(Math.floor((main * 0.7) / 900), 1, 3);
          add(`피라미드 100-200-300-200-100m CSS 페이스, 휴식 15~20초${k > 1 ? ` × ${k}회 (세트 사이 1분)` : ""}`, 900 * k);
        } else if (vv === 2 && main >= 900) { // 브로큰 세트
          const k = clamp(Math.floor((main * 0.7) / 700), 1, 4);
          add(`(400m CSS +2초 → 100m × 3 CSS −2초, 휴식 15초) × ${k}회`, 700 * k);
        } else {
          const len = tri ? 200 : 100;
          const n = clamp(Math.floor((main * 0.65) / len), 2, len === 200 ? [6, 8, 10][prog] : [12, 15, 18][prog]);
          add(`${len}m × ${n}회 CSS 페이스, 휴식 15초`, len * n);
        }
        fill();
        break;
      }
      case "CSS_long": {
        const len = [400, 500, 800][prog] || 400;
        const n = clamp(Math.floor((main * 0.7) / len), 1, 6);
        add(`${len}m × ${n}회 (CSS +1~3초), 휴식 20~30초`, len * n);
        fill();
        break;
      }
      case "VO2": {
        const len = goal.key === "middle" ? 100 : 50;
        const n = clamp(Math.floor((main * 0.4) / len), 4, len === 100 ? 10 : 20);
        add(`${len}m × ${n}회 (CSS −3~6초), 휴식 ${len === 100 ? 30 : 20}초`, len * n);
        fill();
        break;
      }
      case "Speed": {
        const n = [8, 10, 12][prog] || 8;
        add(`25m × ${n}회 전력, 휴식 40초`, 25 * n);
        add("50m × 6회 레이스 페이스, 휴식 1분", 300);
        fill();
        break;
      }
      case "OW": {
        const c = Math.floor(main / 100) * 100;
        add(`${c}m 연속 (CSS +2~4초) — 6~8스트로크마다 사이팅`, c);
        fill();
        break;
      }
      case "Nor": {
        const n = clamp(Math.floor((main * 0.7) / 300), 2, 10);
        add(`300m × ${n}회 (CSS +1~2초), 휴식 20초`, 300 * n);
        fill();
        break;
      }
      default: fill();
    }
    void ctx;
    return [`워밍업: ${wuM}m 편하게 + 드릴 ${drill / 50} × 50m`, ...sets, `쿨다운: ${cdM}m 편하게`];
  }
  function swimTime(type, o) {
    const { min, prog, ctx, goal } = o, S = ctx.swim;
    const C = S ? S.css : 120;
    const Pz = (i) => (S ? `${SWIM_Z[i][0]}: ${swimPace(S.css, i)}` : `${SWIM_Z[i][0]}: CSS를 측정하면 계산돼요`);
    const f = frame(min);
    const fit = (len, rest, pace = C + 8) => Math.max(2, Math.floor(((f.main * 60) / (pace * (len / 100) + rest)) * 0.95));
    const wuM = min >= 50 ? 400 : 200, cdM = min >= 50 ? 200 : 100;
    const wu = `워밍업: ${wuM}m 편하게 + 드릴 4 × 50m`;
    const cd = `쿨다운: ${cdM}m 편하게`;
    const ow = ctx.env.swim === "outdoor" ? "오픈워터: 6~8스트로크마다 사이팅" : null;
    switch (type) {
      case "Rec": return { lvl: 1, tag: "회복", name: "회복 수영", point: "기술 위주로 편하게. 숨이 차면 안 돼요.",
        steps: [`${wuM}m 편하게 (여러 영법)`, "드릴 6 × 50m (휴식 20초)", "킥 4 × 50m", cd], targets: [Pz(0)], effect: SWIM_Z[0][4] };
      case "Tech": return { lvl: 2, tag: "기술", name: "기술 세션", point: "스트로크를 다듬는 날. 속도보다 '길고 부드럽게'. 호흡은 코로 내쉬기(물속에서 계속).",
        steps: [wu, `드릴 ${clamp(Math.floor(f.main / 3), 4, 10)} × 50m: 사이드 킥 → 한 팔 수영 → 캐치업 → 손끝 끌기 (휴식 15초)`,
          `${clamp(Math.floor(f.main / 4), 3, 8)} × 100m 지구력 (드릴 느낌 유지, CSS +8~10초)`, "25m × 4 스트로크 수 세기 — 매번 1개씩 줄여보기", cd],
        targets: [Pz(1)], effect: "물 잡기·자세·호흡을 개선해 같은 힘으로 더 빨리 나가게 해요." };
      case "EN": { const n = fit(200, 20);
        return { lvl: 2, tag: "EN", name: "지구력 수영", point: "CSS보다 100m당 5~10초 느리게. 스트로크 길이를 유지해요.",
          steps: [wu, `200m × ${n}회 (CSS +5~10초), 휴식 15~20초`, cd], targets: [Pz(1)], effect: SWIM_Z[1][4] }; }
      case "Long": { const n = Math.max(2, fit(400, 30));
        return { lvl: 2, tag: "EN 롱", name: "장거리 수영", point: "이번 주 가장 긴 수영. 일정한 리듬으로 끝까지.",
          steps: [wu, goal.key === "ow" || goal.key === "distance" || goal.sk === "tri" ? `${n * 400}m 연속 또는 400m × ${n}회 (CSS +5~10초)` : `400m × ${n}회 (CSS +5~10초), 휴식 30초`, "마지막 400m는 풀부이(상체 위주)", cd],
          targets: [Pz(1)], effect: "장거리 유산소 능력과 효율적인 스트로크." }; }
      case "CSS": { const len = goal.key === "distance" || goal.sk === "tri" ? 200 : 100;
        const n = clamp(len === 200 ? [5, 6, 8][prog] : [10, 12, 15][prog], 3, fit(len, 15, C));
        return { lvl: 4, tag: "CSS", name: "CSS 역치 세트", point: "CSS 페이스를 정확히, 휴식은 짧게(15초). 모든 반복이 같은 기록이어야 해요.",
          steps: [wu, `${len}m × ${n}회 CSS 페이스, 휴식 15초`, ow, cd].filter(Boolean), targets: [Pz(3)], effect: SWIM_Z[3][4], hiFrac: 0.5 }; }
      case "CSS_long": { const len = [400, 500, 800][prog] || 400, n = clamp(fit(len, 25, C + 2), 2, 5);
        return { lvl: 4, tag: "CSS 롱", name: "긴 CSS 지구 세트", point: "긴 반복을 CSS +1~3초로. 후반에 지치는 걸 버티는 연습이에요.",
          steps: [wu, `${len}m × ${n}회 (CSS +1~3초), 휴식 20~30초`, ow, cd].filter(Boolean), targets: [S ? `100m당 ${fmt(C + 1)}–${fmt(C + 3)}` : "RPE 6–7"],
          effect: "장거리·철인 수영 레이스 페이스를 오래 유지하는 능력.", hiFrac: 0.55 }; }
      case "VO2": return { lvl: 5, tag: "VO2", name: "스피드 지구력 세트", point: "CSS보다 3~6초 빠르게. 휴식을 충분히 두고 질을 지켜요.",
        steps: [wu, goal.key === "middle" ? `100m × ${clamp([6, 8, 10][prog], 3, fit(100, 30, C - 4))}회 (CSS −3~6초), 휴식 30초` : `50m × ${clamp([12, 14, 16][prog], 6, fit(50, 20, C - 4))}회 (CSS −3~6초), 휴식 20초`, cd],
        targets: [Pz(4)], effect: SWIM_Z[4][4], hiFrac: 0.35 };
      case "Speed": return { lvl: 5, tag: "R", name: "스피드·파워", point: "짧게 최대로, 완전 회복. 다이빙·턴 연습도 같이.",
        steps: [wu, `25m × ${[8, 10, 12][prog]}회 전력, 휴식 40초`, "50m × 6회 레이스 페이스, 휴식 1분", cd], targets: ["25m 전력 / 50m 목표 레이스 페이스"],
        effect: "단거리 최고 스피드·무산소 파워·턴 기술.", hiFrac: 0.2 };
      case "OW": return { lvl: 3, tag: "OW", name: "오픈워터 페이스", point: "끊지 않고 오래. 6~8스트로크마다 고개 들어 방향 확인.",
        steps: [wu, `${Math.min([1000, 1200, 1500][prog], Math.round((f.main * 60) / (C + 3) / 100) * 100)}m 연속 (CSS +2~4초)`, "드래프팅 연습: 앞사람 발끝 / 옆사람 엉덩이 옆", cd],
        targets: [Pz(2)], effect: "오픈워터 레이스 페이스와 사이팅 능력.", hiFrac: 0.6 };
      case "Nor": return { lvl: 4, tag: "CSS+", name: "역치 바로 아래 세트 (노르웨이)", point: "CSS보다 1~2초 느리게, 짧은 휴식으로 많이.",
        steps: [wu, `300m × ${clamp([5, 6, 6][prog], 2, fit(300, 20, C + 1))}회 (CSS +1~2초), 휴식 20초`, cd], targets: [S ? `100m당 ${fmt(C + 1)}–${fmt(C + 2)}` : "RPE 6–7"], effect: "역치 근처 볼륨으로 CSS를 올려요.", hiFrac: 0.5 };
      case "Test": return { lvl: 5, tag: "테스트", name: "CSS 테스트", point: "다이빙 없이 벽을 밀고 출발. 두 번 사이에 완전히 회복하세요.",
        steps: ["워밍업 400m + 빠르게 50m × 2", "400m 최대 노력 → 기록", "5~10분 천천히 회복", "200m 최대 노력 → 기록", "(400m − 200m) ÷ 2 = 100m당 CSS → 설정에 입력"],
        targets: ["예: 400m 6:30, 200m 3:10 → CSS 1:40/100m"], effect: "4~8주마다 다시 측정해 모든 수영 페이스를 업데이트해요.", hiFrac: 0.3 };
      case "Opener": return { lvl: 3, tag: "오프너", name: "컨디션 조절", point: "짧은 자극만.", steps: ["300m 워밍업", "50m × 4회 빠르게 (휴식 40초)", "200m 쿨다운"],
        targets: [Pz(1)], effect: "대회 전 감각을 깨워요.", hiFrac: 0.1 };
    }
    return swimTime("EN", o);
  }

  function brickW(o) {
    const { min, ctx, goal } = o, R = ctx.run;
    const b = r5(min * 0.7), r = Math.max(10, min - b);
    const [lo, hi] = goal.key === "full" ? [65, 75] : goal.key === "half" ? [75, 85] : [85, 95];
    const rp = !R ? null : goal.key === "sprint" ? R.pred["5K"] / 5 : goal.key === "olympic" ? R.pred["10K"] / 10 : goal.key === "half" ? (R.pred["하프"] / 21.097) * 1.04 : R.M * 1.08;
    return { lvl: 3, tag: "브릭", name: "브릭 (자전거→달리기)", point: "자전거 직후 다리가 무거운 상태로 달리는 감각을 익혀요. 바꿔 신는 시간(T2)도 빠르게.",
      steps: [`자전거 ${b}분: 처음 ${Math.round(b / 2)}분 Z2 → 나머지 레이스 강도 (FTP ${lo}~${hi}%)`, "바로 T2 전환 — 최대한 빠르게", `달리기 ${r}분: 처음 ${Math.min(10, r)}분 목표 레이스 페이스, 나머지 E`],
      targets: [ctx.bike ? `자전거 레이스 강도: ${watt(ctx.bike.ftp, lo, hi)}` : `자전거: FTP ${lo}~${hi}%`, rp ? `달리기 레이스 페이스: ${fmt(rp)} /km` : "달리기: 레이스 페이스 RPE 6–7"],
      effect: "철인3종 특유의 '자전거 뒤 달리기'에 다리를 적응시켜 대회 달리기 초반 페이스 붕괴를 막아요.", hiFrac: 0.45 };
  }
  function workout(disc, type, o) {
    if (disc === "brick") return brickW(o);
    const x = disc === "run" ? runW(type, o) : disc === "bike" ? bikeW(type, o) : swimW(type, o);
    if (disc === "bike" && x.used != null) { // 인터벌 뒤 남는 시간은 Z2로
      const left = Math.round(frame(o.min).main - x.used);
      if (left >= 10) x.steps.splice(x.steps.length - 1, 0, `남은 ${left}분은 Z2 지구력 (${o.ctx.bike ? E_watt(o.ctx.bike.ftp, 56, 75) : "FTP 56~75%"})`);
    }
    return x;
  }
  const E_watt = (ftp, lo, hi) => watt(ftp, lo, hi);

  // ---------- 단계별 핵심 훈련 ----------
  const BASE_LIKE = ["r1", "prep", "base1", "base2", "s1"];
  function keysFor(goal, phase, phil) {
    const sk = goal.sk, k = goal.key;
    const quality = ["r3", "r4", "base3", "build1", "build2", "s2", "s3", "peak"].includes(phase);
    if (phil === "norwegian" && !["taper", "race", "trans"].includes(phase)) {
      // 노르웨이: 역치 바로 아래(Nor)를 주 2회 이상 + 주 1회 짧고 빠른 자극(언덕·R) — 폴라리제드보다 강도 비중이 높아요
      if (sk === "tri") return [["run", "Nor"], ["bike", "Nor"], ["swim", "Nor"], ["run", "Hills"]];
      const x = sk === "run" ? "Hills" : sk === "bike" ? "VO2" : "Speed";
      return [[sk, "Nor"], [sk, "Nor"], [sk, x]];
    }
    if (sk === "run") {
      const T = {
        r1: ["Steady"], r2: { "5K": ["R", "R"], "10K": ["R", "T_cruise"], half: ["R", "T_cruise"], full: ["T_cruise", "R"] },
        r3: { "5K": ["I", "R"], "10K": ["I", "T_cruise"], half: ["I", "T_tempo"], full: ["T_cruise", "I"] },
        r4: { "5K": ["I", "T_cruise"], "10K": ["T_cruise", "I"], half: ["T_tempo", "M_mid"], full: ["M_mid", "T_cruise"] },
      }[phase];
      return (Array.isArray(T) ? T : T ? T[k] : ["Steady"]).map((x) => ["run", x]);
    }
    if (sk === "bike") {
      const g = { crit: ["VO2", "Ana"], road: ["Thr", "VO2"], tt: ["Thr", "SS"], gran: ["SS", "Race"] }[k];
      return ({ prep: ["Tempo"], base1: ["Force", "Tempo"], base2: ["Tempo", "Force"], base3: ["SS", "Force"], build1: ["Thr", "VO2"], build2: g, peak: [g[0]] }[phase] || ["Tempo"]).map((x) => ["bike", x]);
    }
    if (sk === "swim") {
      const g = { sprint: ["Speed", "VO2"], middle: ["VO2", "CSS"], distance: ["CSS_long", "CSS"], ow: ["OW", "CSS_long"] }[k];
      return ({ s1: ["CSS"], s2: ["CSS", "VO2"], s3: g }[phase] || ["CSS"]).map((x) => ["swim", x]);
    }
    const shortTri = k === "sprint" || k === "olympic";
    return {
      prep: [["bike", "Tempo"], ["run", "Steady"]],
      base1: [["bike", "Force"], ["run", "Steady"], ["swim", "CSS"]],
      base2: [["bike", "Tempo"], ["swim", "CSS"], ["run", "Hills"]],
      base3: [["bike", "SS"], ["run", "T_cruise"], ["swim", "CSS"]],
      build1: shortTri ? [["bike", "Thr"], ["run", "I"], ["swim", "CSS"]] : k === "half" ? [["bike", "SS"], ["run", "T_tempo"], ["swim", "CSS_long"]] : [["bike", "Race"], ["run", "T_cruise"], ["swim", "CSS_long"]],
      build2: shortTri ? [["bike", "Race"], ["run", "I"], ["swim", "CSS"]] : k === "half" ? [["bike", "Race"], ["run", "T_tempo"], ["swim", "CSS_long"]] : [["bike", "Race"], ["run", "M_mid"], ["swim", "CSS_long"]],
      peak: [["bike", "Race"], ["run", "T_cruise"], ["swim", "CSS"]],
    }[phase] || [["bike", "Tempo"]];
  }
  // 같은 시기 안에서도 주마다 핵심 훈련을 바꿔요 (같은 목적의 다른 훈련으로 돌려가며)
  const ALT = {
    run: { Steady: ["Steady", "Fartlek", "Hills"], T_cruise: ["T_cruise", "T_tempo", "Nor"], T_tempo: ["T_tempo", "T_cruise", "Nor"], I: ["I", "I", "Hills"], R: ["R", "R", "Fartlek"] },
    bike: { Tempo: ["Tempo", "Force"], Force: ["Force", "Tempo"], SS: ["SS", "Tempo", "SS"], Thr: ["Thr", "SS", "Thr"], VO2: ["VO2", "Ana", "VO2"] },
    swim: { CSS_long: ["CSS_long", "CSS"], CSS: ["CSS", "CSS", "Nor"], VO2: ["VO2", "Speed"] },
  };
  function rotateKeys(keys, wi, phil) {
    if (phil === "norwegian" || phil === "maf") return keys;
    const w2 = wi + Math.floor(wi / 4); // 4주 블록이 바뀌면 순서도 한 칸 밀려요
    const out = keys.map(([d, t]) => { const a = (ALT[d] || {})[t]; return [d, a ? a[w2 % a.length] : t]; });
    // 핵심 훈련이 2개 이상이면 주마다 순서도 바꿔서 같은 요일에 같은 훈련만 오지 않게
    if (out.length >= 2 && w2 % 2 && out.every((k) => k[0] === out[0][0])) out.push(out.shift());
    return out;
  }
  const FALLBACK = { run: "T_cruise", bike: "Thr", swim: "CSS" };
  const BASE_FALLBACK = { run: "Steady", bike: "Tempo", swim: "CSS" };
  const easyType = (disc, phil, phase) => (phil === "maf" && disc !== "swim" ? "MAF" : disc === "run" ? "E" : disc === "bike" ? "Z2" : phase === "s1" || phase === "prep" ? "Tech" : "EN");
  const EASY = ["E", "Z2", "EN", "Rec", "MAF", "Tech"];

  // 80/20 기준 주당 질 훈련 횟수 (피츠제럴드: 훈련 3회 이하 1회, 4~6회 2회, 7회 이상 3회)
  // 기초기에도 주 1회는 가벼운 지속주·템포를 넣어요 (MAF 방식 제외)
  function hardCount(n, phase, phil, recovery) {
    if (recovery || phase === "trans") return 0;
    const base = n <= 3 ? 1 : n <= 6 ? 2 : 3;
    if (phase === "taper") return n >= 5 ? 2 : n >= 2 ? 1 : 0; // 조정기 1주차: 짧은 질 훈련 1~2회
    if (phase === "race") return n >= 2 ? 1 : 0;
    if (phil === "maf") return [...BASE_LIKE, "r2"].includes(phase) ? 0 : 1;
    if (phil === "norwegian") return BASE_LIKE.includes(phase) ? 2 : Math.min(base + 1, Math.max(1, n - 1)); // 노르웨이는 역치 훈련이 더 많아요
    if (BASE_LIKE.includes(phase)) return 1;
    return base;
  }

  // Z4 이상 훈련의 대안 (같은 목적·같은 고강도 양, 다른 방식)
  const ALT2 = {
    run: { T_cruise: "T_tempo", T_tempo: "T_cruise", I: "T_cruise", R: "Hills", Hills: "Fartlek", Nor: "T_cruise", M_mid: "T_tempo", Steady: "Fartlek" },
    bike: { Thr: "SS", VO2: "Thr", SS: "Thr", Race: "Thr", Ana: "VO2", Nor: "SS", Force: "Tempo" },
    swim: { CSS: "CSS_long", VO2: "CSS", CSS_long: "CSS", Speed: "VO2", Nor: "CSS", OW: "CSS_long" },
  };
  const ALT_WHY = {
    T_tempo: "끊지 않고 한 번에 버티는 힘을 키우고 싶을 때 (트랙이 없어도 OK)",
    T_cruise: "끊어서 하면 페이스를 더 정확히 지킬 수 있어요 — 컨디션이 애매한 날 추천",
    Hills: "트랙·평지가 없거나 다리 근력·자세 위주로 하고 싶을 때",
    Fartlek: "기록 부담 없이 느낌으로 — 혼자 동기부여가 어려운 날",
    SS: "강도를 조금 낮추고 더 길게 — 피로가 남아 있는 날",
    Thr: "FTP 근처를 정확히 — 실내 트레이너에서 하기 좋아요",
    VO2: "짧고 강하게 — 시간이 부족한 날",
    Tempo: "강도를 낮춘 지속 훈련 — 몸이 무거운 날",
    CSS: "짧은 반복으로 페이스를 정확히",
    CSS_long: "긴 반복으로 레이스 지구력 위주로",
  };
  // ---------- 📈 훈련 부하 (TrainingPeaks · 헌터 앨런/앤드류 코건 'Training and Racing with a Power Meter') ----------
  // TSS = 시간(h) × IF² × 100. 쉬운 구간 IF 0.60~0.72, 고강도 구간 IF 0.85~1.05
  function tssOf(min, lvl, hiFrac) {
    if (!min) return 0;
    const ifLo = lvl <= 1 ? 0.6 : 0.72, ifHi = lvl >= 5 ? 1.05 : lvl >= 4 ? 0.95 : 0.85;
    const f = Math.max(0, Math.min(1, hiFrac || 0));
    return Math.round((min / 60) * 100 * ((1 - f) * ifLo * ifLo + f * ifHi * ifHi));
  }
  // 대회 TSS (대략): 거리가 길수록 커요
  function raceTss(r, sk) {
    const e = String((r && r.event) || "").toLowerCase();
    if (sk === "tri") return /full|풀|아이언/.test(e) ? 600 : /half|하프|70/.test(e) ? 330 : /olympic|올림픽|51/.test(e) ? 180 : 100;
    if (sk === "run") return /full|풀|마라톤|42/.test(e) && !/half|하프/.test(e) ? 300 : /half|하프|21/.test(e) ? 170 : /10/.test(e) ? 90 : 60;
    if (sk === "bike") return /그란|gran|160/.test(e) ? 300 : 150;
    return 80;
  }
  // ---------- 🏅 레벨 1~10 (기록 + 주간 거리) ----------
  // 1 = 운동을 처음 시작한 사람, 10 = 엘리트 상위 그룹. 종목마다 기록 기준이 따로 있어요.
  // 기록 기준은 대회 완주자 분포(마라톤 남자 중앙값 약 4:14·상위 10% 약 3:00), 파워 프로파일(W/kg), 마스터즈 수영 기록 분포로 나눴어요.
  // 여자는 같은 레벨에서 달리기 약 10%·자전거 W/kg 약 15%·수영 약 8% 느슨하게 봐요.
  const LV_RUN = [30, 35, 39, 43, 47, 51, 55, 60, 66];            // VDOT 컷 (2~10레벨 시작점, 남자)
  const LV_BIKE = [1.8, 2.2, 2.6, 3.0, 3.4, 3.9, 4.4, 5.0, 5.6];  // FTP W/kg (남자)
  const LV_SWIM = [165, 140, 125, 112, 102, 93, 85, 77, 69];      // CSS 초/100m (작을수록 빠름, 남자)
  const LV_VOL = {
    run: [10, 20, 30, 45, 60, 80, 100, 130, 160],                  // km/주
    bike: [30, 60, 100, 150, 200, 260, 330, 420, 520],             // km/주
    swim: [1500, 3000, 5000, 7000, 10000, 14000, 18000, 24000, 30000], // m/주
  };
  const LEVEL_CUT = { run: LV_VOL.run, bike: LV_VOL.bike, swim: LV_VOL.swim };
  const LEVELS = [null,
    { lv: 1, name: "🌱 출발", band: 0, q: "주 0~1회", ratio: 95, desc: "운동 습관 만들기. 쉬운 강도(Z1~Z2)로 시간을 늘려요. 질 훈련은 Z3 지속주만 — Z4·Z5는 넣지 않아요." },
    { lv: 2, name: "🚶 리듬 찾기", band: 0, q: "주 1회", ratio: 92, desc: "주 1회 가벼운 질 훈련(Z3 지속주·템포). 역치(Z4)·인터벌(Z5)은 아직 넣지 않아요." },
    { lv: 3, name: "🏃 꾸준함", band: 1, q: "주 1~2회", ratio: 90, desc: "질 훈련 주 1~2회, Z3(템포·지속주)로 길이를 늘려요. 역치(Z4)·인터벌(Z5)은 레벨 4부터." },
    { lv: 4, name: "🔥 탄력", band: 1, q: "주 1~2회", ratio: 88, desc: "역치와 짧은 인터벌을 번갈아. 한 번의 고강도 양은 아직 적게." },
    { lv: 5, name: "💪 파워업", band: 2, q: "주 2회", ratio: 85, desc: "질 훈련 주 2회(역치 + 인터벌). 롱 세션으로 지구력을 키워요." },
    { lv: 6, name: "⚡ 스피드", band: 2, q: "주 2회", ratio: 82, desc: "질 훈련 주 2회, 세트 길이를 늘려요. 레이스 페이스 연습 시작." },
    { lv: 7, name: "🚀 레이서", band: 3, q: "주 2~3회", ratio: 80, desc: "질 훈련 주 2~3회, 긴 역치 세트와 레이스 특화 훈련." },
    { lv: 8, name: "🏅 챌린저", band: 4, q: "주 3회", ratio: 80, desc: "질 훈련 주 3회, 긴 인터벌·레이스 특화. 회복(잠·영양)이 성적을 좌우해요." },
    { lv: 9, name: "🦅 마스터", band: 5, q: "주 3~4회", ratio: 80, desc: "많은 양 + 질 훈련 주 3~4회(더블 역치 가능). 쉬운 날은 정말 쉽게." },
    { lv: 10, name: "👑 엘리트", band: 5, q: "주 3~4회", ratio: 80, desc: "엘리트 상위 그룹. 많은 양과 정교한 질 훈련, 쉬운 날·힘든 날 구분이 가장 중요해요." },
  ];
  // 레벨별: 주당 질 훈련 횟수 [최소, 최대], 질 훈련 1회의 알맞은 고강도 양, 고강도 비중 상한(%)
  const LEVEL_Q = [null, [0, 1], [1, 1], [1, 2], [1, 2], [2, 2], [2, 2], [2, 3], [3, 3], [3, 4], [3, 4]];
  const LEVEL_IDEAL = (lv) => ({ run: [0, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14][lv], bike: [0, 10, 15, 20, 25, 30, 35, 40, 50, 60, 70][lv], swim: [0, 300, 400, 600, 800, 1000, 1200, 1400, 1700, 2000, 2400][lv] });
  const LEVEL_HI_MAX = [null, 5, 8, 10, 12, 15, 18, 25, 30, 32, 35];
  const lvCut = (cuts, v, lowerIsBetter) => 1 + cuts.filter((c) => (lowerIsBetter ? v <= c : v >= c)).length;
  // 쉬다가 복귀: 쉰 기간별로 기록을 낮춰 잡고, 처음 몇 주는 양을 줄이고 쉬운 강도로 다시 시작해요
  const COMEBACK = {
    w2: { name: "2~4주 쉬었어요", run: 0.96, bike: 0.95, swim: 1.03, weeks: 2, lvDown: 0, ramp: [0.7, 0.85] },
    m1: { name: "1~3개월 쉬었어요", run: 0.92, bike: 0.9, swim: 1.06, weeks: 4, lvDown: 1, ramp: [0.55, 0.65, 0.75, 0.88] },
    m3: { name: "3~6개월 쉬었어요", run: 0.88, bike: 0.85, swim: 1.09, weeks: 6, lvDown: 2, ramp: [0.45, 0.55, 0.62, 0.7, 0.8, 0.9] },
    m6: { name: "6개월 이상 쉬었어요", run: 0.83, bike: 0.8, swim: 1.13, weeks: 8, lvDown: 3, ramp: [0.4, 0.45, 0.52, 0.6, 0.67, 0.75, 0.83, 0.92] },
  };
  const comebackOf = (p) => { const c = COMEBACK[p.comeback]; if (!c) return null; const at = p.comebackAt ? new Date(p.comebackAt) : new Date(); const since = Math.max(0, Math.floor((TS.mondayOf(new Date()) - TS.mondayOf(at)) / (7 * 864e5))); return since >= c.weeks ? null : { ...c, key: p.comeback, since }; };
  function levelOf(p, ctx0) {
    const v = p.volume || {}, ds = discsOf(p.sport), female = p.sex === "f";
    const ctx = ctx0 || { run: runInfo(p), bike: bikeInfo(p), swim: swimInfo(p) };
    const per = {};
    ds.forEach((x) => {
      const w = num(v[x]);
      let perf = null, perfTxt = "";
      if (x === "run" && ctx.run) { const vd = ctx.run.vdot + (female ? 5 : 0); perf = lvCut(LV_RUN, vd); perfTxt = `기록 VDOT ${ctx.run.vdot.toFixed(1)}`; }
      if (x === "bike" && ctx.bike && ctx.bike.wkg) { perf = lvCut(LV_BIKE, ctx.bike.wkg / (female ? 0.85 : 1)); perfTxt = `FTP ${ctx.bike.wkg.toFixed(2)}W/kg`; }
      if (x === "swim" && ctx.swim) { perf = lvCut(LV_SWIM, ctx.swim.css / (female ? 1.08 : 1), true); perfTxt = `CSS ${fmt(Math.round(ctx.swim.css))}/100m`; }
      const vol = w ? lvCut(LV_VOL[x], w) : null;
      if (perf == null && vol == null) return;
      // 기록 60% + 주간 거리 40% (기록만 빠르고 양이 적으면 한두 단계 낮게, 양만 많으면 기록 쪽으로)
      const lv = perf != null && vol != null ? Math.round(perf * 0.6 + vol * 0.4) : perf != null ? perf : vol;
      per[x] = { vol: w || 0, lv: clamp(lv, 1, 10), perf, volLv: vol, perfTxt };
    });
    const ks = Object.keys(per);
    if (!ks.length) return null;
    // 철인3종은 자전거 45% · 달리기 35% · 수영 20% (완주 기록에 미치는 영향 순서)
    const W = { bike: 0.45, run: 0.35, swim: 0.2 };
    let lv = ks.length > 1 ? Math.round(ks.reduce((a, x) => a + per[x].lv * W[x], 0) / ks.reduce((a, x) => a + W[x], 0)) : per[ks[0]].lv;
    const cb = comebackOf(p);
    const lv0 = lv;
    if (cb) lv = Math.max(1, lv - cb.lvDown);
    const next = ks.map((x) => { const c = LV_VOL[x][per[x].lv - 1]; return c ? `${DISC[x].name} 주 ${x === "swim" ? c.toLocaleString() + "m" : c + "km"}` : null; }).filter(Boolean);
    return { ...LEVELS[lv], per, comeback: cb, before: cb && lv0 !== lv ? lv0 : null,
      next: lv >= 10 ? "최고 레벨이에요" : `다음 레벨: 기록을 올리거나 ${next.join(" · ")} 이상` };
  }
  // 레벨 표 (화면에 보여주기용): 종목별 1~10레벨 기록·거리 기준
  function levelTable(x, female) {
    const rows = [];
    for (let lv = 1; lv <= 10; lv++) {
      let rec = "";
      if (x === "run") { const v = lv === 1 ? null : LV_RUN[lv - 2] - (female ? 5 : 0); rec = v ? `5K ${fmt(Math.round(predict(v, 5000)))} · 10K ${fmt(Math.round(predict(v, 10000)))} · 풀 ${fmt(Math.round(predict(v, 42195)))} 이내` : "기록 없음 · 처음 시작"; }
      if (x === "bike") { const v = lv === 1 ? null : LV_BIKE[lv - 2] * (female ? 0.85 : 1); rec = v ? `FTP ${v.toFixed(1)}W/kg 이상` : "FTP 1.8W/kg 미만 · 처음 시작"; }
      if (x === "swim") { const v = lv === 1 ? null : LV_SWIM[lv - 2] * (female ? 1.08 : 1); rec = v ? `CSS ${fmt(Math.round(v))}/100m 이내 (1500m 약 ${fmt(Math.round(v * 15))})` : "100m 쉬지 않고 가기 어려움"; }
      const vc = lv === 1 ? 0 : LV_VOL[x][lv - 2];
      rows.push({ lv, name: LEVELS[lv].name, rec, vol: lv === 1 ? "주간 거리 적음" : `주 ${x === "swim" ? vc.toLocaleString() + "m" : vc + "km"} 이상`, q: LEVELS[lv].q, hiMax: LEVEL_HI_MAX[lv] });
    }
    return rows;
  }

  // ---------- 비율 모드: 질 훈련 하나의 구성 (고강도 거리 H를 정확히 넣고 나머지는 쉬운 강도) ----------
  // D: 그날 종목별 총 거리 {run: km, bike: km, swim: m}, H: 그날 종목별 고강도 거리
  function ratioSteps(disc, type, D, H, ctx, x, V = 0) {
    const R = ctx.run, B = ctx.bike, S = ctx.swim;
    const km = (v) => `${round1(v)}km`, mm = (v) => `${Math.round(v / 50) * 50}m`;
    const pace = (k) => (R && R[k] ? ` (${fmt(Array.isArray(R[k]) ? R[k][0] : R[k])}/km)` : "");
    const reps = (tot, want, lo = 2, hi = 12) => { const n = clamp(Math.round(tot / want), lo, hi); return [n, tot / n]; };
    const steps = [], txt = [];
    const ez = (x0, tot, h, wuMax, cdMax, wuTxt, cdTxt, extraTxt) => { // 쉬운 거리 = 워밍업 + (추가 쉬운 구간) + 쿨다운
      const e = Math.max(0, tot - h), wu = Math.min(wuMax, e * 0.5), ex0 = e - wu - Math.min(cdMax, e - wu);
      const small = ex0 < (x0 === "swim" ? 100 : x0 === "bike" ? 3 : 1); // 너무 짧은 이지 구간(예: 0.6km)은 쿨다운에 합쳐요
      const cd = small ? e - wu : Math.min(cdMax, e - wu), ex = small ? 0 : ex0;
      return { wu, cd, ex, pre: wuTxt(wu), post: [ex > 0 ? extraTxt(ex) : null, cdTxt(cd)].filter(Boolean) };
    };
    const runMain = (h, ty) => {
      const k = Math.abs(V);
      if (/^T_tempo$/.test(ty)) return [`T 페이스 ${km(h)} 지속${pace("T")}`, `T 페이스 ${km(h / 2)} × 2회${pace("T")}, 사이 2분 조깅`, `점점 빠르게 ${km(h)}: 앞 절반 T +5초 → 뒤 절반 T 페이스${pace("T")}`, `T 페이스 ${km(h / 3)} × 3회${pace("T")}, 사이 90초 조깅`][k % 4];
      if (/^T_cruise$/.test(ty) && h < 4) { // 고강도 양이 적을 때도 매번 다르게
        const rs = ["1분", "90초", "45초", "2분"][Math.floor(k / 4) % 4];
        return [`T 페이스 ${km(h)} 지속${pace("T")}`, `800m × ${Math.max(2, Math.round(h / 0.8))}회 T 페이스${pace("T")}, 사이 ${rs} 조깅`, `${km(h / 2)} × 2회 T 페이스${pace("T")}, 사이 ${rs} 조깅`, `400m × ${Math.max(3, Math.round(h / 0.4))}회 T 페이스${pace("T")}, 사이 ${rs} 조깅`, `1km × ${Math.max(2, Math.round(h))}회 T 페이스${pace("T")}, 사이 ${rs} 조깅`][(k + Math.floor(k / 7)) % 5];
      }
      if (/^T_cruise$/.test(ty)) { const want = [1, 1.6, 2, 1.2, 3][k % 5]; const [n, r] = reps(h, Math.min(want, Math.max(1, h / 2))); return `${km(r)} × ${n}회 T 페이스${pace("T")}, 사이 ${(r >= 2 ? ["90초", "2분", "1분"] : ["1분", "90초", "45초"])[Math.floor(k / 5) % 3]} 조깅`; }
      if (/^I$/.test(ty)) {
        const want = [1, 0.8, 1.2, 0.6][k % 4]; const [n, r] = reps(h, want, 2, 12); return `${Math.round(r * 10) * 100}m × ${n}회 I 페이스${pace("I")}, 사이 ${["달린 시간만큼", "달린 시간의 80%만큼", "2분 30초"][Math.floor(k / 4) % 3]} 조깅`;
      }
      if (/^R$/.test(ty)) { const want = [0.4, 0.2, 0.3, 0.25][(k + Math.floor(k / 5)) % 4], rest = ["같은 거리 천천히 조깅", "달린 거리만큼 걷기·조깅 섞어서", "200m 조깅", "완전 회복될 때까지 걷기"][Math.floor(k / 3) % 4]; if (k % 4 === 3 && h >= 2) { return `(200m + 400m + 600m) × ${Math.round(h / 1.2)}세트 R 페이스${pace("R")}, 사이 ${rest}`; } const [n, r] = reps(h, want, 3, 20); return `${Math.round(r * 20) * 50}m × ${n}회 R 페이스${pace("R")}, 사이 ${rest}${n >= 12 ? ` (${Math.ceil(n / 8)}세트로 나눠서, 세트 사이 3분)` : ""}`; }
      if (/^M_/.test(ty)) return [`M 페이스 ${km(h)} 지속${pace("M")}`, `M 페이스 ${km(h / 2)} × 2회${pace("M")}, 사이 1km E 조깅`, `M 페이스 ${km(h)} — 마지막 1km는 조금 빠르게${pace("M")}`][k % 3];
      if (ty === "Fartlek") { const want = [1, 0.5, 1.5, 0.8][k % 4]; const [n, r] = reps(h, want, 3, 14); return `${km(r)} 빠르게(${r >= 1.2 ? "하프" : r >= 0.8 ? "10K" : "5K"} 느낌) / ${r >= 1 ? "500m" : "300m"} 조깅 × ${n}회`; }
      if (ty === "Hills") { // 언덕도 블록마다 길이·구성이 바뀌어요
        const kind = (k + Math.floor(k / 5) * 2) % 6, sc = [1, 0.8, 1.25][Math.floor(k / 11) % 3], gr = ["경사 4~6%", "경사 6~8%", "경사 8~10%"][Math.floor(k / 13) % 3], back = ["걸어서", "조깅으로", "천천히 조깅으로"][Math.floor(k / 7) % 3];
        if (kind === 5) { const [n, r] = reps(h, 0.5 * sc, 3, 12); return `오르막 ${Math.round(r * 20) * 50}m 일정한 힘으로 × ${n}회 (${gr}) — 홀수 번은 RPE 7, 짝수 번은 마지막 100m만 RPE 8로 끌어올리기, ${back} 내려오며 회복`; }
        if (kind === 4) { const [n, r] = reps(h, 0.6 * sc, 3, 12); return `오르막 ${Math.round(r * 20) * 50}m + 꼭대기에서 평지 100m 이어서 빠르게 × ${n}회 (RPE 7, ${gr}), ${back} 내려오며 회복`; }
        const [n, r] = reps(h, [0.2, 0.4, 0.8, 0.3][kind] * sc, 4, kind === 0 ? 24 : 16), rr = Math.round(r * 20) * 50;
        return `${["짧은 언덕 스프린트", "오르막", "긴 언덕", "오르막"][kind]} ${rr}m × ${n}회 (RPE ${rr <= 250 ? "8" : rr <= 500 ? "7–8" : "7"}, ${gr})${n >= 12 ? ` = ${Math.ceil(n / 8)}세트로 나눠서, 세트 사이 3분 조깅` : ""}, ${back} 내려오며 회복`;
      }
      if (ty === "Nor" || ty === "Double") { // 역치 바로 아래(노르웨이): 주에 여러 번이라 구성 8가지 × 휴식 4가지로 돌려요
        const kind = (k + Math.floor(k / 6)) % 8, rs = ["30초", "45초", "1분", "90초"][Math.floor(k / 3) % 4];
        const tp = `T +3~6초/km${R ? `: ${fmt(R.T + 3)}–${fmt(R.T + 6)}/km` : ""}`;
        const n = (len) => Math.max(2, Math.round(h / len));
        if (kind === 0) return `1km × ${n(1)}회 (${tp}), 사이 ${rs} 조깅`;
        if (kind === 1) return `${h >= 6 ? 2 : 1.5}km × ${n(h >= 6 ? 2 : 1.5)}회 (${tp}), 사이 ${rs} 조깅`;
        if (kind === 2 && h >= 6) return `3km × ${n(3)}회 (${tp}), 사이 ${rs} 조깅`;
        if (kind === 3 || kind === 2) { const m = [6, 8, 10][Math.floor(k / 8) % 3], perKm = R ? (R.T + 4) / 60 : 4.5; return `${m}분 × ${Math.max(2, Math.round((h * perKm) / m))}회 (${tp}), 사이 ${rs} 조깅`; }
        if (kind === 4) return `400m × ${Math.min(25, n(0.4))}회 (${tp} — 짧고 많이, 리듬 유지), 사이 30초 서서 쉬기`;
        if (kind === 5) return h >= 6 ? `1.6km × ${n(1.6)}회 (${tp}), 사이 ${rs} 조깅` : `1.2km × ${n(1.2)}회 (${tp}), 사이 ${rs} 조깅`; // (피라미드는 쓰지 않아요 — 같은 거리 반복이 페이스 익히기에 좋아요)
        if (kind === 6) return `(2km + 1km) × ${Math.max(1, Math.round(h / 3))}세트 (${tp}), 사이 ${rs} 조깅`;
        return `800m × ${n(0.8)}회 (${tp}), 사이 ${rs} 조깅`;
      }
      if (ty === "Brick") return `레이스 페이스 ${km(h)}`;
      return [`${km(h)} 지속주 (E 빠른 쪽 ~ M 페이스)`, `점점 빠르게 ${km(h)}: E → M 페이스로 1km마다 조금씩`][k % 2];
    };
    const bSpd = (lvl) => (lvl >= 5 ? 33 : lvl >= 4 ? 31 : 29); // 고강도 평균 속도 추정 (km/h)
    const bikeMain = (h, ty) => {
      const map = { Tempo: [3, 20, "Z3 템포", [76, 90], 5], Force: [3, 8, "큰 기어 케이던스 50~60 (Z3)", [76, 90], 4], SS: [3, 15, "스윗스팟", [88, 93], 5],
        Thr: [4, 12, "Z4 역치", [91, 105], 5], VO2: [5, 4, "Z5 VO2max", [106, 120], 4], Ana: [5, 1, "Z6 무산소", [121, 150], 2], Race: [4, 20, "레이스 강도", [80, 95], 5],
        Nor: [4, 8, "FTP 88~92% (역치 바로 아래)", [88, 92], 2], Double: [4, 8, "FTP 88~92% (역치 바로 아래)", [88, 92], 2], Brick: [4, 20, "레이스 강도", [80, 95], 5] };
      const [lvl, rep, nm, w, rest] = map[ty] || [3, 15, "Z3", [76, 90], 5];
      const mins = (h / bSpd(lvl)) * 60, [n, r] = reps(mins, rep * [1, 0.75, 1.5, 1.25][Math.abs(V) % 4], 1, 12); // 블록마다 반복 길이를 바꿔요
      return `${n === 1 ? `${Math.round(r)}분 지속` : `${Math.round(r)}분 × ${n}회`} ${nm}${B ? ` ${Math.round((B.ftp * w[0]) / 100)}–${Math.round((B.ftp * w[1]) / 100)}W` : ` (FTP ${w[0]}–${w[1]}%)`}${n === 1 ? "" : `, 사이 ${Math.max(1, rest + [0, -1, 1][Math.floor(Math.abs(V) / 4) % 3])}분 Z1`} — 고강도 합계 약 ${km(h)}${["", " · 케이던스 70~80 (근지구력)", " · 케이던스 95~100 (회전)", " · 반복마다 마지막 1분은 한 단계 높게"][Math.floor(Math.abs(V) / 3) % 4]}`;
    };
    const swimMain = (h, ty) => {
      const css = S ? ` (${fmt(S.css)}/100m)` : "";
      const L0 = ({ EN: [200, 300, 100], CSS: [100, 200, 150, 50], CSS_long: [400, 500, 300], VO2: [100, 50, 75], Speed: [50, 25], OW: [0], Nor: [300, 200, 400] }[ty] || [200, 100])[Math.abs(V) % ({ EN: 3, CSS: 4, CSS_long: 3, VO2: 3, Speed: 2, OW: 1, Nor: 3 }[ty] || 2)];
      if (!L0) return `${mm(h)} 연속 (CSS +2~4초) — 사이팅 연습`;
      const n = Math.max(2, Math.round(h / L0)), len = Math.round(h / n / 25) * 25;
      const rv = Math.floor(Math.abs(V) / 4) % 3; // 휴식 시간도 블록마다 바꿔요
      const how = { EN: `CSS +3~6초 (Z3 — 숨이 조금 차는 정도), 휴식 ${["15초", "20초", "10초"][rv]}`, CSS: `CSS 페이스${css}, 휴식 ${["15초", "10초", "20초"][rv]}`, CSS_long: `CSS +1~3초, 휴식 ${["20초", "30초", "15초"][rv]}`, VO2: `CSS −3~6초, 휴식 ${["30초", "40초", "20초"][rv]}`, Speed: `전력, 휴식 ${["40초", "60초", "30초"][rv]}`, Nor: `CSS +1~2초, 휴식 ${["20초", "15초", "10초"][rv]}` }[ty] || `CSS 페이스${css}, 휴식 ${["15초", "10초", "20초"][rv]}`;
      const fmtV = ["", " — 2개마다 1개는 2초 더 빠르게", " — 4개씩 묶어 점점 빠르게 (디센딩)", " — 패들 끼고 (팔 위주)", " — 마지막 2개는 전력"][Math.floor(Math.abs(V) / 12) % 5];
      return `${len}m × ${n}회 ${how}${ty === "EN" ? "" : fmtV}`;
    };
    let hiSum = 0, tot = 0;
    if (disc === "brick") {
      const hb = H.bike || 0, hr = H.run || 0;
      const eb = Math.max(0, (D.bike || 0) - hb), er = Math.max(0, (D.run || 0) - hr);
      steps.push(`워밍업: 자전거 Z2 ${km(Math.min(10, eb))}`);
      if (hb) steps.push(`자전거 ${bikeMain(hb, "Brick")}`);
      if (eb > 10.4) steps.push(`자전거 Z2 ${km(eb - 10)}`);
      steps.push("바로 T2 전환 — 최대한 빠르게");
      if (hr) steps.push(`달리기 ${runMain(hr, "Brick")}`);
      if (er > 0.4) steps.push(`쿨다운: 달리기 E 페이스 ${km(er)}`);
      hiSum = hb / 30 + hr / 12; tot = (D.bike || 0) / 27 + (D.run || 0) / 11; // 시간 비율 추정
      txt.push(hb ? `자전거 고강도 ${km(hb)}` : "", hr ? `달리기 고강도 ${km(hr)}` : "");
    } else if (disc === "run" && H.run != null) {
      const h = H.run, e = ez("run", D.run, h, 3, 2, (v) => `워밍업: E 페이스 ${km(v)} + 스트라이드 20초 × 4`, (v) => `쿨다운: E 페이스 ${km(v)}`, (v) => `E 페이스 ${km(v)} (쉬운 강도)`);
      steps.push(e.pre, runMain(h, type), ...e.post);
      hiSum = h; tot = D.run; txt.push(`고강도 ${km(h)} · 저강도 ${km(D.run - h)}`);
    } else if (disc === "bike" && H.bike != null) {
      const h = H.bike, e = ez("bike", D.bike, h, 10, 6, (v) => `워밍업: Z1–Z2 ${km(v)} (마지막에 1분 빠르게 × 3)`, (v) => `쿨다운: Z1 ${km(v)}`, (v) => `Z2 지구력 ${km(v)}${B ? ` (${Math.round(B.ftp * 0.56)}–${Math.round(B.ftp * 0.75)}W)` : ""}`);
      steps.push(e.pre, bikeMain(h, type), ...e.post);
      hiSum = h; tot = D.bike; txt.push(`고강도 ${km(h)} · 저강도 ${km(D.bike - h)}`);
    } else if (disc === "swim" && H.swim != null) {
      const h = H.swim, e = ez("swim", D.swim, h, 400, 200, (v) => `워밍업: ${mm(v)} 편하게 + 드릴`, (v) => `쿨다운: ${mm(v)} 편하게`, (v) => `지구력 ${mm(v)} (CSS +5~10초, 쉬운 강도)`);
      steps.push(e.pre, swimMain(h, type), ...e.post);
      hiSum = h; tot = D.swim; txt.push(`고강도 ${mm(h)} · 저강도 ${mm(D.swim - h)}`);
    } else return null;
    void x;
    return { steps, frac: tot ? hiSum / tot : 0, text: txt.filter(Boolean).join(" · ") };
  }

  // ---------- 한 주 ----------
  function buildWeek(p, ctx, wk, opt = {}) {
    const goal = ctx.goal, phil = ctx.phil, phase = wk.key;
    const discs = discsOf(p.sport), tri = discs.length > 1;
    const days = [...(p.days || [])].map(Number).sort((a, b) => a - b);
    const n = days.length;
    if (!n) return { sessions: [], notes: [] };
    const prog = clamp(wk.meso, 0, 2);
    const sMin = num(p.sessionMin) || 60;
    const dO = p.dayOpts || {};
    const avail = (d) => num((dO[d] || {}).min) || sMin;          // 그날 가능한 시간
    const pref = (d) => (dO[d] || {}).pref || "auto";               // hard / easy / auto
    const fixedDisc = (d) => { const x = (dO[d] || {}).disc; return tri && x && x !== "auto" ? x : null; };
    const custom = days.some((d) => num((dO[d] || {}).min));
    const wh = num(p.weeklyHours);
    let budget = days.reduce((a, d) => a + avail(d), 0);
    if (wh) budget = Math.min(budget, wh * 60);
    budget *= wk.factor;

    // 롱 데이: 시간이 가장 많은 날 (같으면 일 > 토), '가볍게' 지정한 날은 제외
    let longDay = null;
    if (n >= 2) {
      const pool = days.filter((d) => pref(d) === "auto" && fixedDisc(d) !== "swim");
      const pool2 = pool.length ? pool : days.filter((d) => pref(d) !== "hard"); // 자동 날이 없으면: '강하게' 날은 강도 훈련 몫으로 남기고, 롱은 쉬운 날(시간 많은 날)에
      const list = pool2.length ? pool2 : days;
      const score = (d) => avail(d) * 10 + (d === 6 ? 2 : d === 5 ? 1 : 0);
      longDay = list.reduce((a, b) => (score(b) > score(a) ? b : a));
    }
    const cbw = wk.comeback; // 복귀 주: 앞 절반은 강한 훈련 없이, 뒤 절반은 가벼운 질 훈련 1회만
    const baseHard = cbw && cbw.easy ? 0 : cbw ? Math.min(1, hardCount(n, phase, phil, wk.recovery)) : hardCount(n, phase, phil, wk.recovery);
    const cand = days.filter((d) => d !== longDay && pref(d) !== "easy");
    const marked = cand.filter((d) => pref(d) === "hard");
    const allowExtra = baseHard > 0 && !["taper", "race"].includes(phase);
    const hardN0 = Math.min(cand.length, allowExtra ? Math.max(baseHard, Math.min(marked.length, baseHard + 1)) : baseHard);
    // 설정한 저강도·고강도 비율에 맞추려고 질 훈련 개수를 조절해요 (buildPlan이 가장 가까운 개수를 골라요)
    // 비율을 맞추려면 '가볍게'로 정한 날도 필요할 때만 질 훈련 후보로 써요
    const LQ = opt.level ? LEVEL_Q[opt.level.lv] : null; // 레벨별 주당 질 훈련 횟수 [최소, 최대]
    const want0 = allowExtra ? Math.max(0, hardN0 + (opt.hardDelta || 0)) : hardN0;
    const want = allowExtra && LQ && !BASE_LIKE.includes(phase) ? clamp(want0, LQ[0], LQ[1]) : allowExtra && LQ ? Math.min(want0, LQ[1]) : want0;
    const candX = want > cand.length ? [...cand, ...days.filter((d) => d !== longDay && !cand.includes(d) && pref(d) !== "easy")] : cand; // ‘가볍게’로 정한 날에는 절대 강한 훈련을 넣지 않아요
    const hardN = Math.min(cbw ? Math.min(want, cbw.easy ? 0 : 1) : want, candX.length);
    const hard = marked.slice(0, hardN);
    const adjOK = tri || phil === "norwegian"; // 강한 훈련은 이틀 연속 안 넣어요 (철인3종은 다른 종목끼리, 노르웨이는 역치 바로 아래라 허용)
    for (const gap of adjOK ? [2, 1] : [2]) for (const d of candX) {
      if (hard.length >= hardN) break;
      if (hard.includes(d)) continue;
      if (hard.every((h) => Math.abs(h - d) >= gap) && (longDay == null || Math.abs(longDay - d) >= gap)) hard.push(d);
    }
    if (adjOK) for (const d of candX) { if (hard.length >= hardN) break; if (!hard.includes(d)) hard.push(d); }
    hard.sort((a, b) => a - b);

    // 훈련 다양성: 달력 주 번호(aw) + 겹칠 때 바꾸는 salt로 매주·매 4주 블록이 다르게
    const VW = (wk.aw || wk.i) + (opt.salt || 0) * 5;
    const vOf = (d, s, k = 0) => VW * 5 + d * 3 + (s ? 2 : 0) + Math.floor(VW / 4) * 7 + k;
    const plan = {};
    const keys = rotateKeys(keysFor(goal, phase, phil), VW, phil);
    const used = new Set();
    const fb = BASE_LIKE.includes(phase) ? BASE_FALLBACK : FALLBACK;
    hard.forEach((d, i) => {
      const fx = fixedDisc(d);
      if (phase === "race") { plan[d] = [fx && fx !== "brick" ? fx : tri ? "run" : discs[0], "Opener"]; return; }
      if (phase === "taper") { const x = fx && fx !== "brick" ? fx : tri ? ["run", "bike", "swim"][i % 3] : discs[0]; plan[d] = [x, { run: "T_cruise", bike: "Thr", swim: "CSS" }[x]]; return; } // 조정기: 짧은 레이스 페이스·역치 자극 (양은 줄이고 강도는 유지)
      if (fx === "brick") { plan[d] = ["brick", "Brick"]; return; }
      let j = fx ? keys.findIndex((k, idx) => k[0] === fx && !used.has(idx)) : keys.findIndex((k, idx) => !used.has(idx) && !hard.some((h) => h !== d && fixedDisc(h) === k[0]));
      if (j < 0 && !fx) j = keys.findIndex((k, idx) => !used.has(idx));
      if (j >= 0) { used.add(j); plan[d] = keys[j].slice(); }
      else { const x = fx || (keys.length ? keys[i % keys.length][0] : discs[0]); plan[d] = [x, (() => { // 추가 질 훈련은 종류를 돌려가며 (같은 훈련 반복 방지)
        const pool = BASE_LIKE.includes(phase) ? { run: ["Fartlek", "Hills", "Steady"] }[x] : { run: ["T_cruise", "I", "T_tempo", "R"], bike: ["Thr", "VO2", "SS"], swim: ["CSS", "VO2", "CSS_long"] }[x];
        return pool ? pool[(i + VW + Math.floor(VW / 4)) % pool.length] : fb[x];
      })()]; }
    });
    if (phil === "norwegian" && (prog === 2 || !BASE_LIKE.includes(phase)) && hard.length && n >= 4 && plan[hard[0]] && plan[hard[0]][1] === "Nor" && plan[hard[0]][0] !== "swim") plan[hard[0]][1] = "Double"; // 더블 역치는 달리기·자전거만
    // 레벨이 낮을수록 강한 훈련을 부담 적은 종류로 바꿔요 (종목마다 따로)
    const LMAP = {
      0: { run: { I: "Fartlek", R: "Hills", T_cruise: "Steady", T_tempo: "Steady", Nor: "Fartlek", Double: "Fartlek" }, bike: { VO2: "Tempo", Ana: "Tempo", Thr: "Tempo", Nor: "Tempo", Double: "Tempo" }, swim: { VO2: "CSS_long", Speed: "CSS_long", Nor: "CSS_long" } },
      3: { run: { I: "T_cruise" }, bike: { VO2: "SS", Ana: "Thr" }, swim: { VO2: "CSS", Speed: "CSS" } },
    };
    // 🌱 레벨 1~3(출발·리듬 찾기·꾸준함)은 Z3까지만: Z4(역치)·Z5(VO2max) 훈련을 Z3 이하 훈련으로 바꿔요
    const Z3MAP = { run: { T_tempo: "Steady", T_cruise: "Steady", I: "Steady", R: "Steady", Hills: "Steady", Fartlek: "Steady", Nor: "Steady", Double: "Steady", Test: "Steady" },
      bike: { Thr: "Tempo", OU: "Tempo", VO2: "Tempo", Ana: "Tempo", SS: "Tempo", Nor: "Tempo", Double: "Tempo", Race: "Tempo", Test: "Tempo" },
      swim: { CSS: "EN", CSS_long: "EN", VO2: "EN", Speed: "EN", Nor: "EN", Test: "EN" } };
    const z3only = !!(opt.level && opt.level.lv <= 3 && !p.allowHi); // 본인이 원해서 켠 경우(allowHi)만 Z4·Z5를 넣어요
    const lmap = z3only ? Z3MAP : (opt.level && opt.level.band === 0) || cbw ? LMAP[0] : opt.level && opt.level.lv === 3 ? LMAP[3] : null; // 입문(1~2레벨)·복귀 주 / 3레벨
    if (lmap) Object.keys(plan).forEach((d) => { const [x, t] = plan[d], m = lmap[x]; if (m && m[t]) plan[d] = [x, m[t]]; });
    if (opt.level && opt.level.band <= 1) Object.keys(plan).forEach((d) => { if (plan[d][1] === "Double") plan[d] = [plan[d][0], "Nor"]; });
    { // 한 주 안에서 같은 질 훈련이 두 번 나오지 않게
      const seenT = new Set(), base = BASE_LIKE.includes(phase);
      const POOL = base ? { run: ["Steady", "Fartlek", "Hills"], bike: ["Tempo", "Force", "SS"], swim: ["CSS", "Tech"] } : { run: ["T_cruise", "I", "T_tempo", "R", "Hills"], bike: ["Thr", "VO2", "SS", "Tempo"], swim: ["CSS", "VO2", "CSS_long"] };
      const hardOK = (c, x) => !(lmap && lmap[x] && lmap[x][c]);
      hard.forEach((d) => {
        if (!plan[d]) return;
        const [x, t] = plan[d];
        if (seenT.has(x + t) && !["Nor", "Double", "Opener", "Brick"].includes(t)) { const c = (POOL[x] || []).find((y) => !seenT.has(x + y) && hardOK(y, x)); if (c) plan[d] = [x, c]; }
        seenT.add(plan[d][0] + plan[d][1]);
      });
    }

    // 롱 데이
    if (longDay != null) {
      const late = /build|peak|r4|s3/.test(phase);
      const fx = fixedDisc(longDay);
      if (phase === "race") { const x = fx && fx !== "brick" ? fx : tri ? "bike" : discs[0]; plan[longDay] = [x, easyType(x, phil, phase)]; }
      else if (fx === "brick") plan[longDay] = ["brick", "Brick"];
      else if (fx === "run" || fx === "swim") plan[longDay] = [fx, phil === "maf" && fx !== "swim" ? "MAF" : "Long"];
      else if (tri) plan[longDay] = late && n >= 4 && !wk.recovery && phase !== "peak" && !fx ? ["brick", "Brick"] : ["bike", phil === "maf" ? "MAF" : "Long"];
      else {
        const d = discs[0];
        plan[longDay] = [d, d === "run" && goal.key === "full" && phase === "r4" && !wk.recovery && phil !== "maf" ? "M_long" : phil === "maf" && d !== "swim" ? "MAF" : "Long"];
      }
    }
    // 테스트 (회복 주, 또는 첫 주에 기준값이 없을 때)
    const missing = discs.filter((x) => (x === "run" && !ctx.run) || (x === "bike" && !ctx.bike) || (x === "swim" && !ctx.swim));
    const testDiscs = wk.recovery ? discs : wk.i === 0 ? missing : [];
    if (testDiscs.length && phase !== "race" && phase !== "taper") {
      const free = days.filter((d) => d !== longDay && (!plan[d] || EASY.includes(plan[d][1])));
      testDiscs.forEach((x) => {
        const d = free.find((dd) => fixedDisc(dd) === x) ?? free.find((dd) => !fixedDisc(dd));
        if (d != null) { plan[d] = [x, "Test"]; free.splice(free.indexOf(d), 1); }
      });
    }
    // 나머지: 쉬운 훈련
    const prevHard = (d) => !!plan[d - 1] && !EASY.includes(plan[d - 1][1]);
    days.filter((d) => !plan[d] && fixedDisc(d)).forEach((d) => {
      const fx = fixedDisc(d);
      plan[d] = fx === "brick" ? ["brick", "Brick"] : [fx, n >= 5 && prevHard(d) ? "Rec" : easyType(fx, phil, phase)];
    });
    const rest = days.filter((d) => !plan[d]);
    if (!tri) rest.forEach((d) => { plan[d] = [discs[0], n >= 5 && prevHard(d) ? "Rec" : easyType(discs[0], phil, phase)]; });
    else {
      const v = p.volume || {};
      const need = {
        swim: num(v.swim) ? (num(v.swim) / 100) * ((((ctx.swim && ctx.swim.css) || 120) + 15) / 60) : budget * 0.25,
        bike: num(v.bike) ? (num(v.bike) / 27) * 60 : budget * 0.45,
        run: num(v.run) ? num(v.run) * (((ctx.run && ctx.run.E[1]) || 360) / 60) : budget * 0.3,
      };
      const per = budget / n;
      Object.values(plan).forEach(([x]) => { if (x === "brick") { need.bike -= per; need.run -= per * 0.45; } else need[x] -= per; });
      const most = (l) => l.reduce((a, b) => (need[b] > need[a] ? b : a));
      rest.forEach((d) => {
        const ph = prevHard(d);
        const x = most(ph ? ["swim", "bike"] : ["swim", "bike", "run"]);
        plan[d] = [x, ph && n >= 5 ? "Rec" : easyType(x, phil, phase)];
        need[x] -= per;
      });
      if (n >= 3) ["swim", "run", "bike"].forEach((x) => {
        if (days.some((d) => plan[d][0] === x || (plan[d][0] === "brick" && x !== "swim"))) return;
        const cnt = (c) => days.filter((d) => plan[d][0] === c).length;
        const from = ["bike", "run", "swim"].filter((c) => c !== x).sort((a, b) => cnt(b) - cnt(a))[0];
        const d = days.find((dd) => !fixedDisc(dd) && plan[dd][0] === from && EASY.includes(plan[dd][1]));
        if (d != null) plan[d] = [x, easyType(x, phil, phase)];
      });
      ["swim", "bike", "run"].forEach((x) => {
        const ds = days.filter((d) => plan[d][0] === x);
        if (ds.length && ds.every((d) => plan[d][1] === "Rec")) plan[ds[0]][1] = easyType(x, phil, phase);
      });
      // 설정한 주간 거리를 하루에 몰지 않게: 하루 거리가 너무 많은 종목에 요일을 더 줘요
      const VV = p.volume || {};
      const df = phase === "taper" ? 0.6 : phase === "race" ? 0.4 : phase === "trans" ? 0.5 : wk.recovery ? 0.7 : 1;
      const capD = { swim: 4000, bike: 100, run: 21 };
      const cntOf = (x) => days.filter((d) => plan[d][0] === x || (plan[d][0] === "brick" && x !== "swim")).length;
      const perOf = (x, c = cntOf(x)) => (num(VV[x]) ? (num(VV[x]) * df) / Math.max(1, c) : 0);
      for (let it = 0; it < 6; it++) {
        const over = ["swim", "run", "bike"].filter((x) => cntOf(x) && perOf(x) > capD[x]).sort((a, b) => perOf(b) / capD[b] - perOf(a) / capD[a])[0];
        if (!over) break;
        const donor = ["bike", "run", "swim"].filter((x) => x !== over && cntOf(x) >= 2 && perOf(x, cntOf(x) - 1) <= capD[x] * 1.1)
          .sort((a, b) => perOf(a) / capD[a] - perOf(b) / capD[b])[0];
        if (!donor) break;
        const d = days.find((dd) => !fixedDisc(dd) && dd !== longDay && plan[dd][0] === donor && EASY.includes(plan[dd][1]));
        if (d == null) break;
        plan[d] = [over, easyType(over, phil, phase)];
      }
    }

    // ---- 🏁 대회 앞뒤: 조정기(D-14~D-3) · 이틀 전 가볍게 · 전날 오프너 · 대회 뒤 회복 기간 ----
    const RD = wk.raceDays || {};
    const raceDayIdx = new Set(wk.races.map((r) => (r.d.getDay() + 6) % 7));
    const notHard = (ty) => EASY.includes(ty) || ty === "Opener";
    let wkHardInRaceWeek = 0;
    days.forEach((d) => {
      const x0 = plan[d][0] === "brick" ? "bike" : plan[d][0];
      if (raceDayIdx.has(d)) { plan[d] = [x0, "Test"]; return; } // 대회 날 (아래에서 대회로 바뀌어요, 거리 목표에서는 빠져요)
      const rd = RD[d];
      if (!rd) return;
      if (rd.kind === "taper") { // 조정기: 1주차는 질 훈련 유지, 대회 주(D-7~D-3)는 짧은 레이스 페이스 자극 1번만
        if (plan[d][1] === "Test") { plan[d] = [x0, easyType(x0, phil, phase)]; return; } // 조정기에는 테스트 안 해요
        if (rd.to <= 7 && !notHard(plan[d][1])) { if (wkHardInRaceWeek++ >= 1 || plan[d][1] === "Long" || plan[d][1] === "M_long") plan[d] = [x0, easyType(x0, phil, phase)]; }
        return;
      }
      if (rd.kind === "rest") plan[d] = [x0, "Rec"];
      else if (rd.kind === "pre1") plan[d] = [x0, "Opener"];
      else if (!notHard(plan[d][1])) plan[d] = [x0, easyType(x0, phil, phase)]; // post·pre2: 질 훈련·롱 세션 금지
    });
    if (longDay != null && RD[longDay] && RD[longDay].kind !== "pre2" && !(RD[longDay].kind === "taper" && RD[longDay].to >= 8)) longDay = null;
    const raceNear = days.filter((d) => (RD[d] && RD[d].kind !== "taper") || raceDayIdx.has(d)).length;
    const raceCut = raceNear ? Math.max(0.5, 1 - 0.08 * raceNear) : 1; // 대회 앞뒤 날이 많을수록 주간 거리를 줄여요
    // 조정기 주간 거리: D-14~D-8은 80~90%, D-7~D-3은 50~75% (A대회가 더 많이 줄여요)
    const tapDays = [0, 1, 2, 3, 4, 5, 6].map((d) => RD[d] && RD[d].kind === "taper" ? RD[d] : null);
    const taperCut = tapDays.some(Boolean) && !["taper", "race"].includes(phase)
      ? tapDays.reduce((a, t) => a + (!t ? 1 : t.to >= 8 ? (t.race.priority === "A" ? 0.82 : 0.88) : (t.race.priority === "A" ? 0.55 : 0.7)), 0) / 7 : 1;
    const raceNotes = [];
    let prep = null;
    {
      const stages = new Map();
      [0, 1, 2, 3, 4, 5, 6].forEach((d) => { const t = RD[d]; if (t && (t.kind === "taper" || t.kind === "pre2" || t.kind === "pre1")) {
        const to = t.kind === "taper" ? t.to : t.kind === "pre2" ? 2 : 1;
        const a = prepAdvice(t.race, to, goal.sk);
        if (a && !stages.has(a.stage)) stages.set(a.stage, a);
        if (!prep || to < prep.to) prep = { race: t.race, to, stage: a && a.stage };
      } });
      stages.forEach((a) => raceNotes.push(`${a.title} — ${a.lines.join(" ")}`));
      if (prep) prep.advice = [...stages.values()];
      const seen = new Set();
      Object.values(RD).forEach((rd) => {
        if (!rd.of || seen.has(rd.race)) return;
        seen.add(rd.race);
        const rest = Math.max(1, Math.round(rd.of * 0.25));
        raceNotes.push(`🏁 ${rd.race.name || "대회"}(${rd.race.event || ""}) 뒤 회복 ${rd.of}일 — 처음 ${rest}일은 휴식·아주 가볍게, 그 뒤 ${rd.of - rest}일은 쉬운 강도만 (질 훈련·롱 세션 없음).`);
      });
    }

    // 시간 나누기
    const mins = {};
    if (custom) { // 요일별 시간을 직접 정한 경우: 그날 시간에 맞춤
      days.forEach((d) => { const t = plan[d][1]; mins[d] = Math.max(20, r5(avail(d) * wk.factor * (t === "Rec" ? 0.6 : t === "Opener" ? 0.7 : 1))); });
      const tot = days.reduce((a, d) => a + mins[d], 0);
      if (wh && tot > wh * 60 * wk.factor) days.forEach((d) => { mins[d] = Math.max(20, r5((mins[d] * wh * 60 * wk.factor) / tot)); });
    } else {
      const Wt = { Long: 1.5, M_long: 1.5, Brick: 1.5, Rec: 0.6, Opener: 0.7, Double: 1.4, Test: 0.9 };
      const wOf = (d) => (plan[d][1] === "MAF" && d === longDay ? 1.5 : Wt[plan[d][1]] || 1);
      const sumW = days.reduce((a, d) => a + wOf(d), 0);
      days.forEach((d) => { mins[d] = Math.max(20, r5((budget * wOf(d)) / sumW)); });
    }

    // 세션 길이 상한 (긴 시간이 있어도 회복·평일 달리기·수영은 너무 길지 않게)
    days.forEach((d) => {
      const [x, ty] = plan[d];
      if (ty === "Rec") mins[d] = Math.min(mins[d], RD[d] && RD[d].kind === "rest" ? 20 : 45);
      if (ty === "Opener" && RD[d] && RD[d].kind === "pre1") mins[d] = Math.min(mins[d], 30);
      else if (x === "run" && d !== longDay) mins[d] = Math.min(mins[d], 90);
      else if (x === "swim") mins[d] = Math.min(mins[d], d === longDay || ty === "Long" ? 120 : 90);
      if (ty === "Test") mins[d] = Math.max(mins[d], { bike: 60, swim: 45, run: 45 }[x] || 45); // 테스트는 최소 시간 필요
    });

    // ---- 오전·오후: 하루 두 번 훈련하는 날은 오후 훈련을 하나 더 넣어요 ----
    const plan2 = {}, mins2 = {};
    days.forEach((d) => {
      const o = dO[d] || {};
      if (o.slot !== "both" || phase === "race") return;
      const [x, ty] = plan[d];
      if (ty === "Double" || (phil === "norwegian" && ty === "Nor")) { // 노르웨이 더블 역치: 오전·오후 모두 역치 바로 아래
        plan[d] = [x, "Nor"];
        plan2[d] = [x, "Nor"];
      } else {
        let x2 = tri ? (o.disc2 && o.disc2 !== "auto" ? o.disc2 : x === "swim" ? "run" : "swim") : discs[0];
        if (x2 === "brick") x2 = "run";
        plan2[d] = [x2, x2 === x || x === "brick" ? "Rec" : easyType(x2, phil, phase)];
      }
      mins2[d] = Math.max(20, r5((num(o.min2) || 45) * wk.factor * (plan2[d][1] === "Rec" ? 0.8 : 1)));
    });
    // 🛡️ 문진표에서 '가볍게'로 정한 요일은 무슨 일이 있어도 쉬운 강도만 (대회 전날 오프너는 예외)
    Object.keys(plan).forEach((d) => {
      const [x, t] = plan[d];
      if (pref(+d) === "easy" && !EASY.includes(t) && !["Long", "MAF", "Opener"].includes(t)) { const x2 = x === "brick" ? "bike" : x; plan[d] = [x2, easyType(x2, phil, phase)]; }
    });
    if (cbw && cbw.easy) Object.keys(plan).forEach((d) => { // 복귀 앞 절반: 브릭·질 훈련 없이 쉬운 강도만
      const [x, t] = plan[d];
      if (!EASY.includes(t) && t !== "Long" && t !== "MAF") { const x2 = x === "brick" ? "bike" : x; plan[d] = [x2, easyType(x2, phil, phase)]; }
    });
    // 훈련 단위 (하루 한 번이면 1개, 두 번이면 오전·오후 2개)
    const units = [];
    days.forEach((d) => {
      units.push({ d, s: 0, k: `${d}:0`, p: plan[d] });
      if (plan2[d]) units.push({ d, s: 1, k: `${d}:1`, p: plan2[d] });
    });
    const minsU = {};
    units.forEach((u) => { minsU[u.k] = u.s ? mins2[u.d] : mins[u.d]; });
    const slotOf = (u) => { const sl = (dO[u.d] || {}).slot; return sl === "both" ? (u.s ? "오후" : "오전") : sl === "am" ? "오전" : sl === "pm" ? "오후" : null; };

    // ---- 주간 거리 목표 → 훈련마다 나누기 (설정한 거리를 그대로 채워요) ----
    const ePace = ctx.run ? (ctx.run.E[0] + ctx.run.E[1]) / 2 : 360;
    // 주간 거리를 안 적은 종목은 '가능한 운동 시간'으로 거리를 계산해요 → 모두 거리 기준으로 비율·다양성이 정확해져요
    const V = Object.assign({}, p.volume || {}), estV = [];
    {
      const baseMin = (budget / Math.max(0.3, wk.factor || 1)) * 0.85;
      const share = tri ? { swim: 0.2, bike: 0.5, run: 0.3 } : { [discs[0]]: 1 };
      const missing = discs.filter((x) => !num(V[x]));
      const known = discs.filter((x) => num(V[x]));
      // 이미 적은 종목에 쓰는 시간을 빼고 나머지 시간을 나눠요
      const usedMin = known.reduce((a, x) => a + (x === "run" ? (num(V.run) * ePace) / 60 : x === "bike" ? (num(V.bike) / 26) * 60 : ((num(V.swim) / 100) * ((((ctx.swim && ctx.swim.css) || 120) + 20))) / 60), 0);
      const left = Math.max(baseMin * 0.3, baseMin - usedMin), shSum = missing.reduce((a, x) => a + share[x], 0) || 1;
      missing.forEach((x) => {
        const m = (left * share[x]) / shSum;
        const lvX = opt.level && ((opt.level.per && opt.level.per[x] && opt.level.per[x].lv) || opt.level.lv);
        if (lvX) { // 거리를 안 적었으면 내 레벨에 맞는 주간 거리 (레벨 기준표의 그 레벨 거리)
          const cut = LV_VOL[x], half = { run: 10, bike: 40, swim: 2000 }[x];
          V[x] = lvX <= 1 ? Math.min(half, cut[0] * 0.7) : cut[Math.min(cut.length - 1, lvX - 2)];
          if (tri) V[x] *= 0.75; // 철인3종은 세 종목을 함께 하니까 종목별로는 조금 적게
        } else V[x] = x === "run" ? m / (ePace / 60) : x === "bike" ? (m / 60) * 26 : (m / ((((ctx.swim && ctx.swim.css) || 120) + 20) / 60)) * 100; // 레벨도 모르면 시간으로
        estV.push(x);
      });
    }
    const notes = [...raceNotes];
    const fmtVol = (x, v) => (x === "swim" ? `${(Math.round(v / 50) * 50).toLocaleString()}m` : `${round1(v)}km`);
    // 회복 주·테이퍼에는 거리도 줄여요 (보통 주는 설정한 거리 100%)
    const distFactor = (phase === "taper" ? 0.6 : phase === "race" ? 0.4 : phase === "trans" ? 0.5 : wk.recovery ? 0.7 : 1) * (["taper", "race"].includes(phase) ? 1 : raceCut * taperCut) * (wk.comeback ? wk.comeback.pct / 100 : 1); // 복귀 주는 거리도 줄여요
    const css = (ctx.swim && ctx.swim.css) || 120;
    const lvlOf = (ty) => (ty === "Rec" ? 1 : EASY.includes(ty) || ty === "Long" ? 2
      : ["Steady", "Fartlek", "Tempo", "SS", "CSS_long", "OW", "Brick", "M_long", "M_mid", "Opener"].includes(ty) ? 3 : 4);
    const speedKmh = (lvl) => (lvl <= 1 ? 22 : lvl === 2 ? 26 : 28);
    const runPace = (lvl) => ePace * (lvl >= 4 ? 0.9 : lvl === 3 ? 0.95 : lvl === 1 ? 1.08 : 1);
    const sessDist = {}; // 훈련 단위 → { swim: m, bike: km, run: km }
    const targets = {};
    const longKey = longDay != null ? `${longDay}:0` : null;
    ["swim", "bike", "run"].forEach((x) => {
      const v = num(V[x]);
      if (!v || !discs.includes(x)) return;
      const tgt = v * distFactor;
      // 이 종목 훈련이 테스트뿐인 주(예: 철인3종 테스트 주)에는 테스트 날에도 거리를 나눠요 (거리가 통째로 빠지지 않게)
      const onlyTest = !units.some((u) => (u.p[0] === x || (u.p[0] === "brick" && x !== "swim")) && u.p[1] !== "Test" && !(RD[u.d] && RD[u.d].kind === "rest"));
      const share = (u) => {
        const [dx, ty] = u.p;
        if (RD[u.d] && RD[u.d].kind === "rest") return 0; // 대회 뒤 휴식일은 거리 목표에서 빼요 (테스트 날도 거리를 나눠 맡아요 — 한 날에 몰리지 않게)
        const w = (ty === "Long" || ty === "M_long" ? 1.5 : ty === "Rec" ? 0.6 : ty === "Opener" ? 0.5 : ty === "Test" ? (onlyTest ? 1 : 0.8) : 1) * (RD[u.d] && RD[u.d].kind !== "rest" ? 0.6 : 1); // 대회 앞뒤 날은 거리를 적게
        const varyW = ty === "Long" || ty === "M_long" || ty === "Test" || ty === "Opener" ? 1 : [1.2, 0.85, 1, 1.1, 0.8, 1.05, 0.95][(Math.abs(VW) * 3 + u.d * 2 + (u.s ? 1 : 0)) % 7]; // 🔄 요일별 거리를 주마다 다르게 (주간 합계는 그대로)
        return dx === x ? w * varyW : dx === "brick" ? (x === "bike" ? w * 0.7 : x === "run" ? w * 0.3 : 0) : 0;
      };
      const tot = units.reduce((a, u) => a + share(u), 0);
      if (!tot) {
        notes.push(`⚠️ ${DISC[x].name} 주간 거리 ${fmtVol(x, v)}를 넣을 ${DISC[x].name} 훈련일이 이번 주에 없어요. 설정 → 요일별 설정에서 ${DISC[x].name} 날을 정해 주세요.`);
        return;
      }
      targets[x] = tgt;
      units.forEach((u) => { const sh = share(u); if (sh) (sessDist[u.k] = sessDist[u.k] || {})[x] = (tgt * sh) / tot; });
      // 다니엘스: 롱런은 주간 거리의 25~30% 이하 → 넘치면 다른 달리기로 나눠요
      if (x === "run" && longKey && sessDist[longKey] && sessDist[longKey].run && plan[longDay][0] === "run") {
        const cap = tgt * (tgt < 64 ? 0.3 : 0.25);
        const extra = sessDist[longKey].run - cap;
        const others = units.filter((u) => u.k !== longKey && sessDist[u.k] && sessDist[u.k].run && u.p[0] === "run");
        if (extra > 0 && others.length) {
          sessDist[longKey].run = cap;
          others.forEach((u) => { sessDist[u.k].run += extra / others.length; });
          notes.push(`롱런은 기준(주간 거리의 ${tgt < 64 ? 30 : 25}% 이하)에 맞춰 ${round1(cap)}km로 하고, 나머지는 다른 달리기에 나눴어요.`);
        }
      }
    });
    // ⏱️ 거리 목표가 가능한 시간보다 많으면, 시간에 맞춰 거리를 줄이고 이유를 알려 줘요 (할 수 있는 양으로 짜는 게 코치의 원칙)
    let timeK = 1;
    {
      const estMin = (o) => (o.swim ? ((o.swim / 100) * (css + 15)) / 60 + 4 : 0) + (o.bike ? (o.bike / 26) * 60 : 0) + (o.run ? (o.run * ePace) / 60 : 0);
      const need = units.reduce((a, u) => a + (sessDist[u.k] ? estMin(sessDist[u.k]) : 0), 0);
      const cap = budget * 1.1;
      // ✅ 문진표에 직접 적은 주간 거리는 시간 때문에 줄이지 않아요 (계획의 기준은 내가 적은 거리) — 시간이 모자라면 알려만 줘요
      //    직접 적지 않아 앱이 추정한 종목만 시간에 맞춰 줄여요
      if (need > cap && need > 0) {
        const est = estV.filter((x) => targets[x]);
        if (est.length) {
          const fixedMin = units.reduce((a, u) => { const o = sessDist[u.k]; if (!o) return a; const f = {}; Object.keys(o).forEach((x) => { if (!est.includes(x)) f[x] = o[x]; }); return a + estMin(f); }, 0);
          timeK = Math.max(0.3, Math.min(1, (cap - fixedMin) / Math.max(1, need - fixedMin)));
          Object.values(sessDist).forEach((o) => est.forEach((x) => { if (o[x]) o[x] *= timeK; }));
          est.forEach((x) => { targets[x] *= timeK; });
        }
      }
      // 하루 운동이 그날 가능한 시간을 넘으면, 넘치는 거리는 롱 세션(주말 최대 2배)이나 여유 있는 날로 옮겨요
      const limOf = (u) => (u.s ? num((dO[u.d] || {}).min2) || 45 : avail(u.d)) * (u.k === longKey ? 2.2 : 1.3);
      for (let pass = 0; pass < 3; pass++) {
        let moved = false;
        units.forEach((u) => {
          const o = sessDist[u.k];
          if (!o) return;
          const over = estMin(o) - limOf(u);
          if (over <= 1) return;
          const k = Math.max(0, 1 - over / estMin(o)), take = {};
          Object.keys(o).forEach((x) => { take[x] = o[x] * (1 - k); o[x] *= k; });
          const room = units.filter((v) => v !== u && sessDist[v.k] && estMin(sessDist[v.k]) < limOf(v) - 5)
            .sort((a, b) => (b.k === longKey) - (a.k === longKey) || (limOf(b) - estMin(sessDist[b.k])) - (limOf(a) - estMin(sessDist[a.k])));
          Object.keys(take).forEach((x) => {
            let rest = take[x];
            room.forEach((v) => {
              if (rest <= 0 || sessDist[v.k][x] == null) return;
              const per = estMin({ [x]: 1 }) || 1, can = Math.max(0, (limOf(v) - estMin(sessDist[v.k])) / per);
              const add = Math.min(rest, can); sessDist[v.k][x] += add; rest -= add;
            });
            if (rest > 0) { if (estV.includes(x)) targets[x] = Math.max(0, targets[x] - rest); else o[x] += rest; } // 옮길 곳이 없으면: 직접 적은 거리는 그날에 그대로 두고, 추정 거리만 줄여요
          });
          moved = true;
        });
        if (!moved) break;
      }
    }
    // ---- ⚖️ 강도 비율을 '거리'로 정확히 나누기 ----
    // 예) 주간 달리기 100km · 저강도 80% → 고강도 구간 합계 20km를 질 훈련에 나누고, 나머지 80km는 쉬운 강도(워밍업·쿨다운 포함)
    const L = opt.lowPct;
    const ratioWeek = L != null && L < 100 && !wk.recovery && !(wk.comeback && wk.comeback.easy) && phase !== "trans" && phil !== "maf"; // 조정기(테이퍼·대회 주)도 고강도 10%는 유지
    const hiPlan = {}, ratio = {};
    let ratioScore = 0;
    const rhythm = {}, rhythmTxt = []; // 리듬 날 (쉬운 훈련 + 마지막 짧은 스프린트·레이스 페이스)
    if (ratioWeek) {
      const isQ = (ty) => lvlOf(ty) >= 3 && !["Test", "Opener"].includes(ty);
      const WU = { run: 3, bike: 10, swim: 500 }, MINU = { run: 3, bike: 15, swim: 600 }, IDEAL = opt.level ? LEVEL_IDEAL(opt.level.lv) : { run: 7, bike: 35, swim: 1200 }; // IDEAL: 질 훈련 1회의 알맞은 고강도 양 (레벨이 높을수록 많게)
      ["swim", "bike", "run"].forEach((x) => {
        if (!targets[x]) return;
        let hu = units.filter((u) => sessDist[u.k] && sessDist[u.k][x] && isQ(u.p[1]));
        if (!hu.length) { // 이 종목에 질 훈련이 없으면 쉬운 날 하나를 질 훈련으로
          const e = units.filter((u) => u.p[0] === x && sessDist[u.k] && sessDist[u.k][x] && EASY.includes(u.p[1]) && u.k !== longKey && pref(u.d) !== "easy" && (!RD[u.d] || (RD[u.d].kind === "taper" && RD[u.d].to >= 3)))
            .sort((a, b) => sessDist[b.k][x] - sessDist[a.k][x])[0];
          if (e) { e.p = [x, fb[x] || "Tempo"]; if (!e.s) plan[e.d] = e.p; hu = [e]; }
        }
        if (!hu.length) { ratioScore += 5; return; }
        // 📅 주 운동 횟수별 구성 (모든 종목): 3번 = 쉬운 날 2 + 강도 1 · 4번 = 쉬운 날 2 + 강도 1 + 리듬 1 · 5번 = 쉬운 날 3 + 강도 1 + 리듬 1
        //    리듬 날 = 쉬운 강도로 거리를 채우고 마지막에 짧게 빠르게 (자전거 4분 이내 · 달리기 1,000m 이내 · 수영 400m 이내)
        const cntX = units.filter((u) => u.p[0] === x).length;
        if (cntX <= 5 && hu.length > 1) { // 강도 날은 하루만 — 나머지는 쉬운 훈련으로
          const easyT = { run: "E", bike: "Z2", swim: "EN" }[x];
          hu.slice(1).forEach((u) => { u.p = [x, easyT]; if (!u.s) plan[u.d] = u.p; });
          hu = [hu[0]];
        }
        if (cntX >= 4 && cntX <= 5) {
          const d0 = hu[0].d;
          const cand = units.filter((u) => u !== hu[0] && u.p[0] === x && u.p[1] !== "Rec" && sessDist[u.k] && sessDist[u.k][x] && EASY.includes(u.p[1]) && u.k !== longKey && !RD[u.d]) // 리듬 날은 거의 쉬운 훈련이라 '가볍게' 날에도 넣어요
            .sort((a, b) => (Math.abs(b.d - d0) >= 2) - (Math.abs(a.d - d0) >= 2) || sessDist[a.k][x] - sessDist[b.k][x])[0];
          if (cand) { rhythm[cand.k] = x; rhythmTxt.push(DISC[x].name); }
        }
        const hiT = targets[x] * (1 - L / 100);
        // 훈련 종류별 한 번에 넣을 수 있는 고강도 상한 (다니엘스: R 5%·최대 8km, I 8%·최대 10km, T 10%, M 20%·최대 29km)
        const capOf = (ty) => (x !== "run" ? Infinity : ty === "R" ? Math.min(targets.run * 0.05, 8) : ty === "I" ? Math.min(targets.run * 0.08, 10)
          : /^T_/.test(ty) ? targets.run * 0.1 : /^M_/.test(ty) ? Math.min(targets.run * 0.2, 29) : ty === "Nor" || ty === "Double" ? targets.run * 0.12 : targets.run * 0.08);
        const share = {}; let left = hiT, open = hu.slice();
        for (let it = 0; it < 6 && left > 1e-6 && open.length; it++) { // 물 채우듯이: 상한에 걸린 훈련은 빼고 나머지에 나눠요
          const each = left / open.length;
          open.forEach((u) => { const add = Math.min(each, capOf(u.p[1]) - (share[u.k] || 0)); share[u.k] = (share[u.k] || 0) + add; left -= add; });
          open = open.filter((u) => capOf(u.p[1]) - share[u.k] > 1e-6);
        }
        if (left > 1e-6) { // 상한을 다 채워도 남으면 (설정 비율 우선) 고르게 더하고, 질 훈련 개수를 늘리는 쪽을 더 좋게 평가
          hu.forEach((u) => { share[u.k] += left / hu.length; });
          ratioScore += 1 + left / Math.max(1, hiT);
        }
        const per = hiT / hu.length;
        hu.forEach((u) => {
          let need = share[u.k] + WU[x] - sessDist[u.k][x];
          if (need > 0) { // 질 훈련 날 거리가 모자라면 쉬운 날에서 가져와요 (총 거리는 그대로)
            const donors = units.filter((v) => !hu.includes(v) && sessDist[v.k] && sessDist[v.k][x] > MINU[x]);
            const room = donors.reduce((a, v) => a + sessDist[v.k][x] - MINU[x], 0);
            const take = Math.min(need, room);
            donors.forEach((v) => { const t = (take * (sessDist[v.k][x] - MINU[x])) / (room || 1); sessDist[v.k][x] -= t; });
            sessDist[u.k][x] += take;
          }
          (hiPlan[u.k] = hiPlan[u.k] || {})[x] = Math.min(share[u.k], sessDist[u.k][x] * 0.9);
        });
        const hiSum = hu.reduce((a, u) => a + hiPlan[u.k][x], 0);
        ratio[x] = { total: targets[x], hi: hiSum, n: hu.length };
        ratioScore += Math.abs(Math.log(Math.max(per, 1e-3) / IDEAL[x]));
      });
      if (rhythmTxt.length) notes.push(`⚡ 이번 주 구성: 강도 훈련 1번 + 리듬 날 1번 + 나머지는 쉬운 훈련 (${rhythmTxt.join(" · ")}). 리듬 날은 쉬운 강도로 거리를 채우고 마지막에만 짧게 빠르게(스프린트·레이스 페이스 느낌) 해요 — 자전거 4분 · 달리기 1,000m · 수영 400m 이내. 다리에 빠른 리듬을 잊지 않게 하면서도 피로는 거의 남지 않아요.`);
      // 쉬운 날이 남도록: 질 훈련이 훈련일의 40%를 넘으면 감점
      const nQ = units.filter((u) => hiPlan[u.k]).length;
      ratioScore += 0.6 * Math.max(0, nQ - Math.ceil(units.length * 0.4));
      const R = Object.entries(ratio);
      if (R.length) {
        notes.unshift(`⚖️ 강도 비율 ${L}:${100 - L} (거리 기준) — ${R.map(([x, r]) => `${DISC[x].icon} ${DISC[x].name} ${fmtVol(x, r.total)} = 저강도 ${fmtVol(x, r.total - r.hi)} + 고강도 ${fmtVol(x, r.hi)} (질 훈련 ${r.n}회)`).join(" · ")}`);
        if (ratio.run && ratio.run.hi > ratio.run.total * 0.23) notes.push(`⚠️ 달리기 고강도 ${fmtVol("run", ratio.run.hi)}는 권장(T 10% + I 8% + R 5% ≈ 23%)보다 많아요. 피로·부상에 주의하세요.`);
      }
    }

    // 거리로 그 훈련 시간을 계산 (거리 목표가 있는 종목은 시간보다 거리가 우선)
    units.forEach((u) => {
      const o = sessDist[u.k];
      if (!o) return;
      const lvl = lvlOf(u.p[1]);
      let m = 0;
      if (o.swim) m += ((o.swim / 100) * (css + 15)) / 60 + 4;
      if (o.bike) m += (o.bike / speedKmh(lvl)) * 60;
      if (o.run) m += (o.run * runPace(lvl)) / 60;
      minsU[u.k] = Math.max(10, r5(m)); // 거리가 줄면 시간도 같이 줄어요 (조정기에 양이 줄어든 게 시간에도 보이게)
    });

    // 주간 달리기 거리 (다니엘스 질 훈련 상한 계산용)
    const runMin = units.reduce((a, u) => a + (u.p[0] === "run" ? minsU[u.k] : u.p[0] === "brick" ? minsU[u.k] * 0.3 : 0), 0);
    const weekKm = targets.run || (runMin * 60) / ePace;
    if (!targets.run && discs.includes("run") && longKey && plan[longDay][0] === "run") {
      const capKm = weekKm * (weekKm < 64 ? 0.3 : 0.25);
      const capMin = Math.min(150, Math.round((capKm * ePace) / 60));
      if (minsU[longKey] > capMin && capMin >= 30) { minsU[longKey] = r5(capMin); notes.push(`롱런은 기준(주간 거리의 ${weekKm < 64 ? 30 : 25}%·150분 이하)에 맞춰 ${minsU[longKey]}분으로 줄였어요.`); }
    }

    const env = p.env || {};
    const sessions = units.map((u) => {
      const [disc, type] = u.p;
      const minutes = minsU[u.k];
      // v: 주차·요일마다 다른 변형을 고르는 번호 → 매주·매일 다른 세션
      let ty = type; // 실제로 쓰는 훈련 종류 (Z3 안전장치로 바뀔 수 있어요)
      let x = workout(disc, type, { min: minutes, prog, ctx, goal, phase, weekKm, dist: sessDist[u.k] || null, v: vOf(u.d, u.s), noFinish: ratioWeek, z3: z3only });
      if (z3only && x.lvl >= 4 && disc !== "brick") { // 안전장치: 그래도 Z4 이상이 나오면 Z3 훈련으로
        const safe = { run: "Steady", bike: "Tempo", swim: "EN" }[disc];
        if (safe) { ty = safe; } if (safe) x = workout(disc, safe, { min: minutes, prog, ctx, goal, phase, weekKm, dist: sessDist[u.k] || null, v: vOf(u.d, u.s), noFinish: ratioWeek, z3: z3only });
      }
      const hp = hiPlan[u.k];
      if (hp) { // 비율로 정한 고강도 거리에 맞춰 메인 세트를 다시 짜요
        const q = ratioSteps(disc, ty, sessDist[u.k], hp, ctx, x, vOf(u.d, u.s));
        if (q) { x.steps = q.steps; x.hiFrac = q.frac; x.hiText = q.text; }
      } else if (ratioWeek && EASY.concat("Long").includes(type)) x.hiFrac = 0;
      const rdu = !u.s && RD[u.d];
      // Z4 이상 날은 훈련 2가지: ✅ 추천(이번 시기 목적에 맞는 것) + 🔁 대안(같은 고강도 양, 다른 방식)
      if (x.lvl >= 4 && disc !== "brick" && !["Test", "Opener", "Double"].includes(type) && !(rdu && rdu.kind === "rest")) {
        const at = (ALT2[disc] || {})[type];
        if (at) {
          const y = workout(disc, at, { min: minutes, prog, ctx, goal, phase, weekKm, dist: sessDist[u.k] || null, v: vOf(u.d, u.s, 1), noFinish: ratioWeek, z3: z3only });
          if (hp) { const q2 = ratioSteps(disc, at, sessDist[u.k], hp, ctx, y, vOf(u.d, u.s, 1)); if (q2) { y.steps = q2.steps; y.hiText = q2.text; } }
          x.alt = { name: y.name, tag: y.tag, lvl: y.lvl, steps: y.steps, point: y.point, why: ALT_WHY[at] || "같은 고강도 양을 다른 방식으로" };
          x.recWhy = `${PHASES[phase] ? PHASES[phase].name + " — " : ""}${PHASES[phase] ? PHASES[phase].focus : ""}에 가장 잘 맞아요`;
        }
      }
      if (rdu && rdu.kind === "rest") { // 대회 뒤 휴식
        Object.assign(x, { name: "대회 후 휴식", tag: "휴식", lvl: 1, hiFrac: 0, point: `${rdu.race.name || "대회"} 뒤 ${rdu.day}일째 — 몸이 회복하는 시간이에요. 쉬는 것도 훈련!`,
          steps: [`휴식: 완전 휴식, 또는 ${minsU[u.k]}분 산책·아주 가벼운 ${DISC[disc] ? DISC[disc].name : "운동"}`, "회복: 스트레칭·폼롤러 10분, 잠 충분히, 탄수화물·단백질 보충"], effect: "대회로 생긴 근육 손상·피로를 회복해요." });
      } else if (rdu && rdu.kind === "post") x.point = `${rdu.race.name || "대회"} 뒤 회복 ${rdu.day}/${rdu.of}일째 — 쉬운 강도만. ${x.point}`;
      else if (rdu && rdu.kind === "pre1") x.point = `내일 ${rdu.race.name || "대회"}! 짧게 몸만 깨워요. ${x.point}`;
      else if (rdu && rdu.kind === "pre2") x.point = `${rdu.race.name || "대회"} 이틀 전 — 쉬운 강도로 컨디션 조절. ${x.point}`;
      else if (rdu && rdu.kind === "taper") x.point = `🏁 ${rdu.race.name || "대회"} D-${rdu.to} 조정기 — ${rdu.to >= 8 ? "강도는 유지, 양은 줄여요." : "짧은 자극만, 피로는 남기지 않기."} ${x.point}`;
      // 🏊 수영은 워밍업~쿨다운 전체를 다채롭게 다시 짜요 (IM·스컬링·이번 주 드릴·킥/풀·메인1·메인2)
      if (disc === "swim" && minutes && !["Test", "Opener"].includes(type) && !(rdu && rdu.kind === "rest")) {
        // 주간 수영 거리가 있으면 그 거리, 없으면 시간으로 거리를 계산 (CSS + 25초/100m, 휴식 포함)
        const Dm = sessDist[u.k] && sessDist[u.k].swim ? Math.round(sessDist[u.k].swim / 50) * 50 : Math.max(1000, Math.round((minutes * 60) / (((ctx.swim && ctx.swim.css) || 120) + 25) * 100 / 50) * 50);
        const sIdx = units.filter((z) => z.p[0] === "swim" && (z.d < u.d || (z.d === u.d && z.s < u.s))).length;
        const sw = swimFull(type, Dm, hp && hp.swim != null ? hp.swim : null, { ctx, v: vOf(u.d, u.s), week: VW, sIdx, tri, day: u.d, stroke: p.stroke });
        x.steps = sw.steps; x.drill = sw.drill;
        if (hp && hp.swim != null) { hp.swim = sw.hi; x.hiFrac = sw.hi / Dm; } // 강도 구성 막대도 실제 메인2 거리로
        if (x.alt) x.alt.steps = swimFull(x.alt.lvl >= 4 ? "CSS_long" : type, Dm, hp && hp.swim != null ? hp.swim : null, { ctx, v: vOf(u.d, u.s, 3), week: VW + 1, sIdx, tri, day: u.d + 1, stroke: p.stroke }).steps;
      }
      // 🚴 실내(로라·스마트 트레이너)에서 타면 워밍업 뒤에 8분 이내 페달링 드릴
      const bikeIndoor = (ctx.env || {}).bike === "indoor";
      if ((disc === "bike" || disc === "brick") && bikeIndoor && !(rdu && rdu.kind === "rest") && !["Test"].includes(type) && x.steps && x.steps.length) {
        const bd = `드릴: 🏠 ${BIKE_DRILLS[Math.abs(vOf(u.d, u.s)) % BIKE_DRILLS.length]} — 📖 드릴 가이드`; // 워밍업이 있으면 그 뒤, 없으면 맨 앞(타기 시작하며)
        x.steps = /^워밍업/.test(x.steps[0]) ? [x.steps[0], bd, ...x.steps.slice(1)] : [bd, ...x.steps];
        x.indoor = true;
      }
      // 🏃 달리기: 워밍업 뒤 러닝 드릴 6가지 (쉬운 회복·롱런·테스트 날은 빼요)
      if (disc === "run" && !["Rec", "Long", "M_long", "Test", "Opener", "MAF"].includes(type) && !(rdu && rdu.kind === "rest") && x.steps && x.steps.length && !x.steps.some((t) => /드릴/.test(t))) {
        x.steps = [x.steps[0], RUN_DRILL_TXT, ...x.steps.slice(1)];
      }
      // 🏷️ 구간 이름 붙이기: 워밍업 / 드릴 / 메인 / 이지 / 쿨다운 (드릴은 메인이라고 쓰지 않아요)
      if (disc !== "swim" && x.steps && x.steps.length && !(rdu && rdu.kind === "rest")) x.steps = labelSteps(x.steps, type);
      if (disc !== "swim" && x.alt && x.alt.steps) x.alt.steps = labelSteps(x.alt.steps, x.alt.type || type);
      const ds = disc === "brick" ? ["bike", "run"] : [disc];
      const icon = disc === "brick" ? "🚴🏃" : DISC[disc].icon;
      const slot = slotOf(u);
      const dayAvail = u.s ? num((dO[u.d] || {}).min2) || 45 : avail(u.d);
      const hi = type === "Test" ? minutes : type === "Rec" || type === "Opener" || sessDist[u.k] ? minutes + 10 : Math.min(minutes + 40, Math.max(minutes + 20, r5(dayAvail)));
      const o = sessDist[u.k];
      const dist = o ? ["swim", "bike", "run"].filter((k) => o[k]).map((k) => `${DISC[k].name} ${k === "swim" ? `${Math.round(o[k] / 50) * 50}m` : `${round1(o[k])}km`}`).join(" + ") : null;
      if (rhythm[u.k] === disc && Array.isArray(x.steps)) { // ⚡ 리듬 날: 쉬운 훈련 끝에 짧게 빠르게
        const k = Math.abs(vOf(u.d, u.s)) % 2;
        const fin = z3only
          ? { run: ["마무리 리듬: 100m × 5 — 빠르지만 편안하게 (Z3), 사이 100m 걷기 (총 500m)", "마무리 리듬: 200m × 3 — 레이스 페이스 느낌으로 가볍게 (Z3), 사이 200m 조깅 (총 600m)"],
            bike: ["마무리 리듬: 30초 × 4 — 케이던스 110 가볍게 (Z3), 사이 1분 (빠른 구간 총 2분)", "마무리 리듬: 1분 × 2 — 레이스 페이스 느낌 (Z3), 사이 2분 (총 2분)"],
            swim: ["마무리 리듬: 25m × 8 — 빠르지만 편안하게 (Z3), 휴식 20초 (총 200m)", "마무리 리듬: 50m × 4 — 레이스 페이스 느낌 (Z3), 휴식 20초 (총 200m)"] }[disc]
          : { run: ["마무리 스프린트: 200m × 5 — 스프린트 느낌 (전력의 90%), 사이 200m 조깅 (빠른 구간 총 1,000m)", "마무리 리듬: 400m × 2 + 200m — 레이스 페이스, 사이 200m 조깅 (총 1,000m)"],
            bike: ["마무리 스프린트: 15초 × 8 — 일어서서 세게, 사이 1분 가볍게 (빠른 구간 총 2분)", "마무리 리듬: 1분 × 4 — 레이스 페이스, 사이 1분 가볍게 (빠른 구간 총 4분)"],
            swim: ["마무리 스프린트: 25m × 8 — 빠르게, 휴식 30초 (총 200m)", "마무리 리듬: 50m × 8 — 레이스 페이스, 휴식 20초 (총 400m)"] }[disc];
        x.steps = x.steps.filter((t) => !/언덕 스프린트|스트라이드 20초 × 6/.test(String(t))); // 빠른 마무리는 하나만
        const cdI = x.steps.findIndex((t) => /쿨다운/.test(String(t))), endI = x.steps.findIndex((t) => /^(보강|합계)/.test(String(t)));
        const at = cdI >= 0 ? cdI : endI >= 0 ? endI : x.steps.length; // 쿨다운 바로 앞에
        x.steps.splice(at, 0, fin[k]);
        x.name = `${String(x.name).replace(/ \+ (언덕 스프린트|스트라이드)$/, "")} + 리듬`; x.rhythm = true;
        // 리듬(빠른 구간)도 강도 표시에 넣어요 — 저강도 100%가 아니에요
        const tot = (sessDist[u.k] && sessDist[u.k][disc]) || 0;
        const fastAmt = { run: z3only ? [0.5, 0.6][k] : 1, bike: z3only ? 2 : [2, 4][k], swim: z3only ? 200 : [200, 400][k] }[disc]; // 달리기 km · 자전거 분 · 수영 m
        const fastDist = disc === "bike" ? fastAmt * (32 / 60) : fastAmt; // 자전거는 빠른 구간 분 → 대략 km (시속 32km)
        const pct = tot ? Math.max(1, Math.round((fastDist / tot) * 100)) : 0;
        const u0 = (v) => (disc === "swim" ? `${Math.round(v / 50) * 50}m` : `${round1(v)}km`);
        x.hiFrac = tot ? fastDist / tot : 0;
        x.hiText = `${z3only ? "리듬(Z3)" : "리듬·레이스 페이스"} ${pct}% ${disc === "bike" ? `${fastAmt}분 (약 ${u0(fastDist)})` : u0(fastDist)} · 저강도 ${100 - pct}% ${u0(Math.max(0, tot - fastDist))}`;
      }
      return {
        day: u.d, s: u.s, slot, disc, discs: ds, type, minutes, range: [minutes, hi], ...x,
        title: `${slot ? `${slot === "오전" ? "🌅" : "🌇"} ${slot} · ` : ""}${icon} ${disc === "brick" ? "" : DISC[disc].name + " · "}${x.name}`,
        rpe: RPE[x.lvl], dist: dist || x.dist || null,
        hiMin: Math.round(minutes * (x.hiFrac != null ? x.hiFrac : x.lvl >= 3 ? 0.45 : 0)),
        hiText: x.rhythm && x.hiText ? x.hiText : mixText(o, hp, x.hiFrac != null ? x.hiFrac : x.lvl >= 3 ? 0.45 : 0),
        tss: tssOf(minutes, x.lvl, x.hiFrac != null ? x.hiFrac : x.lvl >= 3 ? 0.45 : 0),
        envNotes: ds.map((y) => ENV_NOTE[y][env[y] || "outdoor"]),
      };
    });
    // 오늘 훈련의 강도 구성: "고강도 20% 5km · 저강도 80% 20km" (거리 기준, 수영은 m)
    function mixText(o, hp, frac) {
      if (!o) return null;
      const ks = ["swim", "bike", "run"].filter((k) => o[k]);
      if (!ks.length) return null;
      let hiSum = 0, all = 0; const hiP = [], loP = [];
      ks.forEach((k) => {
        const tot = o[k], hi = hp && hp[k] != null ? hp[k] : tot * frac;
        const f = (v) => (k === "swim" ? `${Math.round(v / 50) * 50}m` : `${round1(v)}km`);
        const nm = ks.length > 1 ? DISC[k].name + " " : "";
        if (hi > 0.05) hiP.push(nm + f(hi));
        loP.push(nm + f(tot - hi));
        const w = k === "swim" ? 1 / 250 : k === "bike" ? 1 / 3 : 1; // 종목이 섞이면 대략 같은 시간 무게로
        hiSum += hi * w; all += tot * w;
      });
      const pc = all ? Math.round((hiSum / all) * 100) : 0;
      return `고강도 ${pc}% ${hiP.join(" + ") || (ks.length === 1 && ks[0] === "swim" ? "0m" : "0km")} · 저강도 ${100 - pc}% ${loP.join(" + ")}`;
    }

    // 대회가 있는 주
    wk.races.forEach((r) => {
      const dd = (r.d.getDay() + 6) % 7;
      const s = sessions.find((x) => x.day === dd && !x.s);
      const item = { day: dd, s: 0, slot: null, disc: tri ? "brick" : discs[0], discs: tri ? ["swim", "bike", "run"] : discs, type: "Race", minutes: 0, lvl: 5, tag: r.priority || "대회",
        title: `🏁 ${r.name || "대회"}`, name: "대회", point: r.priority === "A" ? "시즌 목표 대회! 계획한 레이스 강도를 지키세요." : r.priority === "B" ? "B 대회 — 전력이지만 앞뒤 2~3일은 가볍게." : "C 대회 — 강한 훈련 삼아.",
        steps: [`${r.event || ""} 레이스`, `레이스 강도: ${goal.race}`], targets: [], effect: "", rpe: "9–10", hiMin: 0, envNotes: [], dist: null, tss: raceTss(r, goal.sk), raceDate: r.d };
      if (s) Object.assign(s, item); else sessions.push(item);
    });
    sessions.sort((a, b) => a.day - b.day || (a.s || 0) - (b.s || 0));

    // 거리 목표가 없는 종목은 시간 × 그 강도의 속도로 예상 거리 표시
    const estOne = (x, m, lvl) => {
      if (x === "run") return `달리기 약 ${round1((m * 60) / runPace(lvl))}km`;
      if (x === "bike") return `자전거 약 ${Math.round((m / 60) * speedKmh(lvl))}km`;
      return `수영 약 ${Math.max(100, Math.round((((m * 60) / ((css + 10) / 100)) * 0.75) / 100) * 100)}m`;
    };
    sessions.forEach((s) => {
      if (s.dist || s.type === "Race" || s.type === "Test" || !s.minutes) return;
      s.dist = s.disc === "brick" ? `${estOne("bike", s.minutes * 0.7, 3)} + ${estOne("run", s.minutes * 0.3, 3)}` : estOne(s.disc, s.minutes, s.lvl);
    });

    // 목표 거리 요약 · 시간 확인
    const tkeys = Object.keys(targets);
    const doubles = days.filter((d) => plan2[d]).length;
    if (doubles) notes.unshift(`🌅🌇 하루 두 번 훈련하는 날 ${doubles}일 — 오후는 ${phil === "norwegian" ? "역치 바로 아래(더블 역치)" : "쉬운 강도 · 다른 종목 위주"}로 넣었어요. 오전·오후 사이 4시간 이상 쉬고, 잘 먹고 수분 보충하세요.`);
    if (tkeys.length) {
      notes.unshift(`🎯 이번 주 목표 거리: ${tkeys.map((k) => `${DISC[k].icon} ${DISC[k].name} ${fmtVol(k, targets[k])}`).join(" · ")}${distFactor * timeK < 0.995 ? ` (설정한 거리의 ${Math.round(distFactor * timeK * 100)}% — ${timeK < 1 && distFactor >= 1 ? "가능한 시간에 맞춤" : wk.comeback ? `복귀 ${wk.comeback.k}/${wk.comeback.n}주차` : wk.recovery ? "회복 주" : PHASES[phase].name})` : " — 설정한 거리를 계획에 모두 넣었어요"}`);
      if (estV.length) notes.splice(1, 0, `📐 ${estV.map((x) => DISC[x].name).join("·")} 주간 거리를 안 적어서, ${opt.level ? `내 레벨(${opt.level.lv})에 맞는 거리로 정했어요` : "운동 가능한 시간으로 계산했어요"} (${estV.map((x) => `${DISC[x].name} 약 ${fmtVol(x, V[x])}`).join(" · ")}). 문진표 '주간 훈련량'에 실제 거리를 적으면 더 정확해져요.`);
      const totalMin = sessions.reduce((a, s) => a + (s.minutes || 0), 0);
      const availMin = Math.min(days.reduce((a, d) => a + avail(d) + (plan2[d] ? num((dO[d] || {}).min2) || 45 : 0), 0), wh ? wh * 60 : Infinity);
      if (totalMin > availMin * 1.1) notes.push(`⏱ 이 거리를 채우려면 이번 주 약 ${minLabel(totalMin)}이 필요해요 (설정한 운동 시간 ${minLabel(Math.round(availMin))}). 시간을 늘리거나 거리 목표를 조금 줄여 주세요.`);
      units.forEach((u) => {
        const o = sessDist[u.k];
        if (!o) return;
        const lbl = `${DAYS_KO[u.d]}요일${slotOf(u) ? " " + slotOf(u) : ""}`;
        if (o.swim > 5000) notes.push(`🏊 ${lbl} 수영이 ${fmtVol("swim", o.swim)}로 많아요. 수영 요일을 늘리면 하루 거리가 줄어요 (설정 → 요일별 설정).`);
        if (o.run > 32) notes.push(`🏃 ${lbl} 달리기가 ${round1(o.run)}km로 많아요. 달리기 요일을 늘리는 걸 추천해요.`);
      });
    }

    // 강도 기준 설명
    if (discs.includes("run")) {
      const wkm = round1(weekKm);
      notes.push(`이번 주 달리기 약 ${wkm}km 기준: T 최대 ${round1(Math.max(2, wkm * 0.1))}km · I 최대 ${round1(Math.max(2, Math.min(wkm * 0.08, 10)))}km · R 최대 ${round1(Math.max(1.2, Math.min(wkm * 0.05, 8)))}km · 롱런 ${wkm < 64 ? 30 : 25}% 이하`);
    }
    return { sessions, notes, weekKm, targets, ratio: ratioWeek ? ratio : null, ratioScore, prep };
  }

  const ENV_NOTE = {
    swim: { indoor: "실내 수영장: 휴식 시간을 정확히 지키세요. 벽 시계나 랩 카운터를 쓰면 편해요.", outdoor: "오픈워터: 절대 혼자 들어가지 말고, 눈에 띄는 수모·부이를 쓰세요." },
    bike: { indoor: "실내 트레이너: 파워 기준으로. 선풍기·물 충분히 — 야외보다 심박이 5~10 높게 나올 수 있어요.", outdoor: "야외 도로: 인터벌은 한적한 평지에서, 헬멧·라이트 필수." },
    run: { indoor: "트레드밀: 경사 1%로 맞추면 야외와 비슷해요.", outdoor: "야외: 인터벌은 트랙이나 평지에서, 지속주는 익숙한 코스에서." },
  };

  // ---------- 전체 계획 ----------
  function buildPlan(p) {
    const ctx = {
      run: runInfo(p), bike: bikeInfo(p), swim: swimInfo(p), H: hrInfo(p),
      phil: PHIL[p.philosophy] ? p.philosophy : "polarized", env: p.env || {}, goal: goalOf(p),
    };
    const level = levelOf(p, ctx);
    // 🔄 쉬다가 복귀: 쉰 기간만큼 기록(페이스·파워)을 낮춰 잡고, 처음 몇 주는 양을 줄이고 쉬운 강도로
    const cb = comebackOf(p);
    if (cb) {
      if (ctx.run) ctx.run = runFrom(ctx.run.vdot * cb.run, `${ctx.run.src} → 복귀 보정 ${Math.round((1 - cb.run) * 100)}%↓`);
      if (ctx.bike) ctx.bike = { ...ctx.bike, ftp: Math.round(ctx.bike.ftp * cb.bike), wkg: ctx.bike.wkg ? ctx.bike.wkg * cb.bike : null, src: `${ctx.bike.src} → 복귀 보정` };
      if (ctx.swim) ctx.swim = { ...ctx.swim, css: ctx.swim.css * cb.swim, src: `${ctx.swim.src} → 복귀 보정` };
    }
    const ss = season(p, ctx);
    if (cb) ss.weeks.forEach((w) => {
      const k = w.i + cb.since;
      if (k >= cb.weeks) return;
      w.factor *= cb.ramp[k]; w.recovery = false;
      w.comeback = { k: k + 1, n: cb.weeks, easy: k < Math.ceil(cb.weeks / 2), name: cb.name, pct: Math.round(cb.ramp[k] * 100) };
    });
    const lowTarget0 = clamp(num(p.lowPct) || 80, 50, 100); // 저강도 목표 % (추천 80)
    // 노르웨이 방식은 역치 훈련량이 많아서 설정한 비율보다 고강도를 8% 더 (예: 80:20 → 72:28)
    const lowTarget1 = ctx.phil === "norwegian" ? Math.max(50, lowTarget0 - 8) : lowTarget0;
    // 레벨이 낮으면 고강도 비중 상한을 낮춰요 (레벨 1: 5% · 2: 8% · 3: 10% · 4: 12% · 5: 15% · 6: 18% · 7: 25% …)
    const hiMax = level ? LEVEL_HI_MAX[level.lv] : 35;
    const lowTarget = Math.max(lowTarget1, 100 - hiMax);
    const cache = {};
    const week = (i) => (cache[i] = cache[i] || (() => {
      const wk = ss.weeks[i];
      const lowOf = (r) => {
        const tot = r.sessions.reduce((a, s) => a + s.minutes, 0);
        const hi = r.sessions.reduce((a, s) => a + s.hiMin, 0);
        const R = r.ratio ? Object.values(r.ratio) : [];
        // 거리 목표가 있으면 '거리 기준' 비율 (종목별 저강도 거리 ÷ 총 거리의 평균), 없으면 시간 기준
        const low = R.length ? Math.round((R.reduce((a, x) => a + (x.total - x.hi) / x.total, 0) / R.length) * 100)
          : tot ? Math.round(((tot - hi) / tot) * 100) : 100;
        return { tot, low, byDist: R.length > 0, err: R.length ? r.ratioScore : Math.abs(low - wkLow) };
      };
      const wkLow = ["taper", "race"].includes(wk.key) ? Math.max(lowTarget, 90) : lowTarget; // 조정기는 고강도 10%만 (양은 줄이고 강도 감각은 유지)
      const o0 = { lowPct: wkLow, level };
      const cw = ctxOfWeek(wk.i);
      let r = buildWeek(p, cw, wk, o0), m = lowOf(r);
      // 질 훈련 개수를 ±3까지 바꿔 보고 고르기
      //  · 거리 목표가 있으면: 고강도 거리는 이미 정확히 맞춰져 있어서, 한 번의 질 훈련 양이 알맞은(너무 많거나 적지 않은) 개수로
      //  · 거리 목표가 없으면: 시간 기준 비율이 목표에 가장 가까운 개수로
      // (회복 주·테이퍼·대회 주·MAF는 시기 원칙이 우선이라 그대로)
      const easyWeek = wk.recovery || !!wk.comeback || ["trans", "taper", "race"].includes(wk.key) || ctx.phil === "maf";
      let bestDl = 0;
      if (!easyWeek) {
        for (const dl of [-1, 1, -2, 2, -3, 3]) {
          const r2 = buildWeek(p, cw, wk, { ...o0, hardDelta: dl }), m2 = lowOf(r2);
          if (m2.err < m.err - (m.byDist ? 0.15 : 1)) { r = r2; m = m2; bestDl = dl; }
        }
      }
      // 🔁 1년 동안 똑같은 훈련 주가 다시 나오지 않게: 앞 주와 똑같으면 변형 번호(salt)를 바꿔 다시 짜요
      for (let j = 0; j < i; j++) if (!cache[j]) week(j);
      const sigOf = (x) => x.sessions.filter((s) => s.type !== "Race").map((s) => `${s.day}:${s.name}|${(s.steps || []).filter((t) => s.disc === "swim" || !/^드릴:/.test(t)).join("/")}`).join(";");
      // Z4·Z5(강한 훈련)는 1년 동안 같은 구성이 다시 나오지 않게 (Z2 쉬운 훈련은 같아도 괜찮아요)
      const hardSig = (x) => x.sessions.filter((s) => s.lvl >= 4 && !["Race", "Test", "Opener"].includes(s.type))
        .map((s) => `${s.name}|${(s.steps || []).filter((t) => !/워밍업|쿨다운/.test(t) && (s.disc === "swim" || !/^드릴:/.test(t))).join("/")}`); // 달리기·자전거 드릴은 실내·야외에 따라 달라져서 비교에서 빼요
      const seen = new Set(), seenHard = new Set();
      for (let j = 0; j < i; j++) if (cache[j]) { seen.add(cache[j].sig); (cache[j].hardSigs || []).forEach((h) => seenHard.add(h)); }
      const score = (x) => { const h = hardSig(x); return h.filter((z) => seenHard.has(z)).length * 10 + (new Set(h).size < h.length ? 10 : 0) + (seen.has(sigOf(x)) ? 1 : 0); };
      let best = score(r);
      for (let salt = 1; salt <= 24 && best > 0; salt++) {
        const r2 = buildWeek(p, cw, wk, { ...o0, hardDelta: bestDl, salt });
        const s2 = score(r2);
        if (s2 < best) { r = r2; m = lowOf(r2); best = s2; }
      }
      const sig = sigOf(r), hardSigs = hardSig(r); // 실내·야외(드릴·트레드밀 표시)는 비교에서 빼요 → 장소를 바꿔도 훈련 구성은 그대로
      if ((ctx.env || {}).run === "indoor") r.sessions.forEach((s) => { if (s.disc === "run" || s.disc === "brick") { s.steps = treadmill(s.steps || [], s.disc === "brick"); s.treadmill = true; if (s.alt && s.alt.steps) s.alt.steps = treadmill(s.alt.steps, s.disc === "brick"); } });
      { const sn = addStrength(r.sessions, wk, ctx.goal.sk); if (sn && !r.notes.some((x) => /^💪 보강/.test(x))) r.notes.push(sn); }
      if (cw.run && prog && cw.run.vdot !== ctx.run.vdot) r.notes.unshift(`🎯 이번 주 훈련 페이스는 VDOT ${round1(cw.run.vdot)} 기준이에요 — 현재 기록 VDOT ${round1(prog.now)}에서 목표 VDOT ${round1(prog.need)}까지 ${prog.every}주마다 ${round1(prog.step)}씩 올려요. (E ${fmt(cw.run.E[0])}–${fmt(cw.run.E[1])} · T ${fmt(cw.run.T)} · I ${fmt(cw.run.I)} /km)`);
      if (cw.swim && progS && cw.swim.css !== ctx.swim.css) r.notes.unshift(`🎯 이번 주 수영 페이스는 CSS ${fmt(Math.round(cw.swim.css))}/100m 기준이에요 — 지금 ${fmt(Math.round(progS.now))}에서 목표 ${fmt(Math.round(progS.need))}까지 4주마다 ${round1(progS.step)}초씩 당겨요.`);
      if (cw.bike && progB && cw.bike.ftp !== ctx.bike.ftp) r.notes.unshift(`🎯 이번 주 자전거 파워는 FTP ${cw.bike.ftp}W 기준이에요 — 지금 ${Math.round(progB.now)}W에서 목표 ${Math.round(progB.need)}W까지 4주마다 약 ${Math.round(progB.step)}W씩 올려요.`);
      if (progT && i === 0) r.notes.unshift(`🎯 목표 ${fmt(Math.round(gT))} — 지금 실력 예상 ${fmt(Math.round(progT.T0))}보다 ${Math.round((1 - progT.f) * 100)}% 빨라야 해서 수영·자전거·달리기 페이스를 같이 단계적으로 올려요.`);
      if (wk.comeback) r.notes.unshift(`🔄 복귀 ${wk.comeback.k}/${wk.comeback.n}주차 (${wk.comeback.name}) — 평소 양의 약 ${wk.comeback.pct}%. ${wk.comeback.easy ? "이번 주는 강한 훈련 없이 쉬운 강도(Z1~Z2)로만 몸을 다시 깨워요." : "가벼운 질 훈련(템포·언덕·파틀렉) 1회만 넣어요. 인터벌은 복귀가 끝나고 시작해요."} 페이스·파워는 쉰 기간만큼 낮춰 잡았고, 4주마다 다시 올라가요.`);
      if (level && level.lv <= 3 && p.allowHi && i === 0) r.notes.push(`⚠️ 레벨 ${level.lv}이지만 본인 선택으로 Z4·Z5 훈련을 넣었어요. 몸이 아직 강한 훈련에 익숙하지 않은 단계라 Z3까지만 하는 걸 적극 추천해요 — 통증·피로가 쌓이면 문진표에서 다시 'Z3까지만'으로 바꿔 주세요.`);
      if (level && level.lv <= 3 && !p.allowHi && i === 0) r.notes.push(`🌱 레벨 ${level.lv}(${level.name})은 Z3까지만 훈련해요 — Z4(역치)·Z5(최대 산소) 훈련은 레벨 4부터 넣어요. 이유: ① 지금 단계에서 실력이 가장 많이 느는 건 쉬운 강도(Z1~Z2)로 쌓는 시간이에요 — 심장·혈관·근육 속 에너지 공장(미토콘드리아)이 이 강도에서 가장 많이 자라요. ② 심폐는 몇 주 만에 좋아지지만 힘줄·인대·뼈는 몇 달이 걸려서, 강한 훈련을 일찍 넣으면 숨은 버텨도 몸이 다치기 쉬워요(정강이·무릎·아킬레스건). ③ Z4·Z5는 회복에 2~3일이 걸려 다음 운동을 망치고, 꾸준함이 무너지기 쉬워요. ④ Z3(말은 짧게 할 수 있는 정도)만으로도 처음 몇 달은 기록이 충분히 좋아져요. 주간 거리를 늘리거나 기록이 좋아져 레벨 4가 되면 강한 훈련이 자동으로 들어가요.`);
      if (level && lowTarget > lowTarget1 && i === 0) r.notes.push(`🏅 레벨 ${level.lv}(${level.name})이라 고강도 비중을 최대 ${LEVEL_HI_MAX[level.lv]}%까지만 넣어요 — 레벨이 오르면 강도도 같이 올라가요.`);
      if (prog && prog.pace && ["r4", "taper", "race", "peak", "build2"].includes(wk.key)) r.notes.push(`🏁 목표 레이스 페이스 ${fmt(prog.pace)}/km — 레이스 특화 시기라 M·T 세션 일부와 오프너를 이 페이스로 연습해요.`);
      return { ...wk, ...r, sig, hardSigs, total: m.tot, lowPct: m.low, lowTarget: wkLow, userLow: lowTarget1, levelCap: lowTarget > lowTarget1, byDist: m.byDist, vdotWeek: cw.run ? cw.run.vdot : null, tss: r.sessions.reduce((a, s) => a + (s.tss || 0), 0) };
    })());
    // 📈 체력(CTL·42일)·피로(ATL·7일)·컨디션(TSB) 예상 — TrainingPeaks 퍼포먼스 매니지먼트 차트 방식
    let pmcCache = null;
    function pmc(nWeeks = 52) {
      if (pmcCache && pmcCache.n >= nWeeks) return pmcCache;
      const w0 = week(0);
      let ctl = Math.max(20, (w0.tss || 0) / 7 * 0.85), atl = ctl; // 지금 하던 양을 꾸준히 해 왔다고 가정해서 시작
      const weeks = [], races = [];
      for (let i = 0; i < nWeeks; i++) {
        const W = week(i), startCtl = ctl;
        const daily = [0, 0, 0, 0, 0, 0, 0];
        W.sessions.forEach((s) => { daily[s.day] += s.tss || 0; });
        for (let d = 0; d < 7; d++) {
          const tsb = ctl - atl; // 그날 아침 컨디션
          const race = W.sessions.find((s) => s.type === "Race" && s.day === d);
          if (race) races.push({ name: race.title.replace("🏁 ", ""), week: i, day: d, ctl, atl, tsb });
          ctl += (daily[d] - ctl) / 42;
          atl += (daily[d] - atl) / 7;
        }
        weeks.push({ i, tss: W.tss || 0, ctl, atl, tsb: ctl - atl, ramp: ctl - startCtl });
      }
      pmcCache = { n: nWeeks, weeks, races };
      return pmcCache;
    }
    // 이번 주가 저강도 위주라면, 몇 주 뒤부터 강도가 올라가는지 알려주기
    const intense = (w) => w.sessions.some((s) => s.lvl >= 4 && s.type !== "Test" && s.type !== "Race");
    function intensityNote(i) {
      const w = week(i);
      if (intense(w)) return { level: "high", text: `이번 주는 강도 훈련(${w.sessions.filter((s) => s.lvl >= 4 && s.type !== "Test").map((s) => s.tag).join(", ")})이 들어가는 주예요. 그 외의 날은 꼭 쉽게!` };
      for (let j = i + 1; j < 52; j++) {
        const x = week(j);
        if (intense(x)) {
          const d = x.start;
          return { level: "low", text: `${w.recovery ? "회복 주라 양과 강도를 줄였어요." : "지금은 몸을 만드는 시기라 저강도 위주예요 (주 1회 가벼운 지속주·템포만)."} ${j - i}주 뒤(${d.getMonth() + 1}/${d.getDate()}, ${x.phase.name})부터 인터벌·역치 등 강도가 올라가요.` };
        }
      }
      return { level: "low", text: ctx.phil === "maf" ? "MAF 방식이라 기초 기간 동안 저강도로만 훈련해요. 같은 심박에서 페이스가 빨라지면 성장한 거예요." : "이 시즌 동안은 저강도 위주로 계획됐어요." };
    }
    let gap = null;
    if (ctx.goal.sk === "run" && ctx.goal.time && ctx.goal.dist) {
      gap = { need: vdotFrom(ctx.goal.dist, ctx.goal.time), now: ctx.run ? ctx.run.vdot : null, pace: ctx.goal.time / (ctx.goal.dist / 1000) };
    }
    // 🎯 목표 기록까지 훈련 페이스를 단계적으로 올리기 (다니엘스: 4주 정도 소화가 잘 되면 VDOT +1)
    let prog = null;
    if (gap && gap.now && gap.need > gap.now + 0.3) {
      const lv = level ? level.band : 2;
      // 목표 기록이 빠를수록(필요한 VDOT이 클수록) 4주마다 더 많이 올려요 — 대회 2주 전(조정기)까지 나눠서, 안전 상한 안에서
      const wl = ss.A ? Math.max(4, Math.round((ss.A.d - new Date()) / (7 * 864e5))) : null;
      const blocks = wl ? Math.max(1, Math.floor((wl - 2) / 4)) : null;
      const step = blocks ? clamp((gap.need - gap.now) / blocks, 0.5, lv <= 1 ? 2 : 1.5) : (lv <= 1 ? 1.5 : 1), every = 4;
      prog = { now: gap.now, need: gap.need, step, every, pace: gap.pace };
    }
    // 🎯 수영·자전거·철인3종도 목표 기록에 맞춰 CSS·FTP·VDOT을 4주마다 단계적으로 (안전 상한 안에서)
    const nBlk = ss.A ? Math.max(1, Math.floor((Math.max(4, Math.round((ss.A.d - new Date()) / (7 * 864e5))) - 2) / 4)) : 4;
    const gT = ctx.goal.time, gk = ctx.goal.sk;
    let progS = null, progB = null, progT = null;
    const bikeSpeed = (w, kg) => { let v = 8; for (let k = 0; k < 40; k++) { const f = 0.5 * 1.2 * 0.29 * v ** 3 + 0.004 * kg * 9.81 * v - w * 0.97; v -= f / (1.5 * 1.2 * 0.29 * v * v + 0.004 * kg * 9.81); } return v; };
    const kgB = (num(p.weight) || 70) + 9;
    if (gT && gk === "swim" && ctx.swim) {
      const D = { sprint: 100, middle: 400, distance: 1500, ow: 1500 }[ctx.goal.key];
      const tCss = D >= 1500 ? gT / 15 : D === 400 ? gT / 4 + 3 : gT + 12; // 목표 기록 → 필요한 CSS (100m당 초)
      if (tCss < ctx.swim.css - 0.5) progS = { now: ctx.swim.css, need: tCss, step: clamp((ctx.swim.css - tCss) / nBlk, 0.5, 2) };
    }
    if (gT && gk === "bike" && ctx.bike && ctx.goal.key === "tt") {
      const v = 40000 / gT, need = (0.5 * 1.2 * 0.29 * v ** 3 + 0.004 * kgB * 9.81 * v) / 0.97 / 0.95; // 40km TT 목표 → 필요한 FTP
      if (need > ctx.bike.ftp + 2) progB = { now: ctx.bike.ftp, need, step: clamp((need - ctx.bike.ftp) / nBlk, 2, ctx.bike.ftp * 0.03) };
    }
    if (gT && gk === "tri" && ctx.run && ctx.bike && ctx.swim) {
      // 지금 실력으로 예상한 완주 기록과 목표 기록의 비율만큼 세 종목을 같이 끌어올려요
      const C = { sprint: [750, 20, 5000, 1.0, 1.04, 5], olympic: [1500, 40, 10000, 0.92, 1.06, 5], half: [1900, 90, 21097, 0.8, 1.1, 7], full: [3800, 180, 42195, 0.71, 1.16, 10] }[ctx.goal.key];
      if (C) {
        const T0 = ((ctx.swim.css + 4) * C[0]) / 100 + (C[1] * 1000) / bikeSpeed(ctx.bike.ftp * C[3], kgB) + predict(ctx.run.vdot, C[2]) * C[4] + C[5] * 60;
        const f = gT / T0;
        if (f < 0.995) {
          progT = { T0, f };
          prog = prog || { now: ctx.run.vdot, need: ctx.run.vdot / f, step: clamp((ctx.run.vdot / f - ctx.run.vdot) / nBlk, 0.3, 1.5), every: 4, pace: null };
          progS = { now: ctx.swim.css, need: ctx.swim.css * f, step: clamp((ctx.swim.css * (1 - f)) / nBlk, 0.3, 2) };
          progB = { now: ctx.bike.ftp, need: ctx.bike.ftp / f ** 2.5, step: clamp((ctx.bike.ftp / f ** 2.5 - ctx.bike.ftp) / nBlk, 2, ctx.bike.ftp * 0.03) };
        }
      }
    }
    function ctxOfWeek(i) {
      const blk = Math.floor(i / 4);
      let c = ctx;
      if (prog && ctx.run) { const v = Math.min(prog.need, prog.now + prog.step * blk); if (v !== ctx.run.vdot) c = { ...c, run: runFrom(v, ctx.run.src) }; }
      if (progS && ctx.swim) { const css = Math.max(progS.need, progS.now - progS.step * blk); if (css !== ctx.swim.css) c = { ...c, swim: { ...ctx.swim, css } }; }
      if (progB && ctx.bike) { const ftp = Math.round(Math.min(progB.need, progB.now + progB.step * blk)); if (ftp !== ctx.bike.ftp) c = { ...c, bike: { ...ctx.bike, ftp } }; }
      return c;
    }
    // 목표가 현실적인지: 남은 주 수 vs 필요한 주 수
    let feas = null;
    if (gap && gap.now) {
      const A = ss.A, weeksLeft = A ? Math.max(1, Math.round((A.d - new Date()) / (7 * 864e5))) : null;
      const diff = gap.need - gap.now, step = (level ? level.band : 2) <= 1 ? 1.5 : 1; // 현실성 판단은 안전한 기준(4주에 +1)으로
      const weeksNeed = diff > 0 ? Math.ceil(diff / step) * 4 : 0;
      const verdict = diff <= 0 ? "이미 가능" : !weeksLeft ? "기간 미정" : weeksNeed <= weeksLeft * 0.8 ? "현실적" : weeksNeed <= weeksLeft * 1.3 ? "도전적" : "무리";
      feas = { now: gap.now, need: gap.need, diff, weeksNeed, weeksLeft, verdict, pace: gap.pace };
    }
    const sMin = num(p.sessionMin) || 60, n = (p.days || []).length;
    const wh = num(p.weeklyHours);
    const dO = p.dayOpts || {};
    const dayTot = (p.days || []).reduce((a, d) => a + (num((dO[d] || {}).min) || sMin), 0) || n * sMin;
    const avail = (wh ? Math.min(wh * 60, dayTot) : dayTot) / 60;
    return { ctx, season: ss, week, gap, availHours: avail, intensityNote, level, prog, feas, pmc };
  }

  TS.E = {
    parseTime, autoTime, fmt, minLabel, num, DISC, sportKey, discsOf, SWIM_EVENTS, SWIM_PH, RUN_EVENTS, TRI_RACES, TRI_LEGS, GOALS,
    goalOf, runInfo, bikeInfo, swimInfo, hrInfo, buildPlan, vdotFrom, predict, PHASES, levelOf, LEVELS, LEVEL_CUT, LEVEL_HI_MAX, levelTable, COMEBACK, comebackOf, recoveryDays, prepAdvice, runFrom,
    RUN_PACES, runPaceText, COGGAN, watt, SWIM_Z, swimPace, FRIEL_RUN, FRIEL_BIKE, frielRange, MAF_ADJ, PHIL, RPE,
  };
  TS.parseTime = parseTime;
})();
