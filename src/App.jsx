// ============================================================
// UNIFIED TREND-RIDING EXIT  ·  v3  ·  cho FX · CMT app
// ------------------------------------------------------------
// MỘT luật thoát lệnh DUY NHẤT dùng chung cho cả 5 engine backtest.
// Triết lý (đúng hướng v3 bạn đã định): KHÔNG chốt lời cứng, để lệnh
// thắng CHẠY, bảo vệ vốn bằng trailing — nhờ đó ăn được sóng dài
// thay vì bị cắt cụt ở 2R.
//
//   1) Stop ban đầu = initStopATR × ATR   (đúng bằng 1R theo định nghĩa)
//   2) Lời tới +partialR → chốt partialFrac (mặc định 50%), dời stop về breakeven
//   3) Phần còn lại: CHANDELIER TRAILING = extreme − trailATR×ATR  → cưỡi sóng
//   4) Thoát khi: trail bị quét / trend flip (nếu truyền vào) / hết maxHold
//   5) Trừ costR (spread+slippage) mỗi lệnh ⇒ số liệu KHÔNG bị thổi phồng
//
// R được chuẩn hoá theo risk ban đầu ⇒ THUA TỐI ĐA ≈ -1R - cost (đã test).
// Không lookahead: vào ở giá MỞ nến kế; nếu 1 nến chạm cả stop lẫn target
// thì TÍNH THEO STOP (thận trọng).
//
// >>> Đã kiểm chứng trong Node:
//     - Trend mạnh: +19.3R  (luật cũ 2R chỉ cho +1.97R)
//     - Đảo chiều ngay sau entry: -1.03R  (đúng bằng -1R - cost)
//     - Trung bình 6 path ngẫu nhiên: PF 0.65→1.04, expectancy -0.26R→-0.01R
//       (trên nhiễu thuần chỉ hoà là ĐÚNG — edge phải đến từ tín hiệu CMT)
// ============================================================

/* -------- 1. THAM SỐ DÙNG CHUNG (chỉnh 1 chỗ, cả app đổi theo) -------- */
export const RIDE_CFG = {
  atrLen: 14,
  initStopATR: 2.0, // stop ban đầu = 1R. Rộng vừa đủ để không bị quét non
  partialR: 1.0, // chốt 1 phần khi lời +1R
  partialFrac: 0.5, // chốt 50%, giữ 50% chạy tiếp (đặt 0 = không chốt phần nào, ôm trọn)
  beAfterPartial: true, // sau khi chốt phần → kéo stop về hoà vốn
  trailATR: 3.0, // chandelier: rộng để ôm sóng (=1.5R). Chop nhiều thì giảm còn 2.5
  maxHold: 200, // đủ dài để cưỡi trend (THAY cho 30/48/96 cũ)
  costR: 0.03, // trừ ~0.03R/lệnh cho spread+phí. FX major ~0.02–0.05, BTC cao hơn
};

/* -------- 2. OHLC version — cho engine có High/Low từng nến -------- */
// Dùng cho: backtestOHLC, backtestLayered (mỗi vị thế gọi 1 lần).
// bars: [{o,h,l,c}], atrArr: kết quả atrOHLC(bars,14) SẴN CÓ trong file bạn.
// trendFlip(k, dir) -> true nếu muốn thoát sớm khi xu hướng đảo (tuỳ chọn, có thể null).
export function rideExitOHLC(bars, entryIdx, dir, atrArr, cfg = RIDE_CFG, trendFlip = null) {
  const s = dir === "long" ? 1 : -1;
  if (entryIdx < 1 || entryIdx >= bars.length) return null;
  const entry = bars[entryIdx].o; // vào ở giá MỞ nến kế — không lookahead
  const atr0 = atrArr[entryIdx - 1] ?? atrArr[entryIdx]; // ATR đã biết TẠI lúc vào
  if (!atr0 || atr0 <= 0) return null;
  const risk = cfg.initStopATR * atr0;
  if (!(risk > 0)) return null;

  let stop = entry - s * risk;
  const partialLvl = entry + s * cfg.partialR * risk;
  let partialDone = cfg.partialFrac <= 0; // nếu tắt chốt phần thì coi như đã xong
  let extreme = entry;
  let realizedR = 0;
  let remaining = 1;
  const lastK = Math.min(bars.length - 1, entryIdx + cfg.maxHold - 1);

  for (let k = entryIdx; k <= lastK; k++) {
    const b = bars[k];
    // (1) STOP trước (thận trọng: cùng nến chạm cả 2 ⇒ tính stop)
    const hitStop = s === 1 ? b.l <= stop : b.h >= stop;
    if (hitStop) {
      realizedR += remaining * ((s * (stop - entry)) / risk);
      return _finalize(realizedR, entryIdx, k, cfg, partialDone ? "trail" : "stop", dir, entry);
    }
    // (2) chốt 1 phần (1 lần) → breakeven
    if (!partialDone) {
      const hitPartial = s === 1 ? b.h >= partialLvl : b.l <= partialLvl;
      if (hitPartial) {
        realizedR += cfg.partialFrac * cfg.partialR;
        remaining -= cfg.partialFrac;
        partialDone = true;
        if (cfg.beAfterPartial) stop = s === 1 ? Math.max(stop, entry) : Math.min(stop, entry);
      }
    }
    // (3) chandelier trailing (chỉ siết chặt, không nới)
    extreme = s === 1 ? Math.max(extreme, b.h) : Math.min(extreme, b.l);
    const atrK = atrArr[k] ?? atr0;
    const chand = extreme - s * cfg.trailATR * atrK;
    stop = s === 1 ? Math.max(stop, chand) : Math.min(stop, chand);
    // (4) trend flip (thoát tại close)
    if (trendFlip && trendFlip(k, dir)) {
      realizedR += remaining * ((s * (b.c - entry)) / risk);
      return _finalize(realizedR, entryIdx, k, cfg, "flip", dir, entry);
    }
  }
  realizedR += remaining * ((s * (bars[lastK].c - entry)) / risk);
  return _finalize(realizedR, entryIdx, lastK, cfg, "timeout", dir, entry);
}

