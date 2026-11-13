// 🔮 대회 기록 예측 — 내가 실제로 훈련한 페이스·양(최근 8주)으로 5K·10K·하프·풀코스(+수영·자전거·철인3종) 기록을 예측해요
// 쓰는 방법 (여러 방법을 같이 보고 가중 평균):
//  ① 기록·테스트 VDOT (다니엘스): 문진표의 최고기록·5K/10K 테스트
//  ② 심박-페이스 VDOT: 훈련할 때의 페이스와 심박(최대·안정시 심박 대비 %)으로 VO2max 추정 (%VO2R ≈ %HRR)
//  ③ 실제로 뛴 가장 빠른 기록: 훈련 중 낸 기록을 레이스처럼 계산 (최소한 이 정도는 가능)
//  ④ Tanda(2011) 마라톤 공식: 최근 8주 주간 거리(K)와 평균 훈련 페이스(P) → 마라톤 페이스 = 17.1 + 140·e^(−0.0053K) + 0.55P (초/km)
//  ⑤ 주간 거리 보정 (Vickers & Vertosick 2016): 주간 거리가 적으면 하프·풀코스는 단거리 기록으로 예측한 것보다 느려져요
(function () {
  const TS = window.TS;
  const E = TS.E;
  const esc = (s) => TS.escapeHtml(s == null ? "" : s);
  const fmt = (s) => E.fmt(Math.round(s));
  const r1 = (x) => Math.round(x * 10) / 10;
  const DIST = [["5K", 5000], ["10K", 10000], ["하프", 21097], ["풀코스", 42195]];
  const vo2 = (v) => -4.6 + 0.182258 * v + 0.000104 * v * v; // v: m/분

  async function compute() {
    const p = TS.getProfile ? TS.getProfile() : null;
    let ctx = null;
    try { ctx = p ? E.buildPlan(p).ctx : null; } catch (e) { ctx = null; }
    const acts = await TS.listActivities().catch(() => []);
    const now = Date.now(), W8 = 56 * 864e5;
    const runs = acts.filter((a) => a.sport === "run" && a.distance_m >= 1000 && a.duration_s > 0 && now - new Date(a.started_at) < W8)
      .map((a) => ({ ...a, km: a.distance_m / 1000, pace: a.duration_s / (a.distance_m / 1000) }))
      .filter((a) => a.pace > 150 && a.pace < 600); // 2:30~10:00/km 밖은 걷기·GPS 오류로 봐요
    const out = { p, ctx, runs, methods: [], notes: [] };

    // 기간·주간 거리·평균 페이스 (Tanda의 K, P)
    if (runs.length) {
      const first = Math.min(...runs.map((a) => +new Date(a.started_at)));
      const weeks = Math.max(1, Math.min(8, Math.ceil((now - first) / (7 * 864e5))));
      const km = runs.reduce((s, a) => s + a.km, 0), sec = runs.reduce((s, a) => s + a.duration_s, 0);
      out.weeks = weeks; out.K = km / weeks; out.P = sec / km; out.n = runs.length;
      out.longest = Math.max(...runs.map((a) => a.km));
    }

    // ① 기록·테스트 VDOT
    if (ctx && ctx.run) out.methods.push({ key: "rec", name: "최고기록·테스트 (다니엘스 VDOT)", vdot: ctx.run.vdot, w: 3, why: ctx.run.src || "문진표 기록" });

    // ② 심박-페이스 VDOT
    const H = ctx && ctx.H ? ctx.H : null;
    if (H && H.max && runs.some((a) => a.avg_hr)) {
      const rest = H.rest || 60, list = [];
      runs.forEach((a) => {
        if (!a.avg_hr || a.duration_s < 15 * 60) return;
        const f = (a.avg_hr - rest) / (H.max - rest);
        if (f < 0.55 || f > 0.98) return;
        const v = (a.distance_m) / (a.duration_s / 60);
        const vd = (vo2(v) - 3.5) / f + 3.5;
        if (vd > 20 && vd < 90) list.push(vd);
      });
      if (list.length >= 2) {
        list.sort((a, b) => b - a);
        const top = list.slice(0, Math.max(2, Math.ceil(list.length / 2)));
        const vd = top[Math.floor(top.length / 2)];
        out.methods.push({ key: "hr", name: "훈련 페이스 + 심박", vdot: vd, w: 2 * Math.min(1, list.length / 8), why: `심박이 있는 훈련 ${list.length}회 (최대 ${H.max} · 안정시 ${rest}bpm 기준)` });
      }
    }

    // ③ 훈련 중 실제로 낸 가장 빠른 기록 (레이스처럼 계산 → 최소치)
    let bestVd = null, bestRun = null;
    runs.forEach((a) => { if (a.km < 3) return; const vd = E.vdotFrom(a.distance_m, a.duration_s); if (!bestVd || vd > bestVd) { bestVd = vd; bestRun = a; } });
    if (bestVd) {
      const race = /대회|레이스|race|tt|테스트|기록/i.test(bestRun.title || "");
      out.methods.push({ key: "best", name: race ? "최근 대회·기록 측정" : "훈련 중 가장 빠른 달리기", vdot: race ? bestVd : bestVd * 1.03, w: race ? 3 : 0.8,
        why: `${new Date(bestRun.started_at).toLocaleDateString("ko-KR")} ${r1(bestRun.km)}km ${fmt(bestRun.duration_s)} (${fmt(bestRun.pace)}/km)${race ? "" : " — 훈련이라 전력이 아니었다고 보고 3% 보정"}` });
      out.floorVd = bestVd;
    }

    // 문진표 기록이 최근 훈련 결과보다 훨씬 빠르면 (오래된 기록일 수 있어요) 비중을 낮춰요
    const recM = out.methods.find((m) => m.key === "rec"), recent = out.methods.filter((m) => m.key !== "rec");
    if (recM && recent.length && (out.n || 0) >= 5) {
      const gapV = recM.vdot - Math.max(...recent.map((m) => m.vdot));
      if (gapV > 5) { recM.w = 0.4; out.notes.push(`문진표 기록(VDOT ${r1(recM.vdot)})이 최근 8주 훈련으로 본 수준(VDOT ${r1(recM.vdot - gapV)})보다 훨씬 빨라요. 오래된 기록이면 최근 기록으로 바꿔 주세요 — 지금은 최근 훈련 쪽을 더 믿었어요.`); }
      else if (gapV > 2) recM.w = 1.5;
    }
    // 종합 VDOT (가중 평균, 실제로 낸 기록보다는 낮게 잡지 않아요)
    const M = out.methods;
    if (M.length) {
      const wsum = M.reduce((s, m) => s + m.w, 0);
      let vd = M.reduce((s, m) => s + m.vdot * m.w, 0) / wsum;
      if (out.floorVd) vd = Math.max(vd, out.floorVd);
      out.vdot = vd;
      const spread = M.length > 1 ? Math.max(...M.map((m) => m.vdot)) - Math.min(...M.map((m) => m.vdot)) : 2;
      // 신뢰도: 데이터 양·방법 수·방법끼리 얼마나 비슷한지
      const score = (M.length >= 3 ? 2 : M.length) + (out.n >= 12 ? 2 : out.n >= 5 ? 1 : 0) + (spread < 2 ? 2 : spread < 4 ? 1 : 0) + (out.weeks >= 6 ? 1 : 0);
      out.conf = score >= 6 ? ["높음", "#16a34a", 0.015] : score >= 4 ? ["보통", "#ea580c", 0.03] : ["낮음", "#dc2626", 0.05];
    }

    // 거리별 예측
    if (out.vdot) {
      const Kplan = p && p.volume && +p.volume.run ? +p.volume.run : null;
      const K = out.K || Kplan || 0;
      out.Kused = out.K ? "최근 8주 실제" : Kplan ? "계획한" : null;
      out.rows = DIST.map(([nm, d]) => {
        let t = E.predict(out.vdot, d);
        const base = t;
        // ⑤ 주간 거리 보정: 하프·풀은 지구력(양)이 부족하면 느려져요
        let adj = 0;
        if (!out.Kused) adj = 0;
        else if (d >= 42000) adj = Math.max(0, 1 - K / 100) * 0.08 + (out.longest && out.longest < 28 ? 0.02 : 0);
        else if (d >= 21000) adj = Math.max(0, 1 - K / 60) * 0.03 + (out.longest && out.longest < 16 ? 0.01 : 0);
        t *= 1 + adj;
        // ④ 풀코스는 Tanda 공식과 섞어요 (4주 이상 데이터가 있을 때)
        let tanda = null;
        if (d >= 42000 && out.K && out.P && out.weeks >= 4) {
          tanda = (17.1 + 140 * Math.exp(-0.0053 * out.K) + 0.55 * out.P) * 42.195;
          t = t * 0.5 + tanda * 0.5;
        }
        const e = out.conf ? out.conf[2] : 0.04;
        return { nm, d, t, base, adj, tanda, lo: t * (1 - e), hi: t * (1 + e * 1.4), pace: t / (d / 1000) };
      });
      // 주간 거리를 늘리면? (Tanda)
      if (out.K && out.P) {
        const t0 = (17.1 + 140 * Math.exp(-0.0053 * out.K) + 0.55 * out.P) * 42.195;
        out.whatIf = [10, 20, 30].map((plus) => { const k = out.K + plus; return { k, gain: t0 - (17.1 + 140 * Math.exp(-0.0053 * k) + 0.55 * out.P) * 42.195 }; });
      }
      // 최근 8주 추세 (심박 VDOT를 2주씩)
      if (H && H.max) {
        const rest = H.rest || 60, buckets = [0, 1, 2, 3].map(() => []);
        runs.forEach((a) => {
          if (!a.avg_hr || a.duration_s < 15 * 60) return;
          const f = (a.avg_hr - rest) / (H.max - rest); if (f < 0.55 || f > 0.98) return;
          const b = Math.min(3, Math.floor((now - new Date(a.started_at)) / (14 * 864e5)));
          buckets[3 - b].push((vo2(a.distance_m / (a.duration_s / 60)) - 3.5) / f + 3.5);
        });
        const avg = buckets.map((x) => (x.length ? x.reduce((s, v) => s + v, 0) / x.length : null));
        const pts = avg.map((v, i) => [i, v]).filter((x) => x[1]);
        if (pts.length >= 2) out.trend = { avg, delta: pts[pts.length - 1][1] - pts[0][1] };
      }
    }

    // 목표 대회
    const up = ((p && p.races) || []).filter((r) => r.date && new Date(r.date + "T00:00:00") >= new Date(new Date().toDateString())).sort((a, b) => a.date.localeCompare(b.date));
    const A = up.find((r) => r.priority === "A") || up[0];
    if (A && out.rows) {
      const ev = `${A.event} ${A.name}`.toLowerCase();
      const row = /full|풀|42/.test(ev) && !/half|하프/.test(ev) ? out.rows[3] : /half|하프|21/.test(ev) ? out.rows[2] : /10/.test(ev) ? out.rows[1] : /5k|5km/.test(ev) ? out.rows[0] : null;
      if (row) {
        const g = p.goal || {}, gt = E.parseTime(g.time);
        const weeks = Math.max(0, Math.round((new Date(A.date + "T00:00:00") - new Date()) / (7 * 864e5)));
        out.race = { r: A, row, weeks, goal: gt && g.event && DIST.find(([n, d]) => d === row.d) ? gt : null };
      }
    }

    // 수영 · 자전거 · 철인3종
    if (ctx && ctx.swim) {
      const c = ctx.swim.css;
      out.swim = [["400m", (c - 3) * 4], ["750m", (c - 1) * 7.5], ["1500m", (c + 1) * 15], ["1.9km (오픈워터)", (c + 4) * 19], ["3.8km (오픈워터)", (c + 6) * 38]];
    }
    if (ctx && ctx.bike && p) {
      const kg = (+p.weight || 70) + 9, ftp = ctx.bike.ftp;
      const speed = (w, cda) => { let v = 8; for (let i = 0; i < 40; i++) { const f = 0.5 * 1.2 * cda * v * v * v + 0.004 * kg * 9.81 * v - w * 0.97; v -= f / (1.5 * 1.2 * cda * v * v + 0.004 * kg * 9.81); } return v; };
      out.bike = [["20km (스프린트)", 20, 1.0], ["40km TT · 올림픽", 40, 0.92], ["90km (하프 아이언맨)", 90, 0.8], ["180km (아이언맨)", 180, 0.71]].map(([n, km, f]) => {
        const v = speed(ftp * f, 0.29); return { n, km, f, kmh: v * 3.6, t: (km * 1000) / v };
      });
    }
    if (out.swim && out.bike && out.rows) {
      const S = Object.fromEntries(out.swim), B = out.bike, R = out.rows;
      out.tri = [
        ["스프린트", S["750m"], 3, B[0].t, 2, R[0].t * 1.04],
        ["올림픽", S["1500m"], 3, B[1].t, 2, R[1].t * 1.06],
        ["하프 아이언맨", S["1.9km (오픈워터)"], 4, B[2].t, 3, R[2].t * 1.1],
        ["아이언맨", S["3.8km (오픈워터)"], 6, B[3].t, 4, R[3].t * 1.16],
      ].map(([n, s, t1, b, t2, r]) => ({ n, s, b, r, t: s + t1 * 60 + b + t2 * 60 + r }));
    }
    return out;
  }

  // ---------- 화면 ----------
  async function open() {
    let d = document.getElementById("predDlg");
    if (!d) { d = document.createElement("dialog"); d.id = "predDlg"; document.body.appendChild(d); d.onclick = (e) => { if (e.target === d) d.close(); }; }
    d.innerHTML = `<div style="padding:18px"><b>🔮 기록 예측</b><p class="hint">훈련 기록을 분석하는 중…</p></div>`;
    if (!d.open) d.showModal();
    const o = await compute();
    const H = (s) => `<div class="eyebrow" style="margin:14px 0 6px">${s}</div>`;
    let html = `<div class="spread"><b style="font-size:17px">🔮 대회 기록 예측</b><button type="button" class="link" data-p="x" style="font-size:20px">✕</button></div>`;
    if (o.runs.length) html += `<p class="hint" style="margin:6px 0 0">최근 ${o.weeks}주 달리기 <b>${o.n}회</b> · 주 평균 <b>${r1(o.K)}km</b> · 평균 페이스 <b>${fmt(o.P)}/km</b> · 가장 긴 달리기 ${r1(o.longest)}km</p>`;
    else html += `<p class="hint" style="margin:6px 0 0">최근 8주 달리기 기록이 없어요. 문진표의 최고기록·테스트로만 예측해요 — 앱으로 기록하거나 시계 기록(FIT)을 가져오면 훨씬 정확해져요.</p>`;
    if (!o.vdot) html += `<div class="note">예측할 정보가 부족해요. 문진표에 5K·10K 기록이나 테스트 결과를 넣거나, 달리기 기록을 3회 이상 쌓아 주세요.</div>`;
    else {
      html += `<div class="pred-head"><div><span>종합 VDOT</span><b>${r1(o.vdot)}</b></div><div><span>신뢰도</span><b style="color:${o.conf[1]}">${o.conf[0]}</b></div>${o.trend ? `<div><span>최근 8주 변화</span><b style="color:${o.trend.delta >= 0 ? "#16a34a" : "#dc2626"}">${o.trend.delta >= 0 ? "▲" : "▼"} ${Math.abs(r1(o.trend.delta))}</b></div>` : ""}</div>`;
      html += H("🏃 달리기 예상 기록");
      html += `<table class="pred-t"><tr><th>거리</th><th>예상 기록</th><th>범위</th><th>평균 페이스</th></tr>${o.rows.map((r) => `<tr><td><b>${r.nm}</b></td><td><b>${fmt(r.t)}</b></td><td class="hint">${fmt(r.lo)} ~ ${fmt(r.hi)}</td><td>${fmt(r.pace)}/km</td></tr>`).join("")}</table>`;
      const full = o.rows[3], half = o.rows[2];
      const adjNotes = [];
      if (half.adj > 0.002) adjNotes.push(`하프: ${o.Kused} 주간 거리 ${r1(o.K || +o.p.volume.run || 0)}km 기준 지구력 보정 +${Math.round(half.adj * 1000) / 10}% (단거리 기록만으로 계산하면 ${fmt(half.base)})`);
      if (full.adj > 0.002) adjNotes.push(`풀코스: 지구력 보정 +${Math.round(full.adj * 1000) / 10}% — 주간 거리가 적거나 30km 가까운 롱런이 없으면 후반에 페이스가 떨어지기 쉬워요 (Vickers & Vertosick 2016)`);
      if (full.tanda) adjNotes.push(`풀코스 Tanda 공식(주 ${r1(o.K)}km · 평균 ${fmt(o.P)}/km): ${fmt(full.tanda)} — VDOT 예측과 반반 섞었어요`);
      if (adjNotes.length) html += `<ul class="pred-ul">${adjNotes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;

      if (o.race) {
        const R = o.race, row = R.row, t = row.t, pace = row.pace;
        const k = row.d / 1000, step = k > 25 ? 5 : k > 8 ? 2 : 1;
        const splits = []; for (let x = step; x < k; x += step) splits.push(x); splits.push(k);
        // 네거티브 스플릿: 전반 +1%, 후반 −1%
        const sp = (x) => (x <= k / 2 ? x * pace * 1.01 : (k / 2) * pace * 1.01 + (x - k / 2) * pace * 0.99);
        html += H(`🏁 ${esc(R.r.name || "목표 대회")} (${esc(R.r.event || row.nm)}) · ${R.weeks}주 남음`);
        html += `<div class="pred-race"><div>지금 예상 <b>${fmt(t)}</b> (${fmt(pace)}/km)</div>${R.goal ? `<div>목표 <b>${fmt(R.goal)}</b> (${fmt(R.goal / k)}/km) → ${R.goal >= t ? `<b style="color:#16a34a">지금 수준으로 가능해요 ✅</b>` : `<b style="color:#ea580c">${fmt(t - R.goal)} 더 줄여야 해요</b> — VDOT ${r1(E.vdotFrom(row.d, R.goal))} 필요 (지금 ${r1(o.vdot)})`}</div>` : ""}
          <div class="hint">대회 전략: 처음 ${k > 20 ? "5km" : "1~2km"}는 ${fmt(pace * 1.015)}/km로 참고 출발 → 중반 ${fmt(pace)} → 마지막 ${k > 20 ? "10km" : "2km"}에 ${fmt(pace * 0.985)}로 올리기</div>
          <table class="pred-t"><tr><th>구간</th><th>통과 시간</th></tr>${splits.map((x) => `<tr><td>${Number.isInteger(x) ? x : r1(x)}km</td><td>${fmt(sp(x))}</td></tr>`).join("")}</table></div>`;
      }
      if (o.whatIf) html += H("📈 주간 거리를 늘리면? (풀코스, Tanda 기준)") + `<ul class="pred-ul">${o.whatIf.map((w) => `<li>주 ${Math.round(w.k)}km로 늘리면 약 <b>${Math.max(0, Math.round(w.gain / 60))}분</b> 단축 (같은 평균 페이스 기준)</li>`).join("")}</ul><p class="hint" style="margin:0">양은 주당 10% 안팎으로 천천히 늘려야 부상 없이 효과가 나요.</p>`;
      html += H("🔍 어떻게 계산했나요") + `<table class="pred-t"><tr><th>방법</th><th>VDOT</th><th>반영</th></tr>${o.methods.map((m) => `<tr><td><b>${esc(m.name)}</b><br><span class="hint">${esc(m.why)}</span></td><td>${r1(m.vdot)}</td><td>${Math.round((m.w / o.methods.reduce((s, x) => s + x.w, 0)) * 100)}%</td></tr>`).join("")}</table>`;
      const tips = [...o.notes];
      if (!o.methods.some((m) => m.key === "hr")) tips.push("심박이 들어간 기록(시계 FIT 파일)과 최대·안정시 심박을 넣으면 훈련 페이스로도 예측해서 더 정확해져요.");
      if (!o.methods.some((m) => m.key === "rec")) tips.push("문진표에 최근 5K·10K 기록이나 테스트 결과를 넣어 주세요 — 가장 믿을 만한 기준이에요.");
      if ((o.n || 0) < 8) tips.push("최근 8주 기록이 적어요. 기록이 쌓일수록 범위가 좁아져요.");
      if (tips.length) html += H("💡 더 정확하게 하려면") + `<ul class="pred-ul">${tips.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
    }
    if (o.swim) html += H("🏊 수영 (CSS " + fmt(o.ctx.swim.css) + "/100m 기준)") + `<table class="pred-t">${o.swim.map(([n, t]) => `<tr><td>${n}</td><td><b>${fmt(t)}</b></td></tr>`).join("")}</table>`;
    if (o.bike) html += H(`🚴 자전거 (FTP ${o.ctx.bike.ftp}W · 체중 ${+o.p.weight || 70}kg · 평지·무풍 기준)`) + `<table class="pred-t"><tr><th>거리</th><th>예상 기록</th><th>평균 속도 · 강도</th></tr>${o.bike.map((b) => `<tr><td>${b.n}</td><td><b>${fmt(b.t)}</b></td><td>${r1(b.kmh)}km/h · FTP ${Math.round(b.f * 100)}%</td></tr>`).join("")}</table><p class="hint" style="margin:4px 0 0">언덕·바람·자세(공기저항)에 따라 크게 달라져요.</p>`;
    if (o.tri) html += H("🏊🚴🏃 철인3종 (바꿈터 포함)") + `<table class="pred-t"><tr><th>코스</th><th>수영</th><th>자전거</th><th>달리기</th><th>합계</th></tr>${o.tri.map((t) => `<tr><td>${t.n}</td><td>${fmt(t.s)}</td><td>${fmt(t.b)}</td><td>${fmt(t.r)}</td><td><b>${fmt(t.t)}</b></td></tr>`).join("")}</table><p class="hint" style="margin:4px 0 0">달리기는 자전거 뒤라 단독 기록보다 4~16% 느리게 잡았어요.</p>`;
    html += `<p class="hint" style="margin:14px 0 0">예측은 날씨·코스·컨디션·페이스 조절에 따라 달라져요. 참고: 다니엘스 러닝 포뮬러(VDOT), Tanda 2011(J Hum Sport Exerc), Vickers & Vertosick 2016(BMC Sports Sci Med Rehabil).</p>`;
    d.innerHTML = `<div style="padding:18px;max-height:88vh;overflow:auto">${html}</div>`;
    d.querySelector('[data-p="x"]').onclick = () => d.close();
  }

  document.addEventListener("click", (e) => { const b = e.target.closest("[data-predict]"); if (b) { e.preventDefault(); open(); } });
  TS.predict = { compute, open };
})();
