// 📝 훈련 일지: 몸 상태(컨디션·수면·피로·근육통) + 운동 기록 + 일기 — 하루에 한 장, 달력·홈에서 바로 쓰고 봐요
// 로그인하면 서버(journal 표)에 저장하고, 표가 아직 없거나 로그아웃 상태면 이 기기에 저장해요 (나중에 자동으로 올려요)
(function () {
  const TS = window.TS;
  const { db } = TS;
  const esc = (s) => TS.escapeHtml(s == null ? "" : String(s));
  const $ = (id) => document.getElementById(id);
  const LS = "training.journal";
  const COND = ["", "😫", "😕", "🙂", "😀", "🤩"];
  const COND_T = ["", "아주 나쁨", "별로", "보통", "좋음", "최고"];
  const FAT_T = ["", "거뜬해요", "조금", "보통", "많이", "녹초"];
  const SORE = ["없음", "종아리", "허벅지 앞", "허벅지 뒤", "무릎", "엉덩이", "허리", "발·발목", "어깨", "목"];
  const FIELDS = ["condition", "sleep", "fatigue", "soreness", "rhr", "weight", "rpe", "workout", "body", "good", "next"];
  let map = (() => { try { return JSON.parse(localStorage.getItem(LS) || "{}"); } catch (e) { return {}; } })();
  let server = null; // null = 아직 모름, true = journal 표 있음, false = 없음
  const keep = () => { try { localStorage.setItem(LS, JSON.stringify(map)); } catch (e) { /* 저장 공간 부족 등 */ } };
  const uid = () => TS.auth && TS.auth.user && TS.auth.user.id;
  const iso = TS.iso;
  const emit = () => window.dispatchEvent(new Event("ts:journal"));

  // ---------- 저장소 ----------
  async function sync() {
    if (!uid()) { // 로그아웃: 계정에 저장된 일지는 이 기기에서 지우고, 아직 안 올린 것만 남겨요
      const left = {}; Object.entries(map).forEach(([d, e]) => { if (!e.synced) left[d] = e; });
      map = left; keep(); emit(); return;
    }
    const from = iso(TS.addDays(new Date(), -400));
    const { data, error } = await db.from("journal").select("*").eq("user_id", uid()).gte("date", from);
    if (error) { server = false; return; }
    server = true;
    const fromServer = {};
    (data || []).forEach((r) => { fromServer[r.date] = pick(r); fromServer[r.date].synced = true; });
    // 이 기기에만 있던 일지는 서버로 올려요
    const pending = Object.entries(map).filter(([d, e]) => !e.synced && !fromServer[d]);
    for (const [d, e] of pending) { const ok = await push(d, e); if (ok) fromServer[d] = { ...e, synced: true }; else fromServer[d] = e; }
    map = fromServer; keep(); emit();
  }
  const pick = (r) => { const o = {}; FIELDS.forEach((k) => { if (r[k] != null && r[k] !== "") o[k] = r[k]; }); return o; };
  async function push(date, e) {
    if (!uid() || server === false) return false;
    const { error } = await db.from("journal").upsert({ user_id: uid(), date, ...pick(e), updated_at: new Date().toISOString() }, { onConflict: "user_id,date" });
    if (error) { if (/journal|relation|schema cache/i.test(error.message)) server = false; return false; }
    return true;
  }
  async function save(date, e) {
    const clean = pick(e);
    if (!Object.keys(clean).length) return remove(date);
    map[date] = { ...clean, synced: false };
    keep(); emit();
    if (await push(date, clean)) { map[date].synced = true; keep(); }
  }
  async function remove(date) {
    delete map[date]; keep(); emit();
    if (uid() && server !== false) await db.from("journal").delete().eq("user_id", uid()).eq("date", date);
  }
  const get = (date) => map[date] || null;

  // ---------- 오늘 몸 상태 점수 (컨디션·수면·피로·근육통) ----------
  function readiness(e) {
    if (!e || !e.condition) return null;
    let s = (e.condition - 1) * 15 + 40; // 40~100
    if (e.sleep) s += e.sleep >= 8 ? 5 : e.sleep >= 7 ? 0 : e.sleep >= 6 ? -8 : -18;
    if (e.fatigue) s -= (e.fatigue - 2) * 8;
    const sore = (e.soreness || []).filter((x) => x !== "없음").length;
    s -= Math.min(15, sore * 5);
    s = Math.max(0, Math.min(100, Math.round(s)));
    const lv = s >= 70 ? ["good", "🟢", "계획대로 훈련해도 좋아요"] : s >= 50 ? ["mid", "🟡", "강한 훈련은 반복 수를 줄이거나 쉬운 대안으로"] : ["low", "🔴", "오늘은 쉬운 운동이나 휴식을 추천해요"];
    return { score: s, key: lv[0], dot: lv[1], tip: lv[2] };
  }

  // ---------- 그날 훈련·운동 기록 요약 ----------
  async function dayTraining(date) {
    const ss = (TS.getSessions ? TS.getSessions() : []).filter((s) => s.date === date);
    let acts = [];
    try { acts = (await TS.listActivities()).filter((a) => a.started_at && iso(new Date(a.started_at)) === date); } catch (e) { acts = []; }
    return { ss, acts };
  }
  const actLine = (a) => {
    const sp = (TS.ACT_SPORTS || {})[a.sport] || {};
    const d = a.sport === "swim" ? `${Math.round(a.distance_m || 0)}m` : `${((a.distance_m || 0) / 1000).toFixed(2)}km`;
    return `${sp.icon || "🏅"} ${a.title || sp.name || "운동"} · ${d} · ${TS.fmtDur(a.duration_s || 0)}${a.avg_hr ? ` · 심박 ${a.avg_hr}` : ""}`;
  };

  // ---------- 쓰기 화면 ----------
  async function open(date) {
    date = date || iso(new Date());
    let d = $("jnDlg");
    if (!d) { d = document.createElement("dialog"); d.id = "jnDlg"; d.className = "sheet-dlg"; document.body.appendChild(d); }
    const e = { soreness: [], ...(get(date) || {}) };
    const { ss, acts } = await dayTraining(date);
    const dt = new Date(date + "T00:00:00");
    const chips = (k, vals, labels) => vals.map((v, i) => `<button type="button" class="chip${String(e[k]) === String(v) ? " on" : ""}" data-set="${k}" data-v="${v}">${labels ? labels[i] : v}</button>`).join("");
    function draw() {
      const R = readiness(e);
      d.innerHTML = `<div class="jn" style="padding:16px;max-height:90vh;overflow:auto;display:grid;gap:12px">
        <div class="spread"><button type="button" class="jn-btn" data-nav="-1" aria-label="이전 날">‹</button>
          <b style="font-size:16px;flex:1;text-align:center;min-width:0">📝 ${dt.getMonth() + 1}월 ${dt.getDate()}일 (${"일월화수목금토"[dt.getDay()]}) 일지</b>
          <span style="display:flex;gap:6px;flex:none"><button type="button" class="jn-btn" data-nav="1" aria-label="다음 날">›</button> <button type="button" class="jn-btn" data-x="1" aria-label="닫기">✕</button></span></div>
        <section><div class="eyebrow">💪 오늘 몸 상태</div>
          <div class="jn-cond">${[1, 2, 3, 4, 5].map((v) => `<button type="button" class="${e.condition === v ? "on" : ""}" data-set="condition" data-v="${v}"><span>${COND[v]}</span><small>${COND_T[v]}</small></button>`).join("")}</div>
          <div class="jn-row"><span>😴 잠</span><div class="chips">${chips("sleep", [5, 6, 7, 8, 9], ["5시간↓", "6시간", "7시간", "8시간", "9시간↑"])}</div></div>
          <div class="jn-row"><span>🔋 피로</span><div class="chips">${chips("fatigue", [1, 2, 3, 4, 5], FAT_T.slice(1))}</div></div>
          <div class="jn-row"><span>🩹 근육통</span><div class="chips">${SORE.map((x) => `<button type="button" class="chip${(e.soreness || []).includes(x) ? " on" : ""}" data-sore="${x}">${x}</button>`).join("")}</div></div>
          <div class="fields" style="grid-template-columns:1fr 1fr;margin-top:6px"><label>안정시 심박<input inputmode="numeric" data-f="rhr" value="${esc(e.rhr || "")}" placeholder="예: 52" /></label>
            <label>몸무게(kg)<input inputmode="decimal" data-f="weight" value="${esc(e.weight || "")}" placeholder="예: 68.5" /></label></div>
          ${R ? `<div class="jn-ready ${R.key}">${R.dot} 몸 상태 점수 <b>${R.score}</b> — ${R.tip}</div>` : ""}</section>
        <section><div class="eyebrow">🏃 운동 기록</div>
          ${ss.length || acts.length ? `<div class="jn-acts">${ss.map((s) => `<div>${s.completed ? "✅" : "▫️"} ${esc(s.title)}${s.duration_min ? ` <span class="hint">${s.duration_min}분</span>` : ""}</div>`).join("")}${acts.map((a) => `<div>⌚ ${esc(actLine(a))}</div>`).join("")}</div>` : '<p class="hint" style="margin:0 0 6px">이날 달력 훈련·운동 기록이 없어요. 아래에 직접 적어도 돼요.</p>'}
          <textarea data-f="workout" rows="3" maxlength="1000" placeholder="무엇을 얼마나 했는지, 페이스·느낌 (예: 인터벌 1km×6, 마지막 2개 힘들었음)">${esc(e.workout || "")}</textarea>
          <div class="jn-row"><span>🔥 힘든 정도</span><input type="range" min="1" max="10" data-f="rpe" value="${e.rpe || 5}" style="flex:1" /><b id="jnRpe">${e.rpe ? e.rpe + "/10" : "-"}</b></div></section>
        <section><div class="eyebrow">📔 일기</div>
          <textarea data-f="body" rows="4" maxlength="3000" placeholder="오늘 하루, 운동하며 든 생각, 식사·스트레스 등 자유롭게">${esc(e.body || "")}</textarea>
          <div class="fields" style="grid-template-columns:1fr;margin-top:6px"><label>👍 잘한 점<input data-f="good" maxlength="200" value="${esc(e.good || "")}" placeholder="예: 쉬운 날을 정말 쉽게 뛰었다" /></label>
            <label>🎯 다음엔<input data-f="next" maxlength="200" value="${esc(e.next || "")}" placeholder="예: 인터벌 전에 워밍업 더 길게" /></label></div></section>
        <p class="hint" style="margin:0">${uid() ? (server === false ? "서버 준비 전이라 이 기기에 저장돼요. 준비되면 자동으로 올라가요." : "내 계정에 저장돼요 · 나만 볼 수 있어요") : "로그인 전이라 이 기기에 저장돼요. 로그인하면 계정으로 옮겨져요."}</p>
        <div class="spread">${get(date) ? '<button type="button" class="link" data-del="1" style="color:#dc2626">일지 지우기</button>' : "<span></span>"}
          <button type="button" class="primary" data-save="1" style="padding:12px 26px">저장</button></div></div>`;
    }
    d.oninput = (ev) => {
      const f = ev.target.dataset.f;
      if (!f) return;
      e[f] = f === "rpe" || f === "rhr" ? +ev.target.value : f === "weight" ? ev.target.value.replace(/[^\d.]/g, "") : ev.target.value;
      if (f === "rpe") $("jnRpe").textContent = `${e.rpe}/10`;
    };
    d.onclick = async (ev) => {
      if (ev.target === d) { d.close(); return; }
      const b = ev.target.closest("button");
      if (!b) return;
      const k = b.dataset;
      if (k.x) { d.close(); return; }
      if (k.nav) { await save(date, e); open(iso(TS.addDays(dt, +k.nav))); return; }
      if (k.set) { const v = +k.v; e[k.set] = e[k.set] === v ? undefined : v; }
      else if (k.sore) {
        const s = new Set(e.soreness || []);
        if (k.sore === "없음") { s.clear(); s.add("없음"); } else { s.delete("없음"); if (s.has(k.sore)) s.delete(k.sore); else s.add(k.sore); }
        e.soreness = [...s];
      } else if (k.save) { await save(date, e); d.close(); toast("📝 일지를 저장했어요"); return; }
      else if (k.del) { if (await TS.ask("이날 일지를 지울까요?", "삭제")) { await remove(date); d.close(); } return; }
      else return;
      const y = d.firstElementChild.scrollTop; draw(); d.firstElementChild.scrollTop = y;
    };
    draw();
    if (!d.open) d.showModal();
  }
  function toast(msg) { const el = document.createElement("div"); el.className = "toast"; el.textContent = msg; document.body.appendChild(el); setTimeout(() => el.remove(), 2600); }

  // ---------- 홈·달력에 붙는 작은 카드 ----------
  function summary(e) {
    const bits = [];
    if (e.condition) bits.push(`${COND[e.condition]} ${COND_T[e.condition]}`);
    if (e.sleep) bits.push(`😴 ${e.sleep >= 9 ? "9시간↑" : e.sleep <= 5 ? "5시간↓" : e.sleep + "시간"}`);
    if (e.fatigue) bits.push(`🔋 피로 ${FAT_T[e.fatigue]}`);
    if ((e.soreness || []).length && !(e.soreness.length === 1 && e.soreness[0] === "없음")) bits.push(`🩹 ${e.soreness.join("·")}`);
    if (e.rpe) bits.push(`🔥 ${e.rpe}/10`);
    return bits.join(" · ");
  }
  function dayCard(date, home) {
    const e = get(date), R = readiness(e), isToday = date === iso(new Date());
    if (!e) return `<div class="card jn-card"><div class="spread"><div class="eyebrow" style="margin:0">📝 ${isToday ? "오늘" : "이날"} 일지</div><button type="button" class="pill" data-jn="${date}">쓰기</button></div>
      ${home && isToday ? `<p class="hint" style="margin:6px 0 4px">오늘 몸 상태는 어때요? 누르면 바로 기록돼요</p><div class="jn-quick">${[1, 2, 3, 4, 5].map((v) => `<button type="button" data-jq="${v}" data-jd="${date}">${COND[v]}<small>${COND_T[v]}</small></button>`).join("")}</div>`
        : `<p class="hint" style="margin:6px 0 0">컨디션·수면·운동 느낌·일기를 남기면 달력에 📝로 표시돼요.</p>`}</div>`;
    return `<div class="card jn-card"><div class="spread"><div class="eyebrow" style="margin:0">📝 ${isToday ? "오늘" : "이날"} 일지</div><button type="button" class="link" data-jn="${date}">수정 ›</button></div>
      <div style="font-size:14px;margin-top:6px">${esc(summary(e)) || '<span class="hint">몸 상태 미입력</span>'}</div>
      ${R ? `<div class="jn-ready ${R.key}" style="margin-top:6px">${R.dot} 몸 상태 점수 <b>${R.score}</b> — ${R.tip}</div>` : ""}
      ${e.workout ? `<div class="jn-txt">🏃 ${esc(e.workout)}</div>` : ""}${e.body ? `<div class="jn-txt">📔 ${esc(e.body.length > 140 ? e.body.slice(0, 140) + "…" : e.body)}</div>` : ""}</div>`;
  }
  function bind(root) {
    if (!root) return;
    root.querySelectorAll("[data-jn]").forEach((b) => { b.onclick = (ev) => { ev.stopPropagation(); open(b.dataset.jn); }; });
    root.querySelectorAll("[data-jq]").forEach((b) => { b.onclick = async () => { await save(b.dataset.jd, { ...(get(b.dataset.jd) || {}), condition: +b.dataset.jq }); open(b.dataset.jd); }; });
  }
  // 달력 칸 표시: 컨디션 이모지 (없으면 📝)
  const mark = (date) => { const e = get(date); return e ? (e.condition ? COND[e.condition] : "📝") : ""; };

  // ---------- 모아보기 (최근 30일 흐름 + 목록) ----------
  function openList() {
    let d = $("jnList");
    if (!d) { d = document.createElement("dialog"); d.id = "jnList"; d.className = "sheet-dlg"; document.body.appendChild(d); d.onclick = (ev) => { if (ev.target === d) d.close(); }; }
    const days = Array.from({ length: 30 }, (_, i) => iso(TS.addDays(new Date(), i - 29)));
    const es = days.map((x) => get(x));
    const avg = (k) => { const v = es.filter((e) => e && e[k]).map((e) => +e[k]); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length) : null; };
    const all = Object.keys(map).sort().reverse();
    const sc = (i) => { const R = readiness(es[i]); return R ? R.score : null; };
    d.innerHTML = `<div style="padding:16px;max-height:90vh;overflow:auto;display:grid;gap:12px">
      <div class="spread"><b style="font-size:17px">📝 훈련 일지</b><span><button type="button" class="primary pill" data-jn="${iso(new Date())}">오늘 쓰기</button> <button type="button" class="link" data-x="1" style="font-size:20px">✕</button></span></div>
      <div class="card" style="margin:0"><div class="eyebrow">최근 30일 몸 상태</div>
        <div class="jn-trend">${days.map((x, i) => { const s = sc(i); return `<i title="${x} ${s == null ? "" : s}" style="height:${s == null ? 4 : Math.max(8, s)}%;background:${s == null ? "var(--line)" : s >= 70 ? "#22c55e" : s >= 50 ? "#eab308" : "#ef4444"}"></i>`; }).join("")}</div>
        <div class="hint" style="display:flex;gap:12px;flex-wrap:wrap;margin-top:6px"><span>쓴 날 <b>${es.filter(Boolean).length}</b>/30</span>${avg("sleep") ? `<span>평균 잠 <b>${avg("sleep").toFixed(1)}시간</b></span>` : ""}${avg("condition") ? `<span>평균 컨디션 <b>${COND[Math.round(avg("condition"))]}</b></span>` : ""}${avg("rhr") ? `<span>평균 안정시 심박 <b>${Math.round(avg("rhr"))}</b></span>` : ""}</div>
        <p class="hint" style="margin:6px 0 0">안정시 심박이 평소보다 5 이상 높거나, 빨간 날이 이어지면 피로가 쌓인 신호예요 — 쉬운 주로 바꿔 보세요.</p></div>
      ${all.length ? all.slice(0, 60).map((x) => { const e = map[x], dt = new Date(x + "T00:00:00"); return `<button type="button" class="jn-item" data-jn="${x}"><b>${dt.getMonth() + 1}/${dt.getDate()} (${"일월화수목금토"[dt.getDay()]})</b> <span>${esc(summary(e))}</span>${e.body || e.workout ? `<span class="hint">${esc((e.workout || e.body).slice(0, 60))}</span>` : ""}</button>`; }).join("")
        : '<p class="hint" style="text-align:center">아직 쓴 일지가 없어요. 홈이나 달력에서 날짜를 눌러 써 보세요.</p>'}</div>`;
    d.querySelector("[data-x]").onclick = () => d.close();
    d.querySelectorAll("[data-jn]").forEach((b) => { b.onclick = () => { d.close(); open(b.dataset.jn); }; });
    if (!d.open) d.showModal();
  }

  TS.journal = { get, save, remove, open, openList, dayCard, bind, mark, readiness, summary, all: () => map };
  window.addEventListener("ts:auth", () => { server = null; sync(); });
  sync();
})();
