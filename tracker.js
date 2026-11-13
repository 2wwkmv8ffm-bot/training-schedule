// GPS 기록 (거리·페이스·시간 실시간 측정, km 구간 알림, 저장) + 직접 기록
(function () {
  const TS = window.TS;
  const { fmtDur, fmtPace, fmtKm, hav, iso } = TS;
  const esc = (s) => TS.escapeHtml(s == null ? "" : s);
  const $ = (id) => document.getElementById(id);
  const ov = $("trackerOv");
  const SP = TS.ACT_SPORTS;
  const VOICE_KEY = "training.voice";
  const DEMO = /[?&#]demo/.test(location.search + location.hash); // 컴퓨터에서 테스트할 때: 주소 끝에 ?demo

  const RPE_TXT = {
    1: "아주 쉬움 · Z1", 2: "쉬움 · Z1", 3: "편함 · Z2", 4: "편함 · Z2", 5: "약간 힘듦 · Z3",
    6: "약간 힘듦 · Z3", 7: "힘듦 · Z4", 8: "많이 힘듦 · Z4", 9: "거의 최대 · Z5", 10: "최대 · Z5",
  };

  let st = null;

  function fresh() {
    return {
      sport: "run", status: "ready", points: [], cum: [], dist: 0, acc: 0, lastResume: 0,
      splits: [], nextSplit: 1000, gap: false, watch: null, tick: null, lock: null, fix: null,
      sessionId: null, sessionTitle: "", sessionNote: "", startedAt: null, demoT: null, hrs: [],
    };
  }

  // ---------- 블루투스 심박 (가민 시계 '심박 전송' / 심박 벨트) ----------
  function hrBoxHtml() {
    const H = TS.HR;
    if (!H) return "";
    if (!H.supported) return `<div class="note" style="margin-top:12px">⌚ 이 브라우저는 블루투스 연결을 지원하지 않아요. 가민 심박 연결은 <b>안드로이드 크롬</b>이나 <b>PC 크롬·엣지</b>에서 돼요 (아이폰은 불가). 기록은 '활동 → 가민 가져오기'로 옮길 수 있어요.</div>`;
    if (H.status === "on") return `<div class="note" style="margin-top:12px">❤️ <b>${TS.escapeHtml(H.name)}</b> 연결됨 · ${H.bpm ? `<b>${H.bpm}bpm</b>` : "심박 기다리는 중…"} <button type="button" class="link" id="tkHrOff">연결 끊기</button></div>`;
    if (H.status === "connecting") return `<div class="note" style="margin-top:12px">❤️ 연결 중…</div>`;
    return `<div style="margin-top:12px;text-align:center"><button type="button" class="pill" id="tkHrOn">❤️ 가민 시계 심박 연결</button>
      <p class="hint" style="margin:6px 0 0">시계에서 <b>설정 → 센서 및 액세서리(또는 심박) → 심박 전송</b>을 켠 뒤 눌러 주세요.${H.error ? `<br>⚠️ ${TS.escapeHtml(H.error)}` : ""}</p></div>`;
  }
  function bindHrBox() {
    if ($("tkHrOn")) $("tkHrOn").onclick = () => TS.HR.connect().catch(() => {});
    if ($("tkHrOff")) $("tkHrOff").onclick = () => TS.HR.disconnect();
  }
  function hrLiveHtml() {
    const bpm = TS.HR && TS.HR.current();
    if (!TS.HR || TS.HR.status !== "on") return "";
    const z = bpm && TS.hrZone ? TS.hrZone(bpm, st.sport) : null;
    return `❤️ <b class="num" style="font-size:40px">${bpm || "--"}</b> <span class="hint">bpm</span>${z ? ` <span class="zb" style="background:${["#94a3b8", "#16a34a", "#ca8a04", "#ea580c", "#dc2626", "#dc2626", "#991b1b"][z.i]}">${z.z} ${z.name}</span>` : ""}`;
  }
  if (TS.HR) TS.HR.on(() => {
    if ($("tkHrBox")) { $("tkHrBox").innerHTML = hrBoxHtml(); bindHrBox(); }
    if ($("tkHr")) $("tkHr").innerHTML = hrLiveHtml();
  });
  const voiceOn = () => { try { return localStorage.getItem(VOICE_KEY) !== "off"; } catch (e) { return true; } };
  function speak(text) {
    if (!voiceOn() || !("speechSynthesis" in window)) return;
    try { const u = new SpeechSynthesisUtterance(text); u.lang = "ko-KR"; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) { /* 무시 */ }
  }
  const splitUnit = () => (st.sport === "bike" ? 5000 : 1000);
  const elapsed = () => st.acc + (st.status === "running" ? Date.now() - st.lastResume : 0);

  // ---------- 열기/닫기 ----------
  TS.openTracker = function (opts = {}) {
    if (st && (st.status === "running" || st.status === "paused" || st.status === "count")) { show(); return; }
    st = fresh();
    if (opts.sport && SP[opts.sport] && opts.sport !== "swim") st.sport = opts.sport;
    st.sessionId = opts.sessionId || null;
    st.sessionTitle = opts.title || "";
    st.sessionNote = opts.note || "";
    // 계획에 거리가 있으면 그 거리를 목표로 (예: "권장 거리 달리기 9.5km")
    const gm = /권장 거리[^\n]*?(\d+(?:\.\d+)?)\s?km/.exec(st.sessionNote);
    st.goalM = gm ? Math.round(+gm[1] * 1000) : null;
    st.goalFromPlan = !!gm;
    show();
    renderReady();
    startWatch();
  };
  TS.isRecording = () => !!(st && (st.status === "running" || st.status === "paused"));
  function show() { ov.classList.add("show"); document.body.style.overflow = "hidden"; }
  function hide() { ov.classList.remove("show"); document.body.style.overflow = ""; }
  function closeAll() { stopWatch(); releaseLock(); clearInterval(st.tick); st = null; hide(); }

  // ---------- GPS ----------
  function setGps(level, text) {
    const g = $("tkGps");
    if (g) g.innerHTML = `<span class="dot ${level === "ok" ? "ok" : level === "mid" ? "mid" : "err"}"></span>${esc(text)}`;
  }
  // 앱(안드로이드)으로 설치했을 때: 화면이 꺼져도 계속 재는 백그라운드 GPS 플러그인 사용
  const CAP = window.Capacitor;
  const NATIVE = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
  const BG = NATIVE ? ((CAP.Plugins && CAP.Plugins.BackgroundGeolocation) || (CAP.registerPlugin && CAP.registerPlugin("BackgroundGeolocation"))) : null;
  TS.nativeGps = !!BG;
  function startWatch() {
    if (DEMO) { startDemo(); return; }
    if (BG) {
      setGps("mid", "GPS 신호 찾는 중… (앱 · 백그라운드 측정)");
      BG.addWatcher({
        backgroundTitle: "ZONE 기록 중",
        backgroundMessage: "화면이 꺼져도 거리·페이스를 계속 재고 있어요",
        requestPermissions: true, stale: false, distanceFilter: 0,
      }, (loc, err) => {
        if (err) {
          setGps("err", err.code === "NOT_AUTHORIZED" ? "위치 권한을 '항상 허용'으로 바꿔 주세요 (설정 → 앱 → ZONE → 권한)" : "GPS 신호 찾는 중…");
          if (err.code === "NOT_AUTHORIZED" && CAP.Plugins.BackgroundGeolocation.openSettings) CAP.Plugins.BackgroundGeolocation.openSettings();
          return;
        }
        if (loc) onPos({ coords: { latitude: loc.latitude, longitude: loc.longitude, accuracy: loc.accuracy } });
      }).then((id) => { if (st) st.bgId = id; else BG.removeWatcher({ id }); });
      return;
    }
    if (!("geolocation" in navigator)) { setGps("err", "이 기기는 위치 기능을 쓸 수 없어요"); return; }
    setGps("mid", "GPS 신호 찾는 중…");
    st.watch = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  }
  function stopWatch() {
    if (!st) return;
    if (st.watch != null && navigator.geolocation) navigator.geolocation.clearWatch(st.watch);
    if (BG && st.bgId) { BG.removeWatcher({ id: st.bgId }); st.bgId = null; }
    st.watch = null;
    clearInterval(st.demoT);
  }
  function onErr(e) {
    setGps("err", e.code === 1 ? "위치 권한이 꺼져 있어요 — 브라우저 설정에서 허용해 주세요" : "GPS 신호 찾는 중…");
  }
  function onPos(pos) {
    if (!st) return;
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
    st.fix = { lat, lng, accuracy };
    const lv = accuracy <= 20 ? "ok" : accuracy <= 40 ? "mid" : "bad";
    setGps(lv, `GPS ${lv === "ok" ? "좋음" : lv === "mid" ? "보통" : "약함"} (±${Math.round(accuracy)}m)`);
    if (st.status !== "running" || accuracy > 40) return;
    addPoint(lat, lng);
  }
  function addPoint(lat, lng) {
    const t = elapsed() / 1000;
    const last = st.points[st.points.length - 1];
    let d = 0;
    if (last && !st.gap) {
      d = hav(last[0], last[1], lat, lng);
      if (d < 3) return; // 제자리 흔들림 무시
      const maxV = st.sport === "bike" || st.sport === "tri" ? 25 : st.sport === "walk" ? 4 : 12;
      const dt = t - last[2];
      if (dt > 0 && d / dt > maxV) return; // 순간이동(튀는 값) 무시
    }
    st.gap = false;
    st.dist += d;
    st.points.push([+lat.toFixed(6), +lng.toFixed(6), +t.toFixed(1), (TS.HR && TS.HR.current()) || null]);
    st.cum.push(st.dist);
    while (st.dist >= st.nextSplit) {
      const prevT = st.splits.reduce((a, s) => a + s.sec, 0);
      const sp = { km: st.nextSplit / 1000, sec: Math.round(t - prevT) };
      st.splits.push(sp);
      st.nextSplit += splitUnit();
      announce(sp);
    }
  }
  function announce(sp) {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    const unit = splitUnit() / 1000;
    const per = sp.sec / unit;
    if (st.sport === "bike") speak(`${sp.km}킬로미터. 구간 평균 시속 ${Math.round((unit * 3600) / sp.sec)}킬로미터`);
    else speak(`${sp.km}킬로미터. 구간 페이스 ${Math.floor(per / 60)}분 ${Math.round(per % 60)}초`);
  }
  function startDemo() { // 테스트용: 가짜 위치를 1초마다 만들어요
    let lat = 37.5283, lng = 126.9327, ang = 0;
    setGps("ok", "테스트 모드 (가짜 GPS)");
    st.demoT = setInterval(() => {
      ang += 0.02;
      const v = st.sport === "bike" ? 8 : 3.2;
      lat += (Math.cos(ang) * v) / 111000;
      lng += (Math.sin(ang) * v) / 88000;
      onPos({ coords: { latitude: lat, longitude: lng, accuracy: 5 } });
    }, 1000);
  }

  // ---------- 화면 켜짐 유지 ----------
  async function lock() { try { if ("wakeLock" in navigator) st.lock = await navigator.wakeLock.request("screen"); } catch (e) { /* 지원 안 함 */ } }
  function releaseLock() { try { if (st && st.lock) st.lock.release(); } catch (e) { /* 무시 */ } }
  const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  document.addEventListener("visibilitychange", () => {
    if (!st || st.status !== "running" || TS.nativeGps) return;
    if (document.visibilityState === "hidden") { st.hiddenAt = Date.now(); return; }
    lock();
    // 화면이 꺼졌던 동안은 GPS가 끊겼을 수 있어요 → 돌아오면 알려주기
    const gap = st.hiddenAt ? (Date.now() - st.hiddenAt) / 1000 : 0;
    st.hiddenAt = null;
    if (gap > 15) {
      const el = document.createElement("div"); el.className = "toast";
      el.textContent = `⚠️ 화면이 꺼져 있던 ${gap >= 60 ? Math.round(gap / 60) + "분" : Math.round(gap) + "초"} 동안은 GPS가 끊겼을 수 있어요. 기록 중에는 화면을 켜 두세요.`;
      document.body.appendChild(el); setTimeout(() => el.remove(), 6000);
      try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) { /* 무시 */ }
    }
  });

  // 목표 거리 고르기 (m)
  function goalOptions() {
    const base = st.sport === "run"
      ? [[0, "없음"], [3000, "3km"], [5000, "5km"], [10000, "10km"], [21097, "하프"], [42195, "풀"]]
      : [[0, "없음"], [20000, "20km"], [40000, "40km"], [60000, "60km"], [90000, "90km"]];
    if (st.goalM && !base.some((b) => b[0] === st.goalM)) base.push([st.goalM, `${(st.goalM / 1000).toFixed(st.goalM % 1000 ? 1 : 0)}km`]);
    return base;
  }

  // ---------- 준비 화면 ----------
  function renderReady() {
    const hint = st.sessionTitle ? `<div class="card" style="margin-top:14px"><div class="eyebrow">오늘의 훈련</div><b>${esc(st.sessionTitle)}</b>
      ${st.sessionNote ? `<div class="hint mt" style="white-space:pre-line">${esc(st.sessionNote)}</div>` : ""}</div>` : "";
    ov.innerHTML = `<div class="trk">
      <div class="trk-top">
        <span class="row"><button type="button" class="icon" id="tkClose" aria-label="닫기">✕</button>
          <button type="button" class="pill" id="tkHome">🏠 홈</button></span>
        <div class="gps" id="tkGps"><span class="dot"></span>GPS 확인 중…</div>
        <button type="button" class="icon" id="tkVoice" aria-label="음성 안내">${voiceOn() ? "🔊" : "🔇"}</button>
      </div>
      ${hint}
      <div class="chips center mt">${["run", "bike", "tri"].map((k) =>
        `<button type="button" class="chip${st.sport === k ? " on" : ""}" data-sp="${k}">${SP[k].icon} ${SP[k].name}</button>`).join("")}</div>
      <div class="goal-pick"><div class="eyebrow" style="text-align:center">🎯 목표 거리 ${st.goalFromPlan ? "<span class='hint'>(오늘 계획)</span>" : ""}</div>
        <div class="chips center">${goalOptions().map(([m, l]) => `<button type="button" class="chip${(st.goalM || 0) === m ? " on" : ""}" data-goal="${m}">${l}</button>`).join("")}
          <span class="unit" style="width:auto"><input type="number" inputmode="decimal" id="tkGoalIn" min="0" step="0.1" placeholder="직접" style="width:72px;padding:6px 8px" /><span>km</span></span></div></div>
      ${TS.nativeGps ? "" : `<div class="gps-warn">
        <b>📱 ${IOS ? "아이폰은" : "웹에서는"} 화면이 꺼지거나 다른 앱으로 넘어가면 GPS 기록이 멈춰요</b>
        <span>기록하는 동안 화면이 꺼지지 않게 해 둘게요. <b>휴대폰을 잠그지 말고, 다른 앱을 켜지 마세요.</b></span>
        ${"wakeLock" in navigator ? "" : `<span>⚠️ 이 브라우저는 화면 꺼짐을 막을 수 없어요 — <b>설정 → 디스플레이 및 밝기 → 자동 잠금 → '안 함'</b>으로 바꾼 뒤 시작해 주세요.</span>`}
      </div>`}
      <button type="button" class="go" id="tkGo">시작</button>
      <p class="hint" style="text-align:center">${TS.nativeGps
        ? "📱 앱 모드: 화면을 꺼도 GPS가 계속 기록돼요. 휴대폰은 팔·허리·주머니 어디든 괜찮아요."
        : "📍 GPS가 '좋음'이 되면 시작하세요. 웹에서는 <b>기록 중 화면을 켜 두세요</b> — 화면이 꺼지면 측정이 멈출 수 있어요 (ZONE 앱을 설치하면 꺼져도 돼요)."}</p>
      <button type="button" class="link" id="tkManual" style="margin:8px auto 0">GPS 없이 직접 기록하기 (수영·실내 훈련)</button>
    </div>`;
    if (st.fix) onPos({ coords: { latitude: st.fix.lat, longitude: st.fix.lng, accuracy: st.fix.accuracy } });
    if (DEMO) setGps("ok", "테스트 모드 (가짜 GPS)");
    $("tkClose").onclick = closeAll;
    $("tkHome").onclick = () => { closeAll(); if (TS.goHome) TS.goHome(); };
    $("tkVoice").onclick = () => {
      try { localStorage.setItem(VOICE_KEY, voiceOn() ? "off" : "on"); } catch (e) { /* 무시 */ }
      $("tkVoice").textContent = voiceOn() ? "🔊" : "🔇";
    };
    ov.querySelectorAll("[data-sp]").forEach((b) => { b.onclick = () => { st.sport = b.dataset.sp; st.nextSplit = splitUnit(); renderReady(); }; });
    ov.querySelectorAll("[data-goal]").forEach((b) => {
      b.onclick = () => { st.goalM = +b.dataset.goal || null; st.goalFromPlan = false; renderReady(); };
    });
    $("tkGoalIn").onchange = (e) => {
      const v = parseFloat(e.target.value);
      if (v > 0) { st.goalM = Math.round(v * 1000); st.goalFromPlan = false; renderReady(); }
    };
    $("tkManual").onclick = () => { const s = st.sport; closeAll(); TS.openManual({ sport: s }); };
    $("tkGo").onclick = begin; // 카운트다운 없이 바로 시작
    bindHrBox();
  }

  function begin() {
    st.nextSplit = splitUnit();
    st.status = "running";
    st.startedAt = new Date().toISOString();
    st.acc = 0;
    st.lastResume = Date.now();
    if (navigator.vibrate) navigator.vibrate(150);
    lock();
    renderLive();
    if (st.fix && st.fix.accuracy <= 40) addPoint(st.fix.lat, st.fix.lng);
    st.tick = setInterval(updateLive, 1000);
  }

  // ---------- 측정 화면 ----------
  function renderLive() {
    const bike = st.sport === "bike";
    ov.innerHTML = `<div class="trk${st.status === "paused" ? " paused" : ""}" id="tkLive">
      <div class="trk-top"><span class="row"><button type="button" class="pill" id="tkHomeLive" title="기록은 계속돼요">🏠 홈</button>
        <span class="eyebrow" style="margin:0">${SP[st.sport].icon} ${SP[st.sport].name}${st.status === "paused" ? " · 일시정지" : ""}</span></span>
        <div class="gps" id="tkGps"><span class="dot"></span>GPS</div></div>
      <div class="live-dist num" id="tkDist">${fmtKm(st.dist)}</div>
      <div class="live-unit">킬로미터</div>
      ${st.goalM ? `<div class="goal-live"><div class="spread"><span id="tkGoalTxt">목표 ${fmtKm(st.goalM)}km</span><span id="tkGoalLeft" class="hint"></span></div>
        <div class="progress"><i id="tkGoalBar" style="width:0%"></i></div></div>` : ""}
      <div class="live-grid">
        <div><b class="num" id="tkAvg">-</b><span>${bike ? "평균 속도 km/h" : "평균 페이스"}</span></div>
        <div><b class="num" id="tkTime">0:00</b><span>시간</span></div>
        <div><b class="num" id="tkCur">-</b><span>${bike ? "현재 속도 km/h" : "현재 페이스"}</span></div>
      </div>
      <div id="tkHr" style="text-align:center;margin-bottom:14px">${hrLiveHtml()}</div>
      <div class="card" id="tkSplits" style="display:none"></div>
      <div class="ctrl">${st.status === "paused"
        ? `<button type="button" class="white" id="tkStop">종료</button><button type="button" class="primary" id="tkResume">계속</button>`
        : `<button type="button" class="white" id="tkPause">일시<br>정지</button>`}</div>
    </div>`;
    if (st.fix) onPos({ coords: { latitude: st.fix.lat, longitude: st.fix.lng, accuracy: st.fix.accuracy } });
    if (DEMO) setGps("ok", "테스트 모드 (가짜 GPS)");
    $("tkHomeLive").onclick = () => { hide(); if (TS.goHome) TS.goHome(); }; // 기록은 계속, 홈의 '기록 중 — 돌아가기'로 다시 열기
    if ($("tkPause")) $("tkPause").onclick = pause;
    if ($("tkResume")) $("tkResume").onclick = resume;
    if ($("tkStop")) $("tkStop").onclick = stop;
    updateLive();
  }
  function curSpeed() { // 최근 20초 평균 (m/s)
    const n = st.points.length;
    if (n < 2) return 0;
    const tNow = st.points[n - 1][2];
    let i = n - 1;
    while (i > 0 && tNow - st.points[i - 1][2] <= 20) i--;
    const dt = tNow - st.points[i][2], dd = st.cum[n - 1] - st.cum[i];
    return dt > 0 ? dd / dt : 0;
  }
  function updateLive() {
    if (!st || !$("tkDist")) return;
    const sec = elapsed() / 1000;
    const bike = st.sport === "bike";
    $("tkDist").textContent = fmtKm(st.dist);
    $("tkTime").textContent = fmtDur(sec);
    const bpm = TS.HR && TS.HR.current();
    if (bpm && st.status === "running" && (!st.hrs.length || sec - st.hrs[st.hrs.length - 1][0] >= 5)) st.hrs.push([Math.round(sec), bpm]);
    const avgV = sec > 0 ? st.dist / sec : 0, cur = curSpeed();
    $("tkAvg").textContent = bike ? (avgV * 3.6).toFixed(1) : st.dist > 20 ? fmtPace(1000 / avgV) : "-'--\"";
    $("tkCur").textContent = bike ? (cur * 3.6).toFixed(1) : cur > 0.3 ? fmtPace(1000 / cur) : "-'--\"";
    // 목표 거리 진행
    if (st.goalM && $("tkGoalBar")) {
      const pct = Math.min(100, (st.dist / st.goalM) * 100);
      const left = Math.max(0, st.goalM - st.dist);
      $("tkGoalBar").style.width = pct + "%";
      $("tkGoalTxt").textContent = `목표 ${fmtKm(st.goalM)}km 중 ${Math.round(pct)}%`;
      $("tkGoalLeft").textContent = left > 0 ? `남은 ${fmtKm(left)}km${avgV > 0.5 ? ` · 약 ${fmtDur(left / avgV)} 더` : ""}` : "목표 달성! 🎉";
      if (!st.half && pct >= 50) { st.half = true; speak("목표 거리의 절반을 지났어요"); }
      if (!st.goalDone && left <= 0) { st.goalDone = true; if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]); speak("목표 거리 달성! 수고했어요"); }
    }
    const box = $("tkSplits");
    if (st.splits.length) {
      box.style.display = "";
      const unit = splitUnit() / 1000;
      box.innerHTML = `<div class="eyebrow">구간 기록</div>` + st.splits.slice(-3).reverse().map((s) =>
        `<div class="pr-row"><span>${s.km}km</span><b>${bike ? `${((unit * 3600) / s.sec).toFixed(1)} km/h` : fmtPace(s.sec / unit)}</b></div>`).join("");
    }
  }
  function pause() {
    st.acc += Date.now() - st.lastResume;
    st.status = "paused";
    speak("일시정지");
    renderLive();
  }
  function resume() {
    st.lastResume = Date.now();
    st.status = "running";
    st.gap = true;
    speak("다시 시작합니다");
    renderLive();
  }
  async function stop() {
    if (!await TS.ask("운동을 끝낼까요?", "끝내기")) return;
    st.status = "done";
    clearInterval(st.tick);
    stopWatch();
    releaseLock();
    speak(`운동 완료. ${fmtKm(st.dist)}킬로미터`);
    renderDone();
  }

  // ---------- 완료·저장 ----------
  function routeSvg(points, w = 300, h = 180) {
    if (!points || points.length < 2) return "";
    const la = points.map((p) => p[0]), lo = points.map((p) => p[1]);
    const minLa = Math.min(...la), maxLa = Math.max(...la), minLo = Math.min(...lo), maxLo = Math.max(...lo);
    const k = Math.cos((((minLa + maxLa) / 2) * Math.PI) / 180);
    const sx = (maxLo - minLo) * k || 1e-6, sy = maxLa - minLa || 1e-6;
    const s = Math.min((w - 20) / sx, (h - 20) / sy);
    const ox = (w - sx * s) / 2, oy = (h - sy * s) / 2;
    const pts = points.map((p) => `${(ox + (p[1] - minLo) * k * s).toFixed(1)},${(h - oy - (p[0] - minLa) * s).toFixed(1)}`).join(" ");
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="max-height:${h}px"><polyline points="${pts}" fill="none" stroke="#1d6bf3" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  TS.routeSvg = routeSvg;

  function defaultTitle(sport, d = new Date()) {
    const h = d.getHours();
    const when = h < 5 ? "새벽" : h < 11 ? "아침" : h < 14 ? "점심" : h < 18 ? "오후" : h < 21 ? "저녁" : "밤";
    return `${TS.DAYS[(d.getDay() + 6) % 7]}요일 ${when} ${SP[sport].name}`;
  }
  TS.defaultTitle = defaultTitle;

  async function todaysSessions() {
    const { data } = await TS.mine(TS.db.from(TS.TABLE).select("id,title,completed")).eq("date", iso(new Date()));
    return (data || []).filter((s) => !s.completed);
  }

  function hrStat() {
    const v = (st && st.hrs || []).map((x) => x[1]);
    return v.length ? { avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length), max: Math.max(...v) } : {};
  }
  async function renderDone() {
    const sec = elapsed() / 1000;
    const bike = st.sport === "bike";
    const sess = await todaysSessions();
    ov.innerHTML = `<div class="trk">
      <div class="eyebrow">운동 완료 🎉</div>
      <div class="num hero">${fmtKm(st.dist)}</div><div class="hero-unit">킬로미터</div>
      <div class="trio">
        <div><b class="num">${bike ? ((st.dist / Math.max(sec, 1)) * 3.6).toFixed(1) : fmtPace(st.dist > 0 ? (sec * 1000) / st.dist : 0)}</b><span>${bike ? "평균 km/h" : "평균 페이스"}</span></div>
        <div><b class="num">${fmtDur(sec)}</b><span>시간</span></div>
        <div><b class="num">${hrStat().avg || st.splits.length}</b><span>${hrStat().avg ? "평균 심박" : "구간"}</span></div>
      </div>
      ${hrStat().avg ? `<p class="hint" style="text-align:center">❤️ 평균 ${hrStat().avg}bpm · 최고 ${hrStat().max}bpm (가민 시계 심박)</p>` : ""}
      <div class="card mt">${routeSvg(st.points) || '<p class="hint">GPS 경로가 없어요.</p>'}</div>
      <div style="display:grid;gap:12px">
        <label>제목 <input id="tkTitle" value="${esc(defaultTitle(st.sport, new Date(st.startedAt)))}" maxlength="100" /></label>
        <label>운동 자각도(RPE) — 얼마나 힘들었나요? <b id="tkRpeV" style="color:var(--text)">5 · ${RPE_TXT[5]}</b>
          <input type="range" id="tkRpe" min="1" max="10" value="5" /></label>
        <label>오늘의 계획과 연결 (완료로 표시돼요)
          <select id="tkSess"><option value="">연결 안 함</option>${sess.map((s) =>
            `<option value="${esc(s.id)}"${s.id === st.sessionId ? " selected" : ""}>${esc(s.title)}</option>`).join("")}</select></label>
        <label>메모 <textarea id="tkNote" rows="3" placeholder="컨디션, 날씨, 코스 등"></textarea></label>
        <label>커뮤니티 공개 범위 ${TS.auth && TS.auth.user ? "" : "<span class='hint'>(로그인하면 공유돼요)</span>"}
          <select id="tkVis">${[["friends", "👥 친구만"], ["public", "🌏 전체 공개"], ["private", "🔒 나만"]].map(([v, l]) => `<option value="${v}"${TS.privacy().visibility === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>
      </div>
      <div class="ctrl" style="gap:10px">
        <button type="button" class="danger" id="tkDiscard" style="width:auto;height:auto;border-radius:12px;padding:14px 18px">버리기</button>
        <button type="button" class="primary" id="tkSave" style="width:auto;height:auto;border-radius:12px;padding:14px 28px;flex:1">저장</button>
      </div>
    </div>`;
    $("tkRpe").oninput = (e) => { $("tkRpeV").textContent = `${e.target.value} · ${RPE_TXT[e.target.value]}`; };
    $("tkDiscard").onclick = async () => { if (await TS.ask("이 기록을 버릴까요? 되돌릴 수 없어요.", "버리기")) closeAll(); };
    $("tkSave").onclick = save;
  }

  async function linkSession(id) {
    if (!id) return;
    await TS.db.from(TS.TABLE).update({ completed: true }).eq("id", id);
    TS.reload();
  }

  async function save() {
    $("tkSave").disabled = true;
    const sid = $("tkSess").value || null;
    const row = {
      started_at: st.startedAt,
      sport: st.sport,
      title: $("tkTitle").value.trim() || defaultTitle(st.sport),
      distance_m: Math.round(st.dist),
      duration_s: Math.round(elapsed() / 1000),
      rpe: +$("tkRpe").value,
      route: st.points,
      splits: st.splits,
      notes: $("tkNote").value.trim() || null,
      visibility: $("tkVis").value,
      source: DEMO ? "demo" : "gps",
      session_id: sid,
    };
    const hs = hrStat();
    if (hs.avg) Object.assign(row, { avg_hr: hs.avg, max_hr: hs.max, hr_series: st.hrs, device: TS.HR.name || "심박 센서" });
    const saved = await TS.addActivity(row);
    await linkSession(sid);
    closeAll();
    if (TS.showTab) TS.showTab("activity");
    if (TS.openActivity) TS.openActivity(saved, true);
  }

  // ---------- 직접 기록 ----------
  const mf = $("manualForm");
  function syncManualUnit() { $("mDistLbl").textContent = mf.sport.value === "swim" ? "거리 (m)" : "거리 (km)"; }
  function syncManualRpe() { $("mRpeV").textContent = mf.rpe.value; $("mRpeTxt").textContent = RPE_TXT[mf.rpe.value]; }
  TS.openManual = function (opts = {}) {
    mf.reset();
    mf.sport.value = opts.sport && SP[opts.sport] ? opts.sport : "run";
    mf.date.value = iso(new Date());
    const now = new Date();
    mf.time.value = `${TS.pad(now.getHours())}:${TS.pad(now.getMinutes())}`;
    mf.title.value = opts.title || "";
    mf.dataset.session = opts.sessionId || "";
    mf.vis.value = TS.privacy().visibility;
    syncManualUnit(); syncManualRpe();
    $("manualDlg").showModal();
  };
  mf.sport.onchange = syncManualUnit;
  mf.duration.addEventListener("input", () => { // 4530 → 45:30
    const v = TS.E ? TS.E.autoTime(mf.duration.value) : mf.duration.value;
    if (v !== mf.duration.value) mf.duration.value = v;
  });
  mf.duration.setAttribute("inputmode", "decimal");
  mf.rpe.oninput = syncManualRpe;
  $("mCancel").onclick = () => $("manualDlg").close();
  mf.addEventListener("submit", async (e) => {
    e.preventDefault();
    const dur = TS.parseTime(mf.duration.value);
    if (!dur) { alert("운동 시간을 45:30 또는 1:05:00처럼 적어주세요."); return; }
    const raw = parseFloat(mf.distance.value);
    const distM = isFinite(raw) ? (mf.sport.value === "swim" ? raw : raw * 1000) : 0;
    const started = new Date(`${mf.date.value}T${mf.time.value || "07:00"}:00`);
    const row = {
      started_at: started.toISOString(),
      sport: mf.sport.value,
      title: mf.title.value.trim() || defaultTitle(mf.sport.value, started),
      distance_m: Math.round(distM),
      duration_s: Math.round(dur),
      rpe: +mf.rpe.value,
      route: null, splits: null,
      notes: mf.notes.value.trim() || null,
      visibility: mf.vis.value,
      source: "manual",
      session_id: mf.dataset.session || null,
    };
    const saved = await TS.addActivity(row);
    await linkSession(row.session_id);
    $("manualDlg").close();
    if (TS.showTab) TS.showTab("activity");
    if (TS.openActivity) TS.openActivity(saved, true);
  });
  TS.RPE_TXT = RPE_TXT;
})();
