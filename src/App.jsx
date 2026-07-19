// ============================================================
// UNIFIED TREND-RIDING EXIT  ·  v3  ·  FX · CMT app
// ------------------------------------------------------------
// MOT luat thoat lenh DUY NHAT cho ca 5 engine backtest.
// Khong chot loi cung -> de lenh thang CHAY -> bao ve bang trailing.
//   1) Stop ban dau = initStopATR x ATR  (= 1R)
//   2) Loi toi +partialR -> chot partialFrac, doi stop ve breakeven
//   3) Con lai: chandelier trailing = extreme - trailATR x ATR (cuoi song)
//   4) Thoat khi: trail bi quet / trend flip / het maxHold
//   5) Tru costR moi lenh -> so lieu khong bi thoi phong
// R chuan hoa theo risk ban dau -> thua toi da ~ -1R - cost.
// Khong lookahead; cung nen cham ca stop lan target -> tinh STOP.
// LUU Y: KHONG dung comment /* */ long long voi chu ben trong -> de vo build.
//        File nay chi dung comment mot dong //.
// ============================================================
// >>> CACH DAN (doc ky):
//   - Dan CA FILE nay vao gan cac ham helper cua ban (canh atrOHLC/sma/rsi...).
//   - XOA cac ham CU trung ten trong App.jsx cua ban truoc khi dan, neu khong
//     se bao "already been declared":
//        function backtestOHLC(...)        -> xoa, dung ban duoi
//        function summarizeOHLCTrades(...) -> xoa, dung ban duoi
//        function backtestSystem(...)      -> xoa, dung ban duoi
//   - Trong buildIntradayModel: doi  backtestOHLC(bars1h, signals, opts)
//                                 ->  backtestOHLC(bars1h, signals, RIDE_CFG)
//   - atrOHLC / sma / rsi / macd / volProxy / pivots: DUNG LAI cua ban (khong dinh nghia lai o day).
// ============================================================

const RIDE_CFG = {
  atrLen: 14,
  initStopATR: 2.0, // stop ban dau = 1R
  partialR: 1.0,    // chot 1 phan khi loi +1R
  partialFrac: 0.5, // chot 50%, giu 50% chay (0 = om tron, khong chot phan)
  beAfterPartial: true,
  trailATR: 3.0,    // chandelier rong de om song (=1.5R). Chop nhieu -> giam 2.5
  maxHold: 200,     // du dai de cuoi trend
  costR: 0.03,      // spread+phi moi lenh (BTC nen tang 0.05)
};

// ---- OHLC version (co High/Low): cho backtestOHLC, backtestLayered ----
function rideExitOHLC(bars, entryIdx, dir, atrArr, cfg = RIDE_CFG, trendFlip = null) {
  const s = dir === "long" ? 1 : -1;
  if (entryIdx < 1 || entryIdx >= bars.length) return null;
  const entry = bars[entryIdx].o;
  const atr0 = atrArr[entryIdx - 1] ?? atrArr[entryIdx];
  if (!atr0 || atr0 <= 0) return null;
  const risk = cfg.initStopATR * atr0;
  if (!(risk > 0)) return null;
  let stop = entry - s * risk;
  const partialLvl = entry + s * cfg.partialR * risk;
  let partialDone = cfg.partialFrac <= 0;
  let extreme = entry, realizedR = 0, remaining = 1;
  const lastK = Math.min(bars.length - 1, entryIdx + cfg.maxHold - 1);
  for (let k = entryIdx; k <= lastK; k++) {
    const b = bars[k];
    const hitStop = s === 1 ? b.l <= stop : b.h >= stop;
    if (hitStop) {
      realizedR += remaining * ((s * (stop - entry)) / risk);
      return _fin(realizedR, entryIdx, k, cfg, partialDone ? "trail" : "stop", dir, entry);
    }
    if (!partialDone) {
      const hitPartial = s === 1 ? b.h >= partialLvl : b.l <= partialLvl;
      if (hitPartial) {
        realizedR += cfg.partialFrac * cfg.partialR;
        remaining -= cfg.partialFrac;
        partialDone = true;
        if (cfg.beAfterPartial) stop = s === 1 ? Math.max(stop, entry) : Math.min(stop, entry);
      }
    }
    extreme = s === 1 ? Math.max(extreme, b.h) : Math.min(extreme, b.l);
    const atrK = atrArr[k] ?? atr0;
    const chand = extreme - s * cfg.trailATR * atrK;
    stop = s === 1 ? Math.max(stop, chand) : Math.min(stop, chand);
    if (trendFlip && trendFlip(k, dir)) {
      realizedR += remaining * ((s * (b.c - entry)) / risk);
      return _fin(realizedR, entryIdx, k, cfg, "flip", dir, entry);
    }
  }
  realizedR += remaining * ((s * (bars[lastK].c - entry)) / risk);
  return _fin(realizedR, entryIdx, lastK, cfg, "timeout", dir, entry);
}

