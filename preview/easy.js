// 🔤 설명 수준: 초보용 / 고급용
//  - 초보용: Z2·FTP·CSS 같은 전문 용어를 누구나 아는 말로 바꿔서 보여 줘요.
//  - 고급용: 용어는 그대로 두고 점선 밑줄을 그어요. 누르면 정확한 정의와 기준 숫자를 보여 줘요.
// 화면에 보이는 글자만 바꾸고, 저장된 계획·기록은 그대로예요. (빠른 시작 / 계획 화면 / 나 탭에서 바꿀 수 있어요)
(function () {
  const TS = (window.TS = window.TS || {});
  const KEY = "zone.explain";
  const mode = () => { try { return localStorage.getItem(KEY) === "pro" ? "pro" : "easy"; } catch (e) { return "easy"; } }; // 기본은 초보용
  const ZW = { 1: "아주 편하게", 2: "편하게", 3: "조금 숨차게", 4: "힘들게", 5: "전력으로" };

  // ---------- 초보용: 쉬운 말로 바꾸기 (바꾼 말에 원래 말이 다시 들어가지 않게 → 두 번 바뀌지 않아요) ----------
  const RULES = [
    [/\bZ([1-5])\s+Z\1\b/gi, (q, a) => `Z${a}`], // "Z2 Z2" 같은 겹침을 하나로
    [/\bRPE\s*(\d+(?:\s*[–~-]\s*\d+)?)/g, (q, a) => `${a}/10`], // "RPE 3–4" → "3–4/10" (앞에 '힘든 정도'가 이미 있어서)
    [/\bZ([1-5])\s*[–~-]\s*Z?([1-5])\b/gi, (q, a, b) => `${ZW[a]}~${ZW[b]}`],
    [/\bZ([1-5])\b/gi, (q, a) => ZW[a]],
    [/\bE 페이스/g, "편한 조깅 속도"], [/\bM 페이스/g, "마라톤 대회 속도"], [/\bT 페이스/g, "꽤 힘든 속도(1시간 버틸 정도)"],
    [/\bI 페이스/g, "숨이 많이 찬 빠른 속도"], [/\bR 페이스/g, "짧게 아주 빠른 속도"],
    [/\bFTP\s+(\d)/g, "1시간 최대 파워의 $1"], [/\bFTP\b/g, "1시간 최대 파워"], [/운동자각도/g, "힘든 정도"], [/\bCSS\b/g, "기준 수영 속도"], [/\bLTHR\b/g, "역치 심박"], [/\bVDOT\b/g, "달리기 실력 점수"],
    [/\bTSS\b/g, "훈련 부하"], [/\bRPE\b/g, "힘든 정도"], [/\bMAF\b/g, "저심박"], [/\bW\/kg\b/g, "몸무게당 파워"],
    [/\bDPS\b/g, "한 번 저을 때 멀리 가기"], [/\bPD\+Fins\b/g, "패들+오리발"], [/Gear Choice/g, "장비 자유"],
    [/Bre 3·5·7/g, "3·5·7번 저을 때마다 숨쉬기"], [/@(\d+)'(\d{2})"/g, (q, m, s) => `${+m ? m + "분 " : ""}${+s}초마다 출발`],
    [/홀=/g, "홀수 번째: "], [/짝=/g, "짝수 번째: "], [/케이던스/g, "페달 회전수"], [/폴라리제드/g, "쉬운 날·힘든 날 나누기"],
    [/스윗스팟/g, "약간 힘든 꾸준한 구간"], [/VO2max/g, "최대 산소 능력"], [/\bbpm\b/g, "회/분"],
  ];
  const plain = (t) => RULES.reduce((a, [re, to]) => a.replace(re, to), String(t));

  // ---------- 고급용: 용어 정의 (누르면 보여요) ----------
  const DEF = {
    Z1: ["Z1 · 회복", "역치 심박(LTHR)의 약 81% 미만. 피로를 풀고 혈액순환을 돕는 강도예요. 대화가 아주 편해요."],
    Z2: ["Z2 · 유산소 기초", "LTHR 약 81~89%. 지방 대사·모세혈관·미토콘드리아가 발달하는 강도로, 지구력의 바탕이에요. 코로 숨쉬며 대화할 수 있어요."],
    Z3: ["Z3 · 템포", "LTHR 약 90~93%. 마라톤~하프 대회 페이스 근처예요. 문장으로 말하기가 조금 힘들어요."],
    Z4: ["Z4 · 역치", "LTHR 약 94~99%. 젖산이 쌓이기 시작하는 경계로, 약 1시간 버틸 수 있는 강도예요. 역치를 끌어올려요."],
    Z5: ["Z5 · 최대 산소(VO2max) 이상", "LTHR 100% 이상. 3~8분 반복으로 최대 산소 섭취량을 키워요. 몇 단어만 말할 수 있어요."],
    "E 페이스": ["E 페이스 (이지)", "잭 다니엘스 기준 VDOT 페이스의 쉬운 구간(최대심박 약 65~79%). 주간 거리의 대부분을 이 속도로 달려요."],
    "M 페이스": ["M 페이스 (마라톤)", "지금 실력(VDOT)으로 풀코스를 달릴 수 있는 예상 페이스예요."],
    "T 페이스": ["T 페이스 (역치)", "약 1시간 버틸 수 있는 속도(최대심박 약 88~92%). 20분 지속주나 5~10분 반복으로 해요."],
    "I 페이스": ["I 페이스 (인터벌)", "약 10~15분 버틸 수 있는 속도(VO2max). 3~5분 반복, 같은 시간 조깅으로 쉬어요."],
    "R 페이스": ["R 페이스 (반복)", "1마일 대회 속도 근처. 200~400m를 빠르게, 충분히 쉬면서 속도와 자세를 다듬어요."],
    FTP: ["FTP (기능적 역치 파워)", "1시간 동안 유지할 수 있는 최대 평균 파워(W). 보통 20분 전력 테스트 평균 × 0.95로 구해요. 자전거 강도의 기준이에요."],
    CSS: ["CSS (임계 수영 속도)", "100m당 역치 속도 = (400m 기록 − 200m 기록) ÷ 2. 수영 강도의 기준이에요."],
    LTHR: ["LTHR (젖산역치 심박)", "30분 전력 테스트의 마지막 20분 평균 심박. 심박 구간(Z1~Z5)을 나누는 기준이에요."],
    VDOT: ["VDOT (달리기 능력 지수)", "잭 다니엘스가 만든 지수예요. 대회 기록으로 계산하고, E·M·T·I·R 페이스를 정하는 기준이 돼요."],
    TSS: ["TSS (훈련 스트레스 점수)", "강도와 시간을 합친 훈련 부하예요. 역치 강도로 1시간 = 100점이에요."],
    RPE: ["RPE (주관적 운동 강도)", "몸이 느끼는 힘든 정도를 1~10으로 매겨요. 기계가 없을 때 강도를 맞추는 기준이에요."],
    MAF: ["MAF (최대 유산소 기능)", "'180 − 나이' 심박 이하로만 하는 유산소 훈련(마페토네 방식)이에요."],
    DPS: ["DPS (스트로크당 거리)", "한 번 저을 때 나아가는 거리예요. 적은 횟수로 멀리 가는 효율을 키워요."],
    "W/kg": ["W/kg (몸무게당 파워)", "FTP ÷ 몸무게. 오르막 능력과 실력 비교의 기준이에요."],
    케이던스: ["케이던스", "1분당 페달(또는 발) 회전수. 자전거는 보통 85~95rpm, 달리기는 170~185spm이에요."],
    폴라리제드: ["폴라리제드 (양극화 훈련)", "훈련의 약 80%를 저강도(Z1~Z2), 20%를 고강도(Z4~Z5)로 나누고 중간 강도를 줄이는 방식이에요."],
    스윗스팟: ["스윗스팟", "FTP의 88~94%. 피로 대비 역치 향상 효과가 커서 시간이 적은 사람에게 좋아요."],
    VO2max: ["VO2max (최대 산소 섭취량)", "1분에 몸이 쓸 수 있는 최대 산소량. 3~8분 고강도 반복으로 키워요."],
    "@": ["출발 간격 (@)", "이 시간마다 다음 반복을 출발해요. 빨리 들어오면 남은 시간이 휴식이에요."],
  };
  const TERM_RE = /\bZ[1-5]\b|\b[EMTIR] 페이스|\bFTP\b|\bCSS\b|\bLTHR\b|\bVDOT\b|\bTSS\b|\bRPE\b|\bMAF\b|\bDPS\b|\bW\/kg\b|케이던스|폴라리제드|스윗스팟|VO2max|@\d+'\d{2}"/g;
  const defOf = (w) => DEF[/^@/.test(w) ? "@" : /^z[1-5]$/i.test(w) ? w.toUpperCase() : w];

  const SKIP = /^(INPUT|TEXTAREA|SCRIPT|STYLE|SELECT|OPTION|BUTTON)$/;
  function walk(root) {
    if (!root) return;
    const pro = mode() === "pro";
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const p = n.parentElement;
        if (!p || SKIP.test(p.tagName) || p.closest(".no-easy, .term, [contenteditable], .post, .cm-sheet, #tab-community")) return NodeFilter.FILTER_REJECT;
        return /[A-Za-z@=]|케이던스|폴라리제드|스윗스팟/.test(n.data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const list = []; while (tw.nextNode()) list.push(tw.currentNode);
    list.forEach((n) => {
      if (!pro) { const v = plain(n.data); if (v !== n.data) n.data = v; return; }
      // 고급용: 용어마다 눌러서 뜻을 볼 수 있게 감싸요
      TERM_RE.lastIndex = 0;
      if (!TERM_RE.test(n.data)) return;
      TERM_RE.lastIndex = 0;
      const frag = document.createDocumentFragment(); let last = 0, m;
      while ((m = TERM_RE.exec(n.data))) {
        if (!defOf(m[0])) continue;
        frag.appendChild(document.createTextNode(n.data.slice(last, m.index)));
        const sp = document.createElement("span"); sp.className = "term"; sp.textContent = m[0]; sp.dataset.term = m[0];
        frag.appendChild(sp); last = m.index + m[0].length;
      }
      if (!last) return;
      frag.appendChild(document.createTextNode(n.data.slice(last)));
      n.parentNode.replaceChild(frag, n);
    });
  }
  const IDS = ["homeBody", "tab-plan", "planBody", "detailBody", "wizard", "actBody"];
  let busy = false;
  const run = () => { if (busy) return; busy = true; try { IDS.forEach((id) => walk(document.getElementById(id))); } finally { busy = false; } };
  let timer = null;
  const later = () => { clearTimeout(timer); timer = setTimeout(run, 30); };
  function start() {
    const mo = new MutationObserver(() => { if (!busy) later(); });
    IDS.forEach((id) => { const el = document.getElementById(id); if (el) mo.observe(el, { childList: true, subtree: true, characterData: true }); });
    run();
  }

  // ---------- 용어 설명 말풍선 ----------
  let tip = null;
  function showTip(el) {
    const d = defOf(el.dataset.term); if (!d) return;
    if (!tip) { tip = document.createElement("div"); tip.className = "term-tip no-easy"; tip.setAttribute("role", "tooltip"); document.body.appendChild(tip); }
    tip.innerHTML = `<b></b><p></p>`; tip.querySelector("b").textContent = d[0]; tip.querySelector("p").textContent = d[1];
    tip.style.display = "block";
    const r = el.getBoundingClientRect(), W = document.documentElement.clientWidth, tw = Math.min(300, W - 24);
    tip.style.width = tw + "px";
    tip.style.left = Math.max(12, Math.min(W - tw - 12, r.left + r.width / 2 - tw / 2)) + "px";
    const below = r.bottom + 8 + tip.offsetHeight < innerHeight;
    tip.style.top = (below ? r.bottom + 8 : Math.max(8, r.top - 8 - tip.offsetHeight)) + "px";
  }
  const hideTip = () => { if (tip) tip.style.display = "none"; };
  document.addEventListener("click", (e) => {
    const t = e.target.closest(".term");
    if (t) { e.preventDefault(); e.stopPropagation(); showTip(t); return; }
    hideTip();
    const b = e.target.closest("[data-explain]");
    if (b) { e.preventDefault(); TS.explain.set(b.dataset.explain); }
  }, true);
  window.addEventListener("scroll", hideTip, true);

  const label = (m) => (m === "pro" ? "🏅 고급용" : "🌱 초보용");
  TS.explain = {
    mode,
    set(m) {
      const was = mode();
      try { localStorage.setItem(KEY, m === "pro" ? "pro" : "easy"); } catch (e) { /* 무시 */ }
      document.querySelectorAll("[data-explain]").forEach((x) => x.classList.toggle("on", x.dataset.explain === mode()));
      if (was === mode()) return;
      // 화면을 원래 글자로 다시 그린 뒤, 새 설명 수준으로 바꿔요
      document.querySelectorAll(".term").forEach((t) => t.replaceWith(document.createTextNode(t.textContent)));
      try { if (TS.reload) TS.reload(); if (TS.refreshPlan) TS.refreshPlan(); } catch (e) { /* 무시 */ }
      setTimeout(run, 60);
    },
    // 두 칸짜리 고르기 버튼
    pickerHtml: () => `<div class="chips no-easy explain-pick" role="group" aria-label="설명 수준">${["easy", "pro"].map((m) => `<button type="button" class="chip${mode() === m ? " on" : ""}" data-explain="${m}">${label(m)}</button>`).join("")}</div>`,
  };
  TS.plain = (t) => (mode() === "easy" ? plain(t) : String(t));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
