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
    const v = best, I = paceAt(v, 0.975);
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
    maf: { name: "MAF (마페톤)", by: "필 마페톤",
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

  // 대회 뒤 회복 일수 (대회 거리·종목 기준). 앞 25%는 휴식·아주 가볍게, 나머지는 쉬운 강도만 (질 훈련 없음)
  function recoveryDays(r, sk) {
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
      return { i, start: s, key: k, phase: PHASES[k], recovery, factor, meso: cyc ? (cyc - 1) % 4 : 0, races, isA, virtualRace: virtual && i === raceIdx, raceDays: {} };
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
        const V = [
          [`E 페이스 ${Math.max(15, min - 5)}분`, "마지막에 스트라이드 20초 × 6 (가볍고 빠르게, 사이 40초 걷기)"],
          [`E 페이스 ${min}분`, "끝나고 러닝 드릴 10분 — A스킵 · B스킵 · 하이니 · 버트킥 각 30m × 2"],
          [`E 페이스 ${Math.max(15, min - 10)}분`, "마지막 10분은 E 페이스 빠른 쪽으로 조금씩 올리기 (빌드업, 숨차지 않게)"],
          [`흙길·공원 같은 부드러운 길에서 E 페이스 ${Math.max(15, min - 5)}분`, "언덕 스프린트 8~10초 × 6 (오르막 전력, 사이 2분 걷기로 완전 회복)"],
        ][(o.v || 0) % 4];
        return { lvl: 2, tag: "E", name: ["이지 런 + 스트라이드", "이지 런 + 드릴", "이지 빌드업 런", "이지 런 + 언덕 스프린트"][(o.v || 0) % 4],
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
        return { lvl: 2, tag: late ? "E+M" : "E 롱", name: "롱런", point: "이번 주 가장 긴 달리기 — 다니엘스 기준 주간 거리의 25~30% 또는 150분 이하. 20~30분마다 물·에너지 젤 연습.",
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
        : { lvl: 5, tag: "테스트", name: "5K 타임트라이얼 / LTHR 테스트", point: "결과를 설정에 입력하면 VDOT·페이스·심박 존이 다시 계산돼요. (다니엘스: 4~6주마다 VDOT 갱신)",
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
        steps: [`워밍업 ${f.wu}분`, `Z2 ${f.main}분 (케이던스 85~95)`, [
          o.phase && /prep|base/.test(o.phase) ? "중간에 1분 고케이던스(110+) × 5 — 페달링 기술" : null,
          "중간에 한 다리 페달링 30초씩 × 4 (각 다리, 실내) 또는 30초 고케이던스 × 6 (야외)",
          "야외라면 언덕은 기어를 가볍게 — Z3를 넘지 않게. 1시간마다 보급 연습",
        ][(o.v || 0) % 3], `쿨다운 ${f.cd}분`].filter(Boolean),
        targets: t(56, 75, 2), effect: COGGAN[1][5] };
      case "Long": {
        const extra = o.noFinish ? "언덕은 Z3까지만, 평지는 Z2 (고강도는 질 훈련 날에)" : goal.sk === "tri" && goal.key === "full" && /build|peak/.test(o.phase) ? "마지막 1/3은 아이언맨 레이스 강도 (FTP 65~75%)"
          : goal.sk === "tri" && goal.key === "half" && /build|peak/.test(o.phase) ? `중간에 ${15 + 5 * prog}분 × 2회 하프 레이스 강도 (FTP 75~85%)`
          : "언덕은 Z3까지만, 평지는 Z2";
        return { lvl: 2, tag: "Z2 롱", name: "장거리 라이딩", point: "이번 주 가장 긴 라이딩. 시간당 탄수화물 60~90g, 물 500~750ml 보급 연습.",
          steps: [`Z2 ${min}분`, extra], targets: t(56, 75, 2), effect: "장거리 지구력과 보급 능력 — 철인·그란폰도의 기초예요.", hiFrac: /레이스/.test(extra) ? 0.3 : 0 };
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
          return { lvl: 5, tag: "Z5", name: "30/15 인터벌 (뢴네스타드)", point: "30초 강하게 / 15초 가볍게를 13번. 짧은 휴식 덕분에 VO2max 근처에 오래 머물러요.",
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
    run: { Steady: ["Steady", "Fartlek", "Hills"], T_cruise: ["T_cruise", "T_tempo"], T_tempo: ["T_tempo", "T_cruise"] },
    bike: { Tempo: ["Tempo", "Force"], Force: ["Force", "Tempo"], SS: ["SS", "Tempo", "SS"] },
    swim: { CSS_long: ["CSS_long", "CSS"] },
  };
  function rotateKeys(keys, wi, phil) {
    if (phil === "norwegian" || phil === "maf") return keys;
    const out = keys.map(([d, t]) => { const a = (ALT[d] || {})[t]; return [d, a ? a[wi % a.length] : t]; });
    // 핵심 훈련이 2개 이상이면 주마다 순서도 바꿔서 같은 요일에 같은 훈련만 오지 않게
    if (out.length >= 2 && wi % 2 && out.every((k) => k[0] === out[0][0])) out.push(out.shift());
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
    if (phase === "taper" || phase === "race") return n >= 2 ? 1 : 0;
    if (phil === "maf") return [...BASE_LIKE, "r2"].includes(phase) ? 0 : 1;
    if (phil === "norwegian") return BASE_LIKE.includes(phase) ? 2 : Math.min(base + 1, Math.max(1, n - 1)); // 노르웨이는 역치 훈련이 더 많아요
    if (BASE_LIKE.includes(phase)) return 1;
    return base;
  }

  // ---------- 비율 모드: 질 훈련 하나의 구성 (고강도 거리 H를 정확히 넣고 나머지는 쉬운 강도) ----------
  // D: 그날 종목별 총 거리 {run: km, bike: km, swim: m}, H: 그날 종목별 고강도 거리
  function ratioSteps(disc, type, D, H, ctx, x) {
    const R = ctx.run, B = ctx.bike, S = ctx.swim;
    const km = (v) => `${round1(v)}km`, mm = (v) => `${Math.round(v / 50) * 50}m`;
    const pace = (k) => (R && R[k] ? ` (${fmt(Array.isArray(R[k]) ? R[k][0] : R[k])}/km)` : "");
    const reps = (tot, want, lo = 2, hi = 12) => { const n = clamp(Math.round(tot / want), lo, hi); return [n, tot / n]; };
    const steps = [], txt = [];
    const ez = (x0, tot, h, wuMax, cdMax, wuTxt, cdTxt, extraTxt) => { // 쉬운 거리 = 워밍업 + (추가 쉬운 구간) + 쿨다운
      const e = Math.max(0, tot - h), wu = Math.min(wuMax, e * 0.5), cd = Math.min(cdMax, e - wu), ex = e - wu - cd;
      return { wu, cd, ex, pre: wuTxt(wu), post: [ex > (x0 === "swim" ? 49 : 0.4) ? extraTxt(ex) : null, cdTxt(cd)].filter(Boolean) };
    };
    const runMain = (h, ty) => {
      if (/^T_tempo$/.test(ty)) return `T 페이스 ${km(h)} 지속${pace("T")}`;
      if (/^T_cruise$/.test(ty)) { const [n, r] = reps(h, h >= 6 ? 1.6 : 1); return `${km(r)} × ${n}회 T 페이스${pace("T")}, 사이 1분 조깅`; }
      if (/^I$/.test(ty)) { const [n, r] = reps(h, h >= 4 ? 1 : 0.8, 2, 10); return `${Math.round(r * 10) * 100}m × ${n}회 I 페이스${pace("I")}, 사이 같은 시간 조깅`; }
      if (/^R$/.test(ty)) { const [n, r] = reps(h, h >= 3.2 ? 0.4 : 0.2, 3, 16); return `${Math.round(r * 20) * 50}m × ${n}회 R 페이스${pace("R")}, 사이 같은 거리 천천히 조깅`; }
      if (/^M_/.test(ty)) return `M 페이스 ${km(h)} 지속${pace("M")}`;
      if (ty === "Fartlek") { const [n, r] = reps(h, 1, 3, 12); return `${km(r)} 빠르게(10K 느낌) / 500m 조깅 × ${n}회`; }
      if (ty === "Hills") { const [n, r] = reps(h, 0.3, 4, 15); return `오르막 ${Math.round(r * 20) * 50}m × ${n}회 (RPE 7–8), 내려오며 회복`; }
      if (ty === "Nor" || ty === "Double") { const [n, r] = reps(h, h >= 8 ? 2 : h >= 4 ? 1.5 : 1); return `${km(r)} × ${n}회 (T +3~6초/km${R ? `: ${fmt(R.T + 3)}–${fmt(R.T + 6)}/km` : ""}), 사이 1분 조깅`; }
      if (ty === "Brick") return `레이스 페이스 ${km(h)}`;
      return `${km(h)} 지속주 (E 빠른 쪽 ~ M 페이스)`;
    };
    const bSpd = (lvl) => (lvl >= 5 ? 33 : lvl >= 4 ? 31 : 29); // 고강도 평균 속도 추정 (km/h)
    const bikeMain = (h, ty) => {
      const map = { Tempo: [3, 20, "Z3 템포", [76, 90], 5], Force: [3, 8, "큰 기어 케이던스 50~60 (Z3)", [76, 90], 4], SS: [3, 15, "스윗스팟", [88, 93], 5],
        Thr: [4, 12, "Z4 역치", [91, 105], 5], VO2: [5, 4, "Z5 VO2max", [106, 120], 4], Ana: [5, 1, "Z6 무산소", [121, 150], 2], Race: [4, 20, "레이스 강도", [80, 95], 5],
        Nor: [4, 8, "FTP 88~92% (역치 바로 아래)", [88, 92], 2], Double: [4, 8, "FTP 88~92% (역치 바로 아래)", [88, 92], 2], Brick: [4, 20, "레이스 강도", [80, 95], 5] };
      const [lvl, rep, nm, w, rest] = map[ty] || [3, 15, "Z3", [76, 90], 5];
      const mins = (h / bSpd(lvl)) * 60, [n, r] = reps(mins, rep, 1, 12);
      return `${Math.round(r)}분 × ${n}회 ${nm}${B ? ` ${Math.round((B.ftp * w[0]) / 100)}–${Math.round((B.ftp * w[1]) / 100)}W` : ` (FTP ${w[0]}–${w[1]}%)`}, 사이 ${rest}분 Z1 — 고강도 합계 약 ${km(h)}`;
    };
    const swimMain = (h, ty) => {
      const css = S ? ` (${fmt(S.css)}/100m)` : "";
      const L0 = { CSS: 100, CSS_long: 400, VO2: 100, Speed: 50, OW: 0, Nor: 300 }[ty] ?? 200;
      if (!L0) return `${mm(h)} 연속 (CSS +2~4초) — 사이팅 연습`;
      const n = Math.max(2, Math.round(h / L0)), len = Math.round(h / n / 25) * 25;
      const how = { CSS: `CSS 페이스${css}, 휴식 15초`, CSS_long: "CSS +1~3초, 휴식 20~30초", VO2: "CSS −3~6초, 휴식 30초", Speed: "전력, 휴식 40초", Nor: "CSS +1~2초, 휴식 20초" }[ty] || `CSS 페이스${css}, 휴식 15초`;
      return `${len}m × ${n}회 ${how}`;
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
      const pool2 = pool.length ? pool : days.filter((d) => pref(d) !== "easy");
      const list = pool2.length ? pool2 : days;
      const score = (d) => avail(d) * 10 + (d === 6 ? 2 : d === 5 ? 1 : 0);
      longDay = list.reduce((a, b) => (score(b) > score(a) ? b : a));
    }
    const baseHard = hardCount(n, phase, phil, wk.recovery);
    const cand = days.filter((d) => d !== longDay && pref(d) !== "easy");
    const marked = cand.filter((d) => pref(d) === "hard");
    const allowExtra = baseHard > 0 && !["taper", "race"].includes(phase);
    const hardN0 = Math.min(cand.length, allowExtra ? Math.max(baseHard, Math.min(marked.length, baseHard + 1)) : baseHard);
    // 설정한 저강도·고강도 비율에 맞추려고 질 훈련 개수를 조절해요 (buildPlan이 가장 가까운 개수를 골라요)
    // 비율을 맞추려면 '가볍게'로 정한 날도 필요할 때만 질 훈련 후보로 써요
    const want = allowExtra ? Math.max(0, hardN0 + (opt.hardDelta || 0)) : hardN0;
    const candX = want > cand.length ? [...cand, ...days.filter((d) => d !== longDay && !cand.includes(d))] : cand;
    const hardN = Math.min(want, candX.length);
    const hard = marked.slice(0, hardN);
    for (const gap of [2, 1]) for (const d of candX) {
      if (hard.length >= hardN) break;
      if (hard.includes(d)) continue;
      if (hard.every((h) => Math.abs(h - d) >= gap) && (longDay == null || Math.abs(longDay - d) >= gap)) hard.push(d);
    }
    for (const d of candX) { if (hard.length >= hardN) break; if (!hard.includes(d)) hard.push(d); }
    hard.sort((a, b) => a - b);

    const plan = {};
    const keys = rotateKeys(keysFor(goal, phase, phil), wk.i, phil);
    const used = new Set();
    const fb = BASE_LIKE.includes(phase) ? BASE_FALLBACK : FALLBACK;
    hard.forEach((d, i) => {
      const fx = fixedDisc(d);
      if (phase === "taper" || phase === "race") { plan[d] = [fx && fx !== "brick" ? fx : tri ? "run" : discs[0], "Opener"]; return; }
      if (fx === "brick") { plan[d] = ["brick", "Brick"]; return; }
      let j = fx ? keys.findIndex((k, idx) => k[0] === fx && !used.has(idx)) : keys.findIndex((k, idx) => !used.has(idx) && !hard.some((h) => h !== d && fixedDisc(h) === k[0]));
      if (j < 0 && !fx) j = keys.findIndex((k, idx) => !used.has(idx));
      if (j >= 0) { used.add(j); plan[d] = keys[j].slice(); }
      else { const x = fx || (keys.length ? keys[i % keys.length][0] : discs[0]); plan[d] = [x, (() => { // 추가 질 훈련은 종류를 돌려가며 (같은 훈련 반복 방지)
        const pool = BASE_LIKE.includes(phase) ? { run: ["Fartlek", "Hills", "Steady"] }[x] : { run: ["T_cruise", "I", "T_tempo", "R"], bike: ["Thr", "VO2", "SS"], swim: ["CSS", "VO2", "CSS_long"] }[x];
        return pool ? pool[(i + wk.i) % pool.length] : fb[x];
      })()]; }
    });
    if (phil === "norwegian" && (prog === 2 || !BASE_LIKE.includes(phase)) && hard.length && n >= 4 && plan[hard[0]] && plan[hard[0]][1] === "Nor" && plan[hard[0]][0] !== "swim") plan[hard[0]][1] = "Double"; // 더블 역치는 달리기·자전거만

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

    // ---- 🏁 대회 앞뒤: 이틀 전 가볍게 · 전날 오프너 · 대회 뒤 회복 기간 (휴식 → 쉬운 강도만) ----
    const RD = wk.raceDays || {};
    const raceDayIdx = new Set(wk.races.map((r) => (r.d.getDay() + 6) % 7));
    const notHard = (ty) => EASY.includes(ty) || ty === "Opener";
    days.forEach((d) => {
      const x0 = plan[d][0] === "brick" ? "bike" : plan[d][0];
      if (raceDayIdx.has(d)) { plan[d] = [x0, "Test"]; return; } // 대회 날 (아래에서 대회로 바뀌어요, 거리 목표에서는 빠져요)
      const rd = RD[d];
      if (!rd) return;
      if (rd.kind === "rest") plan[d] = [x0, "Rec"];
      else if (rd.kind === "pre1") plan[d] = [x0, "Opener"];
      else if (!notHard(plan[d][1])) plan[d] = [x0, easyType(x0, phil, phase)]; // post·pre2: 질 훈련·롱 세션 금지
    });
    if (longDay != null && RD[longDay] && RD[longDay].kind !== "pre2") longDay = null;
    const raceNear = days.filter((d) => RD[d] || raceDayIdx.has(d)).length;
    const raceCut = raceNear ? Math.max(0.5, 1 - 0.08 * raceNear) : 1; // 대회 앞뒤 날이 많을수록 주간 거리를 줄여요
    const raceNotes = [];
    {
      const seen = new Set();
      Object.values(RD).forEach((rd) => {
        if (!rd.of || seen.has(rd.race)) return;
        seen.add(rd.race);
        const rest = Math.max(1, Math.round(rd.of * 0.25));
        raceNotes.push(`🏁 ${rd.race.name || "대회"}(${rd.race.event || ""}) 뒤 회복 ${rd.of}일 — 처음 ${rest}일은 휴식·아주 가볍게, 그 뒤 ${rd.of - rest}일은 쉬운 강도만 (질 훈련·롱 세션 없음).`);
      });
      if (Object.values(RD).some((rd) => rd.kind === "pre1")) raceNotes.push("🏁 대회 전날은 20~30분 가볍게 + 짧은 자극(오프너), 이틀 전은 쉬운 강도로 컨디션을 맞춰요.");
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
    const V = p.volume || {};
    const notes = [...raceNotes];
    const fmtVol = (x, v) => (x === "swim" ? `${(Math.round(v / 50) * 50).toLocaleString()}m` : `${round1(v)}km`);
    // 회복 주·테이퍼에는 거리도 줄여요 (보통 주는 설정한 거리 100%)
    const distFactor = (phase === "taper" ? 0.6 : phase === "race" ? 0.4 : phase === "trans" ? 0.5 : wk.recovery ? 0.7 : 1) * (["taper", "race"].includes(phase) ? 1 : raceCut);
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
      const share = (u) => {
        const [dx, ty] = u.p;
        if (ty === "Test" || (RD[u.d] && RD[u.d].kind === "rest")) return 0; // 대회 날·대회 뒤 휴식일은 거리 목표에서 빼요
        const w = (ty === "Long" || ty === "M_long" ? 1.5 : ty === "Rec" ? 0.6 : ty === "Opener" ? 0.5 : 1) * (RD[u.d] && RD[u.d].kind !== "rest" ? 0.6 : 1); // 대회 앞뒤 날은 거리를 적게
        return dx === x ? w : dx === "brick" ? (x === "bike" ? w * 0.7 : x === "run" ? w * 0.3 : 0) : 0;
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
          notes.push(`롱런은 다니엘스 기준(주간 거리의 ${tgt < 64 ? 30 : 25}% 이하)에 맞춰 ${round1(cap)}km로 하고, 나머지는 다른 달리기에 나눴어요.`);
        }
      }
    });
    // ---- ⚖️ 강도 비율을 '거리'로 정확히 나누기 ----
    // 예) 주간 달리기 100km · 저강도 80% → 고강도 구간 합계 20km를 질 훈련에 나누고, 나머지 80km는 쉬운 강도(워밍업·쿨다운 포함)
    const L = opt.lowPct;
    const ratioWeek = L != null && L < 100 && !wk.recovery && !["trans", "taper", "race"].includes(phase) && phil !== "maf";
    const hiPlan = {}, ratio = {};
    let ratioScore = 0;
    if (ratioWeek) {
      const isQ = (ty) => lvlOf(ty) >= 3 && !["Test", "Opener"].includes(ty);
      const WU = { run: 3, bike: 10, swim: 500 }, MINU = { run: 3, bike: 15, swim: 600 }, IDEAL = { run: 7, bike: 35, swim: 1200 }; // IDEAL: 질 훈련 1회의 알맞은 고강도 양
      ["swim", "bike", "run"].forEach((x) => {
        if (!targets[x]) return;
        let hu = units.filter((u) => sessDist[u.k] && sessDist[u.k][x] && isQ(u.p[1]));
        if (!hu.length) { // 이 종목에 질 훈련이 없으면 쉬운 날 하나를 질 훈련으로
          const e = units.filter((u) => u.p[0] === x && sessDist[u.k] && sessDist[u.k][x] && EASY.includes(u.p[1]) && u.k !== longKey && !RD[u.d])
            .sort((a, b) => sessDist[b.k][x] - sessDist[a.k][x])[0];
          if (e) { e.p = [x, fb[x] || "Tempo"]; if (!e.s) plan[e.d] = e.p; hu = [e]; }
        }
        if (!hu.length) { ratioScore += 5; return; }
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
      // 쉬운 날이 남도록: 질 훈련이 훈련일의 40%를 넘으면 감점
      const nQ = units.filter((u) => hiPlan[u.k]).length;
      ratioScore += 0.6 * Math.max(0, nQ - Math.ceil(units.length * 0.4));
      const R = Object.entries(ratio);
      if (R.length) {
        notes.unshift(`⚖️ 강도 비율 ${L}:${100 - L} (거리 기준) — ${R.map(([x, r]) => `${DISC[x].icon} ${DISC[x].name} ${fmtVol(x, r.total)} = 저강도 ${fmtVol(x, r.total - r.hi)} + 고강도 ${fmtVol(x, r.hi)} (질 훈련 ${r.n}회)`).join(" · ")}`);
        if (ratio.run && ratio.run.hi > ratio.run.total * 0.23) notes.push(`⚠️ 달리기 고강도 ${fmtVol("run", ratio.run.hi)}는 다니엘스 권장(T 10% + I 8% + R 5% ≈ 23%)보다 많아요. 피로·부상에 주의하세요.`);
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
      minsU[u.k] = Math.max(20, r5(m));
    });

    // 주간 달리기 거리 (다니엘스 질 훈련 상한 계산용)
    const runMin = units.reduce((a, u) => a + (u.p[0] === "run" ? minsU[u.k] : u.p[0] === "brick" ? minsU[u.k] * 0.3 : 0), 0);
    const weekKm = targets.run || (runMin * 60) / ePace;
    if (!targets.run && discs.includes("run") && longKey && plan[longDay][0] === "run") {
      const capKm = weekKm * (weekKm < 64 ? 0.3 : 0.25);
      const capMin = Math.min(150, Math.round((capKm * ePace) / 60));
      if (minsU[longKey] > capMin && capMin >= 30) { minsU[longKey] = r5(capMin); notes.push(`롱런은 다니엘스 기준(주간 거리의 ${weekKm < 64 ? 30 : 25}%·150분 이하)에 맞춰 ${minsU[longKey]}분으로 줄였어요.`); }
    }

    const env = p.env || {};
    const sessions = units.map((u) => {
      const [disc, type] = u.p;
      const minutes = minsU[u.k];
      // v: 주차·요일마다 다른 변형을 고르는 번호 → 매주·매일 다른 세션
      const x = workout(disc, type, { min: minutes, prog, ctx, goal, phase, weekKm, dist: sessDist[u.k] || null, v: wk.i + u.d + (u.s ? 2 : 0), noFinish: ratioWeek });
      const hp = hiPlan[u.k];
      if (hp) { // 비율로 정한 고강도 거리에 맞춰 메인 세트를 다시 짜요
        const q = ratioSteps(disc, type, sessDist[u.k], hp, ctx, x);
        if (q) { x.steps = q.steps; x.hiFrac = q.frac; x.hiText = q.text; }
      } else if (ratioWeek && EASY.concat("Long").includes(type)) x.hiFrac = 0;
      const rdu = !u.s && RD[u.d];
      if (rdu && rdu.kind === "rest") { // 대회 뒤 휴식
        Object.assign(x, { name: "대회 후 휴식", tag: "휴식", lvl: 1, hiFrac: 0, point: `${rdu.race.name || "대회"} 뒤 ${rdu.day}일째 — 몸이 회복하는 시간이에요. 쉬는 것도 훈련!`,
          steps: [`완전 휴식, 또는 ${minsU[u.k]}분 산책·아주 가벼운 ${DISC[disc] ? DISC[disc].name : "운동"}`, "스트레칭·폼롤러 10분, 잠 충분히, 탄수화물·단백질 보충"], effect: "대회로 생긴 근육 손상·피로를 회복해요." });
      } else if (rdu && rdu.kind === "post") x.point = `${rdu.race.name || "대회"} 뒤 회복 ${rdu.day}/${rdu.of}일째 — 쉬운 강도만. ${x.point}`;
      else if (rdu && rdu.kind === "pre1") x.point = `내일 ${rdu.race.name || "대회"}! 짧게 몸만 깨워요. ${x.point}`;
      else if (rdu && rdu.kind === "pre2") x.point = `${rdu.race.name || "대회"} 이틀 전 — 쉬운 강도로 컨디션 조절. ${x.point}`;
      const ds = disc === "brick" ? ["bike", "run"] : [disc];
      const icon = disc === "brick" ? "🚴🏃" : DISC[disc].icon;
      const slot = slotOf(u);
      const dayAvail = u.s ? num((dO[u.d] || {}).min2) || 45 : avail(u.d);
      const hi = type === "Test" ? minutes : type === "Rec" || type === "Opener" || sessDist[u.k] ? minutes + 10 : Math.min(minutes + 40, Math.max(minutes + 20, r5(dayAvail)));
      const o = sessDist[u.k];
      const dist = o ? ["swim", "bike", "run"].filter((k) => o[k]).map((k) => `${DISC[k].name} ${k === "swim" ? `${Math.round(o[k] / 50) * 50}m` : `${round1(o[k])}km`}`).join(" + ") : null;
      return {
        day: u.d, s: u.s, slot, disc, discs: ds, type, minutes, range: [minutes, hi], ...x,
        title: `${slot ? `${slot === "오전" ? "🌅" : "🌇"} ${slot} · ` : ""}${icon} ${disc === "brick" ? "" : DISC[disc].name + " · "}${x.name}`,
        rpe: RPE[x.lvl], dist: dist || x.dist || null,
        hiMin: Math.round(minutes * (x.hiFrac != null ? x.hiFrac : x.lvl >= 3 ? 0.45 : 0)),
        hiText: mixText(o, hp, x.hiFrac != null ? x.hiFrac : x.lvl >= 3 ? 0.45 : 0),
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
      return `고강도 ${pc}% ${hiP.join(" + ") || "0km"} · 저강도 ${100 - pc}% ${loP.join(" + ")}`;
    }

    // 대회가 있는 주
    wk.races.forEach((r) => {
      const dd = (r.d.getDay() + 6) % 7;
      const s = sessions.find((x) => x.day === dd && !x.s);
      const item = { day: dd, s: 0, slot: null, disc: tri ? "brick" : discs[0], discs: tri ? ["swim", "bike", "run"] : discs, type: "Race", minutes: 0, lvl: 5, tag: r.priority || "대회",
        title: `🏁 ${r.name || "대회"}`, name: "대회", point: r.priority === "A" ? "시즌 목표 대회! 계획한 레이스 강도를 지키세요." : r.priority === "B" ? "B 대회 — 전력이지만 앞뒤 2~3일은 가볍게." : "C 대회 — 강한 훈련 삼아.",
        steps: [`${r.event || ""} 레이스`, `레이스 강도: ${goal.race}`], targets: [], effect: "", rpe: "9–10", hiMin: 0, envNotes: [], dist: null };
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
      notes.unshift(`🎯 이번 주 목표 거리: ${tkeys.map((k) => `${DISC[k].icon} ${DISC[k].name} ${fmtVol(k, targets[k])}`).join(" · ")}${distFactor < 1 ? ` (설정한 거리의 ${Math.round(distFactor * 100)}% — ${wk.recovery ? "회복 주" : PHASES[phase].name})` : " — 설정한 거리를 계획에 모두 넣었어요"}`);
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
      notes.push(`이번 주 달리기 약 ${wkm}km 기준 (다니엘스): T 최대 ${round1(Math.max(2, wkm * 0.1))}km · I 최대 ${round1(Math.max(2, Math.min(wkm * 0.08, 10)))}km · R 최대 ${round1(Math.max(1.2, Math.min(wkm * 0.05, 8)))}km · 롱런 ${wkm < 64 ? 30 : 25}% 이하`);
    }
    return { sessions, notes, weekKm, targets, ratio: ratioWeek ? ratio : null, ratioScore };
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
    const ss = season(p, ctx);
    const lowTarget0 = clamp(num(p.lowPct) || 80, 50, 100); // 저강도 목표 % (추천 80)
    // 노르웨이 방식은 역치 훈련량이 많아서 설정한 비율보다 고강도를 8% 더 (예: 80:20 → 72:28)
    const lowTarget = ctx.phil === "norwegian" ? Math.max(50, lowTarget0 - 8) : lowTarget0;
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
        return { tot, low, byDist: R.length > 0, err: R.length ? r.ratioScore : Math.abs(low - lowTarget) };
      };
      const o0 = { lowPct: lowTarget };
      let r = buildWeek(p, ctx, wk, o0), m = lowOf(r);
      // 질 훈련 개수를 ±3까지 바꿔 보고 고르기
      //  · 거리 목표가 있으면: 고강도 거리는 이미 정확히 맞춰져 있어서, 한 번의 질 훈련 양이 알맞은(너무 많거나 적지 않은) 개수로
      //  · 거리 목표가 없으면: 시간 기준 비율이 목표에 가장 가까운 개수로
      // (회복 주·테이퍼·대회 주·MAF는 시기 원칙이 우선이라 그대로)
      const easyWeek = wk.recovery || ["trans", "taper", "race"].includes(wk.key) || ctx.phil === "maf";
      if (!easyWeek) {
        for (const dl of [-1, 1, -2, 2, -3, 3]) {
          const r2 = buildWeek(p, ctx, wk, { ...o0, hardDelta: dl }), m2 = lowOf(r2);
          if (m2.err < m.err - (m.byDist ? 0.15 : 1)) { r = r2; m = m2; }
        }
      }
      return { ...wk, ...r, total: m.tot, lowPct: m.low, lowTarget, byDist: m.byDist };
    })());
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
    const sMin = num(p.sessionMin) || 60, n = (p.days || []).length;
    const wh = num(p.weeklyHours);
    const dO = p.dayOpts || {};
    const dayTot = (p.days || []).reduce((a, d) => a + (num((dO[d] || {}).min) || sMin), 0) || n * sMin;
    const avail = (wh ? Math.min(wh * 60, dayTot) : dayTot) / 60;
    return { ctx, season: ss, week, gap, availHours: avail, intensityNote };
  }

  TS.E = {
    parseTime, autoTime, fmt, minLabel, num, DISC, sportKey, discsOf, SWIM_EVENTS, SWIM_PH, RUN_EVENTS, TRI_RACES, TRI_LEGS, GOALS,
    goalOf, runInfo, bikeInfo, swimInfo, hrInfo, buildPlan, vdotFrom, predict, PHASES,
    RUN_PACES, runPaceText, COGGAN, watt, SWIM_Z, swimPace, FRIEL_RUN, FRIEL_BIKE, frielRange, MAF_ADJ, PHIL, RPE,
  };
  TS.parseTime = parseTime;
})();