// ---- Close-only version: cho backtestSystem, backtestConfluenceRolling, buildConsensusTradesWithSL ----
// volArr: ATR neu co (buildConsensusTradesWithSL da co `atr`), hoac volProxy(closes).
function rideExitClose(closes, volArr, entryIdx, dir, cfg = RIDE_CFG, trendFlip = null) {
  const s = dir === "long" ? 1 : -1;
  if (entryIdx < 1 || entryIdx >= closes.length) return null;
  const entry = closes[entryIdx];
  const v0 = volArr[entryIdx - 1] ?? volArr[entryIdx];
  if (!v0 || v0 <= 0) return null;
  const risk = cfg.initStopATR * v0;
  if (!(risk > 0)) return null;
  let stop = entry - s * risk;
  const partialLvl = entry + s * cfg.partialR * risk;
  let partialDone = cfg.partialFrac <= 0;
  let extreme = entry, realizedR = 0, remaining = 1;
  const lastK = Math.min(closes.length - 1, entryIdx + cfg.maxHold - 1);
  for (let k = entryIdx + 1; k <= lastK; k++) {
    const c = closes[k];
    const hitStop = s === 1 ? c <= stop : c >= stop;
    if (hitStop) {
      realizedR += remaining * ((s * (stop - entry)) / risk);
      return _fin(realizedR, entryIdx, k, cfg, partialDone ? "trail" : "stop", dir, entry);
    }
    if (!partialDone) {
      const hitPartial = s === 1 ? c >= partialLvl : c <= partialLvl;
      if (hitPartial) {
        realizedR += cfg.partialFrac * cfg.partialR;
        remaining -= cfg.partialFrac;
        partialDone = true;
        if (cfg.beAfterPartial) stop = s === 1 ? Math.max(stop, entry) : Math.min(stop, entry);
      }
    }
    extreme = s === 1 ? Math.max(extreme, c) : Math.min(extreme, c);
    const vK = volArr[k] ?? v0;
    const chand = extreme - s * cfg.trailATR * vK;
    stop = s === 1 ? Math.max(stop, chand) : Math.min(stop, chand);
    if (trendFlip && trendFlip(k, dir)) {
      realizedR += remaining * ((s * (c - entry)) / risk);
      return _fin(realizedR, entryIdx, k, cfg, "flip", dir, entry);
    }
  }
  realizedR += remaining * ((s * (closes[lastK] - entry)) / risk);
  return _fin(realizedR, entryIdx, lastK, cfg, "timeout", dir, entry);
}

function _fin(r, entryIdx, exitIdx, cfg, outcome, dir, entry) {
  return { r: +(r - cfg.costR).toFixed(4), entryIdx, exitIdx, outcome, dir, entry, hold: exitIdx - entryIdx };
}

// ---- Thong ke R dung chung ----
function summarizeRide(trades) {
  if (!trades || !trades.length) return null;
  const R = trades.map((t) => t.r);
  const wins = R.filter((r) => r > 0);
  const gw = wins.reduce((a, b) => a + b, 0);
  const gl = Math.abs(R.filter((r) => r <= 0).reduce((a, b) => a + b, 0));
  const mean = R.reduce((a, b) => a + b, 0) / R.length;
  let eq = 0, peak = 0, maxDD = 0;
  const curve = R.map((r) => { eq += r; peak = Math.max(peak, eq); maxDD = Math.max(maxDD, peak - eq); return +eq.toFixed(3); });
  const sd = Math.sqrt(R.reduce((s, r) => s + (r - mean) ** 2, 0) / R.length) || 1e-9;
  return {
    n: trades.length,
    winRate: Math.round((wins.length / R.length) * 100),
    expectancyR: +mean.toFixed(3),
    totalR: +eq.toFixed(2),
    pf: gl ? +(gw / gl).toFixed(2) : Infinity,
    maxDD_R: +maxDD.toFixed(2),
    sqn: +((mean / sd) * Math.sqrt(R.length)).toFixed(2),
    avgHold: Math.round(trades.reduce((s, t) => s + t.hold, 0) / trades.length),
    long: trades.filter((t) => t.dir === "long").length,
    short: trades.filter((t) => t.dir === "short").length,
    outcomes: {
      stop: trades.filter((t) => t.outcome === "stop").length,
      trail: trades.filter((t) => t.outcome === "trail").length,
      flip: trades.filter((t) => t.outcome === "flip").length,
      timeout: trades.filter((t) => t.outcome === "timeout").length,
    },
    equityCurve: curve,
  };
}

// ============================================================
// (A) backtestOHLC — thay ban CU. Giu nguyen signals (entry CMT cua ban).
// ============================================================
function backtestOHLC(bars, signals, cfg = RIDE_CFG) {
  const c = { ...RIDE_CFG, ...(cfg || {}) };
  const atrArr = atrOHLC(bars, c.atrLen ?? 14);
  const trades = [];
  for (const sig of signals) {
    const t = rideExitOHLC(bars, sig.i + 1, sig.dir, atrArr, c);
    if (t) trades.push({ ...sig, ...t });
  }
  return trades;
}

