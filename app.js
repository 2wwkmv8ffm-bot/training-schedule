(function () {
  const TABLE = "training_sessions";
  const DAYS = ["월", "화", "수", "목", "금", "토", "일"];
  const COLORS = {
    러닝: "#2563eb", 수영: "#0891b2", 근력: "#dc2626", 사이클: "#d97706",
    유연성: "#7c3aed", 구기: "#16a34a", 휴식: "#9ca3af", 기타: "#64748b",
  };

  const $ = (id) => document.getElementById(id);
  const cfg = window.SUPABASE_CONFIG;
  const db = window.supabase.createClient(cfg.url, cfg.publishableKey);

  let weekStart = mondayOf(new Date());
  let sessions = [];
  let editingId = null;

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

  // ---------- 데이터 ----------
  async function load() {
    const from = iso(weekStart);
    const to = iso(addDays(weekStart, 6));
    const { data, error } = await db
      .from(TABLE)
      .select("*")
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
    const end = addDays(weekStart, 6);
    $("range").textContent = `${weekStart.getFullYear()}. ${label(weekStart)} – ${label(end)}`;

    const todayIso = iso(new Date());
    const week = $("week");
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
      const items = sessions.filter((s) => s.date === dIso);
      if (!items.length) list.innerHTML = `<div class="empty">일정 없음</div>`;
      for (const s of items) list.appendChild(itemEl(s));
      week.appendChild(col);
    }

    const done = sessions.filter((s) => s.completed);
    $("sCount").textContent = sessions.length;
    $("sDone").textContent = done.length;
    $("sMin").textContent = sessions.reduce((a, s) => a + (s.duration_min || 0), 0) + "분";
  }

  function itemEl(s) {
    const el = document.createElement("div");
    el.className = "item" + (s.completed ? " done" : "");
    if (!s.completed) el.style.borderLeftColor = COLORS[s.category] || COLORS.기타;
    const meta = [
      s.start_time ? s.start_time.slice(0, 5) : null,
      s.category,
      s.duration_min ? s.duration_min + "분" : null,
      s.intensity ? "강도 " + s.intensity : null,
    ].filter(Boolean).join(" · ");
    el.innerHTML = `<div class="row"><input type="checkbox" ${s.completed ? "checked" : ""} title="완료 표시" />` +
      `<div><div class="t">${escapeHtml(s.title)}</div><div class="meta">${escapeHtml(meta)}</div></div></div>`;
    const cb = el.querySelector("input");
    cb.onclick = (e) => { e.stopPropagation(); toggleDone(s); };
    el.onclick = () => openForm(s);
    return el;
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
    f.category.value = s ? s.category : "러닝";
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
      load();
    }
  });

  $("del").onclick = async () => {
    if (!editingId || !confirm("이 훈련을 삭제할까요?")) return;
    if (await remove(editingId)) { $("dlg").close(); load(); }
  };
  $("cancel").onclick = () => $("dlg").close();
  $("add").onclick = () => openForm(null);
  $("prev").onclick = () => { weekStart = addDays(weekStart, -7); load(); };
  $("next").onclick = () => { weekStart = addDays(weekStart, 7); load(); };
  $("today").onclick = () => { weekStart = mondayOf(new Date()); load(); };

  load();
})();