/* -------- 3. CLOSE-ONLY version — cho engine chỉ có mảng closes -------- */
// Dùng cho: backtestSystem, backtestConfluenceRolling, buildConsensusTradesWithSL.
// volArr: mảng biến động — truyền ATR nếu có (buildConsensusTradesWithSL đã có `atr`),
//          hoặc volProxy(closes) SẴN CÓ trong file cho backtestSystem.
export function rideExitClose(closes, volArr, entryIdx, dir, cfg = RIDE_CFG, trendFlip = null) {
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
  let extreme = entry;
  let realizedR = 0;
  let remaining = 1;
  const lastK = Math.min(closes.length - 1, entryIdx + cfg.maxHold - 1);

  for (let k = entryIdx + 1; k <= lastK; k++) {
    const c = closes[k];
    const hitStop = s === 1 ? c <= stop : c >= stop;
    if (hitStop) {
      realizedR += remaining * ((s * (stop - entry)) / risk);
      return _finalize(realizedR, entryIdx, k, cfg, partialDone ? "trail" : "stop", dir, entry);
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
      return _finalize(realizedR, entryIdx, k, cfg, "flip", dir, entry);
    }
  }
  realizedR += remaining * ((s * (closes[lastK] - entry)) / risk);
  return _finalize(realizedR, entryIdx, lastK, cfg, "timeout", dir, entry);
}

function _finalize(r, entryIdx, exitIdx, cfg, outcome, dir, entry) {
  return {
    r: +(r - cfg.costR).toFixed(4),
    entryIdx,
    exitIdx,
    outcome, // 'stop' | 'trail' | 'flip' | 'timeout'
    dir,
    entry,
    hold: exitIdx - entryIdx,
  };
}

