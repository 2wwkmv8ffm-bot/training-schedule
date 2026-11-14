// 🧑‍🏫 코치 — AI·서버 없이 앱 안에서 코칭 규칙으로 답해요 (비용 0원)
// 내 페이스·FTP·CSS·심박, 이번 주 달력, 최근 2주 기록을 보고
//  ① 질문에 주제별로 답하고  ② 오늘 컨디션에 맞게 훈련을 조정해요.
(function () {
  const TS = window.TS;
  const { db, iso, addDays, mondayOf, escapeHtml: esc } = TS;
  const HIST_KEY = "zone.coachChat";
  const FEEL = ["💪 더 강하게 하고 싶어요", "😀 좋아요", "🙂 보통", "😮‍💨 피곤해요", "🦵 근육통", "😴 잠을 못 잤어요", "🤒 몸이 안 좋아요"];
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
    { k: "missed", re: /못 ?했|놓쳤|빠졌|건너|밀렸|바빠|시간이 ?없|시간 ?부족|밖에 ?없/, t: "훈련을 놓쳤어요" },
    { k: "strength", re: /근력|웨이트|코어|스쿼트|보강|스트레칭|요가/, t: "보강 운동" },
    { k: "recover", re: /회복|쉬는 ?날|휴식|마사지|폼롤/, t: "회복" },
  ];
  function nextKey(I) {
    return I.week.find((s) => s.date >= I.today && !s.completed && isHard(s));
  }
  // ---------- 더 많은 주제 (먼저 확인해요) ----------
  const DOW = "일월화수목금토";
  const fmtT = (s) => TS.E.fmt(Math.round(s));
  const sessLine = (s) => {
    const z = zoneOf(s);
    const dist = ((s.notes || "").split("\n").find((l) => l.startsWith("목표: 권장 거리 ")) || "").replace("목표: 권장 거리 ", "");
    return `${s.date.slice(5).replace("-", "/")}(${DOW[new Date(s.date + "T00:00:00").getDay()]}) ${s.title.replace(/^.*?· /, "")}${z ? ` · Z${z}` : ""}${s.duration_min ? ` · ${s.duration_min}분` : ""}${dist ? ` · ${dist}` : ""}${s.completed ? " ✓" : ""}`;
  };
  const MORE = [
    { k: "postrace", re: /대회 ?(끝|후|뒤|마치)|끝나고.*(언제|다시)|회복 ?기간/, t: "대회 후 회복" },
    { k: "easy", re: /쉬운 ?날|천천히 ?뛰|80 ?\/ ?20|느리게 뛰|왜 ?(천천히|느리게)/, t: "왜 쉬운 날은 천천히?" },
    { k: "predict", re: /예측|예상 ?기록|몇 ?분.*(나올|가능)|기록.*(나올|가능)|가능할까/, t: "대회 기록 예측" },
    { k: "goal", re: /목표 ?(기록|페이스)|목표.*(현실|가능|무리)|서브 ?[34]|sub/i, t: "내 목표가 현실적인지" },
    { k: "level", re: /레벨|내 수준|몇 급|초보|중급|상급/, t: "내 레벨" },
    { k: "today", re: /오늘.*(훈련|뭐|운동)|내일.*(훈련|뭐|운동)|남은 훈련|이번 ?주 ?(일정|스케줄|계획)/, t: "오늘·내일 훈련" },
    { k: "taper", re: /테이퍼|조정기|대회 ?(2|두) ?주|대회 ?주간|대회 ?전 ?주/, t: "대회 2주 전 조정기" },
    { k: "carbo", re: /카보|로딩|글리코겐|대회 전 ?(식사|음식|뭐 먹)/, t: "카보로딩·대회 전 식사" },
    { k: "raceday", re: /당일|레이스 ?(전략|운영|페이스)|페이스 ?(전략|운영|조절)|출발.*(빠르|느리)|네거티브/, t: "대회 당일 전략" },
    { k: "workout", re: /^(?!.*페이스).*(인터벌|템포|역치|크루즈|vo2|롱런|lsd|파틀렉|언덕|스트라이드|R ?반복)/i, t: "훈련 종류 설명 (인터벌·템포·롱런)" },
    { k: "zone", re: /^(?!.*페이스).*(존|zone|심박 ?구간|최대 ?심박)/i, t: "심박 존" },
    { k: "form", re: /^(?!.*(자전거|수영|페달)).*(케이던스|자세|보폭|착지|팔치기|러닝 ?폼)/, t: "러닝 자세·케이던스" },
    { k: "shoes", re: /신발|러닝화|카본|운동화/, t: "러닝화" },
    { k: "swimtech", re: /호흡.*(수영|물)|수영.*(자세|호흡|느려|팔)|물 ?잡기|드릴|자유형/, t: "수영 기술" },
    { k: "bikeTech", re: /페달|자전거.*케이던스|ftp ?테스트|피팅|안장|파워미터/i, t: "자전거 기술·FTP" },
    { k: "brick", re: /브릭|바꿈터|트랜지션|\bt[12]\b/i, t: "브릭·바꿈터" },
    { k: "ow", re: /오픈 ?워터|바다|웻 ?슈트|사이팅/, t: "오픈워터" },
    { k: "overtrain", re: /과훈련|오버 ?트레이닝|정체|기록이 안|늘지 않|번아웃/, t: "기록 정체·과훈련" },
    { k: "comeback", re: /복귀|다시 시작|오래 쉬|쉬다가|공백|쉬었/, t: "쉬다가 복귀" },
    { k: "weight", re: /체중|다이어트|살 ?빼|살이|몸무게/, t: "체중 관리" },
    { k: "warm", re: /워밍업|준비 ?운동|쿨다운|정리 ?운동/, t: "워밍업·쿨다운" },
    { k: "doms", re: /근육통|알이 ?배|뭉쳤|다리가 ?무거/, t: "근육통" },
    { k: "cross", re: /크로스|다른 ?운동|등산|축구|헬스|필라테스/, t: "다른 운동과 같이 하기" },
    { k: "motiv", re: /동기|하기 ?싫|귀찮|의욕|꾸준/, t: "동기부여·꾸준함" },
    { k: "age", re: /나이|[456]0대|마스터즈/, t: "나이와 훈련" },
    { k: "breath", re: /숨이|호흡이|숨 ?쉬|옆구리/, t: "달릴 때 호흡·옆구리 통증" },
  ];
  async function answerMore(q, I) {
    const tp = MORE.find((x) => x.re.test(q));
    if (!tp) return null;
    const { p, c, plan, week } = I;
    const R = c && c.run;
    switch (tp.k) {
      case "postrace": {
        const races = ((p && p.races) || []).sort((a, b) => String(b.date).localeCompare(String(a.date)));
        const r = races.find((x) => x.date && x.date <= I.today) || races[0];
        const n = r && TS.E.recoveryDays ? TS.E.recoveryDays(r, TS.E.sportKey(p.sport)) : 7;
        const rest = Math.max(1, Math.round(n * 0.25));
        return `🛌 대회 후 회복${r ? ` (${r.name || "대회"} ${r.event || ""})` : ""}\n· 회복 기간 약 ${n}일 — 처음 ${rest}일은 휴식·산책·아주 가벼운 조깅, 그 뒤 ${n - rest}일은 쉬운 강도만\n· 대략 '대회 거리 km ÷ 3일' 동안은 질 훈련 없이 (10K → 3일, 하프 → 7일, 풀 → 2주)\n· 다리가 가볍게 느껴져도 근육·힘줄은 아직 회복 중이에요 — 이때 다치기 쉬워요\n· 잠·단백질·탄수화물 충분히, 마사지·폼롤러는 2~3일 뒤부터 가볍게\n· 앱 계획에는 이 회복 기간이 자동으로 들어가 있어요 (대회 날짜 기준)`;
      }
      case "easy": return "🐢 왜 쉬운 날은 천천히?\n· 지구력의 바탕(미토콘드리아·모세혈관·지방 대사)은 Z2 쉬운 강도에서 가장 많이, 피로는 가장 적게 쌓여요\n· 쉬운 날을 조금 빨리 뛰면(회색 지대) 효과는 비슷한데 피로만 쌓여서, 정작 힘든 날(인터벌·템포)을 제대로 못 해요\n· 엘리트도 훈련의 약 80%를 쉬운 강도로 해요 (80/20 원칙)\n· 기준: 대화가 되는 속도, 최대심박의 60~70%, RPE 3~4\n· '너무 느린 것 같은데?' 싶으면 딱 맞는 거예요";
      case "predict": {
        if (!TS.predict) return "기록 예측 기능을 불러오지 못했어요.";
        const o = await TS.predict.compute();
        if (!o.rows) return "예측할 정보가 부족해요. 문진표에 5K·10K 기록을 넣거나 달리기 기록을 3회 이상 쌓아 주세요.";
        const lines = [`🔮 지금 예상 기록 (VDOT ${o.vdot.toFixed(1)} · 신뢰도 ${o.conf[0]})`, ...o.rows.map((r) => `· ${r.nm} ${fmtT(r.t)} (${fmtT(r.pace)}/km)`)];
        if (o.race) lines.push(`🏁 ${o.race.r.name || "목표 대회"}: ${fmtT(o.race.row.t)}${o.race.goal ? ` — 목표 ${fmtT(o.race.goal)} ${o.race.goal >= o.race.row.t ? "가능 ✅" : `까지 ${fmtT(o.race.row.t - o.race.goal)} 더 필요`}` : ""}`);
        lines.push("자세한 분석(방법별 계산·구간 기록표·주간 거리를 늘리면?)은 활동 탭 위 '🔮 기록 예측'에서 볼 수 있어요.");
        return lines.join("\n");
      }
      case "goal": {
        const f = plan && plan.feas;
        if (!f) return "목표 기록과 현재 최고기록을 넣으면 현실적인지 계산해 드려요. 나 → 🎯 목표 대회·기록 → 바꾸기";
        const msg = { "이미 가능": "지금 기록으로도 충분해요 — 목표를 조금 올려도 돼요.", 현실적: "계획대로 꾸준히 하면 충분히 가능해요.", 도전적: "가능하지만 빠짐없이 훈련해야 해요. 질 훈련을 놓치지 마세요.", 무리: "이번 대회엔 무리예요. 중간 목표를 잡고 다음 대회에 도전하는 걸 추천해요.", "기간 미정": "대회 날짜를 넣으면 판단할 수 있어요." }[f.verdict];
        return `🎯 목표 판단: ${f.verdict}\n· 지금 VDOT ${f.now.toFixed(1)} → 목표 VDOT ${f.need.toFixed(1)} (${f.diff > 0 ? "+" : ""}${f.diff.toFixed(1)})\n· 목표 레이스 페이스 ${fmtT(f.pace)}/km\n${f.weeksLeft ? `· 보통 ${f.weeksNeed}주 필요 · 대회까지 ${f.weeksLeft}주\n` : ""}${msg}\n계획은 지금 기록 페이스로 시작해서 4주마다 VDOT을 올려 목표 페이스에 다가가요.`;
      }
      case "level": {
        const L = plan && plan.level;
        if (!L) return "문진표에 기록(5K·FTP·CSS 등)이나 주간 거리를 넣으면 레벨(1~10)을 알려드려요.";
        return `레벨 ${L.lv}/10 · ${L.name}${L.comeback ? ` (🔄 ${L.comeback.name} — 복귀 기간이라 낮춰 잡았어요)` : ""}\n${Object.entries(L.per).map(([x, v]) => `· ${{ run: "달리기", bike: "자전거", swim: "수영" }[x]} 레벨 ${v.lv} — ${v.perf != null ? `${v.perfTxt} → ${v.perf}` : "기록 없음"}, ${v.volLv != null ? `주 ${x === "swim" ? v.vol.toLocaleString() + "m" : v.vol + "km"} → ${v.volLv}` : "주간 거리 없음"}`).join("\n")}\n레벨 = 기록 60% + 주간 거리 40%. 1은 처음 시작, 10은 엘리트 상위 그룹이에요.\n질 훈련 ${L.q} · 고강도 최대 ${TS.E.LEVEL_HI_MAX[L.lv]}%. ${L.desc}\n${L.next}\n계획 화면의 '레벨 기준표'에서 종목별 1~10레벨 기록을 볼 수 있어요.`;
      }
      case "today": {
        const tmr = iso(addDays(new Date(), 1));
        const todayS = week.filter((s) => s.date === I.today), tmrS = week.filter((s) => s.date === tmr);
        const left = week.filter((s) => s.date >= I.today && !s.completed);
        return [`📅 오늘: ${todayS.length ? todayS.map(sessLine).join(" / ") : "휴식"}`, `📅 내일: ${tmrS.length ? tmrS.map(sessLine).join(" / ") : "휴식 (또는 다음 주 일정)"}`,
          left.length ? `이번 주 남은 훈련 ${left.length}개:\n${left.map((s) => "· " + sessLine(s)).join("\n")}` : "이번 주 남은 훈련이 없어요 👍"].join("\n");
      }
      case "taper": {
        const races = ((p && p.races) || []).filter((r) => r.date >= I.today).sort((a, b) => (a.date < b.date ? -1 : 1));
        if (!races.length) return "등록된 대회가 없어요. 대회를 넣으면 2주 전부터 조정기 안내를 해 드려요.";
        const r = races[0], dd = Math.round((new Date(r.date + "T00:00:00") - new Date(I.today + "T00:00:00")) / 864e5);
        const a = TS.E.prepAdvice(r, Math.min(Math.max(dd, 1), 14), TS.E.sportKey(p.sport));
        return `${dd > 14 ? `🏁 ${r.name || "대회"}까지 D-${dd} — 조정기는 D-14부터 시작해요. 그때 할 일:\n` : ""}${a ? `${a.title}\n${a.lines.map((l) => "· " + l).join("\n")}` : ""}`;
      }
      case "carbo": return "🍝 카보로딩 (하프·풀코스·하프 아이언맨 이상)\n· D-3 ~ D-1: 체중 1kg당 하루 탄수화물 7~10g (60kg이면 420~600g) — 밥·면·빵·떡·바나나·감자\n· 양을 늘리는 대신 지방·섬유질(채소·튀김)은 줄여 속을 편하게\n· 물도 평소보다 조금 더. 체중이 1~2kg 느는 건 글리코겐·수분이라 정상이에요\n· 대회 당일 아침: 출발 3~4시간 전 익숙한 탄수화물 식사, 1시간 전 이후엔 물·젤 정도만\n· 10K 이하는 따로 로딩할 필요 없어요 — 전날 평소처럼 탄수화물 위주면 충분";
      case "raceday": {
        const o = TS.predict ? await TS.predict.compute() : null;
        const row = o && o.race ? o.race.row : null, long = row && row.d > 20000;
        return `🏁 대회 당일 전략\n· 출발 2~3시간 전까지 식사, 30~40분 전 워밍업 (10K 이하: 10분 조깅 + 스트라이드 4회 / 하프·풀: 5분 걷기·조깅)\n· 처음 ${long ? "5km" : "1~2km"}는 목표보다 3~5초/km 느리게 — 초반 오버페이스가 가장 흔한 실패 원인이에요\n· 중반은 일정하게, 마지막 ${long ? "10km" : "2km"}에서 남은 힘으로 올리기 (네거티브 스플릿)\n${row ? `· 지금 예상 기록 ${fmtT(row.t)} → 평균 페이스 ${fmtT(row.pace)}/km (구간표는 '🔮 기록 예측'에서)\n` : ""}· 하프 이상은 급수대마다 물 몇 모금, 젤은 ${row && row.d > 40000 ? "7~10km마다" : "10~12km쯤 1개"}\n· 쥐가 나면 속도를 줄이고 걷기 → 소금·물 보충`;
      }
      case "workout": return `🏃 훈련 종류 (내 페이스 기준)\n· E 이지 런${R ? ` ${fmtT(R.E[0])}–${fmtT(R.E[1])}/km` : ""} — 대화 가능, 주간 거리의 대부분. 심장·모세혈관·지방 대사\n· 롱런 — E 페이스로 길게. 지구력·보급 연습. 주간 거리의 25~30% 이하\n· T 템포·크루즈 인터벌${R ? ` ${fmtT(R.T)}/km` : ""} — '편하게 힘든' 1시간 레이스 강도. 젖산 역치 ↑ (10K~하프 핵심)\n· I 인터벌${R ? ` ${fmtT(R.I)}/km` : ""} — 3~5분 반복, 휴식은 같은 시간 조깅. VO2max ↑ (5K·10K 핵심)\n· R 반복${R ? ` ${fmtT(R.R)}/km` : ""} — 200~400m 빠르게, 완전 회복. 스피드·자세\n· 파틀렉·언덕 — 느낌으로 하는 속도 놀이, 언덕은 근력+자세 (기초기)\n· 스트라이드 — 이지 런 끝에 20초 빠르게 × 6. 다리를 가볍게`;
      case "zone": {
        const M = window.ZONE && window.ZONE.maxHr();
        return `❤️ 심박 존 (최대심박의 %)${M ? ` — 최대 ${M.v}bpm 기준` : ""}\n${(window.ZONE ? window.ZONE.list : []).map((z) => `· Z${z.z} ${z.name} ${z.pct[0]}–${z.pct[1]}%${M ? ` (${window.ZONE.bpm(z.z, M.v)})` : ""} · RPE ${z.rpe} — ${z.good[0]}`).join("\n")}\n자세한 설명과 최대심박 계산기는 홈 오른쪽 위 '심박 존'에서 볼 수 있어요.`;
      }
      case "form": return "👟 러닝 자세·케이던스\n· 케이던스(분당 걸음 수) 170~185가 보통 — 지금보다 5% 올리면 착지 충격과 무릎 부담이 줄어요\n· 발이 몸 바로 아래에 떨어지게 (앞으로 멀리 뻗지 않기)\n· 상체는 살짝 앞으로, 어깨 힘 빼고 팔은 90도로 앞뒤로\n· 시선은 15~20m 앞, 턱 당기기\n· 연습: 이지 런 끝 스트라이드 20초 × 6, 주 2회 러닝 드릴(A스킵·B스킵·하이니) 10분";
      case "shoes": return "👟 러닝화\n· 쿠션화: 이지 런·롱런 (주력) / 가벼운 레이싱화·카본화: 템포·인터벌·대회\n· 카본화는 대회와 핵심 훈련에만 — 매일 신으면 종아리·아킬레스 부담이 커요\n· 수명 약 600~800km. 밑창이 한쪽만 닳거나 쿠션이 꺼지면 교체\n· 2켤레를 번갈아 신으면 부상 위험이 줄어요\n· 대회 신발은 대회 전 롱런·템포에서 최소 2번 이상 신어 보기";
      case "swimtech": return "🏊 수영 기술\n· 숨은 물속에서 코로 계속 내쉬기 — 고개 돌렸을 때는 들이마시기만 (숨이 차는 가장 큰 원인)\n· 몸이 가라앉으면: 머리를 들지 말고 시선은 바닥, 킥은 작고 빠르게\n· 물잡기: 손이 들어간 뒤 팔꿈치를 높게 두고 손바닥·팔뚝으로 물을 뒤로 밀기\n· 드릴: 사이드 킥 → 한 팔 수영 → 캐치업 → 손끝 끌기 (각 50m)\n· 25m 스트로크 수를 세서 매번 1개씩 줄여보기 = 효율 ↑\n· CSS 테스트(400m·200m)를 4~8주마다 해서 페이스 업데이트";
      case "bikeTech": return `🚴 자전거 기술·FTP${c && c.bike ? ` (지금 FTP ${c.bike.ftp}W)` : ""}\n· 케이던스 85~95rpm이 효율적 — 언덕은 기어를 가볍게 해서 유지\n· FTP 테스트: 워밍업 20분 → 5분 강하게 → 10분 회복 → 20분 최대 → 평균 파워 × 0.95 = FTP (4~8주마다)\n· 피팅: 페달이 가장 아래일 때 무릎이 살짝(25~35°) 굽혀지게 안장 높이. 무릎·허리가 아프면 피팅부터\n· 파워미터가 없으면 심박과 RPE로 — 존은 홈 '심박 존'에서\n· 실내 트레이너는 시간 대비 효과가 커요 (선풍기 필수)`;
      case "brick": return "🔁 브릭·바꿈터 (철인3종)\n· 브릭 = 자전거 직후 바로 달리기. 다리가 무거운 느낌에 적응하는 훈련 — 2주에 1번, 대회 2달 전부터 주 1번\n· 달리기 첫 1km는 짧은 보폭·빠른 케이던스로, 페이스는 2km부터 올리기\n· T1(수영→자전거): 수경 이마로 → 웻슈트 상체 벗으며 이동 → 헬멧 먼저 채우고 자전거\n· T2(자전거→달리기): 물건은 순서대로, 연습 때 2~3번 리허설";
      case "ow": return "🌊 오픈워터\n· 6~8스트로크마다 고개를 앞으로 살짝 들어 방향 확인 (사이팅) — 수영장에서도 연습\n· 출발은 무리 옆이나 뒤에서 — 처음 200m는 숨을 고르며\n· 앞사람 발끝 뒤(드래프팅)에 붙으면 힘이 10~20% 덜 들어요\n· 웻슈트는 대회 전에 최소 2~3번 입고 연습, 목 쓸림에 바셀린\n· 절대 혼자 들어가지 말고, 눈에 띄는 수모·부이 사용";
      case "comeback": {
        const L = plan && plan.level, cb = L && L.comeback;
        return `🔄 쉬다가 복귀하기${cb ? `\n· 지금 설정: ${cb.name} — 복귀 ${cb.weeks}주 중 ${cb.since + 1}주차` : ""}\n· 2~4주 쉼: 페이스 약 4% 느리게, 2주 동안 양 70% → 85%\n· 1~3개월: 약 8% 느리게, 4주 동안 55% → 88%, 레벨 1단계 낮춰서\n· 3~6개월: 약 12% 느리게, 6주 동안 45% → 90%, 레벨 2단계 낮춰서\n· 6개월 이상: 약 17% 느리게, 8주 동안 40% → 92%, 레벨 3단계 낮춰서\n· 복귀 기간 앞 절반은 쉬운 강도(Z1~Z2)만, 뒤 절반은 가벼운 템포·언덕·파틀렉 1회만\n· 근육보다 힘줄·뼈가 늦게 돌아와요 — 처음 2주 통증이 생기면 하루 더 쉬기\n${cb ? "" : "문진표 '주간 훈련량' 단계에서 쉰 기간을 고르면 계획이 자동으로 바뀌어요."}`;
      }
      case "overtrain": {
        const prev = kmOf(I.acts, "run", 14) - kmOf(I.acts, "run", 7), now = kmOf(I.acts, "run", 7);
        return `📉 기록 정체·과훈련 체크\n· 아침 안정시 심박이 평소보다 5~10 높음, 잠이 안 옴, 의욕 없음, 같은 페이스가 더 힘듦 → 과훈련 신호\n· 이럴 땐 1주를 회복 주(양 50~60%, 강도 없이)로 — 쉬고 나면 오히려 기록이 좋아져요\n· 정체의 흔한 원인: 쉬운 날을 너무 빨리 뜀(회색 지대), 매주 같은 훈련, 잠·영양 부족\n· 해결: 80/20 지키기, 훈련 종류 바꾸기(앱이 자동으로 해요), 3주 올리고 1주 쉬기${prev > 5 ? `\n· 최근 달리기: 지난주 ${prev.toFixed(1)}km → 이번 주 ${now.toFixed(1)}km` : ""}`;
      }
      case "weight": return "⚖️ 체중 관리 (지구력 운동)\n· 훈련 많은 날 굶으면 회복·면역이 떨어져요 — 하루 300~500kcal 정도만 적게, 주 0.5kg 이내 감량\n· 감량은 비시즌·기초기에, 대회 4주 전부터는 체중보다 컨디션\n· 단백질 체중 1kg당 1.6g 정도, 탄수화물은 훈련량에 맞춰 (힘든 날 많이·쉬는 날 적게)\n· 질 훈련 전엔 꼭 먹기\n· 생리 불순·잦은 부상·계속되는 피로는 너무 적게 먹는 신호 — 먹는 양을 늘리세요";
      case "warm": return "🔥 워밍업·쿨다운\n· 이지 런: 첫 5분을 더 천천히 시작하면 충분\n· 질 훈련·대회: 10~15분 조깅 → 동적 스트레칭(레그 스윙·런지) → 스트라이드 20초 × 4 → 본 훈련\n· 짧은 대회일수록 워밍업을 길게 (5K: 20분, 마라톤: 5~10분 걷기·조깅)\n· 쿨다운: 5~10분 천천히 → 정적 스트레칭은 운동 후에";
      case "doms": return "🦵 근육통(DOMS)\n· 운동 1~3일 뒤 뻐근한 건 정상 — 새 훈련·내리막·빠른 속도 뒤에 잘 생겨요\n· 완전히 쉬기보다 가벼운 회복 조깅·자전거 20~30분이 더 빨리 풀려요\n· 폼롤러·가벼운 마사지, 잠·단백질 충분히\n· 한 곳만 날카롭게 아프거나 붓거나 3~4일 넘게 가면 부상일 수 있어요 → '통증' 질문 참고\n· 오늘 훈련은 '컨디션 맞춤'에서 🦵 근육통을 고르면 자동으로 바꿔 드려요";
      case "cross": return "🏋️ 다른 운동과 같이 하기\n· 근력(웨이트·필라테스)은 주 2회 — 질 훈련 하는 날 저녁에 붙이면 쉬운 날이 진짜 쉬워져요\n· 등산·축구 같은 강한 운동은 '고강도'로 생각하고, 다음 날 질 훈련은 피하기\n· 요가·스트레칭은 쉬는 날 OK\n· 부상으로 못 뛸 땐 자전거·수영·아쿠아 조깅으로 유산소 유지";
      case "motiv": return "🔥 꾸준함이 실력이에요\n· 하기 싫은 날은 '10분만 하자'로 시작 — 대부분 끝까지 하게 돼요\n· 목표 대회를 정하고 달력에 넣기 → 날짜가 생기면 동기가 생겨요\n· 커뮤니티에 기록 올리기, 친구와 같이 뛰기\n· 완벽한 주보다 '빠지지 않는 주'가 중요해요 — 놓친 날은 보내고 다음 훈련만\n· 4주 단위로 작은 목표 (예: 롱런 15km 완주, 5K 30초 단축)";
      case "age": return "🎂 나이와 훈련\n· 40대 이후엔 회복이 느려져요 — 질 훈련 사이 48~72시간, 3주 올리고 1주 쉬기를 꼭 지키기\n· 근력 운동 주 2회는 필수 (근육량 감소 방지, 부상 예방)\n· 최대심박은 나이로 추정하면 오차가 커요 — 직접 재서 넣으면 존이 정확해져요\n· 양을 조금 줄이고 질을 지키는 게 나이 든 선수에게 효과적이에요";
      case "breath": return "😮‍💨 달릴 때 호흡·옆구리 통증\n· 이지 런에서 숨이 차면 너무 빠른 거예요 — 대화가 될 만큼 느리게\n· 입과 코 같이 써도 돼요. 2~3걸음 들이쉬고 2~3걸음 내쉬는 리듬\n· 옆구리 통증: 속도 줄이고 길게 내쉬기, 아픈 곳을 살짝 누르기\n· 운동 1~2시간 전엔 많이 먹지 않기, 단 음료 피하기";
    }
    return null;
  }
  function answer(q, I) {
    const tp = TOPICS.find((x) => x.re.test(q));
    const { p, c, week, acts } = I;
    if (!tp) return `🤔 이 질문은 아직 정확히 답하기 어려워요.
아래 '💡 이런 걸 물어보시면 바로 답해 드려요'에서 비슷한 질문을 눌러 보세요 (질문 ${QCOUNT}개).

답할 수 있는 주제: ${[...MORE, ...TOPICS].map((x) => x.t).join(" · ")}`;
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
  // 💪 "더 강하게 하고 싶어요": 쉬운 날이면 강도 블록을 넣고, 이미 강한 날이면 반복을 조금 늘려요 (레벨 1~3은 Z3까지만)
  function harderFor(sess, disc, dur, I) {
    const c = I.c || {}, L = I.p && TS.E && TS.E.levelOf ? TS.E.levelOf(I.p) : null, low = !!(L && L.lv <= 3 && !(I.p && I.p.allowHi));
    const wu = Math.min(15, Math.round(dur * 0.25)), cd = 10, main = Math.max(10, dur - wu - cd);
    if (sess && isHard(sess)) {
      const base = parseSess(sess, I);
      return { ...base, duration_min: dur + 10, steps: [...base.steps.filter((t) => !/쿨다운/.test(t)), "추가: 메인 반복을 1~2개 더 (같은 강도·같은 휴식) — 자세가 무너지면 바로 멈추기", ...base.steps.filter((t) => /쿨다운/.test(t))],
        reason: "오늘은 이미 강한 훈련이라, 강도는 그대로 두고 반복을 1~2개만 늘렸어요. 더 세게 하면 다음 훈련에 피로가 남아요." };
    }
    const R = c.run, B = c.bike, S = c.swim;
    const t = {
      run: low ? { title: "🏃 달리기 · 템포 지속주 (Z3)", tag: "Z3", zone: 3, rpe: "5–6", steps: [`워밍업: 천천히 ${wu}분`, `메인: ${Math.min(30, main)}분 지속주 — '조금 힘들게' (말은 짧게 할 수 있는 정도)${R ? ` ${mmss(R.M)}/km 근처` : ""}`, `남은 ${Math.max(0, main - 30)}분은 편하게`, `쿨다운: ${cd}분 천천히`] }
        : { title: "🏃 달리기 · 크루즈 인터벌 (T)", tag: "T", zone: 4, rpe: "7", steps: [`워밍업: 천천히 ${wu}분 + 스트라이드 20초 × 4`, `메인: 1km × ${Math.max(3, Math.min(6, Math.round(main / 6)))}회 T 페이스${R ? ` (${mmss(R.T)}/km)` : " ('편하게 힘든' 속도)"}, 사이 1분 조깅`, `쿨다운: ${cd}분 천천히`] },
      bike: low ? { title: "🚴 자전거 · 템포 (Z3)", tag: "Z3", zone: 3, rpe: "5–6", steps: [`워밍업: ${wu}분`, `메인: 10분 × ${Math.max(2, Math.min(4, Math.round(main / 13)))}회 Z3${B ? ` (${Math.round(B.ftp * 0.76)}–${Math.round(B.ftp * 0.9)}W)` : ""}, 사이 3분 가볍게`, `쿨다운: ${cd}분`] }
        : { title: "🚴 자전거 · 역치 인터벌 (Z4)", tag: "Z4", zone: 4, rpe: "7–8", steps: [`워밍업: ${wu}분 (마지막에 1분 빠르게 × 3)`, `메인: 8분 × ${Math.max(2, Math.min(5, Math.round(main / 12)))}회 Z4${B ? ` (${Math.round(B.ftp * 0.91)}–${Math.round(B.ftp * 1.05)}W)` : ""}, 사이 4분 가볍게`, `쿨다운: ${cd}분`] },
      swim: low ? { title: "🏊 수영 · 지구력 세트 (Z3)", tag: "Z3", zone: 3, rpe: "5–6", steps: ["W-up 400m 편하게", "드릴 200m", `메인: 200m × 6 — '조금 힘들게'${S ? ` (${mmss(S.css + 4)}/100m)` : ""}, 휴식 20초`, "쿨다운 200m"] }
        : { title: "🏊 수영 · CSS 세트 (Z4)", tag: "CSS", zone: 4, rpe: "7", steps: ["W-up 400m 편하게", "드릴 200m", `메인: 100m × 10 CSS 페이스${S ? ` (${mmss(S.css)}/100m)` : ""}, 휴식 15초`, "쿨다운 200m"] },
    }[disc] || null;
    if (!t) return null;
    const cat = { run: "러닝", bike: "사이클", swim: "수영" }[disc];
    return { ...t, category: cat, duration_min: dur, distance: "", point: low ? "레벨 1~3이라 Z3까지만 올렸어요." : "쉬운 날을 강한 훈련으로 바꿨어요.",
      reason: low ? `더 강하게 하고 싶다고 해서 쉬운 훈련을 'Z3 지속 훈련'으로 바꿨어요. 지금 레벨(${L.lv})에서는 Z4·Z5보다 Z3가 실력을 더 안전하게 올려요. (문진표에서 'Z4·Z5도 넣기'를 고르면 더 강하게 바꿀 수 있어요)`
        : "더 강하게 하고 싶다고 해서 오늘 쉬운 훈련을 강도 훈련으로 바꿨어요. 이번 주 다른 강도 날이 바로 다음 날이면 그날은 쉽게 해 주세요 (강한 날이 이어지지 않게)." };
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
    if (/강하게|세게|강한 운동|더 힘들게|빡세게/.test(feel + " " + (extra || "")) && (!TS.plan || TS.plan.can("coachHarder"))) out = harderFor(sess, disc, dur, I) || easyFor(disc, dur, I, "이 종목은 아직 더 강하게 바꿀 수 없어요.");
    else if (/몸이 안 좋/.test(feel)) out = { title: "😴 휴식", category: "휴식", duration_min: 0, zone: 1, rpe: "0", tag: "휴식", distance: "", point: "오늘은 쉬는 게 훈련이에요.",
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
  const SUGGEST = ["이번 주 평가해 주세요", "내 대회 기록 예측해 줘", "내 목표 현실적이야?", "오늘 내일 훈련 뭐야?", "내 레벨은?", "인터벌이랑 템포 차이", "카보로딩 어떻게 해?", "대회 당일 전략", "무릎이 살짝 아파요", "기록이 안 늘어요"];
  const SUGGEST_GROUPS = [
    ["📅 내 훈련", "오늘·내일 할 훈련, 이번 주 평가, 레벨, 페이스", ["오늘 내일 훈련 뭐야?", "이번 주 남은 훈련 알려줘", "이번 주 평가해 주세요", "내 레벨은?", "오래 쉬다가 복귀하는데 어떻게 해요?", "내 페이스·존 알려주세요", "다음 핵심 훈련 페이스는?", "훈련을 놓쳤어요", "시간이 30분밖에 없어요", "기록이 안 늘어요", "이번 주 훈련 너무 많지 않아?"]],
    ["🏁 대회 준비", "기록 예측, 목표 판단, 조정기, 당일 전략, 회복", ["내 대회 기록 예측해 줘", "하프 마라톤 몇 분 나올까?", "내 목표 현실적이야?", "대회 2주 전 조정기 뭐 해요?", "대회 전날 뭐 해요?", "대회 당일 전략", "레이스 페이스 어떻게 정해요?", "카보로딩 어떻게 해?", "대회 준비 어떻게 해요?", "대회 끝나고 언제 다시 달려요?"]],
    ["🏃 훈련 이해", "인터벌·템포·롱런, 심박 존, 80/20, 보강", ["인터벌이랑 템포 차이", "역치가 뭐예요?", "VO2max 올리는 법", "롱런은 얼마나 길게?", "파틀렉이 뭐예요?", "심박 존이 뭐예요?", "왜 쉬운 날을 천천히 뛰어요?", "80/20이 뭐예요?", "스트라이드가 뭐예요?", "언덕 훈련 효과는?", "워밍업 어떻게 해요?", "보강 운동 뭐 해요?"]],
    ["🩹 몸 관리", "통증·부상, 피로, 감기, 근육통, 회복", ["무릎이 살짝 아파요", "정강이가 아파요", "발바닥이 아파요", "아킬레스건이 아파요", "허리가 아파요", "근육통이 있어요", "피곤해요", "잠을 못 잤어요", "감기 기운이 있어요", "과훈련 증상", "회복은 어떻게 해요?", "옆구리가 아파요"]],
    ["🍌 영양·생활", "먹는 것·보급·물, 체중, 신발, 날씨, 동기", ["달리기 전에 뭐 먹어요?", "보급은 언제 해요?", "물은 얼마나 마셔요?", "카페인 먹어도 돼요?", "체중 줄이고 싶어요", "러닝화 언제 바꿔요?", "카본화 신어도 돼요?", "더운 날 달리기", "미세먼지 심한 날", "하기 싫은 날은 어떻게 해요?", "40대인데 훈련 어떻게 해요?", "다른 운동이랑 같이 해도 돼요?"]],
    ["🏊🚴 수영·자전거·철인", "수영 기술·CSS, FTP·케이던스, 브릭·바꿈터, 오픈워터", ["수영 호흡이 힘들어요", "수영 자세 팁", "CSS가 뭐예요?", "FTP 테스트 어떻게 해요?", "자전거 케이던스는?", "실내 로라 훈련", "브릭 훈련 어떻게 해요?", "바꿈터 연습", "오픈워터 팁", "웻슈트 팁", "러닝 자세 교정", "비 오는 날은요?"]],
  ];
  const QCOUNT = SUGGEST_GROUPS.reduce((a, g) => a + g[2].length, 0);
  function guideHtml(open) {
    return `<div class="coach-guide${open ? " open" : ""}">
      <div class="cg-h">💡 이런 걸 물어보시면 바로 답해 드려요 <span>질문 ${QCOUNT}개 · 주제 ${MORE.length + TOPICS.length}가지</span></div>
      <p class="cg-sub">내 페이스·이번 주 계획·최근 기록·대회 일정을 보고 답해요. 아래 질문을 누르거나, 비슷하게 직접 써도 돼요.</p>
      ${SUGGEST_GROUPS.map(([g, sub, qs], gi) => `<details class="sg" ${open && gi === 0 ? "open" : ""}><summary><b>${g}</b> <span class="hint">${esc(sub)} · ${qs.length}</span></summary><div class="sg-q">${qs.map((s) => `<button type="button" class="pill" data-q="${esc(s)}">${esc(s)}</button>`).join("")}</div></details>`).join("")}
      <details class="sg"><summary><b>🗂 답할 수 있는 주제 전체</b> <span class="hint">${MORE.length + TOPICS.length}가지</span></summary><div class="cg-topics">${[...MORE, ...TOPICS].map((t) => `<span>${esc(t.t)}</span>`).join("")}</div></details>
    </div>`;
  }
  // 👤 코치 소개 (앱을 만든 사람)
  const ABOUT = [
    "안녕하세요. 전 트라이애슬론 국가대표이자 여러분의 성장을 도울 코치입니다.",
    "저는 항저우 아시안게임 국가대표 선발을 비롯해 전국대회 다수 입상, 그리고 수많은 국제 대회 출전 경험을 쌓으며 엘리트 선수로서 치열하게 달려왔습니다. 선수 생활 동안 긴 시간 해외 전지훈련을 다니며 세계 무대의 벽을 직접 부딪혀 봤고, 운 좋게도 올림픽 금메달리스트, 아시안게임 금메달리스트들과 같은 훈련 스케줄을 공유하며 함께 땀 흘리는 귀중한 경험을 했습니다.",
    "또한 일본 국가대표팀과 함께 훈련할 기회를 얻으면서, 한국 국가대표 감독님과 일본 국가대표 감독님 두 분의 훈련 방식과 스케줄 구성 노하우를 온전히 제 것으로 흡수할 수 있었습니다.",
    "은퇴 후 지도자와 개발자의 길을 걸으며 가장 먼저 한 일은 수영, 사이클, 육상 각 종목의 훈련법을 처음부터 다시 깊이 공부하는 것이었습니다. 제 경험에만 갇히지 않기 위해 현역 수영·사이클·육상 선수들은 물론, 여러 감독님께 끊임없이 조언을 구하고 피드백을 주고받았습니다.",
    "\"운동을 처음 시작하는 분들도, 기록을 1초라도 줄이고 싶은 엘리트 선수도 실패 없이 따라갈 수 있는 완벽한 스케줄을 만들자.\"",
    "이 목표 하나로 정말 오랜 시간 고민하며 준비했습니다. 화려한 말보다는 현장에서 직접 몸으로 부딪히고, 세계 최고의 선수들과 함께하며 검증된 진짜 훈련법으로 여러분의 목표 달성을 끝까지 함께하겠습니다.",
  ];
  const aboutHtml = () => `<details class="sg coach-about" open><summary><b>👤 코치 소개</b> <span class="hint">이 앱을 만든 사람</span></summary>
    <div style="display:grid;gap:8px;padding:8px 2px;line-height:1.7;font-size:14px">${ABOUT.map((t, i) => `<p style="margin:0${i === 4 ? ";font-weight:700" : ""}">${esc(t)}</p>`).join("")}</div></details>`;
  let showAbout = false;
  function openChat() {
    showAbout = !hist.length; // 처음 열면 코치 소개부터
    const d = dlg();
    const draw = () => {
      d.innerHTML = `<div style="display:flex;flex-direction:column;height:min(80vh,640px)">
        <div class="spread" style="padding:14px 16px;border-bottom:1px solid var(--line)"><b>🧑‍🏫 코치에게 물어보기</b>
          <span><button type="button" class="link" data-c="about" style="font-size:13px">👤 코치 소개</button> <button type="button" class="link" data-c="guide" style="font-size:13px">💡 질문 목록</button> <button type="button" class="link" data-c="clear" style="font-size:13px">대화 지우기</button>
          <button type="button" class="link" data-c="x" aria-label="닫기" style="font-size:20px;margin-left:8px">✕</button></span></div>
        <div id="coachLog" style="flex:1;overflow-y:auto;padding:12px 16px;display:grid;gap:10px;align-content:start">
          ${showAbout ? aboutHtml() : ""}
          ${hist.length ? "" : guideHtml(true)}
          ${hist.map((m) => `<div class="cmsg ${m.role === "user" ? "me" : "ai"}">${esc(m.content)}</div>`).join("")}
          ${hist.length ? guideHtml(false) : ""}
        </div>
        <form id="coachForm" style="display:flex;gap:8px;padding:10px 12px;border-top:1px solid var(--line)">
          <input id="coachIn" placeholder="예: 내일 인터벌 페이스는?" autocomplete="off" style="flex:1" />
          <button class="primary">보내기</button></form>
        <p class="hint" style="margin:0 12px 10px;font-size:11px">일반적인 코칭 기준의 자동 답변이에요. 통증이 계속되면 전문가 진료를 받으세요.</p>
      </div>`;
      const log = d.querySelector("#coachLog"); log.scrollTop = log.scrollHeight;
      d.querySelector('[data-c="x"]').onclick = () => d.close();
      d.querySelector('[data-c="clear"]').onclick = () => { hist = []; saveHist(); draw(); };
      d.querySelector('[data-c="about"]').onclick = () => { showAbout = !showAbout; draw(); if (showAbout) d.querySelector("#coachLog").scrollTop = 0; };
      d.querySelector('[data-c="guide"]').onclick = () => { const g = d.querySelector(".coach-guide"); if (g) { g.querySelector("details").open = true; g.scrollIntoView({ behavior: "smooth", block: "start" }); } };
      d.querySelectorAll("[data-q]").forEach((b) => { b.onclick = () => send(b.dataset.q); });
      d.querySelector("#coachForm").onsubmit = (e) => { e.preventDefault(); send(d.querySelector("#coachIn").value); };
    };
    async function send(q) {
      q = String(q || "").trim();
      if (!q) return;
      const I = await gather();
      if (/강하게|세게|강한 운동|강한 훈련|더 힘들게|빡세게|강도.*(올려|높여)/.test(q)) { // 💪 강도 올리기 요청 → 오늘 훈련을 바로 바꿀 수 있는 화면으로
        const today = iso(new Date());
        const sess = (I.week || []).find((s) => s.date === today && !s.completed) || null;
        hist.push({ role: "user", content: q }, { role: "assistant", content: sess ? `좋아요! 오늘 훈련(${sess.title})을 더 강하게 바꾼 안을 보여 드릴게요. '이대로 바꾸기'를 누르면 달력에 바로 반영돼요.` : "오늘은 달력에 계획된 훈련이 없어요. 강한 훈련 하나를 새로 만들어 드릴게요 — '추가하기'를 누르면 달력에 들어가요." });
        saveHist(); d.close();
        openAdjust(today, sess, FEEL[0]);
        const go = document.querySelector('[data-c="go"]'); if (go) go.click();
        return;
      }
      const more = await answerMore(q, I).catch(() => null);
      hist.push({ role: "user", content: q }, { role: "assistant", content: more || answer(q, I) });
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
  function openAdjust(dayIso, sess, preFeel) {
    const d = dlg();
    const day = dayIso || iso(new Date());
    let feel = preFeel || FEEL[2]; // 기본: 보통
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
        ${TS.sessHtml ? TS.sessHtml(fake, false, true) : esc(s.title)}
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
