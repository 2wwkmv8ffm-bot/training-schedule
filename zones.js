// ❤️ 심박 존 Z1~Z5 — 색, 최대심박 %, 운동자각도(RPE), 자세한 설명, 최대심박 계산기
// 앱 어디서든 window.ZONE 으로 같은 색·기준을 써요.
(function () {
  const Z = [
    { z: 1, name: "회복", color: "#60a5fa", fg: "#fff", pct: [50, 60], rpe: "1–2", talk: "노래도 부를 수 있어요",
      feel: "걷기~아주 느린 조깅. 숨이 전혀 차지 않고 하루 종일 할 수 있을 것 같은 느낌.",
      good: ["혈액순환이 늘어 근육에 쌓인 피로물질·염증을 빨리 치워요 → 다음 날 회복이 빨라져요.",
        "관절·힘줄에 부담이 거의 없어 부상 위험 없이 움직임을 유지해요.",
        "워밍업·쿨다운으로 심박을 서서히 올리고 내려 심장에 무리가 없어요.",
        "초보는 이 강도만으로도 심폐 기능이 좋아지기 시작해요."],
      when: "힘든 훈련 다음 날, 워밍업·쿨다운, 회복 주." },
    { z: 2, name: "지구력 (기초)", color: "#22c55e", fg: "#fff", pct: [60, 70], rpe: "3–4", talk: "문장으로 대화가 돼요",
      feel: "편안하지만 운동하는 느낌. 코로 숨쉬기가 가능하고 1~3시간도 버틸 수 있는 강도.",
      good: ["미토콘드리아(세포 속 에너지 공장)가 늘고 커져서 같은 속도를 더 적은 힘으로 낼 수 있어요.",
        "모세혈관이 촘촘해져 근육에 산소가 더 잘 전달돼요.",
        "지방을 연료로 쓰는 능력이 좋아져 탄수화물(글리코겐)을 아끼고, 장거리 후반에 '벽'에 덜 부딪혀요.",
        "심장이 한 번에 뿜는 피의 양(1회 박출량)이 늘어 안정시 심박이 내려가요.",
        "힘줄·인대·뼈가 천천히 튼튼해져 고강도를 버틸 몸이 만들어져요.",
        "피로가 적어서 많이 쌓을 수 있어요 — 80/20에서 '80'의 대부분이 이 존이에요."],
      when: "주간 훈련의 대부분. 이지 런, 롱런, 지구력 라이딩·수영." },
    { z: 3, name: "템포", color: "#eab308", fg: "#422006", pct: [70, 80], rpe: "5–6", talk: "짧은 문장만 가능해요",
      feel: "'편하게 힘든' 느낌. 집중해야 유지되고 1시간 정도 버틸 수 있어요.",
      good: ["마라톤·하프·장거리 철인의 레이스 강도 — 그 페이스에 몸과 보급을 적응시켜요.",
        "근지구력(오래 힘을 내는 근육 능력)이 좋아져요.",
        "Z2보다 효율적으로 지구력 자극을 주지만, 피로도 꽤 쌓여요.",
        "주의: 매일 이 강도로 하면 '어중간한 피로'만 쌓여요 (회색 지대). 계획된 날에만!"],
      when: "템포·지속주, 스윗스팟, 마라톤 페이스 훈련." },
    { z: 4, name: "역치", color: "#f97316", fg: "#fff", pct: [80, 90], rpe: "7–8", talk: "몇 단어만 겨우",
      feel: "힘들지만 통제되는 강도. 20~60분 레이스 느낌. 숨이 거칠고 집중이 필요해요.",
      good: ["젖산 역치가 올라가요 → 젖산이 쌓이기 시작하는 속도가 빨라져 '빠른 속도를 더 오래' 유지해요.",
        "몸이 젖산을 다시 연료로 쓰고 치우는 능력이 좋아져요.",
        "5K~하프 레이스 기록 향상에 가장 직접적인 존이에요.",
        "FTP(자전거)·CSS(수영)가 오르는 핵심 자극이에요.",
        "회복에 48시간 정도 필요해서 주 1~2회가 적당해요."],
      when: "템포런·크루즈 인터벌, FTP 역치 인터벌, CSS 세트, 노르웨이 더블 역치." },
    { z: 5, name: "최대 (VO2max)", color: "#ef4444", fg: "#fff", pct: [90, 100], rpe: "9–10", talk: "말할 수 없어요",
      feel: "거의 전력. 3~8분이면 한계가 와요. 숨이 턱까지 차요.",
      good: ["VO2max(몸이 쓸 수 있는 산소의 최대량)가 올라가요 → 지구력의 '천장'이 높아져요.",
        "심장이 최대로 펌프질하며 심장 근육 자체가 강해져요.",
        "빠른 근섬유를 쓰는 법을 배워 스피드·스퍼트·언덕 대응력이 좋아져요.",
        "러닝 경제성(같은 속도를 더 적은 산소로)이 좋아져요.",
        "피로·부상 위험이 가장 커서 주 1회, 짧게 끊어서(인터벌) 해요."],
      when: "VO2max 인터벌(3~5분), R 반복, 스프린트, 언덕 반복." },
  ];
  const colors = Z.map((x) => x.color);
  const KEY = "zone.maxHr";

  function profile() { try { return window.TS && TS.getProfile ? TS.getProfile() : null; } catch (e) { return null; } }
  // 최대심박: 직접 입력(문진표·계산기) → 나이로 추정(208 − 0.7 × 나이)
  function maxHr() {
    const p = profile() || {};
    const m = +p.maxHr || +(localStorage.getItem(KEY) || 0);
    if (m) return { v: m, measured: true };
    if (+p.age) return { v: Math.round(208 - 0.7 * +p.age), measured: false };
    return null;
  }
  const bpm = (z, max) => { const r = Z[z - 1].pct; return `${Math.round((max * r[0]) / 100)}–${Math.round((max * r[1]) / 100)}bpm`; };
  const zoneOfSession = (s) => {
    const m = /\bZ(\d)/.exec(((s && s.notes) || "").split("\n")[0] || "");
    if (m) return +m[1];
    return { 낮음: 2, 보통: 3, 높음: 4 }[s && s.intensity] || null;
  };
  // 오늘 훈련 카드에 넣는 한 줄: 어떤 존 · 최대심박 몇 % (몇 bpm) · RPE
  function guideLine(z) {
    if (!z) return "";
    const x = Z[z - 1], M = maxHr();
    return `<div class="zguide" style="border-left-color:${x.color}">
      <b style="color:${x.color === "#eab308" ? "#a16207" : x.color}">Z${z} ${x.name}</b> · 최대심박 <b>${x.pct[0]}–${x.pct[1]}%</b>${M ? ` <b>(${bpm(z, M.v)})</b>` : ""} · 운동자각도 <b>RPE ${x.rpe}</b>
      <br><span class="hint">${x.talk} — ${x.feel.split(".")[0]}.</span>
      <button type="button" class="link" data-zguide="${z}" style="font-size:12px">${M ? "존 설명 보기 ›" : "최대심박 넣고 bpm으로 보기 ›"}</button></div>`;
  }
  const legend = () => `<div class="zlegend">${Z.map((x) => `<span><i style="background:${x.color}"></i>Z${x.z} ${x.name.split(" ")[0]}</span>`).join("")}</div>`;

  function openGuide(focus) {
    let d = document.getElementById("zoneDlg");
    if (!d) { d = document.createElement("dialog"); d.id = "zoneDlg"; document.body.appendChild(d); d.onclick = (e) => { if (e.target === d) d.close(); }; }
    const p = profile() || {};
    const draw = (open) => {
      const M = maxHr();
      d.innerHTML = `<div style="padding:18px;display:grid;gap:12px;max-height:88vh;overflow:auto">
        <div class="spread"><b style="font-size:17px">❤️ 심박 존 가이드</b><button type="button" class="link" data-zc="x" style="font-size:20px">✕</button></div>
        <div class="card" style="margin:0">
          <div class="eyebrow" style="margin:0 0 6px">내 최대심박</div>
          <div style="display:flex;gap:8px;align-items:center"><input id="zMax" type="number" inputmode="numeric" placeholder="예: 190" value="${M && M.measured ? M.v : ""}" style="flex:1" />
            <span>bpm</span><button type="button" class="primary" data-zc="save">계산</button></div>
          <p class="hint" style="margin:8px 0 0">${M ? (M.measured ? `최대심박 <b>${M.v}bpm</b> 기준이에요.` : `나이(${p.age}세)로 추정한 <b>${M.v}bpm</b> 기준이에요 (208 − 0.7 × 나이). 직접 재면 더 정확해요.`) : "최대심박이나 나이를 넣으면 존별 심박수를 계산해 드려요."}
            <br>모르면: 충분히 워밍업 후 3분 오르막 전력 달리기를 2번 — 두 번째 끝의 최고 심박이 최대심박에 가까워요. (건강에 문제가 있으면 하지 마세요)</p>
          ${M ? `<div class="ztable">${Z.map((x) => `<div style="border-left:6px solid ${x.color}"><b>Z${x.z} ${x.name}</b><span>${x.pct[0]}–${x.pct[1]}%</span><b>${bpm(x.z, M.v)}</b><span>RPE ${x.rpe}</span></div>`).join("")}</div>
          <div class="eyebrow" style="margin:12px 0 6px">지금 심박은 몇 존?</div>
          <div style="display:flex;gap:8px;align-items:center"><input id="zNow" type="number" inputmode="numeric" placeholder="운동 중 심박 예: 150" style="flex:1" /><span>bpm</span></div>
          <p id="zNowOut" class="hint" style="margin:6px 0 0">시계에 보이는 심박을 넣으면 어느 존인지 알려드려요.</p>` : ""}
        </div>
        ${Z.map((x) => `<details class="zcard" ${open === x.z || !open ? "open" : ""} style="border-left:6px solid ${x.color}">
          <summary><b>Z${x.z} · ${x.name}</b> <span class="hint">최대심박 ${x.pct[0]}–${x.pct[1]}%${M ? ` · ${bpm(x.z, M.v)}` : ""} · RPE ${x.rpe}</span></summary>
          <p style="margin:8px 0 4px"><b>느낌</b> — ${x.feel} (${x.talk})</p>
          <p style="margin:8px 0 4px"><b>이 존에서 좋아지는 것</b></p>
          <ul style="margin:0;padding-left:18px;line-height:1.7">${x.good.map((g) => `<li>${g}</li>`).join("")}</ul>
          <p style="margin:8px 0 0"><b>언제 하나요</b> — ${x.when}</p></details>`).join("")}
        <p class="hint" style="margin:0">운동자각도(RPE): 1 = 거의 안 힘듦, 10 = 최대로 힘듦. 심박은 더위·탈수·피로·카페인에 따라 5~10bpm 오르내려요. 심박과 느낌이 다르면 느낌(RPE)을 우선하세요.</p>
      </div>`;
      d.querySelector('[data-zc="x"]').onclick = () => d.close();
      const now = d.querySelector("#zNow");
      if (now) now.oninput = () => {
        const h = +now.value, out = d.querySelector("#zNowOut");
        if (!(h >= 40 && h <= 240) || !M) { out.textContent = "시계에 보이는 심박을 넣으면 어느 존인지 알려드려요."; return; }
        const pc = (h / M.v) * 100;
        const x = pc < 50 ? null : Z.find((q) => pc < q.pct[1]) || Z[4];
        out.innerHTML = x ? `<b style="color:${x.color === "#eab308" ? "#a16207" : x.color}">Z${x.z} ${x.name}</b> — 최대심박의 ${Math.round(pc)}% · RPE ${x.rpe}. ${x.good[0]}`
          : `최대심박의 ${Math.round(pc)}% — Z1보다 낮은 휴식 수준이에요.`;
      };
      d.querySelector('[data-zc="save"]').onclick = async () => {
        const v = +d.querySelector("#zMax").value;
        if (!(v >= 120 && v <= 230)) { d.querySelector("#zMax").focus(); return; }
        try { localStorage.setItem(KEY, String(v)); } catch (e) { /* 무시 */ }
        if (window.TS && TS.updateProfile) await TS.updateProfile({ maxHr: String(v) });
        draw(open);
        window.dispatchEvent(new Event("ts:sessions")); // 홈 카드 bpm 다시 그리기
      };
    };
    draw(focus);
    if (!d.open) d.showModal();
  }
  // 어디서든 data-zguide 버튼을 누르면 가이드 열기
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-zguide]");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const dv = b.closest("dialog"); if (dv && dv.id !== "zoneDlg" && dv.open) dv.close();
    openGuide(+b.dataset.zguide || 0);
  }, true);

  // 훈련 하나의 강도 구성 막대: "고강도 10% 2.5km · 저강도 90% 22.5km"
  function mixBar(txt, label) {
    const m = /고강도 (\d+)% (.+?) · 저강도 (\d+)% (.+)$/.exec(txt || "");
    if (!m) return "";
    const hi = +m[1], lo = +m[3];
    const e = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    return `<div class="mix"><div class="mix-h">${e(label || "오늘 강도 구성")} <span class="hint">(거리 기준)</span></div>
      <div class="mix-bar"><i class="lo" style="width:${lo}%"></i><i class="hi" style="width:${hi}%"></i></div>
      <div class="mix-leg"><span><i class="lo"></i>저강도 <b>${lo}%</b> · <b>${e(m[4])}</b></span><span><i class="hi"></i>고강도 <b>${hi}%</b> · <b>${e(m[2])}</b></span></div></div>`;
  }

  window.ZONE = { list: Z, colors, maxHr, bpm, zoneOfSession, guideLine, legend, openGuide, mixBar };
})();