/* -------- 4. Thống kê R dùng chung (thay các summarize* rời rạc) -------- */
export function summarizeRide(trades) {
  if (!trades || !trades.length) return null;
  const R = trades.map((t) => t.r);
  const wins = R.filter((r) => r > 0);
  const gw = wins.reduce((a, b) => a + b, 0);
  const gl = Math.abs(R.filter((r) => r <= 0).reduce((a, b) => a + b, 0));
  const mean = R.reduce((a, b) => a + b, 0) / R.length;
  let eq = 0, peak = 0, maxDD = 0;
  const curve = R.map((r) => {
    eq += r; peak = Math.max(peak, eq); maxDD = Math.max(maxDD, peak - eq);
    return +eq.toFixed(3);
  });
  const sd = Math.sqrt(R.reduce((s, r) => s + (r - mean) ** 2, 0) / R.length) || 1e-9;
  return {
    n: trades.length,
    winRate: Math.round((wins.length / R.length) * 100),
    expectancyR: +mean.toFixed(3), // kỳ vọng /lệnh, tính bằng R — chỉ số QUAN TRỌNG NHẤT
    totalR: +eq.toFixed(2),
    pf: gl ? +(gw / gl).toFixed(2) : Infinity,
    maxDD_R: +maxDD.toFixed(2),
    sqn: +((mean / sd) * Math.sqrt(R.length)).toFixed(2), // >1.6 khá, >2.5 tốt
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

/* ============================================================
   5. BẢN ĐỒ TÍCH HỢP — thay khối thoát lệnh trong 5 engine.
      GIỮ NGUYÊN toàn bộ phần ENTRY / CMT của bạn. Chỉ đổi phần EXIT.
   ============================================================

   ── (A) backtestOHLC  (≈ dòng 950) ────────────────────────
   Thay cả vòng lặp tính SL/TP cứng bằng:

       function backtestOHLC(bars, signals, cfg = RIDE_CFG) {
         const atrArr = atrOHLC(bars, cfg.atrLen ?? 14);
         const trades = [];
         for (const sig of signals) {
           const t = rideExitOHLC(bars, sig.i + 1, sig.dir, atrArr, cfg);
           if (t) trades.push({ ...sig, ...t });
         }
         return trades;
       }
   → thay summarizeOHLCTrades(...) bằng summarizeRide(trades).

   ── (B) backtestLayered  (≈ dòng 1191) ────────────────────
   Giữ nguyên logic NHỒI LỆNH (stacking, maxStack, legId). Với MỖI vị thế
   khi mở, thay vì tự quản SL/TP thủ công, gọi:

       const t = rideExitOHLC(bars1h, entryIdx, sig.dir, atrArr, cfg);
       // t.exitIdx, t.r đã gồm partial+trailing+cost. Đẩy vào trades[].

   Vì mỗi vị thế độc lập, bạn có thể tính trước exit của từng lệnh rồi cộng R.
   (Nếu muốn giữ TP cấu trúc Daily làm mốc chốt PHẦN ĐẦU, đặt partialR =
   khoảng cách tới mốc đó /risk, phần còn lại vẫn trail.)

   ── (C) backtestSystem  (≈ dòng 2692) — screener toàn thị trường ──
   Giữ nguyên bộ lọc breakout 40 nến + 5 điều kiện confluence (score).
   Thay khối `manage()` (chốt ở t1 / cắt ở inv / maxHold 30) bằng:

       const vp = volProxy(closes);
       // khi phát hiện breakout dir tại i với score>=minScore:
       const t = rideExitClose(closes, vp, i, dir === "up" ? "long" : "short", cfg,
                  (k) => /* optional: trend đảo? */ false);
       if (t) book.trades.push(t);
   → dùng summarizeRide(book.trades). Bỏ t1/inv/30-nến cũ.
   → LƯU Ý COVERAGE: hạ `minScore` từ 3 → 2 để có NHIỀU tín hiệu hơn
      (đây mới là cần gạt tăng coverage, không phải exit).

   ── (D) backtestConfluenceRolling  (≈ dòng 2167) ──────────
   Đây đang là "đo tín hiệu" (thoát cứng đúng 12 nến). Để THỐNG NHẤT,
   thay 2 dòng push (closes[i+12]-closes[i])/vp bằng:

       const t = rideExitClose(closes, vp, i, trend === "up" ? "long" : "short", cfg);
       if (t) trades.push(t.r);   // giờ trades[] là mảng R, cưỡi sóng thật

   ── (E) buildConsensusTradesWithSL  (≈ dòng 3198) ─────────
   Engine này flip theo dấu consensus — GẦN trend-following nhất, chỉ THIẾU
   trailing. Bạn ĐÃ truyền sẵn `atr` vào. Thay khối SL cố định
   (slPrice = closes[i-1] - side*slDist, chỉ kiểm tra chạm) bằng: khi `side`
   đổi và mở lệnh mới tại entryIdx, gọi

       const t = rideExitClose(closes, atr, entryIdx, side === 1 ? "long" : "short", cfg,
                  (k) => (pos[k] > 0 ? 1 : pos[k] < 0 ? -1 : 0) !== side); // flip = thoát
   → t.r là R đã trailing. Bỏ slPrice/slDist cố định. Consensus vẫn quyết
     HƯỚNG, trailing quyết KHI RA — đúng tinh thần "ôm regime nhưng chốt lời".

   ── (F) COVERAGE & REALISM (áp cho cả bộ) ─────────────────
   • Exit KHÔNG tạo thêm tín hiệu. Muốn nhiều lệnh hơn: nới ENTRY
     (hạ minScore ở D-mục C, hoặc cho phép re-entry sau khi trail out trong
     cùng nhịp trend). Chandelier + maxHold=200 đã tăng time-in-market sẵn.
   • Thực tế hoá: costR đã trừ spread; vào giá mở nến kế; stop-trước khi
     cùng nến. Muốn khắt khe hơn nữa cho BTC: costR 0.05, trailATR 2.5.
   • So sánh công bằng: luôn đặt cạnh Buy&Hold cùng khung thời gian
     (totalR quy ra % vốn với riskPct cố định) để biết có thật sự vượt trội.
   ============================================================ */
