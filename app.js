(function () {
  const TABLE = "training_sessions";
  const DAYS = ["월", "화", "수", "목", "금", "토", "일"];
  const COLORS = {
    러닝: "#2563eb", 수영: "#0891b2", 근력: "#dc2626", 사이클: "#d97706",
    유연성: "#7c3aed", 구기: "#16a34a", 휴식: "#9ca3af", 기타: "#64748b",
    브릭: "#db2777",
  };
  // 종목별로 고를 수 있는 훈련 종류 (첫 번째가 기본값)
  const SPORTS = {
    수영:    { icon: "🏊", desc: "수영 중심 훈련",       cats: ["수영", "근력", "유연성", "휴식", "기타"] },
    자전거:  { icon: "🚴", desc: "사이클 중심 훈련",     cats: ["사이클", "근력", "유연성", "휴식", "기타"] },
    육상:    { icon: "🏃", desc: "러닝·트랙 중심 훈련",  cats: ["러닝", "근력", "유연성", "휴식", "기타"] },
    철인3종: { icon: "🏅", desc: "수영 + 자전거 + 러닝", cats: ["수영", "사이클", "러닝", "브릭", "근력", "유연성", "휴식", "기타"] },
  };
  const $ = (id) => document.getElementById(id);
  const cfg = window.SUPABASE_CONFIG;
  const db = window.supabase.createClient(cfg.url, cfg.publishableKey);

  // 로그인한 사람 (auth.js가 정해줌) — 훈련 일정·활동을 사람별로 나눠요
  const session = { user: null, scoped: false, probed: false };
  async function probeScope() { // schema_community.sql을 실행해 user_id 칸이 있는지
    if (session.probed) return;
    session.probed = true;
    const { error } = await db.from(TABLE).select("user_id").limit(1);
    session.scoped = !error;
  }
  function mine(q) {
    if (!session.scoped) return q;
    return session.user ? q.eq("user_id", session.user.id) : q.is("user_id", null);
  }

  let weekStart = mondayOf(new Date());
  let sessions = [];
  let editingId = null;
  let sport = null; // profile.js 가 프로필을 읽고 정해줌

  function sportCats() {
    return sport ? SPORTS[sport].cats : Object.keys(COLORS);
  }

  // ---------- 날짜 유틸 ----------
  function mondayOf(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = (x.getDay() + 6) % 7; // 월=0
    x.setDate(x.getDate() - diff);
    return x;
  }
  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }
  function iso(d) {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }
  function label(d) {
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  // ---------- 상태 표시 ----------
  function setStatus(ok, text) {
    $("dot").className = "dot " + (ok ? "ok" : "err");
    $("statusText").textContent = text;
  }
  function showBanner(html) {
    $("banner").innerHTML = html;
    $("banner").classList.toggle("show", !!html);
  }
  function explainError(err) {
    const msg = (err && err.message) || String(err);
    if (err && (err.code === "42P01" || err.code === "PGRST205" || /does not exist|schema cache/i.test(msg))) {
      return "Supabase에 <code>training_sessions</code> 테이블이 아직 없습니다. " +
        "Supabase 대시보드 → <b>SQL Editor</b>에서 이 폴더의 <code>schema.sql</code> 내용을 실행한 뒤 새로고침하세요.";
    }
    if (err && err.code === "42501") {
      return "권한이 없습니다(RLS). <code>schema.sql</code>의 정책 부분을 실행했는지 확인하세요.";
    }
    return "Supabase 오류: " + escapeHtml(msg);
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- 주간 / 월간(캘린더) 보기 ----------
  const VIEW_KEY = "training.planView";
  let view = (() => { try { return localStorage.getItem(VIEW_KEY) === "month" ? "month" : "week"; } catch (e) { return "week"; } })();
  let monthCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let selDay = null;
  function monthGrid() {
    const y = monthCursor.getFullYear(), m = monthCursor.getMonth();
    const start = mondayOf(monthCursor);
    const end = addDays(mondayOf(new Date(y, m + 1, 0)), 6);
    return { y, m, start, end };
  }
  function setView(v) {
    view = v;
    try { localStorage.setItem(VIEW_KEY, v); } catch (e) { /* 무시 */ }
    if (v === "month") monthCursor = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1);
    else if (selDay) weekStart = mondayOf(new Date(selDay + "T00:00:00"));
    load();
  }
  document.querySelectorAll("#viewSeg [data-view]").forEach((b) => { b.onclick = () => setView(b.dataset.view); });

  // ---------- 데이터 ----------
  async function load() {
    const g = view === "month" ? monthGrid() : null;
    const from = iso(g ? g.start : weekStart);
    const to = iso(g ? g.end : addDays(weekStart, 6));
    await probeScope();
    const { data, error } = await mine(db
      .from(TABLE)
      .select("*"))
      .gte("date", from)
      .lte("date", to)
      .order("date")
      .order("start_time", { nullsFirst: true });
    if (error) {
      setStatus(false, "연결 오류");
      showBanner(explainError(error));
      sessions = [];
    } else {
      setStatus(true, "Supabase 연결됨");
      showBanner("");
      sessions = data;
    }
    render();
    window.dispatchEvent(new Event("ts:sessions"));
  }

  async function save(row) {
    const q = editingId
      ? db.from(TABLE).update(row).eq("id", editingId)
      : db.from(TABLE).insert(row);
    const { error } = await q;
    if (error) { alert(explainError(error).replace(/<[^>]+>/g, "")); return false; }
    return true;
  }

  async function remove(id) {
    const { error } = await db.from(TABLE).delete().eq("id", id);
    if (error) { alert(explainError(error).replace(/<[^>]+>/g, "")); return false; }
    return true;
  }

  async function toggleDone(s) {
    const { error } = await db.from(TABLE).update({ completed: !s.completed }).eq("id", s.id);
    if (error) alert(explainError(error).replace(/<[^>]+>/g, ""));
    load();
  }

  // ---------- 화면 ----------
  function render() {
    document.querySelectorAll("#viewSeg [data-view]").forEach((b) => b.classList.toggle("on", b.dataset.view === view));
    if (view === "month") { renderMonth(); return; }
    const end = addDays(weekStart, 6);
    $("range").textContent = `${weekStart.getFullYear()}. ${label(weekStart)} – ${label(end)}`;

    const todayIso = iso(new Date());
    const cats = sportCats();
    const visible = sessions.filter((s) => cats.includes(s.category));
    const week = $("week");
    week.className = "week";
    week.innerHTML = "";

    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      const dIso = iso(d);
      const col = document.createElement("section");
      col.className = "day" + (dIso === todayIso ? " today" : "");
      const cls = i === 6 ? "sun" : i === 5 ? "sat" : "";
      col.innerHTML = `<div class="day-head"><span class="${cls}">${DAYS[i]} ${label(d)}</span><button title="이 날에 추가">+</button></div><div class="items"></div>`;
      col.querySelector("button").onclick = () => openForm(null, dIso);

      const list = col.querySelector(".items");
      const items = visible.filter((s) => s.date === dIso);
      if (!items.length) list.innerHTML = `<div class="empty">일정 없음</div>`;
      for (const s of items) list.appendChild(itemEl(s));
      week.appendChild(col);
    }

    const done = visible.filter((s) => s.completed);
    $("sCount").nextElementSibling.textContent = "이번 주 훈련";
    $("sCount").textContent = visible.length;
    $("sDone").textContent = done.length;
    $("sMin").textContent = visible.reduce((a, s) => a + (s.duration_min || 0), 0) + "분";
  }

  // 월간 캘린더: 한 달을 칸으로, 날짜를 누르면 아래에 그날 훈련이 보여요
  // 강도(존) 색: Z1 파랑 · Z2 초록 · Z3 노랑 · Z4 주황 · Z5 빨강
  const ZCOL = window.ZONE ? window.ZONE.colors : ["#60a5fa", "#22c55e", "#eab308", "#f97316", "#ef4444"];
  const zoneOf = (s) => (window.ZONE ? window.ZONE.zoneOfSession(s) : null);
  function renderMonth() {
    const { y, m, start, end } = monthGrid();
    $("range").textContent = `${y}년 ${m + 1}월`;
    const todayIso = iso(new Date());
    const cats = sportCats();
    const visible = sessions.filter((s) => cats.includes(s.category));
    if (!selDay || selDay.slice(0, 7) !== `${y}-${String(m + 1).padStart(2, "0")}`) {
      selDay = todayIso.slice(0, 7) === `${y}-${String(m + 1).padStart(2, "0")}` ? todayIso : iso(monthCursor);
    }
    const week = $("week");
    week.className = "mcal-wrap";
    let cells = "";
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
      const dIso = iso(d);
      const items = visible.filter((s) => s.date === dIso);
      const wd = (d.getDay() + 6) % 7;
      cells += `<button type="button" class="mc${d.getMonth() !== m ? " out" : ""}${dIso === todayIso ? " today" : ""}${dIso === selDay ? " sel" : ""}" data-day="${dIso}">
        <span class="mn ${wd === 6 ? "sun" : wd === 5 ? "sat" : ""}">${d.getDate()}</span>
        ${items.slice(0, 3).map((s) => { const z = zoneOf(s); return `<i class="${s.completed ? "dn" : ""}" style="background:${s.completed ? "#cbd5e1" : z ? ZCOL[z - 1] : COLORS[s.category] || COLORS.기타};color:${s.completed ? "#475569" : z === 3 ? "#422006" : "#fff"}">${z ? `<b>Z${z}</b> ` : ""}${escapeHtml(s.title.replace(/^[^\wㄱ-힣]+/, "").replace(/^(달리기|자전거|수영|브릭)\s*·\s*/, ""))}</i>`; }).join("")}
        ${items.length > 3 ? `<em>+${items.length - 3}</em>` : ""}</button>`;
    }
    const dayItems = visible.filter((s) => s.date === selDay);
    const sd = new Date(selDay + "T00:00:00");
    week.innerHTML = `${window.ZONE ? window.ZONE.legend() : ""}<div class="mcal">${DAYS.map((x, i) => `<div class="mh ${i === 6 ? "sun" : i === 5 ? "sat" : ""}">${x}</div>`).join("")}${cells}</div>
      <section class="day mday"><div class="day-head"><span>${sd.getMonth() + 1}월 ${sd.getDate()}일 ${DAYS[(sd.getDay() + 6) % 7]}요일</span><button title="이 날에 추가">+</button></div><div class="items"></div></section>`;
    week.querySelectorAll(".mc").forEach((b) => { b.onclick = () => { selDay = b.dataset.day; renderMonth(); }; });
    week.querySelector(".mday .day-head button").onclick = () => openForm(null, selDay);
    const list = week.querySelector(".mday .items");
    if (!dayItems.length) list.innerHTML = `<div class="empty">일정 없음 — + 를 눌러 추가하세요</div>`;
    dayItems.forEach((s) => list.appendChild(itemEl(s)));

    const inMonth = visible.filter((s) => s.date.slice(0, 7) === `${y}-${String(m + 1).padStart(2, "0")}`);
    $("sCount").textContent = inMonth.length;
    $("sDone").textContent = inMonth.filter((s) => s.completed).length;
    const mins = inMonth.reduce((a, s) => a + (s.duration_min || 0), 0);
    $("sMin").textContent = mins >= 60 ? `${Math.floor(mins / 60)}시간${mins % 60 ? ` ${mins % 60}분` : ""}` : mins + "분";
    $("sCount").nextElementSibling.textContent = "이번 달 훈련";
  }

  function itemEl(s) {
    const el = document.createElement("div");
    el.className = "item" + (s.completed ? " done" : "");
    if (!s.completed) { const z = zoneOf(s); el.style.borderLeftColor = z ? ZCOL[z - 1] : COLORS[s.category] || COLORS.기타; }
    const distLine = (s.notes || "").split("\n").find((l) => l.startsWith("목표: 권장 거리 "));
    const meta = [
      s.start_time ? s.start_time.slice(0, 5) : null,
      s.category,
      distLine ? distLine.replace("목표: 권장 거리 ", "").replace(/(수영|자전거|달리기)\s*/g, "").replace(/\s*\(.*?\)/g, "") : null,
      s.duration_min ? s.duration_min + "분" : null,
      s.intensity ? "강도 " + s.intensity : null,
    ].filter(Boolean).join(" · ");
    el.innerHTML = `<div class="row"><input type="checkbox" ${s.completed ? "checked" : ""} title="완료 표시" />` +
      `<div><div class="t">${escapeHtml(s.title)}</div><div class="meta">${escapeHtml(meta)}</div></div></div>`;
    const cb = el.querySelector("input");
    cb.onclick = (e) => { e.stopPropagation(); toggleDone(s); };
    el.onclick = () => (TS.sessHtml ? openView(s) : openForm(s));
    return el;
  }

  // ---------- 훈련 보기 (홈처럼 깔끔하게: 거리·시간·강도·RPE → 구성 → 포인트) ----------
  function openView(s) {
    let d = document.getElementById("viewDlg");
    if (!d) { d = document.createElement("dialog"); d.id = "viewDlg"; document.body.appendChild(d); }
    if (d.open) d.close();
    const dt = new Date(s.date + "T00:00:00");
    const isToday = s.date === iso(new Date());
    const when = `${dt.getMonth() + 1}/${dt.getDate()} (${"일월화수목금토"[dt.getDay()]})${s.start_time ? " · " + s.start_time.slice(0, 5) : ""}`;
    d.innerHTML = `<div style="padding:18px 18px 16px;max-height:85vh;overflow:auto">
      <div class="spread" style="margin-bottom:4px"><span class="eyebrow" style="margin:0">${isToday ? "오늘 · " : ""}${escapeHtml(when)}</span>
        <button type="button" class="link" data-v="x" aria-label="닫기" style="font-size:20px;line-height:1">✕</button></div>
      ${TS.sessHtml(s, isToday)}
      <div class="actions" style="margin-top:14px"><span><button type="button" data-v="edit">✏️ 수정</button>
        ${TS.coach && !s.completed ? '<button type="button" data-v="ai">🧑‍🏫 컨디션 맞춤</button>' : ""}</span>
        <div class="right"><button type="button" data-v="done">${s.completed ? "완료 취소" : "✓ 완료"}</button></div></div>
    </div>`;
    d.querySelector('[data-v="x"]').onclick = () => d.close();
    d.querySelector('[data-v="edit"]').onclick = () => { d.close(); openForm(s); };
    d.querySelector('[data-v="done"]').onclick = () => { d.close(); toggleDone(s); };
    const ai = d.querySelector('[data-v="ai"]');
    if (ai) ai.onclick = () => { d.close(); TS.coach.openAdjust(s.date, s); };
    const st = d.querySelector("[data-start]");
    if (st) st.onclick = () => { d.close(); TS.startSession(s); };
    d.onclick = (e) => { if (e.target === d) d.close(); };
    d.showModal();
  }

  // ---------- 입력 폼 ----------
  function openForm(s, dateIso) {
    const f = $("form");
    f.reset();
    editingId = s ? s.id : null;
    $("formTitle").textContent = s ? "훈련 수정" : "훈련 추가";
    $("del").style.visibility = s ? "visible" : "hidden";
    f.title.value = s ? s.title : "";
    f.date.value = s ? s.date : dateIso || iso(new Date());
    f.start_time.value = s && s.start_time ? s.start_time.slice(0, 5) : "";
    const cats = sportCats().slice();
    if (s && !cats.includes(s.category)) cats.push(s.category);
    f.category.innerHTML = cats.map((c) => `<option>${escapeHtml(c)}</option>`).join("");
    f.category.value = s ? s.category : cats[0];
    f.duration_min.value = s && s.duration_min != null ? s.duration_min : "";
    f.intensity.value = s && s.intensity ? s.intensity : "";
    f.notes.value = s && s.notes ? s.notes : "";
    f.completed.checked = !!(s && s.completed);
    $("dlg").showModal();
    f.title.focus();
  }

  $("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const row = {
      title: f.title.value.trim(),
      date: f.date.value,
      start_time: f.start_time.value || null,
      category: f.category.value,
      duration_min: f.duration_min.value === "" ? null : Number(f.duration_min.value),
      intensity: f.intensity.value || null,
      notes: f.notes.value.trim() || null,
      completed: f.completed.checked,
    };
    if (!row.title || !row.date) return;
    $("save").disabled = true;
    const ok = await save(row);
    $("save").disabled = false;
    if (ok) {
      $("dlg").close();
      weekStart = mondayOf(new Date(row.date + "T00:00:00"));
      monthCursor = new Date(+row.date.slice(0, 4), +row.date.slice(5, 7) - 1, 1);
      selDay = row.date;
      load();
    }
  });

  $("del").onclick = async () => {
    if (!editingId || !await ask("이 훈련을 삭제할까요?")) return;
    if (await remove(editingId)) { $("dlg").close(); load(); }
  };
  $("cancel").onclick = () => $("dlg").close();
  $("add").onclick = () => openForm(null);
  const shiftMonth = (k) => { monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + k, 1); selDay = null; };
  $("prev").onclick = () => { if (view === "month") shiftMonth(-1); else weekStart = addDays(weekStart, -7); load(); };
  $("next").onclick = () => { if (view === "month") shiftMonth(1); else weekStart = addDays(weekStart, 7); load(); };
  $("today").onclick = () => { weekStart = mondayOf(new Date()); monthCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1); selDay = iso(new Date()); load(); };

  // ---------- 활동 기록 저장소 (Supabase, 테이블이 없으면 이 기기에 저장) ----------
  const ACT = "activities";
  const LS_ACT = "training.activities";
  const ACT_SPORTS = {
    run:  { name: "달리기", icon: "🏃", cat: "러닝" },
    bike: { name: "자전거", icon: "🚴", cat: "사이클" },
    swim: { name: "수영",   icon: "🏊", cat: "수영" },
    walk: { name: "걷기",   icon: "🚶", cat: "기타" },
    tri:  { name: "철인3종", icon: "🏅", cat: "브릭" },
  };
  // cloud: 로그인 + schema_community.sql 실행 시 Supabase에 저장 / reason: 왜 이 기기에만 저장되는지
  const store = { cloud: false, reason: "login" };
  function lsActs() { try { return JSON.parse(localStorage.getItem(LS_ACT) || "[]"); } catch (e) { return []; } }
  function lsSaveActs(a) { try { localStorage.setItem(LS_ACT, JSON.stringify(a)); } catch (e) { /* 저장 공간 없음 */ } }
  function notifyActs() { window.dispatchEvent(new Event("ts:activities")); }

  // 공개 설정 (기본: 친구만 · 출발/도착 200m 가리기)
  const PRIV_KEY = "training.privacy";
  function privacy() {
    try { return Object.assign({ visibility: "friends", hideEnds: true }, JSON.parse(localStorage.getItem(PRIV_KEY) || "{}")); }
    catch (e) { return { visibility: "friends", hideEnds: true }; }
  }
  function setPrivacy(p) { try { localStorage.setItem(PRIV_KEY, JSON.stringify(Object.assign(privacy(), p))); } catch (e) { /* 무시 */ } }
  // 출발·도착 근처 m미터를 잘라 집 위치가 드러나지 않게
  function trimRoute(route, m = 200) {
    if (!route || route.length < 3) return route;
    const cum = [0];
    for (let i = 1; i < route.length; i++) cum.push(cum[i - 1] + hav(route[i - 1][0], route[i - 1][1], route[i][0], route[i][1]));
    const tot = cum[cum.length - 1];
    if (tot < m * 3) return null;
    return route.filter((_, i) => cum[i] >= m && cum[i] <= tot - m);
  }

  const fullRoute = (a) => { const r = a.activity_routes; const x = Array.isArray(r) ? r[0] : r; return x && x.route; };
  async function listActivities() {
    const local = lsActs().map((x) => ({ ...x, local: true }));
    let cloud = [];
    if (!session.user) { store.cloud = false; store.reason = "login"; }
    else {
      const { data, error } = await db.from(ACT).select("*, activity_routes(route)").eq("user_id", session.user.id)
        .order("started_at", { ascending: false }).limit(2000);
      if (error) { store.cloud = false; store.reason = "sql"; }
      else {
        store.cloud = true;
        cloud = data.map((a) => { const full = fullRoute(a); const { activity_routes, ...rest } = a; void activity_routes; return full ? { ...rest, route: full } : rest; });
      }
    }
    const all = [...cloud, ...local];
    all.sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
    return all;
  }
  async function cloudInsert(a) {
    const u = session.user;
    const pv = privacy();
    const full = a.route && a.route.length > 1 ? a.route : null;
    const pub = full && pv.hideEnds ? trimRoute(full) : full;
    const { local, id, created_at, ...clean } = a;
    void local; void id; void created_at;
    // 스트라바 약관: 스트라바에서 받은 기록은 본인만 볼 수 있게 항상 '나만'
    const vis = a.source === "strava" ? "private" : a.visibility || pv.visibility;
    let row = { ...clean, visibility: vis, route: pub && pub.length > 1 ? pub : null, user_id: u.id };
    let { data, error } = await db.from(ACT).insert(row).select().single();
    // 아직 SQL을 안 돌려서 없는 칸(심박, external_id 등)이 있으면 그 칸만 빼고 다시 저장
    for (let i = 0; i < 6 && error && error.code === "PGRST204"; i++) {
      const m = /'([a-z_]+)' column/.exec(error.message || "");
      if (!m || !(m[1] in row)) break;
      if (/hr|device/.test(m[1])) store.missingHrCols = true;
      const { [m[1]]: _drop, ...rest } = row;
      void _drop;
      row = rest;
      ({ data, error } = await db.from(ACT).insert(row).select().single());
    }
    if (error) return { error };
    if (full) await db.from("activity_routes").insert({ activity_id: data.id, user_id: u.id, route: full });
    // 공유한 기록은 커뮤니티 글로도 올라가요 (스트라바 기록·나만 보기는 제외)
    if (vis !== "private" && a.source !== "strava") await db.from("posts").insert({ user_id: u.id, activity_id: data.id, visibility: vis, body: null });
    return { data: { ...data, route: full || data.route } };
  }
  async function addActivity(a) {
    if (session.user) {
      const { data, error } = await cloudInsert(a);
      if (!error) { store.cloud = true; notifyActs(); return data; }
      store.cloud = false; store.reason = "sql";
    }
    const row = { ...a, id: "local-" + Date.now(), created_at: new Date().toISOString(), local: true };
    const all = lsActs(); all.unshift(row); lsSaveActs(all);
    notifyActs();
    return row;
  }
  // 이 기기에만 있던 기록을 로그인한 계정으로 올리기
  async function uploadLocal() {
    if (!session.user) return { ok: 0, fail: 0 };
    let ok = 0, fail = 0;
    const left = [];
    for (const a of lsActs()) {
      const { error } = await cloudInsert(a);
      if (error) { fail++; left.push(a); } else ok++;
    }
    lsSaveActs(left);
    notifyActs();
    return { ok, fail };
  }
  async function deleteActivity(a) {
    if (a.local) lsSaveActs(lsActs().filter((x) => x.id !== a.id));
    else {
      const { error } = await db.from(ACT).delete().eq("id", a.id);
      if (error) { alert(explainError(error).replace(/<[^>]+>/g, "")); return false; }
    }
    notifyActs();
    return true;
  }
  async function setVisibility(a, v) {
    if (a.local) return false;
    if (a.source === "strava" && v !== "private") { alert("스트라바에서 가져온 기록은 스트라바 약관상 본인만 볼 수 있어요."); return false; }
    const { error } = await db.from(ACT).update({ visibility: v }).eq("id", a.id);
    if (error) { alert(explainError(error).replace(/<[^>]+>/g, "")); return false; }
    // 커뮤니티 글도 같은 공개 범위로 (없으면 새로 올리기)
    const { data: posts } = await db.from("posts").select("id").eq("activity_id", a.id);
    if (posts && posts.length) await db.from("posts").update({ visibility: v }).eq("activity_id", a.id);
    else if (v !== "private") await db.from("posts").insert({ user_id: session.user.id, activity_id: a.id, visibility: v, body: null });
    a.visibility = v;
    notifyActs();
    return true;
  }

  // ---------- 숫자 표시 ----------
  const pad = (n) => String(n).padStart(2, "0");
  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }
  function fmtPace(spk) { // 1km당 초 → 5'10"
    if (!spk || !isFinite(spk) || spk <= 0 || spk >= 3600) return "-'--\"";
    let m = Math.floor(spk / 60), s = Math.round(spk % 60);
    if (s === 60) { m += 1; s = 0; }
    return `${m}'${pad(s)}"`;
  }
  const fmtKm = (m) => ((m || 0) / 1000).toFixed(2);
  function hav(lat1, lng1, lat2, lng2) { // 두 지점 사이 거리(m)
    const R = 6371000, r = (x) => (x * Math.PI) / 180;
    const dLat = r(lat2 - lat1), dLng = r(lng2 - lng1);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // ---------- 앱 안 확인창 ----------
  // 브라우저 기본 confirm/alert 창은 일부 브라우저·앱 안 브라우저에서 막혀서(바로 '취소'로 처리됨) 앱이 직접 띄워요.
  function ask(msg, okLabel = "확인", cancelLabel = "취소") {
    return new Promise((resolve) => {
      let d = document.getElementById("askDlg");
      if (!d) { d = document.createElement("dialog"); d.id = "askDlg"; document.body.appendChild(d); }
      if (d.open) d.close();
      d.innerHTML = `<div style="padding:20px;display:grid;gap:16px"><p style="margin:0;white-space:pre-line;line-height:1.6;font-size:15px">${escapeHtml(msg)}</p>
        <div class="actions"><div class="right">${cancelLabel ? `<button type="button" data-a="0">${cancelLabel}</button>` : ""}
        <button type="button" class="primary" data-a="1">${okLabel}</button></div></div></div>`;
      const done = (v) => { d.close(); resolve(v); };
      d.querySelectorAll("[data-a]").forEach((b) => { b.onclick = () => done(b.dataset.a === "1"); });
      d.oncancel = (e) => { e.preventDefault(); done(false); };
      d.showModal();
    });
  }
  window.alert = (m) => { ask(String(m), "확인", null); };

  // 다른 파일(profile.js, tracker.js, hub.js)에서 쓰는 공용 도구
  window.TS = {
    db, SPORTS, COLORS, DAYS, TABLE, ACT_SPORTS, store,
    iso, addDays, mondayOf, escapeHtml, explainError,
    fmtDur, fmtPace, fmtKm, hav, pad,
    ask,
    listActivities, addActivity, deleteActivity, uploadLocal, setVisibility, privacy, setPrivacy, trimRoute, mine, session,
    lsLocalCount: () => lsActs().length,
    async setUser(u) { // auth.js가 로그인 상태가 바뀔 때 불러요
      session.user = u || null;
      session.probed = false;
      await load();
      notifyActs();
    },
    getWeekStart: () => weekStart,
    setWeek(d) { weekStart = mondayOf(d); monthCursor = new Date(d.getFullYear(), d.getMonth(), 1); selDay = iso(d); load(); },
    reload: load,
    setSport(name) { sport = SPORTS[name] ? name : null; render(); },
  };

  load();
})();
