// 가민 시계 연동
//  1) 블루투스 심박: 표준 BLE 심박 프로필(Heart Rate Service 0x180D)로 실시간 심박 받기
//     - 가민 시계에서 '심박 전송(Broadcast Heart Rate)'을 켜면 보내요. 심박 벨트도 같은 방식.
//     - 브라우저의 Web Bluetooth 기능을 써요: 안드로이드 크롬, PC 크롬·엣지 가능 / 아이폰은 불가.
//  2) 기록 가져오기: 가민 커넥트에서 내보낸 FIT · GPX · TCX (또는 FIT이 든 ZIP) 파일 읽기
//     - 가민이 공개한 FIT 형식과 표준 GPX·TCX 형식만 읽어요. 시계의 비공개 통신은 쓰지 않아요.
(function () {
  const TS = window.TS;
  const hav = TS.hav;

  // ---------- 1) 블루투스 심박 ----------
  const HR = { device: null, bpm: null, at: 0, status: "off", name: "", error: "", listeners: new Set() };
  HR.supported = !!(navigator.bluetooth && navigator.bluetooth.requestDevice);
  const emit = () => HR.listeners.forEach((f) => { try { f(HR); } catch (e) { /* 무시 */ } });
  function onValue(e) {
    const v = e.target.value;
    const flags = v.getUint8(0);
    HR.bpm = flags & 1 ? v.getUint16(1, true) : v.getUint8(1);
    HR.at = Date.now();
    emit();
  }
  async function attach() {
    HR.status = "connecting"; HR.error = ""; emit();
    const server = await HR.device.gatt.connect();
    const svc = await server.getPrimaryService("heart_rate");
    const ch = await svc.getCharacteristic("heart_rate_measurement");
    await ch.startNotifications();
    ch.addEventListener("characteristicvaluechanged", onValue);
    HR.status = "on"; emit();
  }
  HR.connect = async function () {
    if (!HR.supported) throw new Error("이 브라우저는 블루투스 연결을 지원하지 않아요.");
    try {
      if (!HR.device) {
        HR.device = await navigator.bluetooth.requestDevice({ filters: [{ services: ["heart_rate"] }] });
        HR.name = HR.device.name || "심박 센서";
        HR.device.addEventListener("gattserverdisconnected", () => { HR.status = "off"; HR.bpm = null; emit(); });
      }
      await attach();
    } catch (e) {
      HR.status = "off";
      HR.error = /cancel/i.test(e.message) ? "" : e.message;
      emit();
      throw e;
    }
  };
  HR.disconnect = function () {
    try { if (HR.device && HR.device.gatt.connected) HR.device.gatt.disconnect(); } catch (e) { /* 무시 */ }
    HR.device = null; HR.status = "off"; HR.bpm = null; emit();
  };
  HR.on = (f) => { HR.listeners.add(f); return () => HR.listeners.delete(f); };
  HR.current = () => (HR.status === "on" && HR.bpm && Date.now() - HR.at < 6000 ? HR.bpm : null);
  TS.HR = HR;

  // 심박 → 프릴 존 (프로필의 LTHR 기준)
  function hrZone(bpm, sport) {
    if (!bpm || !TS.E || !TS.getProfile || !TS.getProfile()) return null;
    const H = TS.E.hrInfo(TS.getProfile());
    const l = sport === "bike" ? H.lthrBike : H.lthrRun;
    if (!l) return null;
    const T = sport === "bike" ? TS.E.FRIEL_BIKE : TS.E.FRIEL_RUN;
    const pct = (bpm / l) * 100;
    for (let i = 0; i < T.length; i++) { const hi = T[i][3]; if (hi == null || pct < hi + 1) return { z: T[i][0], name: T[i][1], i }; }
    return null;
  }
  TS.hrZone = hrZone;

  // ---------- 2) 파일 읽기 ----------
  const sportOf = (s) => { s = String(s || ""); return /swim|수영/i.test(s) ? "swim" : /bik|cycl|ride|자전거/i.test(s) ? "bike" : /walk|hik|걷/i.test(s) ? "walk" : "run"; };

  // FIT (가민 공개 형식) — 필요한 메시지만 읽는 작은 해석기
  const FIT_EPOCH = 631065600; // 1989-12-31 00:00:00 UTC
  const SEMI = 180 / 2147483648;
  function parseFIT(buf) {
    const dv = new DataView(buf);
    const hs = dv.getUint8(0);
    const dataSize = dv.getUint32(4, true);
    const sig = String.fromCharCode(dv.getUint8(8), dv.getUint8(9), dv.getUint8(10), dv.getUint8(11));
    if (sig !== ".FIT") throw new Error("FIT 파일이 아니에요");
    const end = Math.min(hs + dataSize, buf.byteLength);
    let pos = hs, lastTs = 0;
    const defs = {}, recs = [], sessions = [];
    let sportMsg = null;
    const SIZES = [1, 1, 1, 2, 2, 4, 4, 0, 4, 8, 1, 2, 4, 1, 8, 8, 8];
    function readVal(fd, le) {
      const bt = fd.type & 0x1f, sz = SIZES[bt];
      if (!sz || fd.size !== sz) return null;
      let v;
      switch (bt) {
        case 0: case 2: case 10: case 13: v = dv.getUint8(pos); return (bt === 10 ? v === 0 : v === 0xff) ? null : v;
        case 1: v = dv.getInt8(pos); return v === 0x7f ? null : v;
        case 3: v = dv.getInt16(pos, le); return v === 0x7fff ? null : v;
        case 4: case 11: v = dv.getUint16(pos, le); return (bt === 11 ? v === 0 : v === 0xffff) ? null : v;
        case 5: v = dv.getInt32(pos, le); return v === 0x7fffffff ? null : v;
        case 6: case 12: v = dv.getUint32(pos, le); return (bt === 12 ? v === 0 : v === 0xffffffff) ? null : v;
        case 8: v = dv.getFloat32(pos, le); return isFinite(v) ? v : null;
        default: return null;
      }
    }
    function readData(def) {
      const f = {};
      for (const fd of def.fields) { f[fd.num] = readVal(fd, def.le); pos += fd.size; }
      pos += def.devSize;
      return f;
    }
    function handle(def, f) {
      if (def.gnum === 20) recs.push({ t: f[253], lat: f[0] != null ? f[0] * SEMI : null, lng: f[1] != null ? f[1] * SEMI : null, hr: f[3], dist: f[5] != null ? f[5] / 100 : null });
      else if (def.gnum === 18) sessions.push({ start: f[2], sport: f[5], elapsed: f[7] != null ? f[7] / 1000 : null, timer: f[8] != null ? f[8] / 1000 : null, dist: f[9] != null ? f[9] / 100 : null, avgHr: f[16], maxHr: f[17], cal: f[11] });
      else if (def.gnum === 12) sportMsg = f[0];
    }
    while (pos < end) {
      const h = dv.getUint8(pos++);
      if (h & 0x80) { // 압축 타임스탬프 헤더
        const def = defs[(h >> 5) & 3];
        if (!def) throw new Error("FIT 형식 오류");
        const off = h & 0x1f;
        let ts = (lastTs & ~0x1f) + off;
        if (off < (lastTs & 0x1f)) ts += 0x20;
        lastTs = ts;
        const f = readData(def);
        f[253] = ts;
        handle(def, f);
        continue;
      }
      const local = h & 0x0f;
      if (h & 0x40) { // 정의 메시지
        pos++;
        const le = dv.getUint8(pos++) === 0;
        const gnum = dv.getUint16(pos, le); pos += 2;
        const n = dv.getUint8(pos++);
        const fields = [];
        for (let i = 0; i < n; i++) { fields.push({ num: dv.getUint8(pos), size: dv.getUint8(pos + 1), type: dv.getUint8(pos + 2) }); pos += 3; }
        let devSize = 0;
        if (h & 0x20) { const dn = dv.getUint8(pos++); for (let i = 0; i < dn; i++) { devSize += dv.getUint8(pos + 1); pos += 3; } }
        defs[local] = { gnum, le, fields, devSize };
        continue;
      }
      const def = defs[local];
      if (!def) throw new Error("FIT 형식 오류");
      const f = readData(def);
      if (f[253] != null) lastTs = f[253];
      handle(def, f);
    }
    const s = sessions[0] || {};
    const sport = { 1: "run", 2: "bike", 5: "swim", 11: "walk", 17: "walk" }[s.sport != null ? s.sport : sportMsg] || "run";
    return {
      sport, start: s.start != null ? s.start + FIT_EPOCH : recs.length && recs[0].t != null ? recs[0].t + FIT_EPOCH : null,
      duration: s.timer || s.elapsed, dist: s.dist, avgHr: s.avgHr, maxHr: s.maxHr,
      pts: recs.filter((r) => r.t != null).map((r) => ({ t: r.t + FIT_EPOCH, lat: r.lat, lng: r.lng, hr: r.hr, dist: r.dist })),
    };
  }

  const kids = (el, name) => [...el.getElementsByTagNameNS("*", name)];
  const txt = (el, name) => { const x = kids(el, name)[0]; return x ? x.textContent.trim() : null; };
  function parseGPX(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("GPX 파일을 읽을 수 없어요");
    const pts = kids(doc, "trkpt").map((p) => ({
      lat: +p.getAttribute("lat"), lng: +p.getAttribute("lon"),
      t: Date.parse(txt(p, "time")) / 1000, hr: +(txt(p, "hr") || 0) || null, dist: null,
    })).filter((p) => isFinite(p.t));
    return { sport: sportOf(txt(doc, "type") || txt(doc, "name")), start: pts.length ? pts[0].t : null, duration: null, dist: null, pts };
  }
  function parseTCX(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("TCX 파일을 읽을 수 없어요");
    const act = kids(doc, "Activity")[0];
    const laps = kids(doc, "Lap");
    const pts = kids(doc, "Trackpoint").map((p) => ({
      t: Date.parse(txt(p, "Time")) / 1000,
      lat: txt(p, "LatitudeDegrees") != null ? +txt(p, "LatitudeDegrees") : null,
      lng: txt(p, "LongitudeDegrees") != null ? +txt(p, "LongitudeDegrees") : null,
      hr: (() => { const h = kids(p, "HeartRateBpm")[0]; return h ? +txt(h, "Value") || null : null; })(),
      dist: txt(p, "DistanceMeters") != null ? +txt(p, "DistanceMeters") : null,
    })).filter((p) => isFinite(p.t));
    const sum = (n) => laps.reduce((a, l) => a + (+(kids(l, n)[0] || {}).textContent || 0), 0);
    const avgs = laps.map((l) => { const a = kids(l, "AverageHeartRateBpm")[0]; return a ? +txt(a, "Value") : null; }).filter(Boolean);
    return {
      sport: sportOf(act && act.getAttribute("Sport")),
      start: laps[0] ? Date.parse(laps[0].getAttribute("StartTime")) / 1000 : pts.length ? pts[0].t : null,
      duration: sum("TotalTimeSeconds") || null, dist: sum("DistanceMeters") || null,
      avgHr: avgs.length ? Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length) : null, pts,
    };
  }

  // 해석 결과 → 앱의 활동 기록
  function toActivity(r, fileName) {
    const pts = r.pts || [];
    const t0 = r.start || (pts[0] && pts[0].t) || Date.now() / 1000;
    let cum = 0, last = null;
    const full = pts.map((p) => {
      if (p.dist != null) cum = p.dist;
      else if (p.lat != null && last && last.lat != null) cum += hav(last.lat, last.lng, p.lat, p.lng);
      if (p.lat != null) last = p;
      return { ...p, rel: Math.max(0, p.t - t0), cum };
    });
    const dist = r.dist || cum || 0;
    const dur = r.duration || (full.length ? full[full.length - 1].rel : 0);
    const gps = full.filter((p) => p.lat != null && p.lng != null);
    const step = Math.max(1, Math.ceil(gps.length / 3000));
    const route = gps.filter((_, i) => i % step === 0 || i === gps.length - 1).map((p) => [+p.lat.toFixed(6), +p.lng.toFixed(6), Math.round(p.rel), p.hr || null]);
    const hrs = full.filter((p) => p.hr);
    const series = [];
    hrs.forEach((p) => { if (!series.length || p.rel - series[series.length - 1][0] >= 10) series.push([Math.round(p.rel), p.hr]); });
    const unit = r.sport === "bike" ? 5000 : r.sport === "swim" ? 100 : 1000;
    const splits = [];
    if (r.sport !== "swim") {
      let next = unit, prevT = 0;
      full.forEach((p) => { while (p.cum >= next) { splits.push({ km: next / 1000, sec: Math.round(p.rel - prevT) }); prevT = p.rel; next += unit; } });
    }
    const avgHr = r.avgHr || (hrs.length ? Math.round(hrs.reduce((a, p) => a + p.hr, 0) / hrs.length) : null);
    const maxHr = r.maxHr || (hrs.length ? Math.max(...hrs.map((p) => p.hr)) : null);
    const started = new Date(t0 * 1000);
    return {
      started_at: started.toISOString(), sport: r.sport,
      title: `⌚ ${TS.defaultTitle ? TS.defaultTitle(r.sport, started) : r.sport}`,
      distance_m: Math.round(dist), duration_s: Math.round(dur), rpe: null,
      route: route.length > 1 ? route : null, splits: splits.length ? splits : null,
      notes: `가민 기록 가져오기: ${fileName}`, source: "garmin",
      avg_hr: avgHr, max_hr: maxHr, hr_series: series.length ? series : null,
    };
  }

  let jszip = null;
  function loadJSZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (jszip) return jszip;
    jszip = new Promise((ok, bad) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      s.onload = () => ok(window.JSZip);
      s.onerror = () => bad(new Error("ZIP 도구를 불러오지 못했어요. 압축을 풀어서 .fit 파일을 올려 주세요."));
      document.head.appendChild(s);
    });
    return jszip;
  }
  async function readFiles(files) {
    const out = [];
    for (const f of files) {
      const name = f.name.toLowerCase();
      try {
        if (name.endsWith(".zip")) {
          const Z = await loadJSZip();
          const zip = await Z.loadAsync(await f.arrayBuffer());
          for (const entry of Object.values(zip.files)) {
            const en = entry.name.toLowerCase();
            if (entry.dir) continue;
            if (en.endsWith(".fit")) out.push({ name: entry.name, act: toActivity(parseFIT(await entry.async("arraybuffer")), entry.name) });
            else if (en.endsWith(".gpx")) out.push({ name: entry.name, act: toActivity(parseGPX(await entry.async("string")), entry.name) });
            else if (en.endsWith(".tcx")) out.push({ name: entry.name, act: toActivity(parseTCX(await entry.async("string")), entry.name) });
          }
        } else if (name.endsWith(".fit")) out.push({ name: f.name, act: toActivity(parseFIT(await f.arrayBuffer()), f.name) });
        else if (name.endsWith(".gpx")) out.push({ name: f.name, act: toActivity(parseGPX(await f.text()), f.name) });
        else if (name.endsWith(".tcx")) out.push({ name: f.name, act: toActivity(parseTCX(await f.text()), f.name) });
        else out.push({ name: f.name, error: "FIT·GPX·TCX·ZIP 파일만 읽을 수 있어요" });
      } catch (e) { out.push({ name: f.name, error: e.message || "읽기 실패" }); }
    }
    return out;
  }
  TS.garmin = { readFiles, parseFIT, parseGPX, parseTCX, toActivity };
})();