// summarizeOHLCTrades — thay ban CU. Giu key cu (n/winRate/avgR/pf/tp/sl/timeout) de UI khong vo.
function summarizeOHLCTrades(trades) {
  const s = summarizeRide(trades);
  if (!s) return null;
  return {
    n: s.n,
    winRate: s.winRate,
    avgR: s.expectancyR.toFixed(2),
    pf: s.pf === Infinity ? "\u221e" : s.pf.toFixed(2),
    totalR: s.totalR,
    sqn: s.sqn,
    maxDD_R: s.maxDD_R,
    long: s.long,
    short: s.short,
    tp: trades.filter((t) => t.r > 0).length,  // #thang
    sl: trades.filter((t) => t.r <= 0).length,  // #thua
    timeout: s.outcomes.timeout,
    outcomes: s.outcomes,
    equityCurve: s.equityCurve,
  };
}

// ============================================================
// (B) backtestSystem — thay ban CU (screener toan thi truong).
//     Giu nguyen loc breakout 40 nen + 5 dieu kien confluence (score).
//     Ha minScore 3 -> 2 de TANG COVERAGE (nhieu tin hieu hon).
// ============================================================
function backtestSystem(closes, cfg = RIDE_CFG, minScore = 3) {
  const c = { ...RIDE_CFG, ...(cfg || {}) };
  const ma50 = sma(closes, 50), ma200 = sma(closes, 200);
  const rsiArr = rsi(closes), mac = macd(closes), piv = pivots(closes, 4), vp = volProxy(closes);
  let pi = 0; const H = [], L = [];
  const sysT = [], rawT = [];
  let busySys = 0, busyRaw = 0; // chan chong lenh: chi vao khi da thoat lenh truoc
  for (let i = 210; i < closes.length; i++) {
    while (pi < piv.length && piv[pi].i + 4 <= i) { (piv[pi].type === "H" ? H : L).push(piv[pi]); pi++; }
    if (H.length < 2 || L.length < 2) continue;
    const win40 = closes.slice(i - 40, i);
    const Rh = Math.max(...win40), Sl = Math.min(...win40);
    if (Rh - Sl <= 0) continue;
    let dir = null;
    if (closes[i] > Rh && closes[i - 1] <= Rh) dir = "up";
    else if (closes[i] < Sl && closes[i - 1] >= Sl) dir = "down";
    if (!dir) continue;
    const hh = H[H.length - 1].price > H[H.length - 2].price;
    const hl = L[L.length - 1].price > L[L.length - 2].price;
    const conds = dir === "up"
      ? [hh && hl, ma50[i] != null && closes[i] > ma50[i], ma50[i] != null && ma200[i] != null && ma50[i] > ma200[i], rsiArr[i] != null && rsiArr[i] > 50, mac[i].hist > 0]
      : [!hh && !hl, ma50[i] != null && closes[i] < ma50[i], ma50[i] != null && ma200[i] != null && ma50[i] < ma200[i], rsiArr[i] != null && rsiArr[i] < 50, mac[i].hist < 0];
    const score = conds.filter(Boolean).length;
    const side = dir === "up" ? "long" : "short";
    if (i >= busyRaw) { const t = rideExitClose(closes, vp, i, side, c); if (t) { rawT.push(t); busyRaw = t.exitIdx + 1; } }
    if (score >= minScore && i >= busySys) { const t = rideExitClose(closes, vp, i, side, c); if (t) { sysT.push(t); busySys = t.exitIdx + 1; } }
  }
  const pack = (tr) => {
    const s = summarizeRide(tr);
    if (!s) return { n: 0, eq: [] };
    return {
      n: s.n, winRate: s.winRate, avg: s.expectancyR.toFixed(2),
      pf: s.pf === Infinity ? "\u221e" : s.pf.toFixed(2),
      maxDD: s.maxDD_R.toFixed(1), totalR: s.totalR, sqn: s.sqn,
      eq: s.equityCurve.map((v, k) => ({ x: k + 1, eq: v })),
    };
  };
  return { sys: pack(sysT), raw: pack(rawT) };
}

// ============================================================
// (C) 3 engine con lai — cach thay (chi mo ta bang chu, khong phai code chay):
//   backtestConfluenceRolling: thay 2 dong push (closes[i+12]-closes[i])/vp
//     bang: const t = rideExitClose(closes, volProxy(closes), i, trend==="up"?"long":"short", RIDE_CFG);
//           if (t) trades.push(t.r);
//   buildConsensusTradesWithSL: bo slPrice/slDist co dinh; khi mo lenh moi tai entryIdx:
//     const t = rideExitClose(closes, atr, entryIdx, side===1?"long":"short", RIDE_CFG,
//                 (k)=> (pos[k]>0?1:pos[k]<0?-1:0) !== side );  // flip = thoat
//   backtestLayered: giu logic nhoi lenh; moi vi the mo goi rideExitOHLC(bars1h, entryIdx, sig.dir, atrArr, RIDE_CFG)
//     roi cong t.r. (Gui lai doan nay cho toi kiem loi bien stacking.)
// ============================================================
