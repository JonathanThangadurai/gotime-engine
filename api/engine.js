// ===== GOTime run engine (browser and Node) =====
// Runner-facing decisions use forecast facts only:
//  - Heat: Liljegren (2008) WBGT -> heat bands (ACSM 18/23/28 C; +4.4 C for heat-adapted athletes). Conservative prompts.
//  - Air: concentrations against guidelines with their own averaging: WHO 2021 PM2.5, PM10 and NO2 as 24-h means and
//    ozone as the maximum 8-h mean (exceedance), India NAQI PM2.5 bands on the 24-h mean (level), EU ozone 180 / 240
//    on hourly values (information / alert thresholds, not a clearance). Hourly values only rank the hours for timing.
//  - Cold: wind chill at running airflow (Environment Canada bands). Pollen: per taxon; 50 grains/m3 for grass only.
// Experimental (never on runner screens): a simplified ISO 7933 heat budget (time to 39 C core, sweat, pace limit).
// No epidemiological relative risk is used here: the Stafoggia et al. 2023 tables belong to the population alert (Python).
// Tips ("what pros do"): at most one per day, from the run hours' conditions; see pickTip().
const ENG = (() => {
  // WHO 2021 air quality guidelines, short-term: PM2.5 15, PM10 45, NO2 25 (24-h means), ozone 100 (max daily 8-h mean)
  const WHO = { pm25: 15, pm10: 45, no2: 25, o3: 100 };
  const C_REF = WHO;   // name kept for callers
  const AVG = { pm25: "24-h mean", pm10: "24-h mean", no2: "24-h mean", o3: "max 8-h mean" };
  const NAMES = { pm25: "PM2.5", pm10: "PM10", no2: "NO₂", o3: "Ozone" };
  const GRASS_LIMIT = 50, T_CORE_LIM = 39.0;   // grass pollen threshold (Scholten); core limit for the experimental budget
  const TAXA = ["grass", "birch", "alder", "mugwort"];
  const interp = (rows, x) => { if (x <= rows[0][0]) return rows[0][1]; const n = rows.length;
    if (x >= rows[n-1][0]) return rows[n-1][1];
    for (let i = 1; i < n; i++) if (x <= rows[i][0]) { const [x0,y0] = rows[i-1], [x1,y1] = rows[i]; return y0 + (y1-y0)*(x-x0)/(x1-x0); } };
  const esK = T => 0.6112 * Math.exp(17.62 * T / (243.12 + T));          // kPa, T in C
  const dewPoint = (T, RH) => { const g = Math.log(Math.max(1, RH)/100) + 17.62*T/(243.12+T); return 243.12*g/(17.62-g); };

  // ---------- time zones ----------
  // UTC offset (hours) of an IANA zone at an instant, and local wall time -> UTC. Works in Node and browsers (Intl).
  const TZF = {};
  const fmtFor = tz => TZF[tz] || (TZF[tz] = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }));
  function offsetAt(tz, utcMs) {
    const p = {}; for (const x of fmtFor(tz).formatToParts(new Date(utcMs))) p[x.type] = x.value;
    return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(utcMs / 1000) * 1000) / 3600000;
  }
  /** Local wall time (date + decimal hour) in zone tz -> UTC milliseconds. A repeated hour (autumn) resolves to its
   *  first occurrence; a skipped hour (spring) moves forward, as clocks do (02:30 -> 03:30). */
  function localToUtcMs(tz, dateStr, hourDec) {
    const wall = Date.parse(dateStr + "T00:00:00Z") + Math.round(hourDec * 3600) * 1000;
    const before = offsetAt(tz, wall - 12 * 3600000), after = offsetAt(tz, wall + 12 * 3600000);
    const valid = [...new Set([before, after])].map(o => wall - o * 3600000).filter(ms => wall - offsetAt(tz, ms) * 3600000 === ms);
    return valid.length ? Math.min(...valid) : wall - before * 3600000;
  }
  const offsetFor = (tz, dateStr, hourDec) => (Date.parse(dateStr + "T00:00:00Z") + Math.round(hourDec * 3600) * 1000 - localToUtcMs(tz, dateStr, hourDec)) / 3600000;

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
  /** fdirGiven: use this direct-beam fraction instead of estimating it (reference comparisons). */
  function wbgtLiljegren(Tc, RH, SW, u2, cza, P = 1010, fdirGiven) {
    const Ta = Tc + 273.15, ea = RH/100*esK(Tc)*10;                       // hPa
    let solar = cza > 0.0087 ? SW : 0, fdir = 0, Z = Math.acos(Math.max(0.0087, Math.min(1, cza)));
    if (solar > 0) { const s = Math.min(0.85, solar/(1367*Math.max(cza,0.0087))); fdir = Math.min(0.9, Math.exp(3 - 1.34*s - 1.65/s)); }
    if (fdirGiven !== undefined) fdir = solar > 0 ? fdirGiven : 0;
    let iterTg = 0, iterTw = 0, convTg = false, convTw = false;
    const emA = 0.575*Math.pow(ea, 1/7), Ts = Ta;
    let Tg = Ta;                                                            // globe
    for (let i = 0; i < 60; i++) { const h = hSphere(0.0508, 0.5*(Tg+Ta), P, u2);
      const n = Math.pow(Math.max(1, 0.5*(emA*Ta**4 + 0.999*Ts**4) - h/(SIG*0.95)*(Tg-Ta) + solar/(2*SIG*0.95)*(0.95)*(fdir*(1/(2*Math.max(cza,0.05)) - 1) + 1 + 0.45)), 0.25);
      iterTg = i + 1; if (Math.abs(n - Tg) < 0.01) { Tg = n; convTg = true; break; } Tg = 0.9*Tg + 0.1*n; }
    const Td = (() => { const g = Math.log(RH/100) + 17.62*Tc/(243.12+Tc); return 243.12*g/(17.62-g) + 273.15; })();
    let Tw = Td;                                                            // natural wet bulb
    for (let i = 0; i < 60; i++) { const Tr = 0.5*(Tw+Ta), h = hCyl(0.007, Tr, P, u2);
      const Fat = SIG*0.95*(0.5*(emA*Ta**4 + 0.999*Ts**4) - Tw**4) + 0.6*solar*((1-fdir)*(1 + 0.25*0.007/0.0254) + fdir*(Math.tan(Math.min(Z, 1.47))/Math.PI + 0.25*0.007/0.0254) + 0.45);
      const ew = esK(Tw-273.15)*10, rho = P*100/(RA*Tr), Sc = visc(Tr)/(rho*diffu(Tr,P));
      const n = Ta - evapH(Tr)/RATIO*(ew - ea)/(P - ew)*Math.pow(PR/Sc, 0.56) + Fat/h;
      iterTw = i + 1; if (Math.abs(n - Tw) < 0.01) { Tw = n; convTw = true; break; } Tw = 0.9*Tw + 0.1*n; }
    const tg = Tg - 273.15, tnw = Tw - 273.15;
    // mean radiant temperature for a standing person (direct, diffuse, reflected sun + long-wave), used by the heat budget
    const elev = 90 - Z*180/Math.PI, fp = 0.308*Math.cos((elev*(1 - elev*elev/48402))*Math.PI/180);
    const I = solar > 0 ? solar*fdir/Math.max(cza, 0.05) : 0, Dif = solar*(1 - fdir), Ref = 0.2*solar;
    const Sstr = 0.7*(fp*I + 0.5*Dif + 0.5*Ref) + 0.97*0.5*(emA*SIG*Ta**4 + 0.999*SIG*Ts**4);
    const tmrt = Math.pow(Sstr/(0.97*SIG), 0.25) - 273.15;
    return { W: 0.7*tnw + 0.2*tg + 0.1*Tc, tg, tnw, tmrt, fdir, iterTg, iterTw, converged: convTg && convTw };
  }

  // ---------- adapted heat bands ----------
  // Unadapted: ACSM race bands 18/23/28 C WBGT. Heat-adapted: +4.4 C (ISO 7243 acclimatisation offset at running effort),
  // which puts the "indoors" line at 32.4 C, matching the US Army Category 5 line (32.2 C) for acclimatised soldiers.
  const bandEdges = acc => acc ? [22.4, 27.4, 32.4] : [18, 23, 28];
  const heatBand = (W, acc) => { const e = bandEdges(acc); return W < e[0] ? 0 : W < e[1] ? 1 : W < e[2] ? 2 : 3; };
  // India NAQI PM2.5 bands on the 24-h mean: >60 moderate or poor (1), >120 very poor (2), >250 severe (3).
  const pmDayBand = pm25_24h => pm25_24h == null ? 0 : pm25_24h > 250 ? 3 : pm25_24h > 120 ? 2 : pm25_24h > 60 ? 1 : 0;
  // EU ozone on hourly values: 180 information threshold (1), 240 alert threshold (2). Below 180 is not a clearance.
  const o3HourBand = o3 => o3 == null ? 0 : o3 > 240 ? 2 : o3 > 180 ? 1 : 0;
  // Kept for callers: the hourly guard rail from a PM2.5 24-h mean and an hourly ozone value.
  const airBand = (pm25_24h, o3) => Math.max(pmDayBand(pm25_24h), o3HourBand(o3));
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  /** The day's air with each guideline's own averaging (the forecast day, 00-24 local). Nulls stay not assessed. */
  function airDay(d) {
    const out = { pm25_24h: d.pm25 ? mean(d.pm25) : null, pm10_24h: d.pm10 ? mean(d.pm10) : null, no2_24h: d.no2 ? mean(d.no2) : null,
      o3_max8h: null, o3_max8h_end: null };
    if (d.o3) for (let h = 7; h < 24; h++) { const m = mean(d.o3.slice(h - 7, h + 1)); if (out.o3_max8h === null || m > out.o3_max8h) { out.o3_max8h = m; out.o3_max8h_end = h + 1; } }
    const val = { pm25: out.pm25_24h, pm10: out.pm10_24h, no2: out.no2_24h, o3: out.o3_max8h };
    out.above_who = Object.keys(WHO).filter(k => val[k] != null && val[k] > WHO[k]);
    out.ratio = Object.fromEntries(Object.keys(WHO).map(k => [k, val[k] == null ? null : val[k] / WHO[k]]));
    out.value = val;
    out.pm_band = pmDayBand(out.pm25_24h);
    return out;
  }
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
    // A time limit only comes from heat that cannot be shed (S > 0). When cooling is sufficient there is no limit,
    // whatever the metabolic steady-state core rule says.
    let base = 37.0, store = 0, dlim = 240; const rise = S*60/(u.kg*3490);
    if (S > 0) for (let t = 1; t <= 240; t++) { base += (Math.min(Teq, T_CORE_LIM - 0.1) - base)/10; store += rise; if (base + store >= T_CORE_LIM) { dlim = t; break; } }
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
    const na = [d.t, d.rh, d.ws, d.sw].some(a => !a || a[h] == null || !Number.isFinite(a[h]));
    const pollen = d.pollen ? Object.fromEntries(TAXA.map(k => [k, d.pollen[k] ? d.pollen[k][h] : null])) : null;
    if (na) return { h, na: true, t: null, rh: null, sw: null, ws: null, wd: null, W: null, pollen,
      pm25: d.pm25 ? d.pm25[h] : null, pm10: d.pm10 ? d.pm10[h] : null, no2: d.no2 ? d.no2[h] : null, o3: d.o3 ? d.o3[h] : null };
    const u2 = Math.max(0.5, d.ws[h]/3.6*0.7);
    const cza = cosZenith(loc.lat, loc.lon, offsetFor(loc.tz, d.date, h - 0.5), d.date, h - 0.5);
    const w = wbgtLiljegren(d.t[h], d.rh[h], d.sw[h], u2, cza);
    return { h, na: false, t: d.t[h], rh: d.rh[h], sw: d.sw[h], ws: d.ws[h], wd: d.wd ? d.wd[h] : null, u2, cza, W: w.W, tg: w.tg, tnw: w.tnw, tmrt: w.tmrt,
             wbgtConverged: w.converged,
             pm25: d.pm25 ? d.pm25[h] : null, pm10: d.pm10 ? d.pm10[h] : null, no2: d.no2 ? d.no2[h] : null, o3: d.o3 ? d.o3[h] : null, pollen };
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
    const span = (indoor ? [best] : hours.filter(x => x.h >= h0 && x.h <= h1)).filter(x => !x.na);
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
    const routes = loc.routes, edges = bandEdges(u.acc), air = airDay(d);
    const hours = [];
    for (let h = 0; h < 24; h++) {
      const c = hourConditions(d, h, loc);
      if (c.na) { hours.push({ ...c, flag: 3, hb: 0, ab: 0, cb: 0, score: Infinity, route: 0, airRatio: null, grassHigh: false }); continue; }
      const b = budget(c, speed, u);                        // experimental only: never used for decisions
      const hb = heatBand(c.W, u.acc);
      const head = wct(c.t, c.ws + 1.5*kmh), tail = wct(c.t, Math.abs(c.ws - 1.5*kmh));
      const cb = coldBand(head);
      // air: the day level (PM2.5 24-h mean band) plus hourly ozone (EU information / alert)
      const ab = Math.max(air.pm_band, o3HourBand(c.o3));
      // timing: hourly concentration relative to the guideline value, per route (ranking only, not an exceedance)
      const ratios = routes.map(r => { let m = null, drv = null;
        for (const k of Object.keys(WHO)) { if (c[k] == null) continue;
          const v = c[k]*(r.x[k] || 1)/WHO[k]; if (m === null || v > m) { m = v; drv = k; } }
        return { m, drv }; });
      const ri = ratios.length > 1 && ratios[1].m !== null && ratios[0].m !== null && ratios[1].m < ratios[0].m ? 1 : 0;
      const airRatio = ratios[ri].m, driver = ratios[ri].drv;
      const grass = c.pollen ? c.pollen.grass : null, grassHigh = grass != null && grass >= GRASS_LIMIT;
      const flag = Math.max(hb, ab, cb);
      const heatRank = 0.5*Math.max(0, c.W - (edges[0] - 6));
      const airRank = airRatio === null ? 0 : 2*Math.max(0, airRatio - 1) + 0.5*airRatio;
      const coldRank = Math.max(0, 0 - head)*0.6 + (c.t < 0 ? 2 : 0);
      const pollenRank = u.hayfever && grassHigh ? 6 + grass/40 : 0;
      const score = flag*10 + heatRank + airRank + coldRank + pollenRank;   // ranking weights: demo values
      hours.push({ ...c, b, hb, ab, cb, flag, airRatio, driver, route: ri, airAlt: ratios[1 - ri] || null, head, tail, grassHigh, score });
    }
    // u.after / u.before: earliest and latest start the athlete allows (decimal local hours), optional
    const after = Math.max(u.now, u.after ?? 0), before = Math.min(u.before ?? 24, 21.99);
    const nowH = Math.floor(after);
    const inRange = x => x.h >= Math.max(5, nowH) && x.h <= Math.min(21, Math.floor(before));
    const pool = hours.filter(x => inRange(x) && !x.na);
    const naHours = hours.filter(x => x.na && x.h >= Math.max(5, nowH) && x.h <= 22).map(x => x.h);
    const usable = pool.filter(x => x.flag <= 2);
    const noPool = pool.length === 0;
    const indoor = !noPool && usable.length === 0;
    const valid = hours.filter(x => !x.na);
    const best = (usable.length ? usable : (pool.length ? pool : valid)).reduce((a,b) => b.score < a.score ? b : a);
    const worst = (pool.length ? pool : valid).reduce((a,b) => b.score > a.score ? b : a);
    let s = best.h, e = best.h;
    const ok = x => x && !x.na && x.flag <= Math.max(best.flag, 1) && x.h >= 5 && x.h <= 21 && x.h >= nowH
      && !(u.hayfever && x.grassHigh && !best.grassHigh) && x.score <= best.score + (best.flag === 0 ? 13 : 3);
    while (ok(hours[s-1])) s--; while (ok(hours[e+1])) e++;
    const end = e + 1, start = Math.max(s, after);
    // The whole planned run must fit: latest start = window end - duration (and not after the athlete's latest start).
    const latestStart = Math.min(end - u.minutes/60, before);
    const fitMinutes = Math.max(0, Math.floor((Math.min(end, before + u.minutes/60) - start) * 60 + 1e-9));
    const fits = !noPool && start <= latestStart + 1e-9;
    // Is there any stretch of assessed hours long enough for the planned run (ignoring the decision)?
    // (minutes, counted from "now" when now falls inside an hour; a run may continue until 22:00)
    let longest = 0, run = 0;
    for (let h = Math.max(5, nowH); h <= 21; h++) {
      const avail = hours[h] && !hours[h].na ? Math.max(0, Math.min(60, (h + 1 - Math.max(h, after)) * 60)) : 0;
      run = avail > 0 ? run + avail : 0; longest = Math.max(longest, run);
    }
    const completeWindowExists = longest >= u.minutes;
    const route = routes[best.route];
    // direction along the route axis: start into the wind
    const along = best.wd == null ? 0 : best.ws*Math.cos((best.wd - route.axis)*Math.PI/180);
    const direction = best.wd == null ? { short: "Any direction", text: "Wind direction not available.", unknown: true }
      : Math.abs(along) < 3 ? { short: "Any direction", text: "Wind is light along the route." }
      : along >= 0 ? { short: route.into[0], text: route.into[1] } : { short: route.away[0], text: route.away[1] };
    // the hours the run covers: decisions about effort use their heat bands, never the experimental budget
    const h0 = Math.floor(start), h1 = Math.max(h0, Math.ceil(start + u.minutes/60) - 1);
    const runHours = hours.filter(x => x.h >= h0 && x.h <= h1 && !x.na);
    const runHb = runHours.length ? Math.max(...runHours.map(x => x.hb)) : best.hb;
    const effort = runHb >= 2 ? "consider_shorter_or_easier" : "as_planned";
    // headline
    let headline, sub, mode = "go", hc, sc;                   // hc / sc: machine codes + params for the API
    const why = best.ab >= best.hb && best.ab >= best.cb && best.ab > 0 ? "air" : best.cb > best.hb ? "cold" : "heat";
    if (noPool || (!indoor && !fits && fitMinutes < 15)) { mode = "none";
      headline = "No good window left today"; hc = { code: "NO_WINDOW_TODAY", params: {} };
      sub = "Try tomorrow."; sc = { code: "TRY_TOMORROW", params: {} }; }
    else if (!indoor && !fits) { mode = "short";
      const st = fmtHM(start);
      if (start <= u.now + 0.5) { headline = "Go now, keep it short"; hc = { code: "GO_NOW_SHORT", params: {} }; }
      else { headline = `Run at ${st}, keep it short`; hc = { code: "GO_AT_SHORT", params: { start: st } }; }
      sub = `${fitMinutes} min fit before ${fmtHM(end)}.`; sc = { code: "FITS_IN_WINDOW", params: { max_minutes: fitMinutes, planned_minutes: u.minutes, end: fmtHM(end) } }; }
    else if (indoor) { mode = "indoor";
      const smoke = pool.some(x => x.ab === 3), hot = pool.some(x => x.hb === 3);
      headline = "Train indoors today"; hc = { code: "INDOOR_TODAY", params: {} };
      if (smoke && !hot) { sub = "Smoke is too thick outside."; sc = { code: "REASON_SMOKE", params: {} }; }
      else if (hot) { sub = "Too hot and humid for a run outside."; sc = { code: "REASON_HEAT", params: {} }; }
      else { sub = "Conditions are against you all day."; sc = { code: "REASON_MIXED", params: {} }; } }
    else if (start <= u.now + 0.5) {
      if (end - u.now <= 6) { headline = "Run before " + fmtHM(end); hc = { code: "GO_BEFORE", params: { end: fmtHM(end) } }; sub = "After that, conditions turn against you."; sc = { code: "WORSE_LATER", params: {} }; }
      else { headline = "Good to go now"; hc = { code: "GO_NOW", params: {} }; sub = "Conditions stay fine for hours."; sc = { code: "STAYS_FINE", params: {} }; } }
    else if (e >= 21) { headline = "Run after " + fmtHM(start); hc = { code: "GO_AFTER", params: { start: fmtHM(start) } }; const ex = hours.filter(x => !x.na && x.h >= Math.max(5, nowH) && x.h < s);
      const mx = k => Math.max(0, ...ex.map(x => x[k])), pv = { hb: mx("hb"), ab: mx("ab"), cb: mx("cb"), t: ex.length ? Math.min(...ex.map(x => x.t)) : best.t };
      const airLater = ex.length && ex.some(x => x.airRatio !== null && best.airRatio !== null && x.airRatio > best.airRatio * 1.5);
      const pollenLater = u.hayfever && ex.some(x => x.grassHigh) && !best.grassHigh;
      if (pv.cb > 0 && pv.cb >= pv.hb && pv.cb >= pv.ab || pv.t < 2) { sub = "Too cold and windy until then."; sc = { code: "COLD_UNTIL", params: {} }; }
      else if (pollenLater && pv.hb <= 1 && pv.ab <= 1) { sub = "Grass pollen is high until then."; sc = { code: "POLLEN_UNTIL", params: {} }; }
      else if (pv.ab > pv.hb || (pv.hb === 0 && airLater)) { sub = "The air clears by then."; sc = { code: "AIR_CLEARS", params: {} }; }
      else { sub = "Too warm until then."; sc = { code: "HEAT_UNTIL", params: {} }; } }
    else { headline = "Run " + fmtHM(start) + "–" + fmtHM(end); hc = { code: "GO_BETWEEN", params: { start: fmtHM(start), end: fmtHM(end) } };
      if (why === "air" && hours[nowH] && hours[nowH].ab >= 2) { sub = "Skip the early slot today: smoke."; sc = { code: "SKIP_EARLY_SMOKE", params: {} }; }
      else { sub = "That is your best window today."; sc = { code: "BEST_WINDOW", params: {} }; } }
    if (!indoor && best.flag === 2 && mode === "go") { sub = "Go easy: " + (why === "air" ? "the air is poor." : why === "cold" ? "it is bitterly cold." : "hot and humid."); sc = { code: why === "air" ? "EASY_AIR" : why === "cold" ? "EASY_COLD" : "EASY_HEAT", params: {} }; }
    // reasons ranked
    const reasons = [];
    reasons.push({ k: "Heat", code: best.hb === 0 && worst.hb <= 1 ? "HEAT_LOW" : "HEAT_RISES", v: worst.hb*3 - best.hb*3 + (worst.W - best.W)/4 + (best.hb >= 2 ? best.hb*2 : 0), tag: "Standard",
      text: best.hb === 0 && worst.hb <= 1 ? `Heat stress ${best.W.toFixed(1)} °C, comfortably low.`
        : `Heat stress ${best.W.toFixed(1)} °C in your slot, ${worst.W.toFixed(1)} °C at ${worst.h}:00. ${u.acc ? "Heat-adapted" : "Not heat-adapted"}: indoors above ${edges[2]} °C.` });
    // air: daily guideline status (correct averaging) + hourly timing
    const missingAir = Object.keys(WHO).filter(k => !d[k]);
    const pk = k => pool.reduce((a, x) => (x[k] != null && (a === null || x[k] > a[k]) ? x : a), null);
    let airCode, airText, airParams = {};
    if (missingAir.length === 4) { airCode = "AIR_NOT_ASSESSED"; airText = "Air quality not assessed: no data."; }
    else if (air.pm25_24h != null && air.pm25_24h > 60) { const p = pk("pm25");
      airCode = "AIR_PM_EPISODE"; airParams = { mean_24h_ugm3: Math.round(air.pm25_24h), peak_ugm3: Math.round(p.pm25), peak_time: fmtHM(p.h), window_ugm3: Math.round(best.pm25) };
      airText = `PM2.5 24-h mean ${Math.round(air.pm25_24h)} µg/m³; hourly peak ${Math.round(p.pm25)} at ${p.h}:00, ${Math.round(best.pm25)} in your slot.`; }
    else if (air.above_who.length) { const k = air.above_who.reduce((a, x) => air.ratio[x] > air.ratio[a] ? x : a), p = pk(k);
      airCode = "AIR_ABOVE_GUIDELINE"; airParams = { pollutant: NAMES[k], averaging: AVG[k], value_ugm3: Math.round(air.value[k]), guideline_ugm3: WHO[k],
        peak_time: p ? fmtHM(p.h) : null, window_ugm3: best[k] == null ? null : Math.round(best[k]) };
      airText = `${NAMES[k]} ${AVG[k]} ${Math.round(air.value[k])} µg/m³, above the WHO guideline of ${WHO[k]}. Highest around ${p ? p.h + ":00" : "-"}; ${Math.round(best[k])} in your slot.`; }
    else if (missingAir.length) { airCode = "AIR_CLEAN_PARTIAL"; airText = `Assessed pollutants under WHO guideline levels; ${missingAir.map(k => NAMES[k]).join(", ")} not assessed.`; }
    else { airCode = "AIR_CLEAN"; airText = "Under WHO guideline levels today (24-h and 8-h means)."; }
    const alt = best.airAlt, lowerPct = alt && alt.m !== null && best.airRatio !== null && alt.m > best.airRatio*1.05 ? Math.round((1 - best.airRatio/alt.m)*100) : 0;
    reasons.push({ k: "Air", code: airCode, params: airParams, missing: missingAir, exposureLowerPct: lowerPct,
      v: (worst.ab - best.ab)*3 + Math.max(0, (worst.airRatio ?? 0) - (best.airRatio ?? 0)) + air.above_who.length + air.pm_band*2, tag: "Guideline values",
      text: airText + (lowerPct > 5 ? ` ${route.name}: ${lowerPct}% lower concentrations than ${routes[1-best.route].name}.` : "") });
    if (u.hayfever) {
      const covered = d.pollen && d.pollen.grass;
      const anyHigh = hours.some(x => x.grassHigh), peak = covered ? Math.round(Math.max(...d.pollen.grass)) : null;
      const others = d.pollen ? TAXA.slice(1).filter(k => d.pollen[k]).map(k => [k, Math.round(Math.max(...d.pollen[k]))]).filter(([, v]) => v >= 10) : [];
      reasons.push({ k: "Pollen", code: !covered ? "POLLEN_NOT_COVERED" : anyHigh ? (best.grassHigh ? "POLLEN_HIGH_IN_WINDOW" : "POLLEN_PEAK_AVOIDED") : "POLLEN_LOW",
        v: anyHigh ? 2 : 0, tag: "Published threshold (grass)", others,
        text: !covered ? "No grass pollen forecast for this region." : anyHigh ? `Grass pollen peaks at ${peak} grains/m³; your slot is ${best.grassHigh ? "still high" : "below 50"}.` : "Grass pollen low all day." });
      if (others.length) reasons.push({ k: "PollenOther", code: "POLLEN_OTHER_TAXA", v: 0.2, tag: "Information only", others,
        text: `${others.map(([k, v]) => `${k} ${v}`).join(", ")} grains/m³: shown for information, no threshold used.` });
    }
    const breath = breathLoss(met, u.kg, best.t, best.rh);
    if (best.t < 8) reasons.push({ k: "Cold", code: "COLD_WARM_UP", v: best.cb*3 + Math.max(0, 5 - best.head)/3, tag: "Mechanism + demo weights",
      text: `Wind chill ${best.head.toFixed(0)} °C running into the wind. Cold air raises blood pressure: warm up indoors, keep the first km easy.` });
    reasons.push({ k: "Wind", code: direction.unknown ? "WIND_DIRECTION_UNKNOWN" : direction.short === "Any direction" ? "WIND_LIGHT" : "WIND_START_INTO", v: 0.5, tag: "Physics", text: `${Math.round(best.ws)} km/h from the ${best.wd == null ? "-" : compass(best.wd)}. ${direction.text}` });
    reasons.push({ k: "You", code: u.acc ? "ATHLETE_ADAPTED" : "ATHLETE_NOT_ADAPTED", v: 0, tag: "Your settings", text: `${u.acc ? "Heat-adapted" : "Not heat-adapted"}, ${u.kg} kg, ${(u.height*100).toFixed(0)} cm, ${(CLOTH[u.cloth]||CLOTH.kit).label.toLowerCase()}.` });
    reasons.sort((a,b) => b.v - a.v);
    const tip = noPool ? null : pickTip(hours, start, u, indoor, best);
    // experimental (never on runner screens): the heat budget at the run hours
    const capS = indoor || mode === "none" ? null : maxSpeedFor(best, u.minutes, u);
    const runBudgets = runHours.map(x => x.b);
    const experimental = runBudgets.length ? {
      minutes_to_39c: Math.min(...runBudgets.map(b => b.dlim)),
      sweat_ml_per_h: Math.max(...runBudgets.map(b => b.sweatMlH)),
      core_steady_c: Math.max(...runBudgets.map(b => b.Teq)),
      uncompensable: runBudgets.some(b => b.S > 0),
      max_speed_mps: capS,
    } : null;
    return { hours, best, worst, start, end, s, e, latestStart, fits, fitMinutes, naHours, completeWindowExists, headline, sub, hc, sc, mode,
      along, direction, route, effort, runHb, air, met, reasons, kmh, speed, breath, why, indoor, tip, experimental };
  }
  return { evaluate, pickTip, dewPoint, offsetAt, localToUtcMs, offsetFor, budget, maxSpeedFor, hourConditions, wbgtLiljegren, cosZenith, paceOf, fmtPace, fmtHM, compass,
    FLAGS, NAMES, WHO, AVG, C_REF, TAXA, GRASS_LIMIT, heatBand, bandEdges, metFromSpeed, CLOTH, wct, airBand, airDay, pmDayBand, o3HourBand };
})();
if (typeof module !== "undefined") module.exports = ENG;
