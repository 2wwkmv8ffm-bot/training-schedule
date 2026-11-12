// 뒤로 가기: 화면 왼쪽 위 '‹ 뒤로' 버튼(스크롤하면 나타남) + 휴대폰 뒤로 제스처/버튼
// 전체 화면(계획·설정·활동 상세·로그인·기록)을 열면 기록해 두고, 뒤로 하면 닫아요. 탭은 이전 탭으로 돌아가요.
(function () {
  const TS = window.TS;
  const $ = (id) => document.getElementById(id);
  const OVS = ["wizard", "planOv", "detailOv", "trackerOv", "authOv"];
  const CLOSE_BTN = { planOv: "planClose", detailOv: "dBack", wizard: "wzClose", authOv: "auClose" };
  const stack = [];
  let ignore = 0;

  try { history.replaceState({ tab: "home" }, ""); } catch (e) { /* 무시 */ }

  function plainClose(id) { $(id).classList.remove("show"); document.body.style.overflow = ""; }
  function closeOv(id) {
    if (id === "trackerOv") { // 기록 중이면 기록은 계속하고 화면만 닫기
      if (TS.isRecording && TS.isRecording()) plainClose(id);
      else if ($("tkClose")) $("tkClose").click();
      else plainClose(id);
      return;
    }
    if (id === "wizard" && !(TS.getProfile && TS.getProfile())) { // 처음 설정은 끝내야 해요
      stack.push(id);
      try { history.pushState({ ov: id }, ""); } catch (e) { /* 무시 */ }
      return;
    }
    const b = CLOSE_BTN[id] && $(CLOSE_BTN[id]);
    if (b && b.offsetParent !== null) b.click(); else plainClose(id);
  }

  // 전체 화면이 열리고 닫히는 걸 지켜보기
  const obs = new MutationObserver((ms) => ms.forEach((m) => {
    const el = m.target, open = el.classList.contains("show"), i = stack.indexOf(el.id);
    if (open && i < 0) {
      stack.push(el.id);
      try { history.pushState({ ov: el.id }, ""); } catch (e) { /* 무시 */ }
    } else if (!open && i >= 0) {
      stack.splice(i, 1);
      if (history.state && history.state.ov === el.id) { ignore++; history.back(); }
    }
    updateFab();
  }));
  OVS.forEach((id) => { if ($(id)) obs.observe($(id), { attributes: true, attributeFilter: ["class"] }); });

  window.addEventListener("popstate", (e) => {
    if (ignore) { ignore--; return; }
    const dlg = document.querySelector("dialog[open]");
    if (dlg) { // 작은 창이 열려 있으면 그것만 닫고 제자리
      dlg.close();
      try { history.pushState(stack.length ? { ov: stack[stack.length - 1] } : { tab: TS.currentTab ? TS.currentTab() : "home" }, ""); } catch (x) { /* 무시 */ }
      return;
    }
    if (stack.length) { closeOv(stack.pop()); updateFab(); return; }
    const t = (e.state && e.state.tab) || "home";
    if (TS.showTab) TS.showTab(t, { fromPop: true });
    updateFab();
  });

  // ---------- '‹ 뒤로' 버튼 ----------
  const fab = document.createElement("button");
  fab.type = "button";
  fab.className = "back-fab";
  fab.setAttribute("aria-label", "뒤로");
  fab.innerHTML = "‹ 뒤로";
  document.body.appendChild(fab);
  fab.onclick = () => {
    if (stack.length) { history.back(); return; }
    if (TS.currentTab && TS.currentTab() !== "home") { history.back(); return; }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  function scroller() { const id = stack[stack.length - 1]; return id ? $(id) : null; }
  function updateFab() {
    const sc = scroller();
    const y = sc ? sc.scrollTop : window.scrollY;
    const onHome = !stack.length && (!TS.currentTab || TS.currentTab() === "home");
    fab.innerHTML = onHome ? "↑ 맨 위로" : "‹ 뒤로";
    fab.classList.toggle("show", y > 150);
  }
  window.addEventListener("scroll", updateFab, { passive: true });
  OVS.forEach((id) => { if ($(id)) $(id).addEventListener("scroll", updateFab, { passive: true }); });
  TS.nav = { updateFab };
})();
