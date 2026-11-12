// 🧑‍🏫 코치 — AI·서버 없이 앱 안에서 코칭 규칙으로 답해요 (비용 0원)
// 내 페이스·FTP·CSS·심박, 이번 주 달력, 최근 2주 기록을 보고
//  ① 질문에 주제별로 답하고  ② 오늘 컨디션에 맞게 훈련을 조정해요.
(function () {
  const TS = window.TS;
  const { db, iso, addDays, mondayOf, escapeHtml: esc } = TS;
  const HIST_KEY = "zone.coachChat";
  const FEEL = ["😀 좋아요", "🙂 보통", "😮‍💨 피곤해요", "🦵 근육통", "😴 잠을 못 잤어요", "🤒 몸이 안 좋아요"];
  let hist = [];
  try { hist = JSON.parse(localStorage.getItem(HIST_KEY) || "[]"); } catch (e) { hist = []; }
  const saveHist = () => { try { localStorage.setItem(HIST_KEY, JSON.stringify(hist.slice(-30))); } catch (e) { /* 무시 */ } };

  const mmss = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "-");
  const r1 = (x) => Math.round(x * 10) / 10;
  const HARD = /\b(T|I|R|M|T−|SS|Z4|Z5|Z6–7|VO2|CSS|CSS 롱|CSS\+|더블 T|레이스|테스트|언덕|파틀렉|지속주|E\+M|M 롱|근력|Z3)\b/;

  // ---------- 내 정보 모으기 ----------
  async function gather(dayIso) {
    const p = TS.getProfile ? TS.getProfile() : null;
    let c = null, plan = null;
    try { if (p) { plan = TS.E.buildPlan(p); c = plan.ctx; } } catch (e) { /* 무시 */ }
    let week = [];
    try {
      const mon = mondayOf(new Date((dayIso || iso(new Date())) + "T00:00:00"));
      const { data } = await TS.mine(db.from(TS.TABLE).select("*")).gte("date", iso(mon)).lte("date", iso(addDays(mon, 6))).order("date");
      week = data || [];
    } catch (e) { /* 무시 */ }
    let acts = [];
    try { acts = (await TS.listActivities()).filter((a) => Date.now() - new Date(a.started_at) < 14 * 864e5); } catch (e) { /* 무시 */ }
    return { p, c, plan, week, acts, today: iso(new Date()) };
  }
  const zoneOf = (s) => { const m = /\bZ(\d)/.exec((s.notes || "").split("\n")[0] || ""); return m ? +m[1] : null; };
  const isHard = (s) => (zoneOf(s) || 0) >= 4 || HARD.test(((s.notes || "").split("\n")[0] || "").split("·")[1] || "");
  const kmOf = (acts, sp, days) => acts.filter((a) => a.sport === sp && Date.now() - new Date(a.started_at) < days * 864e5).reduce((x, a) => x + (a.distance_m || 0), 0) / 1000;

  // ---------- 페이스·존 안내 ----------
  function paceLines(I) {
    const { c } = I, out = [];
    if (!c) return ["문진표를 먼저 작성하면 내 페이스·존을 계산해 드려요."];
    if (c.run) out.push(`🏃 달리기 (VDOT ${r1(c.run.vdot)})\n· E(이지) ${mmss(c.run.E[0])}–${mmss(c.run.E[1])}/km — 대화되는 속도, 주간 거리 대부분\n· M(마라톤) ${mmss(c.run.M)}/km\n· T(역치) ${mmss(c.run.T)}/km — 20분 템포·크루즈 인터벌\n· I(인터벌) ${mmss(c.run.I)}/km — 3~5분 반복\n· R(반복) ${mmss(c.run.R)}/km — 200~400m 짧게`);
    if (c.bike) { const f = c.bike.ftp, w = (a, b) => `${Math.round((f * a) / 100)}–${Math.round((f * b) / 100)}W`;
      out.push(`🚴 자전거 (FTP ${f}W)\n· Z2 지구력 ${w(56, 75)}\n· Z3 템포 ${w(76, 90)} · 스윗스팟 ${w(88, 93)}\n· Z4 역치 ${w(91, 105)}\n· Z5 VO2max ${w(106, 120)}`); }
    if (c.swim) { const s = c.swim.css; out.push(`🏊 수영 (CSS ${mmss(s)}/100m)\n· 지구력 ${mmss(s + 5)}–${mmss(s + 10)}/100m\n· CSS 세트 ${mmss(s)}/100m (휴식 15초)\n· 스피드 ${mmss(s - 6)}–${mmss(s - 3)}/100m`); }
    const H = c.H || {};
    if (H.lthrRun || H.maf) out.push(`❤️ 심박\n${H.lthrRun ? `· 달리기 LTHR ${H.lthrRun} → 쉬운 날은 ${Math.round(H.lthrRun * 0.85)} 이하\n` : ""}${H.maf ? `· MAF 상한 ${H.maf}` : ""}`.trim());
    if (!out.length) out.push("기록(5K·10K 기록, FTP, CSS 테스트)을 문진표에 넣으면 페이스·파워를 계산해 드려요.");
    return out;
  }

  // ---------- 질문에 답하기 (주제별 규칙) ----------
  const TOPICS = [
    { k: "review", re: /평가|리뷰|점검|어때|어땠|잘하고|이번 ?주/, t: "이번 주 평가" },
    { k: "pace", re: /페이스|파워|존|zone|강도|심박|와트|ftp|css|vdot|몇 ?분/i, t: "내 페이스·존" },
    { k: "pain", re: /아파|아픈|통증|부상|무릎|발목|정강|아킬레스|허리|햄스트|종아리|발바닥|족저|어깨|고관절|엉덩/, t: "통증이 있어요" },
    { k: "sick", re: /감기|열이|기침|콧물|몸살|목이|인후|코로나|독감/, t: "감기 기운" },
    { k: "tired", re: /피곤|피로|지쳐|잠|수면|힘들|무거|컨디션/, t: "피곤해요" },
    { k: "race", re: /대회|레이스|시합|테이퍼|D-|디데이|마라톤 전/, t: "대회 준비" },
    { k: "food", re: /먹|보급|영양|젤|탄수|단백|물|수분|식단|카페인/, t: "보급·영양" },
    { k: "weather", re: /비 ?와|비가|더워|더위|추워|추위|날씨|미세먼지|실내|트레드밀|로라/, t: "날씨·실내" },
    { k: "missed", re: /못 ?했|놓쳤|빠졌|건너|밀렸|바빠|시간이 ?없|시간 ?부족/, t: "훈련을 놓쳤어요" },
    { k: "strength", re: /근력|웨이트|코어|스쿼트|보강|스트레칭|요가/, t: "보강 운동" },
    { k: "recover", re: /회복|쉬는 ?날|휴식|마사지|폼롤/, t: "회복" },
  ];
  function nextKey(I) {
    return I.week.find((s) => s.date >= I.today && !s.completed && isHard(s));
  }
  function answer(q, I) {
    const tp = TOPICS.find((x) => x.re.test(q));
    const { p, c, week, acts } = I;
    if (!tp) return `이런 걸 물어보시면 바로 답해 드려요:\n${TOPICS.map((x) => "· " + x.t).join("\n")}\n\n(예: "내일 인터벌 페이스는?", "무릎이 아파요", "대회 2주 남았어요")`;
    switch (tp.k) {
      case "review": {
        const done = week.filter((s) => s.completed), past = week.filter((s) => s.date < I.today), missed = past.filter((s) => !s.completed);
        const mins = week.reduce((a, s) => a + (s.duration_min || 0), 0), dmin = done.reduce((a, s) => a + (s.duration_min || 0), 0);
        const hard = week.filter(isHard), hardDone = hard.filter((s) => s.completed);
        const v = (p && p.volume) || {};
        const lines = [`📋 이번 주: 계획 ${week.length}회 중 ${done.length}회 완료 (${dmin}/${mins}분)`];
        if (missed.length) lines.push(`· 지난 날 중 ${missed.length}회를 못 했어요. 몰아서 보충하지 말고 남은 계획대로 가요.`);
        if (hard.length) lines.push(`· 핵심 훈련 ${hard.length}개 중 ${hardDone.length}개 완료${hard.length > hardDone.length ? " — 남은 핵심 훈련은 꼭 챙기고, 나머지 날은 쉽게!" : " 👍"}`);
        [["run", "달리기", "km"], ["bike", "자전거", "km"], ["swim", "수영", "m"]].forEach(([k, n, u]) => {
          const got = kmOf(acts, k, 7);
          if (+v[k] || got) lines.push(`· 최근 7일 ${n} ${u === "m" ? Math.round(got * 1000) + "m" : r1(got) + "km"}${+v[k] ? ` / 목표 ${v[k]}${u}` : ""}`);
        });
        const prev = kmOf(acts, "run", 14) - kmOf(acts, "run", 7), now = kmOf(acts, "run", 7);
        if (prev > 5 && now > prev * 1.3) lines.push(`⚠️ 달리기 양이 지난주보다 ${Math.round((now / prev - 1) * 100)}% 늘었어요. 주당 10% 안팎으로 늘리는 게 부상 위험이 적어요.`);
        if (!week.length) lines.push("이번 주 달력이 비어 있어요. 계획 → '달력에 넣기'로 채워 주세요.");
        return lines.join("\n");
      }
      case "pace": {
        const n = nextKey(I);
        return [...paceLines(I), n ? `👉 다음 핵심 훈련: ${n.date.slice(5)} ${n.title}` : ""].filter(Boolean).join("\n\n");
      }
      case "pain": {
        const part = (q.match(/무릎|발목|정강이?|아킬레스|허리|햄스트링?|종아리|발바닥|족저|어깨|고관절|엉덩이?/) || [""])[0];
        const tip = {
          무릎: "착지가 몸 앞으로 멀리 떨어지지 않게 보폭을 줄이고 케이던스를 5% 올려 보세요. 내리막·계단은 피하고, 엉덩이(중둔근) 강화가 도움돼요.",
          정강: "정강이 안쪽 통증은 양을 갑자기 늘렸을 때 흔해요. 딱딱한 길 대신 흙길, 1~2주는 달리기를 줄이고 자전거·수영으로 대체하세요. 한 곳을 눌러서 아프면 피로골절 가능성이 있으니 진료!",
          아킬레스: "언덕·스피드 훈련을 잠시 빼고, 종아리 편심 운동(뒤꿈치 천천히 내리기 3×15)을 해 보세요. 아침에 뻣뻣하면 무리하지 마세요.",
          발바닥: "족저근막염 가능성이 있어요. 아침 첫발이 아프면 양을 줄이고, 종아리 스트레칭·발바닥 공 마사지를 하세요.",
          족저: "아침 첫발이 아프면 양을 줄이고, 종아리 스트레칭·발바닥 공 마사지를 하세요.",
          허리: "코어(플랭크·버드독) 보강이 도움돼요. 자전거라면 안장 높이·핸들 거리를 확인하세요.",
          어깨: "수영 어깨 통증은 손 입수가 몸 중앙을 넘거나 엄지부터 들어갈 때 흔해요. 풀부이·패들은 잠시 빼고 킥·드릴 위주로.",
          종아리: "종아리 당김은 쉬운 강도로 줄이고, 폼롤러·스트레칭. 신발 교체 시기(600~800km)도 확인하세요.",
        }[Object.keys({ 무릎: 1, 정강: 1, 아킬레스: 1, 발바닥: 1, 족저: 1, 허리: 1, 어깨: 1, 종아리: 1 }).find((k) => part.startsWith(k))] || "";
        return `🩹 ${part ? part + " " : ""}통증 대처 (코치 기준)\n· 뛰면서 점점 심해지거나, 날카롭거나, 붓거나, 절뚝이게 되면 → 그 부위 쓰는 운동은 멈추세요.\n· 운동 중 0~3점(10점 만점)으로 약하고 다음 날 더 심해지지 않으면 → 쉬운 강도로 짧게는 괜찮아요.\n· 2~3일 쉬어도 그대로면 정형외과·스포츠의학 진료를 받으세요.\n${tip ? "· " + tip + "\n" : ""}· 그동안은 통증 없는 종목(수영·자전거)으로 유산소를 유지해요. 오늘 훈련은 '컨디션 맞춤'에서 🦵 근육통을 고르면 바꿔 드려요.`;
      }
      case "sick": return "🤒 '목 기준' 규칙\n· 목 위(콧물·코막힘·가벼운 인후통)만 있으면 → 쉬운 강도로 평소의 절반만. 하면서 나빠지면 중단.\n· 목 아래(열·몸살·기침·가슴 답답함·설사)면 → 무조건 휴식. 열 내리고 1~2일 뒤부터 쉬운 강도로 다시 시작.\n· 아픈 동안 놓친 훈련은 보충하지 않아요. 복귀 첫 주는 양 70% 정도로.";
      case "tired": {
        const n = nextKey(I), rest = c && c.H && c.H.rest;
        return `😮‍💨 피곤할 때 코치 판단\n· 오늘 계획이 쉬운 훈련이면 → 시간을 20~30% 줄이고 E 페이스보다 느리게.\n· 오늘이 질 훈련이면 → 오늘은 쉽게 하고 질 훈련은 이틀 뒤 쉬운 날과 맞바꿔요 (질 훈련끼리는 48시간 이상 띄우기).\n· 잠을 6시간 못 잤거나 ${rest ? `아침 안정시 심박이 평소(${rest})보다 5 이상 높으면` : "아침 안정시 심박이 평소보다 5 이상 높으면"} 강도는 빼세요.\n· 3일 넘게 계속 피곤하면 이번 주를 회복 주(양 60~70%)로 바꾸는 게 좋아요.${n ? `\n👉 이번 주 남은 핵심 훈련: ${n.date.slice(5)} ${n.title}` : ""}`;
      }
      case "race": {
        const races = ((p && p.races) || []).filter((r) => r.date >= I.today).sort((a, b) => (a.date < b.date ? -1 : 1));
        if (!races.length) return "등록된 대회가 없어요. 문진표 → 대회 일정에 넣으면 시기별로 계획이 맞춰져요.";
        const r = races[0], dd = Math.round((new Date(r.date + "T00:00:00") - new Date(I.today + "T00:00:00")) / 864e5);
        const pred = c && c.run && c.run.pred ? c.run.pred : null;
        const ev = String(r.event || "").toLowerCase();
        const pt = pred ? (/half|하프/.test(ev) ? pred["하프"] : /full|풀|마라톤/.test(ev) ? pred["풀코스"] : /10/.test(ev) ? pred["10K"] : /5/.test(ev) ? pred["5K"] : null) : null;
        const tip = dd > 56 ? "아직 기초·강화기예요. 지금은 꾸준함이 가장 중요해요 — 매주 계획의 90% 이상 지키기."
          : dd > 21 ? "레이스 특화 시기예요. 대회 페이스 훈련과 롱 세션에서 보급·장비를 대회 날처럼 연습하세요."
          : dd > 7 ? "테이퍼 시작! 양은 40~60% 줄이고, 짧은 레이스 페이스 자극은 유지. 잠을 충분히."
          : dd > 2 ? "대회 주예요. 새로운 건 아무것도 하지 마세요(신발·젤·음식). 2~3일 전 짧은 오프너(1분 × 4 레이스 페이스)만."
          : "대회 직전! 전날은 쉬거나 20분 가볍게, 탄수화물 위주 식사, 장비 미리 챙기기. 초반에 절대 오버페이스 금지.";
        return `🏁 ${r.name || "대회"} (${r.event || ""}) D-${dd}\n${tip}${pt ? `\n· 지금 기록 기준 예상 기록: ${TS.E.fmt(Math.round(pt))}` : ""}`;
      }
      case "food": return "🍌 보급·영양 기본\n· 60분 이하: 물만으로 충분해요.\n· 60~90분: 물 + 원하면 탄수화물 조금.\n· 90분 이상: 시간당 탄수화물 60g 안팎(젤 2~3개), 물 400~800ml, 더우면 전해질.\n· 운동 후 30분 안에 탄수화물 + 단백질 20~30g (예: 우유+바나나, 밥+계란).\n· 대회 2~3일 전부터 탄수화물 비중을 늘리고, 대회 날 아침은 3시간 전에 익숙한 음식으로.\n· 새로운 젤·음식은 꼭 훈련에서 먼저 시험해 보세요.";
      case "weather": {
        const r = c && c.run;
        return `🌦 날씨·실내\n· 더운 날(27℃↑): 페이스 대신 심박·노력으로. 페이스가 10~20초/km 느려지는 건 정상. 질 훈련은 아침 일찍.\n· 비·미세먼지(나쁨): 실내로. 트레드밀은 경사 1%로 하면 야외와 비슷해요${r ? ` (E ${mmss(r.E[0])}–${mmss(r.E[1])}/km = 시속 ${r1(3600 / r.E[1])}–${r1(3600 / r.E[0])}km)` : ""}.\n· 실내 자전거는 시간 대비 효과가 커요 — 야외 Z2 90분 ≈ 실내 70~75분.\n· 추운 날: 워밍업을 5~10분 늘리고, 인터벌 사이 쉬는 시간에 체온 유지.`;
      }
      case "missed": {
        const n = nextKey(I);
        return `📅 훈련을 놓쳤을 때\n· 지나간 훈련은 보내 주세요. 몰아서 하면 피로만 쌓여요.\n· 놓친 게 핵심(질) 훈련이면 → 이번 주 남은 쉬운 날 하나와 맞바꾸되, 질 훈련끼리 48시간 이상 띄우기.\n· 시간이 부족한 날은 워밍업·쿨다운은 지키고 메인만 줄이세요. 20분이라도 하면 흐름이 유지돼요.\n· 일주일 넘게 쉬었다면 첫 주는 양 70%로 다시 시작.${n ? `\n👉 남은 핵심 훈련: ${n.date.slice(5)} ${n.title}` : ""}`;
      }
      case "strength": return "💪 보강 운동 (주 2회, 20~30분)\n· 하체: 스쿼트·런지·한발 데드리프트 3×10\n· 엉덩이: 사이드 브릿지·클램쉘·밴드 워크 3×15\n· 종아리: 뒤꿈치 들기(천천히 내리기) 3×15\n· 코어: 플랭크 3×40초·버드독·데드버그\n· 질 훈련 하는 날 저녁에 붙여서 '힘든 날은 힘들게, 쉬운 날은 쉽게'. 대회 10일 전부터는 가볍게만.";
      case "recover": return "😴 회복 체크\n· 잠이 최고의 회복이에요 — 7~9시간.\n· 쉬는 날은 완전 휴식 또는 20~30분 산책·가벼운 스트레칭.\n· 쉬운 날이 정말 쉬워야 힘든 날을 잘할 수 있어요 (80/20).\n· 3주 훈련 후 1주는 양을 30~40% 줄여요 — 앱 계획에 이미 들어가 있어요.\n· 폼롤러는 근육 위주로 1~2분씩, 통증 부위를 세게 누르진 마세요.";
    }
    return "";
  }

  // ---------- 오늘 훈련 컨디션 맞춤 (규칙) ----------
  const DISC_OF = { 러닝: "run", 사이클: "bike", 브릭: "bike", 수영: "swim" };
  function easyFor(disc, min, I, why) { return Object.assign(easyBase(disc, min, I, why), { duration_min: min }); }
  function easyBase(disc, min, I, why) {
    const c = I.c || {};
    if (disc === "run") return { title: "🏃 달리기 · 회복 조깅", category: "러닝", zone: 1, rpe: "2–3", tag: "회복", point: "E 페이스보다도 느리게, 다리를 풀어주는 날이에요.",
      steps: [`${min}분 아주 천천히${c.run ? ` (${mmss(c.run.E[1] + 15)}/km보다 느리게)` : " (RPE 2–3)"}`, "끝나고 가벼운 스트레칭 5분"],
      distance: c.run ? `${r1((min * 60) / (c.run.E[1] + 20))}km` : "", reason: why };
    if (disc === "bike") return { title: "🚴 자전거 · 회복 라이딩", category: "사이클", zone: 1, rpe: "2", tag: "Z1", point: "페달만 가볍게. 케이던스 90 이상, 다리에 힘 주지 않기.",
      steps: [`${min}분 Z1${c.bike ? ` (${Math.round(c.bike.ftp * 0.55)}W 이하)` : ""}`, "평지 위주, 언덕은 기어 가볍게"], distance: `${Math.round((min / 60) * 22)}km`, reason: why };
    return { title: "🏊 수영 · 회복 수영", category: "수영", zone: 1, rpe: "2", tag: "회복", point: "기술 위주로 편하게. 숨이 차면 안 돼요.",
      steps: ["200m 편하게 (여러 영법)", "드릴 6 × 50m (휴식 20초)", "킥 4 × 50m", `남은 시간 편하게${c.swim ? ` (${mmss(c.swim.css + 12)}/100m보다 느리게)` : ""}`], distance: `${Math.max(600, Math.round((min * 60) / ((c.swim ? c.swim.css : 120) + 15) * 100 / 100) * 100)}m`, reason: why };
  }
  function adjust(sess, feel, extra, I) {
    const m = /(\d{2,3})\s*분/.exec(extra), hm = /(\d(?:\.\d)?)\s*시간/.exec(extra);
    const limit = m ? +m[1] : hm ? Math.round(+hm[1] * 60) : null;
    const indoor = /비|실내|트레드밀|로라|미세먼지/.test(extra);
    const disc = sess ? DISC_OF[sess.category] || "run" : (I.p && TS.discsOf ? TS.discsOf(I.p.sport)[0] : "run");
    const dur = (sess && sess.duration_min) || 45;
    const hard = sess ? isHard(sess) : false;
    const n = sess ? I.week.find((s) => s.date > sess.date && !s.completed && !isHard(s) && DISC_OF[s.category] === disc) : null;
    const moveTxt = hard && n ? ` 이 질 훈련은 ${n.date.slice(5)}(${"일월화수목금토"[new Date(n.date + "T00:00:00").getDay()]}) 쉬운 훈련과 맞바꾸세요.` : hard ? " 이 질 훈련은 이번 주는 건너뛰어요 (몰아서 보충하지 않기)." : "";
    let out;
    if (/몸이 안 좋/.test(feel)) out = { title: "😴 휴식", category: "휴식", duration_min: 0, zone: 1, rpe: "0", tag: "휴식", distance: "", point: "오늘은 쉬는 게 훈련이에요.",
      steps: ["완전 휴식 — 수분·수면 충분히", "열·몸살·기침이 있으면 나을 때까지 쉬기, 콧물 정도면 내일 쉬운 강도로 짧게"], reason: "몸이 안 좋을 땐 쉬는 게 가장 빨리 돌아오는 길이에요." + moveTxt };
    else if (/근육통/.test(feel)) {
      const alt = disc === "run" && I.p && /철인|수영|자전거/.test(I.p.sport || "") ? "bike" : disc;
      out = easyFor(alt, Math.min(40, Math.round(dur * 0.6)), I, `근육통이 있어서 강도를 빼고 ${alt !== disc ? "부담이 적은 자전거로 바꿔 " : ""}가볍게 혈류만 돌려요. 날카로운 통증이면 쉬세요.` + moveTxt);
    } else if (/피곤|잠을 못/.test(feel)) {
      out = hard ? easyFor(disc, Math.max(25, Math.round(dur * 0.7)), I, `${/잠/.test(feel) ? "잠이 부족한 날" : "피곤한 날"} 질 훈련은 효과보다 부상 위험이 커요. 오늘은 쉽게.` + moveTxt)
        : null;
      if (!out) {
        const mins = Math.max(20, Math.round(dur * 0.75));
        out = scaleTo({ ...parseSess(sess, I), duration_min: dur }, mins);
        out.reason = `쉬운 훈련이라 그대로 하되 시간을 ${dur}분 → ${mins}분으로 줄이고 더 천천히 하세요.`;
      }
    } else {
      out = sess ? { ...parseSess(sess, I), reason: /좋아요/.test(feel) ? "컨디션이 좋네요! 계획대로 하세요. 좋다고 더 빨리·더 길게 하지 말고 정해진 강도를 지키는 게 실력이에요." : "계획대로 진행해요. 정해진 강도를 지키세요." }
        : easyFor(disc, 40, I, "이날은 계획이 없어서 가벼운 훈련을 넣었어요. 쉬어도 괜찮아요.");
    }
    if (out.duration_min == null) out.duration_min = /회복/.test(out.title) ? (out.steps[0].match(/(\d+)분/) || [0, 40])[1] * 1 : dur;
    if (limit && out.duration_min > limit) {
      out.reason += ` 시간이 ${limit}분이라 워밍업·쿨다운은 지키고 메인을 줄여 ${limit}분에 맞췄어요.`;
      out = scaleTo(out, limit);
    }
    if (indoor && out.category !== "휴식") out.steps = [...out.steps, out.category === "러닝" ? "실내라면 트레드밀 경사 1%로" : out.category === "사이클" ? "실내 로라: 선풍기·물 충분히, 파워 기준으로" : "실내 수영장 기준"];
    return out;
  }
  // 시간을 줄이면 구성의 '○분'과 권장 거리도 같은 비율로 줄여요 (워밍업·쿨다운·드릴처럼 짧은 건 유지)
  function scaleTo(o, mins) {
    const from = o.duration_min || mins, f = mins / from;
    if (f >= 1) return { ...o, duration_min: mins };
    const steps = o.steps.map((s) => (/워밍업|쿨다운|드릴|스트레칭/.test(s) ? s : s.replace(/(\d+)분/, (x, a) => `${Math.max(5, Math.round(+a * f))}분`)));
    const distance = (o.distance || "").replace(/(\d+(?:\.\d+)?)km/, (x, a) => `${Math.round(+a * f * 10) / 10}km`);
    return { ...o, steps, distance, duration_min: mins };
  }
  function parseSess(s, I) {
    const lines = (s.notes || "").split("\n");
    const hp = (lines[0] || "").replace("[자동 계획]", "").split("·").map((x) => x.trim());
    const steps = [];
    let on = false;
    lines.forEach((l) => { if (l.startsWith("구성:")) { on = true; return; } if (on && l.startsWith("- ")) steps.push(l.slice(2)); else if (on && !l.trim()) on = false; });
    const dist = ((lines.find((l) => l.startsWith("목표: 권장 거리 ")) || "").replace("목표: 권장 거리 ", ""));
    return { title: s.title, category: s.category, duration_min: s.duration_min, zone: zoneOf(s) || 2, tag: hp[1] || "", rpe: (hp[2] || "").replace("RPE ", "") || "-",
      distance: dist, point: ((lines.find((l) => l.startsWith("포인트:")) || "").replace("포인트: ", "")), steps: steps.length ? steps : [s.title], keepNotes: s.notes };
  }

  // ---------- 화면 ----------
  function dlg() {
    let d = document.getElementById("coachDlg");
    if (!d) { d = document.createElement("dialog"); d.id = "coachDlg"; document.body.appendChild(d); d.onclick = (e) => { if (e.target === d) d.close(); }; }
    return d;
  }
  const SUGGEST = ["이번 주 평가해 주세요", "내 페이스·존 알려주세요", "무릎이 살짝 아파요", "대회 준비 어떻게 해요?", "피곤해요", "비 오는 날은요?"];
  function openChat() {
    const d = dlg();
    const draw = () => {
      d.innerHTML = `<div style="display:flex;flex-direction:column;height:min(80vh,640px)">
        <div class="spread" style="padding:14px 16px;border-bottom:1px solid var(--line)"><b>🧑‍🏫 코치에게 물어보기</b>
          <span><button type="button" class="link" data-c="clear" style="font-size:13px">대화 지우기</button>
          <button type="button" class="link" data-c="x" aria-label="닫기" style="font-size:20px;margin-left:8px">✕</button></span></div>
        <div id="coachLog" style="flex:1;overflow-y:auto;padding:12px 16px;display:grid;gap:10px;align-content:start">
          ${hist.length ? "" : '<p class="hint" style="margin:0">내 페이스·이번 주 계획·최근 기록을 보고 코칭 기준대로 답해요.</p>'}
          ${hist.map((m) => `<div class="cmsg ${m.role === "user" ? "me" : "ai"}">${esc(m.content)}</div>`).join("")}
          <div style="display:flex;flex-wrap:wrap;gap:6px">${SUGGEST.map((s) => `<button type="button" class="pill" data-q="${esc(s)}">${esc(s)}</button>`).join("")}</div>
        </div>
        <form id="coachForm" style="display:flex;gap:8px;padding:10px 12px;border-top:1px solid var(--line)">
          <input id="coachIn" placeholder="예: 내일 인터벌 페이스는?" autocomplete="off" style="flex:1" />
          <button class="primary">보내기</button></form>
        <p class="hint" style="margin:0 12px 10px;font-size:11px">일반적인 코칭 기준의 자동 답변이에요. 통증이 계속되면 전문가 진료를 받으세요.</p>
      </div>`;
      const log = d.querySelector("#coachLog"); log.scrollTop = log.scrollHeight;
      d.querySelector('[data-c="x"]').onclick = () => d.close();
      d.querySelector('[data-c="clear"]').onclick = () => { hist = []; saveHist(); draw(); };
      d.querySelectorAll("[data-q]").forEach((b) => { b.onclick = () => send(b.dataset.q); });
      d.querySelector("#coachForm").onsubmit = (e) => { e.preventDefault(); send(d.querySelector("#coachIn").value); };
    };
    async function send(q) {
      q = String(q || "").trim();
      if (!q) return;
      const I = await gather();
      hist.push({ role: "user", content: q }, { role: "assistant", content: answer(q, I) });
      saveHist(); draw();
    }
    draw();
    if (!d.open) d.showModal();
  }

  function notesOf(s) {
    if (s.keepNotes && !/줄이|맞췄|실내/.test(s.reason) && s.steps.every((x) => s.keepNotes.includes(x))) return s.keepNotes + `\n\n🧑‍🏫 코치: ${s.reason}`;
    return [`[자동 계획] Z${s.zone} · ${s.tag} · RPE ${s.rpe}`, `포인트: ${s.point}`, "", "구성:", ...s.steps.map((x) => `- ${x}`), "",
      s.distance ? `목표: 권장 거리 ${s.distance}` : null, "", `🧑‍🏫 코치: ${s.reason}`].filter((x) => x !== null).join("\n");
  }
  function openAdjust(dayIso, sess) {
    const d = dlg();
    const day = dayIso || iso(new Date());
    let feel = FEEL[1];
    const head = `<div class="spread"><b>🧑‍🏫 컨디션에 맞추기</b><button type="button" class="link" data-c="x" style="font-size:20px">✕</button></div>`;
    const ask = () => {
      d.innerHTML = `<div style="padding:18px;display:grid;gap:12px">${head}
        <p class="hint" style="margin:0">${sess ? `원래 계획: <b>${esc(sess.title)}</b>` : "이날은 계획이 없어요."}</p>
        <div class="eyebrow" style="margin:0">오늘 몸 상태는요?</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${FEEL.map((f) => `<button type="button" class="pill${f === feel ? " on" : ""}" data-f="${esc(f)}">${esc(f)}</button>`).join("")}</div>
        <input id="feelTx" placeholder="(선택) 예: 40분밖에 없어요 / 비 와서 실내만 돼요" />
        <div class="actions"><div class="right"><button type="button" data-c="x">취소</button><button type="button" class="primary" data-c="go">맞춤 훈련 보기</button></div></div></div>`;
      d.querySelectorAll('[data-c="x"]').forEach((b) => { b.onclick = () => d.close(); });
      d.querySelectorAll("[data-f]").forEach((b) => { b.onclick = () => { feel = b.dataset.f; d.querySelectorAll("[data-f]").forEach((x) => x.classList.toggle("on", x === b)); }; });
      d.querySelector('[data-c="go"]').onclick = async () => show(adjust(sess, feel, d.querySelector("#feelTx").value, await gather(day)));
    };
    function show(s) {
      const notes = notesOf(s);
      const fake = { id: "coach", title: s.title, category: s.category, duration_min: s.duration_min || null, intensity: "", completed: false, notes };
      d.innerHTML = `<div style="padding:18px;display:grid;gap:12px;max-height:85vh;overflow:auto">${head}
        ${TS.sessHtml ? TS.sessHtml(fake, false) : esc(s.title)}
        <div class="note" style="margin:0">🧑‍🏫 ${esc(s.reason)}</div>
        <div class="actions"><button type="button" data-c="again">상태 다시 고르기</button>
          <div class="right"><button type="button" data-c="x">그대로 두기</button><button type="button" class="primary" data-c="apply">${sess ? "이걸로 바꾸기" : "달력에 넣기"}</button></div></div></div>`;
      d.querySelectorAll('[data-c="x"]').forEach((b) => { b.onclick = () => d.close(); });
      d.querySelector('[data-c="again"]').onclick = ask;
      d.querySelector('[data-c="apply"]').onclick = async (e) => {
        e.target.disabled = true;
        const row = { title: s.title, category: s.category, duration_min: s.duration_min || null, intensity: s.zone <= 2 ? "낮음" : s.zone === 3 ? "보통" : "높음", notes };
        const { error } = await (sess && sess.id ? db.from(TS.TABLE).update(row).eq("id", sess.id) : db.from(TS.TABLE).insert({ ...row, date: day, completed: false }));
        if (error) { e.target.disabled = false; TS.ask(TS.explainError(error).replace(/<[^>]+>/g, ""), "확인", null); return; }
        d.close();
        TS.reload();
      };
    }
    ask();
    if (!d.open) d.showModal();
  }

  TS.coach = { openChat, openAdjust, answer, adjust, gather };
})();
