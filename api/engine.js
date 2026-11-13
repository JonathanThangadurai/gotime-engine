// ===== GOTime engine v2 (browser port, demo) =====
// Heat: Liljegren (2008) WBGT -> adapted heat bands + simplified ISO 7933 heat budget (time to 39 C core).
// Air: Stafoggia 2023 Table S3 slopes x run dose share, at the LOCAL temperature percentile; India NAQI / EU bands as guard rails.
// Cardio heat term: Rowland 2020 slope above a LOCAL reference (adaptation shift). Cold: wind chill at running airflow,
// breathing heat loss, warm-up rule. Pollen: Scholten 50 grains/m3.
// Tips ("what pros do"): at most one per day, from the run hours' conditions; see pickTip().
const ENG = (() => {
  const C_REF = { pm25: 15, pm10: 45, no2: 25, o3: 100 };
  const NAMES = { pm25: "PM2.5", pm10: "PM10", no2: "NO₂", o3: "Ozone" };
  const S3 = {
    pm10: [[1,.54],[5,.48],[15,.31],[25,.19],[50,.43],[75,.09],[85,.31],[95,.90],[99,1.21]],
    pm25: [[1,-.41],[5,-.25],[15,.14],[25,.30],[50,.29],[75,-.10],[85,.18],[95,.81],[99,1.11]],
    o3:   [[1,0],[5,-.04],[15,-.08],[25,-.05],[50,.17],[75,-.08],[85,.12],[95,.42],[99,.53]],
    no2:  [[1,.99],[5,.95],[15,.78],[25,.70],[50,.62],[75,.31],[85,.44],[95,.81],[99,1.00]],
  };
  const BETA_W = Math.log(1.079) / 16 / 0.94;
  const POLLEN_LIMIT = 50, T_CORE_LIM = 39.0;
  const interp = (rows, x) => { if (x <= rows[0][0]) return rows[0][1]; const n = rows.length;
    if (x >= rows[n-1][0]) return rows[n-1][1];
    for (let i = 1; i < n; i++) if (x <= rows[i][0]) { const [x0,y0] = rows[i-1], [x1,y1] = rows[i]; return y0 + (y1-y0)*(x-x0)/(x1-x0); } };
  const esK = T => 0.6112 * Math.exp(17.62 * T / (243.12 + T));          // kPa, T in C
  const dewPoint = (T, RH) => { const g = Math.log(Math.max(1, RH)/100) + 17.62*T/(243.12+T); return 243.12*g/(17.62-g); };

  // ---------- sun ----------
  function cosZenith(lat, lon, tz, dateStr, hourMid) {
    const d = new Date(dateStr + "T00:00:00Z"), doy = Math.floor((d - Date.UTC(d.getUTCFullYear(),0,0)) / 864e5);
    const rad = Math.PI/180, decl = 23.44*rad*Math.sin(2*Math.PI*(284+doy)/365);
    const B = 2*Math.PI*(doy-81)/365, eot = 9.87*Math.sin(2*B) - 7.53*Math.cos(B) - 1.5*Math.sin(B);
    const solar = hourMid + (4*lon - 60*tz + eot)/60, ha = 15*(solar-12)*rad;
    return Math.sin(lat*rad)*Math.sin(decl) + Math.cos(lat*rad)*Math.cos(decl)*Math.cos(ha);
  }

  // ---------- Liljegren WBGT ----------
  const SIG=5.6696e-8, CP=1003.5, MA=28.97, MW=18.015, RA=8314.34/MA, RATIO=CP*MA/MW, PR=CP/(CP+1.25*RA);
  const visc = T => { const om = (T/97 - 2.9)/0.4*(-0.034) + 1.048; return 2.6693e-6*Math.sqrt(MA*T)/(3.617*3.617*om); };
  const kAir = T => (CP + 1.25*RA)*visc(T);
  const diffu = (T,P) => 2.5e-5*Math.pow(T/298.15,1.75)*(1013.25/P);
  const evapH = T => (313.15 - T)/30*(-71100) + 2.4073e6;
  const hSphere = (D,T,P,u) => { const rho = P*100/(RA*T), Re = Math.max(u,0.5)*rho*D/visc(T); return (2 + 0.6*Math.sqrt(Re)*Math.pow(PR,1/3))*kAir(T)/D; };
  const hCyl = (D,T,P,u) => { const rho = P*100/(RA*T), Re = Math.max(u,0.5)*rho*D/visc(T); return 0.281*Math.pow(Re,0.6)*Math.pow(PR,0.44)*kAir(T)/D; };
  function wbgtLiljegren(Tc, RH, SW, u2, cza, P = 1010) {
    const Ta = Tc + 273.15, ea = RH/100*esK(Tc)*10;                       // hPa
    let solar = cza > 0.0087 ? SW : 0, fdir = 0, Z = Math.acos(Math.max(0.0087, Math.min(1, cza)));
    if (solar > 0) { const s = Math.min(0.85, solar/(1367*Math.max(cza,0.0087))); fdir = Math.min(0.9, Math.exp(3 - 1.34*s - 1.65/s)); }
    const emA = 0.575*Math.pow(ea, 1/7), Ts = Ta;
    let Tg = Ta;                                                            // globe
    for (let i = 0; i < 60; i++) { const h = hSphere(0.0508, 0.5*(Tg+Ta), P, u2);
      const n = Math.pow(Math.max(1, 0.5*(emA*Ta**4 + 0.999*Ts**4) - h/(SIG*0.95)*(Tg-Ta) + solar/(2*SIG*0.95)*(0.95)*(fdir*(1/(2*Math.max(cza,0.05)) - 1) + 1 + 0.45)), 0.25);
      if (Math.abs(n - Tg) < 0.01) { Tg = n; break; } Tg = 0.9*Tg + 0.1*n; }
    const Td = (() => { const g = Math.log(RH/100) + 17.62*Tc/(243.12+Tc); return 243.12*g/(17.62-g) + 273.15; })();
    let Tw = Td;                                                            // natural wet bulb
    for (let i = 0; i < 60; i++) { const Tr = 0.5*(Tw+Ta), h = hCyl(0.007, Tr, P, u2);
      const Fat = SIG*0.95*(0.5*(emA*Ta**4 + 0.999*Ts**4) - Tw**4) + 0.6*solar*((1-fdir)*(1 + 0.25*0.007/0.0254) + fdir*(Math.tan(Math.min(Z, 1.47))/Math.PI + 0.25*0.007/0.0254) + 0.45);
      const ew = esK(Tw-273.15)*10, rho = P*100/(RA*Tr), Sc = visc(Tr)/(rho*diffu(Tr,P));
      const n = Ta - evapH(Tr)/RATIO*(ew - ea)/(P - ew)*Math.pow(PR/Sc, 0.56) + Fat/h;
      if (Math.abs(n - Tw) < 0.01) { Tw = n; break; } Tw = 0.9*Tw + 0.1*n; }
    const tg = Tg - 273.15, tnw = Tw - 273.15;
    // mean radiant temperature for a standing person (direct, diffuse, reflected sun + long-wave), used by the heat budget
    const elev = 90 - Z*180/Math.PI, fp = 0.308*Math.cos((elev*(1 - elev*elev/48402))*Math.PI/180);
    const I = solar > 0 ? solar*fdir/Math.max(cza, 0.05) : 0, Dif = solar*(1 - fdir), Ref = 0.2*solar;
    const Sstr = 0.7*(fp*I + 0.5*Dif + 0.5*Ref) + 0.97*0.5*(emA*SIG*Ta**4 + 0.999*SIG*Ts**4);
    const tmrt = Math.pow(Sstr/(0.97*SIG), 0.25) - 273.15;
    return { W: 0.7*tnw + 0.2*tg + 0.1*Tc, tg, tnw, tmrt };
  }

  // ---------- adapted heat bands ----------
  // Unadapted: ACSM race bands 18/23/28 C WBGT. Heat-adapted: +4.4 C (ISO 7243 acclimatisation offset at running effort),
  // which puts the "indoors" line at 32.4 C, matching the US Army Category 5 line (32.2 C) for acclimatised soldiers.
  const bandEdges = acc => acc ? [22.4, 27.4, 32.4] : [18, 23, 28];
  const heatBand = (W, acc) => { const e = bandEdges(acc); return W < e[0] ? 0 : W < e[1] ? 1 : W < e[2] ? 2 : 3; };
  // Air guard rails (hourly): PM2.5 India NAQI 60/120/250; ozone EU information 180 / alert 240.
  const airBand = (pm25, o3) => Math.max(pm25 > 250 ? 3 : pm25 > 120 ? 2 : pm25 > 60 ? 1 : 0, o3 > 240 ? 2 : o3 > 180 ? 1 : 0);
  // Cold: wind chill at running airflow (Environment Canada): -10 / -27 / -40
  const wct = (T, v) => v < 4.8 ? T : 13.12 + 0.6215*T - 11.37*Math.pow(v,0.16) + 0.3965*T*Math.pow(v,0.16);
  const coldBand = c => c > -10 ? 0 : c > -27 ? 1 : c > -40 ? 2 : 3;

  // ---------- exertion ----------
  const metFromSpeed = s => { const m = s*60; return m >= 134 ? (0.2*m + 3.5)/3.5 : (0.1*m + 3.5)/3.5; };   // s in m/s, ACSM
  const bsa = (kg, m) => 0.202*Math.pow(kg,0.425)*Math.pow(m,0.725);
  const CLOTH = { kit: { d: 1, e: 1, label: "Running kit" }, light: { d: 0.85, e: 0.85, label: "Full-length, light" }, cotton: { d: 0.8, e: 0.7, label: "Full-length cotton" } };

  // Simplified ISO 7933 (Predicted Heat Strain) heat budget for one hour's conditions at a given running speed.
  function budget(c, speed, u) {
    const A = bsa(u.kg, u.height), met = metFromSpeed(speed), M = met*1.163*u.kg;
    const cl = CLOTH[u.cloth] || CLOTH.kit;
    const v = speed + 0.5*c.u2, hc = 8.3*Math.pow(v, 0.6), hr = 4.7;
    const Tsk = Math.min(36, 33.5 + 0.1*Math.max(0, c.t - 25));
    const Tmrt = c.tmrt;
    const Pa = c.rh/100*esK(c.t), Psk = esK(Tsk);
    const dry = A*cl.d*(hc*(Tsk - c.t) + 0.72*hr*(Tsk - Tmrt));                 // + = loss
    const resp = 0.0014*M*(34 - c.t) + 0.0173*M*(5.87 - Pa);
    const Ereq = M - dry - resp;
    const wmax = u.acc ? 1 : 0.85, SWmax = 400*A*(u.acc ? 1.25 : 1);
    const Emax1 = A*16.5*hc*Math.max(0.05, Psk - Pa)*cl.e;
    let Eact, sweat, S;
    if (Ereq <= 0) { Eact = 0; sweat = 0; S = 0; }
    else { const w = Ereq/Emax1;
      if (w <= wmax) { const r = 1 - w*w/2, SWreq = Ereq/r;
        if (SWreq <= SWmax) { Eact = Ereq; sweat = SWreq; S = 0; } else { Eact = SWmax*r; sweat = SWmax; S = Ereq - Eact; } }
      else { const r = 1 - wmax*wmax/2; Eact = Math.min(Emax1*wmax, SWmax*r); sweat = Math.min(SWmax, Eact/r); S = Ereq - Eact; } }
    const Teq = 36.6 + 0.0036*(M/A);
    // spare cooling (W) when the heat budget balances: lets stored heat drain after an over-hot spell
    const spare = S > 0 || Ereq <= 0 ? (Ereq <= 0 ? Math.min(-Ereq, 300) : 0) : Math.max(0, Math.min(Emax1*wmax, SWmax*(1 - wmax*wmax/2)) - Ereq);
    // minutes to the core limit
    // core = approach to the steady-state core (10-min time constant) + heat that cannot be shed, stored in the body
    let base = 37.0, store = 0, dlim = 240; const rise = S*60/(u.kg*3490);
    for (let t = 1; t <= 240; t++) { base += (Teq - base)/10; store += rise; if (base + store >= T_CORE_LIM) { dlim = t; break; } }
    const sweatMlH = sweat*3600/2426;
    return { A, met, M, hc, Tsk, Tmrt, dry, resp, Ereq, Emax: Emax1*wmax, SWmax, sweatMlH, S, Teq, dlim, rise, drain: spare*60/(u.kg*3490) };
  }
  // Fastest speed (m/s) whose budget allows the planned minutes; null if even a 4 km/h walk fails
  function maxSpeedFor(c, minutes, u) {
    if (budget(c, 1.11, u).dlim < minutes) return null;
    let lo = 1.11, hi = 5.5; if (budget(c, hi, u).dlim >= minutes) return hi;
    for (let i = 0; i < 22; i++) { const m = (lo+hi)/2; if (budget(c, m, u).dlim >= minutes) lo = m; else hi = m; }
    return lo;
  }
  const paceOf = s => 1000/s/60;                    // min/km
  const fmtPace = p => { if (!isFinite(p)) return "--"; let m = Math.floor(p), s = Math.round((p-m)*60); if (s === 60) { m++; s = 0; } return m + ":" + String(s).padStart(2,"0"); };
  const fmtHM = h => { h = ((h % 24) + 24) % 24; const hh = Math.floor(h), mm = Math.round((h-hh)*60); return mm === 60 ? (hh+1) + ":00" : hh + ":" + String(mm).padStart(2,"0"); };
  const compass = d => ["north","north-east","east","south-east","south","south-west","west","north-west"][Math.round(((d%360)+360)%360/45)%8];
  const FLAGS = ["Green","Yellow","Red","Black"];

  // breathing heat loss (W) at a given MET, mass and air
  function breathLoss(met, kg, T, RH) {
    const VE = 25*met*3.5*kg/1000, mdot = VE/1000/60*1.2;               // kg/s
    const AHin = 0.622*RH/100*esK(T)/(101.3), AHex = 0.622*esK(34)/101.3;
    return mdot*(1006*(34 - T) + 2.43e6*Math.max(0, AHex - AHin));
  }

  function hourConditions(d, h, loc) {
    const u2 = Math.max(0.5, d.ws[h]/3.6*0.7);
    const cza = cosZenith(loc.lat, loc.lon, loc.tzFor(d.date), d.date, h - 0.5);
    const w = wbgtLiljegren(d.t[h], d.rh[h], d.sw[h], u2, cza);
    return { h, t: d.t[h], rh: d.rh[h], sw: d.sw[h], ws: d.ws[h], wd: d.wd[h], u2, cza, W: w.W, tg: w.tg, tnw: w.tnw, tmrt: w.tmrt,
             pm25: d.pm25[h], pm10: d.pm10[h], no2: d.no2[h], o3: d.o3[h], pollen: d.pollen ? d.pollen[h] : null };
  }

  // "What pros do": pro-level guidance in an everyday dose, at most one per day, first match in this priority.
  // Uses only today's inputs, over the hours the planned run covers (start to start + duration; the best hour on an
  // indoor day). u.evening: the recommendation is for the message the evening before.
  //  1 TIP_COLD_HARD_INDOORS  air temp <= -15 C                                    published_consensus (FIS)
  //  2 TIP_HEAT_NOT_ADAPTED   heat band >= 1 and athlete not acclimatised           published_consensus (Racinais 2015)
  //  3 TIP_PRECOOL            heat band >= 2, not an indoor day                      published_research (Choo 2018)
  //  4 TIP_HYDRATE_EVENING    evening message and heat band >= 1                     published_consensus (Racinais 2015)
  //  5 TIP_RUN_BY_FEEL        heat band >= 1 and dew point >= 16 C                  published_research
  //  6 TIP_COLD_WARMUP        air temp < 0 C or wind chill (running airflow) <= -10 C   published_consensus (FIS)
  function pickTip(hours, start, u, indoor, best) {
    const h0 = Math.floor(start), h1 = Math.max(h0, Math.ceil(start + u.minutes/60) - 1);
    const span = indoor ? [best] : hours.filter(x => x.h >= h0 && x.h <= h1);
    if (!span.length) return null;
    const hb = Math.max(...span.map(x => x.hb)), tMin = Math.min(...span.map(x => x.t)), chill = Math.min(...span.map(x => x.head));
    const dew = Math.max(...span.map(x => dewPoint(x.t, x.rh)));
    const r = x => Math.round(x*10)/10;
    if (tMin <= -15) return { code: "TIP_COLD_HARD_INDOORS", evidence: "published_consensus", params: { air_temp_c: r(tMin) } };
    if (hb >= 1 && !u.acc) return { code: "TIP_HEAT_NOT_ADAPTED", evidence: "published_consensus", params: { heat_level: hb } };
    if (hb >= 2 && !indoor) return { code: "TIP_PRECOOL", evidence: "published_research", params: { heat_level: hb } };
    if (u.evening && hb >= 1) return { code: "TIP_HYDRATE_EVENING", evidence: "published_consensus", params: { heat_level: hb } };
    if (hb >= 1 && dew >= 16) return { code: "TIP_RUN_BY_FEEL", evidence: "published_research", params: { dew_point_c: r(dew) } };
    if (tMin < 0 || chill <= -10) return { code: "TIP_COLD_WARMUP", evidence: "published_consensus", params: { air_temp_c: r(tMin), wind_chill_c: r(chill) } };
    return null;
  }

  function evaluate(d, u, loc) {
    const speed = 1000/(u.pace*60), met = metFromSpeed(speed), kmh = speed*3.6;
    const f = Math.max(0, (met - 1.55)*u.minutes/(1.55*1440));
    const dayMean = d.t.reduce((a,b)=>a+b,0)/24, pct = interp(loc.clim, dayMean);
    const beta = Object.fromEntries(Object.keys(S3).map(k => [k, Math.max(0, Math.log(1 + interp(S3[k], pct)/100)/10)]));
    const W0 = loc.W0;
    const routes = loc.routes;
    const hours = [];
    for (let h = 0; h < 24; h++) {
      const c = hourConditions(d, h, loc);
      const b = budget(c, speed, u);
      const hb = heatBand(c.W, u.acc);
      const head = wct(c.t, c.ws + 1.5*kmh), tail = wct(c.t, Math.abs(c.ws - 1.5*kmh));
      const cb = coldBand(head);
      // air dose per route
      const air = routes.map(r => { let P = 0, drv = null;
        for (const k of Object.keys(C_REF)) { const conc = c[k]*(r.x[k] || 1); const v = beta[k]*f*Math.max(0, conc - C_REF[k]); if (v > P) { P = v; drv = k; } }
        return { P, drv, ab: airBand(c.pm25*(r.x.pm25||1), c.o3) }; });
      const ri = air[0].P <= air[1].P ? 0 : 1, A = air[ri];
      const H = BETA_W*Math.max(0, c.W - W0);
      const rr = Math.exp(H + A.P);
      const pollenHigh = c.pollen != null && c.pollen >= POLLEN_LIMIT;
      const ab = A.ab;
      const flag = Math.max(hb, ab, cb);
      const short = Math.max(0, u.minutes - b.dlim)/u.minutes;
      const coldPen = Math.max(0, 0 - head)*0.6 + (c.t < 0 ? 2 : 0);   // demo weights
      const score = flag*10 + short*15 + (rr - 1)*100 + (u.hayfever && pollenHigh ? 6 + c.pollen/40 : 0) + coldPen;
      hours.push({ ...c, b, hb, ab, cb, flag, H, P: A.P, driver: A.drv, route: ri, airAlt: air[1-ri], rr, head, tail, pollenHigh, short, score });
    }
    const nowH = Math.floor(u.now);
    const pool = hours.filter(x => x.h >= Math.max(5, nowH) && x.h <= 21);
    const usable = pool.filter(x => x.flag <= 2 && x.b.dlim >= 15);
    const indoor = usable.length === 0;
    const best = (usable.length ? usable : (pool.length ? pool : hours)).reduce((a,b) => b.score < a.score ? b : a);
    const worst = (pool.length ? pool : hours).reduce((a,b) => b.score > a.score ? b : a);
    let s = best.h, e = best.h;
    const ok = x => x && x.flag <= Math.max(best.flag, 1) && x.h >= 5 && x.h <= 21 && x.h >= nowH && x.b.dlim >= u.minutes && !(u.hayfever && x.pollenHigh && !best.pollenHigh) && x.score <= best.score + (best.flag === 0 ? 13 : 3);
    while (ok(hours[s-1])) s--; while (ok(hours[e+1])) e++;
    const end = e + 1, start = Math.max(s, u.now);
    const capS = indoor ? null : maxSpeedFor(best, u.minutes, u);
    const dlimPlan = best.b.dlim;
    const route = routes[best.route];
    // direction along the route axis: start into the wind
    const along = best.ws*Math.cos((best.wd - route.axis)*Math.PI/180);
    const direction = Math.abs(along) < 3 ? { short: "Any direction", text: "Wind is light along the route." }
      : along >= 0 ? { short: route.into[0], text: route.into[1] } : { short: route.away[0], text: route.away[1] };
    const loss = best.b.sweatMlH*u.minutes/60;
    const drink = loss < 400 ? "Optional" : (Math.round(loss*0.6/50)*50) + " ml";
    // headline
    let headline, sub, mode = "go", hc, sc;                   // hc / sc: machine codes + params for the API
    const why = best.ab >= best.hb && best.ab >= best.cb && best.ab > 0 ? "air" : best.cb > best.hb ? "cold" : "heat";
    if (indoor) { mode = "indoor";
      const smoke = pool.some(x => x.ab === 3), hot = pool.some(x => x.hb === 3 || x.b.dlim < 15);
      headline = "Train indoors today"; hc = { code: "INDOOR_TODAY", params: {} };
      if (smoke && !hot) { sub = "Smoke is too thick outside."; sc = { code: "REASON_SMOKE", params: {} }; }
      else if (hot) { sub = "Too hot and humid for a safe run."; sc = { code: "REASON_HEAT", params: {} }; }
      else { sub = "Conditions are against you all day."; sc = { code: "REASON_MIXED", params: {} }; } }
    else if (dlimPlan < u.minutes) { mode = "short";
      if (start <= u.now + 0.5) { headline = "Go now, keep it short"; hc = { code: "GO_NOW_SHORT", params: {} }; }
      else { headline = `Run at ${fmtHM(s)}, keep it short`; hc = { code: "GO_AT_SHORT", params: { start: fmtHM(s) } }; }
      sub = `${dlimPlan} min at your pace, or slow down for the full ${u.minutes}.`; sc = { code: "SHORT_OR_SLOWER", params: { max_minutes: dlimPlan, planned_minutes: u.minutes } }; }
    else if (start <= u.now + 0.5) {
      if (end - u.now <= 6) { headline = "Run before " + fmtHM(end); hc = { code: "GO_BEFORE", params: { end: fmtHM(end) } }; sub = "After that, conditions turn against you."; sc = { code: "WORSE_LATER", params: {} }; }
      else { headline = "Good to go now"; hc = { code: "GO_NOW", params: {} }; sub = "Conditions stay fine for hours."; sc = { code: "STAYS_FINE", params: {} }; } }
    else if (e >= 21) { headline = "Run after " + fmtHM(s); hc = { code: "GO_AFTER", params: { start: fmtHM(s) } }; const ex = hours.filter(x => x.h >= Math.max(5, nowH) && x.h < s);
      const mx = k => Math.max(0, ...ex.map(x => x[k])), pv = { hb: mx("hb"), ab: mx("ab"), cb: mx("cb"), t: ex.length ? Math.min(...ex.map(x => x.t)) : best.t };
      if (pv.cb > 0 && pv.cb >= pv.hb && pv.cb >= pv.ab || pv.t < 2) { sub = "Too cold and windy until then."; sc = { code: "COLD_UNTIL", params: {} }; }
      else if (pv.ab > pv.hb) { sub = "The air clears by then."; sc = { code: "AIR_CLEARS", params: {} }; }
      else { sub = "Too warm until then."; sc = { code: "HEAT_UNTIL", params: {} }; } }
    else { headline = "Run " + fmtHM(s) + "–" + fmtHM(end); hc = { code: "GO_BETWEEN", params: { start: fmtHM(s), end: fmtHM(end) } };
      if (why === "air" && hours[nowH] && hours[nowH].ab >= 2) { sub = "Skip the early slot today: smoke."; sc = { code: "SKIP_EARLY_SMOKE", params: {} }; }
      else { sub = "That's your best window today."; sc = { code: "BEST_WINDOW", params: {} }; } }
    if (!indoor && best.flag === 2 && mode === "go") { sub = "Go easy: " + (why === "air" ? "the air is poor." : why === "cold" ? "it is bitterly cold." : "hot and humid."); sc = { code: why === "air" ? "EASY_AIR" : why === "cold" ? "EASY_COLD" : "EASY_HEAT", params: {} }; }
    // reasons ranked
    const reasons = [];
    const lim = bandEdges(u.acc);
    reasons.push({ k: "Heat", code: best.hb === 0 && worst.hb <= 1 ? "HEAT_LOW" : "HEAT_RISES", v: worst.hb*3 + (worst.short || 0)*4 - best.hb*3, tag: "Standard + physiology",
      text: best.hb === 0 && worst.hb <= 1 ? `Heat stress ${best.W.toFixed(1)} °C, comfortably low.`
        : `Heat stress ${best.W.toFixed(1)} °C in your slot, ${worst.W.toFixed(1)} °C at ${worst.h}:00. ${u.acc ? "Heat-adapted" : "Not heat-adapted"}: indoors above ${lim[2]} °C. Body heat budget: ${dlimPlan >= 240 ? "no time limit" : dlimPlan + " min"} at your pace.` });
    const drv = worst.driver || best.driver;
    const altGain = best.airAlt.P > best.P*1.05 ? Math.round((1 - best.P/Math.max(1e-9, best.airAlt.P))*100) : 0;
    reasons.push({ k: "Air", code: best.pm25 > 60 || worst.pm25 > 60 ? "AIR_PM_EPISODE" : drv ? "AIR_PEAK_LATER" : "AIR_CLEAN", routeSaving: altGain, v: (worst.ab - best.ab)*3 + (worst.P - best.P)*200, tag: "Published slopes",
      text: (best.pm25 > 60 || worst.pm25 > 60 ? `PM2.5 ${Math.round(worst.pm25)} µg/m³ at ${worst.h}:00, ${Math.round(best.pm25)} in your slot.` : drv ? `${NAMES[drv]} ${Math.round(worst[drv])} µg/m³ at ${worst.h}:00 vs ${Math.round(best[drv])} in your slot.` : "Air under WHO guideline levels all day.")
        + (altGain > 5 ? (best.P < 1e-6 ? ` On ${route.name} you stay under WHO levels; on ${routes[1-best.route].name} you would not.` : ` ${route.name} cuts your extra dose by ${altGain}% vs ${routes[1-best.route].name}.`) : "") });
    if (u.hayfever) reasons.push({ k: "Pollen", code: d.pollen == null ? "POLLEN_NOT_COVERED" : hours.some(x => x.pollenHigh) ? (best.pollenHigh ? "POLLEN_HIGH_IN_WINDOW" : "POLLEN_PEAK_AVOIDED") : "POLLEN_LOW", v: worst.pollenHigh ? 2 : 0, tag: "Published threshold",
      text: d.pollen == null ? "No pollen forecast for this region." : hours.some(x => x.pollenHigh) ? `Pollen peaks at ${Math.round(Math.max(...hours.map(x=>x.pollen||0)))} grains/m³; your slot is ${best.pollenHigh ? "still high" : "below 50"}.` : "Pollen low all day." });
    const breath = breathLoss(met, u.kg, best.t, best.rh);
    if (best.t < 8) reasons.push({ k: "Cold", code: "COLD_WARM_UP", v: best.cb*3 + Math.max(0, 5 - best.head)/3, tag: "Mechanism + demo weights",
      text: `Wind chill ${best.head.toFixed(0)} °C running into the wind. Cold air raises blood pressure: warm up indoors, keep the first km easy. Breathing costs you ${Math.round(breath)} W of heat.` });
    reasons.push({ k: "Wind", code: direction.short === "Any direction" ? "WIND_LIGHT" : "WIND_START_INTO", v: 0.5, tag: "Physics", text: `${Math.round(best.ws)} km/h from the ${compass(best.wd)}. ${direction.text}` });
    reasons.push({ k: "You", code: u.acc ? "ATHLETE_ADAPTED" : "ATHLETE_NOT_ADAPTED", v: 0, tag: "Your settings", text: `${u.acc ? "Heat-adapted" : "Not heat-adapted"}, ${u.kg} kg, ${(u.height*100).toFixed(0)} cm, ${(CLOTH[u.cloth]||CLOTH.kit).label.toLowerCase()}.` });
    reasons.sort((a,b) => b.v - a.v);
    const tip = pickTip(hours, start, u, indoor, best);
    return { hours, best, worst, start, end, s, e, headline, sub, hc, sc, mode, along, direction, route, drink, loss, capS, dlimPlan, met, f, pct, W0, reasons, kmh, speed, breath, why, indoor, tip };
  }
  return { evaluate, pickTip, dewPoint, budget, maxSpeedFor, hourConditions, wbgtLiljegren, cosZenith, paceOf, fmtPace, fmtHM, compass, FLAGS, NAMES, C_REF, heatBand, bandEdges, metFromSpeed, CLOTH, wct, airBand };
})();
if (typeof module !== "undefined") module.exports = ENG;
