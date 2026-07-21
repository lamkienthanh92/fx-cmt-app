// ============================================================
// FX · CMT — MỘT APP DUY NHẤT
//
// Trang mặc định = BỘ LỌC (Screener) toàn thị trường 21 cặp FX + BTC/USD,
// xếp hạng bằng TÍN HIỆU CMT: cán cân bằng chứng 5 lớp × xác suất
// analog lịch sử × tỷ lệ đạt target của quy tắc breakout × khoảng
// cách tới trigger × đồng thuận đa khung.
//
// Bấm một cặp → tab phân tích sâu CMT: trình tự top-down 8 bước
// (vĩ mô → xu hướng → cấu trúc → xác nhận → rủi ro → kịch bản →
// kiểm chứng lịch sử → tổng hợp), cộng tab Intraday (D/W→4H→1H,
// hệ thống phân tầng vào lệnh + nhồi lệnh + backtest thật trên OHLC).
//
// Dữ liệu thật: Twelve Data (OHLC Tháng/Tuần/Ngày/4H/1H, không còn suy
// diễn từ Close-only), CFTC Socrata (COT tuần), CBOE (VIX, có thể bị
// CORS). Chỗ nào không có nguồn thì UI ghi rõ, không giả lập.
//
// Công cụ nghiên cứu — không phải khuyến nghị đầu tư.
// ============================================================

import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
  ReferenceArea,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  LineChart,
  Cell,
} from "recharts";

/* ============================================================
   1. CẤU HÌNH THỊ TRƯỜNG
   ============================================================ */

const SYMBOLS = [
  "EUR",
  "GBP",
  "JPY",
  "CHF",
  "AUD",
  "NZD",
  "CAD",
  "NOK",
  "SEK",
  "ZAR",
  "MXN",
];
// DXY (công thức ICE) cần EUR, JPY, GBP, CAD, SEK, CHF — đều nằm trong SYMBOLS.

const P = (base, quote, group) => ({
  key: (base + quote).toLowerCase(),
  label: `${base}/${quote}`,
  base,
  quote,
  group,
  pip: quote === "JPY" ? 0.01 : 0.0001,
  digits: quote === "JPY" ? 3 : 5,
  cross: base !== "USD" && quote !== "USD",
});

const PAIRS = [
  P("EUR", "USD", "Major"),
  P("GBP", "USD", "Major"),
  P("USD", "JPY", "Major"),
  P("USD", "CHF", "Major"),
  P("AUD", "USD", "Major"),
  P("NZD", "USD", "Major"),
  P("USD", "CAD", "Major"),
  P("EUR", "GBP", "Chéo"),
  P("EUR", "JPY", "Chéo"),
  P("GBP", "JPY", "Chéo"),
  P("EUR", "CHF", "Chéo"),
  P("EUR", "CAD", "Chéo"),
  P("EUR", "AUD", "Chéo"),
  P("AUD", "JPY", "Chéo"),
  P("CAD", "JPY", "Chéo"),
  P("GBP", "CAD", "Chéo"),
  P("AUD", "NZD", "Chéo"),
  P("USD", "NOK", "Hàng hóa/EM"),
  P("USD", "SEK", "Hàng hóa/EM"),
  P("USD", "ZAR", "Hàng hóa/EM"),
  P("USD", "MXN", "Hàng hóa/EM"),
  // Crypto — dữ liệu từ Binance, chuỗi ngày riêng (không suy từ ECB)
  {
    key: "btcusdt",
    label: "BTC/USDT",
    base: "BTC",
    quote: "USDT",
    group: "Crypto",
    pip: 1,
    digits: 1,
    cross: false,
    crypto: true,
  },
];
const pairOf = (key) => PAIRS.find((p) => p.key === key);
const MATRIX_KEYS = [
  "eurusd",
  "gbpusd",
  "usdjpy",
  "usdchf",
  "audusd",
  "nzdusd",
  "usdcad",
];

// Tên hợp đồng CME dùng để lọc COT theo tên (không đoán mã hợp đồng).
const COT_NAME = {
  EUR: "EURO FX",
  GBP: "BRITISH POUND",
  JPY: "JAPANESE YEN",
  CHF: "SWISS FRANC",
  CAD: "CANADIAN DOLLAR",
  AUD: "AUSTRALIAN DOLLAR",
  NZD: "NZ DOLLAR",
  MXN: "MEXICAN PESO",
  ZAR: "SO AFRICAN RAND",
  SEK: "SWEDISH KRONA",
  NOK: "NORWEGIAN KRONE",
  BTC: "BITCOIN",
};
const CBANK = {
  USD: "Fed",
  EUR: "ECB",
  GBP: "BoE",
  JPY: "BoJ",
  CHF: "SNB",
  CAD: "BoC",
  AUD: "RBA",
  NZD: "RBNZ",
  NOK: "Norges Bank",
  SEK: "Riksbank",
  ZAR: "SARB",
  MXN: "Banxico",
  BTC: "—",
  USDT: "—",
};

// DXY (công thức ICE) suy trực tiếp từ Close THẬT của 6 cặp Twelve Data — không còn
// phụ thuộc chuỗi cross-rate base-USD của ECB. 6 cặp này đều nằm sẵn trong PAIRS.
function dxyFromPairCloses({ eurusd, usdjpy, gbpusd, usdcad, usdsek, usdchf }) {
  return (
    50.14348112 *
    Math.pow(eurusd, -0.576) *
    Math.pow(usdjpy, 0.136) *
    Math.pow(gbpusd, -0.119) *
    Math.pow(usdcad, 0.091) *
    Math.pow(usdsek, 0.042) *
    Math.pow(usdchf, 0.036)
  );
}
const isoDaysAgo = (n) =>
  new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
// "YYYY-MM-DD" → "DD/MM/YYYY" để hiển thị kiểu VN.
const fmtDateVN = (iso) => (iso ? iso.split("-").reverse().join("/") : "—");

/* ============================================================
   2. TẦNG DỮ LIỆU
   ============================================================ */

async function fetchJSON(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
  } catch (e) {
    if (e.name === "AbortError")
      throw new Error(`Hết thời gian chờ phản hồi (>${timeoutMs / 1000}s) — có thể do mạng chậm/chập chờn`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let j = null;
  try {
    j = JSON.parse(text);
  } catch {
    /* không phải JSON — để nguyên j=null, xử lý bên dưới */
  }
  const rateLimited =
    res.status === 429 ||
    (j && (j.code === 429 || /run out of api credits|api rate limit/i.test(j.message || "")));
  if (rateLimited) {
    const dailyExhausted = /current day|per day|daily/i.test((j && j.message) || "");
    const err = new Error(
      dailyExhausted
        ? `Đã hết hạn mức NGÀY của Twelve Data (${(j && j.message) || "day limit"}) — cần chờ tới khi hạn mức reset (thường 00:00 UTC), thử lại trong vài phút sẽ không có tác dụng.`
        : (j && j.message) || "Twelve Data rate limit (429)"
    );
    err.rateLimited = !dailyExhausted; // hết hạn mức NGÀY thì retry ngắn hạn vô ích — không đánh dấu để khỏi retry
    err.dailyExhausted = dailyExhausted;
    throw err;
  }
  if (!res.ok) throw new Error("HTTP " + res.status);
  if (j == null) throw new Error("Phản hồi không phải JSON hợp lệ");
  return j;
}
// ------------------------------------------------------------
// ĐÃ BỎ HOÀN TOÀN ECB/Frankfurter (chỉ có 1 fixing Close/ngày, không đủ để tính
// pivot/TP/SL chuẩn theo OHLC). Toàn bộ 21 cặp FX giờ lấy OHLC THẬT từ Twelve
// Data — Ngày+Tuần bulk cho cả 21 cặp (Screener), Tháng/4H/1H tải riêng khi mở
// sâu 1 cặp — xem loadBulkOHLC()/loadPairExtraOHLC() bên dưới.
// ------------------------------------------------------------
// COT theo tên hợp đồng, tải lười từng đồng tiền khi cần.
const cotCache = new Map();
async function loadCOTFor(sym) {
  const name = COT_NAME[sym];
  if (!name) return null;
  if (cotCache.has(sym)) return cotCache.get(sym);
  const params = new URLSearchParams({
    $select:
      "report_date_as_yyyy_mm_dd,noncomm_positions_long_all,noncomm_positions_short_all",
    $where: `upper(market_and_exchange_names) like '%${name}%'`,
    $order: "report_date_as_yyyy_mm_dd DESC",
    $limit: "160",
  });
  const rows = await fetchJSON(
    `https://publicreporting.cftc.gov/resource/6dca-aqww.json?${params}`
  );
  const byDate = {};
  rows.forEach((r) => {
    const d = (r.report_date_as_yyyy_mm_dd || "").slice(0, 10);
    const net =
      (+r.noncomm_positions_long_all || 0) -
      (+r.noncomm_positions_short_all || 0);
    if (d && byDate[d] == null) byDate[d] = net;
  });
  const out = Object.entries(byDate)
    .map(([d, net]) => ({ d, net }))
    .sort((a, b) => (a.d < b.d ? -1 : 1));
  cotCache.set(sym, out);
  return out;
}
async function loadVIX() {
  const res = await fetch(
    `https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv?_=${Date.now()}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error("HTTP " + res.status);
  const txt = await res.text();
  const out = txt
    .trim()
    .split("\n")
    .slice(1)
    .slice(-400)
    .map((l) => {
      const c = l.split(",");
      return { d: c[0], v: +c[4] };
    })
    .filter((x) => isFinite(x.v));
  if (!out.length) throw new Error("empty");
  return out;
}

// BTC/USDT daily từ Binance (public data endpoint, có CORS, không cần key).
// Phân trang 1000 nến/lần, tối đa 10 năm.
async function loadBTC(onProgress) {
  const hosts = ["https://data-api.binance.vision", "https://api.binance.com"];
  const startMs = Date.now() - 10 * 365 * 864e5;
  const fetchKlines = async (startTime) => {
    let lastErr;
    for (const h of hosts) {
      try {
        const url = `${h}/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=1000&startTime=${startTime}`;
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        return await r.json();
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  };
  const rows = [];
  let cursor = startMs,
    guard = 0;
  while (guard++ < 20) {
    if (onProgress)
      onProgress(
        `BTC/USDT (Binance): ${new Date(cursor).toISOString().slice(0, 10)}…`
      );
    const batch = await fetchKlines(cursor);
    if (!batch || !batch.length) break;
    const now = Date.now();
    for (const k of batch) {
      // k[6] = closeTime của nến. Nến CHƯA đóng (closeTime ≥ hiện tại) là nến hôm nay đang chạy —
      // close của nó là giá realtime, KHÔNG dùng. Chỉ lấy nến daily đã đóng.
      if (k[6] >= now) continue;
      const d = new Date(k[0]).toISOString().slice(0, 10);
      const close = +k[4];
      if (isFinite(close)) rows.push({ d, t: k[0], close });
    }
    const lastOpen = batch[batch.length - 1][0];
    if (batch.length < 1000) break;
    cursor = lastOpen + 864e5;
    if (cursor > Date.now()) break;
  }
  const seen = new Set(),
    out = [];
  rows
    .sort((a, b) => a.t - b.t)
    .forEach((r) => {
      if (!seen.has(r.d)) {
        seen.add(r.d);
        out.push({ d: r.d, close: r.close });
      }
    });
  if (out.length < 300) throw new Error("Chuỗi BTC quá ngắn");
  return { dates: out.map((r) => r.d), closes: out.map((r) => r.close) };
}

// ------------------------------------------------------------
// OHLC INTRADAY THẬT (1H / 4H) — Twelve Data
// Khác với chuỗi ECB base-USD ở trên (chỉ có 1 fixing Close/ngày),
// nguồn này trả về đủ Open/High/Low/Close mỗi nến — bắt buộc phải có
// để backtest mô phỏng đúng việc giá chạm SL/TP TRONG nến, thay vì
// chỉ so Close tại các mốc cố định.
// Free tier: 800 request/ngày, 8 request/phút — đủ dùng nếu chỉ tải
// lại khi đổi cặp (có cache theo symbol|interval trong phiên).
// ------------------------------------------------------------
const TWELVE_DATA_KEY = "b59bf47f5e0b445184add85474954b03";
const intradayCache = new Map();
// 5 khung dùng xuyên suốt app — Tháng/Tuần/Ngày/4H/1H, tất cả đều OHLC thật.
const TF_INTERVAL = { M: "1month", W: "1week", D: "1day", H4: "4h", H1: "1h" };
const TF_OUTSIZE = { M: 240, W: 500, D: 2500, H4: 2500, H1: 2500 };
// BULK: tải 1 lần cho CẢ 21 cặp (Screener) — chỉ Ngày+Tuần, đủ cho 2 bảng lọc
// mà không phải kéo Tháng/4H/1H của 21 cặp cùng lúc (rất tốn credit/rate-limit).
const TF_BULK = ["D", "W"];
// PER-PAIR: chỉ tải thêm khi bấm mở 1 cặp cụ thể (tab CMT/Intraday) — 3
// request cho riêng cặp đó, ghép với D/W đã có sẵn từ bulk là đủ 5 khung.
const TF_PERPAIR = ["M", "H4", "H1"];

function parseTwelveBars(values) {
  return (values || [])
    .map((v) => ({
      t: Date.parse(v.datetime.replace(" ", "T") + "Z"),
      d: v.datetime,
      o: +v.open,
      h: +v.high,
      l: +v.low,
      c: +v.close,
    }))
    .filter(
      (b) =>
        isFinite(b.t) &&
        isFinite(b.o) &&
        isFinite(b.h) &&
        isFinite(b.l) &&
        isFinite(b.c)
    )
    .sort((a, b) => a.t - b.t);
}
// 1 symbol, 1 khung — có cache theo phiên.
async function fetchTwelveOHLC(symbol, interval, outputsize = 500, onProgress) {
  const cacheKey = `${symbol}|${interval}`;
  if (intradayCache.has(cacheKey)) return intradayCache.get(cacheKey);
  const url =
    `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
      symbol
    )}` +
    `&interval=${interval}&outputsize=${outputsize}&timezone=UTC&order=ASC&apikey=${TWELVE_DATA_KEY}`;
  // Không đoán trước tốc độ an toàn — cứ gọi, và nếu Twelve Data báo rate-limit
  // (429) thì lùi lại chờ hết phút rồi thử lại. Cách này tự khớp đúng hạn mức
  // THẬT của gói bạn đang dùng, dù là free (8/phút) hay trả phí (nhanh hơn nhiều).
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const j = await fetchJSON(url);
      if (j.status === "error" || j.code >= 400)
        throw new Error(j.message || `Twelve Data lỗi (${symbol} ${interval})`);
      if (!j.values || !j.values.length)
        throw new Error(
          `Twelve Data: không có dữ liệu cho ${symbol} ${interval}`
        );
      const bars = parseTwelveBars(j.values);
      if (bars.length < 30)
        throw new Error(`Twelve Data: chuỗi ${symbol} ${interval} quá ngắn`);
      intradayCache.set(cacheKey, bars);
      return bars;
    } catch (e) {
      lastErr = e;
      if (!e.rateLimited) throw e; // lỗi khác (symbol sai, mạng…) — trả lỗi ngay, không retry
      const waitMs = 20000 + attempt * 20000; // 20s, 40s, 60s, 80s
      onProgress?.(
        `Twelve Data: đụng rate-limit ở ${symbol} ${interval} — chờ ${Math.round(
          waitMs / 1000
        )}s rồi thử lại (lần ${attempt + 1}/4)…`
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}
// ------------------------------------------------------------
// BATCH nhiều symbol trong 1 lệnh gọi (Twelve Data hỗ trợ symbol=A,B,C cho cùng
// 1 interval — trả về object khoá theo symbol thay vì {values:[...]} đơn lẻ).
// Quét 21 cặp × 5 khung theo cách RỜI RẠC (105 request) rất dễ vỡ rate-limit
// (free: 8 request/phút). Gộp mỗi khung thành 1 request duy nhất cho cả 21 cặp
// đưa số lượng LỆNH GỌI về 5/lần tải — né rate-limit theo phút. Số CREDIT tiêu
// thụ (tính theo symbol) không đổi, nên vẫn cần gói Twelve Data đủ hạn mức
// ngày nếu bấm tải lại nhiều lần trong ngày (free: 800 credit/ngày).
// Nếu tài khoản/gói không hỗ trợ batch, tự động rơi về tải TUẦN TỰ có giãn cách
// (throttle) để không vỡ rate-limit — chậm hơn nhưng luôn chạy được.
// ------------------------------------------------------------
let batchSupported = true; // false sau lần đầu batch thất bại — khỏi thử lại vô ích ở khung/lượt sau
async function fetchTwelveOHLCBatch(symbols, interval, outputsize, onProgress, onSymbol) {
  const url =
    `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
      symbols.join(",")
    )}` +
    `&interval=${interval}&outputsize=${outputsize}&timezone=UTC&order=ASC&apikey=${TWELVE_DATA_KEY}`;
  const out = {};
  let batchErr = null;
  if (batchSupported) {
    try {
      const j = await fetchJSON(url);
      if (j && j.status === "error") throw new Error(j.message || "batch lỗi");
      if (symbols.length === 1) {
        if (j && j.values && j.values.length) {
          const bars = parseTwelveBars(j.values);
          if (bars.length >= 30) out[symbols[0]] = bars;
        }
      } else {
        let gotAny = false;
        for (const sym of symbols) {
          const payload = j ? j[sym] : null;
          if (payload && payload.values && payload.values.length) {
            const bars = parseTwelveBars(payload.values);
            if (bars.length >= 30) {
              out[sym] = bars;
              gotAny = true;
            }
          }
        }
        if (!gotAny) throw new Error("batch rỗng — có thể gói không hỗ trợ");
        for (const sym of symbols) if (out[sym]) onSymbol?.(sym, out[sym]);
      }
      return out; // batch thành công
    } catch (e) {
      batchErr = e;
      // Không retry request batch: credit tính theo TỪNG symbol dù gộp 1 lệnh gọi
      // hay không, nên gặp rate-limit ở đây thì retry cũng chỉ đụng lại y vậy.
      // Nhớ luôn cho các khung/lượt tải sau trong phiên này — khỏi lặp lại phép thử vô ích.
      batchSupported = false;
    }
  } else {
    batchErr = new Error("đã biết batch không dùng được trong phiên này");
  }
  {
    const e = batchErr;
    // Fallback: tuần tự từng symbol, giãn cách nhẹ để tôn trọng rate-limit/phút.
    onProgress?.(
      `Twelve Data: batch ${interval} không dùng được (${
        e.message || e
      }) — tải tuần tự…`
    );
    for (let i = 0; i < symbols.length; i++) {
      const sym = symbols[i];
      onProgress?.(
        `Twelve Data: tải tuần tự ${interval} — ${sym} (${i + 1}/${
          symbols.length
        })…`
      );
      try {
        out[sym] = await fetchTwelveOHLC(sym, interval, outputsize, onProgress);
        onSymbol?.(sym, out[sym]);
      } catch {
        /* thiếu symbol này thì bỏ qua, không chặn cả mẻ */
      }
      // Giãn nhẹ giữa các request — nếu gói thật sự giới hạn thấp hơn, fetchTwelveOHLC
      // sẽ tự phát hiện lỗi 429 và lùi lại chờ (xem retry ở trên) thay vì đoán trước.
      // Đã xác nhận gói này giới hạn thấp thật (liên tục đụng 429 khi thử nhanh hơn) —
      // quay lại nhịp an toàn ~8 request/phút thay vì dò rồi phải lùi lại nhiều lần.
      await new Promise((r) => setTimeout(r, 7800));
    }
  }
  return out; // { "EUR/USD": bars[], ... } — symbol nào tải lỗi thì vắng mặt trong object
}
// Tải Ngày+Tuần cho TOÀN BỘ 21 cặp FX + BTC/USDT (bulk, dùng cho Screener).
// Trả về { D:{symbol:bars}, W:{symbol:bars} }.
// Mã Twelve Data cho từng cặp — riêng crypto dùng "BTC/USD" (không phải "BTC/USDT" như
// cfg.label hiển thị trong UI), vì đó là ticker Twelve Data hỗ trợ.
const tdSymbol = (cfg) => (cfg.crypto ? "BTC/USD" : cfg.label);

// File cache do GitHub Actions dựng sẵn 1 lần/ngày (xem scripts/fetch-screener-data.mjs
// + .github/workflows/fetch-data.yml) — THAY "YOUR_GH_USERNAME/YOUR_REPO" bằng repo
// thật của bạn sau khi đẩy code lên GitHub và bật workflow.
const SCREENER_CACHE_URL =
  "https://raw.githubusercontent.com/lamkienthanh92/fx-cmt-app/main/data/screener-data.json";

// Gọi Twelve Data trực tiếp, tuần tự — chậm (~5-6 phút với gói free) nhưng luôn đúng.
// Dùng làm phương án dự phòng khi chưa dựng cache, hoặc cache lỗi/rỗng.
async function loadBulkOHLCLive(onProgress, onSymbol) {
  const symbols = PAIRS.map(tdSymbol);
  const byTF = {};
  for (const tf of TF_BULK) {
    onProgress?.(
      `Twelve Data OHLC — khung ${tf}: ${symbols.length} cặp (batch)…`
    );
    byTF[tf] = await fetchTwelveOHLCBatch(
      symbols,
      TF_INTERVAL[tf],
      TF_OUTSIZE[tf],
      onProgress,
      (sym, bars) => onSymbol?.(tf, sym, bars)
    );
  }
  return byTF;
}
// Ưu tiên đọc cache tĩnh (dựng sẵn 1 lần/ngày qua GitHub Actions) — tải gần như
// tức thì, không đụng rate-limit của ai. Nếu chưa dựng cache (hoặc file lỗi/rỗng),
// tự rơi về gọi Twelve Data trực tiếp (chậm hơn nhưng luôn chạy được) để app
// không bao giờ "vỡ" chỉ vì bước setup GitHub Actions chưa xong.
async function loadBulkOHLC(onProgress, onSymbol) {
  onProgress?.("Đang tải cache Ngày+Tuần (đã dựng sẵn qua GitHub Actions)…");
  try {
    const res = await fetch(SCREENER_CACHE_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const j = await res.json();
    if (!j || !j.D || !j.W || !Object.keys(j.D).length)
      throw new Error("File cache rỗng hoặc sai định dạng");
    for (const tf of TF_BULK)
      for (const [sym, bars] of Object.entries(j[tf] || {}))
        onSymbol?.(tf, sym, bars);
    onProgress?.("");
    return { D: j.D || {}, W: j.W || {} };
  } catch (e) {
    onProgress?.(
      `Chưa đọc được cache (${
        e.message || e
      }) — tải trực tiếp từ Twelve Data (chậm hơn, ~5-6 phút với gói free)…`
    );
    return await loadBulkOHLCLive(onProgress, onSymbol);
  }
}
// Tải thêm Tháng/4H/1H cho MỘT cặp cụ thể (khi người dùng mở tab CMT/
// Intraday) — 3 request đơn lẻ, ghép với Ngày/Tuần đã có sẵn từ bulk.
async function loadPairExtraOHLC(symbol, onProgress) {
  const [M, H4, H1] = await Promise.all(
    TF_PERPAIR.map((tf) =>
      fetchTwelveOHLC(symbol, TF_INTERVAL[tf], TF_OUTSIZE[tf], onProgress)
    )
  );
  return { M, H4, H1 };
}
// Tháng suy từ Tuần THẬT (gộp OHLC, không phải suy từ Close) — dùng cho Screener
// chiến lược để không phải bulk-tải Tháng riêng cho cả 21 cặp. Khi mở sâu 1 cặp,
// tab CMT vẫn dùng Tháng THẬT lấy trực tiếp từ Twelve Data (loadPairExtraOHLC).
function aggMonthlyFromBars(bars) {
  const out = [];
  let cur = null;
  for (const b of bars) {
    const key = String(b.d).slice(0, 7); // YYYY-MM
    if (key !== cur) {
      out.push({ t: b.t, d: b.d, o: b.o, h: b.h, l: b.l, c: b.c });
      cur = key;
    } else {
      const last = out[out.length - 1];
      last.h = Math.max(last.h, b.h);
      last.l = Math.min(last.l, b.l);
      last.c = b.c;
      last.t = b.t;
      last.d = b.d;
    }
  }
  return out;
}

// Căn một chuỗi (sourceDates,sourceVals) theo targetDates: mỗi ngày đích lấy giá trị nguồn gần nhất ≤ ngày đó (carry-forward).
function alignToDates(sourceDates, sourceVals, targetDates) {
  const out = new Array(targetDates.length).fill(null);
  let si = 0,
    last = null;
  for (let i = 0; i < targetDates.length; i++) {
    while (si < sourceDates.length && sourceDates[si] <= targetDates[i]) {
      last = sourceVals[si];
      si++;
    }
    out[i] = last;
  }
  // điền đầu chuỗi nếu target bắt đầu sớm hơn source
  const firstVal = sourceVals.find((v) => v != null);
  for (let i = 0; i < out.length; i++) {
    if (out[i] == null) out[i] = firstVal;
    else break;
  }
  return out;
}

/* ============================================================
   3. TOÁN NỀN (dùng chung cho các lớp CMT)
   ============================================================ */

function mstd(arr) {
  const n = arr.length;
  if (!n) return { n: 0, mean: NaN, sd: NaN };
  const m = arr.reduce((s, x) => s + x, 0) / n;
  const v = n > 1 ? arr.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1) : 0;
  return { n, mean: m, sd: Math.sqrt(v) };
}
function linreg(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n,
    my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0,
    sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  return { slope: sxx > 0 ? sxy / sxx : 0 };
}
// SMA cuộn O(n), null cho tới khi đủ cửa sổ.
function sma(arr, w) {
  const out = Array(arr.length).fill(null);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (i >= w) sum -= arr[i - w];
    if (i >= w - 1) out[i] = sum / w;
  }
  return out;
}
function ema(arr, p) {
  const k = 2 / (p + 1);
  let e = null;
  return arr.map((v, i) => (e = i === 0 ? v : v * k + e * (1 - k)));
}
function wma(arr, w) {
  const n = arr.length,
    out = Array(n).fill(null),
    wsum = (w * (w + 1)) / 2;
  for (let i = w - 1; i < n; i++) {
    let s = 0;
    for (let k = 0; k < w; k++) s += arr[i - w + 1 + k] * (k + 1);
    out[i] = s / wsum;
  }
  return out;
}
function rsi(closes, p = 14) {
  const out = new Array(closes.length).fill(null);
  let g = 0,
    l = 0;
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const up = Math.max(d, 0),
      dn = Math.max(-d, 0);
    if (i <= p) {
      g += up;
      l += dn;
      if (i === p) {
        g /= p;
        l /= p;
        out[i] = 100 - 100 / (1 + g / (l || 1e-9));
      }
    } else {
      g = (g * (p - 1) + up) / p;
      l = (l * (p - 1) + dn) / p;
      out[i] = 100 - 100 / (1 + g / (l || 1e-9));
    }
  }
  return out;
}
function macd(closes) {
  const e12 = ema(closes, 12),
    e26 = ema(closes, 26);
  const m = closes.map((_, i) => e12[i] - e26[i]);
  const sig = ema(m, 9);
  return m.map((v, i) => ({ macd: v, signal: sig[i], hist: v - sig[i] }));
}
function macdCalc(closes, fast, slow, sig) {
  const eF = ema(closes, fast),
    eS = ema(closes, slow);
  const m = closes.map((_, i) => eF[i] - eS[i]);
  return { macd: m, signal: ema(m, sig) };
}
function stochClose(closes, p = 14) {
  return closes.map((c, i) => {
    if (i < p - 1) return null;
    const w = closes.slice(i - p + 1, i + 1);
    const hh = Math.max(...w),
      ll = Math.min(...w);
    return ((c - ll) / (hh - ll || 1e-9)) * 100;
  });
}
// EMA |Δclose| — thay ATR khi không có High/Low intraday
function volProxy(closes, p = 14) {
  return ema(
    closes.map((c, i) => (i ? Math.abs(c - closes[i - 1]) : 0)),
    p
  );
}
function closeATR(closes, period) {
  const n = closes.length,
    out = Array(n).fill(null);
  for (let i = period; i < n; i++) {
    let s = 0;
    for (let k = i - period + 1; k <= i; k++)
      s += Math.abs(closes[k] - closes[k - 1]);
    out[i] = s / period;
  }
  return out;
}
function pearson(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  const x = a.slice(-n),
    y = b.slice(-n);
  const mx = x.reduce((s, v) => s + v, 0) / n,
    my = y.reduce((s, v) => s + v, 0) / n;
  let num = 0,
    dx = 0,
    dy = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx += (x[i] - mx) ** 2;
    dy += (y[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy || 1e-12);
}
const returns = (cl) => cl.slice(1).map((c, i) => c / cl[i] - 1);

function pivots(closes, k, highs, lows) {
  const H = highs || closes;
  const L = lows || closes;
  const out = [];
  for (let i = k; i < closes.length - k; i++) {
    const hseg = H.slice(i - k, i + k + 1);
    const lseg = L.slice(i - k, i + k + 1);
    if (H[i] >= Math.max(...hseg)) out.push({ i, price: H[i], type: "H" });
    else if (L[i] <= Math.min(...lseg)) out.push({ i, price: L[i], type: "L" });
  }
  const f = [];
  out.forEach((p) => {
    const last = f[f.length - 1];
    if (last && last.type === p.type) {
      if (
        (p.type === "H" && p.price > last.price) ||
        (p.type === "L" && p.price < last.price)
      )
        f[f.length - 1] = p;
    } else f.push(p);
  });
  return f;
}
function dowTrend(piv) {
  const H = piv.filter((p) => p.type === "H").slice(-2);
  const L = piv.filter((p) => p.type === "L").slice(-2);
  if (H.length < 2 || L.length < 2)
    return { trend: "side", detail: "Chưa đủ đỉnh/đáy" };
  const hh = H[1].price > H[0].price,
    hl = L[1].price > L[0].price;
  if (hh && hl) return { trend: "up", detail: "Đỉnh cao hơn + đáy cao hơn" };
  if (!hh && !hl)
    return { trend: "down", detail: "Đỉnh thấp hơn + đáy thấp hơn" };
  return { trend: "side", detail: "Đỉnh/đáy không đồng nhất" };
}
// ------------------------------------------------------------
// 1H/4H — PHÂN TÍCH & BACKTEST TRÊN OHLC THẬT
// Khác các hàm backtest khác trong file (chạy trên mảng Close daily),
// nhóm hàm dưới đây nhận mảng bar {t,o,h,l,c} và mô phỏng khớp lệnh
// bằng High/Low thật: mỗi nến sau khi vào lệnh đều được kiểm tra xem
// SL hay TP bị chạm trước — không chỉ so Close ở một mốc cố định.
// Toàn bộ tính nhân quả (causal): pivot 4H chỉ được "công nhận" sau
// confirmLag nến kế tiếp (giống cách backtestConfluenceRolling ở trên
// làm với piv[pi].i+4<=i), tín hiệu vào lệnh luôn khớp ở GIÁ MỞ của
// nến 1H kế tiếp — không dùng thông tin tương lai.
// ------------------------------------------------------------
function pivotsOHLC(bars, look = 3) {
  // Bước 1: tìm mọi "đỉnh/đáy cục bộ" (fractal) độc lập theo từng phía — y hệt
  // trước đây. Một nến hiếm khi vừa là đỉnh cục bộ vừa là đáy cục bộ (nến bao
  // trùm/bị bao trùm) nên có thể sinh ra cả H lẫn L cùng index i.
  const raw = [];
  for (let i = look; i < bars.length - look; i++) {
    const h = bars[i].h,
      l = bars[i].l;
    let isH = true,
      isL = true;
    for (let k = 1; k <= look; k++) {
      if (bars[i - k].h > h || bars[i + k].h > h) isH = false;
      if (bars[i - k].l < l || bars[i + k].l < l) isL = false;
    }
    if (isH) raw.push({ i, price: h, type: "H" });
    if (isL) raw.push({ i, price: l, type: "L" });
  }
  raw.sort((a, b) => a.i - b.i);
  // Bước 2: ÉP XEN KẼ — Dow Theory đòi hỏi đỉnh/đáy phải luôn xen kẽ Đ-đ-Đ-đ.
  // Nếu 2 fractal cùng loại xuất hiện liên tiếp (chưa có điểm ngược loại xen
  // giữa), chỉ giữ điểm CỰC TRỊ hơn (đỉnh cao hơn / đáy thấp hơn), bỏ điểm còn
  // lại — thay vì giữ cả 2 khiến chuỗi so sánh "đỉnh sau > đỉnh trước" bị sai.
  const out = [];
  for (const p of raw) {
    const last = out[out.length - 1];
    if (!last || last.type !== p.type) {
      out.push(p);
    } else if (
      (p.type === "H" && p.price > last.price) ||
      (p.type === "L" && p.price < last.price)
    ) {
      out[out.length - 1] = p; // cùng loại liên tiếp — thay bằng điểm cực trị hơn
    }
    // ngược lại (p kém cực trị hơn last cùng loại) — bỏ qua p
  }
  return out;
}
// Chuỗi xu hướng Dow (đỉnh/đáy) tại MỌI nến, nhân quả (chỉ dùng pivot đã "chốt" ≤ i).
function buildTrendSeriesOHLC(bars, look = 3, confirmLag = 3) {
  const piv = pivotsOHLC(bars, look);
  const trend = new Array(bars.length).fill("side");
  let pi = 0;
  const H = [],
    L = [];
  for (let i = 0; i < bars.length; i++) {
    while (pi < piv.length && piv[pi].i + confirmLag <= i) {
      (piv[pi].type === "H" ? H : L).push(piv[pi]);
      pi++;
    }
    if (H.length >= 2 && L.length >= 2) {
      const hh = H[H.length - 1].price > H[H.length - 2].price;
      const hl = L[L.length - 1].price > L[L.length - 2].price;
      trend[i] = hh && hl ? "up" : !hh && !hl ? "down" : "side";
    }
  }
  return trend;
}
function atrOHLC(bars, period = 14) {
  const tr = bars.map((b, i) =>
    i === 0
      ? b.h - b.l
      : Math.max(
          b.h - b.l,
          Math.abs(b.h - bars[i - 1].c),
          Math.abs(b.l - bars[i - 1].c)
        )
  );
  const out = new Array(bars.length).fill(null);
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += tr[i];
    if (i >= period) sum -= tr[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}
// ------------------------------------------------------------
// Lấy Ngày+Tuần của MỘT cặp từ kho bulk loadBulkOHLC() trả về.
// ------------------------------------------------------------
function pairBarsFromStore(store, symbol) {
  if (!store) return null;
  const out = {};
  for (const tf of TF_BULK) out[tf] = (store[tf] && store[tf][symbol]) || null;
  if (!out.D || out.D.length < 60) return null; // Ngày là khung tối thiểu bắt buộc
  return out;
}
// Đánh giá xu hướng Dow (đỉnh/đáy) + pivot cho MỘT khung, thuần OHLC — dùng
// chung cho cả 5 khung Tháng/Tuần/Ngày/4H/1H thay vì hàm pivots()/dowTrend()
// close-only cũ. `piv` trả ra có cùng hình dạng {i,price,type} như pivots() cũ
// nên majorSwing/fibLevels/frameGate dùng lại được nguyên xi.
function tfFrame(bars, look = 3) {
  if (!bars || bars.length < look * 2 + 5)
    return { trend: "side", detail: "Chưa đủ nến", piv: [], bars: bars || [] };
  const piv = pivotsOHLC(bars, look);
  const d = dowTrend(piv);
  return { trend: d.trend, detail: d.detail, piv, bars };
}
// Bản OHLC của stepDownCascade — đo biên độ/thời lượng sóng bằng pivot High/Low
// thật của chính khung Tháng/Tuần/Ngày (không còn suy Tuần/Tháng từ Close ECB).
function stepDownCascadeOHLC(barsM, barsW, barsD) {
  const med = (arr) => {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const swingsOf = (bars, k) => {
    const piv = pivotsOHLC(bars, k);
    const amps = [],
      durs = [];
    for (let i = 1; i < piv.length; i++) {
      const a = piv[i - 1],
        b = piv[i];
      if (a.type === b.type) continue;
      amps.push((Math.abs(b.price - a.price) / a.price) * 100);
      durs.push(b.i - a.i);
    }
    return { medAmpl: med(amps), medDur: med(durs), n: amps.length };
  };
  const M = swingsOf(barsM, 2),
    W = swingsOf(barsW, 2),
    D = swingsOf(barsD, 4);
  const rMW = M.medAmpl && W.medAmpl ? M.medAmpl / W.medAmpl : null;
  const rWD = W.medAmpl && D.medAmpl ? W.medAmpl / D.medAmpl : null;
  const consistent =
    rMW && rWD ? Math.abs(rMW - rWD) / ((rMW + rWD) / 2) < 0.5 : false;
  const projRatio =
    rMW && rWD ? (consistent ? (rMW + rWD) / 2 : rWD) : rWD || rMW;
  const proj4H =
    projRatio && D.medAmpl
      ? {
          medAmpl: D.medAmpl / projRatio,
          medDurBars: D.medDur
            ? Math.max(1, Math.round((D.medDur / projRatio) * 6))
            : null,
        }
      : null;
  return { M, W, D, rMW, rWD, projRatio, consistent, proj4H };
}
// Căn xu hướng 4H (đã biết tới thời điểm đó, không nhìn tương lai) vào từng nến 1H.
function align4hTrendTo1h(bars1h, bars4h, trend4h) {
  const out = new Array(bars1h.length).fill("side");
  let j = -1;
  for (let i = 0; i < bars1h.length; i++) {
    while (j + 1 < bars4h.length && bars4h[j + 1].t <= bars1h[i].t) j++;
    out[i] = j >= 0 ? trend4h[j] : "side";
  }
  return out;
}
// Trigger vào lệnh ở 1H: RSI thoát vùng quá mua/quá bán, THEO chiều xu hướng 4H.
function generateSignals1h(bars1h, trend4hAligned) {
  const closes = bars1h.map((b) => b.c);
  const rsiArr = rsi(closes, 14);
  const signals = [];
  for (let i = 20; i < bars1h.length; i++) {
    const trend = trend4hAligned[i];
    if (trend === "side") continue;
    const cu = rsiArr[i - 1] != null && rsiArr[i - 1] < 40 && rsiArr[i] >= 40;
    const cd = rsiArr[i - 1] != null && rsiArr[i - 1] > 60 && rsiArr[i] <= 60;
    if (trend === "up" && cu) signals.push({ i, dir: "long" });
    else if (trend === "down" && cd) signals.push({ i, dir: "short" });
  }
  return signals;
}
// Backtest thật: vào lệnh ở giá MỞ nến kế (không dùng giá đã biết Close của nến tín hiệu),
// SL/TP theo ATR, đi từng nến kiểm tra High/Low — chạm SL và TP cùng nến thì tính THUA
// (giả định thận trọng, không lạc quan hoá kết quả).
// ============================================================
// UNIFIED TREND-RIDING EXIT (v3) — luật thoát dùng chung cho các engine backtest.
// Không chốt lời cứng → để lệnh thắng chạy → bảo vệ bằng trailing.
//   1) Stop ban đầu = initStopATR×ATR (=1R)
//   2) Lời +partialR → chốt partialFrac, dời stop breakeven
//   3) Còn lại: chandelier trailing = extreme − trailATR×ATR (cưỡi sóng)
//   4) Thoát: trail bị quét / trend flip / hết maxHold. Trừ costR mỗi lệnh.
// R chuẩn hoá theo risk ⇒ thua tối đa ~ −1R − cost. Không lookahead.
// (Chỉ dùng comment một dòng // để không bao giờ vỡ build.)
// ============================================================
const RIDE_CFG = {
  atrLen: 14,
  initStopATR: 2.0,
  partialR: 1.0,
  partialFrac: 0.5,
  beAfterPartial: true,
  trailATR: 3.0,
  maxHold: 120,
  costR: 0.03,
};

function _rideFin(r, entryIdx, exitIdx, cfg, outcome, dir, entry, initStop, exitPrice) {
  return {
    r: +(r - cfg.costR).toFixed(4),
    entryIdx, exitIdx, outcome, dir, entry,
    initStop, exitPrice,
    hold: exitIdx - entryIdx,
  };
}

function rideExitOHLC(bars, entryIdx, dir, atrArr, cfg = RIDE_CFG, trendFlip = null) {
  const s = dir === "long" ? 1 : -1;
  if (entryIdx < 1 || entryIdx >= bars.length) return null;
  const entry = bars[entryIdx].o;
  const atr0 = atrArr[entryIdx - 1] ?? atrArr[entryIdx];
  if (!atr0 || atr0 <= 0) return null;
  const risk = cfg.initStopATR * atr0;
  if (!(risk > 0)) return null;
  const initStop = entry - s * risk;
  let stop = initStop;
  const partialLvl = entry + s * cfg.partialR * risk;
  let partialDone = cfg.partialFrac <= 0;
  let extreme = entry, realizedR = 0, remaining = 1;
  const lastK = Math.min(bars.length - 1, entryIdx + cfg.maxHold - 1);
  for (let k = entryIdx; k <= lastK; k++) {
    const b = bars[k];
    const hitStop = s === 1 ? b.l <= stop : b.h >= stop;
    if (hitStop) {
      realizedR += remaining * ((s * (stop - entry)) / risk);
      return _rideFin(realizedR, entryIdx, k, cfg, partialDone ? "trail" : "stop", dir, entry, initStop, stop);
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
      return _rideFin(realizedR, entryIdx, k, cfg, "flip", dir, entry, initStop, b.c);
    }
  }
  const bc = bars[lastK].c;
  realizedR += remaining * ((s * (bc - entry)) / risk);
  return _rideFin(realizedR, entryIdx, lastK, cfg, "timeout", dir, entry, initStop, bc);
}

function rideExitClose(closes, volArr, entryIdx, dir, cfg = RIDE_CFG, trendFlip = null) {
  const s = dir === "long" ? 1 : -1;
  if (entryIdx < 1 || entryIdx >= closes.length) return null;
  const entry = closes[entryIdx];
  const v0 = volArr[entryIdx - 1] ?? volArr[entryIdx];
  if (!v0 || v0 <= 0) return null;
  const risk = cfg.initStopATR * v0;
  if (!(risk > 0)) return null;
  const initStop = entry - s * risk;
  let stop = initStop;
  const partialLvl = entry + s * cfg.partialR * risk;
  let partialDone = cfg.partialFrac <= 0;
  let extreme = entry, realizedR = 0, remaining = 1;
  const lastK = Math.min(closes.length - 1, entryIdx + cfg.maxHold - 1);
  for (let k = entryIdx + 1; k <= lastK; k++) {
    const cc = closes[k];
    const hitStop = s === 1 ? cc <= stop : cc >= stop;
    if (hitStop) {
      realizedR += remaining * ((s * (stop - entry)) / risk);
      return _rideFin(realizedR, entryIdx, k, cfg, partialDone ? "trail" : "stop", dir, entry, initStop, stop);
    }
    if (!partialDone) {
      const hitPartial = s === 1 ? cc >= partialLvl : cc <= partialLvl;
      if (hitPartial) {
        realizedR += cfg.partialFrac * cfg.partialR;
        remaining -= cfg.partialFrac;
        partialDone = true;
        if (cfg.beAfterPartial) stop = s === 1 ? Math.max(stop, entry) : Math.min(stop, entry);
      }
    }
    extreme = s === 1 ? Math.max(extreme, cc) : Math.min(extreme, cc);
    const vK = volArr[k] ?? v0;
    const chand = extreme - s * cfg.trailATR * vK;
    stop = s === 1 ? Math.max(stop, chand) : Math.min(stop, chand);
    if (trendFlip && trendFlip(k, dir)) {
      realizedR += remaining * ((s * (cc - entry)) / risk);
      return _rideFin(realizedR, entryIdx, k, cfg, "flip", dir, entry, initStop, cc);
    }
  }
  const bc = closes[lastK];
  realizedR += remaining * ((s * (bc - entry)) / risk);
  return _rideFin(realizedR, entryIdx, lastK, cfg, "timeout", dir, entry, initStop, bc);
}

// backtestOHLC — GIỮ chữ ký + hình dạng trade cũ ({...sig, entry, sl, tp, r, outcome, exitIdx, atr}).
// Chỉ đổi ruột: thay TP=2R cứng bằng trailing. outcome map về "tp"/"sl"/"timeout" để summarize cũ chạy nguyên.
function backtestOHLC(bars, signals, opts = {}) {
  const cfg = { ...RIDE_CFG, maxHold: opts.maxHold ? Math.max(opts.maxHold, 120) : RIDE_CFG.maxHold };
  const atrArr = atrOHLC(bars, cfg.atrLen ?? 14);
  const trades = [];
  for (const sig of signals) {
    const t = rideExitOHLC(bars, sig.i + 1, sig.dir, atrArr, cfg);
    if (!t) continue;
    const outcome = t.outcome === "timeout" ? "timeout" : t.r > 0 ? "tp" : "sl";
    trades.push({
      ...sig,
      entry: t.entry,
      sl: t.initStop,
      tp: t.exitPrice,
      r: t.r,
      outcome,
      exitIdx: t.exitIdx,
      atr: atrArr[sig.i] ?? null,
    });
  }
  return trades;
}
function summarizeOHLCTrades(trades) {
  if (!trades.length) return null;
  const wins = trades.filter((t) => t.r > 0);
  const losses = trades.filter((t) => t.r <= 0);
  const grossWin = wins.reduce((s, t) => s + t.r, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.r, 0));
  return {
    n: trades.length,
    winRate: Math.round((wins.length / trades.length) * 100),
    avgR: (trades.reduce((s, t) => s + t.r, 0) / trades.length).toFixed(2),
    pf: grossLoss ? (grossWin / grossLoss).toFixed(2) : "∞",
    long: trades.filter((t) => t.dir === "long").length,
    short: trades.filter((t) => t.dir === "short").length,
    tp: trades.filter((t) => t.outcome === "tp").length,
    sl: trades.filter((t) => t.outcome === "sl").length,
    timeout: trades.filter((t) => t.outcome === "timeout").length,
  };
}
// Gói toàn bộ pipeline 1H/4H cho một cặp: xu hướng 4H, tín hiệu 1H, backtest, và
// gợi ý vào lệnh HIỆN TẠI (nếu nến 1H gần nhất vừa phát tín hiệu).
function buildIntradayModel(bars1h, bars4h, opts = {}) {
  const trend4h = buildTrendSeriesOHLC(bars4h, 3, 3);
  const trend4hAligned = align4hTrendTo1h(bars1h, bars4h, trend4h);
  const signals = generateSignals1h(bars1h, trend4hAligned);
  const trades = backtestOHLC(bars1h, signals, opts);
  const stats = summarizeOHLCTrades(trades);
  const atrArr = atrOHLC(bars1h, 14);
  const lastIdx = bars1h.length - 1;
  const curTrend4h = trend4h[trend4h.length - 1];
  const lastSignal = signals.length ? signals[signals.length - 1] : null;
  // Tín hiệu "mới" = tín hiệu ở đúng nến 1H cuối cùng đã đóng (chưa qua nến vào lệnh).
  const freshSignal =
    lastSignal && lastSignal.i === lastIdx ? lastSignal : null;
  let suggestion = null;
  if (freshSignal) {
    const atr = atrArr[freshSignal.i];
    const refPrice = bars1h[lastIdx].c;
    if (atr) {
      const atrMult = opts.atrMult ?? 1.5,
        rr = opts.rr ?? 2;
      const sl =
        freshSignal.dir === "long"
          ? refPrice - atr * atrMult
          : refPrice + atr * atrMult;
      const risk = Math.abs(refPrice - sl);
      const tp =
        freshSignal.dir === "long"
          ? refPrice + risk * rr
          : refPrice - risk * rr;
      suggestion = { dir: freshSignal.dir, refPrice, sl, tp, risk, rr };
    }
  }
  return {
    trend4h: curTrend4h,
    trend4hAligned,
    signals,
    trades,
    stats,
    suggestion,
    lastBar1h: bars1h[lastIdx],
    lastBar4h: bars4h[bars4h.length - 1],
  };
}

// ------------------------------------------------------------
// HỆ THỐNG PHÂN TẦNG: Daily = xu hướng chính · Weekly = bộ lọc không đi ngược ·
// 4H = "cửa sổ hồi giá" (pullback) đang mở hay chưa · 1H = điểm bấm lệnh chính xác.
// TP không còn là bội số R cố định — lấy mốc đỉnh/đáy Daily gần nhất còn "nguyên vẹn"
// (chưa bị giá đóng cửa xuyên qua) làm mục tiêu; nếu mốc Daily quá gần (RR<minRR) thì
// lùi ra lấy mốc Weekly xa hơn. Nếu xu hướng Daily vẫn đứng và có thêm tín hiệu 1H hợp lệ
// trong cùng nhịp xu hướng đó → NHỒI THÊM LỆNH (tối đa maxStack lệnh cùng chiều),
// tất cả cùng nhắm về 1 vùng TP cấu trúc — đây là lý do winrate/lệnh sẽ hạ xuống mức
// thực tế hơn (khoảng 70-85% tuỳ cặp) thay vì con số ảo khi backtest trên Close-only.
// ------------------------------------------------------------

// Con trỏ căn theo thời gian: với mỗi nến ở khung thấp, trả về index nến khung cao gần nhất
// đã ĐÓNG trước hoặc đúng thời điểm đó (nhân quả, không nhìn tương lai).
function indexAlignPointer(lowerBars, higherBars) {
  const out = new Array(lowerBars.length).fill(-1);
  let j = -1;
  for (let i = 0; i < lowerBars.length; i++) {
    while (j + 1 < higherBars.length && higherBars[j + 1].t <= lowerBars[i].t)
      j++;
    out[i] = j;
  }
  return out;
}
// Tìm mốc đối kháng (kháng cự cho lệnh mua / hỗ trợ cho lệnh bán) GẦN NHẤT tính đến
// atRefIdx mà vẫn còn "nguyên vẹn" — tức chưa có nến nào đóng cửa xuyên qua nó sau khi
// mốc được xác nhận. Chỉ dùng pivot đã "chốt" (p.i+confirmLag<=atRefIdx) để đảm bảo nhân quả.
function nearestStructuralTarget(
  bars,
  piv,
  dir,
  atRefIdx,
  refPrice,
  confirmLag = 3
) {
  const type = dir === "long" ? "H" : "L";
  const candidates = piv.filter(
    (p) => p.type === type && p.i + confirmLag <= atRefIdx
  );
  for (let k = candidates.length - 1; k >= 0; k--) {
    const p = candidates[k];
    const level = p.price;
    const beyond = dir === "long" ? level > refPrice : level < refPrice;
    if (!beyond) continue;
    let broken = false;
    for (let j = p.i + 1; j <= atRefIdx; j++) {
      if (dir === "long" ? bars[j].c > level : bars[j].c < level) {
        broken = true;
        break;
      }
    }
    if (!broken) return { level, pivotIdx: p.i };
  }
  return null;
}
// "Cửa sổ hồi giá" 4H: LIÊN TỤC, không chỉ tại 1 sự kiện hiếm — coi là "đang hồi" khi giá
// nằm gần EMA20 4H (trong X lần ATR 4H), tức chưa duỗi quá xa khỏi đường trend-following.
// (Bản trước bắt buộc phải có 1 sự kiện RSI-cross 4H rời rạc mới mở cửa sổ → quá hiếm, quá ít lệnh.)
function pullbackZoneFlags4h(bars4h, emaPeriod = 20, atrZoneMult = 1.2) {
  const closes4h = bars4h.map((b) => b.c);
  const ema4h = ema(closes4h, emaPeriod);
  const atr4h = atrOHLC(bars4h, 14);
  return bars4h.map((b, i) =>
    atr4h[i] ? Math.abs(b.c - ema4h[i]) <= atrZoneMult * atr4h[i] : false
  );
}
function pullbackWindowFlags1h(bars1h, bars4h, zoneFlags4h) {
  const idx = indexAlignPointer(bars1h, bars4h);
  return idx.map((j) => (j >= 0 ? zoneFlags4h[j] : false));
}
// SL theo CẤU TRÚC: lấy swing gần nhất (đỉnh hồi cho lệnh bán / đáy hồi cho lệnh mua) trên
// chính nến 1H trong lookback gần đây, cộng thêm đệm nhỏ theo ATR để tránh bị quét râu nến.
// Đây là stop hợp lý cho lệnh nhắm TP đa-ngày (Ngày/Tuần) — khác hẳn ATR(1H)×1.5 quá sát,
// vốn là nguyên nhân chính khiến toàn bộ lệnh trước đó dính SL dù đúng hướng xu hướng Ngày.
function structuralStop(
  bars,
  piv,
  dir,
  atRefIdx,
  atr,
  confirmLag = 3,
  lookback = 80,
  bufferMult = 0.3
) {
  const type = dir === "long" ? "L" : "H";
  const from = Math.max(0, atRefIdx - lookback);
  const cands = piv.filter(
    (p) => p.type === type && p.i + confirmLag <= atRefIdx && p.i >= from
  );
  if (!cands.length) return null;
  const last = cands[cands.length - 1];
  const buf = (atr || 0) * bufferMult;
  return dir === "long" ? last.price - buf : last.price + buf;
}
// Tín hiệu vào lệnh 1H: Daily quyết hướng, Weekly không được ngược, 4H phải đang trong
// cửa sổ hồi giá, RSI 1H là điểm bấm cò chính xác.
function generateLayeredSignals1h(
  bars1h,
  dailyTrendAligned1h,
  weeklyTrendAligned1h,
  pullbackActive1h
) {
  const closes = bars1h.map((b) => b.c);
  const rsiArr = rsi(closes, 14);
  const out = [];
  for (let i = 20; i < bars1h.length; i++) {
    const dTrend = dailyTrendAligned1h[i];
    if (dTrend === "side") continue;
    const wTrend = weeklyTrendAligned1h[i];
    if (wTrend !== "side" && wTrend !== dTrend) continue;
    if (!pullbackActive1h[i]) continue;
    const cu = rsiArr[i - 1] != null && rsiArr[i - 1] < 40 && rsiArr[i] >= 40;
    const cd = rsiArr[i - 1] != null && rsiArr[i - 1] > 60 && rsiArr[i] <= 60;
    if (dTrend === "up" && cu) out.push({ i, dir: "long" });
    else if (dTrend === "down" && cd) out.push({ i, dir: "short" });
  }
  return out;
}
// Backtest có NHỒI LỆNH: nhiều vị thế cùng chiều có thể mở song song trong cùng 1 nhịp
// xu hướng Daily (tối đa maxStack), mỗi lệnh có SL riêng (ATR tại lúc vào) nhưng TP là
// mốc cấu trúc Daily/Weekly — mô phỏng đúng High/Low từng nến, không lookahead.
function backtestLayered(
  bars1h,
  signals,
  piv1h,
  dailyBars,
  dailyPiv,
  weeklyBars,
  weeklyPiv,
  dailyIdxFor1h,
  weeklyIdxFor1h,
  dailyTrendAligned1h,
  opts = {}
) {
  const {
    atrMult = 1.5,
    maxHold = 96,
    maxStack = 3,
    minRR = 1.2,
    rrFallback = 2,
  } = opts;
  const atrArr = atrOHLC(bars1h, 14);
  const trades = [];
  const openPositions = [];
  // Gán mỗi nến 1H vào 1 "nhịp xu hướng Daily" (legId) — nhồi lệnh chỉ được phép trong cùng nhịp.
  const legOfBar = new Array(bars1h.length).fill(0);
  let legId = 0,
    lastDir = null;
  for (let i = 0; i < bars1h.length; i++) {
    const d = dailyTrendAligned1h[i];
    if (d !== lastDir && d !== "side") {
      legId++;
      lastDir = d;
    }
    legOfBar[i] = legId;
  }
  let si = 0;
  for (let i = 0; i < bars1h.length; i++) {
    for (let p = openPositions.length - 1; p >= 0; p--) {
      const pos = openPositions[p];
      const b = bars1h[i];
      const hitSL = pos.dir === "long" ? b.l <= pos.sl : b.h >= pos.sl;
      const hitTP = pos.dir === "long" ? b.h >= pos.tp : b.l <= pos.tp;
      const timedOut = i - pos.entryIdx >= maxHold;
      if (hitSL || hitTP || timedOut || i === bars1h.length - 1) {
        let outcome, r;
        if (hitSL) {
          outcome = "sl";
          r = -1;
        } else if (hitTP) {
          outcome = "tp";
          r = Math.abs(pos.tp - pos.entry) / pos.risk;
        } else {
          outcome = "timeout";
          r =
            pos.dir === "long"
              ? (b.c - pos.entry) / pos.risk
              : (pos.entry - b.c) / pos.risk;
        }
        trades.push({ ...pos, exitIdx: i, outcome, r });
        openPositions.splice(p, 1);
      }
    }
    while (si < signals.length && signals[si].i === i) {
      const sig = signals[si];
      si++;
      const sameLegOpen = openPositions.filter(
        (p) => p.dir === sig.dir && p.legId === legOfBar[i]
      );
      if (sameLegOpen.length >= maxStack) continue;
      const entryIdx = i + 1;
      if (entryIdx >= bars1h.length) continue;
      const atr = atrArr[i];
      if (!atr) continue;
      const entry = bars1h[entryIdx].o;
      // === CMT PULLBACK ===
      // SL = swing low/high GẦN NHẤT (cấu trúc), KHÔNG dùng ATR. Không có swing hợp lệ → bỏ lệnh.
      const sl = structuralStop(bars1h, piv1h, sig.dir, i, 0, 3, 80, 0);
      const validSide =
        sl != null && (sig.dir === "long" ? sl < entry : sl > entry);
      if (!validSide) continue;
      const slSource = "structural";
      const risk = Math.abs(entry - sl);
      if (!risk) continue;
      // TP = pivot NGÀY gần nhất theo hướng (chỉ Daily — KHÔNG Tuần, KHÔNG bội số R).
      // Daily chưa có pivot phía trước → bỏ lệnh (đúng luật: chỉ vào khi daily có TP).
      const dIdx = dailyIdxFor1h[i];
      const tpInfo =
        dIdx != null && dIdx >= 0
          ? nearestStructuralTarget(dailyBars, dailyPiv, sig.dir, dIdx, entry, 3)
          : null;
      if (!tpInfo) continue;
      const tp = tpInfo.level;
      const tpSource = "daily";
      openPositions.push({
        dir: sig.dir,
        entry,
        sl,
        tp,
        risk,
        entryIdx,
        legId: legOfBar[i],
        tpSource,
        slSource,
        isAddon: sameLegOpen.length > 0,
      });
    }
  }
  return trades;
}
function summarizeLayeredTrades(trades) {
  const base = summarizeOHLCTrades(trades);
  if (!base) return null;
  const addon = trades.filter((t) => t.isAddon).length;
  const bySource = { daily: 0, weekly: 0, atr_fallback: 0 };
  trades.forEach((t) => {
    bySource[t.tpSource] = (bySource[t.tpSource] || 0) + 1;
  });
  // Chẩn đoán SL: bao nhiêu % lệnh dùng SL cấu trúc (swing hồi thật) so với SL ATR
  // dự phòng (khi không tìm được swing phù hợp trong 80 nến gần nhất) — và mỗi
  // nhóm có tỷ lệ dính SL / R trung bình khác nhau bao nhiêu. Nếu nhóm atr_fallback
  // chiếm đa số VÀ có tỷ lệ dính SL cao hơn hẳn nhóm structural, đó là dấu hiệu SL
  // đang quá sát do fallback kích hoạt thường xuyên — cần nới lookback tìm swing.
  const slGroup = (src) => trades.filter((t) => t.slSource === src);
  const slStats = (list) => ({
    n: list.length,
    slRate: list.length
      ? Math.round((list.filter((t) => t.outcome === "sl").length / list.length) * 100)
      : 0,
    tpRate: list.length
      ? Math.round((list.filter((t) => t.outcome === "tp").length / list.length) * 100)
      : 0,
    avgR: list.length
      ? +(list.reduce((s, t) => s + t.r, 0) / list.length).toFixed(2)
      : 0,
  });
  const bySLSource = {
    structural: slStats(slGroup("structural")),
    atr_fallback: slStats(slGroup("atr_fallback")),
  };
  const clusters = {};
  trades.forEach((t) => {
    const key = `${t.legId}|${t.dir}`;
    (clusters[key] = clusters[key] || []).push(t);
  });
  const clusterList = Object.values(clusters);
  const clusterWins = clusterList.filter(
    (c) => c.reduce((s, t) => s + t.r, 0) > 0
  ).length;
  return {
    ...base,
    addon,
    addonRate: trades.length ? Math.round((addon / trades.length) * 100) : 0,
    bySource,
    bySLSource,
    clusters: clusterList.length,
    clusterWinRate: clusterList.length
      ? Math.round((clusterWins / clusterList.length) * 100)
      : 0,
    avgAddonPerCluster: clusterList.length
      ? (trades.length / clusterList.length).toFixed(2)
      : "0",
  };
}
// Pipeline đầy đủ: Daily+Weekly (OHLC thật, để pivot chuẩn) → 4H (cửa sổ hồi giá) →
// 1H (điểm vào lệnh + nhồi lệnh) → backtest → gợi ý lệnh hiện tại.
function buildLayeredModel(dailyBars, weeklyBars, bars4h, bars1h, opts = {}) {
  const dailyTrend = buildTrendSeriesOHLC(dailyBars, 3, 3);
  const weeklyTrend = buildTrendSeriesOHLC(weeklyBars, 2, 2);
  const dailyPiv = pivotsOHLC(dailyBars, 3);
  const weeklyPiv = pivotsOHLC(weeklyBars, 2);
  const piv1h = pivotsOHLC(bars1h, 3);

  const dailyIdxFor1h = indexAlignPointer(bars1h, dailyBars);
  const weeklyIdxFor1h = indexAlignPointer(bars1h, weeklyBars);
  const dailyTrendAligned1h = dailyIdxFor1h.map((j) =>
    j >= 0 ? dailyTrend[j] : "side"
  );
  const weeklyTrendAligned1h = weeklyIdxFor1h.map((j) =>
    j >= 0 ? weeklyTrend[j] : "side"
  );
  const zoneFlags4h = pullbackZoneFlags4h(
    bars4h,
    20,
    opts.pullbackZoneAtrMult ?? 1.2
  );
  const pullbackActive1h = pullbackWindowFlags1h(bars1h, bars4h, zoneFlags4h);

  const signals = generateLayeredSignals1h(
    bars1h,
    dailyTrendAligned1h,
    weeklyTrendAligned1h,
    pullbackActive1h
  );
  const trades = backtestLayered(
    bars1h,
    signals,
    piv1h,
    dailyBars,
    dailyPiv,
    weeklyBars,
    weeklyPiv,
    dailyIdxFor1h,
    weeklyIdxFor1h,
    dailyTrendAligned1h,
    opts
  );
  const stats = summarizeLayeredTrades(trades);

  const lastIdx = bars1h.length - 1;
  const lastSignal = signals.length ? signals[signals.length - 1] : null;
  const freshSignal =
    lastSignal && lastSignal.i === lastIdx ? lastSignal : null;
  let suggestion = null;
  if (freshSignal) {
    const atrArr = atrOHLC(bars1h, 14);
    const atr = atrArr[freshSignal.i];
    const refPrice = bars1h[lastIdx].c;
    if (atr) {
      const atrMult = opts.atrMult ?? 1.5;
      const minRR = opts.minRR ?? 1.2;
      const rrFallback = opts.rrFallback ?? 2;
      let sl = structuralStop(
        bars1h,
        piv1h,
        freshSignal.dir,
        lastIdx,
        atr,
        3,
        80,
        0.3
      );
      const validSide =
        sl != null &&
        (freshSignal.dir === "long" ? sl < refPrice : sl > refPrice);
      if (!validSide)
        sl =
          freshSignal.dir === "long"
            ? refPrice - atr * atrMult
            : refPrice + atr * atrMult;
      const risk = Math.abs(refPrice - sl);
      const dIdx = dailyIdxFor1h[lastIdx];
      const wIdx = weeklyIdxFor1h[lastIdx];
      let tpInfo =
        dIdx != null && dIdx >= 0
          ? nearestStructuralTarget(
              dailyBars,
              dailyPiv,
              freshSignal.dir,
              dIdx,
              refPrice,
              3
            )
          : null;
      let tpSource = "daily";
      if (!tpInfo || Math.abs(tpInfo.level - refPrice) / risk < minRR) {
        const wTp =
          wIdx != null && wIdx >= 0
            ? nearestStructuralTarget(
                weeklyBars,
                weeklyPiv,
                freshSignal.dir,
                wIdx,
                refPrice,
                2
              )
            : null;
        if (wTp) {
          tpInfo = wTp;
          tpSource = "weekly";
        }
      }
      let tp, rr;
      if (tpInfo && Math.abs(tpInfo.level - refPrice) / risk >= minRR) {
        tp = tpInfo.level;
        rr = Math.abs(tp - refPrice) / risk;
      } else {
        rr = rrFallback;
        tp =
          freshSignal.dir === "long"
            ? refPrice + risk * rr
            : refPrice - risk * rr;
        tpSource = "atr_fallback";
      }
      let legId = 0,
        lastDir = null;
      for (let i = 0; i <= lastIdx; i++) {
        const d = dailyTrendAligned1h[i];
        if (d !== lastDir && d !== "side") {
          legId++;
          lastDir = d;
        }
      }
      const openSameLeg = trades.filter(
        (t) => t.dir === freshSignal.dir && t.legId === legId
      ).length;
      suggestion = {
        dir: freshSignal.dir,
        refPrice,
        sl,
        tp,
        risk,
        rr,
        tpSource,
        isAddon: openSameLeg > 0,
        addonCount: openSameLeg,
      };
    }
  }

  return {
    dailyTrend: dailyTrend[dailyTrend.length - 1],
    weeklyTrend: weeklyTrend[weeklyTrend.length - 1],
    signals,
    trades,
    stats,
    suggestion,
    lastBarDaily: dailyBars[dailyBars.length - 1],
    lastBarWeekly: weeklyBars[weeklyBars.length - 1],
    lastBar1h: bars1h[lastIdx],
    lastBar4h: bars4h[bars4h.length - 1],
  };
}

// Backtest "ĐÚNG BƯỚC 8": thay vì lọc hướng chỉ bằng Dow D/W thuần (buildLayeredModel
// ở trên), dùng chuỗi hướng NHÂN QUẢ đã kết hợp cán cân bằng chứng + xác suất analog
// (buildStep8DirectionSeries) làm bộ lọc hướng cho đúng engine 4H→1H (pullback + nhồi
// lệnh + SL/TP cấu trúc) đã có — tái dùng generateLayeredSignals1h/backtestLayered
// nguyên xi, chỉ đổi nguồn "hướng Daily". Weekly đã nằm trong cán cân bằng chứng của
// Bước 8 rồi nên không lọc lại lần 2 (truyền "side" để vô hiệu hoá gate đó).
// ============================================================
// BACKTEST T90 — 4 tổ hợp: {1H,4H} vào × {Ngày,Tuần} làm mục tiêu T90.
// Vào: pullback về EMA20 khung vào + đóng nến quay lại theo trend (Dow) khung target.
// TP = T90 tính CAUSAL trên khung target (chỉ dữ liệu tới lúc vào). SL = swing gần nhất khung vào.
// R chuẩn theo rủi ro tới SL. Không lookahead. Đã kiểm chứng cơ chế bằng Node.
// ============================================================
function _pEmpTouchCausal(bars, jEnd, touchUp, d, H) {
  let hit = 0, n = 0;
  for (let i = 50; i < jEnd - 1; i++) {
    const e = bars[i].c, lvl = touchUp ? e + d : e - d, last = Math.min(jEnd, i + H);
    let h = false;
    for (let k = i + 1; k <= last; k++) { if (touchUp ? bars[k].h >= lvl : bars[k].l <= lvl) { h = true; break; } }
    if (h) hit++;
    n++;
  }
  return n >= 15 ? hit / n : null;
}
function _t90AtIndex(bars, atr, closes, j, dirUp, H, thr) {
  const sig = atr[j];
  if (!sig || sig <= 0) return null;
  let mu = 0, c = 0;
  for (let i = Math.max(1, j - 100); i <= j; i++) { mu += closes[i] - closes[i - 1]; c++; }
  mu = c ? mu / c : 0;
  let best = null, fb = null;
  for (let m = 0.25; m <= 6.001; m += 0.25) {
    const d = m * sig;
    const pA = _pEmpTouchCausal(bars, j, dirUp, d, H), pB = _pBarrierTouch(d, dirUp, mu, sig, H);
    let w = 0, pp = 0;
    if (pA != null) { pp += 0.6 * pA; w += 0.6; }
    if (pB != null) { pp += 0.4 * pB; w += 0.4; }
    const p = w > 0 ? pp / w : null;
    if (p == null) continue;
    if (fb == null) fb = { d };
    if (p >= thr) best = { d };
    else if (best) break;
  }
  const pick = best || fb;
  return pick ? pick.d : null;
}
function _nearestSwingTF(bars, idx, dirUp, look, confirm) {
  for (let i = idx - confirm - 1; i >= Math.max(1, idx - look); i--) {
    if (i + 1 >= bars.length) continue;
    const isLow = bars[i].l <= bars[i - 1].l && bars[i].l <= bars[i + 1].l;
    const isHigh = bars[i].h >= bars[i - 1].h && bars[i].h >= bars[i + 1].h;
    if (dirUp && isLow) return bars[i].l;
    if (!dirUp && isHigh) return bars[i].h;
  }
  return null;
}
function backtestT90Combo(barsEntry, barsTarget, opts) {
  const H = (opts && opts.H) || 20, maxHold = (opts && opts.maxHold) || 200, thr = 0.9;
  if (!barsEntry || !barsTarget || barsEntry.length < 120 || barsTarget.length < 80) return { n: 0 };
  const closesE = barsEntry.map((b) => b.c), emaE = ema(closesE, 20);
  const closesT = barsTarget.map((b) => b.c), atrT = atrOHLC(barsTarget, 14);
  const trendT = buildTrendSeriesOHLC(barsTarget, 3, 3);
  const cache = new Map();
  let j = 0, freeAt = 0;
  const trades = [];
  for (let i = 50; i < barsEntry.length - 1; i++) {
    while (j + 1 < barsTarget.length && barsTarget[j + 1].t <= barsEntry[i].t) j++;
    const dir = trendT[j];
    if (dir === "side") continue;
    const dirUp = dir === "up";
    const pulled = dirUp ? closesE[i - 1] <= emaE[i - 1] : closesE[i - 1] >= emaE[i - 1];
    const resumed = dirUp ? closesE[i] > emaE[i] : closesE[i] < emaE[i];
    if (!pulled || !resumed || i < freeAt) continue;
    const entryIdx = i + 1, entry = barsEntry[entryIdx].o;
    const sl = _nearestSwingTF(barsEntry, entryIdx, dirUp, 40, 2);
    if (sl == null || (dirUp ? sl >= entry : sl <= entry)) continue;
    const risk = Math.abs(entry - sl);
    if (!risk) continue;
    const key = dirUp + "|" + j;
    let dist = cache.get(key);
    if (dist === undefined) { dist = _t90AtIndex(barsTarget, atrT, closesT, j, dirUp, H, thr); cache.set(key, dist); }
    if (!dist) continue;
    const tp = dirUp ? entry + dist : entry - dist;
    if (dirUp ? tp <= entry : tp >= entry) continue;
    const last = Math.min(barsEntry.length - 1, entryIdx + maxHold - 1);
    let outcome = "timeout", exitIdx = last, exit = barsEntry[last].c;
    for (let k = entryIdx; k <= last; k++) {
      const b = barsEntry[k];
      if (dirUp ? b.l <= sl : b.h >= sl) { outcome = "sl"; exitIdx = k; exit = sl; break; }
      if (dirUp ? b.h >= tp : b.l <= tp) { outcome = "tp"; exitIdx = k; exit = tp; break; }
    }
    const r = (dirUp ? exit - entry : entry - exit) / risk;
    trades.push({ r, outcome, hold: exitIdx - entryIdx });
    freeAt = exitIdx + 1;
  }
  return _t90Metrics(trades);
}
function _t90Metrics(tr) {
  if (!tr.length) return { n: 0 };
  const R = tr.map((t) => t.r), wins = R.filter((x) => x > 0);
  const gw = wins.reduce((a, b) => a + b, 0), gl = Math.abs(R.filter((x) => x <= 0).reduce((a, b) => a + b, 0));
  let eq = 0, pk = 0, dd = 0;
  R.forEach((x) => { eq += x; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); });
  return {
    n: tr.length,
    win: Math.round((wins.length / tr.length) * 100),
    tpHit: Math.round((tr.filter((t) => t.outcome === "tp").length / tr.length) * 100),
    slHit: Math.round((tr.filter((t) => t.outcome === "sl").length / tr.length) * 100),
    to: Math.round((tr.filter((t) => t.outcome === "timeout").length / tr.length) * 100),
    avgR: +(R.reduce((a, b) => a + b, 0) / tr.length).toFixed(3),
    pf: gl ? +(gw / gl).toFixed(2) : Infinity,
    totR: +eq.toFixed(1),
    maxDD: +dd.toFixed(1),
    avgHold: Math.round(tr.reduce((a, t) => a + t.hold, 0) / tr.length),
  };
}
function runT90Backtest(entry) {
  if (!entry || entry.status !== "ok") return null;
  return {
    combos: [
      { name: "1H → T90 Ngày", m: backtestT90Combo(entry.h1, entry.d1, { maxHold: 300 }) },
      { name: "4H → T90 Ngày", m: backtestT90Combo(entry.h4, entry.d1, { maxHold: 150 }) },
      { name: "1H → T90 Tuần", m: backtestT90Combo(entry.h1, entry.w1, { maxHold: 400 }) },
      { name: "4H → T90 Tuần", m: backtestT90Combo(entry.h4, entry.w1, { maxHold: 200 }) },
    ],
  };
}

// ============================================================
// INDICATOR90 — dò + hiệu chỉnh 1 indicator (kèm tham số) sao cho MỖI LẦN nó
// BẬT (đúng hướng dirUp — cùng hướng đang dùng cho T90 của khung đó), lịch sử
// cho thấy ≥90% khả năng giá CHẠM được mức T90 (tính causal ngay lúc bật)
// TRƯỚC KHI indicator TỰ TẮT (điều kiện quay về false). Dò riêng cho từng
// khung Ngày/4H/1H, hiệu chỉnh riêng cho từng cặp — không gộp chung.
//
// TỐI ƯU HIỆU NĂNG (quan trọng, tránh treo trình duyệt):
// Thay vì tính lại mức T90 (quét 24 hệ số nhân ATR) TỪ ĐẦU tại từng lần
// indicator bật — vốn tốn O(n) mỗi lần, tổng cộng có thể lên tới hàng chục
// tỷ phép tính trên khung 1H — ta DỰNG SẴN 1 LẦN (mỗi cặp+khung+hướng) một
// "chỉ mục": với mỗi hệ số nhân m, mảng bool touched[m][i] = giá có chạm mức
// close[i]±m·ATR[i] trong H nến tới hay không (quét 1 lượt duy nhất, O(n·H)),
// rồi cộng dồn (prefix sum) để tra cứu tỉ lệ chạm lịch sử tại BẤT KỲ điểm j
// nào trong O(1). Nhờ đó, tính "mức T90 causal tại lần bật thứ k" chỉ còn tốn
// O(số hệ số nhân) thay vì O(n) — an toàn dù bật hàng trăm lần trên 1H.
// ============================================================

// Dựng chỉ mục chạm-mức theo mọi hệ số nhân ATR (0.25 → 6.00, bước 0.25) — dùng
// chung cho toàn bộ ứng viên indicator của MỘT (cặp, khung, hướng).
function _t90BuildIndex(bars, atr, dirUp, H) {
  const n = bars.length;
  const mults = [];
  for (let mi = 25; mi <= 600; mi += 25) mults.push(mi / 100);
  const M = mults.length;
  const touched = Array.from({ length: M }, () => new Array(n).fill(false));
  for (let i = 50; i < n - 1; i++) {
    const sig = atr[i];
    if (!sig) continue;
    const c0 = bars[i].c;
    const last = Math.min(n - 1, i + H);
    const done = new Array(M).fill(false);
    let remaining = M;
    for (let k = i + 1; k <= last && remaining > 0; k++) {
      const hh = bars[k].h, ll = bars[k].l;
      for (let mi2 = 0; mi2 < M; mi2++) {
        if (done[mi2]) continue;
        const lvl = dirUp ? c0 + mults[mi2] * sig : c0 - mults[mi2] * sig;
        if (dirUp ? hh >= lvl : ll <= lvl) {
          done[mi2] = true;
          touched[mi2][i] = true;
          remaining--;
        }
      }
    }
  }
  const prefix = touched.map((arr) => {
    const p = new Array(n + 1).fill(0);
    for (let i = 0; i < n; i++) p[i + 1] = p[i] + (arr[i] ? 1 : 0);
    return p;
  });
  return { mults, touched, prefix, n };
}
// Chọn hệ số nhân causal tại điểm j (giống logic T90 gốc: giữ mức LỚN NHẤT mà
// xác suất chạm lịch sử (tính TRÊN dữ liệu TRƯỚC j, không nhìn tương lai) vẫn ≥ thr).
function _t90PickAt(idx, j, thr = 0.9) {
  const denom = j - 51; // số điểm lịch sử i chạy 50..j-2
  if (denom < 15) return null;
  const { mults, prefix } = idx;
  let bestMi = null, fbMi = null;
  for (let mi = 0; mi < mults.length; mi++) {
    const p = prefix[mi][j - 1] / denom;
    if (fbMi == null) fbMi = mi;
    if (p >= thr) bestMi = mi;
    else if (bestMi != null) break;
  }
  return bestMi != null ? bestMi : fbMi;
}
// Chuỗi bool "on/off" của từng indicator ứng viên — đã quy theo ĐÚNG hướng dirUp.
function _ind_rsiLevel(closes, dirUp, p, L) {
  const r = rsi(closes, p);
  const lvl = dirUp ? L : 100 - L;
  return closes.map((_, i) => (r[i] == null ? false : dirUp ? r[i] >= lvl : r[i] <= lvl));
}
function _ind_macdState(closes, dirUp, fast, slow, sig) {
  const m = macdCalc(closes, fast, slow, sig);
  return closes.map((_, i) => {
    const mm = m.macd[i], ss = m.signal[i];
    if (mm == null || ss == null) return false;
    return dirUp ? mm - ss > 0 : mm - ss < 0;
  });
}
function _ind_maTrend(closes, dirUp, p) {
  const s = sma(closes, p);
  return closes.map((c, i) => (s[i] == null ? false : dirUp ? c > s[i] : c < s[i]));
}
function _ind_maSlope(closes, dirUp, p, k) {
  const s = sma(closes, p);
  return closes.map((_, i) => {
    if (i < k || s[i] == null || s[i - k] == null) return false;
    const slope = s[i] - s[i - k];
    return dirUp ? slope > 0 : slope < 0;
  });
}
function _ind_breakoutN(bars, dirUp, N) {
  const n = bars.length;
  const on = new Array(n).fill(false);
  let active = false, level = null;
  for (let i = N; i < n; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let k = i - N; k < i; k++) {
      if (bars[k].h > hh) hh = bars[k].h;
      if (bars[k].l < ll) ll = bars[k].l;
    }
    if (!active) {
      if (dirUp && bars[i].c > hh) { active = true; level = hh; }
      else if (!dirUp && bars[i].c < ll) { active = true; level = ll; }
    } else {
      if (dirUp && bars[i].c < level) active = false;
      else if (!dirUp && bars[i].c > level) active = false;
    }
    on[i] = active;
  }
  return on;
}
// Danh sách ứng viên dò/hiệu chỉnh — mỗi ứng viên là 1 TRẠNG THÁI (không phải
// một cú "cắt" tức thời): "còn tín hiệu" nghĩa là trạng thái này vẫn đang true,
// "tự tắt" là lúc nó quay về false.
function indicator90Candidates(bars, closes, dirUp) {
  const list = [];
  [55, 60, 65, 70].forEach((L) => {
    list.push({
      key: `RSI14_${L}`,
      label: `RSI(14) ${dirUp ? "≥" : "≤"} ${dirUp ? L : 100 - L}`,
      on: _ind_rsiLevel(closes, dirUp, 14, L),
    });
  });
  [[12, 26, 9], [5, 13, 6]].forEach(([f, s, g]) => {
    list.push({
      key: `MACD_${f}_${s}_${g}`,
      label: `MACD(${f},${s},${g}) ${dirUp ? "hist>0" : "hist<0"}`,
      on: _ind_macdState(closes, dirUp, f, s, g),
    });
  });
  [20, 50, 100].forEach((p) => {
    list.push({
      key: `MA_${p}`,
      label: `Giá ${dirUp ? ">" : "<"} SMA${p}`,
      on: _ind_maTrend(closes, dirUp, p),
    });
  });
  [20, 50].forEach((p) => {
    list.push({
      key: `SLOPE_${p}`,
      label: `SMA${p} dốc ${dirUp ? "lên" : "xuống"}`,
      on: _ind_maSlope(closes, dirUp, p, 5),
    });
  });
  [10, 20, 40].forEach((N) => {
    list.push({
      key: `BRK_${N}`,
      label: `Breakout ${N} nến (đóng cửa ${dirUp ? "trên đỉnh" : "dưới đáy"})`,
      on: _ind_breakoutN(bars, dirUp, N),
    });
  });
  return list;
}
// Dò + hiệu chỉnh cho MỘT (cặp đang mở, khung, hướng) — trả về ứng viên tốt
// nhất (ưu tiên ≥90%, tie-break bằng specificity rồi tới cỡ mẫu n) cùng toàn
// bộ bảng so sánh (để debug/hiển thị thêm nếu cần).
function calibrateIndicator90(bars, dirUp, H) {
  if (!bars || bars.length < 150) return null;
  const closes = bars.map((b) => b.c);
  const atr = atrOHLC(bars, 14);
  const idx = _t90BuildIndex(bars, atr, dirUp, H);
  const n = bars.length;
  // Pick + ground-truth (chạm T90 trong đúng cửa sổ H chuẩn) tại MỌI nến — tính
  // 1 LẦN, dùng chung cho toàn bộ ứng viên bên dưới (không lặp lại theo indicator).
  const pickAt = new Array(n).fill(null);
  const actualAt = new Array(n).fill(null); // null = chưa đủ mẫu lịch sử để tính T90
  for (let i = 66; i < n - 1; i++) {
    const mi = _t90PickAt(idx, i, 0.9);
    if (mi == null) continue;
    pickAt[i] = mi;
    actualAt[i] = idx.touched[mi][i];
  }
  const cands = indicator90Candidates(bars, closes, dirUp);
  const scored = [];
  for (const c of cands) {
    const evsAll = _onEvents(c.on).filter((e) => e.start >= 66);
    if (evsAll.length < 8) continue; // mẫu quá ít — bỏ ứng viên này
    const evs = evsAll.slice(-150); // chỉ lấy các lần gần nhất — chặn chi phí tính khi bật/tắt quá nhiều lần
    let hit = 0, valid = 0;
    for (const e of evs) {
      const mi = pickAt[e.start];
      if (mi == null) continue;
      valid++;
      const d = idx.mults[mi] * atr[e.start];
      const lvl = dirUp ? closes[e.start] + d : closes[e.start] - d;
      for (let k = e.start + 1; k <= e.end; k++) {
        if (dirUp ? bars[k].h >= lvl : bars[k].l <= lvl) { hit++; break; }
      }
    }
    if (valid < 8) continue;
    // Độ nhạy/đặc hiệu: so trạng thái ON/OFF của indicator với ground-truth
    // "lẽ ra giá có chạm T90 trong cửa sổ H chuẩn hay không" tại MỌI nến.
    let tp = 0, fp = 0, fn = 0, tn = 0;
    for (let i = 66; i < n - 1; i++) {
      if (actualAt[i] == null) continue;
      const pred = c.on[i], actual = actualAt[i];
      if (pred && actual) tp++;
      else if (pred && !actual) fp++;
      else if (!pred && actual) fn++;
      else tn++;
    }
    const hitRate = Math.round((hit / valid) * 100);
    scored.push({
      key: c.key,
      label: c.label,
      n: valid,
      totalEvents: evsAll.length,
      hitRate,
      sens: tp + fn > 0 ? Math.round((tp / (tp + fn)) * 100) : null,
      spec: tn + fp > 0 ? Math.round((tn / (tn + fp)) * 100) : null,
      falseRate: 100 - hitRate,
      on: !!c.on[n - 1],
    });
  }
  if (!scored.length) return null;
  const pass = scored.filter((s) => s.hitRate >= 90);
  const pick = pass.length
    ? pass.sort((a, b) => (b.spec ?? -1) - (a.spec ?? -1) || b.n - a.n)[0]
    : scored.slice().sort((a, b) => b.hitRate - a.hitRate)[0];
  return { best: pick, reached90: pass.length > 0, all: scored };
}
function _onEvents(on) {
  const evs = [];
  let i = 0;
  while (i < on.length) {
    if (on[i] && (i === 0 || !on[i - 1])) {
      let j = i;
      while (j + 1 < on.length && on[j + 1]) j++;
      evs.push({ start: i, end: j });
      i = j + 1;
    } else i++;
  }
  return evs;
}
// Chạy cho cả 3 khung Ngày/4H/1H của MỘT cặp đang mở. QUAN TRỌNG: T90 luôn tồn
// tại cho CẢ 2 hướng (trên/dưới) bất kể giá đang trend hay đi ngang — nên
// KHÔNG được bắt điều kiện "phải có gate/breakout xác nhận hướng" mới chạy
// (bản trước làm vậy nên bảng trống hầu hết thời gian, kể cả khi đi ngang).
// Mỗi khung luôn dò riêng cho cả hướng lên VÀ hướng xuống, không phụ thuộc
// xu hướng Dow hay cổng breakout hiện tại — đúng như "dù đi ngang hay có xu
// hướng thì vẫn theo T90".
function runIndicator90(entry) {
  if (!entry || entry.status !== "ok") return null;
  const cfgs = [
    { key: "D", label: "Ngày", bars: entry.d1, H: 20 },
    { key: "H4", label: "4H", bars: entry.h4, H: 60 },
    { key: "H1", label: "1H", bars: entry.h1, H: 120 },
  ];
  const out = [];
  for (const c of cfgs) {
    for (const dirUp of [true, false]) {
      out.push({
        key: `${c.key}_${dirUp ? "up" : "down"}`,
        label: c.label,
        dirUp,
        dirLabel: dirUp ? "T90 trên" : "T90 dưới",
        result: calibrateIndicator90(c.bars, dirUp, c.H),
      });
    }
  }
  return out;
}

// ============================================================
// LAB — "phòng thí nghiệm" công thức vào lệnh: chưa biết công thức nào ăn,
// nên chạy NHIỀU công thức vào lệnh khác nhau (không phải 1 indicator đơn lẻ
// như Indicator90 ở trên) trên khung 4H và 1H, backtest thật (vào/thoát từng
// nến), mục tiêu = CHẠM T90 (đúng khung, đúng hướng). SL không phải trọng tâm
// tối ưu ở đây nhưng vẫn phải HỢP LÝ (lấy theo cấu trúc — swing gần nhất —
// chứ không nới rộng tuỳ tiện, vì SL quá rộng thì đảo chiều là mất sạch, R:R
// vỡ). Trả về TOP 5 công thức tốt nhất mỗi khung (win% chạm T90, tie-break PF).
//
// Tái dùng lại đúng chỉ mục T90 (_t90BuildIndex/_t90PickAt) và SL cấu trúc
// (_nearestSwingTF) đã có ở phần Backtest T90 phía trên — không phát minh lại,
// chỉ đổi phần "công thức vào lệnh" cho đa dạng.
// ============================================================

// Mỗi hàm _lab_* trả mảng bool: TRIGGER (kích hoạt vào lệnh) tại đúng nến i —
// khác Indicator90 (trạng thái duy trì on/off), đây là điểm bấm cò rời rạc.
function _lab_pullbackEMA(closes, dirUp, trendOwn, emaP) {
  const e = ema(closes, emaP);
  const out = new Array(closes.length).fill(false);
  for (let i = 1; i < closes.length; i++) {
    if (trendOwn[i] !== (dirUp ? "up" : "down")) continue;
    if (e[i] == null || e[i - 1] == null) continue;
    const pulled = dirUp ? closes[i - 1] <= e[i - 1] : closes[i - 1] >= e[i - 1];
    const resumed = dirUp ? closes[i] > e[i] : closes[i] < e[i];
    out[i] = pulled && resumed;
  }
  return out;
}
function _lab_rsiBounce(closes, dirUp, trendOwn, p, lvl) {
  const r = rsi(closes, p);
  const out = new Array(closes.length).fill(false);
  const L = dirUp ? lvl : 100 - lvl;
  for (let i = 1; i < closes.length; i++) {
    if (trendOwn && trendOwn[i] !== (dirUp ? "up" : "down")) continue;
    if (r[i] == null || r[i - 1] == null) continue;
    out[i] = dirUp ? r[i - 1] < L && r[i] >= L : r[i - 1] > L && r[i] <= L;
  }
  return out;
}
function _lab_macdFlip(closes, dirUp, trendOwn) {
  const m = macd(closes);
  const out = new Array(closes.length).fill(false);
  for (let i = 1; i < closes.length; i++) {
    if (trendOwn[i] !== (dirUp ? "up" : "down")) continue;
    const h0 = m[i - 1].hist, h1 = m[i].hist;
    if (h0 == null || h1 == null) continue;
    out[i] = dirUp ? h0 <= 0 && h1 > 0 : h0 >= 0 && h1 < 0;
  }
  return out;
}
function _lab_breakoutN(bars, closes, dirUp, trendOwn, N) {
  const out = new Array(closes.length).fill(false);
  for (let i = N; i < closes.length; i++) {
    if (trendOwn[i] !== (dirUp ? "up" : "down")) continue;
    let hh = -Infinity, ll = Infinity;
    for (let k = i - N; k < i; k++) {
      if (bars[k].h > hh) hh = bars[k].h;
      if (bars[k].l < ll) ll = bars[k].l;
    }
    out[i] = dirUp ? closes[i] > hh && closes[i - 1] <= hh : closes[i] < ll && closes[i - 1] >= ll;
  }
  return out;
}
function _lab_maCross(closes, dirUp, fast, slow) {
  const f = sma(closes, fast), s = sma(closes, slow);
  const out = new Array(closes.length).fill(false);
  for (let i = 1; i < closes.length; i++) {
    if (f[i] == null || s[i] == null || f[i - 1] == null || s[i - 1] == null) continue;
    out[i] = dirUp ? f[i - 1] <= s[i - 1] && f[i] > s[i] : f[i - 1] >= s[i - 1] && f[i] < s[i];
  }
  return out;
}
function _lab_atrEnvelopeBreak(closes, atr, dirUp, emaP, mult) {
  const e = ema(closes, emaP);
  const out = new Array(closes.length).fill(false);
  for (let i = 1; i < closes.length; i++) {
    if (e[i] == null || e[i - 1] == null || !atr[i]) continue;
    const sigPrev = atr[i - 1] || atr[i];
    const lvl = dirUp ? e[i] + mult * atr[i] : e[i] - mult * atr[i];
    const lvlPrev = dirUp ? e[i - 1] + mult * sigPrev : e[i - 1] - mult * sigPrev;
    out[i] = dirUp ? closes[i - 1] <= lvlPrev && closes[i] > lvl : closes[i - 1] >= lvlPrev && closes[i] < lvl;
  }
  return out;
}
function _lab_confluence(closes, dirUp, trendOwn, rsiLvl, maP) {
  const r = rsi(closes, 14), s = sma(closes, maP);
  const out = new Array(closes.length).fill(false);
  const L = dirUp ? rsiLvl : 100 - rsiLvl;
  for (let i = 1; i < closes.length; i++) {
    if (trendOwn[i] !== (dirUp ? "up" : "down")) continue;
    if (r[i] == null || r[i - 1] == null || s[i] == null) continue;
    const rsiCross = dirUp ? r[i - 1] < L && r[i] >= L : r[i - 1] > L && r[i] <= L;
    const maSide = dirUp ? closes[i] > s[i] : closes[i] < s[i];
    out[i] = rsiCross && maSide;
  }
  return out;
}
// Toàn bộ danh sách công thức ứng viên cho MỘT hướng — tự do phối hợp, không
// cố định vào 1 kiểu; mục đích là dò xem kiểu nào ăn với ĐÚNG cặp/khung này.
function labFormulaCandidates(bars, closes, atr, trendOwn, dirUp) {
  return [
    { key: "pullback_ema20", label: "Pullback EMA20 + trend", on: _lab_pullbackEMA(closes, dirUp, trendOwn, 20) },
    { key: "rsi_bounce_35_trend", label: "RSI(14) bật 35/65 + trend", on: _lab_rsiBounce(closes, dirUp, trendOwn, 14, 35) },
    { key: "rsi_bounce_30_notrend", label: "RSI(14) bật 30/70 (không lọc trend)", on: _lab_rsiBounce(closes, dirUp, null, 14, 30) },
    { key: "macd_flip_trend", label: "MACD đảo dấu + trend", on: _lab_macdFlip(closes, dirUp, trendOwn) },
    { key: "breakout20_trend", label: "Breakout 20 nến + trend", on: _lab_breakoutN(bars, closes, dirUp, trendOwn, 20) },
    { key: "breakout10_trend", label: "Breakout 10 nến + trend", on: _lab_breakoutN(bars, closes, dirUp, trendOwn, 10) },
    { key: "ma_cross_10_50", label: "SMA10 cắt SMA50", on: _lab_maCross(closes, dirUp, 10, 50) },
    { key: "atr_env_break", label: "Phá bao ATR quanh EMA20 (1.5×)", on: _lab_atrEnvelopeBreak(closes, atr, dirUp, 20, 1.5) },
    { key: "confluence_rsi_ma", label: "RSI bật + giá vs SMA50 + trend", on: _lab_confluence(closes, dirUp, trendOwn, 55, 50) },
  ];
}
// Backtest THẬT cho 1 công thức: vào ngay sau nến trigger (giá mở nến kế) ·
// TP = T90 causal (tra O(1) từ chỉ mục đã dựng sẵn) · SL = swing cấu trúc gần
// nhất (HỢP LÝ, không nới rộng tuỳ tiện — dùng đúng hàm _nearestSwingTF đã
// kiểm chứng ở Backtest T90) · thoát tại TP/SL/hết maxHold, tối đa 1 lệnh cùng
// lúc. Trả về metrics dùng chung _t90Metrics.
function backtestLabFormula(bars, closes, atr, idx, pickAt, dirUp, onTrigger, maxHold) {
  const trades = [];
  let freeAt = 0;
  for (let i = 66; i < bars.length - 1; i++) {
    if (!onTrigger[i] || i < freeAt) continue;
    const mi = pickAt[i];
    if (mi == null) continue;
    const entryIdx = i + 1;
    if (entryIdx >= bars.length) continue;
    const entry = bars[entryIdx].o;
    const sl = _nearestSwingTF(bars, entryIdx, dirUp, 40, 2);
    if (sl == null || (dirUp ? sl >= entry : sl <= entry)) continue;
    const risk = Math.abs(entry - sl);
    if (!risk) continue;
    const d = idx.mults[mi] * atr[i];
    const tp = dirUp ? closes[i] + d : closes[i] - d;
    if (dirUp ? tp <= entry : tp >= entry) continue;
    const last = Math.min(bars.length - 1, entryIdx + maxHold - 1);
    let outcome = "timeout", exitIdx = last, exit = bars[last].c;
    for (let k = entryIdx; k <= last; k++) {
      const b = bars[k];
      if (dirUp ? b.l <= sl : b.h >= sl) { outcome = "sl"; exitIdx = k; exit = sl; break; }
      if (dirUp ? b.h >= tp : b.l <= tp) { outcome = "tp"; exitIdx = k; exit = tp; break; }
    }
    const r = (dirUp ? exit - entry : entry - exit) / risk;
    trades.push({ r, outcome, hold: exitIdx - entryIdx });
    freeAt = exitIdx + 1;
  }
  return _t90Metrics(trades);
}
// Chạy toàn bộ ứng viên (9 công thức × 2 hướng) cho MỘT khung — chỉ mục T90
// dựng 1 lần/hướng rồi dùng lại cho mọi công thức (không tính lại nhiều lần).
function runLabForTF(bars, H, maxHold) {
  if (!bars || bars.length < 150) return null;
  const closes = bars.map((b) => b.c);
  const atr = atrOHLC(bars, 14);
  const trendOwn = buildTrendSeriesOHLC(bars, 3, 3);
  const results = [];
  for (const dirUp of [true, false]) {
    const idx = _t90BuildIndex(bars, atr, dirUp, H);
    const pickAt = new Array(bars.length).fill(null);
    for (let i = 66; i < bars.length - 1; i++) {
      const mi = _t90PickAt(idx, i, 0.9);
      if (mi != null) pickAt[i] = mi;
    }
    const formulas = labFormulaCandidates(bars, closes, atr, trendOwn, dirUp);
    for (const f of formulas) {
      const m = backtestLabFormula(bars, closes, atr, idx, pickAt, dirUp, f.on, maxHold);
      if (!m.n || m.n < 8) continue; // mẫu quá ít — bỏ, không đủ tin cậy để xếp hạng
      // "Đang bật NGAY BÂY GIỜ?" = đúng nến 1H/4H VỪA ĐÓNG có khớp điều kiện
      // công thức hay không (vào lệnh sẽ ở giá MỞ nến kế — chưa đóng, đúng quy
      // ước "tín hiệu mới" đã dùng ở chỗ khác trong app, không nhìn tương lai).
      results.push({
        key: `${f.key}_${dirUp ? "up" : "down"}`,
        label: f.label,
        dirUp,
        m,
        nowSignal: !!f.on[bars.length - 1],
      });
    }
  }
  results.sort((a, b) => b.m.win - a.m.win || b.m.pf - a.m.pf);
  return results.slice(0, 5); // top 5 công thức tốt nhất của khung này
}
function runLab(entry) {
  if (!entry || entry.status !== "ok") return null;
  return {
    h4: runLabForTF(entry.h4, 60, 150),
    h1: runLabForTF(entry.h1, 120, 250),
  };
}

function buildStep8LayeredModel(
  dailyBars,
  weeklyBars,
  monthlyBars,
  bars4h,
  bars1h,
  opts = {}
) {
  const { dir: step8Dir, meta: step8Meta } = buildStep8DirectionSeries(
    dailyBars,
    weeklyBars,
    monthlyBars,
    opts.analogHorizon ?? 20
  );
  const dailyPiv = pivotsOHLC(dailyBars, 3);
  const weeklyPiv = pivotsOHLC(weeklyBars, 2);
  const piv1h = pivotsOHLC(bars1h, 3);

  const dailyIdxFor1h = indexAlignPointer(bars1h, dailyBars);
  const weeklyIdxFor1h = indexAlignPointer(bars1h, weeklyBars);
  const dailyTrendAligned1h = dailyIdxFor1h.map((j) =>
    j >= 0 ? step8Dir[j] : "side"
  );
  const weeklyTrendAligned1h = new Array(bars1h.length).fill("side");

  const zoneFlags4h = pullbackZoneFlags4h(
    bars4h,
    20,
    opts.pullbackZoneAtrMult ?? 1.2
  );
  const pullbackActive1h = pullbackWindowFlags1h(bars1h, bars4h, zoneFlags4h);

  const signals = generateLayeredSignals1h(
    bars1h,
    dailyTrendAligned1h,
    weeklyTrendAligned1h,
    pullbackActive1h
  );
  const trades = backtestLayered(
    bars1h,
    signals,
    piv1h,
    dailyBars,
    dailyPiv,
    weeklyBars,
    weeklyPiv,
    dailyIdxFor1h,
    weeklyIdxFor1h,
    dailyTrendAligned1h,
    opts
  );
  const stats = summarizeLayeredTrades(trades);

  // Đếm số phiên Ngày mà Bước 8 thật sự ra hướng (up/down) trên tổng số phiên có đủ
  // dữ liệu — để biết engine này "rảnh tay" bao lâu so với việc lọc chỉ bằng Dow D/W.
  const evalStart = 210;
  const evalEnd = step8Dir.length - (opts.analogHorizon ?? 20) - 1;
  const evalN = Math.max(0, evalEnd - evalStart);
  const activeN = step8Dir
    .slice(evalStart, evalEnd)
    .filter((d) => d !== "side").length;

  return {
    signals,
    trades,
    stats,
    step8ActiveRate: evalN ? Math.round((activeN / evalN) * 100) : 0,
    bars4h,
    tradeMarks: trades.map((t) => ({
      dir: t.dir,
      entryT: bars1h[t.entryIdx] ? bars1h[t.entryIdx].t : null,
      exitT: bars1h[t.exitIdx] ? bars1h[t.exitIdx].t : null,
      entryPrice: t.entry,
      exitPrice:
        t.outcome === "tp"
          ? t.tp
          : t.outcome === "sl"
            ? t.sl
            : bars1h[t.exitIdx]
              ? bars1h[t.exitIdx].c
              : t.entry,
      r: t.r,
      outcome: t.outcome,
      isAddon: t.isAddon,
    })),
    step8Meta,
    lastBarDaily: dailyBars[dailyBars.length - 1],
    lastBarWeekly: weeklyBars[weeklyBars.length - 1],
    lastBar1h: bars1h[bars1h.length - 1],
    lastBar4h: bars4h[bars4h.length - 1],
  };
}

// Cổng "lệnh" theo khung Tuần/Tháng — dùng xu hướng Dow (đỉnh/đáy) của chính khung đó,
// KHÔNG dùng breakout biên riêng. Khác cổng D (breakout 40 phiên): đây là cảnh báo MỀM —
// mỗi khung vẫn ra lệnh độc lập, chỉ gắn cờ conflict khi khung con đi ngược khung mẹ
// (không chặn cứng lệnh của khung con).
function frameGate(trendRes, piv, tfDates, parent, tf) {
  const active = trendRes.trend !== "side";
  const dir =
    trendRes.trend === "up"
      ? "long"
      : trendRes.trend === "down"
      ? "short"
      : null;
  const H = piv.filter((p) => p.type === "H").slice(-2);
  const L = piv.filter((p) => p.type === "L").slice(-2);
  const lastH = H[H.length - 1] || null;
  const lastL = L[L.length - 1] || null;
  const refLevel =
    dir === "long"
      ? lastH
        ? lastH.price
        : null
      : dir === "short"
      ? lastL
        ? lastL.price
        : null
      : null;
  const invalidLevel =
    dir === "long"
      ? lastL
        ? lastL.price
        : null
      : dir === "short"
      ? lastH
        ? lastH.price
        : null
      : null;
  const lastPiv = piv.length ? piv[piv.length - 1] : null;
  const sinceDate = lastPiv ? tfDates[lastPiv.i] : null;
  const conflict = !!(parent && parent.active && dir && parent.dir !== dir);
  return {
    tf,
    active,
    dir,
    trend: trendRes.trend,
    detail: trendRes.detail,
    refLevel,
    invalidLevel,
    sinceDate,
    conflict,
    conflictNote: conflict
      ? `Ngược xu hướng khung ${parent.tf} (${
          parent.dir === "long" ? "Long" : "Short"
        }) — chỉ cảnh báo, không chặn lệnh.`
      : null,
  };
}
function aggWeekly(closes, dates) {
  const out = [],
    wd = [];
  let cur = null;
  closes.forEach((c, i) => {
    const dt = new Date(dates[i] + "T00:00:00Z");
    const day = (dt.getUTCDay() + 6) % 7;
    const mon = new Date(dt);
    mon.setUTCDate(dt.getUTCDate() - day);
    const key = mon.toISOString().slice(0, 10);
    if (key !== cur) {
      out.push(c);
      wd.push(key);
      cur = key;
    } else out[out.length - 1] = c;
  });
  return { closes: out, dates: wd };
}
function aggMonthly(closes, dates) {
  const out = [],
    md = [];
  let cur = null;
  closes.forEach((c, i) => {
    const key = dates[i].slice(0, 7); // YYYY-MM
    if (key !== cur) {
      out.push(c);
      md.push(key + "-01");
      cur = key;
    } else out[out.length - 1] = c;
  });
  return { closes: out, dates: md };
}
// ------------------------------------------------------------
// High/Low THẬT cho khung Ngày/Tuần/Tháng của CMT (thay vì suy High=Low=Close từ chuỗi ECB).
// Khớp theo NGÀY vào đúng chỉ số của mảng `dates`/`closes` hiện có (giữ nguyên không gian index
// mà toàn bộ buildCMTModel/frameGate/playbook đang dùng) — nơi nào không có nến thật khớp ngày
// (ngoài phạm vi lịch sử Twelve Data còn giữ) thì rơi về High=Low=Close như cũ, không vỡ gì cả.
// Tuần/Tháng được gộp lại từ chính mảng Ngày này, dùng ĐÚNG logic gom nhóm của aggWeekly/aggMonthly
// ở trên để đảm bảo khớp 1-1 với wk.dates/mo.dates.
// ------------------------------------------------------------
function alignDailyHL(dates, closes, realDailyBars) {
  const map = new Map();
  (realDailyBars || []).forEach((b) => {
    map.set(String(b.d).slice(0, 10), b);
  });
  const highs = new Array(dates.length),
    lows = new Array(dates.length);
  for (let i = 0; i < dates.length; i++) {
    const b = map.get(dates[i]);
    highs[i] = b ? b.h : closes[i];
    lows[i] = b ? b.l : closes[i];
  }
  return { highs, lows };
}
function aggWeeklyHL(highs, lows, dates) {
  const outH = [],
    outL = [],
    wd = [];
  let cur = null;
  dates.forEach((d, i) => {
    const dt = new Date(d + "T00:00:00Z");
    const day = (dt.getUTCDay() + 6) % 7;
    const mon = new Date(dt);
    mon.setUTCDate(dt.getUTCDate() - day);
    const key = mon.toISOString().slice(0, 10);
    if (key !== cur) {
      outH.push(highs[i]);
      outL.push(lows[i]);
      wd.push(key);
      cur = key;
    } else {
      outH[outH.length - 1] = Math.max(outH[outH.length - 1], highs[i]);
      outL[outL.length - 1] = Math.min(outL[outL.length - 1], lows[i]);
    }
  });
  return { highs: outH, lows: outL, dates: wd };
}
function aggMonthlyHL(highs, lows, dates) {
  const outH = [],
    outL = [],
    md = [];
  let cur = null;
  dates.forEach((d, i) => {
    const key = d.slice(0, 7);
    if (key !== cur) {
      outH.push(highs[i]);
      outL.push(lows[i]);
      md.push(key + "-01");
      cur = key;
    } else {
      outH[outH.length - 1] = Math.max(outH[outH.length - 1], highs[i]);
      outL[outL.length - 1] = Math.min(outL[outL.length - 1], lows[i]);
    }
  });
  return { highs: outH, lows: outL, dates: md };
}
// Quan hệ tự-đồng-dạng giữa các khung: đo biên độ/thời lượng sóng ở M, W, D rồi lấy tỉ lệ bước xuống.
// Nếu M→W ≈ W→D (nhất quán) thì có cơ sở chiếu tiếp D→4H bằng cùng tỉ lệ.
function stepDownCascade(dCloses, dDates) {
  const wk = aggWeekly(dCloses, dDates);
  const mo = aggMonthly(dCloses, dDates);
  const med = (arr) => {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const swingsOf = (closes, k) => {
    const piv = pivots(closes, k);
    const amps = [],
      durs = [];
    for (let i = 1; i < piv.length; i++) {
      const a = piv[i - 1],
        b = piv[i];
      if (a.type === b.type) continue;
      amps.push((Math.abs(b.price - a.price) / a.price) * 100);
      durs.push(b.i - a.i);
    }
    return { medAmpl: med(amps), medDur: med(durs), n: amps.length };
  };
  const M = swingsOf(mo.closes, 2),
    W = swingsOf(wk.closes, 2),
    D = swingsOf(dCloses, 4);
  // tỉ lệ bước xuống (khung cha / khung con) theo biên độ
  const rMW = M.medAmpl && W.medAmpl ? M.medAmpl / W.medAmpl : null;
  const rWD = W.medAmpl && D.medAmpl ? W.medAmpl / D.medAmpl : null;
  const consistent =
    rMW && rWD ? Math.abs(rMW - rWD) / ((rMW + rWD) / 2) < 0.5 : false;
  // tỉ lệ chiếu D→4H: dùng trung bình hai bước quan sát được (nếu nhất quán), else dùng rWD
  const projRatio =
    rMW && rWD ? (consistent ? (rMW + rWD) / 2 : rWD) : rWD || rMW;
  const proj4H =
    projRatio && D.medAmpl
      ? {
          medAmpl: D.medAmpl / projRatio,
          medDurBars: D.medDur
            ? Math.max(1, Math.round((D.medDur / projRatio) * 6))
            : null,
        }
      : null; // ~6 nến 4H/ngày
  return { M, W, D, rMW, rWD, projRatio, consistent, proj4H, wk, mo };
}
function trendStrength(closes, n = 40) {
  const y = closes.slice(-n),
    m = y.length;
  const xm = (m - 1) / 2,
    ym = y.reduce((s, v) => s + v, 0) / m;
  let num = 0,
    den = 0,
    ssTot = 0;
  y.forEach((v, i) => {
    num += (i - xm) * (v - ym);
    den += (i - xm) ** 2;
    ssTot += (v - ym) ** 2;
  });
  const slope = num / den;
  let ssRes = 0;
  y.forEach((v, i) => {
    const f = ym + slope * (i - xm);
    ssRes += (v - f) ** 2;
  });
  const vp = volProxy(closes);
  return {
    slopePerDayInVol: slope / (vp[vp.length - 1] || 1e-9),
    r2: Math.max(0, ssTot ? 1 - ssRes / ssTot : 0),
  };
}
function rsiDivergence(closes, rsiArr, piv) {
  const H = piv.filter((p) => p.type === "H").slice(-2);
  const L = piv.filter((p) => p.type === "L").slice(-2);
  if (H.length === 2 && rsiArr[H[0].i] != null && rsiArr[H[1].i] != null)
    if (H[1].price > H[0].price && rsiArr[H[1].i] < rsiArr[H[0].i] - 1)
      return {
        type: "bearish",
        txt: "Phân kỳ giảm: giá lập đỉnh cao hơn nhưng RSI đỉnh thấp hơn",
      };
  if (L.length === 2 && rsiArr[L[0].i] != null && rsiArr[L[1].i] != null)
    if (L[1].price < L[0].price && rsiArr[L[1].i] > rsiArr[L[0].i] + 1)
      return {
        type: "bullish",
        txt: "Phân kỳ tăng: giá lập đáy thấp hơn nhưng RSI đáy cao hơn",
      };
  return { type: null, txt: "Không có phân kỳ RSI–giá tại swing gần nhất" };
}
function majorSwing(piv) {
  const seq = piv.slice(-8);
  let best = null;
  for (let i = 1; i < seq.length; i++) {
    const a = seq[i - 1],
      b = seq[i];
    if (a.type === b.type) continue;
    const range = Math.abs(b.price - a.price);
    if (!best || range > best.range) best = { from: a, to: b, range };
  }
  return best;
}
function fibLevels(swing) {
  if (!swing) return [];
  const d = swing.to.price - swing.from.price;
  return [0.382, 0.5, 0.618].map((f) => ({ f, y: swing.to.price - d * f }));
}

/* ============================================================
   4. CMT — MẪU HÌNH, SÓNG, TRẠNG THÁI, KIỂM CHỨNG
   ============================================================ */

function detectPatterns(closes, piv, av, digits) {
  const res = [];
  const last = closes[closes.length - 1];
  for (const t of ["H", "L"]) {
    const same = piv.filter((p) => p.type === t).slice(-3);
    if (same.length >= 2) {
      const [a, b] = same.slice(-2);
      if (Math.abs(a.price - b.price) < av * 1.2 && b.i - a.i > 8) {
        const between = piv.filter(
          (p) => p.i > a.i && p.i < b.i && p.type !== t
        );
        if (between.length) {
          const neck = between[0].price;
          const height = Math.abs((a.price + b.price) / 2 - neck);
          const target = t === "H" ? neck - height : neck + height;
          const broke = t === "H" ? last < neck : last > neck;
          res.push({
            name:
              t === "H" ? "Hai đỉnh (Double Top)" : "Hai đáy (Double Bottom)",
            dir: t === "H" ? "giảm" : "tăng",
            neck,
            target,
            status: broke
              ? "Đã phá neckline"
              : "Đang hình thành — chờ phá neckline",
          });
        }
      }
    }
  }
  const H = piv.filter((p) => p.type === "H").slice(-3);
  const L = piv.filter((p) => p.type === "L").slice(-3);
  if (H.length >= 2 && L.length >= 2) {
    const sH =
      (H[H.length - 1].price - H[0].price) / (H[H.length - 1].i - H[0].i || 1);
    const sL =
      (L[L.length - 1].price - L[0].price) / (L[L.length - 1].i - L[0].i || 1);
    const eps = av * 0.03;
    let name = null;
    if (sH < -eps && sL > eps) name = "Tam giác cân (Symmetrical)";
    else if (Math.abs(sH) <= eps && sL > eps)
      name = "Tam giác tăng (Ascending)";
    else if (sH < -eps && Math.abs(sL) <= eps)
      name = "Tam giác giảm (Descending)";
    if (name) {
      const height = Math.abs(H[0].price - L[0].price);
      res.push({
        name,
        dir: "theo hướng phá vỡ",
        neck: null,
        target: null,
        heightTxt: `Target = chiều cao mở tam giác (≈ ${height.toFixed(
          digits
        )}) cộng/trừ từ điểm breakout`,
        status: "Đang hội tụ — chờ breakout kèm xác nhận lớp 4",
      });
    }
  }
  return res;
}

function elliottScenarios(piv, digits) {
  const scen = [];
  const seq = piv.slice(-7);
  if (seq.length < 5) return scen;
  const last6 = seq.slice(-6);
  if (last6.length === 6) {
    const [p0, p1, p2, p3, p4, p5] = last6;
    const up = p5.price > p0.price;
    const w1 = Math.abs(p1.price - p0.price);
    const w3 = Math.abs(p3.price - p2.price);
    const w5 = Math.abs(p5.price - p4.price);
    const r1 = up ? p2.price > p0.price : p2.price < p0.price;
    const r2 = !(w3 < w1 && w3 < w5);
    const r3 = up ? p4.price > p1.price : p4.price < p1.price;
    const ok = [r1, r2, r3].filter(Boolean).length;
    if (ok >= 2) {
      const ext = up ? p4.price + w1 : p4.price - w1;
      const ext2 = up ? p4.price + 1.618 * w1 : p4.price - 1.618 * w1;
      scen.push({
        name: up
          ? "Sóng đẩy tăng, đang ở sóng 5"
          : "Sóng đẩy giảm, đang ở sóng 5",
        dir: up ? "up" : "down",
        weight: ok === 3 ? 3 : 1.5,
        labels: last6.map((p, i) => ({ ...p, tag: i === 0 ? "0" : String(i) })),
        rules: [
          { txt: "Sóng 2 không phá gốc sóng 1", ok: r1 },
          { txt: "Sóng 3 không phải sóng ngắn nhất", ok: r2 },
          { txt: "Sóng 4 không chồng lấn vùng sóng 1", ok: r3 },
        ],
        target: `Mở rộng Fib: ${ext.toFixed(digits)} (1.0×W1) → ${ext2.toFixed(
          digits
        )} (1.618×W1)`,
      });
    }
  }
  const l4 = seq.slice(-4);
  if (l4.length === 4) {
    const [q0, qa, qb, qc] = l4;
    const corrDir = qc.price < q0.price ? "giảm" : "tăng";
    const retr =
      Math.abs(qc.price - qb.price) / (Math.abs(qa.price - q0.price) || 1e-9);
    scen.push({
      name: `Điều chỉnh A-B-C (${corrDir}) sau xu hướng trước đó`,
      dir: corrDir === "tăng" ? "up" : "down",
      weight: 1.5,
      labels: [
        { ...qa, tag: "A" },
        { ...qb, tag: "B" },
        { ...qc, tag: "C" },
      ],
      rules: [
        {
          txt: `Sóng C ≈ ${retr.toFixed(2)}× sóng A (thường 1.0–1.618)`,
          ok: retr > 0.6 && retr < 2,
        },
      ],
      target: `Nếu đúng ABC: kết thúc điều chỉnh quanh ${qc.price.toFixed(
        digits
      )}, quay lại xu hướng lớn`,
    });
  }
  const l5 = seq.slice(-5);
  if (l5.length === 5) {
    const up2 = l5[l5.length - 1].price > l5[0].price;
    scen.push({
      name: up2
        ? "Đang điều chỉnh sóng 4, chờ sóng 5 tăng"
        : "Đang hồi sóng 4, chờ sóng 5 giảm",
      dir: up2 ? "up" : "down",
      weight: 1,
      labels: l5.map((p, i) => ({ ...p, tag: i === 0 ? "0" : String(i) })),
      rules: [
        {
          txt: "Kịch bản thay thế — theo dõi vùng chồng lấn sóng 1 để loại trừ",
          ok: true,
        },
      ],
      target: "Chưa xác định — chờ pivot xác nhận kết thúc sóng 4",
    });
  }
  const total = scen.reduce((s, x) => s + x.weight, 0);
  scen.forEach((x) => (x.prob = Math.round((x.weight / total) * 100)));
  scen.sort((a, b) => b.prob - a.prob);
  return scen;
}

function scanPatternHistory(closes, dates) {
  const piv = pivots(closes, 4);
  const vp = volProxy(closes);
  const events = [];
  const outcome = (startI, dir, target, invalid) => {
    for (
      let j = startI + 1;
      j <= Math.min(startI + 40, closes.length - 1);
      j++
    ) {
      const c = closes[j];
      if (dir === "up" ? c >= target : c <= target)
        return { res: "hit", bars: j - startI };
      if (dir === "up" ? c <= invalid : c >= invalid)
        return { res: "fail", bars: j - startI };
    }
    return { res: "open", bars: null };
  };
  for (let k = 2; k < piv.length; k++) {
    const a = piv[k - 2],
      m = piv[k - 1],
      b = piv[k];
    if (a.type !== b.type || m.type === a.type) continue;
    const tol = (vp[Math.min(b.i, vp.length - 1)] || 1e-9) * 3.0;
    if (Math.abs(a.price - b.price) >= tol || b.i - a.i <= 8) continue;
    const isTop = a.type === "H";
    const neck = m.price;
    const height = Math.abs((a.price + b.price) / 2 - neck);
    const target = isTop ? neck - height : neck + height;
    const invalid = (a.price + b.price) / 2;
    let bo = -1;
    for (let j = b.i + 1; j < Math.min(b.i + 30, closes.length); j++) {
      if (isTop ? closes[j] < neck : closes[j] > neck) {
        bo = j;
        break;
      }
    }
    if (bo < 0) continue;
    events.push({
      i: bo,
      date: dates[bo],
      name: isTop ? "Hai đỉnh" : "Hai đáy",
      dir: isTop ? "giảm" : "tăng",
      entry: closes[bo],
      target,
      ...outcome(bo, isTop ? "down" : "up", target, invalid),
    });
  }
  for (let k = 4; k < piv.length; k++) {
    const w5 = piv.slice(k - 4, k + 1);
    const types = w5.map((p) => p.type).join("");
    if (types !== "HLHLH" && types !== "LHLHL") continue;
    const invHS = types === "LHLHL";
    const [s1, n1, hd, n2, s2] = w5;
    const dom = (x, y) => (invHS ? x < y : x > y);
    const tol = (vp[Math.min(s2.i, vp.length - 1)] || 1e-9) * 4.0;
    if (!dom(hd.price, s1.price) || !dom(hd.price, s2.price)) continue;
    if (Math.abs(s1.price - s2.price) >= tol) continue;
    const neck = (n1.price + n2.price) / 2;
    const height = Math.abs(hd.price - neck);
    const target = invHS ? neck + height : neck - height;
    let bo = -1;
    for (let j = s2.i + 1; j < Math.min(s2.i + 30, closes.length); j++) {
      if (invHS ? closes[j] > neck : closes[j] < neck) {
        bo = j;
        break;
      }
    }
    if (bo < 0) continue;
    events.push({
      i: bo,
      date: dates[bo],
      name: invHS ? "Vai-Đầu-Vai ngược" : "Vai-Đầu-Vai",
      dir: invHS ? "tăng" : "giảm",
      entry: closes[bo],
      target,
      ...outcome(bo, invHS ? "up" : "down", target, hd.price),
    });
  }
  const seen = new Set();
  const uniq = events.filter((e) => {
    const key = e.i + "|" + e.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  uniq.sort((x, y) => x.i - y.i);
  return uniq;
}

function scanBreakoutRule(closes) {
  const mk = () => ({ n: 0, hit: 0, fail: 0, open: 0 });
  const st = { up: mk(), down: mk() };
  let skipTo = -1;
  for (let i = 45; i < closes.length - 1; i++) {
    if (i < skipTo) continue;
    const win = closes.slice(i - 40, i);
    const R = Math.max(...win),
      S = Math.min(...win);
    const range = R - S;
    if (range <= 0) continue;
    let dir = null;
    if (closes[i] > R && closes[i - 1] <= R) dir = "up";
    else if (closes[i] < S && closes[i - 1] >= S) dir = "down";
    if (!dir) continue;
    const t1 = dir === "up" ? R + 0.618 * range : S - 0.618 * range;
    const inv = dir === "up" ? R : S;
    let res = "open";
    for (let j = i + 1; j <= Math.min(i + 30, closes.length - 1); j++) {
      const c = closes[j];
      if (dir === "up" ? c >= t1 : c <= t1) {
        res = "hit";
        break;
      }
      if (dir === "up" ? c < inv : c > inv) {
        res = "fail";
        break;
      }
    }
    st[dir].n++;
    st[dir][res]++;
    skipTo = i + 5;
  }
  const rate = (x) =>
    x.hit + x.fail ? Math.round((x.hit / (x.hit + x.fail)) * 100) : null;
  return {
    up: { ...st.up, rate: rate(st.up) },
    down: { ...st.down, rate: rate(st.down) },
  };
}

function backtestConfluenceRolling(closes) {
  const rsiArr = rsi(closes),
    vp = volProxy(closes),
    piv = pivots(closes, 4);
  const trades = [];
  let pi = 0;
  const H = [],
    L = [];
  for (let i = 60; i < closes.length - 12; i++) {
    while (pi < piv.length && piv[pi].i + 4 <= i) {
      (piv[pi].type === "H" ? H : L).push(piv[pi]);
      pi++;
    }
    if (H.length < 2 || L.length < 2) continue;
    const hh = H[H.length - 1].price > H[H.length - 2].price;
    const hl = L[L.length - 1].price > L[L.length - 2].price;
    const trend = hh && hl ? "up" : !hh && !hl ? "down" : "side";
    const cu = rsiArr[i - 1] !== null && rsiArr[i - 1] < 40 && rsiArr[i] >= 40;
    const cd = rsiArr[i - 1] !== null && rsiArr[i - 1] > 60 && rsiArr[i] <= 60;
    if (trend === "up" && cu)
      trades.push((closes[i + 12] - closes[i]) / (vp[i] || 1e-9));
    else if (trend === "down" && cd)
      trades.push((closes[i] - closes[i + 12]) / (vp[i] || 1e-9));
  }
  if (!trades.length) return null;
  const wins = trades.filter((r) => r > 0).length;
  return {
    n: trades.length,
    winRate: Math.round((wins / trades.length) * 100),
    avgR: (trades.reduce((s, r) => s + r, 0) / trades.length).toFixed(2),
  };
}

function buildStates(bars) {
  const closes = bars.map((b) => b.c);
  const highs = bars.map((b) => b.h);
  const lows = bars.map((b) => b.l);
  const ma50 = sma(closes, 50),
    ma200 = sma(closes, 200);
  const rsiArr = rsi(closes),
    mac = macd(closes),
    piv = pivotsOHLC(bars, 4);
  const states = new Array(closes.length).fill(null);
  let pi = 0;
  const H = [],
    L = [];
  for (let i = 210; i < closes.length; i++) {
    while (pi < piv.length && piv[pi].i + 4 <= i) {
      (piv[pi].type === "H" ? H : L).push(piv[pi]);
      pi++;
    }
    if (H.length < 2 || L.length < 2) continue;
    const hh = H[H.length - 1].price > H[H.length - 2].price;
    const hl = L[L.length - 1].price > L[L.length - 2].price;
    const dow = hh && hl ? "u" : !hh && !hl ? "d" : "s";
    // R/S để so khớp trạng thái giờ lấy từ High/Low THẬT 40 phiên gần nhất —
    // trước đây dùng Math.max/min của Close, KHÔNG khớp với R/S OHLC thật
    // đang hiển thị ở Kịch bản giao dịch (Layer 6).
    const winH = highs.slice(i - 40, i),
      winL = lows.slice(i - 40, i);
    const R = Math.max(...winH),
      S = Math.min(...winL);
    const pos = (closes[i] - S) / (R - S || 1e-9);
    const r = rsiArr[i];
    states[i] = {
      dow,
      posB: pos < 0.33 ? "lo" : pos > 0.67 ? "hi" : "mid",
      rB: r == null ? "m" : r < 40 ? "lo" : r > 60 ? "hi" : "m",
      vs50: ma50[i] != null && closes[i] > ma50[i] ? "a" : "b",
      mh: mac[i].hist >= 0 ? "p" : "n",
      R,
      S,
    };
  }
  return states;
}
const STATE_VN = {
  dow: { u: "Dow tăng", d: "Dow giảm", s: "Dow đi ngang" },
  posB: {
    lo: "giá vùng thấp của biên",
    mid: "giá giữa biên",
    hi: "giá vùng cao của biên",
  },
  rB: { lo: "RSI<40", m: "RSI 40–60", hi: "RSI>60" },
  vs50: { a: "trên MA50", b: "dưới MA50" },
  mh: { p: "MACD hist dương", n: "MACD hist âm" },
};
function analogProbabilities(bars, states, horizon = 20) {
  const closes = bars.map((b) => b.c);
  const highs = bars.map((b) => b.h);
  const lows = bars.map((b) => b.l);
  let cs = null,
    ci = -1;
  for (let i = states.length - 1; i >= 0; i--)
    if (states[i]) {
      cs = states[i];
      ci = i;
      break;
    }
  if (!cs) return null;
  const dimSets = [
    ["dow", "posB", "rB", "vs50", "mh"],
    ["dow", "posB", "rB", "vs50"],
    ["dow", "posB", "rB"],
    ["dow", "posB"],
  ];
  for (const keys of dimSets) {
    const matches = [];
    for (let i = 210; i < states.length - horizon - 1; i++) {
      const st = states[i];
      if (!st || i === ci) continue;
      if (keys.every((k) => st[k] === cs[k])) matches.push(i);
    }
    if (matches.length >= 25 || keys.length === 2) {
      let a = 0,
        b = 0,
        c = 0;
      matches.forEach((i) => {
        const st = states[i];
        let res = "c";
        for (let j = i + 1; j <= i + horizon; j++) {
          // Chạm bằng High/Low THẬT — trước đây so bằng Close nên bóng nến
          // chọc qua R/S vẫn bị tính là "chưa chạm", sai bản chất "chạm".
          if (highs[j] > st.R) {
            res = "a";
            break;
          }
          if (lows[j] < st.S) {
            res = "b";
            break;
          }
        }
        if (res === "a") a++;
        else if (res === "b") b++;
        else c++;
      });
      const n = matches.length || 1;
      const desc = ["dow", "posB", "rB", "vs50", "mh"]
        .filter((k) => keys.includes(k))
        .map((k) => STATE_VN[k][cs[k]])
        .join(" · ");
      return {
        n: matches.length,
        dims: keys.length,
        horizon,
        desc,
        pA: Math.round((a / n) * 100),
        pB: Math.round((b / n) * 100),
        pC: Math.round((c / n) * 100),
      };
    }
  }
  return null;
}

// ============================================================
// XÁC SUẤT & MỤC TIÊU TỐI ƯU (Fibonacci/pivot) — tận dụng lại đúng cách
// khớp trạng thái CAUSAL của analogProbabilities (Dow + vị trí trong biên
// 40 phiên + RSI + MA50 + MACD hist). Thay vì liệt kê vài mức Fib cố định
// (mức gần R/S gần như luôn đạt ~100% — dư thừa, không có giá trị làm mục
// tiêu), QUÉT một dải bội số của biên (R−S) từ gần tới xa, tìm MỨC XA NHẤT
// mà tỷ lệ lịch sử chạm được vẫn ≥ ngưỡng mong muốn (mặc định 90%) trong tối
// đa maxHorizon phiên — đây là mục tiêu "tối ưu": xa nhất có thể trong khi
// vẫn giữ độ tin cậy cao, thay vì một mức tuỳ ý.
function analogFibTargets(bars, states, maxHorizon = 60, minHitRatePct = 90) {
  const closes = bars.map((b) => b.c);
  const highs = bars.map((b) => b.h);
  const lows = bars.map((b) => b.l);
  let cs = null,
    ci = -1;
  for (let i = states.length - 1; i >= 0; i--)
    if (states[i]) {
      cs = states[i];
      ci = i;
      break;
    }
  if (!cs) return null;

  const dimSets = [
    ["dow", "posB", "rB", "vs50", "mh"],
    ["dow", "posB", "rB", "vs50"],
    ["dow", "posB", "rB"],
    ["dow", "posB"],
  ];
  let matches = [],
    usedKeys = null;
  for (const keys of dimSets) {
    const m = [];
    for (let i = 210; i < states.length - 1; i++) {
      const st = states[i];
      if (!st || i === ci) continue;
      if (keys.every((k) => st[k] === cs[k])) m.push(i);
    }
    if (m.length >= 25 || keys.length === 2) {
      matches = m;
      usedKeys = keys;
      break;
    }
  }
  if (!matches.length) return null;

  const hitRateAt = (dir, mult) => {
    let nHit = 0;
    const daysList = [];
    for (const i of matches) {
      const st = states[i];
      const range = st.R - st.S;
      const target = dir === "up" ? st.R + mult * range : st.S - mult * range;
      let hitDay = null;
      const jMax = Math.min(i + maxHorizon, closes.length - 1);
      for (let j = i + 1; j <= jMax; j++) {
        // Chạm bằng High/Low thật (không phải Close) — đúng bản chất "chạm target".
        if (dir === "up" ? highs[j] >= target : lows[j] <= target) {
          hitDay = j - i;
          break;
        }
      }
      if (hitDay != null) {
        nHit++;
        daysList.push(hitDay);
      }
    }
    daysList.sort((a, b) => a - b);
    const median = daysList.length
      ? daysList[Math.floor(daysList.length / 2)]
      : null;
    const p25 = daysList.length
      ? daysList[Math.floor(daysList.length * 0.25)]
      : null;
    const p75 = daysList.length
      ? daysList[Math.floor(daysList.length * 0.75)]
      : null;
    return {
      hitRatePct: Math.round((nHit / matches.length) * 100),
      medianDays: median,
      p25Days: p25,
      p75Days: p75,
    };
  };

  // Quét bội số 0.1 → 3.0 (bước 0.1). Tỷ lệ chạm giảm dần khi mức càng xa,
  // nên dừng ngay khi rớt dưới ngưỡng — mức TRƯỚC ĐÓ là mức xa nhất còn đạt.
  const scanSide = (dir) => {
    let best = null;
    for (let m = 0.1; m <= 3.0 + 1e-9; m += 0.1) {
      const mult = +m.toFixed(2);
      const r = hitRateAt(dir, mult);
      if (r.hitRatePct >= minHitRatePct) {
        best = { mult, ...r };
      } else {
        break;
      }
    }
    return best;
  };

  const curRange = cs.R - cs.S;
  const bestUp = scanSide("up");
  const bestDown = scanSide("down");
  const upBest = bestUp
    ? { ...bestUp, price: cs.R + bestUp.mult * curRange }
    : null;
  const downBest = bestDown
    ? { ...bestDown, price: cs.S - bestDown.mult * curRange }
    : null;

  // So xem hướng nào "tối ưu" hơn ở CÙNG ngưỡng xác suất: mục tiêu xa hơn
  // (mult lớn hơn) trên cùng đơn vị biên độ = kỳ vọng lãi/rủi ro tốt hơn.
  let better = null;
  if (upBest && downBest) better = upBest.mult >= downBest.mult ? "up" : "down";
  else if (upBest) better = "up";
  else if (downBest) better = "down";

  return {
    n: matches.length,
    dims: usedKeys.length,
    horizon: maxHorizon,
    minHitRatePct,
    R: cs.R,
    S: cs.S,
    up: upBest,
    down: downBest,
    better,
  };
}

// Xác suất chạm R/S HIỆN TẠI (High/Low thật) + phân phối hướng giá 3/4/5 phiên
// tới — khớp trạng thái CÙNG CÁCH với analogProbabilities/analogFibTargets
// (Dow + vị trí trong biên + RSI + MA50 + MACD hist), nên số ra nhất quán với
// 2 chỉ số kia thay vì một phép đo khác đi tính riêng.
function analogForwardStats(bars, states, sessions = [3, 4, 5]) {
  const closes = bars.map((b) => b.c);
  const highs = bars.map((b) => b.h);
  const lows = bars.map((b) => b.l);
  let cs = null,
    ci = -1;
  for (let i = states.length - 1; i >= 0; i--)
    if (states[i]) {
      cs = states[i];
      ci = i;
      break;
    }
  if (!cs) return null;

  const maxSess = Math.max(...sessions);
  const dimSets = [
    ["dow", "posB", "rB", "vs50", "mh"],
    ["dow", "posB", "rB", "vs50"],
    ["dow", "posB", "rB"],
    ["dow", "posB"],
  ];
  let matches = [],
    usedKeys = null;
  for (const keys of dimSets) {
    const m = [];
    for (let i = 210; i < states.length - maxSess - 1; i++) {
      const st = states[i];
      if (!st || i === ci) continue;
      if (keys.every((k) => st[k] === cs[k])) m.push(i);
    }
    if (m.length >= 25 || keys.length === 2) {
      matches = m;
      usedKeys = keys;
      break;
    }
  }
  if (!matches.length) return null;

  // Xác suất chạm R/S CỦA CHÍNH THỜI ĐIỂM khớp (st.R/st.S, không phải R/S hiện
  // tại) trong vòng maxSess phiên kể từ lúc khớp — đo bằng High/Low thật.
  let touchR = 0,
    touchS = 0;
  const touchDaysR = [],
    touchDaysS = [];
  matches.forEach((i) => {
    const st = states[i];
    for (let j = i + 1; j <= Math.min(i + maxSess, closes.length - 1); j++) {
      if (highs[j] > st.R) {
        touchR++;
        touchDaysR.push(j - i);
        break;
      }
    }
  });
  matches.forEach((i) => {
    const st = states[i];
    for (let j = i + 1; j <= Math.min(i + maxSess, closes.length - 1); j++) {
      if (lows[j] < st.S) {
        touchS++;
        touchDaysS.push(j - i);
        break;
      }
    }
  });
  const med = (arr) => {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  // Phân phối hướng giá tại từng mốc N phiên tới (so với Close lúc khớp trạng thái).
  const bySession = sessions.map((n) => {
    let up = 0,
      down = 0,
      flat = 0;
    const rets = [];
    matches.forEach((i) => {
      const j = i + n;
      if (j >= closes.length) return;
      const ret = (closes[j] - closes[i]) / closes[i];
      rets.push(ret);
      if (ret > 0.0005) up++;
      else if (ret < -0.0005) down++;
      else flat++;
    });
    const total = up + down + flat || 1;
    const avgRet = rets.length
      ? rets.reduce((s, r) => s + r, 0) / rets.length
      : null;
    return {
      n,
      upPct: Math.round((up / total) * 100),
      downPct: Math.round((down / total) * 100),
      flatPct: Math.round((flat / total) * 100),
      avgRetPct: avgRet != null ? avgRet * 100 : null,
      medRetPct: med(rets.map((r) => r)) != null ? med(rets) * 100 : null,
      sample: rets.length,
    };
  });

  return {
    n: matches.length,
    dims: usedKeys.length,
    maxSess,
    R: cs.R,
    S: cs.S,
    touchRPct: Math.round((touchR / matches.length) * 100),
    touchSPct: Math.round((touchS / matches.length) * 100),
    medianDaysToR: med(touchDaysR),
    medianDaysToS: med(touchDaysS),
    bySession,
  };
}

// Analog CAUSAL: xác suất A/B/C của trạng thái TẠI bar asOf, chỉ đếm các lần khớp trong QUÁ KHỨ (i < asOf-horizon).
function analogAt(bars, states, asOf, horizon = 20) {
  const highs = bars.map((b) => b.h);
  const lows = bars.map((b) => b.l);
  const cs = states[asOf];
  if (!cs) return null;
  const dimSets = [
    ["dow", "posB", "rB", "vs50", "mh"],
    ["dow", "posB", "rB", "vs50"],
    ["dow", "posB", "rB"],
    ["dow", "posB"],
  ];
  const cap = asOf - horizon - 1;
  for (const keys of dimSets) {
    const matches = [];
    for (let i = 210; i < cap; i++) {
      const st = states[i];
      if (!st) continue;
      if (keys.every((k) => st[k] === cs[k])) matches.push(i);
    }
    if (matches.length >= 25 || keys.length === 2) {
      let a = 0,
        b = 0,
        c = 0;
      matches.forEach((i) => {
        const st = states[i];
        let res = "c";
        for (let j = i + 1; j <= i + horizon; j++) {
          if (highs[j] > st.R) {
            res = "a";
            break;
          }
          if (lows[j] < st.S) {
            res = "b";
            break;
          }
        }
        if (res === "a") a++;
        else if (res === "b") b++;
        else c++;
      });
      const nn = matches.length || 1;
      return {
        n: matches.length,
        dims: keys.length,
        horizon,
        pA: Math.round((a / nn) * 100),
        pB: Math.round((b / nn) * 100),
        pC: Math.round((c / nn) * 100),
      };
    }
  }
  return null;
}

// ------------------------------------------------------------
// "BƯỚC 8" NHÂN QUẢ — tại MỖI phiên Ngày trong quá khứ, tính lại đúng logic
// "Nhánh nào đang được đề nghị" như SummaryLayer đang hiển thị cho HIỆN TẠI:
// cán cân bằng chứng (rút gọn — chỉ phần khách quan tính rẻ: Dow M/W/D, RSI,
// MACD, MA50/MA200 — KHÔNG gồm Elliott/pattern/COT vì chủ quan hoặc quá tốn
// để tính lại ở mọi điểm lịch sử) × xác suất analog CAUSAL (chỉ đếm khớp
// TRƯỚC thời điểm đó). Ra "up"/"down" chỉ khi 2 nguồn đó ĐỒNG THUẬN (hoặc
// analog rất mạnh ≥60%) — y hệt luật ở "Tổng hợp · Kế hoạch chính".
function buildStep8DirectionSeries(dailyBars, weeklyBars, monthlyBars, horizon = 20) {
  const closes = dailyBars.map((b) => b.c);
  const n = closes.length;
  const rsiArr = rsi(closes),
    macdArr = macd(closes);
  const ma50 = sma(closes, 50),
    ma200 = sma(closes, 200);
  const trendD = buildTrendSeriesOHLC(dailyBars, 4, 4);
  const trendWraw = buildTrendSeriesOHLC(weeklyBars, 2, 2);
  const trendMraw = buildTrendSeriesOHLC(monthlyBars, 2, 2);
  const wPtr = indexAlignPointer(dailyBars, weeklyBars);
  const mPtr = indexAlignPointer(dailyBars, monthlyBars);
  const trendW = wPtr.map((j) => (j >= 0 ? trendWraw[j] : "side"));
  const trendM = mPtr.map((j) => (j >= 0 ? trendMraw[j] : "side"));

  const states = buildStates(dailyBars);

  const dir = new Array(n).fill("side"); // "up" | "down" | "side" (side = wait/range, không vào lệnh)
  const meta = new Array(n).fill(null);
  for (let i = 210; i < n - horizon - 1; i++) {
    const bull = [
      trendM[i] === "up",
      trendW[i] === "up",
      trendD[i] === "up",
      ma50[i] != null && closes[i] > ma50[i],
      ma50[i] != null && ma200[i] != null && ma50[i] > ma200[i],
      rsiArr[i] != null && rsiArr[i] > 50,
      macdArr[i].hist > 0,
    ].filter(Boolean).length;
    const bear = [
      trendM[i] === "down",
      trendW[i] === "down",
      trendD[i] === "down",
      ma50[i] != null && closes[i] < ma50[i],
      ma50[i] != null && ma200[i] != null && ma50[i] < ma200[i],
      rsiArr[i] != null && rsiArr[i] < 50,
      macdArr[i].hist < 0,
    ].filter(Boolean).length;
    const biasPct = Math.round((bull / (bull + bear || 1)) * 100);
    const bias = biasPct >= 60 ? "up" : biasPct <= 40 ? "down" : "side";

    const an = analogAt(dailyBars, states, i, horizon);
    if (!an) continue;
    const maxP = Math.max(an.pA, an.pB, an.pC);
    const probBranch = maxP === an.pA ? "up" : maxP === an.pB ? "down" : "side";
    const agree = probBranch === bias;

    // Luật giống hệt "Tổng hợp · Kế hoạch chính": đồng thuận (không phải C) và
    // đủ mạnh ≥45%, HOẶC analog một mình đã rất mạnh ≥60% dù bias chưa đồng ý.
    let d = "side";
    if (agree && probBranch !== "side" && maxP >= 45) d = probBranch;
    else if (maxP >= 60 && probBranch !== "side") d = probBranch;
    dir[i] = d;
    meta[i] = { biasPct, bias, an, agree };
  }
  return { dir, meta };
}

function backtestSystem(closes, cfg = RIDE_CFG, minScore = 3) {
  // ENTRY giữ nguyên: breakout 40 nến + 5 điều kiện confluence (score).
  // EXIT đổi sang trailing dùng chung (rideExitClose). stat() giữ nguyên hình dạng cũ.
  const c = { ...RIDE_CFG, ...(cfg || {}), maxHold: (cfg && cfg.maxHold) || 60 };
  const ma50 = sma(closes, 50), ma200 = sma(closes, 200);
  const rsiArr = rsi(closes), mac = macd(closes), piv = pivots(closes, 4), vp = volProxy(closes);
  let pi = 0;
  const H = [], L = [];
  const sys = { trades: [] }, raw = { trades: [] };
  let busySys = 0, busyRaw = 0; // chặn chồng lệnh: chỉ vào khi lệnh trước đã thoát
  for (let i = 210; i < closes.length; i++) {
    while (pi < piv.length && piv[pi].i + 4 <= i) {
      (piv[pi].type === "H" ? H : L).push(piv[pi]);
      pi++;
    }
    if (H.length < 2 || L.length < 2) continue;
    const win40 = closes.slice(i - 40, i);
    const R = Math.max(...win40), S = Math.min(...win40);
    const range = R - S;
    if (range <= 0) continue;
    let dir = null;
    if (closes[i] > R && closes[i - 1] <= R) dir = "up";
    else if (closes[i] < S && closes[i - 1] >= S) dir = "down";
    if (!dir) continue;
    const hh = H[H.length - 1].price > H[H.length - 2].price;
    const hl = L[L.length - 1].price > L[L.length - 2].price;
    const conds =
      dir === "up"
        ? [
            hh && hl,
            ma50[i] != null && closes[i] > ma50[i],
            ma50[i] != null && ma200[i] != null && ma50[i] > ma200[i],
            rsiArr[i] != null && rsiArr[i] > 50,
            mac[i].hist > 0,
          ]
        : [
            !hh && !hl,
            ma50[i] != null && closes[i] < ma50[i],
            ma50[i] != null && ma200[i] != null && ma50[i] < ma200[i],
            rsiArr[i] != null && rsiArr[i] < 50,
            mac[i].hist < 0,
          ];
    const score = conds.filter(Boolean).length;
    const side = dir === "up" ? "long" : "short";
    if (i >= busyRaw) {
      const t = rideExitClose(closes, vp, i, side, c);
      if (t) { raw.trades.push(t.r); busyRaw = t.exitIdx + 1; }
    }
    if (score >= minScore && i >= busySys) {
      const t = rideExitClose(closes, vp, i, side, c);
      if (t) { sys.trades.push(t.r); busySys = t.exitIdx + 1; }
    }
  }
  const stat = (book) => {
    const t = book.trades;
    if (!t.length) return { n: 0 };
    const wins = t.filter((r) => r > 0);
    const gw = wins.reduce((a, b) => a + b, 0);
    const gl = Math.abs(t.filter((r) => r <= 0).reduce((a, b) => a + b, 0));
    let eqv = 0, peak = 0, maxDD = 0;
    const eq = t.map((r, k) => {
      eqv += r;
      peak = Math.max(peak, eqv);
      maxDD = Math.max(maxDD, peak - eqv);
      return { x: k + 1, eq: +eqv.toFixed(2) };
    });
    return {
      n: t.length,
      winRate: Math.round((wins.length / t.length) * 100),
      avg: (t.reduce((a, b) => a + b, 0) / t.length).toFixed(2),
      pf: gl ? (gw / gl).toFixed(2) : "\u221e",
      maxDD: maxDD.toFixed(1),
      eq,
    };
  };
  return { sys: stat(sys), raw: stat(raw) };
}

function percentileOf(sorted, v) {
  if (!sorted.length) return null;
  let c = 0;
  for (const x of sorted) if (x <= v) c++;
  return Math.round((c / sorted.length) * 100);
}
function scanSwings(closes, dates) {
  const piv = pivots(closes, 4);
  const legs = [];
  for (let k = 1; k < piv.length; k++) {
    const a = piv[k - 1],
      b = piv[k];
    if (a.type === b.type) continue;
    legs.push({
      dir: b.price > a.price ? "up" : "down",
      bars: b.i - a.i,
      days: Math.round((new Date(dates[b.i]) - new Date(dates[a.i])) / 864e5),
      amplPct: (Math.abs(b.price - a.price) / a.price) * 100,
      from: dates[a.i],
      to: dates[b.i],
    });
  }
  const med = (arr) => arr[Math.floor(arr.length / 2)];
  const stats = (dir) => {
    const L = legs.filter((l) => l.dir === dir);
    if (!L.length) return { n: 0 };
    const sb = L.map((l) => l.bars).sort((x, y) => x - y);
    const sd = L.map((l) => l.days).sort((x, y) => x - y);
    const sa = L.map((l) => l.amplPct).sort((x, y) => x - y);
    return {
      n: L.length,
      medBars: med(sb),
      p25B: sb[Math.floor(sb.length * 0.25)],
      p75B: sb[Math.floor(sb.length * 0.75)],
      medDays: med(sd),
      medAmpl: +med(sa).toFixed(2),
      p25A: +sa[Math.floor(sa.length * 0.25)].toFixed(2),
      p75A: +sa[Math.floor(sa.length * 0.75)].toFixed(2),
      sortedBars: sb,
      sortedAmpl: sa,
    };
  };
  const up = stats("up"),
    down = stats("down");
  let cur = null;
  if (piv.length) {
    const lastP = piv[piv.length - 1];
    const i1 = closes.length - 1;
    const dir = closes[i1] > lastP.price ? "up" : "down";
    const bars = i1 - lastP.i;
    const amplPct = +(
      (Math.abs(closes[i1] - lastP.price) / lastP.price) *
      100
    ).toFixed(2);
    const ref = dir === "up" ? up : down;
    cur = {
      dir,
      bars,
      amplPct,
      from: dates[lastP.i],
      days: Math.round(
        (new Date(dates[i1]) - new Date(dates[lastP.i])) / 864e5
      ),
      pctBars: ref.n ? percentileOf(ref.sortedBars, bars) : null,
      pctAmpl: ref.n ? percentileOf(ref.sortedAmpl, amplPct) : null,
    };
  }
  const hDur = [];
  const maxB = Math.min(Math.max(...legs.map((l) => l.bars), 0), 60);
  for (let b0 = 4; b0 <= maxB; b0 += 6)
    hDur.push({
      bucket: `${b0}–${b0 + 5}`,
      up: legs.filter((l) => l.dir === "up" && l.bars >= b0 && l.bars < b0 + 6)
        .length,
      down: legs.filter(
        (l) => l.dir === "down" && l.bars >= b0 && l.bars < b0 + 6
      ).length,
    });
  const hAmp = [];
  const maxA = Math.min(Math.max(...legs.map((l) => l.amplPct), 0), 8);
  for (let a0 = 0; a0 <= maxA; a0 += 1)
    hAmp.push({
      bucket: `${a0}–${a0 + 1}%`,
      up: legs.filter(
        (l) => l.dir === "up" && l.amplPct >= a0 && l.amplPct < a0 + 1
      ).length,
      down: legs.filter(
        (l) => l.dir === "down" && l.amplPct >= a0 && l.amplPct < a0 + 1
      ).length,
    });
  return { legs, up, down, cur, hDur, hAmp };
}
function seasonality(dates, closes) {
  const byMonth = Array.from({ length: 12 }, () => []);
  let prevClose = null,
    prevMonth = null;
  dates.forEach((d, i) => {
    const m = +d.slice(5, 7) - 1;
    if (prevMonth === null) {
      prevMonth = m;
      prevClose = closes[i];
      return;
    }
    if (m !== prevMonth) {
      byMonth[prevMonth].push((closes[i - 1] / prevClose - 1) * 100);
      prevMonth = m;
      prevClose = closes[i - 1];
    }
  });
  return byMonth.map((a) =>
    a.length ? +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(2) : 0
  );
}

/* ============================================================
   5. PLAYBOOK ENGINE (nếu-thì, trigger, target, bằng chứng)
   ============================================================ */

const trendVN = { up: "Tăng", down: "Giảm", side: "Đi ngang" };

function buildPlaybook(m) {
  const {
    closes,
    piv,
    frames,
    rsiArr,
    macdArr,
    scens,
    patterns,
    diverge,
    cotZ,
    ma50,
    ma200,
    strength,
    div,
    digits,
    cfg,
  } = m;
  const last = closes[closes.length - 1];
  const fx = (v) => v.toFixed(digits);
  const overhead = piv
    .filter((p) => p.type === "H" && p.price > last)
    .map((p) => p.price);
  const below = piv
    .filter((p) => p.type === "L" && p.price < last)
    .map((p) => p.price);
  const R = overhead.length
    ? Math.min(...overhead)
    : Math.max(...closes.slice(-40));
  const S = below.length ? Math.max(...below) : Math.min(...closes.slice(-40));
  const range = Math.max(R - S, 1e-9);
  const fibs = fibLevels(majorSwing(piv));

  const lastRSI = rsiArr[rsiArr.length - 1] ?? 50;
  const lastM = macdArr[macdArr.length - 1];
  const m50 = ma50[ma50.length - 1],
    m200 = ma200[ma200.length - 1];
  const topScen = scens[0];
  const bullPat = patterns.find((p) => p.dir === "tăng");
  const bearPat = patterns.find((p) => p.dir === "giảm");

  const mkEv = (up) => [
    {
      txt: `Xu hướng M: ${trendVN[frames.M.trend].toLowerCase()}`,
      ok: frames.M.trend === (up ? "up" : "down"),
      layer: 2,
    },
    {
      txt: `Xu hướng W: ${trendVN[frames.W.trend].toLowerCase()}`,
      ok: frames.W.trend === (up ? "up" : "down"),
      layer: 2,
    },
    {
      txt: `Xu hướng D: ${trendVN[frames.D.trend].toLowerCase()}`,
      ok: frames.D.trend === (up ? "up" : "down"),
      layer: 2,
    },
    {
      txt:
        m50 != null
          ? `Giá ${last > m50 ? "trên" : "dưới"} MA50`
          : "MA50 chưa đủ dữ liệu",
      ok: m50 != null && (up ? last > m50 : last < m50),
      layer: 2,
    },
    {
      txt:
        m50 != null && m200 != null
          ? `MA50 ${m50 > m200 ? "trên" : "dưới"} MA200 (${
              m50 > m200 ? "golden" : "death"
            }-cross regime)`
          : "MA200 chưa đủ dữ liệu",
      ok: m50 != null && m200 != null && (up ? m50 > m200 : m50 < m200),
      layer: 2,
    },
    {
      txt: `RSI(14) = ${lastRSI.toFixed(1)}`,
      ok: up ? lastRSI > 50 : lastRSI < 50,
      layer: 4,
    },
    {
      txt: `MACD ${lastM.macd > lastM.signal ? "trên" : "dưới"} signal`,
      ok: up ? lastM.macd > lastM.signal : lastM.macd < lastM.signal,
      layer: 4,
    },
    {
      txt:
        div.type === (up ? "bearish" : "bullish")
          ? div.txt
          : `Không có phân kỳ ${up ? "giảm" : "tăng"} RSI`,
      ok: div.type !== (up ? "bearish" : "bullish"),
      layer: 4,
    },
    {
      txt: topScen
        ? `Elliott #1: ${topScen.name} (~${topScen.prob}%)`
        : "Elliott: chưa đủ pivot",
      ok: !!topScen && topScen.dir === (up ? "up" : "down"),
      layer: 3,
    },
    {
      txt: (up ? bullPat : bearPat)
        ? `Pattern: ${(up ? bullPat : bearPat).name} — ${
            (up ? bullPat : bearPat).status
          }`
        : `Không có pattern ${up ? "tăng" : "giảm"}`,
      ok: !!(up ? bullPat : bearPat),
      layer: 3,
    },
  ];
  const evBull = mkEv(true),
    evBear = mkEv(false);

  if (!cfg.cross && cfg.base !== "EUR" && cfg.quote !== "EUR") {
    const t = {
      txt: diverge ? "Giá đang phân kỳ với DXY" : "Đồng pha với DXY",
      ok: !diverge,
      layer: 1,
    };
    evBull.push({ ...t });
    evBear.push({ ...t });
  }
  if (cotZ != null) {
    evBull.push({
      txt: `COT z = ${cotZ.toFixed(1)} (${
        cotZ > 0 ? "net long" : "net short"
      } đầu cơ lớn)`,
      ok: cotZ > 0.3 && cotZ < 1.5,
      layer: 4,
    });
    evBear.push({
      txt: `COT z = ${cotZ.toFixed(1)}`,
      ok: cotZ < -0.3 && cotZ > -1.5,
      layer: 4,
    });
    if (Math.abs(cotZ) >= 1.5) {
      const w = {
        txt: "COT cực đoan (|z|≥1.5) — rủi ro squeeze ngược chiều positioning",
        ok: true,
        layer: 4,
      };
      (cotZ > 0 ? evBear : evBull).push(w);
    }
  }
  const bullScore = evBull.filter((e) => e.ok).length;
  const bearScore = evBear.filter((e) => e.ok).length;
  const biasPct = Math.round((bullScore / (bullScore + bearScore || 1)) * 100);
  const bias = biasPct >= 60 ? "up" : biasPct <= 40 ? "down" : "side";

  const tA1 = R + range * 0.618,
    tA2 = R + range;
  const tB1 = S - range * 0.618,
    tB2 = S - range;
  const branches = [
    {
      id: "A",
      dir: "up",
      title: `Kịch bản A — phá lên trên kháng cự ${fx(R)}`,
      trigger: `Nến D đóng cửa trên ${fx(
        R
      )} (chạm trong phiên không tính — ECB fixing là giá đóng)`,
      targets: [
        `T1 = ${fx(tA1)} (0.618 × biên độ S–R)`,
        `T2 = ${fx(tA2)} (measured move: R + (R−S))`,
        ...(topScen && topScen.dir === "up" && topScen.target.includes("Fib")
          ? [`T3 = theo ${topScen.target}`]
          : []),
        ...(bullPat && bullPat.target
          ? [`Pattern target = ${fx(bullPat.target)}`]
          : []),
      ],
      invalid: `Vô hiệu nếu sau khi phá, giá đóng cửa quay lại dưới ${fx(
        R
      )} (false break); bỏ hẳn khi đóng dưới ${fx(S)}`,
      evidence: evBull,
      score: bullScore,
      total: evBull.length,
    },
    {
      id: "B",
      dir: "down",
      title: `Kịch bản B — thủng hỗ trợ ${fx(S)}`,
      trigger: `Nến D đóng cửa dưới ${fx(S)}`,
      targets: [
        `T1 = ${fx(tB1)} (0.618 × biên độ S–R)`,
        `T2 = ${fx(tB2)} (measured move: S − (R−S))`,
        ...(topScen && topScen.dir === "down" && topScen.target.includes("Fib")
          ? [`T3 = theo ${topScen.target}`]
          : []),
        ...(bearPat && bearPat.target
          ? [`Pattern target = ${fx(bearPat.target)}`]
          : []),
      ],
      invalid: `Vô hiệu nếu sau khi thủng, giá đóng cửa quay lại trên ${fx(
        S
      )}; bỏ hẳn khi đóng trên ${fx(R)}`,
      evidence: evBear,
      score: bearScore,
      total: evBear.length,
    },
    {
      id: "C",
      dir: "side",
      title: `Kịch bản C — kẹt trong biên ${fx(S)} – ${fx(R)}`,
      trigger: `Giá bị từ chối tại biên (chạm gần R rồi RSI quay xuống từ >60, hoặc gần S với RSI hồi từ <40) mà chưa có nến đóng ngoài biên`,
      targets: [
        `Dao động về biên đối diện; điểm giữa biên ${fx(
          (R + S) / 2
        )} là mốc cân bằng`,
      ],
      invalid:
        "Kịch bản C tự hết hiệu lực ngay khi A hoặc B kích hoạt (đóng cửa ngoài biên)",
      evidence: [
        {
          txt: `Xu hướng W hiện ${trendVN[
            frames.W.trend
          ].toLowerCase()} — range trade hợp lý nhất khi W đi ngang`,
          ok: frames.W.trend === "side",
          layer: 2,
        },
        {
          txt: `Độ mạnh xu hướng 40 phiên: slope ${strength.slopePerDayInVol.toFixed(
            2
          )} vol/ngày, R²=${strength.r2.toFixed(2)} ${
            strength.r2 < 0.3
              ? "(yếu → thuận range)"
              : "(rõ → bất lợi cho range)"
          }`,
          ok: strength.r2 < 0.3,
          layer: 2,
        },
        {
          txt: `RSI ở vùng giữa (40–60): ${lastRSI.toFixed(1)}`,
          ok: lastRSI >= 40 && lastRSI <= 60,
          layer: 4,
        },
      ],
      score: 0,
      total: 3,
    },
  ];
  branches[2].score = branches[2].evidence.filter((e) => e.ok).length;
  return {
    R,
    S,
    range,
    fibs,
    tA1,
    tA2,
    tB1,
    tB2,
    last,
    branches,
    bias,
    biasPct,
    bullScore,
    bearScore,
  };
}

/* ============================================================
   6. TIỆN ÍCH DÙNG CHUNG CHO BỘ LỌC (giữ lại từ engine Hurst cũ đã bỏ —
      quickPullbackBacktest vẫn được screenPair/screenPairStrategic dùng
      cho cột mô phỏng nhanh Sharpe/maxDD, không liên quan gì đến tab Hurst
      đã xoá)
   ============================================================ */

function rollingSlope(closes, window) {
  const n = closes.length,
    out = Array(n).fill(null);
  const mx = (window - 1) / 2;
  let sxx = 0;
  for (let x = 0; x < window; x++) sxx += (x - mx) ** 2;
  for (let i = window; i <= n; i++) {
    const ys = closes.slice(i - window, i);
    const my = ys.reduce((a, b) => a + b, 0) / window;
    let sxy = 0;
    for (let k = 0; k < window; k++) sxy += (k - mx) * (ys[k] - my);
    out[i - 1] = sxx > 0 ? sxy / sxx : 0;
  }
  return out;
}

function buildConsensusTradesWithSL(pos, bh, closes, atr, slMult) {
  const n = pos.length,
    trades = [];
  let side = 0,
    entryIdx = -1,
    cum = 1,
    slPrice = null,
    slDist = null;
  const start = (i) => {
    entryIdx = i;
    cum = 1;
    const a = atr[i - 1];
    if (a != null && a > 0) {
      slDist = a * slMult;
      slPrice = closes[i - 1] - side * slDist;
    } else {
      slDist = null;
      slPrice = null;
    }
  };
  const end = (exitIdx, exitPrice, stoppedOut) => {
    const ep = closes[entryIdx - 1];
    trades.push({
      entryIdx,
      exitIdx,
      finalExitIdx: exitIdx,
      side,
      entryPrice: ep,
      exitPrice,
      finalExitPrice: exitPrice,
      ret: cum - 1,
      slPrice,
      slDistance: slDist,
      R: slDist ? (side * (exitPrice - ep)) / slDist : null,
      stoppedOut,
    });
  };
  for (let i = 1; i < n; i++) {
    const ns = pos[i] > 0 ? 1 : pos[i] < 0 ? -1 : 0;
    if (ns !== side) {
      if (side !== 0) end(i - 1, closes[i - 1], false);
      side = ns;
      if (side !== 0) start(i);
    }
    if (side !== 0) {
      cum *= 1 + side * bh[i];
      if (slPrice != null) {
        const hit = side === 1 ? closes[i] <= slPrice : closes[i] >= slPrice;
        if (hit) {
          end(i, slPrice, true);
          side = 0;
        }
      }
    }
  }
  if (side !== 0) end(n - 1, closes[n - 1], false);
  return trades;
}

function simulateEquityDaily(trades, closes, n, riskPct = 0.01) {
  const valid = trades.filter((t) => t.R != null && t.slDistance > 0);
  const opensOn = Array.from({ length: n }, () => []);
  for (const t of valid) opensOn[Math.max(1, t.entryIdx)].push(t);
  let equity = 1,
    peak = 1,
    maxDD = 0,
    stopped = 0,
    blown = false;
  const open = new Map();
  const daily = Array(n).fill(0);
  for (let day = 1; day < n; day++) {
    for (const t of opensOn[day]) open.set(t, riskPct); // rủi ro cố định theo vốn gốc (=1), KHÔNG nhân equity
    let pnl = 0;
    for (const [t, risk] of open) {
      const price = day === t.finalExitIdx ? t.finalExitPrice : closes[day];
      // Mốc để tính biến động của NGÀY VÀO LỆNH phải là đúng entryPrice, KHÔNG
      // phải mặc định closes[day-1] — hai giá này chỉ trùng nhau khi engine
      // vào lệnh theo quy ước "quyết định hôm qua, vào tại giá đóng cửa hôm
      // qua" (entryPrice = closes[entryIdx-1], như luật v3/Tuần-Ngày). Với
      // engine vào lệnh CÙNG NGÀY (entryPrice = closes[entryIdx], như thẻ
      // chiến lược), dùng closes[day-1] sẽ CỘNG NHẦM biến động của cả ngày
      // TRƯỚC KHI lệnh tồn tại vào kết quả — thổi phồng lợi nhuận giả tạo,
      // nhất là với lệnh giữ ngắn ngày (breakout vào đúng ngày giá chạy mạnh).
      const base = day === t.entryIdx ? t.entryPrice : closes[day - 1];
      pnl += ((t.side * (price - base)) / t.slDistance) * risk;
    }
    equity += pnl; // cộng dồn tuyến tính
    if (equity <= 0) {
      equity = 0;
      blown = true;
    }
    daily[day] = pnl; // P&L tuyệt đối theo vốn gốc
    for (const [t] of open)
      if (day === t.finalExitIdx) {
        open.delete(t);
        if (t.stoppedOut) stopped++;
      }
    if (equity > peak) peak = equity;
    const dd = equity - peak; // drawdown tuyến tính theo vốn gốc
    if (dd < maxDD) maxDD = dd;
    if (blown) break;
  }
  return {
    n: valid.length,
    finalMultiple: equity,
    totalReturnPct: (equity - 1) * 100,
    maxDDPct: maxDD * 100,
    stoppedOutCount: stopped,
    stoppedOutPct: valid.length ? (stopped / valid.length) * 100 : NaN,
    dailyReturns: daily,
    blown,
  };
}

function tradeStats(trades, n) {
  if (!trades.length)
    return { sharpe: -Infinity, count: 0, hitRate: NaN, avgHoldDays: 0 };
  const rets = trades.map((t) => t.ret);
  const m = mstd(rets);
  const perYear = trades.length / Math.max(n / 252, 1e-6);
  const sharpe =
    m.sd > 0
      ? (m.mean / m.sd) * Math.sqrt(Math.max(perYear, 1e-6))
      : m.mean > 0
      ? 5
      : m.mean < 0
      ? -5
      : 0;
  return {
    sharpe,
    count: trades.length,
    hitRate: (rets.filter((r) => r > 0).length / rets.length) * 100,
    avgHoldDays:
      trades.reduce((s, t) => s + (t.exitIdx - t.entryIdx + 1), 0) /
      trades.length,
  };
}

function buildPullbackPos(
  trendPos,
  closes,
  direction,
  atr,
  minTrendStrength,
  minPullbackATR
) {
  const n = trendPos.length,
    pos = Array(n).fill(0);
  const mts = minTrendStrength || 0,
    mpb = minPullbackATR || 0;
  let inPos = false;
  for (let i = 2; i < n; i++) {
    const t = trendPos[i - 1];
    const confirms = direction === "long" ? t > mts : t < -mts;
    const move = closes[i - 1] - closes[i - 2];
    const aRef =
      atr[i - 2] != null ? atr[i - 2] : atr[i - 1] != null ? atr[i - 1] : 0;
    const pulled =
      direction === "long" ? move < -mpb * aRef : move > mpb * aRef;
    if (!inPos && confirms && pulled) inPos = true;
    else if (inPos && !confirms) inPos = false;
    pos[i] = inPos ? (direction === "long" ? 1 : -1) : 0;
  }
  return pos;
}

function quickTrendConsensusFn(closes) {
  const ma10 = sma(closes, 10),
    ma50 = sma(closes, 50);
  const e12 = ema(closes, 12),
    e26 = ema(closes, 26),
    e50 = ema(closes, 50);
  const sl20 = rollingSlope(closes, 20);
  const { macd: mc, signal: sg } = macdCalc(closes, 12, 26, 9);
  return (i) => {
    let s = 0,
      c = 0;
    const add = (v) => {
      if (v != null) {
        s += v;
        c++;
      }
    };
    add(
      ma10[i - 1] != null && ma50[i - 1] != null
        ? ma10[i - 1] > ma50[i - 1]
          ? 1
          : -1
        : null
    );
    add(e12[i - 1] > e26[i - 1] ? 1 : -1);
    add(closes[i - 1] > e50[i - 1] ? 1 : -1);
    add(sl20[i - 1] != null ? (sl20[i - 1] > 0 ? 1 : -1) : null);
    add(mc[i - 1] > sg[i - 1] ? 1 : -1);
    return c ? s / c : 0;
  };
}

function quickPullbackBacktest(closes, dir, atr, slMult, riskPct) {
  const n = closes.length;
  const cons = quickTrendConsensusFn(closes);
  const trendPos = Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const c = cons(i);
    trendPos[i] = dir === "long" ? (c > 0.5 ? 1 : 0) : c < -0.5 ? -1 : 0;
  }
  const bh = Array(n).fill(0);
  for (let i = 1; i < n; i++) bh[i] = closes[i] / closes[i - 1] - 1;
  const pos = buildPullbackPos(trendPos, closes, dir, atr, 0, 0);
  const trades = buildConsensusTradesWithSL(pos, bh, closes, atr, slMult);
  const sim = simulateEquityDaily(trades, closes, n, riskPct);
  const st = tradeStats(trades, n);
  return {
    sharpe: isFinite(st.sharpe) ? st.sharpe : 0,
    count: st.count,
    maxDD: sim.maxDDPct,
  };
}


/* ============================================================
   7. BỘ LỌC — XẾP HẠNG BẰNG TÍN HIỆU CMT
   ------------------------------------------------------------
   Điểm CMT (0–100):
     30%  Cán cân bằng chứng 5 lớp   |biasPct − 50| × 2
     28%  Xác suất analog cùng hướng bias
     20%  Tỷ lệ đạt T1 lịch sử của quy tắc breakout, đúng hướng bias
     14%  Khoảng cách tới trigger (sát/đã phá = cao)
      8%  Đồng thuận đa khung W & D
   ============================================================ */

// ============================================================
// P(touch) — xác suất giá CHẠM mốc (TP pivot / R / S), blend A+B+C:
//   A empirical (lịch sử cặp) · B first-passage (mô hình biến động) · C analog CMT.
// Trả 0..1. Đã kiểm chứng bằng Node (up→P(TP) mua cao, down→P(TP) bán cao, range→thấp).
// ============================================================
function _ncdf(x) {
  const tt = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p = d * tt * (0.31938153 + tt * (-0.356563782 + tt * (1.781477937 + tt * (-1.821255978 + tt * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}
function _fwdTwoBarrier(bars, startIdx, dirUp, aDist, bDist, H) {
  const entry = bars[startIdx].c;
  const tpLvl = dirUp ? entry + aDist : entry - aDist;
  const slLvl = dirUp ? entry - bDist : entry + bDist;
  const last = Math.min(bars.length - 1, startIdx + H);
  for (let k = startIdx + 1; k <= last; k++) {
    const b = bars[k];
    if (dirUp) { if (b.l <= slLvl) return "sl"; if (b.h >= tpLvl) return "tp"; }
    else { if (b.h >= slLvl) return "sl"; if (b.l <= tpLvl) return "tp"; }
  }
  return "none";
}
function _fwdTouch(bars, startIdx, touchUp, aDist, H) {
  const entry = bars[startIdx].c;
  const lvl = touchUp ? entry + aDist : entry - aDist;
  const last = Math.min(bars.length - 1, startIdx + H);
  for (let k = startIdx + 1; k <= last; k++) {
    if (touchUp ? bars[k].h >= lvl : bars[k].l <= lvl) return true;
  }
  return false;
}
function _pEmpTwo(bars, dirUp, aDist, bDist, H, minN = 15) {
  let tp = 0, n = 0;
  for (let i = 50; i < bars.length - 2; i++) {
    const r = _fwdTwoBarrier(bars, i, dirUp, aDist, bDist, H);
    if (r === "tp") tp++;
    n++;
  }
  return n >= minN ? tp / n : null;
}
function _pEmpTouch(bars, touchUp, aDist, H, minN = 15) {
  let hit = 0, n = 0;
  for (let i = 50; i < bars.length - 2; i++) { if (_fwdTouch(bars, i, touchUp, aDist, H)) hit++; n++; }
  return n >= minN ? hit / n : null;
}
function _pBarrierTwo(aDist, bDist, mu, sigma) {
  if (aDist <= 0 || bDist <= 0 || sigma <= 0) return null;
  const v = sigma * sigma;
  if (Math.abs(mu) < 1e-9) return bDist / (aDist + bDist);
  const num = 1 - Math.exp((-2 * mu * bDist) / v);
  const den = 1 - Math.exp((-2 * mu * (aDist + bDist)) / v);
  return Math.max(0, Math.min(1, num / den));
}
function _pBarrierTouch(aDist, touchUp, mu, sigma, H) {
  if (aDist <= 0 || sigma <= 0 || H <= 0) return null;
  const s = sigma * Math.sqrt(H), m = mu * H, v = sigma * sigma;
  let p;
  if (touchUp) p = _ncdf((-aDist + m) / s) + Math.exp((2 * mu * aDist) / v) * _ncdf((-aDist - m) / s);
  else p = _ncdf((-aDist - m) / s) + Math.exp((-2 * mu * aDist) / v) * _ncdf((-aDist + m) / s);
  return Math.max(0, Math.min(1, p));
}
function _pAnalogTwo(bars, feats, nowFeat, dirUp, aDist, bDist, H, K = 60, minN = 12) {
  if (!nowFeat) return null;
  const scored = [];
  for (let i = 50; i < bars.length - 2; i++) {
    const f = feats[i]; if (!f) continue;
    let d = 0; for (let j = 0; j < nowFeat.length; j++) { const x = f[j] - nowFeat[j]; d += x * x; }
    scored.push({ i, d });
  }
  scored.sort((p, q) => p.d - q.d);
  const top = scored.slice(0, K);
  let tp = 0, n = 0;
  for (const s of top) { if (_fwdTwoBarrier(bars, s.i, dirUp, aDist, bDist, H) === "tp") tp++; n++; }
  return n >= minN ? tp / n : null;
}
function _blendP(parts, weights) {
  let w = 0, p = 0;
  for (const k of Object.keys(parts)) {
    const v = parts[k];
    if (v == null || isNaN(v)) continue;
    p += weights[k] * v; w += weights[k];
  }
  return w > 0 ? p / w : null;
}
function _pAnalogTouch(bars, feats, nowFeat, touchUp, aDist, H, K = 60, minN = 12) {
  if (!nowFeat) return null;
  const scored = [];
  for (let i = 50; i < bars.length - 2; i++) {
    const f = feats[i]; if (!f) continue;
    let d = 0; for (let j = 0; j < nowFeat.length; j++) { const x = f[j] - nowFeat[j]; d += x * x; }
    scored.push({ i, d });
  }
  scored.sort((p, q) => p.d - q.d);
  let hit = 0, n = 0;
  for (const s of scored.slice(0, K)) { if (_fwdTouch(bars, s.i, touchUp, aDist, H)) hit++; n++; }
  return n >= minN ? hit / n : null;
}
function _medianTouchBars(bars, touchUp, aDist, H) {
  const times = [];
  for (let i = 50; i < bars.length - 2; i++) {
    const entry = bars[i].c, lvl = touchUp ? entry + aDist : entry - aDist;
    const last = Math.min(bars.length - 1, i + H);
    for (let k = i + 1; k <= last; k++) { if (touchUp ? bars[k].h >= lvl : bars[k].l <= lvl) { times.push(k - i); break; } }
  }
  if (!times.length) return null;
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}
// T90 "90-point": mức XA NHẤT mà ~90% lịch sử vẫn CHẠM tới trong H phiên (biên độ + thời gian).
// Giải NGƯỢC: quét khoảng cách theo bội ATR, giữ mức lớn nhất còn P(chạm) >= threshold.
function _pctFromTimes(times, pct) {
  if (!times || !times.length) return null;
  times.sort((a, b) => a - b);
  const idx = Math.min(times.length - 1, Math.max(0, Math.ceil(pct * times.length) - 1));
  return { t: times[idx], n: times.length };
}
// Time90 toàn lịch sử: phân vị `pct` của số nến-để-chạm, CHỈ trong các lần ĐÃ chạm aDist trong H.
function _touchTimeAll(bars, touchUp, aDist, H, pct = 0.9) {
  const times = [];
  for (let i = 50; i < bars.length - 2; i++) {
    const entry = bars[i].c, lvl = touchUp ? entry + aDist : entry - aDist;
    const last = Math.min(bars.length - 1, i + H);
    for (let k = i + 1; k <= last; k++) { if (touchUp ? bars[k].h >= lvl : bars[k].l <= lvl) { times.push(k - i); break; } }
  }
  return _pctFromTimes(times, pct);
}
// Time90 analog: như trên nhưng chỉ trên K phiên GIỐNG hiện tại (đúng "trong điều kiện đó").
function _touchTimeAnalog(bars, feats, nowFeat, touchUp, aDist, H, pct = 0.9, K = 60) {
  if (!nowFeat) return null;
  const scored = [];
  for (let i = 50; i < bars.length - 2; i++) { const f = feats[i]; if (!f) continue; let d = 0; for (let j = 0; j < nowFeat.length; j++) { const x = f[j] - nowFeat[j]; d += x * x; } scored.push({ i, d }); }
  scored.sort((p, q) => p.d - q.d);
  const times = [];
  for (const s of scored.slice(0, K)) {
    const i = s.i, entry = bars[i].c, lvl = touchUp ? entry + aDist : entry - aDist;
    const last = Math.min(bars.length - 1, i + H);
    for (let k = i + 1; k <= last; k++) { if (touchUp ? bars[k].h >= lvl : bars[k].l <= lvl) { times.push(k - i); break; } }
  }
  return _pctFromTimes(times, pct);
}
function _highProbTarget(bars, feats, nowFeat, dirUp, mu, sigma, last, H, threshold = 0.9) {
  if (!sigma || sigma <= 0) return null;
  let best = null, fb = null; // fb = mốc gần nhất tính được (dự phòng khi không mức nào đạt ngưỡng)
  for (let m = 0.25; m <= 6.001; m += 0.25) {
    const d = m * sigma;
    const p = _blendP(
      { A: _pEmpTouch(bars, dirUp, d, H), B: _pBarrierTouch(d, dirUp, mu, sigma, H), C: _pAnalogTouch(bars, feats, nowFeat, dirUp, d, H) },
      { A: 0.4, B: 0.25, C: 0.35 }
    );
    if (p == null) continue;
    if (fb == null) fb = { m, d, p };
    if (p >= threshold) best = { m, d, p };
    else if (best) break;
  }
  const pick = best || fb; // luôn có mốc nếu tính được ít nhất 1 khoảng cách (B luôn chạy khi có ATR)
  if (!pick) return null;
  const tAll = _touchTimeAll(bars, dirUp, pick.d, H, 0.9); // Time90 toàn lịch sử (có điều kiện đã chạm)
  const tAna = _touchTimeAnalog(bars, feats, nowFeat, dirUp, pick.d, H, 0.9); // Time90 trên nhóm analog
  return {
    level: dirUp ? last + pick.d : last - pick.d,
    distPct: (pick.d / last) * 100,
    mult: +pick.m.toFixed(2),
    prob: Math.round(pick.p * 100),
    bars: _medianTouchBars(bars, dirUp, pick.d, H), // trung vị (phân vị 50) thời-gian-chạm
    time90All: tAll ? tAll.t : null,
    nAll: tAll ? tAll.n : 0,
    time90Ana: tAna ? tAna.t : null,
    nAna: tAna ? tAna.n : 0,
    below90: !best, // true nếu ngay cả mốc gần nhất cũng < 90% (rất hiếm; prob hiển thị nói thật)
  };
}
// Xác suất chạm TP pivot / R / S cho 1 cặp (blend A+B+C). Trả {pTP,pR,pS} theo % (0..100) hoặc null.
function touchProbabilities(barsD, closes, rsiArr, mac, atr, R, S, last, bias, H) {
  const n = closes.length;
  if (n < 30 || !atr[n - 1]) return { pTP: null, pR: null, pS: null, t90: null };
  const sma20 = sma(closes, 20);
  const feats = barsD.map((b, i) =>
    i > 40 && atr[i]
      ? [
          (closes[i] - closes[i - 40]) / (40 * atr[i]),
          sma20[i] != null ? (closes[i] - sma20[i]) / atr[i] : 0,
          ((rsiArr[i] ?? 50) - 50) / 50,
          Math.sign(mac[i] ? mac[i].hist : 0),
        ]
      : null
  );
  const nowFeat = feats[n - 1];
  let mu = 0, c = 0;
  for (let i = Math.max(1, n - 100); i < n; i++) { mu += closes[i] - closes[i - 1]; c++; }
  mu = c ? mu / c : 0;
  const sigma = atr[n - 1] || last * 0.005;
  const dirUp = bias !== "down";
  const aTP = Math.max(dirUp ? R - last : last - S, sigma * 0.05);
  const bSL = Math.max(dirUp ? last - S : R - last, sigma * 0.05);
  const dR = Math.max(R - last, sigma * 0.05);
  const dS = Math.max(last - S, sigma * 0.05);
  const pct = (x) => (x == null ? null : Math.round(x * 100));
  const pTP = pct(
    _blendP(
      {
        A: _pEmpTwo(barsD, dirUp, aTP, bSL, H),
        B: _pBarrierTwo(aTP, bSL, dirUp ? mu : -mu, sigma),
        C: _pAnalogTwo(barsD, feats, nowFeat, dirUp, aTP, bSL, H),
      },
      { A: 0.4, B: 0.25, C: 0.35 }
    )
  );
  const pR = pct(_blendP({ A: _pEmpTouch(barsD, true, dR, H), B: _pBarrierTouch(dR, true, mu, sigma, H) }, { A: 0.55, B: 0.45 }));
  const pS = pct(_blendP({ A: _pEmpTouch(barsD, false, dS, H), B: _pBarrierTouch(dS, false, mu, sigma, H) }, { A: 0.55, B: 0.45 }));
  const t90 = _highProbTarget(barsD, feats, nowFeat, dirUp, mu, sigma, last, H, 0.9);
  return { pTP, pR, pS, t90 };
}

function screenPair(cfg, pd, opts) {
  const barsD = pd.D;
  const closes = barsD.map((b) => b.c);
  const dates = barsD.map((b) => b.d.slice(0, 10));
  const highD = barsD.map((b) => b.h),
    lowD = barsD.map((b) => b.l);
  const n = closes.length;
  const last = closes[n - 1];
  const rsiArr = rsi(closes),
    mac = macd(closes);
  const ma50 = sma(closes, 50),
    ma200 = sma(closes, 200);
  // Pivot/xu hướng — Ngày/Tuần thuần OHLC thật (Twelve Data). Tháng suy từ Tuần
  // thật (gộp OHLC, không tốn thêm request) — Tháng/4H/1H "chuẩn" chỉ tải khi
  // mở sâu 1 cặp cụ thể ở tab CMT/Intraday.
  const pivD = pivotsOHLC(barsD, 4);
  const tD = dowTrend(pivD).trend;
  const tW = dowTrend(pivotsOHLC(pd.W, 2)).trend;
  const tM = dowTrend(pivotsOHLC(aggMonthlyFromBars(pd.W), 2)).trend;
  const consensus = tW === tD && tD !== "side";

  const m50 = ma50[n - 1],
    m200 = ma200[n - 1];
  const lastRSI = rsiArr[n - 1] ?? 50,
    lastM = mac[n - 1];
  const bull = [
    tW === "up",
    tD === "up",
    m50 != null && last > m50,
    m50 != null && m200 != null && m50 > m200,
    lastRSI > 50,
    lastM.hist > 0,
  ].filter(Boolean).length;
  const bear = [
    tW === "down",
    tD === "down",
    m50 != null && last < m50,
    m50 != null && m200 != null && m50 < m200,
    lastRSI < 50,
    lastM.hist < 0,
  ].filter(Boolean).length;
  const biasPct = Math.round((bull / (bull + bear || 1)) * 100);
  const bias = biasPct >= 60 ? "up" : biasPct <= 40 ? "down" : "side";

  // R/S (kháng cự/hỗ trợ) từ pivot High/Low THẬT — trước đây suy từ đỉnh/đáy của Close.
  const overhead = pivD
    .filter((p) => p.type === "H" && p.price > last)
    .map((p) => p.price);
  const below = pivD
    .filter((p) => p.type === "L" && p.price < last)
    .map((p) => p.price);
  const R = overhead.length
    ? Math.min(...overhead)
    : Math.max(...highD.slice(-40));
  const S = below.length ? Math.max(...below) : Math.min(...lowD.slice(-40));
  const range = Math.max(R - S, 1e-9);

  // Biên breakout 40 phiên đo bằng High/Low thật (không chỉ Close).
  const wH40 = highD.slice(-41, -1),
    wL40 = lowD.slice(-41, -1);
  const R40 = Math.max(...wH40),
    S40 = Math.min(...wL40);
  let state = "IN_RANGE";
  if (last > R40) state = "RUN_UP";
  else if (last < S40) state = "RUN_DOWN";
  else if (Math.min(R - last, last - S) / range < 0.15) state = "NEAR_TRIGGER";

  const states = buildStates(barsD);
  const analog = analogProbabilities(barsD, states);
  const fibTargets = analogFibTargets(barsD, states, 60, 90);
  const rule = scanBreakoutRule(closes);
  const atr = atrOHLC(barsD, opts.atrPeriod);
  const volPct = ((atr[n - 1] ?? 0) / last) * 100;
  const _tp = touchProbabilities(barsD, closes, rsiArr, mac, atr, R, S, last, bias, opts.probH || 20);
  const qb = quickPullbackBacktest(
    closes,
    bias === "down" ? "short" : "long",
    atr,
    opts.slMult,
    opts.riskPct
  );

  const prob = analog
    ? bias === "up"
      ? analog.pA
      : bias === "down"
      ? analog.pB
      : analog.pC
    : 50;
  const histRate =
    bias === "up"
      ? rule.up.rate
      : bias === "down"
      ? rule.down.rate
      : Math.round(((rule.up.rate ?? 50) + (rule.down.rate ?? 50)) / 2);
  const dist =
    bias === "up"
      ? R - last
      : bias === "down"
      ? last - S
      : Math.min(R - last, last - S);
  // Khoảng cách kiểu PULLBACK: ngược hướng với dist ở trên (Long → tới S, Short → tới R).
  // Chỉ để hiển thị tham khảo — điểm CMT vẫn dùng dist (breakout) như cũ.
  const distPullback =
    bias === "up"
      ? last - S
      : bias === "down"
      ? R - last
      : Math.min(R - last, last - S);
  // Đang sát trigger BREAKOUT hơn hay PULLBACK hơn (so 2 khoảng cách trên).
  const nearerTrigger =
    bias === "side" ? null : dist <= distPullback ? "breakout" : "pullback";
  const prox =
    state === "RUN_UP" || state === "RUN_DOWN"
      ? 100
      : Math.max(0, 100 * (1 - Math.min(1, (dist / range) * 2)));

  const evi = Math.abs(biasPct - 50) * 2;
  // Mục tiêu tối ưu (Fibonacci/pivot, >=90% xác suất lịch sử) theo ĐÚNG hướng
  // bias hiện tại - mult càng lớn (mục tiêu càng xa mà vẫn giữ ngưỡng tin
  // cậy) càng phản ánh dư địa lãi/rủi ro thật, không chỉ điểm cao suông.
  const fibPick =
    bias === "down" ? fibTargets?.down : bias === "up" ? fibTargets?.up : null;
  const fibScore = fibPick
    ? Math.min(100, fibPick.mult * 50)
    : _tp.t90
    ? Math.min(100, _tp.t90.mult * 50)
    : 0;
  const score = Math.round(
    0.2 * evi +
      0.2 * (prob ?? 50) +
      0.15 * (histRate ?? 50) +
      0.1 * prox +
      0.08 * (consensus ? 100 : 50) +
      0.27 * fibScore
  );

  const row = {
    key: cfg.key,
    label: cfg.label,
    group: cfg.group,
    digits: cfg.digits,
    pip: cfg.pip,
    price: last,
    tfScale: "D",
    pTP: _tp.pTP,
    pR: _tp.pR,
    pS: _tp.pS,
    t90: _tp.t90,
    tM,
    tW,
    tD,
    consensus,
    bias,
    biasPct,
    R,
    S,
    range,
    state,
    analog,
    rule,
    histRate,
    volPct,
    qb,
    prob,
    prox: Math.round(prox),
    fibTargets,
    fibScore: Math.round(fibScore),
    score,
    distPct: (Math.abs(dist) / last) * 100,
    distPullbackPct: (Math.abs(distPullback) / last) * 100,
    nearerTrigger,
    spark: closes.slice(-90).map((c, i) => ({ i, c })),
  };
  row.strategy = deriveStrategy(row);
  return row;
}

/* ============================================================
   7b. BỘ LỌC CHIẾN LƯỢC — XẾP HẠNG THEO KHUNG TUẦN (phụ thuộc THÁNG)
   ------------------------------------------------------------
   Y HỆT công thức điểm CMT ở screenPair, nhưng đo trên chuỗi TUẦN
   (mỗi "phiên" trong công thức = 1 tuần đóng cửa). Đây là "lệnh
   chiến lược" — cùng cơ chế phá biên 40 phiên như lệnh nhanh nhưng
   trên khung tuần (~40 tuần ≈ 9-10 tháng lịch), giữ lệnh dài hơn.
   Đồng thuận đa khung ở đây là Tuần & Tháng (thay vì Tuần & Ngày).
   Tháng không có gate riêng — chỉ dùng làm khung mẹ để gắn cờ cảnh
   báo MỀM khi Tuần breakout ngược xu hướng Tháng. KHÔNG loại bỏ
   cặp khỏi bảng, không tự chặn lệnh — người dùng tự quyết vào lệnh
   nhanh hay lệnh chiến lược, hoặc cả hai.
   ============================================================ */
function screenPairStrategic(cfg, pd, opts) {
  const barsW = pd.W,
    barsM = aggMonthlyFromBars(barsW); // suy từ Tuần thật, không tốn thêm request
  const closes = barsW.map((b) => b.c),
    dates = barsW.map((b) => b.d.slice(0, 10));
  const highW = barsW.map((b) => b.h),
    lowW = barsW.map((b) => b.l);
  const n = closes.length;
  if (n < 260) return null; // cần đủ ~5 năm tuần để MA200 tuần + analog có ý nghĩa
  const last = closes[n - 1];
  const rsiArr = rsi(closes),
    mac = macd(closes);
  const ma50 = sma(closes, 50),
    ma200 = sma(closes, 200);
  const pivW = pivotsOHLC(barsW, 4);
  const tW = dowTrend(pivW).trend;
  const tM = dowTrend(pivotsOHLC(barsM, 2)).trend;
  const consensus = tW === tM && tW !== "side"; // Tuần đồng thuận Tháng (thay vì Tuần~Ngày)

  const m50 = ma50[n - 1],
    m200 = ma200[n - 1];
  const lastRSI = rsiArr[n - 1] ?? 50,
    lastM = mac[n - 1];
  const bull = [
    tM === "up",
    tW === "up",
    m50 != null && last > m50,
    m50 != null && m200 != null && m50 > m200,
    lastRSI > 50,
    lastM.hist > 0,
  ].filter(Boolean).length;
  const bear = [
    tM === "down",
    tW === "down",
    m50 != null && last < m50,
    m50 != null && m200 != null && m50 < m200,
    lastRSI < 50,
    lastM.hist < 0,
  ].filter(Boolean).length;
  const biasPct = Math.round((bull / (bull + bear || 1)) * 100);
  const bias = biasPct >= 60 ? "up" : biasPct <= 40 ? "down" : "side";

  // R/S từ pivot High/Low Tuần THẬT.
  const overhead = pivW
    .filter((p) => p.type === "H" && p.price > last)
    .map((p) => p.price);
  const below = pivW
    .filter((p) => p.type === "L" && p.price < last)
    .map((p) => p.price);
  const R = overhead.length
    ? Math.min(...overhead)
    : Math.max(...highW.slice(-40));
  const S = below.length ? Math.max(...below) : Math.min(...lowW.slice(-40));
  const range = Math.max(R - S, 1e-9);

  const wH40 = highW.slice(-41, -1),
    wL40 = lowW.slice(-41, -1);
  const R40 = wH40.length ? Math.max(...wH40) : R;
  const S40 = wL40.length ? Math.min(...wL40) : S;
  let state = "IN_RANGE";
  if (last > R40) state = "RUN_UP";
  else if (last < S40) state = "RUN_DOWN";
  else if (Math.min(R - last, last - S) / range < 0.15) state = "NEAR_TRIGGER";

  const states = buildStates(barsW);
  const analog = analogProbabilities(barsW, states);
  const fibTargets = analogFibTargets(barsW, states, 60, 90);
  const rule = scanBreakoutRule(closes);
  const atr = atrOHLC(barsW, opts.atrPeriod);
  const volPct = ((atr[n - 1] ?? 0) / last) * 100;
  const _tp = touchProbabilities(barsW, closes, rsiArr, mac, atr, R, S, last, bias, opts.probHW || opts.probH || 20);
  const qb = quickPullbackBacktest(
    closes,
    bias === "down" ? "short" : "long",
    atr,
    opts.slMult,
    opts.riskPct
  );

  const prob = analog
    ? bias === "up"
      ? analog.pA
      : bias === "down"
      ? analog.pB
      : analog.pC
    : 50;
  const histRate =
    bias === "up"
      ? rule.up.rate
      : bias === "down"
      ? rule.down.rate
      : Math.round(((rule.up.rate ?? 50) + (rule.down.rate ?? 50)) / 2);
  const dist =
    bias === "up"
      ? R - last
      : bias === "down"
      ? last - S
      : Math.min(R - last, last - S);
  // Khoảng cách kiểu PULLBACK: ngược hướng với dist ở trên (Long → tới S, Short → tới R).
  // Chỉ để hiển thị tham khảo — điểm CMT vẫn dùng dist (breakout) như cũ.
  const distPullback =
    bias === "up"
      ? last - S
      : bias === "down"
      ? R - last
      : Math.min(R - last, last - S);
  // Đang sát trigger BREAKOUT hơn hay PULLBACK hơn (so 2 khoảng cách trên).
  const nearerTrigger =
    bias === "side" ? null : dist <= distPullback ? "breakout" : "pullback";
  const prox =
    state === "RUN_UP" || state === "RUN_DOWN"
      ? 100
      : Math.max(0, 100 * (1 - Math.min(1, (dist / range) * 2)));

  const evi = Math.abs(biasPct - 50) * 2;
  // Mục tiêu tối ưu (Fibonacci/pivot, >=90% xác suất lịch sử) theo ĐÚNG hướng
  // bias hiện tại - mult càng lớn (mục tiêu càng xa mà vẫn giữ ngưỡng tin
  // cậy) càng phản ánh dư địa lãi/rủi ro thật, không chỉ điểm cao suông.
  const fibPick =
    bias === "down" ? fibTargets?.down : bias === "up" ? fibTargets?.up : null;
  const fibScore = fibPick
    ? Math.min(100, fibPick.mult * 50)
    : _tp.t90
    ? Math.min(100, _tp.t90.mult * 50)
    : 0;
  const score = Math.round(
    0.2 * evi +
      0.2 * (prob ?? 50) +
      0.15 * (histRate ?? 50) +
      0.1 * prox +
      0.08 * (consensus ? 100 : 50) +
      0.27 * fibScore
  );

  // Cảnh báo MỀM: lệnh chiến lược (Tuần) đang breakout nhưng ngược xu hướng Tháng.
  // Không chặn — chỉ gắn cờ để người dùng tự cân nhắc.
  const conflict =
    (state === "RUN_UP" || state === "RUN_DOWN") &&
    tM !== "side" &&
    ((state === "RUN_UP" && tM === "down") ||
      (state === "RUN_DOWN" && tM === "up"));

  const row = {
    key: cfg.key,
    label: cfg.label,
    group: cfg.group,
    digits: cfg.digits,
    pip: cfg.pip,
    price: last,
    tfScale: "W",
    pTP: _tp.pTP,
    pR: _tp.pR,
    pS: _tp.pS,
    t90: _tp.t90,
    tM,
    tW,
    consensus,
    conflict,
    bias,
    biasPct,
    R,
    S,
    range,
    state,
    analog,
    rule,
    histRate,
    volPct,
    qb,
    prob,
    prox: Math.round(prox),
    fibTargets,
    fibScore: Math.round(fibScore),
    score,
    distPct: (Math.abs(dist) / last) * 100,
    distPullbackPct: (Math.abs(distPullback) / last) * 100,
    nearerTrigger,
    spark: closes.slice(-90).map((c, i) => ({ i, c })),
  };
  row.strategy = deriveStrategy(row);
  return row;
}

/* ============================================================
   BỘ SUY LUẬN CHIẾN LƯỢC — vị trí giá × xác suất 2 kịch bản cao nhất
   3 kịch bản: A phá lên · B phá xuống · C giữ biên.
   Nguyên tắc cốt lõi (theo ý người dùng): ở mép biên, nếu kịch bản
   "phá tiếp" xác suất THẤP thì fade ngược lại theo 2 kịch bản cao.
   ============================================================ */
// Bọc ngoài: thêm mức số (stop/TP) + cờ có thể vào lệnh ngay, để backtest & mini-chart dùng chung.
function deriveStrategy(row) {
  const st = deriveStrategyCore(row);
  const { R, S, range, state } = row;
  const buf = 0.12 * range;
  st.actionable = false;
  st.entryTrigger = "none";
  st.stopY = null;
  st.tp1Y = st.tps && st.tps[0] ? st.tps[0].y : null;
  st.tp2Y = st.tps && st.tps[1] ? st.tps[1].y : null;
  st.entryY = row.price;
  if (st.scen === "reject-R") {
    st.actionable = true;
    st.entryTrigger = "now";
    st.side = "short";
    st.stopY = R + buf;
  } else if (st.scen === "reject-S") {
    st.actionable = true;
    st.entryTrigger = "now";
    st.side = "long";
    st.stopY = S - buf;
  } else if (st.scen === "A" && state === "RUN_UP") {
    st.actionable = true;
    st.entryTrigger = "now";
    st.side = "long";
    st.stopY = R - buf;
  } else if (st.scen === "B" && state === "RUN_DOWN") {
    st.actionable = true;
    st.entryTrigger = "now";
    st.side = "short";
    st.stopY = S + buf;
  } else if (
    st.dir === "long-breakout" ||
    st.dir === "short-breakout" ||
    st.scen === "false-A" ||
    st.scen === "false-B"
  ) {
    st.entryTrigger = "break";
  }
  return st;
}

function deriveStrategyCore(row) {
  const {
    analog,
    R,
    S,
    range,
    price,
    digits,
    state,
    bias,
    biasPct,
    tM,
    tW,
    tD,
    pip,
    tfScale,
  } = row;
  const fx = (v) => v.toFixed(digits);
  const mid = (R + S) / 2;
  // Lệnh nhanh (D): trigger = nến Ngày, vào lệnh soi khung 4H.
  // Lệnh chiến lược (W): trigger = nến Tuần, vào lệnh soi khung Ngày.
  const tfBar = tfScale === "W" ? "W" : "D";
  const subBar = tfScale === "W" ? "D" : "4H";
  if (!analog)
    return {
      dir: "wait",
      conf: "thấp",
      title: "Chưa đủ dữ liệu xác suất analog",
      why: "Không đủ trạng thái lịch sử tương tự để tính A/B/C — chưa đưa lệnh.",
      entry: null,
      stop: null,
      tps: [],
      scen: null,
    };
  const { pA, pB, pC, n } = analog;
  const posInRange = Math.max(0, Math.min(1, (price - S) / range)); // 0=đáy biên(S) · 1=đỉnh biên(R)
  const nearR = state !== "RUN_UP" && state !== "RUN_DOWN" && posInRange >= 0.7;
  const nearS = state !== "RUN_UP" && state !== "RUN_DOWN" && posInRange <= 0.3;
  const ranked = [
    ["A", pA],
    ["B", pB],
    ["C", pC],
  ].sort((a, b) => b[1] - a[1]);
  const top = ranked[0][0],
    top2 = [ranked[0][0], ranked[1][0]];
  const spread = ranked[0][1] - ranked[2][1];
  // đồng thuận đa khung theo hướng
  const tfDown = [tM, tW, tD].filter((t) => t === "down").length;
  const tfUp = [tM, tW, tD].filter((t) => t === "up").length;
  const confOf = (aligned) =>
    n >= 40 && spread >= 25 && aligned
      ? "cao"
      : n >= 25 && spread >= 12
      ? "trung bình"
      : "thấp";

  const tpDown = (safe) =>
    safe
      ? { lbl: "TP1 (an toàn) = biên dưới S", y: S }
      : { lbl: "TP2 (mở rộng) = target B", y: S - 0.618 * range };
  const tpUp = (safe) =>
    safe
      ? { lbl: "TP1 (an toàn) = biên trên R", y: R }
      : { lbl: "TP2 (mở rộng) = target A", y: R + 0.618 * range };

  // ----- Đã phá biên (breakout đang chạy) -----
  if (state === "RUN_UP") {
    if (top === "A" || pA >= 40)
      return {
        dir: "long",
        conf: confOf(tfUp >= 2),
        title: "Tiếp diễn phá lên — mua khi giá hồi (pullback)",
        why: `Giá đã đóng trên biên và A (phá lên) vẫn là kịch bản cao (${pA}%). Không đuổi giá — chờ hồi về vùng ${fx(
          R
        )} rồi mua tiếp.`,
        entry: `Chờ ${subBar} hồi về retest ~${fx(R)} có nến từ chối giảm`,
        stop: `Đóng ${tfBar} lại dưới ${fx(R)} (false break)`,
        tps: [
          { lbl: "T1 = R + 0.618×biên", y: R + 0.618 * range },
          { lbl: "T2 = R + biên (measured)", y: R + range },
        ],
        scen: "A",
        side: "long",
      };
    return {
      dir: "caution",
      conf: "thấp",
      title: "Phá lên nhưng xác suất A thấp — cảnh giác false break",
      why: `Giá phá lên nhưng A chỉ ${pA}% trong khi ${
        top === "B" ? "B" : "C"
      } cao hơn — rủi ro bull-trap. Chỉ short khi giá ĐÓNG LẠI dưới ${fx(R)}.`,
      entry: `Chỉ hành động khi ${tfBar} đóng lại dưới ${fx(R)} → short`,
      stop: `Trên đỉnh vừa tạo`,
      tps: [tpDown(true), { lbl: "về giữa biên", y: mid }],
      scen: "false-A",
      side: "short",
    };
  }
  if (state === "RUN_DOWN") {
    if (top === "B" || pB >= 40)
      return {
        dir: "short",
        conf: confOf(tfDown >= 2),
        title: "Tiếp diễn phá xuống — bán khi giá hồi",
        why: `Giá đã đóng dưới biên và B (phá xuống) vẫn cao (${pB}%). Chờ hồi lên retest ~${fx(
          S
        )} rồi bán tiếp.`,
        entry: `Chờ ${subBar} hồi lên retest ~${fx(S)} có nến từ chối tăng`,
        stop: `Đóng ${tfBar} lại trên ${fx(S)}`,
        tps: [
          { lbl: "T1 = S − 0.618×biên", y: S - 0.618 * range },
          { lbl: "T2 = S − biên (measured)", y: S - range },
        ],
        scen: "B",
        side: "short",
      };
    return {
      dir: "caution",
      conf: "thấp",
      title: "Phá xuống nhưng xác suất B thấp — cảnh giác bear-trap",
      why: `Giá phá xuống nhưng B chỉ ${pB}% trong khi ${
        top === "A" ? "A" : "C"
      } cao hơn — rủi ro bẫy giảm. Chỉ long khi D đóng lại trên ${fx(S)}.`,
      entry: `Chỉ hành động khi ${tfBar} đóng lại trên ${fx(S)} → long`,
      stop: `Dưới đáy vừa tạo`,
      tps: [tpUp(true), { lbl: "về giữa biên", y: mid }],
      scen: "false-B",
      side: "long",
    };
  }

  // ----- Giá ở ĐỈNH biên (gần kháng cự R) -----
  if (nearR) {
    if (top === "A" && pA >= 45)
      return {
        dir: "long-breakout",
        conf: confOf(tfUp >= 2),
        title: "Chờ phá lên kháng cự — mua khi break xác nhận",
        why: `Giá ở kháng cự ${fx(
          R
        )} và A (phá lên) là kịch bản cao nhất (${pA}%). Kịch bản thuận: chờ D đóng trên R rồi mua.`,
        entry: `Mua khi ${tfBar} đóng trên ${fx(R)}`,
        stop: `Dưới ${fx(R)} sau khi phá`,
        tps: [tpUp(true), tpUp(false)],
        scen: "A",
        side: "long",
      };
    // A thấp, B/C cao → fade short tại kháng cự (đúng ví dụ người dùng)
    const bSafe = pB >= pC;
    return {
      dir: "short",
      conf: confOf(tfDown >= 1),
      title: "Fade kháng cự — SHORT (phá lên xác suất thấp)",
      why: `Giá chạm kháng cự ${fx(
        R
      )}. Đáng lẽ ở đây kỳ vọng phá lên (A) nhưng A chỉ ${pA}% — thấp; trong khi B ${pB}% và C ${pC}% đều cao. Nghĩa là nhiều khả năng bị từ chối và quay xuống → SHORT tại kháng cự.`,
      entry: `Short quanh ${fx(
        R
      )} khi ${subBar} có nến từ chối tăng / RSI quay xuống từ >70`,
      stop: `Đóng ${tfBar} trên ${fx(R)} (tức A kích hoạt → sai kèo, thoát)`,
      tps: [
        tpDown(true),
        pB >= 35 ? tpDown(false) : { lbl: "về giữa biên (C)", y: mid },
      ],
      note:
        pB >= pC
          ? `B (phá xuống) cao hơn C → có thể giữ đến target B ${fx(
              S - 0.618 * range
            )}; nhưng TP an toàn vẫn là biên dưới S ${fx(S)}.`
          : `C (giữ biên) cao hơn B → TP an toàn về giữa biên/biên dưới, đừng tham target B.`,
      scen: "reject-R",
      side: "short",
    };
  }

  // ----- Giá ở ĐÁY biên (gần hỗ trợ S) -----
  if (nearS) {
    if (top === "B" && pB >= 45)
      return {
        dir: "short-breakout",
        conf: confOf(tfDown >= 2),
        title: "Chờ phá xuống hỗ trợ — bán khi break xác nhận",
        why: `Giá ở hỗ trợ ${fx(
          S
        )} và B (phá xuống) cao nhất (${pB}%). Chờ D đóng dưới S rồi bán.`,
        entry: `Bán khi ${tfBar} đóng dưới ${fx(S)}`,
        stop: `Trên ${fx(S)} sau khi thủng`,
        tps: [tpDown(true), tpDown(false)],
        scen: "B",
        side: "short",
      };
    // B thấp, A/C cao → fade long tại hỗ trợ
    return {
      dir: "long",
      conf: confOf(tfUp >= 1),
      title: "Fade hỗ trợ — LONG (phá xuống xác suất thấp)",
      why: `Giá chạm hỗ trợ ${fx(
        S
      )}. Đáng lẽ kỳ vọng thủng xuống (B) nhưng B chỉ ${pB}% — thấp; A ${pA}% và C ${pC}% cao. Nhiều khả năng bật lên → LONG tại hỗ trợ.`,
      entry: `Long quanh ${fx(
        S
      )} khi ${subBar} có nến từ chối giảm / RSI quay lên từ <30`,
      stop: `Đóng ${tfBar} dưới ${fx(S)} (B kích hoạt → sai kèo)`,
      tps: [
        tpUp(true),
        pA >= 35 ? tpUp(false) : { lbl: "về giữa biên (C)", y: mid },
      ],
      note:
        pA >= pC
          ? `A (phá lên) cao hơn C → có thể giữ đến target A ${fx(
              R + 0.618 * range
            )}; TP an toàn vẫn là biên trên R ${fx(R)}.`
          : `C (giữ biên) cao hơn A → TP an toàn về giữa biên/biên trên.`,
      scen: "reject-S",
      side: "long",
    };
  }

  // ----- Giá GIỮA biên -----
  if (top === "C" || (pC >= pA && pC >= pB))
    return {
      dir: "wait",
      conf: "trung bình",
      title: "Giữa biên, C (đi ngang) cao — chờ giá tới mép",
      why: `Giá đang ở giữa biên (${Math.round(
        posInRange * 100
      )}% từ S→R) và C (giữ biên ${pC}%) là kịch bản cao nhất. Không fade ở giữa — chờ giá chạm ${fx(
        R
      )} (để short) hoặc ${fx(S)} (để long).`,
      entry: `Đặt cảnh báo tại ${fx(R)} và ${fx(S)}`,
      stop: null,
      tps: [
        { lbl: "Biên trên R", y: R },
        { lbl: "Biên dưới S", y: S },
      ],
      scen: "C",
      side: "none",
    };
  // giữa biên nhưng A hoặc B trội + TF thuận → nghiêng theo breakout sắp tới
  const dirUp = top === "A";
  return {
    dir: "wait",
    conf: "trung bình",
    title: `Giữa biên — nghiêng ${
      dirUp ? "phá lên (A)" : "phá xuống (B)"
    }, chờ điểm vào`,
    why: `Giữa biên nhưng ${dirUp ? "A" : "B"} trội (${
      dirUp ? pA : pB
    }%). Chưa có mép để fade; chờ giá về ${
      dirUp
        ? "hỗ trợ " + fx(S) + " để long theo A"
        : "kháng cự " + fx(R) + " để short theo B"
    }, hoặc chờ break xác nhận.`,
    entry: dirUp
      ? `Chờ hồi về ${fx(S)} rồi long, hoặc mua break trên ${fx(R)}`
      : `Chờ hồi lên ${fx(R)} rồi short, hoặc bán break dưới ${fx(S)}`,
    stop: null,
    tps: dirUp ? [tpUp(true), tpUp(false)] : [tpDown(true), tpDown(false)],
    scen: dirUp ? "A" : "B",
    side: dirUp ? "long" : "short",
  };
}

/* ============================================================
   8. THEME & COMPONENT NỀN
   ============================================================ */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
:root{--ink:#0d1322;--panel:#151d31;--panel2:#1a2440;--line:#273455;
--text:#dbe4f5;--mut:#8b9ab8;--dim:#5f6f8f;--bull:#3fd6a4;--bear:#ee6a5f;--amber:#e9b44c;--blue:#6ea8ff}
*{box-sizing:border-box}body{margin:0;background:var(--ink)}
.fxapp{min-height:100vh;background:var(--ink);color:var(--text);
font-family:'Archivo',system-ui,sans-serif;font-size:14px;line-height:1.45}
.mono{font-family:'IBM Plex Mono',monospace}
.topbar{display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid var(--line);
flex-wrap:wrap;position:sticky;top:0;background:rgba(13,19,34,.92);backdrop-filter:blur(6px);z-index:20}
.brand{font-weight:800;letter-spacing:.06em;font-size:15px}
.brand small{display:block;font-weight:500;color:var(--dim);letter-spacing:.14em;font-size:10px;text-transform:uppercase}
select.pair{background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;
padding:7px 10px;font-family:'IBM Plex Mono',monospace;font-size:14px;font-weight:600}
.tabs{display:flex;gap:6px;padding:10px 18px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.tab{background:transparent;border:1px solid var(--line);color:var(--mut);border-radius:10px;
padding:8px 15px;font:inherit;font-weight:700;font-size:13px;cursor:pointer}
.tab.on{background:var(--panel2);color:var(--blue);border-color:rgba(110,168,255,.45)}
.chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;
font-size:11.5px;font-weight:600;letter-spacing:.03em;border:1px solid var(--line)}
.chip.up{color:var(--bull);border-color:rgba(63,214,164,.4);background:rgba(63,214,164,.08)}
.chip.down{color:var(--bear);border-color:rgba(238,106,95,.4);background:rgba(238,106,95,.08)}
.chip.side{color:var(--amber);border-color:rgba(233,180,76,.4);background:rgba(233,180,76,.08)}
.chip.mut{color:var(--mut)}
.layout{display:flex;align-items:flex-start}
.rail{width:238px;flex:none;padding:16px 12px;border-right:1px solid var(--line);
position:sticky;top:57px;max-height:calc(100vh - 57px);overflow:auto}
.railhead{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim);padding:0 6px 10px}
.step{display:flex;gap:10px;width:100%;text-align:left;background:none;border:none;color:var(--text);
cursor:pointer;padding:10px 8px;border-radius:10px;font:inherit}
.step:hover{background:var(--panel)}.step.on{background:var(--panel2);outline:1px solid var(--line)}
.stepline{display:flex;flex-direction:column;align-items:center;flex:none}
.dot{width:11px;height:11px;border-radius:50%;border:2px solid var(--dim);margin-top:3px;flex:none}
.dot.up{border-color:var(--bull);background:rgba(63,214,164,.35)}
.dot.down{border-color:var(--bear);background:rgba(238,106,95,.35)}
.dot.side{border-color:var(--amber);background:rgba(233,180,76,.3)}
.vline{width:2px;flex:1;min-height:22px;background:var(--line);margin-top:2px}
.steptitle{font-weight:700;font-size:13px}.stepsub{color:var(--mut);font-size:11px;margin-top:2px}
.confl{margin-top:14px;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--panel)}
.confl b{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
.main{flex:1;min-width:0;padding:18px;display:flex;flex-direction:column;gap:16px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px}
.panel h3{margin:0 0 4px;font-size:15px;font-weight:700}
.panel h3 .mod{color:var(--dim);font-size:10px;letter-spacing:.16em;text-transform:uppercase;display:block;margin-bottom:3px}
.sub{color:var(--mut);font-size:12.5px;margin:0 0 12px}
.warn{display:flex;gap:8px;align-items:flex-start;background:rgba(233,180,76,.08);
border:1px solid rgba(233,180,76,.35);border-radius:10px;padding:9px 11px;font-size:12px;color:var(--amber);margin:10px 0}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
table.tbl{width:100%;border-collapse:collapse;font-size:12.5px}
.tbl th{text-align:left;color:var(--dim);font-weight:600;font-size:10.5px;letter-spacing:.1em;
text-transform:uppercase;padding:6px 8px;border-bottom:1px solid var(--line);white-space:nowrap}
.tbl td{padding:7px 8px;border-bottom:1px solid rgba(39,52,85,.5)}
.tbl tr.hot{background:rgba(110,168,255,.06)}
.num{font-family:'IBM Plex Mono',monospace;font-size:12px}
.bt{background:var(--panel2);border:1px solid var(--line);color:var(--blue);border-radius:8px;
padding:6px 11px;font:inherit;font-size:12px;font-weight:600;cursor:pointer}
.bt:hover{border-color:var(--blue)}
.kv{display:flex;justify-content:space-between;gap:10px;padding:5px 0;font-size:12.5px;
border-bottom:1px dashed rgba(39,52,85,.6)}
.kv span:first-child{color:var(--mut)}
.scen{border:1px solid var(--line);border-radius:12px;padding:12px;margin-bottom:10px;background:var(--panel2)}
.prob{font-family:'IBM Plex Mono',monospace;font-weight:600;color:var(--blue)}
.rule{font-size:12px;display:flex;gap:7px;align-items:center;padding:2px 0}
.ok{color:var(--bull)}.no{color:var(--bear)}
input.inp{background:var(--panel2);border:1px solid var(--line);color:var(--text);border-radius:8px;
padding:7px 9px;font-family:'IBM Plex Mono',monospace;font-size:13px;width:100%}
label.lb{display:block;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin:0 0 4px}
.foot{padding:14px 18px;color:var(--dim);font-size:11.5px}
.matcell{padding:6px 8px;text-align:center;font-family:'IBM Plex Mono',monospace;font-size:12px;border-radius:6px}
.fnote{margin-top:10px;padding:9px 11px;border-left:2px solid var(--line);background:rgba(39,52,85,.25);border-radius:0 8px 8px 0;font-size:11.5px;color:var(--mut);line-height:1.55}
.fnote b{color:var(--text);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;display:block;margin-bottom:3px}
.loading{display:flex;flex-direction:column;align-items:center;gap:14px;padding:80px 20px;color:var(--mut)}
.spin{width:28px;height:28px;border-radius:50%;border:3px solid var(--line);border-top-color:var(--blue);
animation:sp 0.9s linear infinite}
.scorebar{height:5px;border-radius:3px;background:var(--line);overflow:hidden;min-width:52px}
.scorebar i{display:block;height:100%;background:linear-gradient(90deg,#6ea8ff,#3fd6a4)}
@keyframes sp{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.spin{animation-duration:2.5s}}
@media(max-width:900px){.layout{flex-direction:column}
.rail{width:100%;position:static;max-height:none;display:flex;gap:4px;overflow-x:auto;
border-right:none;border-bottom:1px solid var(--line);padding:10px}
.railhead,.vline,.confl{display:none}.step{flex:none;width:auto;padding:8px 10px}
.stepsub{display:none}.grid2,.grid3{grid-template-columns:1fr}}
`;

const TT = {
  background: "#1a2440",
  border: "1px solid #273455",
  borderRadius: 8,
  fontSize: 12,
};
const CLR = {
  bull: "#3fd6a4",
  bear: "#ee6a5f",
  amber: "#e9b44c",
  blue: "#6ea8ff",
  mut: "#8b9ab8",
  dim: "#5f6f8f",
  line: "#273455",
  text: "#dbe4f5",
};

const Chip = ({ cls, children }) => (
  <span className={`chip ${cls}`}>{children}</span>
);
const Warn = ({ children }) => (
  <div className="warn">
    <span>⚠</span>
    <span>{children}</span>
  </div>
);
const Panel = ({ mod, title, sub, children }) => (
  <section className="panel">
    <h3>
      <span className="mod">{mod}</span>
      {title}
    </h3>
    {sub && <p className="sub">{sub}</p>}
    {children}
  </section>
);
// Dải hiển thị lệnh 3 khung D/W/M: D phụ thuộc W, W phụ thuộc M (cảnh báo mềm — không chặn lệnh).
function GateCascadeStrip({ gates }) {
  if (!gates) return null;
  const order = ["M", "W", "D", "H4", "H1"];
  const tfName = { M: "Tháng", W: "Tuần", D: "Ngày", H4: "4H", H1: "1H" };
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        alignItems: "center",
        marginBottom: 10,
      }}
    >
      <span style={{ fontSize: 11, color: CLR.mut }}>
        Lệnh theo khung (mỗi khung con phụ thuộc khung cha — cảnh báo mềm):
      </span>
      {order.map((k) => {
        const g = gates[k];
        if (!g) return null;
        const cls = !g.active ? "side" : g.dir === "long" ? "up" : "down";
        const warn = !!(g.conflict || g.conflictW);
        return (
          <Chip key={k} cls={cls}>
            {warn ? "⚠ " : ""}
            {tfName[k]}:{" "}
            {!g.active ? "đi ngang" : g.dir === "long" ? "LONG" : "SHORT"}
          </Chip>
        );
      })}
    </div>
  );
}
const fmtMoney = (v) =>
  v == null || !isFinite(v)
    ? "—"
    : "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
const pipTxt = (v) =>
  v == null || !isFinite(v) ? "—" : (v >= 0 ? "+" : "") + v.toFixed(1) + " pip";

function PriceChart({
  dates,
  closes,
  digits,
  height = 300,
  dots = null,
  refLines = null,
}) {
  const data = closes.map((c, i) => ({ i, d: dates[i], c }));
  const fmt = (v) => Number(v).toFixed(digits);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart
        data={data}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
      >
        <CartesianGrid
          stroke={CLR.line}
          strokeDasharray="2 4"
          vertical={false}
        />
        <XAxis
          dataKey="d"
          tick={{ fill: CLR.dim, fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: CLR.line }}
          minTickGap={50}
          tickFormatter={(d) => (d ? d.slice(5) : "")}
        />
        <YAxis
          domain={["auto", "auto"]}
          tick={{ fill: CLR.dim, fontSize: 10, fontFamily: "IBM Plex Mono" }}
          tickFormatter={fmt}
          width={64}
          tickLine={false}
          axisLine={false}
          orientation="right"
        />
        <Tooltip
          contentStyle={TT}
          labelStyle={{ color: CLR.mut }}
          formatter={(v) => [fmt(v), "Giá"]}
        />
        <Line
          dataKey="c"
          stroke={CLR.blue}
          dot={false}
          strokeWidth={1.7}
          isAnimationActive={false}
        />
        {refLines}
        {dots}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* ============================================================
   9. TRANG BỘ LỌC (mặc định)
   ============================================================ */

const STATE_LABEL = {
  RUN_UP: { t: "Đang chạy ↑", c: "up" },
  RUN_DOWN: { t: "Đang chạy ↓", c: "down" },
  NEAR_TRIGGER: { t: "Sát trigger", c: "side" },
  IN_RANGE: { t: "Trong biên", c: "mut" },
};
// Nhãn trạng thái + ghi rõ đang sát trigger BREAKOUT hay PULLBACK hơn (chỉ áp dụng
// khi NEAR_TRIGGER và có bias rõ ràng; RUN_UP/RUN_DOWN đã tự thân là breakout rồi).
function stateLabelText(row) {
  const base = STATE_LABEL[row.state].t;
  if (row.state !== "NEAR_TRIGGER" || !row.nearerTrigger) return base;
  return `${base} (${
    row.nearerTrigger === "breakout" ? "breakout" : "pullback"
  })`;
}

const DIR_META = {
  short: { t: "SHORT", c: CLR.bear },
  long: { t: "LONG", c: CLR.bull },
  "short-breakout": { t: "SHORT (chờ break)", c: CLR.bear },
  "long-breakout": { t: "LONG (chờ break)", c: CLR.bull },
  caution: { t: "CẢNH GIÁC", c: CLR.amber },
  wait: { t: "CHỜ", c: CLR.mut },
};

// Mini chart: giá gần đây + quỹ đạo minh hoạ của 2 kịch bản xác suất cao nhất (gộp 1 chart).
function StrategyMiniChart({ row }) {
  const { R, S, range, price, digits, analog, spark } = row;
  const hist = (spark || []).slice(-45).map((p, i) => ({ x: i, c: p.c }));
  const base = hist.length;
  const F = 16,
    mid = (R + S) / 2;
  const scen = { A: analog?.pA ?? 0, B: analog?.pB ?? 0, C: analog?.pC ?? 0 };
  const top2 = Object.entries(scen)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map((e) => e[0]);
  const wpsFor = (k) => {
    if (k === "A")
      return [
        [0, price],
        [4, R],
        [9, R + 0.618 * range],
        [F, R + range],
      ];
    if (k === "B")
      return [
        [0, price],
        [4, S],
        [9, S - 0.618 * range],
        [F, S - range],
      ];
    const nearTop = price > mid;
    return [
      [0, price],
      [5, nearTop ? mid : mid],
      [10, nearTop ? S + 0.15 * range : R - 0.15 * range],
      [F, mid],
    ];
  };
  const interp = (wps, t) => {
    for (let w = 1; w < wps.length; w++) {
      const [t0, v0] = wps[w - 1],
        [t1, v1] = wps[w];
      if (t <= t1) return v0 + (v1 - v0) * ((t - t0) / (t1 - t0 || 1));
    }
    return wps[wps.length - 1][1];
  };
  const data = hist.map((h) => ({ ...h }));
  const wA = wpsFor(top2[0]),
    wB = wpsFor(top2[1]);
  data[base - 1] = { ...data[base - 1], s0: price, s1: price };
  for (let t = 1; t <= F; t++)
    data.push({ x: base - 1 + t, s0: interp(wA, t), s1: interp(wB, t) });
  const colOf = (k) =>
    k === "A" ? CLR.bull : k === "B" ? CLR.bear : CLR.amber;
  const nameOf = (k) =>
    k === "A" ? "A · phá lên" : k === "B" ? "B · phá xuống" : "C · giữ biên";
  const fx = (v) => Number(v).toFixed(digits);
  const allY = [...hist.map((h) => h.c), R, S, R + range, S - range].filter(
    (v) => isFinite(v)
  );
  const yMin = Math.min(...allY) - range * 0.1,
    yMax = Math.max(...allY) + range * 0.1;
  return (
    <div>
      <div style={{ width: "100%", height: 190 }}>
        <ResponsiveContainer>
          <ComposedChart
            data={data}
            margin={{ top: 6, right: 10, bottom: 0, left: 0 }}
          >
            <CartesianGrid
              stroke={CLR.line}
              strokeDasharray="2 4"
              vertical={false}
            />
            <XAxis dataKey="x" type="number" domain={[0, base - 1 + F]} hide />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fill: CLR.dim, fontSize: 9, fontFamily: "IBM Plex Mono" }}
              tickFormatter={fx}
              width={58}
              tickLine={false}
              axisLine={false}
              orientation="right"
            />
            <Tooltip
              contentStyle={TT}
              formatter={(v, nm) => [
                fx(v),
                nm === "c"
                  ? "Giá"
                  : nm === "s0"
                  ? nameOf(top2[0])
                  : nameOf(top2[1]),
              ]}
              labelFormatter={() => ""}
            />
            <ReferenceLine
              y={R}
              stroke={CLR.bear}
              strokeDasharray="4 3"
              label={{
                value: `R ${fx(R)}`,
                fill: CLR.bear,
                fontSize: 9,
                position: "insideTopLeft",
              }}
            />
            <ReferenceLine
              y={S}
              stroke={CLR.bull}
              strokeDasharray="4 3"
              label={{
                value: `S ${fx(S)}`,
                fill: CLR.bull,
                fontSize: 9,
                position: "insideBottomLeft",
              }}
            />
            <ReferenceLine
              x={base - 1}
              stroke={CLR.line}
              label={{
                value: "nay",
                fill: CLR.dim,
                fontSize: 9,
                position: "insideTop",
              }}
            />
            <Line
              dataKey="c"
              stroke={CLR.blue}
              dot={false}
              strokeWidth={1.7}
              isAnimationActive={false}
            />
            <Line
              dataKey="s0"
              stroke={colOf(top2[0])}
              dot={false}
              strokeWidth={2.2}
              strokeDasharray="7 4"
              isAnimationActive={false}
              connectNulls
            />
            <Line
              dataKey="s1"
              stroke={colOf(top2[1])}
              dot={false}
              strokeWidth={1.6}
              strokeDasharray="3 5"
              isAnimationActive={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div
        style={{
          display: "flex",
          gap: 12,
          justifyContent: "center",
          fontSize: 11,
          marginTop: 2,
        }}
      >
        <span style={{ color: colOf(top2[0]) }}>
          ━ {nameOf(top2[0])} ({scen[top2[0]]}%)
        </span>
        <span style={{ color: colOf(top2[1]) }}>
          ┄ {nameOf(top2[1])} ({scen[top2[1]]}%)
        </span>
      </div>
    </div>
  );
}

function StrategyModal({ row, onClose, onOpenCMT }) {
  const s = row.strategy;
  const fx = (v) => (v == null ? "—" : v.toFixed(row.digits));
  const a = row.analog;
  const posPct = Math.max(
    0,
    Math.min(100, ((row.price - row.S) / (row.range || 1e-9)) * 100)
  );
  const dm = DIR_META[s.dir] || DIR_META.wait;
  const sug = (() => {
    if (!s || (s.dir !== "long" && s.dir !== "short")) return null;
    const long = s.dir === "long";
    const entry = row.price;
    const sl = long ? row.S - row.range * 0.18 : row.R + row.range * 0.18;
    // TP = T90 (mốc ~90% giá chạm tới) nếu có; nếu không, mới rơi về pivot/tp1Y.
    const useT90 = row.t90 && (long ? row.t90.level > entry : row.t90.level < entry);
    const tp = useT90 ? row.t90.level : s.tp1Y != null ? s.tp1Y : long ? row.R : row.S;
    const rk = Math.abs(entry - sl), rw = Math.abs(tp - entry);
    const rr = rk > 0 ? rw / rk : 0;
    // T90 vốn gần → KHÔNG chặn theo RR; chỉ cần đúng hướng.
    const ok = long ? tp > entry : tp < entry;
    return { long, entry, sl, tp, rr, ok, useT90, t90prob: row.t90 ? row.t90.prob : null, t90time: row.t90 ? (row.t90.time90Ana ?? row.t90.time90All) : null };
  })();
  const scenBar = (label, val, color) => (
    <div style={{ marginBottom: 6 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11.5,
          marginBottom: 2,
        }}
      >
        <span style={{ color: CLR.mut }}>{label}</span>
        <span className="num" style={{ color }}>
          {val}%
        </span>
      </div>
      <div
        style={{
          height: 6,
          background: CLR.line,
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div style={{ width: `${val}%`, height: "100%", background: color }} />
      </div>
    </div>
  );
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(6,10,20,.72)",
        backdropFilter: "blur(3px)",
        zIndex: 100,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "40px 16px",
        overflow: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#151d31",
          border: `1px solid ${CLR.line}`,
          borderRadius: 16,
          maxWidth: 560,
          width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,.5)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: `1px solid ${CLR.line}`,
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>
              {row.label}{" "}
              <span
                className="num"
                style={{ color: CLR.mut, fontWeight: 500, fontSize: 13 }}
              >
                {fx(row.price)}
              </span>
            </div>
            <div
              style={{
                fontSize: 10.5,
                letterSpacing: ".14em",
                textTransform: "uppercase",
                color: CLR.dim,
              }}
            >
              Thẻ{" "}
              {row.tfScale === "W" ? "chiến lược (Tuần)" : "chiến lược nhanh"}
            </div>
          </div>
          <button className="bt" onClick={onClose}>
            ✕
          </button>
        </div>

        <div style={{ padding: 18 }}>
          {sug && (
            <div
              style={{
                marginBottom: 14,
                padding: 12,
                borderRadius: 10,
                border: `1px solid ${sug.ok ? (sug.long ? CLR.bull : CLR.bear) : CLR.line}`,
                background: "rgba(255,255,255,.02)",
              }}
            >
              <div style={{ fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", color: CLR.dim, marginBottom: 6 }}>
                Đề nghị vào lệnh
              </div>
              {sug.ok ? (
                <>
                  <div style={{ fontWeight: 800, color: sug.long ? CLR.bull : CLR.bear, marginBottom: 6 }}>
                    {sug.long ? "MUA" : "BÁN"} · R:R ≈ {sug.rr.toFixed(1)}
                  </div>
                  <div className="kv" style={{ border: "none", padding: "2px 0" }}>
                    <span>Vùng vào (tham chiếu)</span>
                    <span className="num">{fx(sug.entry)}</span>
                  </div>
                  <div className="kv" style={{ border: "none", padding: "2px 0" }}>
                    <span>Dừng lỗ</span>
                    <span className="num" style={{ color: CLR.amber }}>{fx(sug.sl)}</span>
                  </div>
                  <div className="kv" style={{ border: "none", padding: "2px 0" }}>
                    <span>
                      {sug.useT90
                        ? `Chốt lời — T90 (~${sug.t90prob}% chạm, 90% trong ≤${sug.t90time == null ? "?" : sug.t90time} phiên)`
                        : "Chốt lời (TP1)"}
                    </span>
                    <span className="num" style={{ color: CLR.bull }}>{fx(sug.tp)}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: CLR.mut, marginTop: 6 }}>
                    Khi nào vào:{" "}
                    {sug.long
                      ? `chờ giá bật lên từ hỗ trợ và ĐÓNG một nến ${row.tfScale === "W" ? "Ngày" : "4H"} xanh trên ${fx(row.S)}`
                      : `chờ giá bị đẩy xuống từ kháng cự và ĐÓNG một nến ${row.tfScale === "W" ? "Ngày" : "4H"} đỏ dưới ${fx(row.R)}`}
                    {" "}rồi mới vào; nếu giá đi ngược qua Dừng lỗ thì huỷ kèo.
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: CLR.mut }}>
                  Chưa thuận lợi để vào (tỷ lệ lời/lỗ thấp hoặc chưa rõ hướng) — đứng ngoài, chờ giá về gần hỗ trợ/kháng cự cho R:R tốt hơn.
                </div>
              )}
            </div>
          )}
          {row.pTP != null && (
            <div style={{ marginBottom: 14, display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div className="sub" style={{ margin: 0 }}>P chạm TP</div>
                <div
                  className="num"
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    color: row.pTP >= 60 ? CLR.bull : row.pTP >= 40 ? CLR.amber : CLR.bear,
                  }}
                >
                  {row.pTP}%
                </div>
              </div>
              <div>
                <div className="sub" style={{ margin: 0 }}>P chạm R</div>
                <div className="num" style={{ fontSize: 18, fontWeight: 700 }}>{row.pR == null ? "—" : row.pR + "%"}</div>
              </div>
              <div>
                <div className="sub" style={{ margin: 0 }}>P chạm S</div>
                <div className="num" style={{ fontSize: 18, fontWeight: 700 }}>{row.pS == null ? "—" : row.pS + "%"}</div>
              </div>
            </div>
          )}
          {row.t90 && (
            <div
              style={{
                marginBottom: 14,
                padding: 12,
                borderRadius: 10,
                border: `1px solid ${CLR.bull}`,
                background: "rgba(63,214,164,.06)",
              }}
            >
              <div className="sub" style={{ margin: "0 0 4px" }}>
                T90 — mục tiêu ~90% giá sẽ CHẠM tới
              </div>
              <div className="num" style={{ fontSize: 19, fontWeight: 800, color: CLR.bull }}>
                {fx(row.t90.level)}{" "}
                <span style={{ fontSize: 12, color: CLR.dim, fontWeight: 600 }}>
                  ({row.t90.distPct.toFixed(2)}% · {row.t90.mult}·ATR · P={row.t90.prob}%)
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: CLR.dim, marginTop: 7, display: "flex", gap: 14, flexWrap: "wrap" }}>
                <span>
                  Time90 (analog, n={row.t90.nAna || "—"}):{" "}
                  <b style={{ color: CLR.text }}>{row.t90.time90Ana == null ? "—" : "≤" + row.t90.time90Ana + " phiên"}</b>
                </span>
                <span>
                  Time90 (toàn LS, n={row.t90.nAll || "—"}):{" "}
                  <b style={{ color: CLR.text }}>{row.t90.time90All == null ? "—" : "≤" + row.t90.time90All + " phiên"}</b>
                </span>
                <span style={{ color: CLR.mut }}>trung vị {row.t90.bars == null ? "—" : row.t90.bars + " phiên"}</span>
              </div>
              <div style={{ fontSize: 11.5, color: CLR.mut, marginTop: 5 }}>
                Time90 = 90% số lần ĐÃ chạm T90 xong trong ngần ấy phiên (bỏ các lần không chạm). Analog = chỉ tính trên phiên giống hiện tại (ít mẫu, nhất là khung Tuần); toàn LS = nhiều mẫu nhưng loãng điều kiện.
              </div>
            </div>
          )}
          {/* Vị trí giá trong biên */}
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 11,
                color: CLR.mut,
                marginBottom: 4,
              }}
            >
              <span>Hỗ trợ S {fx(row.S)}</span>
              <span>Vị trí giá trong biên</span>
              <span>Kháng cự R {fx(row.R)}</span>
            </div>
            <div
              style={{
                position: "relative",
                height: 10,
                background:
                  "linear-gradient(90deg,rgba(63,214,164,.25),rgba(233,180,76,.15),rgba(238,106,95,.25))",
                borderRadius: 5,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: `calc(${posPct}% - 6px)`,
                  top: -3,
                  width: 12,
                  height: 16,
                  background: CLR.text,
                  borderRadius: 3,
                  border: "2px solid #151d31",
                }}
              />
            </div>
            <div
              style={{
                textAlign: "center",
                fontSize: 11,
                color: CLR.mut,
                marginTop: 4,
              }}
            >
              {Math.round(posPct)}% từ S → R ·{" "}
              <Chip cls={STATE_LABEL[row.state].c}>{stateLabelText(row)}</Chip>
            </div>
          </div>

          {/* Mini chart: 2 kịch bản lớn nhất gộp 1 chart */}
          <div
            style={{
              background: "#1a2440",
              border: `1px solid ${CLR.line}`,
              borderRadius: 12,
              padding: "10px 12px 6px",
              marginBottom: 14,
            }}
          >
            <div style={{ fontSize: 11, color: CLR.mut, marginBottom: 4 }}>
              Hướng đi 2 kịch bản xác suất cao nhất (minh hoạ)
            </div>
            <StrategyMiniChart row={row} />
          </div>

          {/* Xác suất 3 kịch bản */}
          <div
            style={{
              background: "#1a2440",
              border: `1px solid ${CLR.line}`,
              borderRadius: 12,
              padding: 12,
              marginBottom: 14,
            }}
          >
            <div style={{ fontSize: 11, color: CLR.mut, marginBottom: 8 }}>
              Xác suất 3 kịch bản (analog lịch sử{a ? `, n=${a.n}` : ""})
            </div>
            {a ? (
              <>
                {scenBar("A · Phá lên trên R", a.pA, CLR.bull)}
                {scenBar("B · Thủng xuống dưới S", a.pB, CLR.bear)}
                {scenBar("C · Giữ trong biên", a.pC, CLR.amber)}
              </>
            ) : (
              <div className="sub">Chưa đủ dữ liệu analog.</div>
            )}
          </div>

          {/* LỆNH ĐỀ XUẤT */}
          <div
            style={{
              border: `1px solid ${dm.c}44`,
              background: `${dm.c}0f`,
              borderRadius: 12,
              padding: 14,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
                marginBottom: 8,
              }}
            >
              <span style={{ fontWeight: 800, fontSize: 15, color: dm.c }}>
                {dm.t}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{s.title}</span>
              <span
                style={{ marginLeft: "auto", fontSize: 11, color: CLR.mut }}
              >
                Độ tin:{" "}
                <b
                  style={{
                    color:
                      s.conf === "cao"
                        ? CLR.bull
                        : s.conf === "trung bình"
                        ? CLR.amber
                        : CLR.mut,
                  }}
                >
                  {s.conf}
                </b>
              </span>
            </div>
            <p
              style={{
                margin: "0 0 10px",
                fontSize: 13,
                lineHeight: 1.55,
                color: "#c9d3e6",
              }}
            >
              {s.why}
            </p>
            <div style={{ display: "grid", gap: 6 }}>
              {s.entry && (
                <div
                  className="kv"
                  style={{ border: "none", padding: "3px 0" }}
                >
                  <span>Điểm vào</span>
                  <span style={{ textAlign: "right", maxWidth: "62%" }}>
                    {s.entry}
                  </span>
                </div>
              )}
              {s.stop && (
                <div
                  className="kv"
                  style={{ border: "none", padding: "3px 0" }}
                >
                  <span>Dừng lỗ / vô hiệu</span>
                  <span
                    style={{
                      textAlign: "right",
                      maxWidth: "62%",
                      color: CLR.amber,
                    }}
                  >
                    {s.stop}
                  </span>
                </div>
              )}
              {s.tps &&
                s.tps.map((tp, i) => (
                  <div
                    key={i}
                    className="kv"
                    style={{ border: "none", padding: "3px 0" }}
                  >
                    <span>
                      {tp.lbl.includes("=")
                        ? tp.lbl.split("=")[0].trim()
                        : "Mục tiêu"}
                    </span>
                    <span
                      className="num"
                      style={{ color: i === 0 ? CLR.bull : CLR.blue }}
                    >
                      {tp.y != null ? fx(tp.y) : ""}{" "}
                      {tp.lbl.includes("=")
                        ? `(${tp.lbl.split("=")[1].trim()})`
                        : tp.lbl}
                    </span>
                  </div>
                ))}
            </div>
            {s.note && (
              <p
                style={{
                  margin: "10px 0 0",
                  fontSize: 11.5,
                  color: CLR.mut,
                  borderLeft: `2px solid ${CLR.line}`,
                  paddingLeft: 8,
                }}
              >
                {s.note}
              </p>
            )}
          </div>

          <div
            style={{
              fontSize: 11,
              color: CLR.dim,
              marginBottom: 14,
              lineHeight: 1.5,
            }}
          >
            Đa khung: M {trendVN[row.tM]?.toLowerCase()} · W{" "}
            {trendVN[row.tW]?.toLowerCase()}
            {row.tfScale === "W"
              ? ""
              : ` · D ${trendVN[row.tD]?.toLowerCase()}`}
            . Đây là gợi ý dựa trên vị trí giá + xác suất lịch sử, KHÔNG phải
            khuyến nghị đầu tư; giá là ECB close nên trong phiên có thể lệch.
            Vào lệnh thật cần xác nhận ở khung{" "}
            {row.tfScale === "W" ? "Ngày" : "4H"}.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="bt"
              style={{
                borderColor: CLR.blue,
                color: CLR.text,
                fontWeight: 700,
              }}
              onClick={onOpenCMT}
            >
              Mở phân tích CMT đầy đủ →
            </button>
            <button className="bt" onClick={onClose}>
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScreenerSection({ rows, openPair, scope = "fast" }) {
  const [sortKey, setSortKey] = useState("ptp");
  const [onlyHighP, setOnlyHighP] = useState(true);
  const [onlyRunning, setOnlyRunning] = useState(false);
  const [stratRow, setStratRow] = useState(null);
  const isStrategic = scope === "strategic";
  const secondTFKey = isStrategic ? "tM" : "tD";
  const secondTFLabel = isStrategic ? "M" : "D";
  const barUnit = isStrategic ? "tuần" : "phiên";
  const view = useMemo(() => {
    let r = [...rows];
    if (onlyRunning)
      r = r.filter(
        (x) =>
          x.state === "RUN_UP" ||
          x.state === "RUN_DOWN" ||
          x.state === "NEAR_TRIGGER"
      );
    if (onlyHighP) r = r.filter((x) => x.pTP == null || x.pTP >= 60);
    const get = {
      ptp: (x) => x.pTP ?? -1,
      score: (x) => x.score,
      prob: (x) => x.prob ?? 0,
      evi: (x) => Math.abs(x.biasPct - 50),
      hist: (x) => x.histRate ?? 0,
      vol: (x) => -x.volPct,
      fib: (x) => x.fibScore ?? 0,
    };
    return r.sort((a, b) => get[sortKey](b) - get[sortKey](a));
  }, [rows, sortKey, onlyRunning, onlyHighP]);
  const top = view[0];
  const dirC = (b) => (b === "up" ? "up" : b === "down" ? "down" : "side");
  const dirT = (b) =>
    b === "up" ? "Tăng" : b === "down" ? "Giảm" : "Đi ngang";

  return (
    <>
      <Panel
        mod={
          isStrategic
            ? "Bộ lọc · Lệnh chiến lược (Tuần)"
            : "Bộ lọc · Lệnh nhanh (Ngày)"
        }
        title={
          isStrategic
            ? "Cặp nào đáng giữ lệnh dài hơi (khung Tuần)?"
            : "Cặp nào xác suất cao và đang chạy?"
        }
        sub={
          isStrategic
            ? "Xếp hạng 21 cặp bằng ĐIỂM CMT đo trên khung TUẦN (mỗi phiên = 1 tuần đóng cửa): 20% cán cân bằng chứng 5 lớp · 20% xác suất analog lịch sử cùng hướng · 15% tỷ lệ đạt T1 của quy tắc breakout tuần · 10% khoảng cách tới trigger BREAKOUT (cột riêng, không phải pullback) · 8% đồng thuận Tuần/Tháng · 27% mục tiêu tối ưu Fibonacci/pivot (mức xa nhất vẫn ≥90% xác suất lịch sử chạm được — phạt các cặp chỉ có mức rất gần mới đạt ngưỡng, tức dư địa lãi/rủi ro kém). Tháng không tự chặn lệnh — chỉ gắn cờ ⚠ cảnh báo mềm khi Tuần breakout ngược xu hướng Tháng, người dùng tự quyết. Đây là lệnh CHIẾN LƯỢC — giữ dài hơi hơn lệnh nhanh."
            : "Xếp hạng 21 cặp bằng ĐIỂM CMT: 20% cán cân bằng chứng 5 lớp · 20% xác suất analog lịch sử cùng hướng · 15% tỷ lệ đạt T1 của quy tắc breakout · 10% khoảng cách tới trigger BREAKOUT (cột riêng, không phải pullback) · 8% đồng thuận tuần/ngày · 27% mục tiêu tối ưu Fibonacci/pivot (mức xa nhất vẫn ≥90% xác suất lịch sử chạm được — phạt các cặp chỉ có mức rất gần mới đạt ngưỡng, tức dư địa lãi/rủi ro kém). Cột biến động chỉ để tham chiếu, không tính điểm. Đây là lệnh NHANH (khung Ngày) — xem thêm bộ lọc Lệnh chiến lược (Tuần) để đối chiếu trước khi vào lệnh."
        }
      >
        {top && (
          <div className="grid3" style={{ marginBottom: 12 }}>
            <div className="scen" style={{ margin: 0 }}>
              <b>Đứng đầu: {top.label}</b>
              <div className="kv">
                <span>Điểm CMT</span>
                <span className="num">{top.score}/100</span>
              </div>
              <div className="kv">
                <span>Hướng bằng chứng</span>
                <span className="num">
                  {dirT(top.bias)} ({top.biasPct}%)
                </span>
              </div>
              <div className="kv" style={{ border: "none" }}>
                <span>Trạng thái</span>
                <span>
                  <Chip cls={STATE_LABEL[top.state].c}>
                    {stateLabelText(top)}
                  </Chip>
                </span>
              </div>
            </div>
            <div className="scen" style={{ margin: 0 }}>
              <b>Xác suất analog (20 {barUnit} tới)</b>
              {top.analog ? (
                <>
                  <div className="kv">
                    <span>Phá lên biên trước</span>
                    <span className="num" style={{ color: CLR.bull }}>
                      {top.analog.pA}%
                    </span>
                  </div>
                  <div className="kv">
                    <span>Thủng biên trước</span>
                    <span className="num" style={{ color: CLR.bear }}>
                      {top.analog.pB}%
                    </span>
                  </div>
                  <div className="kv" style={{ border: "none" }}>
                    <span>Vẫn kẹt trong biên</span>
                    <span className="num" style={{ color: CLR.amber }}>
                      {top.analog.pC}% (n={top.analog.n})
                    </span>
                  </div>
                </>
              ) : (
                <p className="sub" style={{ margin: "6px 0 0" }}>
                  Chưa đủ trạng thái tương tự trong lịch sử.
                </p>
              )}
            </div>
            <div className="scen" style={{ margin: 0 }}>
              <b>Sắp xếp & lọc</b>
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  margin: "8px 0",
                }}
              >
                {[
                  ["ptp", "P(chạm TP)"],
                  ["score", "Điểm CMT"],
                  ["prob", "Xác suất"],
                  ["evi", "Bằng chứng"],
                  ["hist", "Lịch sử"],
                  ["fib", "Mục tiêu tối ưu"],
                  ["vol", "Ít biến động"],
                ].map(([k, t]) => (
                  <button
                    key={k}
                    className="bt"
                    onClick={() => setSortKey(k)}
                    style={
                      sortKey === k
                        ? { borderColor: CLR.blue, color: CLR.text }
                        : {}
                    }
                  >
                    {t}
                  </button>
                ))}
              </div>
              <button
                className="bt"
                onClick={() => setOnlyHighP(!onlyHighP)}
                style={
                  onlyHighP ? { borderColor: CLR.bull, color: CLR.text } : {}
                }
              >
                {onlyHighP ? "Đang lọc P(TP) ≥ 60%" : "Lọc P(chạm TP) ≥ 60%"}
              </button>
              <button
                className="bt"
                onClick={() => setOnlyRunning(!onlyRunning)}
                style={
                  onlyRunning ? { borderColor: CLR.bull, color: CLR.text } : {}
                }
              >
                {onlyRunning
                  ? "Đang chỉ hiện cặp đang chạy"
                  : "Chỉ hiện cặp đang chạy / sát trigger"}
              </button>
            </div>
          </div>
        )}
        <div style={{ overflowX: "auto" }}>
          <table className="tbl" style={{ minWidth: 1180 }}>
            <thead>
              <tr>
                <th>#</th>
                <th>Cặp</th>
                <th>Nhóm</th>
                <th>90 {barUnit}</th>
                <th>Trạng thái</th>
                <th>Bằng chứng</th>
                <th>W / {secondTFLabel}</th>
                <th>Analog A·B·C</th>
                <th>Lịch sử đạt T1</th>
                <th title="Khoảng cách theo hướng bias tới mức cần ĐÓNG CỬA phá qua để vào lệnh breakout (Long→R, Short→S). Đây là mức dùng để tính điểm CMT.">
                  Trigger breakout
                </th>
                <th title="Khoảng cách ngược lại — mức hồi về để vào lệnh pullback (Long→S, Short→R). Chỉ tham khảo, không tính điểm.">
                  Trigger pullback
                </th>
                <th title="Xác suất giá CHẠM mục tiêu — blend Lịch sử + Mô hình biến động + Analog CMT. Thứ tự: TP · R · S.">P chạm (TP·R·S)</th>
                <th title="Mục tiêu tối ưu ≥90%: mức XA NHẤT mà ~90% lịch sử vẫn CHẠM tới trong ~20 phiên (biên độ + thời gian). Quét liên tục nên cặp nào cũng có.">Mục tiêu ≥90% (T90)</th>
                <th>Vol/{barUnit}</th>
                <th>Điểm CMT</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {view.map((r, i) => (
                <tr key={r.key} className={i < 3 ? "hot" : undefined}>
                  <td
                    className="num"
                    style={{
                      color: i < 3 ? CLR.blue : CLR.dim,
                      fontWeight: 800,
                    }}
                  >
                    {i + 1}
                  </td>
                  <td style={{ fontWeight: 800 }}>
                    <button
                      onClick={() => setStratRow(r)}
                      style={{
                        background: "none",
                        border: "none",
                        color: CLR.text,
                        font: "inherit",
                        fontWeight: 800,
                        cursor: "pointer",
                        padding: 0,
                        textDecoration: "underline",
                        textDecorationColor: CLR.line,
                        textUnderlineOffset: 3,
                      }}
                      title="Xem chiến lược"
                    >
                      {r.label}
                    </button>
                  </td>
                  <td style={{ color: CLR.mut }}>{r.group}</td>
                  <td style={{ padding: "2px 8px" }}>
                    <div style={{ width: 96, height: 28 }}>
                      <ResponsiveContainer>
                        <LineChart
                          data={r.spark}
                          margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
                        >
                          <Line
                            dataKey="c"
                            stroke={
                              r.bias === "down"
                                ? CLR.bear
                                : r.bias === "up"
                                ? CLR.bull
                                : CLR.amber
                            }
                            dot={false}
                            strokeWidth={1.2}
                            isAnimationActive={false}
                          />
                          <YAxis hide domain={["auto", "auto"]} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      <Chip cls={STATE_LABEL[r.state].c}>
                        {stateLabelText(r)}
                      </Chip>
                      {r.conflict && (
                        <Chip
                          cls="side"
                          title="Breakout Tuần đang ngược xu hướng Tháng — cảnh báo mềm, không chặn lệnh"
                        >
                          ⚠ ngược Tháng
                        </Chip>
                      )}
                    </div>
                  </td>
                  <td
                    className="num"
                    style={{
                      color:
                        r.bias === "up"
                          ? CLR.bull
                          : r.bias === "down"
                          ? CLR.bear
                          : CLR.amber,
                      fontWeight: 700,
                    }}
                  >
                    {dirT(r.bias)} {r.biasPct}%
                  </td>
                  <td
                    className="num"
                    style={{ color: r.consensus ? CLR.text : CLR.dim }}
                  >
                    {trendVN[r.tW][0]}/{trendVN[r[secondTFKey]][0]}
                    {r.consensus ? " ✓" : ""}
                  </td>
                  <td className="num">
                    {r.analog ? (
                      <>
                        <span style={{ color: CLR.bull }}>{r.analog.pA}</span>·
                        <span style={{ color: CLR.bear }}>{r.analog.pB}</span>·
                        <span style={{ color: CLR.amber }}>{r.analog.pC}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="num">
                    {r.histRate != null ? `${r.histRate}%` : "—"}
                  </td>
                  <td className="num">
                    {r.state.startsWith("RUN")
                      ? "đã phá"
                      : `${r.distPct.toFixed(2)}%`}
                  </td>
                  <td className="num" style={{ color: CLR.dim }}>
                    {r.distPullbackPct != null
                      ? `${r.distPullbackPct.toFixed(2)}%`
                      : "—"}
                  </td>
                  <td className="num">
                    <div style={{ display: "flex", gap: 5, fontWeight: 700, whiteSpace: "nowrap" }}>
                      <span
                        style={{
                          color:
                            r.pTP == null
                              ? CLR.dim
                              : r.pTP >= 60
                              ? CLR.bull
                              : r.pTP >= 40
                              ? CLR.amber
                              : CLR.bear,
                        }}
                      >
                        {r.pTP == null ? "—" : r.pTP + "%"}
                      </span>
                      <span style={{ color: CLR.line }}>·</span>
                      <span style={{ color: CLR.dim }} title="P chạm R">{r.pR == null ? "—" : r.pR}</span>
                      <span style={{ color: CLR.line }}>/</span>
                      <span style={{ color: CLR.dim }} title="P chạm S">{r.pS == null ? "—" : r.pS}</span>
                    </div>
                  </td>
                  <td className="num">
                    {r.t90 ? (
                      <span style={{ whiteSpace: "nowrap" }}>
                        <span style={{ fontWeight: 700, color: CLR.bull }}>{r.t90.level.toFixed(r.digits)}</span>
                        <span style={{ color: CLR.dim }}> · {r.t90.distPct.toFixed(2)}% · 90%≤{r.t90.time90All == null ? "?" : r.t90.time90All}p</span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="num">{r.volPct.toFixed(2)}%</td>
                  <td>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 7 }}
                    >
                      <span
                        className="num"
                        style={{
                          fontWeight: 800,
                          color: i < 3 ? CLR.blue : CLR.text,
                        }}
                      >
                        {r.score}
                      </span>
                      <div className="scorebar">
                        <i style={{ width: `${r.score}%` }} />
                      </div>
                    </div>
                  </td>
                  <td style={{ display: "flex", gap: 5 }}>
                    <button
                      className="bt"
                      onClick={() => setStratRow(r)}
                      style={{
                        borderColor:
                          r.strategy &&
                          (r.strategy.side === "long"
                            ? "rgba(63,214,164,.5)"
                            : r.strategy.side === "short"
                            ? "rgba(238,106,95,.5)"
                            : CLR.line),
                      }}
                      title={
                        isStrategic ? "Chiến lược (Tuần)" : "Chiến lược nhanh"
                      }
                    >
                      ⚡
                    </button>
                    <button className="bt" onClick={() => openPair(r.key)}>
                      CMT →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="sub" style={{ marginTop: 10 }}>
          Bấm <b>tên cặp</b> hoặc nút <b>⚡</b> để xem thẻ chiến lược nhanh (kết
          hợp vị trí giá + 2 kịch bản xác suất cao). "Đang chạy" = giá đóng cửa
          đã ra ngoài biên 40 phiên. <b>Trigger breakout</b> = khoảng cách theo
          hướng bias tới mức cần đóng cửa phá qua (Long→R, Short→S) — mức này
          dùng để tính điểm CMT. <b>Trigger pullback</b> = khoảng cách ngược
          lại, tới mức hồi về (Long→S, Short→R) — chỉ tham khảo, không tính
          điểm. Dưới 15% biên độ coi là "sát". A phá lên · B thủng xuống · C kẹt
          biên; n nhỏ (&lt;40) đọc thận trọng. Điểm chỉ là thước xếp hạng, không
          phải tín hiệu vào lệnh.
        </p>
      </Panel>
      <Warn>
        Toàn bộ dữ liệu là giá đóng cửa ECB (1 fixing/ngày, T+1). Không có
        High/Low intraday nên biên độ, trigger và ATR đều dựa trên close; trong
        phiên giá có thể chạm mức mà chưa kích hoạt. Cặp EM (ZAR, MXN) có
        swap/phí qua đêm lớn nằm ngoài mọi con số ở đây.
      </Warn>
      {stratRow && (
        <StrategyModal
          row={stratRow}
          onClose={() => setStratRow(null)}
          onOpenCMT={() => {
            setStratRow(null);
            openPair(stratRow.key);
          }}
        />
      )}
    </>
  );
}

/* ============================================================
   10. CMT — LỚP 1: BỐI CẢNH VĨ MÔ
   ============================================================ */

const SESSIONS = [
  { s: "Á (Tokyo)", v: 46 },
  { s: "Âu (London)", v: 79 },
  { s: "Chồng lấn London/NY", v: 96 },
  { s: "Mỹ (New York)", v: 71 },
];

function MacroLayer({ cfg, corr, diverge, dxy, vix, status, seas, legs }) {
  const mk = (arr) => arr.slice(-120).map((v, i) => ({ i, v }));
  const eurLinked = cfg.base === "EUR" || cfg.quote === "EUR";
  const calendar = cfg.crypto
    ? [
        {
          e: "FOMC · CPI Mỹ (thanh khoản rủi ro)",
          impact: "Rất cao",
          note: "BTC nhạy với thanh khoản USD & khẩu vị rủi ro toàn cầu",
        },
        {
          e: "Sự kiện on-chain / ETF flows",
          impact: "Cao",
          note: "Dòng tiền ETF, halving, nâng cấp mạng — driver riêng của crypto",
        },
        {
          e: "Thanh lý đòn bẩy (funding/OI)",
          impact: "Cao",
          note: "Cascade thanh lý trên sàn phái sinh gây biến động mạnh",
        },
        {
          e: "Giao dịch 24/7 (không nghỉ cuối tuần)",
          impact: "Lưu ý",
          note: "Khác FX: BTC chạy cả T7/CN. App dùng giá ĐÓNG DAILY đã chốt (bỏ nến hôm nay đang chạy) nên số ổn định mỗi lần mở, không phải giá realtime.",
        },
      ]
    : [
        {
          e: `Quyết định lãi suất ${CBANK[cfg.base]}`,
          impact: "Cao",
          note: `Trực tiếp vào chân ${cfg.base}`,
        },
        {
          e: `Quyết định lãi suất ${CBANK[cfg.quote]}`,
          impact: "Cao",
          note: `Trực tiếp vào chân ${cfg.quote}`,
        },
        {
          e: "CPI Mỹ · FOMC",
          impact: "Rất cao",
          note: "Driver kỳ vọng lãi suất Fed, biến động toàn thị trường",
        },
        {
          e: "NFP (thứ Sáu đầu tháng)",
          impact: "Rất cao",
          note: "Volatility đỉnh phiên Mỹ",
        },
      ];
  return (
    <>
      <Panel
        mod="Module 6 · Intermarket"
        title="Tương quan liên thị trường"
        sub="DXY tính realtime theo công thức ICE từ 6 tỷ giá ECB thành phần — dữ liệu thật, không mô phỏng."
      >
        <div className="grid2">
          <div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Biến vĩ mô</th>
                  <th>Corr 60 phiên</th>
                  <th>Nguồn</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>DXY (chỉ số USD)</td>
                  <td
                    className="num"
                    style={{
                      color:
                        corr.dxy < -0.3
                          ? CLR.bear
                          : corr.dxy > 0.3
                          ? CLR.bull
                          : CLR.mut,
                    }}
                  >
                    {corr.dxy.toFixed(2)}
                  </td>
                  <td style={{ color: CLR.mut }}>Tính từ tỷ giá ECB (thật)</td>
                </tr>
                <tr>
                  <td>VIX (khẩu vị rủi ro)</td>
                  <td className="num">
                    {status.vix === "ok" ? corr.vix.toFixed(2) : "—"}
                  </td>
                  <td style={{ color: CLR.mut }}>
                    {status.vix === "ok"
                      ? "CBOE (thật)"
                      : "CBOE bị chặn CORS trong môi trường này"}
                  </td>
                </tr>
                <tr>
                  <td>Yield spread 10y</td>
                  <td className="num">—</td>
                  <td style={{ color: CLR.mut }}>
                    Không có API keyless+CORS; cần FRED key + backend
                  </td>
                </tr>
                <tr>
                  <td>
                    Dầu WTI{" "}
                    {cfg.base === "CAD" ||
                    cfg.quote === "CAD" ||
                    cfg.base === "NOK" ||
                    cfg.quote === "NOK"
                      ? "(driver hàng hoá của cặp này)"
                      : ""}
                  </td>
                  <td className="num">—</td>
                  <td style={{ color: CLR.mut }}>
                    Không có API keyless+CORS — cần nguồn qua backend
                  </td>
                </tr>
              </tbody>
            </table>
            <div
              style={{
                marginTop: 12,
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              {cfg.cross ? (
                <Chip cls="mut">
                  {cfg.label} là cặp chéo — gần như trung hoà USD/DXY; driver là
                  chênh lệch sức mạnh {cfg.base} vs {cfg.quote} (xem phân rã 2
                  chân bên dưới)
                </Chip>
              ) : eurLinked ? (
                <Chip cls="mut">
                  EUR chiếm 57,6% rổ DXY — tương quan gần tuyệt đối là tất yếu,
                  không dùng làm tín hiệu phân kỳ cho cặp này
                </Chip>
              ) : diverge ? (
                <Chip cls="down">
                  Phân kỳ: {cfg.label} đi ngược DXY ~15 phiên gần nhất — cần lớp
                  4 xác nhận
                </Chip>
              ) : (
                <Chip cls="up">{cfg.label} đang đồng pha với DXY</Chip>
              )}
            </div>
          </div>
          <div>
            <div className="sub" style={{ marginBottom: 4 }}>
              DXY — 120 phiên gần nhất
            </div>
            <ResponsiveContainer width="100%" height={130}>
              <LineChart data={mk(dxy)}>
                <XAxis dataKey="i" hide />
                <YAxis hide domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={TT}
                  formatter={(v) => [v.toFixed(2), "DXY"]}
                />
                <Line
                  dataKey="v"
                  stroke={CLR.amber}
                  dot={false}
                  strokeWidth={1.6}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
            {status.vix === "ok" && (
              <>
                <div className="sub" style={{ margin: "8px 0 4px" }}>
                  VIX — CBOE (thật)
                </div>
                <ResponsiveContainer width="100%" height={130}>
                  <LineChart data={mk(vix.map((x) => x.v))}>
                    <XAxis dataKey="i" hide />
                    <YAxis hide domain={["auto", "auto"]} />
                    <Tooltip
                      contentStyle={TT}
                      formatter={(v) => [v.toFixed(2), "VIX"]}
                    />
                    <Line
                      dataKey="v"
                      stroke={CLR.blue}
                      dot={false}
                      strokeWidth={1.6}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </>
            )}
          </div>
        </div>
      </Panel>

      <div className="grid2">
        <Panel
          mod="Module 4 · Chu kỳ"
          title="Seasonality tính từ lịch sử thật"
          sub={`% thay đổi trung bình theo tháng của ${cfg.label}, tính trên toàn bộ chuỗi ECB 10 năm.`}
        >
          {seas ? (
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={seas.map((v, i) => ({ m: `T${i + 1}`, v }))}>
                <XAxis
                  dataKey="m"
                  tick={{ fill: CLR.dim, fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: CLR.line }}
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={TT}
                  formatter={(v) => [`${v}%`, "TB tháng"]}
                />
                <Bar dataKey="v" isAnimationActive={false}>
                  {seas.map((v, i) => (
                    <Cell key={i} fill={v >= 0 ? CLR.bull : CLR.bear} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="sub">Đang tính…</p>
          )}
          <div className="sub" style={{ margin: "10px 0 4px" }}>
            Volatility theo phiên (đặc trưng chung của FX — không tính từ dữ
            liệu ngày)
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={SESSIONS} layout="vertical" margin={{ left: 30 }}>
              <XAxis type="number" hide />
              <YAxis
                dataKey="s"
                type="category"
                tick={{ fill: CLR.mut, fontSize: 11 }}
                width={150}
                tickLine={false}
                axisLine={false}
              />
              <Bar
                dataKey="v"
                fill={CLR.blue}
                isAnimationActive={false}
                radius={[0, 4, 4, 0]}
                barSize={12}
              />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel
          mod="Module 4 · Lịch kinh tế"
          title="Nhóm sự kiện trọng yếu của cặp này"
          sub="Chưa có API lịch kinh tế keyless+CORS — đây là khung sự kiện định kỳ suy từ hai đồng tiền của cặp; nối feed qua backend khi triển khai."
        >
          <table className="tbl">
            <thead>
              <tr>
                <th>Sự kiện</th>
                <th>Tác động</th>
                <th>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {calendar.map((c) => (
                <tr key={c.e}>
                  <td>{c.e}</td>
                  <td>
                    <Chip cls={c.impact === "Rất cao" ? "down" : "side"}>
                      {c.impact}
                    </Chip>
                  </td>
                  <td style={{ color: CLR.mut }}>{c.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      {cfg.cross && legs && (
        <Panel
          mod="Module 6 · Relative strength"
          title={`Phân rã ${cfg.label} theo 2 chân (dữ liệu thật)`}
          sub={`log(${cfg.label}) = log(${cfg.base}/USD) + log(USD/${cfg.quote}). Đường nào kéo cross đi cho biết câu chuyện là ${cfg.base} hay ${cfg.quote} — cốt lõi phân tích relative strength của CMT.`}
        >
          <ResponsiveContainer width="100%" height={170}>
            <LineChart data={legs}>
              <XAxis
                dataKey="d"
                tick={{ fill: CLR.dim, fontSize: 9 }}
                tickLine={false}
                axisLine={{ stroke: CLR.line }}
                minTickGap={60}
                tickFormatter={(d) => (d ? d.slice(5) : "")}
              />
              <YAxis
                tick={{
                  fill: CLR.dim,
                  fontSize: 10,
                  fontFamily: "IBM Plex Mono",
                }}
                tickFormatter={(v) => `${(v * 100).toFixed(1)}%`}
                width={54}
                tickLine={false}
                axisLine={false}
              />
              <ReferenceLine y={0} stroke={CLR.line} />
              <Tooltip
                contentStyle={TT}
                formatter={(v, n) => [`${(v * 100).toFixed(2)}%`, n]}
              />
              <Line
                dataKey="a"
                name={`Chân ${cfg.base}`}
                stroke={CLR.blue}
                dot={false}
                strokeWidth={1.6}
                isAnimationActive={false}
              />
              <Line
                dataKey="b"
                name={`Chân ${cfg.quote}`}
                stroke={CLR.amber}
                dot={false}
                strokeWidth={1.6}
                isAnimationActive={false}
              />
              <Line
                dataKey="cross"
                name={cfg.label}
                stroke={CLR.text}
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="sub" style={{ marginTop: 8 }}>
            {legs[legs.length - 1].note}
          </p>
        </Panel>
      )}
    </>
  );
}

/* ============================================================
   11. CMT — LỚP 2: XU HƯỚNG
   ============================================================ */

function TrendLayer({
  cfg,
  tf,
  setTf,
  frames,
  cross,
  dates,
  closes,
  digits,
  piv,
  cascade,
}) {
  const n = Math.min(closes.length, tf === "M" ? 60 : tf === "W" ? 80 : 160);
  const off = closes.length - n;
  const dots = piv
    .filter((p) => p.i >= off)
    .slice(-8)
    .map((p, k) => (
      <ReferenceDot
        key={k}
        x={dates[p.i]}
        y={p.price}
        r={3.5}
        fill={p.type === "H" ? CLR.bear : CLR.bull}
        stroke="none"
        label={{
          value: p.type === "H" ? "Đ" : "đ",
          fill: CLR.mut,
          fontSize: 10,
          position: p.type === "H" ? "top" : "bottom",
        }}
      />
    ));
  const c = cascade || {};
  const fmtR = (r) => (r == null ? "—" : `${r.toFixed(1)}×`);
  const fmtA = (a) => (a == null ? "—" : `${a.toFixed(2)}%`);
  return (
    <>
      <Panel
        mod="Module 1 · Dow Theory"
        title="Trạng thái xu hướng đa khung — M → W → D → 4H → 1H"
        sub="Cả 5 khung đều tính trên OHLC thật (Twelve Data): pivot đỉnh/đáy dùng High/Low thật của từng khung, không còn suy diễn từ khung lớn xuống khung nhỏ."
      >
        <table className="tbl">
          <thead>
            <tr>
              <th>Khung</th>
              <th>Vai trò</th>
              <th>Xu hướng</th>
              <th>Căn cứ</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="num">M</td>
              <td>Cấp cao (major)</td>
              <td>
                <Chip cls={frames.M.trend}>{trendVN[frames.M.trend]}</Chip>
              </td>
              <td style={{ color: CLR.mut }}>{frames.M.detail}</td>
            </tr>
            <tr>
              <td className="num">W</td>
              <td>Primary (chính)</td>
              <td>
                <Chip cls={frames.W.trend}>{trendVN[frames.W.trend]}</Chip>
              </td>
              <td style={{ color: CLR.mut }}>{frames.W.detail}</td>
            </tr>
            <tr>
              <td className="num">D</td>
              <td>Secondary (trung)</td>
              <td>
                <Chip cls={frames.D.trend}>{trendVN[frames.D.trend]}</Chip>
              </td>
              <td style={{ color: CLR.mut }}>{frames.D.detail}</td>
            </tr>
            <tr>
              <td className="num">4H</td>
              <td>Minor (vào lệnh)</td>
              <td>
                <Chip cls={frames.H4.trend}>{trendVN[frames.H4.trend]}</Chip>
              </td>
              <td style={{ color: CLR.mut }}>{frames.H4.detail}</td>
            </tr>
            <tr>
              <td className="num">1H</td>
              <td>Vi mô (nhồi lệnh)</td>
              <td>
                <Chip cls={frames.H1.trend}>{trendVN[frames.H1.trend]}</Chip>
              </td>
              <td style={{ color: CLR.mut }}>{frames.H1.detail}</td>
            </tr>
          </tbody>
        </table>
        <div
          style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          <Chip
            cls={frames.fullAlign ? "up" : frames.consensus ? "side" : "mut"}
          >
            {frames.fullAlign
              ? "M · W · D đồng thuận hoàn toàn — trend mạnh, khung nhỏ thuận theo"
              : frames.consensus
              ? "W · D thuận nhưng M chưa đồng pha — cẩn trọng khung lớn"
              : "Các khung phân kỳ — khung nhỏ (4H/1H) nhiều khả năng nhiễu/đảo, ưu tiên đứng ngoài"}
          </Chip>
          <Chip cls={frames.intradayAlign ? "up" : "mut"}>
            {frames.intradayAlign
              ? "D · 4H · 1H đồng thuận — đủ điều kiện tìm điểm vào theo hướng D"
              : "D · 4H · 1H chưa đồng thuận — chờ 4H/1H xác nhận lại trước khi vào"}
          </Chip>
          {cross ? (
            <Chip cls={cross.agree ? "up" : "side"}>
              Xác nhận chéo — {cfg.base}/USD: {trendVN[cross.tA].toLowerCase()},
              USD/{cfg.quote}: {trendVN[cross.tB].toLowerCase()} →{" "}
              {cross.agree ? "cùng câu chuyện" : "chưa đồng thuận"}
            </Chip>
          ) : (
            <Chip cls="mut">Cặp có USD — dùng DXY ở lớp 1 làm đối chứng</Chip>
          )}
        </div>
      </Panel>

      <Panel
        mod="Module 1 · Fractal"
        title="Tự đồng dạng M → W → D (đối chiếu, không còn dùng để chiếu 4H)"
        sub="4H/1H giờ có OHLC thật ở bảng trên — bảng dưới chỉ còn giá trị THAM KHẢO: kiểm tra thị trường có 'tự đồng dạng' giữa các khung lớn hay không (biên độ sóng M/W/D có tỉ lệ đều nhau không)."
      >
        <table className="tbl">
          <thead>
            <tr>
              <th>Khung</th>
              <th>Biên độ sóng (trung vị)</th>
              <th>Thời lượng (trung vị)</th>
              <th>Tỉ lệ so với khung dưới</th>
              <th>Số sóng</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="num">M</td>
              <td className="num">{fmtA(c.M?.medAmpl)}</td>
              <td className="num">{c.M?.medDur ?? "—"} tháng</td>
              <td className="num">{fmtR(c.rMW)} (M/W)</td>
              <td className="num">{c.M?.n ?? 0}</td>
            </tr>
            <tr>
              <td className="num">W</td>
              <td className="num">{fmtA(c.W?.medAmpl)}</td>
              <td className="num">{c.W?.medDur ?? "—"} tuần</td>
              <td className="num">{fmtR(c.rWD)} (W/D)</td>
              <td className="num">{c.W?.n ?? 0}</td>
            </tr>
            <tr>
              <td className="num">D</td>
              <td className="num">{fmtA(c.D?.medAmpl)}</td>
              <td className="num">{c.D?.medDur ?? "—"} phiên</td>
              <td className="num" style={{ color: CLR.mut }}>
                {fmtR(c.rWD)} (W/D)
              </td>
              <td className="num">{c.D?.n ?? 0}</td>
            </tr>
          </tbody>
        </table>
        <div
          style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          <Chip cls={c.consistent ? "up" : "side"}>
            {c.consistent
              ? `Tỉ lệ bước xuống nhất quán (M/W ${fmtR(c.rMW)} ≈ W/D ${fmtR(
                  c.rWD
                )}) — thị trường đang tự đồng dạng qua các khung`
              : `Tỉ lệ bước xuống KHÔNG đều (M/W ${fmtR(c.rMW)} vs W/D ${fmtR(
                  c.rWD
                )}) — cặp này ít tự đồng dạng, các khung đang hành xử khác nhịp nhau`}
          </Chip>
        </div>
        <div className="fnote" style={{ marginTop: 12 }}>
          <b>Đọc thế nào</b>
          Xu hướng lớn là {trendVN[frames.D.trend].toLowerCase()} trên D, và
          4H thật hiện đang {trendVN[frames.H4.trend].toLowerCase()} (xem bảng
          xu hướng đa khung ở trên — đó mới là số thật để ra quyết định).
          Bảng này chỉ để kiểm tra thị trường có "tự đồng dạng" giữa các khung
          lớn hay không — hữu ích khi ước lượng độ sâu một sóng thông thường,
          không dùng để suy đoán 4H nữa vì đã có dữ liệu 4H thật.
        </div>
      </Panel>

      <Panel
        mod="Biểu đồ"
        title={`${cfg.label} — khung ${
          tf === "M"
            ? "Tháng"
            : tf === "W"
            ? "Tuần"
            : tf === "H4"
            ? "4 giờ"
            : tf === "H1"
            ? "1 giờ"
            : "Ngày"
        }`}
        sub="Đ = đỉnh swing, đ = đáy swing dùng cho chuỗi Dow. Giá Close thật từ Twelve Data (OHLC) theo từng khung."
      >
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {["M", "W", "D", "H4", "H1"].map((k) => (
            <button
              key={k}
              className="bt"
              onClick={() => setTf(k)}
              style={tf === k ? { borderColor: CLR.blue, color: CLR.text } : {}}
            >
              {k}
            </button>
          ))}
        </div>
        <PriceChart
          dates={dates.slice(-n)}
          closes={closes.slice(-n)}
          digits={digits}
          dots={dots}
        />
      </Panel>
    </>
  );
}

/* ============================================================
   12. CMT — LỚP 3: CẤU TRÚC GIÁ
   ============================================================ */

function StructureLayer({ dates, closes, digits, patterns, scens, swings }) {
  const [scIdx, setScIdx] = useState(0);
  const sc = scens[Math.min(scIdx, scens.length - 1)];
  const dots = sc
    ? sc.labels.map((p, k) => (
        <ReferenceDot
          key={k}
          x={dates[p.i]}
          y={p.price}
          r={4}
          fill={CLR.blue}
          stroke="#0d1322"
          strokeWidth={1.5}
          label={{
            value: p.tag,
            fill: CLR.text,
            fontSize: 11,
            fontWeight: 700,
            position: p.type === "H" ? "top" : "bottom",
          }}
        />
      ))
    : null;
  const refs = patterns
    .filter((p) => p.neck != null)
    .map((p, k) => (
      <ReferenceLine
        key={k}
        y={p.neck}
        stroke={CLR.amber}
        strokeDasharray="5 4"
        label={{
          value: "neckline",
          fill: CLR.amber,
          fontSize: 10,
          position: "insideTopLeft",
        }}
      />
    ));
  return (
    <>
      <Panel
        mod="Module 3 · Elliott Wave"
        title="Kịch bản đếm sóng song song"
        sub="Đếm sóng mang tính chủ quan cao — hệ thống trình bày các kịch bản khả dĩ kèm xác suất tương đối, không khẳng định một đáp án."
      >
        {swings && swings.cur && swings.up.n > 0 && swings.down.n > 0 && (
          <div className="scen" style={{ borderColor: "rgba(233,180,76,.4)" }}>
            <b>Thước kỳ vọng từ lịch sử sóng</b>
            <p className="sub" style={{ margin: "6px 0 0" }}>
              Sóng {swings.cur.dir === "up" ? "tăng" : "giảm"} hiện tại:{" "}
              {swings.cur.bars} phiên · {swings.cur.amplPct}% — median lịch sử
              cùng chiều:{" "}
              {(swings.cur.dir === "up" ? swings.up : swings.down).medBars}{" "}
              phiên ·{" "}
              {(swings.cur.dir === "up" ? swings.up : swings.down).medAmpl}% (đã
              dài hơn {swings.cur.pctBars}% và lớn hơn {swings.cur.pctAmpl}% số
              sóng lịch sử). Dùng để chấm điểm tính hợp lý của từng kịch bản bên
              dưới.
            </p>
          </div>
        )}
        {scens.length === 0 && (
          <p className="sub">
            Chưa đủ pivot rõ ràng trên dữ liệu gần đây để dựng kịch bản.
          </p>
        )}
        {scens.map((s, i) => (
          <div
            key={i}
            className="scen"
            style={i === scIdx ? { borderColor: CLR.blue } : {}}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "baseline",
                flexWrap: "wrap",
              }}
            >
              <b>{s.name}</b>
              <span className="prob">~{s.prob}% tương đối</span>
            </div>
            {s.rules.map((r, j) => (
              <div key={j} className="rule">
                <span className={r.ok ? "ok" : "no"}>{r.ok ? "✓" : "✕"}</span>
                <span>{r.txt}</span>
              </div>
            ))}
            <div className="kv" style={{ border: "none", paddingTop: 8 }}>
              <span>Target</span>
              <span className="num">{s.target}</span>
            </div>
            <button
              className="bt"
              onClick={() => setScIdx(i)}
              style={{ marginTop: 6 }}
            >
              {i === scIdx
                ? "Đang hiển thị nhãn trên biểu đồ"
                : "Hiển thị nhãn sóng"}
            </button>
          </div>
        ))}
      </Panel>
      <Panel
        mod="Module 2 · Chart Patterns"
        title="Mẫu hình cổ điển đang theo dõi"
        sub="Nhận diện từ pivot trên giá đóng cửa thật; target đo bằng chiều cao mẫu hình."
      >
        {patterns.length === 0 && (
          <p className="sub">
            Không phát hiện mẫu hình đạt điều kiện trên cửa sổ hiện tại.
          </p>
        )}
        {patterns.map((p, i) => (
          <div key={i} className="scen">
            <b>{p.name}</b>{" "}
            <Chip
              cls={p.dir === "tăng" ? "up" : p.dir === "giảm" ? "down" : "side"}
            >
              {p.dir}
            </Chip>
            <div className="kv">
              <span>Trạng thái</span>
              <span>{p.status}</span>
            </div>
            {p.neck != null && (
              <div className="kv">
                <span>Neckline / breakout</span>
                <span className="num">{p.neck.toFixed(digits)}</span>
              </div>
            )}
            {p.target != null && (
              <div className="kv">
                <span>Target</span>
                <span className="num">{p.target.toFixed(digits)}</span>
              </div>
            )}
            {p.heightTxt && (
              <div className="kv">
                <span>Cách đo target</span>
                <span>{p.heightTxt}</span>
              </div>
            )}
          </div>
        ))}
      </Panel>
      <Panel mod="Biểu đồ" title="Khung ngày — overlay nhãn sóng & neckline">
        <PriceChart
          dates={dates}
          closes={closes}
          digits={digits}
          dots={dots}
          refLines={refs}
          height={320}
        />
      </Panel>
    </>
  );
}

/* ============================================================
   13. CMT — LỚP 4: XÁC NHẬN
   ============================================================ */

function ConfirmLayer({
  dates,
  closes,
  rsiArr,
  macdArr,
  stochArr,
  cot,
  cotName,
  bt,
  trendD,
  status,
  div,
}) {
  const w = Math.min(120, closes.length),
    off = closes.length - w;
  const oscData = closes.slice(-w).map((c, i) => ({
    d: dates[off + i],
    rsi: rsiArr[off + i],
    macd: macdArr[off + i].macd,
    sig: macdArr[off + i].signal,
    hist: macdArr[off + i].hist,
    k: stochArr[off + i],
  }));
  const lastRSI = rsiArr[rsiArr.length - 1];
  const lastM = macdArr[macdArr.length - 1];
  const [showBT, setShowBT] = useState(false);
  const cotZ = (() => {
    if (!cot || cot.length < 10) return null;
    const v = cot.map((x) => x.net);
    const m = v.reduce((s, x) => s + x, 0) / v.length;
    const sd =
      Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length) || 1;
    return (v[v.length - 1] - m) / sd;
  })();
  const confirmOK =
    (trendD === "up" && lastRSI > 50 && lastM.macd > lastM.signal) ||
    (trendD === "down" && lastRSI < 50 && lastM.macd < lastM.signal);
  return (
    <>
      <Panel
        mod="Module 5 · Momentum"
        title="RSI · MACD · Stochastic (khung ngày)"
        sub="Lớp này xác nhận hoặc phủ nhận kết luận từ lớp xu hướng và cấu trúc — không dùng độc lập. Stochastic tính trên rolling high/low của giá đóng cửa."
      >
        <div className="grid3" style={{ marginBottom: 10 }}>
          <div className="kv" style={{ border: "none" }}>
            <span>RSI(14)</span>
            <span
              className="num"
              style={{
                color:
                  lastRSI > 55 ? CLR.bull : lastRSI < 45 ? CLR.bear : CLR.amber,
              }}
            >
              {lastRSI ? lastRSI.toFixed(1) : "—"}
            </span>
          </div>
          <div className="kv" style={{ border: "none" }}>
            <span>MACD vs Signal</span>
            <span
              className="num"
              style={{ color: lastM.macd > lastM.signal ? CLR.bull : CLR.bear }}
            >
              {lastM.macd > lastM.signal ? "Trên" : "Dưới"}
            </span>
          </div>
          <div className="kv" style={{ border: "none" }}>
            <span>Đồng pha xu hướng D?</span>
            <span>
              {confirmOK ? (
                <Chip cls="up">Xác nhận</Chip>
              ) : (
                <Chip cls="side">Chưa xác nhận</Chip>
              )}
            </span>
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <Chip
            cls={
              div.type === "bearish"
                ? "down"
                : div.type === "bullish"
                ? "up"
                : "mut"
            }
          >
            {div.txt}
          </Chip>
        </div>
        <ResponsiveContainer width="100%" height={110}>
          <LineChart data={oscData}>
            <XAxis dataKey="d" hide />
            <YAxis domain={[0, 100]} hide />
            <ReferenceLine y={70} stroke={CLR.bear} strokeDasharray="3 4" />
            <ReferenceLine y={30} stroke={CLR.bull} strokeDasharray="3 4" />
            <Tooltip contentStyle={TT} />
            <Line
              dataKey="rsi"
              name="RSI"
              stroke={CLR.blue}
              dot={false}
              strokeWidth={1.6}
              isAnimationActive={false}
            />
            <Line
              dataKey="k"
              name="Stoch %K (close-based)"
              stroke={CLR.amber}
              dot={false}
              strokeWidth={1}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
        <ResponsiveContainer width="100%" height={90}>
          <ComposedChart data={oscData}>
            <XAxis dataKey="d" hide />
            <YAxis hide domain={["auto", "auto"]} />
            <Tooltip contentStyle={TT} />
            <Bar dataKey="hist" name="MACD hist" isAnimationActive={false}>
              {oscData.map((d, i) => (
                <Cell key={i} fill={d.hist >= 0 ? CLR.bull : CLR.bear} />
              ))}
            </Bar>
            <Line
              dataKey="macd"
              name="MACD"
              stroke={CLR.blue}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="sig"
              name="Signal"
              stroke={CLR.amber}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ marginTop: 10 }}>
          <button className="bt" onClick={() => setShowBT(!showBT)}>
            {showBT
              ? "Ẩn lịch sử khớp"
              : "Xem lịch sử khớp quy tắc confluence này"}
          </button>
          {showBT && (
            <div className="scen" style={{ marginTop: 8 }}>
              <b>
                Quy tắc: xu hướng Dow khung D + RSI cắt lại 40/60 theo hướng xu
                hướng
              </b>
              {bt ? (
                <>
                  <div className="kv">
                    <span>Số lần khớp (rolling, không nhìn trước)</span>
                    <span className="num">{bt.n}</span>
                  </div>
                  <div className="kv">
                    <span>Tỷ lệ dương sau 12 phiên</span>
                    <span className="num">{bt.winRate}%</span>
                  </div>
                  <div className="kv">
                    <span>Kết quả TB (đơn vị vol-proxy)</span>
                    <span className="num">{bt.avgR}R</span>
                  </div>
                </>
              ) : (
                <p className="sub">
                  Chưa có lần khớp nào trong lịch sử đã tải.
                </p>
              )}
            </div>
          )}
        </div>
      </Panel>

      <div className="grid2">
        <Panel
          mod="Module 5 · Volume"
          title="Volume — trạng thái nguồn"
          sub="FX giao ngay là OTC phi tập trung: không tồn tại volume sàn."
        >
          <Warn>
            Không có nguồn keyless+CORS cho tick volume hay volume futures. App{" "}
            <b>không hiển thị volume giả</b>. Hai nguồn thật khi triển khai:
            tick volume từ broker API (qua proxy), hoặc volume hợp đồng futures
            CME qua nhà cung cấp trả phí.
          </Warn>
        </Panel>
        <Panel
          mod="Module 7 · Sentiment"
          title={`COT — ${cotName}`}
          sub="Net non-commercial (đầu cơ lớn) hàng tuần, tải trực tiếp từ CFTC Socrata API."
        >
          {cot && cot.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={130}>
                <BarChart data={cot}>
                  <XAxis
                    dataKey="d"
                    tick={{ fill: CLR.dim, fontSize: 9 }}
                    tickLine={false}
                    axisLine={{ stroke: CLR.line }}
                    minTickGap={60}
                    tickFormatter={(d) => d.slice(2, 7)}
                  />
                  <YAxis hide domain={["auto", "auto"]} />
                  <ReferenceLine y={0} stroke={CLR.line} />
                  <Tooltip
                    contentStyle={TT}
                    formatter={(v) => [
                      `${v.toLocaleString()} hợp đồng`,
                      "Net non-commercial",
                    ]}
                  />
                  <Bar dataKey="net" isAnimationActive={false}>
                    {cot.map((x, i) => (
                      <Cell key={i} fill={x.net >= 0 ? CLR.bull : CLR.bear} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  marginTop: 8,
                }}
              >
                {cotZ !== null && (
                  <Chip cls={Math.abs(cotZ) > 1.5 ? "down" : "mut"}>
                    {Math.abs(cotZ) > 1.5
                      ? `Positioning cực đoan (z=${cotZ.toFixed(
                          1
                        )}) — rủi ro đảo chiều do squeeze`
                      : `Positioning bình thường (z=${cotZ.toFixed(1)})`}
                  </Chip>
                )}
                <Chip cls="mut">
                  Retail sentiment: chưa có API công khai keyless — cần nguồn
                  broker
                </Chip>
              </div>
            </>
          ) : status.cot === "loading" ? (
            <p className="sub">Đang tải báo cáo CFTC…</p>
          ) : (
            <Warn>
              Không có dữ liệu COT cho cặp này (đồng tiền không có hợp đồng CME
              tương ứng, hoặc CFTC API không phản hồi).
            </Warn>
          )}
        </Panel>
      </div>
    </>
  );
}

/* ============================================================
   14. CMT — LỚP 5: RỦI RO & DANH MỤC
   ============================================================ */

function RiskLayer({
  allCloses,
  matrixKeys,
  vol,
  cfg,
  digits,
  quotePerUSD,
  lastPrice,
}) {
  const [equity, setEquity] = useState(10000);
  const [riskPct, setRiskPct] = useState(1);
  const [volMult, setVolMult] = useState(2);
  const [positions, setPositions] = useState([{ pair: cfg.key, dir: "Long" }]);
  const rets = {};
  matrixKeys.forEach((k) => (rets[k] = returns(allCloses[k]).slice(-60)));
  const mat = matrixKeys.map((a) =>
    matrixKeys.map((b) => pearson(rets[a], rets[b]))
  );
  const dbl = [];
  positions.forEach((p1, i) =>
    positions.slice(i + 1).forEach((p2) => {
      if (!rets[p1.pair] || !rets[p2.pair]) return;
      const c = pearson(rets[p1.pair], rets[p2.pair]);
      if ((c > 0.7 && p1.dir === p2.dir) || (c < -0.7 && p1.dir !== p2.dir))
        dbl.push({ a: p1, b: p2, c });
    })
  );
  const stopDist = vol * volMult;
  const riskUSD = (equity * riskPct) / 100;
  const isCrypto = cfg.crypto;
  const pipVal = isCrypto ? 1 : 100000 / (quotePerUSD || 1);
  const sizeUnits = isCrypto
    ? riskUSD / (stopDist || 1e-9)
    : riskUSD / (stopDist * pipVal);
  const colFor = (v) =>
    v === 1
      ? "rgba(110,168,255,.15)"
      : v > 0
      ? `rgba(63,214,164,${0.08 + Math.abs(v) * 0.3})`
      : `rgba(238,106,95,${0.08 + Math.abs(v) * 0.3})`;
  const toggle = (p) =>
    setPositions((c) =>
      c.find((x) => x.pair === p)
        ? c.filter((x) => x.pair !== p)
        : [...c, { pair: p, dir: "Long" }]
    );
  const flip = (p) =>
    setPositions((c) =>
      c.map((x) =>
        x.pair === p ? { ...x, dir: x.dir === "Long" ? "Short" : "Long" } : x
      )
    );
  return (
    <>
      <Panel
        mod="Module 8 · Position sizing"
        title={`Khối lượng theo biến động — ${cfg.label}`}
        sub="Không sizing cố định — khối lượng co giãn theo biến động để rủi ro mỗi lệnh là hằng số. Vol = ATR(14) THẬT (Twelve Data OHLC khung Ngày)."
      >
        <div className="grid3">
          <div>
            <label className="lb">Vốn (USD)</label>
            <input
              className="inp"
              type="number"
              value={equity}
              onChange={(e) => setEquity(+e.target.value || 0)}
            />
          </div>
          <div>
            <label className="lb">Rủi ro mỗi lệnh (%)</label>
            <input
              className="inp"
              type="number"
              step="0.25"
              value={riskPct}
              onChange={(e) => setRiskPct(+e.target.value || 0)}
            />
          </div>
          <div>
            <label className="lb">Stop = vol ×</label>
            <input
              className="inp"
              type="number"
              step="0.25"
              value={volMult}
              onChange={(e) => setVolMult(+e.target.value || 0)}
            />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <div className="kv">
            <span>ATR(14) khung D (thật)</span>
            <span className="num">{vol.toFixed(digits)}</span>
          </div>
          <div className="kv">
            <span>Khoảng stop (vol × hệ số)</span>
            <span className="num">{stopDist.toFixed(digits)}</span>
          </div>
          <div className="kv">
            <span>Rủi ro tiền tệ mỗi lệnh</span>
            <span className="num">${riskUSD.toFixed(0)}</span>
          </div>
          <div className="kv">
            <span>Khối lượng gợi ý (xấp xỉ)</span>
            <span className="num" style={{ color: CLR.blue, fontWeight: 600 }}>
              {isFinite(sizeUnits)
                ? isCrypto
                  ? sizeUnits.toFixed(4) + " BTC"
                  : sizeUnits.toFixed(2) + " lot"
                : "—"}
            </span>
          </div>
        </div>
      </Panel>
      <div className="grid2">
        <Panel
          mod="Module 8 · Tương quan"
          title="Ma trận tương quan 60 phiên"
          sub="Cảnh báo khi hai lệnh thực chất là một cược."
        >
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th></th>
                  {matrixKeys.map((k) => (
                    <th key={k}>{pairOf(k).label.replace("/", "")}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrixKeys.map((a, i) => (
                  <tr key={a}>
                    <td style={{ color: CLR.mut, fontSize: 11 }}>
                      {pairOf(a).label}
                    </td>
                    {matrixKeys.map((b, j) => (
                      <td key={b}>
                        <div
                          className="matcell"
                          style={{ background: colFor(mat[i][j]) }}
                        >
                          {mat[i][j].toFixed(2)}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {dbl.map((d, i) => (
            <div key={i} style={{ marginTop: 10 }}>
              <Chip cls="down">
                Double risk: {d.a.dir} {pairOf(d.a.pair).label} + {d.b.dir}{" "}
                {pairOf(d.b.pair).label} (corr {d.c.toFixed(2)}) — thực chất là
                một cược nhân đôi
              </Chip>
            </div>
          ))}
          {dbl.length === 0 && (
            <div style={{ marginTop: 10 }}>
              <Chip cls="up">
                Không có cặp lệnh trùng cược trên ngưỡng |0.70|
              </Chip>
            </div>
          )}
        </Panel>
        <Panel
          mod="Module 8 · Danh mục giả định"
          title="Chọn vị thế để kiểm tra rủi ro chéo"
          sub="Bật/tắt cặp và đảo hướng để mô phỏng danh mục — kiểm tra double risk trên tương quan thật."
        >
          <table className="tbl">
            <thead>
              <tr>
                <th>Cặp</th>
                <th>Trong danh mục</th>
                <th>Hướng</th>
              </tr>
            </thead>
            <tbody>
              {matrixKeys.map((k) => {
                const pos = positions.find((x) => x.pair === k);
                return (
                  <tr key={k}>
                    <td>{pairOf(k).label}</td>
                    <td>
                      <button className="bt" onClick={() => toggle(k)}>
                        {pos ? "Bỏ" : "Thêm"}
                      </button>
                    </td>
                    <td>
                      {pos ? (
                        <button className="bt" onClick={() => flip(k)}>
                          <span
                            style={{
                              color: pos.dir === "Long" ? CLR.bull : CLR.bear,
                            }}
                          >
                            {pos.dir}
                          </span>
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="sub" style={{ marginTop: 10 }}>
            R:R tối thiểu khuyến nghị theo setup breakout/pullback: 1:2.
            Drawdown và Sharpe của chuỗi lệnh thật cần nhật ký giao dịch
            riêng để đo, không suy ra được từ đây.
          </p>
        </Panel>
      </div>
    </>
  );
}

/* ============================================================
   15. CMT — LỚP 6: KỊCH BẢN GIAO DỊCH
   ============================================================ */

// Lịch sử vào/thoát lệnh vẽ TRÊN chart giá 4H (không chỉ thống kê).
// entry: chấm đặc (xanh=Mua, đỏ=Bán) · exit: vòng tròn viền (xanh=lời, đỏ=lỗ) · nối entry→exit bằng nét đứt.
function TradeHistoryChart4H({ bars4h, marks, digits }) {
  if (!bars4h || bars4h.length < 5) return null;
  const N = Math.min(260, bars4h.length);
  const off = bars4h.length - N;
  const view = bars4h.slice(off);
  const data = view.map((b, i) => ({ x: i, c: b.c }));
  const fmt = (v) => (v == null ? "\u2014" : Number(v).toFixed(digits));
  const idxForT = (ts) => {
    if (ts == null) return null;
    let ans = null;
    for (let i = 0; i < view.length; i++) {
      if (view[i].t <= ts) ans = i;
      else break;
    }
    return ans;
  };
  const entries = [], exits = [], links = [];
  (marks || []).forEach((m) => {
    const ex = idxForT(m.entryT);
    if (ex == null) return;
    entries.push({ x: ex, y: m.entryPrice, dir: m.dir });
    const xx = idxForT(m.exitT);
    if (xx != null) {
      const win = m.r > 0;
      exits.push({ x: xx, y: m.exitPrice, win });
      links.push({ x1: ex, y1: m.entryPrice, x2: xx, y2: m.exitPrice, win });
    }
  });
  const ys = view.map((b) => b.c);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const pad = (yMax - yMin) * 0.08 || 1;
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={CLR.line} strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="x" type="number" domain={[0, view.length - 1]} hide />
        <YAxis
          domain={[yMin - pad, yMax + pad]}
          tick={{ fill: CLR.dim, fontSize: 10, fontFamily: "IBM Plex Mono" }}
          tickFormatter={fmt}
          width={64}
          tickLine={false}
          axisLine={false}
          orientation="right"
        />
        <Tooltip contentStyle={TT} labelFormatter={() => ""} formatter={(v) => [fmt(v), "Gia 4H"]} />
        {links.map((l, i) => (
          <ReferenceLine
            key={"lk" + i}
            segment={[{ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }]}
            stroke={l.win ? CLR.bull : CLR.bear}
            strokeOpacity={0.45}
            strokeDasharray="3 3"
          />
        ))}
        <Line dataKey="c" name="Gia 4H" stroke={CLR.blue} dot={false} strokeWidth={1.5} isAnimationActive={false} />
        {entries.map((e, i) => (
          <ReferenceDot key={"en" + i} x={e.x} y={e.y} r={5} fill={e.dir === "long" ? CLR.bull : CLR.bear} stroke="#0b1020" strokeWidth={1} />
        ))}
        {exits.map((e, i) => (
          <ReferenceDot key={"ex" + i} x={e.x} y={e.y} r={4} fill="none" stroke={e.win ? CLR.bull : CLR.bear} strokeWidth={1.6} />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function PlaybookChart({ dates, closes, digits, pb, ma50, ma200 }) {
  const n = Math.min(130, closes.length),
    off = closes.length - n;
  const data = closes.slice(-n).map((c, i) => ({
    d: dates[off + i],
    c,
    m50: ma50[off + i],
    m200: ma200[off + i],
  }));
  const fmt = (v) => Number(v).toFixed(digits);
  const yPad = pb.range * 0.15;
  const yMin = Math.min(pb.tB2, Math.min(...closes.slice(-n))) - yPad;
  const yMax = Math.max(pb.tA2, Math.max(...closes.slice(-n))) + yPad;
  const rl = (y, c, l, pos, dash) => (
    <ReferenceLine
      y={y}
      stroke={c}
      strokeDasharray={dash}
      strokeWidth={dash ? 1 : 1.5}
      label={{ value: l, fill: c, fontSize: dash ? 9 : 10, position: pos }}
    />
  );
  return (
    <ResponsiveContainer width="100%" height={380}>
      <ComposedChart
        data={data}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
      >
        <CartesianGrid
          stroke={CLR.line}
          strokeDasharray="2 4"
          vertical={false}
        />
        <XAxis
          dataKey="d"
          tick={{ fill: CLR.dim, fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: CLR.line }}
          minTickGap={55}
          tickFormatter={(d) => (d ? d.slice(5) : "")}
        />
        <YAxis
          domain={[yMin, yMax]}
          tick={{ fill: CLR.dim, fontSize: 10, fontFamily: "IBM Plex Mono" }}
          tickFormatter={fmt}
          width={66}
          tickLine={false}
          axisLine={false}
          orientation="right"
        />
        <Tooltip
          contentStyle={TT}
          labelStyle={{ color: CLR.mut }}
          formatter={(v, nm) =>
            v == null
              ? ["—", nm]
              : [fmt(v), nm === "c" ? "Giá" : nm.toUpperCase()]
          }
        />
        <ReferenceArea y1={pb.R} y2={yMax} fill={CLR.bull} fillOpacity={0.05} />
        <ReferenceArea y1={yMin} y2={pb.S} fill={CLR.bear} fillOpacity={0.05} />
        {pb.fibs.map((f) => (
          <ReferenceLine
            key={f.f}
            y={f.y}
            stroke={CLR.dim}
            strokeDasharray="2 6"
            strokeOpacity={0.7}
            label={{
              value: `Fib ${(f.f * 100).toFixed(1)}%`,
              fill: CLR.dim,
              fontSize: 9,
              position: "insideLeft",
            }}
          />
        ))}
        {rl(pb.R, CLR.bull, `R ${fmt(pb.R)} — trigger KB A`, "insideTopLeft")}
        {rl(
          pb.S,
          CLR.bear,
          `S ${fmt(pb.S)} — trigger KB B`,
          "insideBottomLeft"
        )}
        {rl(pb.tA1, CLR.bull, `A·T1 ${fmt(pb.tA1)}`, "insideRight", "6 4")}
        {rl(pb.tA2, CLR.bull, `A·T2 ${fmt(pb.tA2)}`, "insideRight", "6 4")}
        {rl(pb.tB1, CLR.bear, `B·T1 ${fmt(pb.tB1)}`, "insideRight", "6 4")}
        {rl(pb.tB2, CLR.bear, `B·T2 ${fmt(pb.tB2)}`, "insideRight", "6 4")}
        <Line
          dataKey="m200"
          name="MA200"
          stroke={CLR.mut}
          dot={false}
          strokeWidth={1}
          strokeDasharray="4 3"
          isAnimationActive={false}
          connectNulls
        />
        <Line
          dataKey="m50"
          name="MA50"
          stroke={CLR.amber}
          dot={false}
          strokeWidth={1.2}
          isAnimationActive={false}
          connectNulls
        />
        <Line
          dataKey="c"
          name="Giá"
          stroke={CLR.blue}
          dot={false}
          strokeWidth={1.8}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function ScenarioChart({ dates, closes, digits, pb, branch }) {
  const n = Math.min(70, closes.length),
    off = closes.length - n,
    F = 16;
  const data = [];
  for (let i = 0; i < n; i++)
    data.push({ x: i, d: dates[off + i], c: closes[off + i] });
  const mid = (pb.R + pb.S) / 2;
  let wps;
  if (branch.dir === "up")
    wps = [
      [0, pb.last],
      [4, pb.R],
      [9, pb.tA1],
      [15, pb.tA2],
    ];
  else if (branch.dir === "down")
    wps = [
      [0, pb.last],
      [4, pb.S],
      [9, pb.tB1],
      [15, pb.tB2],
    ];
  else {
    const nearTop = pb.last > mid;
    wps = [
      [0, pb.last],
      [6, nearTop ? pb.S + pb.range * 0.1 : pb.R - pb.range * 0.1],
      [12, mid],
      [15, nearTop ? pb.R - pb.range * 0.15 : pb.S + pb.range * 0.15],
    ];
  }
  const projAt = (t) => {
    for (let w = 1; w < wps.length; w++) {
      const [t0, v0] = wps[w - 1],
        [t1, v1] = wps[w];
      if (t <= t1) return v0 + (v1 - v0) * ((t - t0) / (t1 - t0 || 1));
    }
    return wps[wps.length - 1][1];
  };
  data[n - 1].proj = pb.last;
  for (let t = 1; t <= F; t++)
    data.push({ x: n - 1 + t, d: `+${t}`, proj: projAt(t) });
  const color =
    branch.dir === "up"
      ? CLR.bull
      : branch.dir === "down"
      ? CLR.bear
      : CLR.amber;
  const fmt = (v) => Number(v).toFixed(digits);
  const shown =
    branch.dir === "up"
      ? [pb.R, pb.tA1, pb.tA2, pb.S]
      : branch.dir === "down"
      ? [pb.S, pb.tB1, pb.tB2, pb.R]
      : [pb.R, pb.S];
  const yAll = [...closes.slice(-n), ...shown];
  const yMin = Math.min(...yAll) - pb.range * 0.12,
    yMax = Math.max(...yAll) + pb.range * 0.12;
  const tickF = (v) => {
    const p = data[Math.round(v)];
    return p ? (p.d.startsWith("+") ? p.d : p.d.slice(5)) : "";
  };
  const rl = (y, c, l, pos, dash) => (
    <ReferenceLine
      y={y}
      stroke={c}
      strokeDasharray={dash}
      strokeWidth={dash ? 1 : 1.4}
      label={{ value: l, fill: c, fontSize: 9, position: pos }}
    />
  );
  return (
    <div style={{ marginBottom: 10 }}>
      <ResponsiveContainer width="100%" height={225}>
        <ComposedChart
          data={data}
          margin={{ top: 6, right: 8, bottom: 0, left: 0 }}
        >
          <CartesianGrid
            stroke={CLR.line}
            strokeDasharray="2 4"
            vertical={false}
          />
          <XAxis
            dataKey="x"
            type="number"
            domain={[0, n - 1 + F]}
            tick={{ fill: CLR.dim, fontSize: 9 }}
            tickLine={false}
            axisLine={{ stroke: CLR.line }}
            tickFormatter={tickF}
            tickCount={8}
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fill: CLR.dim, fontSize: 9, fontFamily: "IBM Plex Mono" }}
            tickFormatter={fmt}
            width={62}
            tickLine={false}
            axisLine={false}
            orientation="right"
          />
          <Tooltip
            contentStyle={TT}
            labelFormatter={tickF}
            formatter={(v, nm) =>
              v == null
                ? ["—", nm]
                : [fmt(v), nm === "c" ? "Giá" : "Quỹ đạo minh hoạ"]
            }
          />
          {branch.dir === "up" && (
            <>
              <ReferenceArea
                y1={pb.R}
                y2={yMax}
                fill={CLR.bull}
                fillOpacity={0.05}
              />
              {rl(pb.R, CLR.bull, `Trigger ${fmt(pb.R)}`, "insideTopLeft")}
              {rl(pb.tA1, CLR.bull, `T1 ${fmt(pb.tA1)}`, "insideRight", "6 4")}
              {rl(pb.tA2, CLR.bull, `T2 ${fmt(pb.tA2)}`, "insideRight", "6 4")}
              {rl(
                pb.S,
                CLR.dim,
                `Bỏ KB dưới ${fmt(pb.S)}`,
                "insideBottomLeft",
                "3 5"
              )}
            </>
          )}
          {branch.dir === "down" && (
            <>
              <ReferenceArea
                y1={yMin}
                y2={pb.S}
                fill={CLR.bear}
                fillOpacity={0.05}
              />
              {rl(pb.S, CLR.bear, `Trigger ${fmt(pb.S)}`, "insideBottomLeft")}
              {rl(pb.tB1, CLR.bear, `T1 ${fmt(pb.tB1)}`, "insideRight", "6 4")}
              {rl(pb.tB2, CLR.bear, `T2 ${fmt(pb.tB2)}`, "insideRight", "6 4")}
              {rl(
                pb.R,
                CLR.dim,
                `Bỏ KB trên ${fmt(pb.R)}`,
                "insideTopLeft",
                "3 5"
              )}
            </>
          )}
          {branch.dir === "side" && (
            <>
              <ReferenceArea
                y1={pb.S}
                y2={pb.R}
                fill={CLR.amber}
                fillOpacity={0.045}
              />
              {rl(pb.R, CLR.amber, `Biên trên ${fmt(pb.R)}`, "insideTopLeft")}
              {rl(
                pb.S,
                CLR.amber,
                `Biên dưới ${fmt(pb.S)}`,
                "insideBottomLeft"
              )}
              {rl(mid, CLR.dim, "Cân bằng", "insideRight", "2 6")}
            </>
          )}
          <ReferenceLine
            x={n - 1}
            stroke={CLR.line}
            label={{
              value: "hôm nay",
              fill: CLR.dim,
              fontSize: 9,
              position: "insideTop",
            }}
          />
          <Line
            dataKey="c"
            stroke={CLR.blue}
            dot={false}
            strokeWidth={1.7}
            isAnimationActive={false}
          />
          <Line
            dataKey="proj"
            stroke={color}
            dot={false}
            strokeWidth={1.6}
            strokeDasharray="7 5"
            isAnimationActive={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="sub" style={{ margin: "4px 0 0", fontSize: 11 }}>
        Nét đứt màu = quỹ đạo minh hoạ NẾU nhánh {branch.id} kích hoạt (đi qua
        trigger → T1 → T2) — để hình dung kế hoạch theo dõi, không phải dự báo
        đường đi.
      </p>
    </div>
  );
}

function h4Note(dir, cfg) {
  const legs = ` Chân ${cfg.base}: theo dõi ${CBANK[cfg.base]}. Chân ${
    cfg.quote
  }: theo dõi ${CBANK[cfg.quote]}.`;
  if (dir === "up")
    return {
      title: "Nếu vào lệnh khung 4H — hướng MUA",
      txt:
        "Chỉ tìm lệnh mua SAU khi nến D đã đóng trên trigger. Hai cách vào: (1) chờ H4 hồi về retest vùng breakout và xuất hiện nến từ chối giảm; (2) break-and-go khi H4 đóng vững trên trigger kèm RSI H4 > 55. Thời điểm đáng tin nhất: phiên London và overlap London/NY (~14:00–23:00 giờ VN) — breakout trong phiên Á thanh khoản mỏng dễ false break. Đứng ngoài 30–60 phút quanh tin lớn." +
        legs,
    };
  if (dir === "down")
    return {
      title: "Nếu vào lệnh khung 4H — hướng BÁN",
      txt:
        "Chỉ tìm lệnh bán SAU khi nến D đã đóng dưới trigger. Hai cách vào: (1) chờ H4 hồi lên retest vùng thủng và có nến từ chối tăng; (2) break-and-go khi H4 đóng vững dưới trigger kèm RSI H4 < 45. Ưu tiên London/NY, cảnh giác cú thủng trong phiên Á; sau tin lớn chờ nến H4 đóng rồi mới đánh giá." +
        legs,
    };
  return {
    title: "Nếu vào lệnh khung 4H — giao dịch trong biên",
    txt:
      "Chỉ fade biên khi H4 có nến từ chối rõ tại biên kèm RSI H4 >70 (biên trên) hoặc <30 (biên dưới); mục tiêu biên đối diện, chốt dần ở giữa biên. Phiên Á thường tôn trọng biên tốt hơn. Không giữ lệnh range qua tin lớn. Nhánh này tự hết hiệu lực ngay khi có nến D đóng ngoài biên." +
      legs,
  };
}

const LAYER_NAMES = {
  1: "L1 Vĩ mô",
  2: "L2 Xu hướng",
  3: "L3 Cấu trúc",
  4: "L4 Xác nhận",
};

function PlaybookLayer({
  cfg,
  pb,
  dates,
  closes,
  digits,
  ma50,
  ma200,
  goLayer,
  analog,
  fibTargets,
  forward,
  gates,
}) {
  const probOf = (id) =>
    analog
      ? id === "A"
        ? analog.pA
        : id === "B"
        ? analog.pB
        : analog.pC
      : null;
  return (
    <>
      <Panel
        mod="Tổng hợp workflow"
        title={`Kịch bản giao dịch — ${cfg.label}`}
        sub="Đầu ra của trình tự CMT: giá đang kẹt giữa hỗ trợ và kháng cự xác định từ pivot thật; mỗi nhánh là một kế hoạch if-then với trigger, target, mức vô hiệu và bằng chứng bọc lót trích từ đúng lớp phân tích sinh ra nó."
      >
        <GateCascadeStrip gates={gates} />
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 10,
          }}
        >
          <Chip cls={pb.bias}>
            Cán cân bằng chứng: {pb.biasPct}% nghiêng tăng ({pb.bullScore} tăng
            · {pb.bearScore} giảm)
          </Chip>
          <Chip cls="mut">
            Biên hiện tại: {pb.S.toFixed(digits)} – {pb.R.toFixed(digits)} (rộng{" "}
            {pb.range.toFixed(digits)})
          </Chip>
          <Chip cls="mut">Giá: {pb.last.toFixed(digits)}</Chip>
        </div>
        {analog ? (
          <div className="scen" style={{ marginBottom: 10 }}>
            <b>Xác suất thực nghiệm từ lịch sử (analog)</b>
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                margin: "8px 0",
              }}
            >
              <Chip cls="up">A · phá lên: {analog.pA}%</Chip>
              <Chip cls="down">B · thủng xuống: {analog.pB}%</Chip>
              <Chip cls="side">
                C · kẹt biên sau {analog.horizon} phiên: {analog.pC}%
              </Chip>
            </div>
            <p className="sub" style={{ margin: 0 }}>
              Cách tính: quét toàn bộ lịch sử 10 năm tìm {analog.n} thời điểm có
              trạng thái giống hiện tại ({analog.desc} — khớp {analog.dims}/5
              điều kiện), rồi đếm trong {analog.horizon} phiên kế tiếp giá phá
              lên biên trước, thủng biên trước, hay vẫn kẹt. Đây là tần suất
              lịch sử của đúng cặp này, không phải xác suất tương lai; mẫu{" "}
              {analog.n} lần{" "}
              {analog.n < 40
                ? "là NHỎ — đọc thận trọng"
                : "ở mức chấp nhận được"}
              .
            </p>
          </div>
        ) : (
          <p className="sub">
            Chưa đủ trạng thái tương tự trong lịch sử để tính xác suất analog.
          </p>
        )}
        {fibTargets && (
          <div className="scen" style={{ marginBottom: 10 }}>
            <b>
              🎯 Mục tiêu tối ưu (Fibonacci/pivot) — xa nhất đạt ≥
              {fibTargets.minHitRatePct}% xác suất
            </b>
            <p className="sub" style={{ margin: "6px 0 10px" }}>
              Cùng {fibTargets.n} lần khớp trạng thái ở trên, quét các mức
              Fibonacci/pivot từ gần tới xa (bội số của biên R−S) mỗi hướng, tìm
              mức XA NHẤT mà lịch sử vẫn chạm được ≥{fibTargets.minHitRatePct}%
              trong tối đa {fibTargets.horizon} phiên — bỏ qua các mức quá gần
              (gần R/S thường chạm gần 100% nhưng dư thừa, không đáng làm mục
              tiêu).
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div
                className="kv"
                style={{
                  flex: "1 1 260px",
                  border: `1px solid ${
                    fibTargets.better === "up" ? CLR.bull : CLR.line
                  }`,
                  borderRadius: 10,
                  padding: 10,
                  display: "block",
                }}
              >
                <div style={{ color: CLR.bull, fontWeight: 700 }}>
                  LÊN (phá R){fibTargets.better === "up" ? " · TỐI ƯU HƠN" : ""}
                </div>
                {fibTargets.up ? (
                  <>
                    <div
                      className="num"
                      style={{ fontSize: 18, margin: "6px 0" }}
                    >
                      {fibTargets.up.price.toFixed(digits)}
                    </div>
                    <div className="sub">
                      = R + {fibTargets.up.mult.toFixed(1)}× biên · xác suất{" "}
                      <b style={{ color: CLR.bull }}>
                        {fibTargets.up.hitRatePct}%
                      </b>{" "}
                      chạm trong ≤{fibTargets.horizon} phiên
                    </div>
                    <div className="sub">
                      Trung vị{" "}
                      {fibTargets.up.medianDays != null
                        ? `${fibTargets.up.medianDays} phiên (P25–P75: ${fibTargets.up.p25Days}–${fibTargets.up.p75Days})`
                        : "—"}
                    </div>
                  </>
                ) : (
                  <div className="sub">
                    Không có mức nào (kể cả rất gần R) đạt ≥
                    {fibTargets.minHitRatePct}% — hướng lên hiện không đủ tin
                    cậy.
                  </div>
                )}
              </div>
              <div
                className="kv"
                style={{
                  flex: "1 1 260px",
                  border: `1px solid ${
                    fibTargets.better === "down" ? CLR.bear : CLR.line
                  }`,
                  borderRadius: 10,
                  padding: 10,
                  display: "block",
                }}
              >
                <div style={{ color: CLR.bear, fontWeight: 700 }}>
                  XUỐNG (thủng S)
                  {fibTargets.better === "down" ? " · TỐI ƯU HƠN" : ""}
                </div>
                {fibTargets.down ? (
                  <>
                    <div
                      className="num"
                      style={{ fontSize: 18, margin: "6px 0" }}
                    >
                      {fibTargets.down.price.toFixed(digits)}
                    </div>
                    <div className="sub">
                      = S − {fibTargets.down.mult.toFixed(1)}× biên · xác suất{" "}
                      <b style={{ color: CLR.bear }}>
                        {fibTargets.down.hitRatePct}%
                      </b>{" "}
                      chạm trong ≤{fibTargets.horizon} phiên
                    </div>
                    <div className="sub">
                      Trung vị{" "}
                      {fibTargets.down.medianDays != null
                        ? `${fibTargets.down.medianDays} phiên (P25–P75: ${fibTargets.down.p25Days}–${fibTargets.down.p75Days})`
                        : "—"}
                    </div>
                  </>
                ) : (
                  <div className="sub">
                    Không có mức nào (kể cả rất gần S) đạt ≥
                    {fibTargets.minHitRatePct}% — hướng xuống hiện không đủ tin
                    cậy.
                  </div>
                )}
              </div>
            </div>
            <p className="sub" style={{ margin: "10px 0 0" }}>
              "TỐI ƯU HƠN" = hướng có mục tiêu xa hơn (kỳ vọng lãi/rủi ro tốt
              hơn) trong khi vẫn giữ cùng ngưỡng xác suất — không phải xác suất
              cao hơn (cả 2 hướng đều đã được lọc về đúng ngưỡng{" "}
              {fibTargets.minHitRatePct}%). Giả định tỷ lệ chạm giảm dần khi mức
              càng xa; nếu mẫu {fibTargets.n} nhỏ, số liệu kém tin cậy.
            </p>
          </div>
        )}
        {forward && (
          <div className="scen" style={{ marginBottom: 10 }}>
            <b>📊 Xác suất chạm R/S &amp; hướng giá {forward.maxSess} phiên tới</b>
            <p className="sub" style={{ margin: "4px 0 8px" }}>
              Cùng {forward.n} lần khớp trạng thái ở trên ({forward.dims}/5
              điều kiện) — đo bằng High/Low thật (chạm bằng bóng nến cũng
              tính, không cần đóng cửa vượt qua).
            </p>
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 10,
              }}
            >
              <Chip cls="up">
                Chạm R trong ≤{forward.maxSess} phiên: {forward.touchRPct}%
                {forward.medianDaysToR != null
                  ? ` (trung vị ${forward.medianDaysToR} phiên)`
                  : ""}
              </Chip>
              <Chip cls="down">
                Chạm S trong ≤{forward.maxSess} phiên: {forward.touchSPct}%
                {forward.medianDaysToS != null
                  ? ` (trung vị ${forward.medianDaysToS} phiên)`
                  : ""}
              </Chip>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Phiên tới</th>
                  <th>% Tăng</th>
                  <th>% Giảm</th>
                  <th>% Đi ngang</th>
                  <th>Biến động TB</th>
                </tr>
              </thead>
              <tbody>
                {forward.bySession.map((s) => (
                  <tr key={s.n}>
                    <td className="num">+{s.n}</td>
                    <td className="num" style={{ color: CLR.bull }}>
                      {s.upPct}%
                    </td>
                    <td className="num" style={{ color: CLR.bear }}>
                      {s.downPct}%
                    </td>
                    <td className="num" style={{ color: CLR.dim }}>
                      {s.flatPct}%
                    </td>
                    <td className="num">
                      {s.avgRetPct != null ? `${s.avgRetPct.toFixed(2)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="sub" style={{ margin: "8px 0 0" }}>
              "% Tăng/Giảm" so giá đóng cửa tại đúng N phiên sau so với lúc
              khớp trạng thái (ngưỡng đi ngang ±0.05%). Đây là tần suất lịch
              sử, không phải dự báo — mẫu {forward.n} lần{" "}
              {forward.n < 40 ? "là NHỎ, đọc thận trọng" : "ở mức chấp nhận được"}.
            </p>
          </div>
        )}
        <PlaybookChart
          dates={dates}
          closes={closes}
          digits={digits}
          pb={pb}
          ma50={ma50}
          ma200={ma200}
        />
        <p className="sub" style={{ marginTop: 8 }}>
          Vùng xanh/đỏ mờ = không gian kịch bản A/B sau khi kích hoạt. Đường
          liền = biên S–R (trigger). Đường đứt = target đo bằng biên độ. Đường
          chấm xám = Fib retracement của swing chính. MA50 vàng, MA200 xám.
        </p>
      </Panel>

      {pb.branches.map((b) => (
        <Panel
          key={b.id}
          mod={`Nhánh ${b.id}${
            probOf(b.id) != null ? ` · xác suất analog ~${probOf(b.id)}%` : ""
          }`}
          title={b.title}
          sub={
            b.dir === "side"
              ? "Kịch bản mặc định khi chưa nhánh nào kích hoạt."
              : undefined
          }
        >
          <ScenarioChart
            dates={dates}
            closes={closes}
            digits={digits}
            pb={pb}
            branch={b}
          />
          <div className="kv">
            <span>Điều kiện kích hoạt</span>
            <span>{b.trigger}</span>
          </div>
          {b.dir !== "side" && (
            <div className="kv">
              <span>Khoảng cách tới trigger</span>
              <span className="num">
                {(
                  (Math.abs((b.dir === "up" ? pb.R : pb.S) - pb.last) /
                    pb.last) *
                  100
                ).toFixed(2)}
                % (
                {Math.abs((b.dir === "up" ? pb.R : pb.S) - pb.last).toFixed(
                  digits
                )}
                )
              </span>
            </div>
          )}
          <div className="kv">
            <span>Mục tiêu nếu kích hoạt</span>
            <span>
              {b.targets.map((t, i) => (
                <div key={i} className="num" style={{ textAlign: "right" }}>
                  {t}
                </div>
              ))}
            </span>
          </div>
          <div className="kv">
            <span>Mức vô hiệu</span>
            <span style={{ color: CLR.amber }}>{b.invalid}</span>
          </div>
          <div className="fnote">
            <b>{h4Note(b.dir, cfg).title}</b>
            {h4Note(b.dir, cfg).txt}
          </div>
          <div style={{ marginTop: 10 }}>
            <div className="sub" style={{ marginBottom: 6 }}>
              Dựa vào đâu — indicator & lớp phân tích bọc lót ({b.score}/
              {b.total} đang ủng hộ):
            </div>
            {b.evidence.map((e, i) => (
              <div key={i} className="rule">
                <span className={e.ok ? "ok" : "no"}>{e.ok ? "✓" : "✕"}</span>
                <span>{e.txt}</span>
                <button
                  className="bt"
                  style={{
                    marginLeft: "auto",
                    padding: "2px 8px",
                    fontSize: 10.5,
                  }}
                  onClick={() => goLayer(e.layer - 1)}
                >
                  {LAYER_NAMES[e.layer]}
                </button>
              </div>
            ))}
          </div>
        </Panel>
      ))}
      <Warn>
        Kịch bản là kế hoạch theo dõi có điều kiện, không phải khuyến nghị vào
        lệnh. Trigger dùng giá đóng cửa D (ECB fixing) — trong phiên giá có thể
        chạm mức mà chưa kích hoạt. Trước khi hành động theo bất kỳ nhánh nào,
        bắt buộc qua L5 (sizing theo biến động + kiểm tra double-risk).
      </Warn>
    </>
  );
}

/* ============================================================
   16. CMT — LỚP 7: KIỂM CHỨNG LỊCH SỬ
   ============================================================ */

function HistoryLayer({ cfg, hist, digits }) {
  if (!hist)
    return <Panel mod="Kiểm chứng" title="Đang tính lịch sử 10 năm…" />;
  const { events, rule, confl, closes, dates, system, swings } = hist;
  const eqLen = Math.max(
    system.sys.eq ? system.sys.eq.length : 0,
    system.raw.eq ? system.raw.eq.length : 0
  );
  const eqData = Array.from({ length: eqLen }, (_, k) => ({
    x: k + 1,
    sys: system.sys.eq && system.sys.eq[k] ? system.sys.eq[k].eq : null,
    raw: system.raw.eq && system.raw.eq[k] ? system.raw.eq[k].eq : null,
  }));
  const groups = {};
  events.forEach((e) => {
    if (!groups[e.name])
      groups[e.name] = { n: 0, hit: 0, fail: 0, open: 0, bars: [] };
    const g = groups[e.name];
    g.n++;
    g[e.res]++;
    if (e.bars != null && e.res === "hit") g.bars.push(e.bars);
  });
  const rows = Object.entries(groups).map(([name, g]) => {
    const decided = g.hit + g.fail;
    const med = g.bars.length
      ? g.bars.sort((a, b) => a - b)[Math.floor(g.bars.length / 2)]
      : null;
    return {
      name,
      ...g,
      rate: decided ? Math.round((g.hit / decided) * 100) : null,
      med,
    };
  });
  const totHit = events.filter((e) => e.res === "hit").length;
  const totFail = events.filter((e) => e.res === "fail").length;
  const totRate =
    totHit + totFail ? Math.round((totHit / (totHit + totFail)) * 100) : null;
  const step = Math.max(1, Math.floor(closes.length / 1000));
  const data = [];
  for (let i = 0; i < closes.length; i += step)
    data.push({ x: i, d: dates[i], c: closes[i] });
  const fmt = (v) => Number(v).toFixed(digits);
  const evColor = { hit: CLR.bull, fail: CLR.bear, open: CLR.amber };
  const resVN = { hit: "Đạt target", fail: "Vô hiệu", open: "Chưa phân định" };
  const tickF = (v) =>
    dates[Math.round(v)] ? dates[Math.round(v)].slice(0, 7) : "";
  return (
    <>
      <Panel
        mod="Kiểm chứng · Toàn hệ thống"
        title={`Đánh giá hệ thống giao dịch hoàn chỉnh — ${cfg.label}`}
        sub="Chạy đúng bộ quy tắc của bước Kịch bản như một hệ thống: vào lệnh khi breakout biên 40 phiên VÀ bộ lọc confluence đồng thuận (≥3/5: Dow, giá vs MA50, MA50 vs MA200, RSI, MACD); thoát tại T1 / false-break / hết 30 phiên; tối đa 1 vị thế. So với breakout thuần để thấy bộ lọc CMT thêm/bớt được gì."
      >
        <table className="tbl" style={{ marginBottom: 12 }}>
          <thead>
            <tr>
              <th>Hệ thống</th>
              <th>Số lệnh</th>
              <th>Tỷ lệ thắng</th>
              <th>TB mỗi lệnh (vol)</th>
              <th>Profit factor</th>
              <th>Max drawdown (vol)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Breakout + bộ lọc confluence CMT</td>
              <td className="num">{system.sys.n}</td>
              <td className="num" style={{ color: CLR.bull }}>
                {system.sys.n ? `${system.sys.winRate}%` : "—"}
              </td>
              <td className="num">{system.sys.avg ?? "—"}</td>
              <td className="num">{system.sys.pf ?? "—"}</td>
              <td className="num" style={{ color: CLR.bear }}>
                {system.sys.maxDD ?? "—"}
              </td>
            </tr>
            <tr>
              <td style={{ color: CLR.mut }}>
                Breakout thuần (không lọc — đối chứng)
              </td>
              <td className="num">{system.raw.n}</td>
              <td className="num">
                {system.raw.n ? `${system.raw.winRate}%` : "—"}
              </td>
              <td className="num">{system.raw.avg ?? "—"}</td>
              <td className="num">{system.raw.pf ?? "—"}</td>
              <td className="num">{system.raw.maxDD ?? "—"}</td>
            </tr>
          </tbody>
        </table>
        {eqLen > 0 && (
          <>
            <div className="sub" style={{ marginBottom: 4 }}>
              Equity curve luỹ kế (đơn vị vol-proxy, theo thứ tự lệnh)
            </div>
            <ResponsiveContainer width="100%" height={190}>
              <LineChart data={eqData}>
                <CartesianGrid
                  stroke={CLR.line}
                  strokeDasharray="2 4"
                  vertical={false}
                />
                <XAxis
                  dataKey="x"
                  tick={{ fill: CLR.dim, fontSize: 9 }}
                  tickLine={false}
                  axisLine={{ stroke: CLR.line }}
                />
                <YAxis
                  tick={{
                    fill: CLR.dim,
                    fontSize: 9,
                    fontFamily: "IBM Plex Mono",
                  }}
                  width={44}
                  tickLine={false}
                  axisLine={false}
                />
                <ReferenceLine y={0} stroke={CLR.line} />
                <Tooltip contentStyle={TT} />
                <Line
                  dataKey="sys"
                  name="Có bộ lọc CMT"
                  stroke={CLR.bull}
                  dot={false}
                  strokeWidth={1.8}
                  isAnimationActive={false}
                  connectNulls
                />
                <Line
                  dataKey="raw"
                  name="Breakout thuần"
                  stroke={CLR.mut}
                  dot={false}
                  strokeWidth={1.2}
                  strokeDasharray="5 4"
                  isAnimationActive={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
            <p className="sub" style={{ marginTop: 6 }}>
              Nếu đường xanh không hơn đường xám rõ rệt trên cặp này, nghĩa là
              bộ lọc confluence chưa cộng giá trị cho kiểu breakout ở đây — đó
              cũng là một kết luận đáng giá, đừng ép hệ thống chạy.
            </p>
          </>
        )}
      </Panel>

      <Panel
        mod="Kiểm chứng · Mẫu hình"
        title={`Mẫu hình đã xuất hiện — ${cfg.label} (10 năm)`}
        sub="Mỗi chấm là một lần mẫu hình hoàn thành breakout trong quá khứ; màu = kết quả trong 40 phiên sau đó."
      >
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 10,
          }}
        >
          <Chip cls="mut">Tổng {events.length} lần xuất hiện</Chip>
          {totRate != null && (
            <Chip cls={totRate >= 55 ? "up" : totRate <= 45 ? "down" : "side"}>
              Tỷ lệ đạt target chung: {totRate}% ({totHit}/{totHit + totFail} đã
              phân định)
            </Chip>
          )}
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid
              stroke={CLR.line}
              strokeDasharray="2 4"
              vertical={false}
            />
            <XAxis
              dataKey="x"
              type="number"
              domain={[0, closes.length - 1]}
              tick={{ fill: CLR.dim, fontSize: 9 }}
              tickLine={false}
              axisLine={{ stroke: CLR.line }}
              tickFormatter={tickF}
              tickCount={8}
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fill: CLR.dim, fontSize: 9, fontFamily: "IBM Plex Mono" }}
              tickFormatter={fmt}
              width={62}
              tickLine={false}
              axisLine={false}
              orientation="right"
            />
            <Tooltip
              contentStyle={TT}
              labelFormatter={tickF}
              formatter={(v) => [fmt(v), "Giá"]}
            />
            <Line
              dataKey="c"
              stroke={CLR.blue}
              dot={false}
              strokeWidth={1.2}
              isAnimationActive={false}
            />
            {events.map((e, i) => (
              <ReferenceDot
                key={i}
                x={e.i}
                y={e.entry}
                r={4}
                fill={evColor[e.res]}
                stroke="#0d1322"
                strokeWidth={1}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
        <table className="tbl" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Mẫu hình</th>
              <th>Số lần</th>
              <th>Đạt</th>
              <th>Vô hiệu</th>
              <th>Chưa rõ</th>
              <th>Tỷ lệ đạt</th>
              <th>Median phiên tới target</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td className="num">{r.n}</td>
                <td className="num" style={{ color: CLR.bull }}>
                  {r.hit}
                </td>
                <td className="num" style={{ color: CLR.bear }}>
                  {r.fail}
                </td>
                <td className="num" style={{ color: CLR.amber }}>
                  {r.open}
                </td>
                <td className="num">{r.rate != null ? `${r.rate}%` : "—"}</td>
                <td className="num">{r.med != null ? r.med : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} style={{ color: CLR.mut }}>
                  Không tìm thấy mẫu hình hoàn chỉnh nào theo điều kiện quét.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>

      <Panel
        mod="Kiểm chứng · Sóng"
        title="Chu kỳ & biên độ sóng lịch sử (swing pivot-to-pivot)"
        sub="Nền của mọi cách đếm Elliott: mỗi sóng quá khứ kéo dài bao nhiêu phiên và chạy bao nhiêu % — thước kỳ vọng cho sóng đang đếm ở bước 3."
      >
        <table className="tbl" style={{ marginBottom: 12 }}>
          <thead>
            <tr>
              <th>Chiều sóng</th>
              <th>Số sóng</th>
              <th>Median thời gian</th>
              <th>P25–P75 (phiên)</th>
              <th>Median biên độ</th>
              <th>P25–P75 (%)</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["up", "Sóng tăng", swings.up],
              ["down", "Sóng giảm", swings.down],
            ].map(([k, label, st]) => (
              <tr key={k}>
                <td>
                  <Chip cls={k}>{label}</Chip>
                </td>
                {st.n ? (
                  <>
                    <td className="num">{st.n}</td>
                    <td className="num">
                      {st.medBars} phiên (~{st.medDays} ngày lịch)
                    </td>
                    <td className="num">
                      {st.p25B}–{st.p75B}
                    </td>
                    <td className="num">{st.medAmpl}%</td>
                    <td className="num">
                      {st.p25A}–{st.p75A}%
                    </td>
                  </>
                ) : (
                  <td colSpan={5} style={{ color: CLR.mut }}>
                    Chưa đủ dữ liệu
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="grid2">
          <div>
            <div className="sub" style={{ marginBottom: 4 }}>
              Phân phối thời gian sóng (phiên)
            </div>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={swings.hDur}>
                <XAxis
                  dataKey="bucket"
                  tick={{ fill: CLR.dim, fontSize: 9 }}
                  tickLine={false}
                  axisLine={{ stroke: CLR.line }}
                />
                <YAxis hide allowDecimals={false} />
                <Tooltip contentStyle={TT} />
                <Bar
                  dataKey="up"
                  name="Sóng tăng"
                  fill={CLR.bull}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="down"
                  name="Sóng giảm"
                  fill={CLR.bear}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div>
            <div className="sub" style={{ marginBottom: 4 }}>
              Phân phối biên độ sóng (%)
            </div>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={swings.hAmp}>
                <XAxis
                  dataKey="bucket"
                  tick={{ fill: CLR.dim, fontSize: 9 }}
                  tickLine={false}
                  axisLine={{ stroke: CLR.line }}
                />
                <YAxis hide allowDecimals={false} />
                <Tooltip contentStyle={TT} />
                <Bar
                  dataKey="up"
                  name="Sóng tăng"
                  fill={CLR.bull}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="down"
                  name="Sóng giảm"
                  fill={CLR.bear}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        {swings.cur && (
          <div className="scen" style={{ marginTop: 12 }}>
            <b>Sóng hiện tại (từ pivot {swings.cur.from})</b>
            <div className="kv">
              <span>Chiều & tuổi sóng</span>
              <span className="num">
                {swings.cur.dir === "up" ? "Tăng" : "Giảm"} · {swings.cur.bars}{" "}
                phiên (~{swings.cur.days} ngày lịch)
              </span>
            </div>
            <div className="kv">
              <span>Biên độ đã chạy</span>
              <span className="num">{swings.cur.amplPct}%</span>
            </div>
            <div className="kv">
              <span>So với lịch sử cùng chiều</span>
              <span className="num">
                dài hơn {swings.cur.pctBars ?? "—"}% số sóng · biên độ vượt{" "}
                {swings.cur.pctAmpl ?? "—"}% số sóng
              </span>
            </div>
            <p className="sub" style={{ margin: "8px 0 0" }}>
              {swings.cur.pctBars != null &&
              (swings.cur.pctBars >= 75 || swings.cur.pctAmpl >= 75)
                ? "Sóng đang GIÀ so với phân phối lịch sử — kỳ vọng nối dài cần bằng chứng mạnh hơn bình thường; hợp lý hơn là canh pivot kết thúc sóng."
                : swings.cur.pctBars != null &&
                  swings.cur.pctBars <= 25 &&
                  swings.cur.pctAmpl <= 25
                ? "Sóng còn TRẺ so với lịch sử — nếu các lớp khác đồng pha, dư địa theo thống kê vẫn còn."
                : "Sóng ở vùng giữa phân phối — không dùng riêng tuổi sóng để kết luận."}
            </p>
          </div>
        )}
      </Panel>

      <Panel
        mod="Kiểm chứng · Chi tiết"
        title="Các lần xuất hiện gần nhất"
        sub="Đọc từng sự kiện để hiểu bối cảnh — con số tổng hợp không thay được việc xem chart từng lần."
      >
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Ngày breakout</th>
                <th>Mẫu hình</th>
                <th>Hướng</th>
                <th>Giá breakout</th>
                <th>Target</th>
                <th>Kết quả</th>
                <th>Số phiên</th>
              </tr>
            </thead>
            <tbody>
              {events
                .slice(-14)
                .reverse()
                .map((e, i) => (
                  <tr key={i}>
                    <td className="num">{e.date}</td>
                    <td>{e.name}</td>
                    <td>
                      <Chip cls={e.dir === "tăng" ? "up" : "down"}>
                        {e.dir}
                      </Chip>
                    </td>
                    <td className="num">{e.entry.toFixed(digits)}</td>
                    <td className="num">{e.target.toFixed(digits)}</td>
                    <td>
                      <Chip
                        cls={
                          e.res === "hit"
                            ? "up"
                            : e.res === "fail"
                            ? "down"
                            : "side"
                        }
                      >
                        {resVN[e.res]}
                      </Chip>
                    </td>
                    <td className="num">{e.bars ?? "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid2">
        <Panel
          mod="Kiểm chứng · Quy tắc playbook"
          title="Breakout biên 40 phiên → T1 (0.618×biên)"
          sub="Kiểm chứng đúng quy tắc mà bước Kịch bản và Bộ lọc đang dùng."
        >
          {["up", "down"].map((d) => (
            <div key={d} className="kv">
              <span>
                {d === "up" ? "Phá lên (kiểu KB A)" : "Thủng xuống (kiểu KB B)"}{" "}
                — {rule[d].n} lần
              </span>
              <span className="num">
                {rule[d].rate != null ? `${rule[d].rate}% đạt T1` : "—"} ·{" "}
                {rule[d].hit}✓ {rule[d].fail}✕ {rule[d].open}∼
              </span>
            </div>
          ))}
          <p className="sub" style={{ marginTop: 10 }}>
            Vô hiệu = đóng cửa quay lại trong biên (false break) trước khi chạm
            T1, cửa sổ 30 phiên.
          </p>
        </Panel>
        <Panel
          mod="Kiểm chứng · Confluence"
          title="Dow (rolling) + RSI cắt 40/60"
          sub="Pivot chỉ được dùng sau khi đã xác nhận đủ 4 phiên — không nhìn trước tương lai."
        >
          {confl ? (
            <>
              <div className="kv">
                <span>Số lần khớp</span>
                <span className="num">{confl.n}</span>
              </div>
              <div className="kv">
                <span>Tỷ lệ dương sau 12 phiên</span>
                <span className="num">{confl.winRate}%</span>
              </div>
              <div className="kv">
                <span>Kết quả TB (đơn vị vol-proxy)</span>
                <span className="num">{confl.avgR}R</span>
              </div>
            </>
          ) : (
            <p className="sub">Không có lần khớp nào trên lịch sử.</p>
          )}
        </Panel>
      </div>
      <Warn>
        Giới hạn: (1) giá ECB fixing 1 lần/ngày — bỏ qua biến động trong phiên
        nên kết quả thật có thể xấu hơn; (2) chưa tính spread/phí; (3) pivot cần
        4 phiên xác nhận nên nhận diện mẫu hình luôn có độ trễ; (4) mẫu vài chục
        lần là nhỏ về mặt thống kê. Con số này đo "quy tắc như đã cài đặt",
        không phải toàn bộ phương pháp CMT.
      </Warn>
    </>
  );
}

/* ============================================================
   17. CMT — LỚP 8: TỔNG HỢP & KẾ HOẠCH
   ============================================================ */

function MiniIfChart({ kind, dates, closes, digits, pb, vol, cot, curDir }) {
  if (kind === "cot") {
    if (!cot || cot.length < 10)
      return <p className="sub">Chưa có dữ liệu COT cho cặp này.</p>;
    const v = cot.map((x) => x.net);
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    const sd =
      Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) || 1;
    return (
      <div>
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={cot}>
            <XAxis
              dataKey="d"
              tick={{ fill: CLR.dim, fontSize: 9 }}
              tickLine={false}
              axisLine={{ stroke: CLR.line }}
              minTickGap={60}
              tickFormatter={(d) => d.slice(2, 7)}
            />
            <YAxis hide domain={["auto", "auto"]} />
            <ReferenceLine
              y={m + 1.5 * sd}
              stroke={CLR.bear}
              strokeDasharray="5 4"
              label={{
                value: "+1.5σ — cực đoan long",
                fill: CLR.bear,
                fontSize: 9,
                position: "insideTopLeft",
              }}
            />
            <ReferenceLine
              y={m - 1.5 * sd}
              stroke={CLR.bear}
              strokeDasharray="5 4"
              label={{
                value: "−1.5σ — cực đoan short",
                fill: CLR.bear,
                fontSize: 9,
                position: "insideBottomLeft",
              }}
            />
            <ReferenceLine y={m} stroke={CLR.line} />
            <Tooltip
              contentStyle={TT}
              formatter={(x) => [x.toLocaleString(), "Net"]}
            />
            <Bar dataKey="net" isAnimationActive={false}>
              {cot.map((x, i) => (
                <Cell key={i} fill={x.net >= 0 ? CLR.bull : CLR.bear} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
        <p className="sub" style={{ margin: "4px 0 0", fontSize: 11 }}>
          Cột chạm vạch đỏ = positioning cực đoan: đám đông đầu cơ đã dồn hết
          một phía, nhiên liệu cho squeeze ngược chiều.
        </p>
      </div>
    );
  }
  const n = Math.min(60, closes.length),
    off = closes.length - n,
    F = 14;
  const last = pb.last,
    mid = (pb.R + pb.S) / 2;
  const data = [];
  for (let i = 0; i < n; i++)
    data.push({ x: i, d: dates[off + i], c: closes[off + i] });
  const sign = curDir === "up" ? 1 : -1;
  const fx = (v) => Number(v).toFixed(digits);
  let w1 = null,
    w2 = null,
    color = CLR.amber,
    lines = [],
    areas = [],
    dot = null,
    note = "";
  if (kind === "A") {
    color = CLR.bull;
    w1 = [
      [0, last],
      [4, pb.R],
      [9, pb.tA1],
      [13, pb.tA2],
    ];
    lines = [
      { y: pb.R, c: CLR.bull, l: `Trigger ${fx(pb.R)}`, pos: "insideTopLeft" },
      {
        y: pb.tA1,
        c: CLR.bull,
        d: 1,
        l: `T1 ${fx(pb.tA1)}`,
        pos: "insideRight",
      },
      {
        y: pb.tA2,
        c: CLR.bull,
        d: 1,
        l: `T2 ${fx(pb.tA2)}`,
        pos: "insideRight",
      },
    ];
    areas = [{ y1: pb.R, y2: "max", f: CLR.bull }];
    note =
      "Kích hoạt khi nến D ĐÓNG trên trigger; quỹ đạo minh hoạ đường tới T1 → T2.";
  } else if (kind === "B") {
    color = CLR.bear;
    w1 = [
      [0, last],
      [4, pb.S],
      [9, pb.tB1],
      [13, pb.tB2],
    ];
    lines = [
      {
        y: pb.S,
        c: CLR.bear,
        l: `Trigger ${fx(pb.S)}`,
        pos: "insideBottomLeft",
      },
      {
        y: pb.tB1,
        c: CLR.bear,
        d: 1,
        l: `T1 ${fx(pb.tB1)}`,
        pos: "insideRight",
      },
      {
        y: pb.tB2,
        c: CLR.bear,
        d: 1,
        l: `T2 ${fx(pb.tB2)}`,
        pos: "insideRight",
      },
    ];
    areas = [{ y1: "min", y2: pb.S, f: CLR.bear }];
    note =
      "Kích hoạt khi nến D ĐÓNG dưới trigger; quỹ đạo minh hoạ đường tới T1 → T2.";
  } else if (kind === "rejR") {
    w1 = [
      [0, last],
      [3, pb.R],
      [7, mid],
      [13, pb.S + pb.range * 0.2],
    ];
    lines = [
      {
        y: pb.R,
        c: CLR.amber,
        l: `Từ chối tại ${fx(pb.R)}`,
        pos: "insideTopLeft",
      },
      {
        y: pb.S,
        c: CLR.dim,
        d: 1,
        l: `Biên dưới ${fx(pb.S)}`,
        pos: "insideBottomLeft",
      },
    ];
    areas = [{ y1: pb.S, y2: pb.R, f: CLR.amber }];
    note =
      "Chạm biên trên nhưng KHÔNG đóng cửa qua → giá thường quay về giữa/biên dưới; cũng là bẫy false break cho ai mua đuổi trong phiên.";
  } else if (kind === "rejS") {
    w1 = [
      [0, last],
      [3, pb.S],
      [7, mid],
      [13, pb.R - pb.range * 0.2],
    ];
    lines = [
      {
        y: pb.S,
        c: CLR.amber,
        l: `Từ chối tại ${fx(pb.S)}`,
        pos: "insideBottomLeft",
      },
      {
        y: pb.R,
        c: CLR.dim,
        d: 1,
        l: `Biên trên ${fx(pb.R)}`,
        pos: "insideTopLeft",
      },
    ];
    areas = [{ y1: pb.S, y2: pb.R, f: CLR.amber }];
    note =
      "Chạm biên dưới nhưng bật lại và đóng cửa trong biên → dao động về giữa/biên trên.";
  } else if (kind === "pivot") {
    w1 = [
      [0, last],
      [3, last + sign * vol * 2],
      [5, last + sign * vol * 2.6],
      [13, last - sign * vol * 4],
    ];
    dot = { x: n - 1 + 5, y: last + sign * vol * 2.6, l: "pivot mới?" };
    note = `Sóng ${
      curDir === "up" ? "tăng" : "giảm"
    } hiện tại đảo chiều tạo pivot → biên S–R và mọi kịch bản được tính lại; pivot cần 4 phiên để xác nhận.`;
  } else if (kind === "news") {
    w1 = [
      [0, last],
      [2, last + vol * 5],
      [4, last + vol * 1.5],
      [13, last + vol * 2.5],
    ];
    w2 = [
      [0, last],
      [2, last - vol * 5],
      [4, last - vol * 1.5],
      [13, last - vol * 2.5],
    ];
    color = CLR.mut;
    lines = [
      { y: pb.R, c: CLR.dim, d: 1, l: `R ${fx(pb.R)}`, pos: "insideTopLeft" },
      {
        y: pb.S,
        c: CLR.dim,
        d: 1,
        l: `S ${fx(pb.S)}`,
        pos: "insideBottomLeft",
      },
    ];
    note =
      "Tin lớn giật cả hai hướng với biên độ gấp nhiều lần ngày thường rồi mới chọn hướng — vì thế đứng ngoài 30–60 phút và chỉ tin nến H4/D đã đóng.";
  } else {
    w1 = [
      [0, last],
      [5, mid],
      [13, mid],
    ];
    lines = [
      { y: pb.R, c: CLR.amber, l: `R ${fx(pb.R)}`, pos: "insideTopLeft" },
      { y: pb.S, c: CLR.amber, l: `S ${fx(pb.S)}`, pos: "insideBottomLeft" },
    ];
    areas = [{ y1: pb.S, y2: pb.R, f: CLR.amber }];
    note =
      "Hết cửa sổ mà vẫn trong biên: kịch bản C đã đúng, nhưng xác suất analog đã hết hạn — chạy lại phân tích, không tái dùng số cũ.";
  }
  const interp = (wps, t) => {
    for (let w = 1; w < wps.length; w++) {
      const [t0, v0] = wps[w - 1],
        [t1, v1] = wps[w];
      if (t <= t1) return v0 + (v1 - v0) * ((t - t0) / (t1 - t0 || 1));
    }
    return wps[wps.length - 1][1];
  };
  data[n - 1].p1 = last;
  if (w2) data[n - 1].p2 = last;
  for (let t = 1; t <= F; t++) {
    const row = { x: n - 1 + t, d: `+${t}`, p1: interp(w1, t) };
    if (w2) row.p2 = interp(w2, t);
    data.push(row);
  }
  const yAll = [
    ...closes.slice(-n),
    ...lines.map((l) => l.y),
    ...data.filter((r) => r.p1 != null).map((r) => r.p1),
    ...(w2 ? data.filter((r) => r.p2 != null).map((r) => r.p2) : []),
  ];
  const yMin = Math.min(...yAll) - pb.range * 0.1,
    yMax = Math.max(...yAll) + pb.range * 0.1;
  const tickF = (v) => {
    const p = data[Math.round(v)];
    return p ? (p.d.startsWith("+") ? p.d : p.d.slice(5)) : "";
  };
  return (
    <div>
      <ResponsiveContainer width="100%" height={190}>
        <ComposedChart
          data={data}
          margin={{ top: 6, right: 8, bottom: 0, left: 0 }}
        >
          <CartesianGrid
            stroke={CLR.line}
            strokeDasharray="2 4"
            vertical={false}
          />
          <XAxis
            dataKey="x"
            type="number"
            domain={[0, n - 1 + F]}
            tick={{ fill: CLR.dim, fontSize: 9 }}
            tickLine={false}
            axisLine={{ stroke: CLR.line }}
            tickFormatter={tickF}
            tickCount={7}
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fill: CLR.dim, fontSize: 9, fontFamily: "IBM Plex Mono" }}
            tickFormatter={fx}
            width={60}
            tickLine={false}
            axisLine={false}
            orientation="right"
          />
          <Tooltip
            contentStyle={TT}
            labelFormatter={tickF}
            formatter={(v, nm) =>
              v == null
                ? ["—", nm]
                : [fx(v), nm === "c" ? "Giá" : "Quỹ đạo minh hoạ"]
            }
          />
          {areas.map((a, i) => (
            <ReferenceArea
              key={i}
              y1={a.y1 === "min" ? yMin : a.y1}
              y2={a.y2 === "max" ? yMax : a.y2}
              fill={a.f}
              fillOpacity={0.05}
            />
          ))}
          {lines.map((l, i) => (
            <ReferenceLine
              key={i}
              y={l.y}
              stroke={l.c}
              strokeDasharray={l.d ? "6 4" : undefined}
              strokeWidth={l.d ? 1 : 1.3}
              label={{ value: l.l, fill: l.c, fontSize: 9, position: l.pos }}
            />
          ))}
          <ReferenceLine
            x={n - 1}
            stroke={CLR.line}
            label={{
              value: "hôm nay",
              fill: CLR.dim,
              fontSize: 9,
              position: "insideTop",
            }}
          />
          {dot && (
            <ReferenceDot
              x={dot.x}
              y={dot.y}
              r={4}
              fill={CLR.amber}
              stroke="#0d1322"
              label={{
                value: dot.l,
                fill: CLR.amber,
                fontSize: 9,
                position: "top",
              }}
            />
          )}
          <Line
            dataKey="c"
            stroke={CLR.blue}
            dot={false}
            strokeWidth={1.6}
            isAnimationActive={false}
          />
          <Line
            dataKey="p1"
            stroke={color}
            dot={false}
            strokeWidth={1.5}
            strokeDasharray="7 5"
            isAnimationActive={false}
            connectNulls
          />
          {w2 && (
            <Line
              dataKey="p2"
              stroke={color}
              dot={false}
              strokeWidth={1.5}
              strokeDasharray="7 5"
              isAnimationActive={false}
              connectNulls
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      <p className="sub" style={{ margin: "4px 0 0", fontSize: 11 }}>
        {note}
      </p>
    </div>
  );
}

function SummaryLayer({ cfg, model, hist, digits, goLayer }) {
  const [openRow, setOpenRow] = useState(null);
  const pb = model.playbook;
  const gate = model.tradeGate;
  const gates = model.gates;
  const curDir =
    hist && hist.swings && hist.swings.cur
      ? hist.swings.cur.dir
      : pb.biasPct >= 50
      ? "up"
      : "down";
  const an = hist ? hist.analog : null;
  const sys = hist ? hist.system : null;
  const sw = hist ? hist.swings : null;
  const vol = model.vol;
  const fx = (v) => v.toFixed(digits);

  const biasBranch = pb.bias === "up" ? "A" : pb.bias === "down" ? "B" : "C";
  let plan = { branch: "C", mode: "wait", agree: false };
  if (an) {
    const maxP = Math.max(an.pA, an.pB, an.pC);
    const probBranch = maxP === an.pA ? "A" : maxP === an.pB ? "B" : "C";
    const agree = probBranch === biasBranch;
    if (agree && probBranch !== "C" && maxP >= 45)
      plan = { branch: probBranch, mode: "follow", agree: true, p: maxP };
    else if (agree && probBranch === "C")
      plan = { branch: "C", mode: "range", agree: true, p: maxP };
    else if (maxP >= 60)
      plan = { branch: probBranch, mode: "follow", agree: false, p: maxP };
    else plan = { branch: "C", mode: "wait", agree: false, p: maxP };
  }
  const planB = pb.branches.find((b) => b.id === plan.branch) || pb.branches[2];
  const trigLevel =
    plan.branch === "A" ? pb.R : plan.branch === "B" ? pb.S : null;
  const distA = Math.abs(pb.R - pb.last),
    distB = Math.abs(pb.S - pb.last);
  const barsToA = vol ? Math.max(1, Math.round(distA / vol)) : null;
  const barsToB = vol ? Math.max(1, Math.round(distB / vol)) : null;
  const pfv = (x) => (x === "∞" ? 1e9 : parseFloat(x));
  const filterAdds =
    sys && sys.sys.n >= 10 && sys.raw.n >= 10
      ? pfv(sys.sys.pf) > pfv(sys.raw.pf)
      : null;
  const swOld =
    sw &&
    sw.cur &&
    sw.cur.pctBars != null &&
    (sw.cur.pctBars >= 75 || sw.cur.pctAmpl >= 75);
  const swYoung =
    sw &&
    sw.cur &&
    sw.cur.pctBars != null &&
    sw.cur.pctBars <= 25 &&
    sw.cur.pctAmpl <= 25;
  const ma50l = model.ma50[model.ma50.length - 1],
    ma200l = model.ma200[model.ma200.length - 1];
  const maClose =
    ma50l != null &&
    ma200l != null &&
    Math.abs(ma50l - ma200l) / pb.last < 0.0018;

  const planTitle =
    plan.mode === "follow"
      ? `Theo dõi kích hoạt Nhánh ${plan.branch} — ${
          plan.branch === "A"
            ? `chờ nến D đóng trên ${fx(pb.R)}`
            : `chờ nến D đóng dưới ${fx(pb.S)}`
        }`
      : plan.mode === "range"
      ? `Giao dịch trong biên ${fx(pb.S)} – ${fx(
          pb.R
        )} (Nhánh C) theo điều kiện fade`
      : "Đứng ngoài quan sát — bằng chứng và xác suất chưa đồng thuận";

  const planSteps =
    plan.mode === "follow"
      ? [
          `Chưa làm gì trước khi có nến D đóng ${
            plan.branch === "A" ? "trên" : "dưới"
          } ${fx(trigLevel)} — chạm trong phiên KHÔNG tính.`,
          `Khi kích hoạt: xuống khung 4H vào theo footnote nhánh ${plan.branch} (ưu tiên retest có nến từ chối; phiên London/NY).`,
          "Khối lượng lấy từ bước 5 (rủi ro cố định theo vol-proxy, kiểm tra double-risk nếu đang giữ cặp khác).",
          `Vô hiệu & thoát: ${planB.invalid}`,
        ]
      : plan.mode === "range"
      ? [
          "Chỉ fade tại biên khi H4 có nến từ chối + RSI H4 cực trị (chi tiết footnote nhánh C).",
          `Chốt dần ở giữa biên ${fx(
            (pb.R + pb.S) / 2
          )}; mục tiêu biên đối diện.`,
          "Bỏ toàn bộ kế hoạch range ngay khi có nến D đóng ngoài biên — chuyển sang nhánh A/B tương ứng.",
        ]
      : [
          `Không mở vị thế mới trên ${cfg.label} cho đến khi: (1) nến D đóng ngoài biên, hoặc (2) xác suất analog và cán cân bằng chứng cùng chỉ về một nhánh.`,
          "Trong lúc chờ: theo dõi danh sách bên dưới, cập nhật lại app mỗi ngày sau giờ chốt ECB (~21:15 giờ VN).",
        ];

  const watch = [
    {
      ok: true,
      txt: `Trigger A tại ${fx(pb.R)} — cách ${(
        (distA / pb.last) *
        100
      ).toFixed(
        2
      )}% (~${barsToA} phiên di chuyển trung bình). Trigger B tại ${fx(
        pb.S
      )} — cách ${((distB / pb.last) * 100).toFixed(2)}% (~${barsToB} phiên).`,
    },
    ...(an
      ? [
          {
            ok: true,
            txt: `Xác suất analog tính cho cửa sổ ${an.horizon} phiên tới (A ${an.pA}% · B ${an.pB}% · C ${an.pC}%, mẫu ${an.n} lần) — hết cửa sổ mà chưa nhánh nào nổ thì trạng thái đã đổi, đọc lại từ đầu.`,
          },
        ]
      : []),
    ...(sw && sw.cur
      ? [
          {
            ok: !swOld,
            txt: swOld
              ? `Sóng ${
                  sw.cur.dir === "up" ? "tăng" : "giảm"
                } hiện tại đã GIÀ (dài hơn ${
                  sw.cur.pctBars
                }% sóng lịch sử) — ưu tiên canh pivot kết thúc sóng hơn là đu theo.`
              : swYoung
              ? `Sóng hiện tại còn trẻ (${sw.cur.bars} phiên, ~P${sw.cur.pctBars}) — dư địa thống kê còn nếu các lớp đồng pha.`
              : `Sóng hiện tại ${sw.cur.bars} phiên (~P${sw.cur.pctBars} lịch sử) — vùng giữa phân phối, trung tính.`,
          },
        ]
      : []),
    ...(model.div.type
      ? [
          {
            ok: false,
            txt: `${model.div.txt} — nếu giá tiến về trigger thuận chiều phân kỳ thì tin cậy tăng, ngược chiều thì cảnh giác.`,
          },
        ]
      : []),
    ...(maClose
      ? [
          {
            ok: false,
            txt: "MA50 và MA200 đang sát nhau (chênh <0.18%) — golden/death cross có thể xảy ra trong vài phiên, sẽ đổi một điều kiện bọc lót.",
          },
        ]
      : []),
    {
      ok: true,
      txt: "COT cập nhật thứ Sáu hàng tuần (số liệu chốt thứ Ba) — mở lại bước 4 sau cập nhật; positioning đảo cực đoan làm đổi cán cân.",
    },
    {
      ok: true,
      txt: `Lịch tin: CPI/FOMC (mọi cặp); ${CBANK[cfg.base]} (chân ${
        cfg.base
      }); ${CBANK[cfg.quote]} (chân ${
        cfg.quote
      }). Đứng ngoài 30–60 phút quanh tin.`,
    },
    {
      ok: true,
      txt: "Giá app là ECB fixing (1 lần/ngày, ~21:15 giờ VN) — trong phiên hãy đối chiếu giá realtime của broker với các mức S/R ở đây.",
    },
  ];

  const ifThen = [
    {
      kind: "A",
      ev: `Nến D đóng trên ${fx(pb.R)}`,
      re: `Nhánh A kích hoạt${
        an ? ` (analog ${an.pA}%)` : ""
      }: vào theo footnote 4H nhánh A; target ${fx(pb.tA1)} → ${fx(
        pb.tA2
      )}; vô hiệu nếu đóng lại dưới ${fx(pb.R)}.`,
      layer: 5,
    },
    {
      kind: "B",
      ev: `Nến D đóng dưới ${fx(pb.S)}`,
      re: `Nhánh B kích hoạt${
        an ? ` (analog ${an.pB}%)` : ""
      }: vào theo footnote 4H nhánh B; target ${fx(pb.tB1)} → ${fx(
        pb.tB2
      )}; vô hiệu nếu đóng lại trên ${fx(pb.S)}.`,
      layer: 5,
    },
    {
      kind: "rejR",
      ev: `Chạm ${fx(pb.R)} trong phiên rồi đóng cửa quay xuống`,
      re: "Từ chối tại biên → điều kiện fade của nhánh C (chỉ khi H4 có nến từ chối + RSI H4 >70); đồng thời là cảnh báo false break cho ai đu sớm.",
      layer: 5,
    },
    {
      kind: "rejS",
      ev: `Chạm ${fx(pb.S)} trong phiên rồi đóng cửa bật lên`,
      re: `Từ chối tại biên dưới → fade nhánh C chiều mua (RSI H4 <30); mục tiêu giữa biên ${fx(
        (pb.R + pb.S) / 2
      )}.`,
      layer: 5,
    },
    {
      kind: "pivot",
      ev: "Xuất hiện pivot mới (sóng hiện tại kết thúc)",
      re: "Biên S–R và toàn bộ kịch bản được tính lại — mở lại bước 3 xem kịch bản đếm sóng mới, bước 7 xem tuổi sóng reset.",
      layer: 2,
    },
    {
      kind: "news",
      ev: `Tin lớn ra (CPI/FOMC/${CBANK[cfg.base]}/${CBANK[cfg.quote]})`,
      re: "Không hành động 30–60 phút; chỉ đánh giá khi nến H4 sau tin đã đóng; nếu tin đẩy giá đóng D qua trigger thì kịch bản vẫn tính là kích hoạt.",
      layer: 0,
    },
    {
      kind: "cot",
      ev: "COT tuần mới đảo chiều hoặc vượt |z|≥1.5",
      re: "Giảm tin cậy hướng đang theo (rủi ro squeeze); nếu đang giữ lệnh theo positioning cũ, siết vô hiệu gần hơn.",
      layer: 3,
    },
    ...(an
      ? [
          {
            kind: "timeout",
            ev: `Hết ${an.horizon} phiên mà giá vẫn kẹt trong biên`,
            re: "Kịch bản C đã đúng — nhưng trạng thái analog cũng đã cũ: chạy lại phân tích từ bước 1, không tái sử dụng xác suất cũ.",
            layer: 0,
          },
        ]
      : []),
  ];

  return (
    <>
      <Panel
        mod="Tổng hợp · Kế hoạch chính"
        title={planTitle}
        sub="Suy ra tự động từ: xác suất analog lịch sử × cán cân bằng chứng 5 lớp × chất lượng hệ thống đã kiểm chứng × tuổi sóng. Mọi con số bấm được về đúng bước sinh ra nó."
      >
        {!hist && (
          <p className="sub">
            Đang tính lịch sử 10 năm — xác suất analog và kiểm chứng hệ thống sẽ
            hiện sau vài giây…
          </p>
        )}
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          {an && (
            <Chip cls={plan.agree ? "up" : "side"}>
              {plan.agree
                ? `Analog và bằng chứng CÙNG chỉ về nhánh ${biasBranch}`
                : `Analog (${plan.branch}) và bằng chứng (${biasBranch}) đang LỆCH nhau — lý do khiến kế hoạch thận trọng`}
            </Chip>
          )}
          {an && (
            <Chip cls="mut">
              Analog: A {an.pA}% · B {an.pB}% · C {an.pC}% (n={an.n})
            </Chip>
          )}
          <Chip cls={pb.bias}>Bằng chứng: {pb.biasPct}% nghiêng tăng</Chip>
          {filterAdds != null && (
            <Chip cls={filterAdds ? "up" : "down"}>
              {filterAdds
                ? `Bộ lọc CMT ĐÃ cộng giá trị trên ${cfg.label} (PF ${sys.sys.pf} vs ${sys.raw.pf})`
                : `Bộ lọc CMT CHƯA hơn breakout thuần trên ${cfg.label} (PF ${sys.sys.pf} vs ${sys.raw.pf}) → hạ kỳ vọng, sizing nhỏ lại`}
            </Chip>
          )}
        </div>
        <ol
          style={{
            margin: 0,
            paddingLeft: 20,
            display: "flex",
            flexDirection: "column",
            gap: 7,
            fontSize: 13,
          }}
        >
          {planSteps.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ol>
        <div
          style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}
        >
          <button className="bt" onClick={() => goLayer(5)}>
            Mở chi tiết kịch bản (bước 6)
          </button>
          <button className="bt" onClick={() => goLayer(4)}>
            Tính khối lượng (bước 5)
          </button>
          <button className="bt" onClick={() => goLayer(6)}>
            Xem kiểm chứng (bước 7)
          </button>
        </div>
      </Panel>

      <Panel
        mod="Tổng hợp · Trạng thái"
        title="Trạng thái CMT hiện tại"
        sub="Tóm tắt trạng thái breakout/trong biên và đồng thuận đa khung — dùng để đối chiếu nhanh trước khi qua bước kế hoạch."
      >
        <GateCascadeStrip gates={gates} />
        {gate.active ? (
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <Chip cls={gate.dir === "long" ? "up" : "down"}>
              ● CMT: BREAKOUT {gate.dir === "long" ? "LONG" : "SHORT"}
            </Chip>
            <Chip cls="mut">
              Phá {gate.dir === "long" ? "lên trên" : "xuống dưới"}{" "}
              {gate.level.toFixed(digits)} từ {gate.sinceDate} · đã đi{" "}
              {gate.distPct.toFixed(2)}%
            </Chip>
            {gate.conflict && (
              <Chip cls="side">
                ⚠ Breakout ngược cán cân bằng chứng ({pb.biasPct}%) — rủi ro
                false break
              </Chip>
            )}
            {gate.conflictW && (
              <Chip cls="side">⚠ Lệnh D ngược xu hướng khung Tuần</Chip>
            )}
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <Chip cls="side">● CMT: ĐANG TRONG BIÊN</Chip>
            <Chip cls="mut">
              Biên {gate.S.toFixed(digits)} – {gate.R.toFixed(digits)} · còn{" "}
              {gate.distPct != null ? gate.distPct.toFixed(2) : "—"}% là chạm
              biên {gate.nextDir === "long" ? "trên" : "dưới"}
            </Chip>
          </div>
        )}
      </Panel>

      <Panel
        mod="Tổng hợp · Theo dõi"
        title="Vài ngày tới cần quan tâm"
        sub="Danh sách canh me sinh tự động từ trạng thái hiện tại — xem lại mỗi ngày sau giờ chốt ECB."
      >
        {watch.map((w, i) => (
          <div
            key={i}
            className="rule"
            style={{ padding: "5px 0", alignItems: "flex-start" }}
          >
            <span className={w.ok ? "ok" : "no"} style={{ marginTop: 2 }}>
              {w.ok ? "•" : "⚠"}
            </span>
            <span>{w.txt}</span>
          </div>
        ))}
      </Panel>

      <Panel
        mod="Tổng hợp · Nếu — thì"
        title="Cây phản ứng theo tình huống"
        sub="Quyết định trước khi chuyện xảy ra — đến lúc xảy ra chỉ việc thực hiện, không suy nghĩ lại giữa chừng."
      >
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: "32%" }}>Nếu…</th>
                <th>Thì…</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {ifThen.map((r, i) => (
                <React.Fragment key={i}>
                  <tr
                    onClick={() => setOpenRow(openRow === i ? null : i)}
                    style={{ cursor: "pointer" }}
                  >
                    <td style={{ verticalAlign: "top" }}>
                      <span
                        style={{
                          color: openRow === i ? CLR.blue : CLR.dim,
                          marginRight: 6,
                        }}
                      >
                        {openRow === i ? "▾" : "▸"}
                      </span>
                      <b style={{ fontSize: 12.5 }}>{r.ev}</b>
                    </td>
                    <td style={{ color: "#b9c4dc", verticalAlign: "top" }}>
                      {r.re}
                    </td>
                    <td style={{ verticalAlign: "top", whiteSpace: "nowrap" }}>
                      <button
                        className="bt"
                        style={{
                          padding: "3px 8px",
                          fontSize: 10.5,
                          marginRight: 6,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenRow(openRow === i ? null : i);
                        }}
                      >
                        {openRow === i ? "Ẩn chart" : "Chart"}
                      </button>
                      <button
                        className="bt"
                        style={{ padding: "3px 8px", fontSize: 10.5 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          goLayer(r.layer);
                        }}
                      >
                        Mở bước
                      </button>
                    </td>
                  </tr>
                  {openRow === i && (
                    <tr>
                      <td
                        colSpan={3}
                        style={{
                          padding: "10px 8px 14px",
                          background: "rgba(26,36,64,.5)",
                        }}
                      >
                        <MiniIfChart
                          kind={r.kind}
                          dates={model.winDates}
                          closes={model.winCloses}
                          digits={digits}
                          pb={pb}
                          vol={vol}
                          cot={model.cot}
                          curDir={curDir}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Warn>
        Trang này tổng hợp máy móc từ các bước 1–7 trên dữ liệu ECB (giá đóng,
        T+1) và lịch sử 10 năm của đúng cặp {cfg.label}. Xác suất là tần suất
        quá khứ, không phải cam kết tương lai; kế hoạch là khung theo dõi có
        điều kiện, quyết định vào lệnh và chịu rủi ro là của bạn.
      </Warn>
    </>
  );
}

/* ============================================================
   19. TRÌNH CMT (8 bước) — bọc quanh 1 cặp
   ============================================================ */

function buildCMTModel(barsByTF, dxySeries, vixSeries, cot, seas, cfg) {
  // Ngày là khung "trục" cho toàn bộ engine Close-based bên dưới (RSI/MACD/
  // analog/pattern/playbook...) — nhưng giờ closes/dates lấy từ Close THẬT Twelve
  // Data (không còn là fixing ECB), và cao/thấp (highD/lowD) là High/Low thật của
  // chính nến Ngày đó — không còn suy diễn hay rơi về High=Low=Close nữa.
  const barsD = barsByTF.D;
  const closes = barsD.map((b) => b.c);
  const dates = barsD.map((b) => b.d.slice(0, 10));
  const highD = barsD.map((b) => b.h),
    lowD = barsD.map((b) => b.l);

  // 5 khung Tháng/Tuần/Ngày/4H/1H — TẤT CẢ đều pivot + Dow-trend trên OHLC thật,
  // không còn suy Tuần/Tháng từ Close Ngày (aggWeekly/aggMonthly cũ).
  const fM = tfFrame(barsByTF.M, 2),
    fW = tfFrame(barsByTF.W, 2),
    fD = tfFrame(barsD, 4),
    f4 = tfFrame(barsByTF.H4, 3),
    f1 = tfFrame(barsByTF.H1, 3);
  const dM = { trend: fM.trend, detail: fM.detail },
    dW = { trend: fW.trend, detail: fW.detail },
    dD = { trend: fD.trend, detail: fD.detail };
  const frames = {
    M: { trend: fM.trend, detail: fM.detail },
    W: { trend: fW.trend, detail: fW.detail },
    D: { trend: fD.trend, detail: fD.detail },
    H4: { trend: f4.trend, detail: f4.detail },
    H1: { trend: f1.trend, detail: f1.detail },
    consensus: fW.trend === fD.trend && fD.trend !== "side",
    fullAlign:
      fM.trend === fW.trend && fW.trend === fD.trend && fD.trend !== "side",
    // Đồng thuận xuống tới vào lệnh: Ngày→4H→1H — dùng khi vào lệnh/nhồi lệnh thực tế.
    intradayAlign:
      fD.trend === f4.trend && f4.trend === f1.trend && f1.trend !== "side",
  };
  // ---- LỆNH THEO KHUNG THÁNG→TUẦN→NGÀY→4H→1H (Tháng là gốc, mỗi khung con chỉ
  // cảnh báo MỀM khi ngược khung cha — không chặn lệnh) ----
  const gateM = frameGate(dM, fM.piv, barsByTF.M.map((b) => b.d.slice(0, 10)), null, "M");
  const gateW = frameGate(dW, fW.piv, barsByTF.W.map((b) => b.d.slice(0, 10)), gateM, "W");
  const gate4 = frameGate(f4, f4.piv, barsByTF.H4.map((b) => b.d), null, "H4");
  const gate1 = frameGate(f1, f1.piv, barsByTF.H1.map((b) => b.d), gate4, "H1");
  const cascade = stepDownCascadeOHLC(barsByTF.M, barsByTF.W, barsD);

  // Vol dùng cho sizing/pattern-threshold giờ là ATR THẬT (High/Low), không còn proxy |ΔClose|.
  const atrD = atrOHLC(barsD, 14);
  const av = atrD[atrD.length - 1] ?? volProxy(closes)[closes.length - 1];
  const winN = Math.min(160, closes.length);
  const winCloses = closes.slice(-winN),
    winDates = dates.slice(-winN);
  // pivWin tính lại trên chính cửa sổ Ngày OHLC thật (không còn winHighD/winLowD rời rạc).
  const pivWin = pivotsOHLC(barsD.slice(-winN), 4);
  const pivD = fD.piv;
  const patterns = detectPatterns(winCloses, pivWin, av * 3, cfg.digits);
  const scens = elliottScenarios(pivWin, cfg.digits);

  const rsiArr = rsi(closes),
    macdArr = macd(closes),
    stochArr = stochClose(closes);
  const ma50 = sma(closes, 50),
    ma200 = sma(closes, 200);
  const strength = trendStrength(closes);
  const div = rsiDivergence(closes, rsiArr, pivD);
  const pr = returns(closes);
  const corr = {
    dxy: pearson(pr.slice(-60), returns(dxySeries).slice(-60)),
    vix:
      vixSeries && vixSeries.length
        ? pearson(pr.slice(-60), returns(vixSeries.map((x) => x.v)).slice(-60))
        : 0,
  };
  const chg = (arr, n) => arr[arr.length - 1] - arr[arr.length - 1 - n];
  // Diverge chỉ có ý nghĩa với cặp có USD, không phải EUR (EUR quá gắn DXY)
  const usdBase = cfg.base === "USD";
  const sameSign = Math.sign(chg(closes, 15)) === Math.sign(chg(dxySeries, 15));
  const eurLinked = cfg.base === "EUR" || cfg.quote === "EUR";
  const diverge = !cfg.cross && !eurLinked && (usdBase ? !sameSign : sameSign);

  const cotZ = (() => {
    if (!cot || cot.length < 10) return null;
    const v = cot.map((x) => x.net);
    const m = v.reduce((s, x) => s + x, 0) / v.length;
    const sd =
      Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length) || 1;
    return (v[v.length - 1] - m) / sd;
  })();

  let cross = null,
    legs = null;
  if (cfg.cross) {
    const tA = dD.trend; // dùng chính cặp cho cross agree đơn giản hoá; chân riêng cần chuỗi 2 cặp phụ (thêm ở root)
    cross = null; // được gán ở root nơi có đủ chuỗi 2 chân
  }

  const playbook = buildPlaybook({
    closes,
    piv: pivWin.map((p) => ({ ...p })),
    frames,
    rsiArr,
    macdArr,
    scens,
    patterns,
    diverge,
    cotZ,
    ma50,
    ma200,
    strength,
    div,
    digits: cfg.digits,
    cfg,
  });

  // ---- CỔNG VÀO LỆNH CMT ----
  // "Trong lệnh" = giá đóng cửa đã phá ra ngoài biên 40 phiên (breakout đã kích hoạt).
  const lastC = closes[closes.length - 1];
  // Biên breakout 40 phiên giờ đo bằng High/Low THẬT (không chỉ Close) — một cây nến
  // râu dài chọc thủng biên vẫn được tính, đúng bản chất OHLC hơn so với chỉ so Close.
  const wH40 = highD.slice(-41, -1),
    wL40 = lowD.slice(-41, -1);
  const R40 = Math.max(...wH40),
    S40 = Math.min(...wL40);
  const band40 = Math.max(R40 - S40, 1e-9);
  let tradeGate = {
    active: false,
    dir: null,
    state: "IN_RANGE",
    level: null,
    R: R40,
    S: S40,
    sinceDate: null,
    distPct: null,
    conflict: false,
  };
  const findBreakDate = (above) => {
    // ngày gần nhất giá bắt đầu ở ngoài biên theo hướng đó (biên đo bằng High/Low thật)
    let j = closes.length - 1;
    while (j > 1) {
      const hj = highD.slice(Math.max(0, j - 41), j - 1);
      const lj = lowD.slice(Math.max(0, j - 41), j - 1);
      if (!hj.length) break;
      const rj = Math.max(...hj),
        sj = Math.min(...lj);
      const out = above ? closes[j - 1] > rj : closes[j - 1] < sj;
      if (!out) break;
      j--;
    }
    return dates[Math.min(closes.length - 1, j)];
  };
  if (lastC > R40)
    tradeGate = {
      active: true,
      dir: "long",
      state: "RUN_UP",
      level: R40,
      R: R40,
      S: S40,
      sinceDate: findBreakDate(true),
      distPct: ((lastC - R40) / lastC) * 100,
      conflict: playbook.bias === "down",
    };
  else if (lastC < S40)
    tradeGate = {
      active: true,
      dir: "short",
      state: "RUN_DOWN",
      level: S40,
      R: R40,
      S: S40,
      sinceDate: findBreakDate(false),
      distPct: ((S40 - lastC) / lastC) * 100,
      conflict: playbook.bias === "up",
    };
  else {
    const near = Math.min(R40 - lastC, lastC - S40) / band40 < 0.15;
    tradeGate.state = near ? "NEAR_TRIGGER" : "IN_RANGE";
    tradeGate.distPct = (Math.min(R40 - lastC, lastC - S40) / lastC) * 100;
    tradeGate.nextDir = lastC - S40 > R40 - lastC ? "long" : "short";
  }
  // Lệnh D phụ thuộc lệnh W: chỉ cảnh báo mềm khi ngược nhau, không chặn lệnh D.
  tradeGate.tf = "D";
  tradeGate.conflictW = !!(
    tradeGate.active &&
    gateW.active &&
    gateW.dir !== tradeGate.dir
  );
  tradeGate.conflictNoteW = tradeGate.conflictW
    ? `Ngược xu hướng khung W (${
        gateW.dir === "long" ? "Long" : "Short"
      }) — chỉ cảnh báo, không chặn lệnh.`
    : null;
  const gates = { D: tradeGate, W: gateW, M: gateM, H4: gate4, H1: gate1 };

  const lastRSI = rsiArr[rsiArr.length - 1],
    lastM = macdArr[macdArr.length - 1];
  const confirmOK =
    (dD.trend === "up" && lastRSI > 50 && lastM.macd > lastM.signal) ||
    (dD.trend === "down" && lastRSI < 50 && lastM.macd < lastM.signal);
  const verdicts = [
    diverge || dD.trend === "side" ? "side" : dD.trend,
    frames.fullAlign ? dD.trend : frames.consensus ? dD.trend : "side",
    scens.length ? scens[0].dir : "side",
    confirmOK ? (dD.trend === "side" ? "side" : dD.trend) : "side",
    "side",
    playbook.bias,
    "side",
    playbook.bias,
  ];
  return {
    closes,
    dates,
    barsByTF,
    frames,
    pivD,
    pivW: fW.piv,
    pivM: fM.piv,
    piv4: f4.piv,
    piv1: f1.piv,
    cascade,
    patterns,
    scens,
    rsiArr,
    macdArr,
    stochArr,
    ma50,
    ma200,
    strength,
    div,
    corr,
    diverge,
    cotZ,
    legs,
    cross,
    playbook,
    tradeGate,
    gates,
    winCloses,
    winDates,
    verdicts,
    vol: av,
    digits: cfg.digits,
    seas,
  };
}

/* ============================================================
   20. ROOT
   ============================================================ */

function IntradayTab({ cfg, digits, state }) {
  const { status, error, model, step8Model, t90Bt, indicator90, lab, symbol, opts, setOpts } = state;
  const fx = (v) => (v == null ? "—" : Number(v).toFixed(digits));
  if (status === "err")
    return (
      <Panel
        mod="1H/4H/D/W"
        title={`Không tải được dữ liệu OHLC cho ${symbol}`}
      >
        <Warn>{error || "Lỗi không rõ."}</Warn>
        <p className="sub">
          Kiểm tra API key Twelve Data, hoặc cặp này có thể không có sẵn ở
          Twelve Data dưới dạng symbol "{symbol}".
        </p>
      </Panel>
    );
  if (status !== "ok" || !model)
    return (
      <Panel
        mod="1H/4H/D/W"
        title={`Đang tải OHLC Daily/Weekly/4H/1H cho ${symbol}…`}
      >
        <p className="sub">
          Twelve Data — 4 khung nến thật (O/H/L/C), pivot Ngày/Tuần tính lại từ
          High/Low thật thay vì Close-only.
        </p>
      </Panel>
    );
  const trendVN = { up: "Tăng", down: "Giảm", side: "Đi ngang" };
  const trendClr = (t) =>
    t === "up" ? CLR.bull : t === "down" ? CLR.bear : CLR.amber;
  const srcVN = {
    daily: "mốc Ngày",
    weekly: "mốc Tuần",
    atr_fallback: "ATR (không có mốc cấu trúc gần)",
  };
  return (
    <>
      <Panel
        mod="Daily = xu hướng chính"
        title={`Xu hướng Ngày/Tuần — ${cfg.label}`}
        sub={`Nến Ngày gần nhất ${model.lastBarDaily.d} · Nến Tuần gần nhất ${model.lastBarWeekly.d} (pivot tính từ High/Low thật)`}
      >
        <div
          style={{
            display: "flex",
            gap: 24,
            alignItems: "center",
            marginBottom: 10,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div className="sub">Ngày (quyết định hướng lệnh)</div>
            <span
              style={{
                fontSize: 22,
                fontWeight: 800,
                color: trendClr(model.dailyTrend),
              }}
            >
              {trendVN[model.dailyTrend]}
            </span>
          </div>
          <div>
            <div className="sub">Tuần (bộ lọc — không được đi ngược)</div>
            <span
              style={{
                fontSize: 22,
                fontWeight: 800,
                color: trendClr(model.weeklyTrend),
              }}
            >
              {trendVN[model.weeklyTrend]}
            </span>
          </div>
        </div>
        <p className="sub" style={{ margin: 0 }}>
          Chỉ vào lệnh khi Ngày có hướng rõ và Tuần không ngược chiều. 4H dùng
          làm "cửa sổ hồi giá" (giá vừa hồi xong, quay lại đúng hướng Ngày); 1H
          là điểm bấm cò (RSI thoát vùng quá mua/bán).
        </p>
      </Panel>

      <Panel
        mod="Gợi ý lệnh"
        title="Tín hiệu hiện tại"
        sub={`Nến 4H gần nhất ${model.lastBar4h.d} UTC · Nến 1H gần nhất ${model.lastBar1h.d} UTC`}
      >
        {model.suggestion ? (
          <div
            style={{
              border: `1px solid ${CLR.line}`,
              borderRadius: 12,
              padding: 14,
            }}
          >
            <b
              style={{
                color: model.suggestion.dir === "long" ? CLR.bull : CLR.bear,
              }}
            >
              {model.suggestion.isAddon
                ? `NHỒI THÊM LỆNH (lệnh thứ ${
                    model.suggestion.addonCount + 1
                  } cùng nhịp Ngày)`
                : "Tín hiệu MỚI vừa đóng nến 1H"}
              : {model.suggestion.dir === "long" ? "MUA (long)" : "BÁN (short)"}
            </b>
            <p className="sub" style={{ margin: "6px 0 0" }}>
              Vào lệnh quanh giá mở nến 1H kế tiếp (≈{" "}
              {fx(model.suggestion.refPrice)}) · SL {fx(model.suggestion.sl)} ·
              TP {fx(model.suggestion.tp)} ({srcVN[model.suggestion.tpSource]})
              · R:R ≈ {model.suggestion.rr.toFixed(2)}
            </p>
          </div>
        ) : (
          <Warn>
            Chưa có tín hiệu mới ở nến 1H vừa đóng. Chờ giá hồi về trong cửa sổ
            4H rồi RSI 1H thoát vùng quá mua/bán CÙNG chiều Ngày (hiện tại:{" "}
            {trendVN[model.dailyTrend]}).
          </Warn>
        )}
      </Panel>

      {t90Bt && (
        <Panel
          mod="Backtest T90"
          title="Backtest theo mục tiêu T90 — 1H/4H × T90 Ngày/Tuần"
          sub="Vào: pullback về EMA20 khung vào + đóng nến quay lại theo trend (Dow) khung target · TP = T90 tính causal trên khung target · SL = swing gần nhất khung vào · R chuẩn theo rủi ro tới SL. Chạm T90% = tỉ lệ lệnh chạm mục tiêu."
        >
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Tổ hợp</th>
                  <th>Số lệnh</th>
                  <th>Win%</th>
                  <th>Chạm T90%</th>
                  <th>Dính SL%</th>
                  <th>Hết hạn%</th>
                  <th>R TB/lệnh</th>
                  <th>PF</th>
                  <th>Tổng R</th>
                  <th>MaxDD (R)</th>
                  <th>Giữ TB (nến)</th>
                </tr>
              </thead>
              <tbody>
                {t90Bt.combos.map((c, i) =>
                  c.m.n ? (
                    <tr key={i}>
                      <td style={{ fontWeight: 700 }}>{c.name}</td>
                      <td className="num">{c.m.n}</td>
                      <td className="num">{c.m.win}%</td>
                      <td className="num" style={{ color: CLR.bull }}>{c.m.tpHit}%</td>
                      <td className="num" style={{ color: CLR.bear }}>{c.m.slHit}%</td>
                      <td className="num">{c.m.to}%</td>
                      <td className="num" style={{ color: c.m.avgR >= 0 ? CLR.bull : CLR.bear }}>{c.m.avgR}R</td>
                      <td className="num">{c.m.pf === Infinity ? "∞" : c.m.pf}</td>
                      <td className="num" style={{ color: c.m.totR >= 0 ? CLR.bull : CLR.bear }}>{c.m.totR}R</td>
                      <td className="num" style={{ color: CLR.amber }}>{c.m.maxDD}R</td>
                      <td className="num">{c.m.avgHold}</td>
                    </tr>
                  ) : (
                    <tr key={i}>
                      <td style={{ fontWeight: 700 }}>{c.name}</td>
                      <td className="num" colSpan={10} style={{ color: CLR.dim }}>
                        không đủ dữ liệu / không có lệnh
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
          <p className="sub" style={{ marginTop: 8 }}>
            T90 Ngày = TP gần → tỉ lệ chạm cao nhưng R nhỏ; T90 Tuần = TP xa → chạm ít hơn nhưng R lớn khi trúng. So Win% ↔ R TB ↔ PF để chọn tổ hợp hợp gu.
          </p>
        </Panel>
      )}
      {indicator90 && (
        <Panel
          mod="Indicator90"
          title="Indicator90 — chỉ báo xác nhận T90, dò riêng theo từng khung × từng hướng"
          sub="T90 luôn tồn tại cho CẢ 2 hướng (trên/dưới) bất kể giá đang trend hay đi ngang — nên mỗi khung Ngày/4H/1H đều dò riêng cho cả T90 trên và T90 dưới, không cần chờ breakout hay có xu hướng rõ ràng. Với mỗi hướng: dò + hiệu chỉnh 1 indicator (kèm tham số) sao cho MỖI LẦN nó bật, lịch sử cho thấy giá chạm được T90 hướng đó (tính causal ngay lúc bật) TRƯỚC KHI indicator tự tắt, với xác suất ≥90%. Độ nhạy/đặc hiệu so với ground-truth 'lẽ ra có chạm T90 trong cửa sổ chuẩn hay không' tại mọi nến."
        >
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Khung</th>
                  <th>Hướng T90</th>
                  <th>Indicator tối ưu</th>
                  <th>Chạm T90 khi bật (n)</th>
                  <th>Độ nhạy</th>
                  <th>Độ đặc hiệu</th>
                  <th>Tín hiệu giả</th>
                  <th>Đang bật?</th>
                </tr>
              </thead>
              <tbody>
                {indicator90.map((row) => (
                  <tr key={row.key}>
                    <td style={{ fontWeight: 700 }}>{row.label}</td>
                    <td>
                      <span style={{ color: row.dirUp ? CLR.bull : CLR.bear, fontWeight: 700 }}>
                        {row.dirLabel}
                      </span>
                    </td>
                    {row.result ? (
                      <>
                        <td>{row.result.best.label}</td>
                        <td className="num" style={{ color: row.result.reached90 ? CLR.bull : CLR.amber, fontWeight: 700 }}>
                          {row.result.best.hitRate}% (n={row.result.best.n})
                        </td>
                        <td className="num">{row.result.best.sens != null ? `${row.result.best.sens}%` : "—"}</td>
                        <td className="num">{row.result.best.spec != null ? `${row.result.best.spec}%` : "—"}</td>
                        <td className="num">{row.result.best.falseRate != null ? `${row.result.best.falseRate}%` : "—"}</td>
                        <td
                          className="num"
                          style={{ fontWeight: 700, color: row.result.best.on ? CLR.bull : CLR.dim }}
                        >
                          {row.result.best.on ? "CÓ" : "Không"}
                        </td>
                      </>
                    ) : (
                      <td colSpan={5} className="num" style={{ color: CLR.dim }}>
                        không đủ dữ liệu / mẫu quá ít
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {indicator90.some((r) => r.result && !r.result.reached90) && (
            <p className="sub" style={{ marginTop: 8, color: CLR.amber }}>
              Khung/hướng nào chưa đạt ngưỡng ≥90% sẽ hiện ứng viên GẦN NHẤT tìm được (tỉ lệ chạm T90 cao nhất trong số đã dò) — không phải bộ đã đạt chuẩn.
            </p>
          )}
          <p className="sub" style={{ marginTop: 8 }}>
            "Đang bật?" = tại nến gần nhất, indicator được chọn có đang ở trạng thái ON hay không — tức có đang trong "cửa sổ tín hiệu" hay đã tắt. Mỗi khung tự dò riêng nên indicator tối ưu có thể khác nhau giữa Ngày/4H/1H.
          </p>
        </Panel>
      )}
      {lab && (lab.h4 || lab.h1) && (
        <Panel
          mod="Lab"
          title="Lab — thử nhiều công thức vào lệnh, chọn ra công thức ăn nhất"
          sub="Chưa biết công thức vào lệnh nào ăn, nên chạy backtest THẬT cho nhiều công thức khác nhau (pullback EMA, RSI bật lại, MACD đảo dấu, breakout, MA cắt, phá bao ATR, tổ hợp confluence...) trên từng khung. TP luôn là T90 causal của đúng khung đó · SL lấy theo swing cấu trúc gần nhất (hợp lý, không nới rộng tuỳ tiện). Top 5 công thức tốt nhất mỗi khung, xếp theo Win% chạm T90 trước, PF sau."
        >
          {["h4", "h1"].map((tfKey) =>
            lab[tfKey] && lab[tfKey].length ? (
              <div key={tfKey} style={{ marginBottom: 18 }}>
                <div className="sub" style={{ fontWeight: 700, color: CLR.text, marginBottom: 6 }}>
                  Khung {tfKey === "h4" ? "4H" : "1H"} — top {lab[tfKey].length} công thức
                </div>
                {(() => {
                  const firing = lab[tfKey].filter((r) => r.nowSignal);
                  return firing.length ? (
                    <div
                      style={{
                        marginBottom: 8,
                        padding: "8px 12px",
                        borderRadius: 10,
                        border: `1px solid ${CLR.bull}`,
                        background: "rgba(63,214,164,.08)",
                        fontSize: 12.5,
                      }}
                    >
                      <b style={{ color: CLR.bull }}>⚡ Đang khớp NGAY BÂY GIỜ:</b>{" "}
                      {firing
                        .map(
                          (r) =>
                            `${r.label} (${r.dirUp ? "Long" : "Short"}, Win% ${r.m.win})`
                        )
                        .join(" · ")}
                    </div>
                  ) : (
                    <div className="sub" style={{ marginBottom: 8, color: CLR.dim }}>
                      Hiện KHÔNG có công thức nào trong top 5 khớp điều kiện ở nến vừa đóng — chưa có gì để vào ngay.
                    </div>
                  );
                })()}
                <div style={{ overflowX: "auto" }}>
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Công thức</th>
                        <th>Hướng</th>
                        <th>Số lệnh</th>
                        <th>Win% (chạm T90)</th>
                        <th>Dính SL%</th>
                        <th>Hết hạn%</th>
                        <th>R TB/lệnh</th>
                        <th>PF</th>
                        <th>Tổng R</th>
                        <th>MaxDD (R)</th>
                        <th>Giữ TB (nến)</th>
                        <th>Đang bật ngay?</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lab[tfKey].map((r, i) => (
                        <tr key={r.key} className={i === 0 ? "hot" : undefined}>
                          <td className="num" style={{ color: i === 0 ? CLR.blue : CLR.dim, fontWeight: 800 }}>{i + 1}</td>
                          <td style={{ fontWeight: 700 }}>{r.label}</td>
                          <td>
                            <span style={{ color: r.dirUp ? CLR.bull : CLR.bear, fontWeight: 700 }}>
                              {r.dirUp ? "Long" : "Short"}
                            </span>
                          </td>
                          <td className="num">{r.m.n}</td>
                          <td className="num" style={{ color: r.m.win >= 60 ? CLR.bull : r.m.win >= 40 ? CLR.amber : CLR.bear, fontWeight: 700 }}>
                            {r.m.win}%
                          </td>
                          <td className="num" style={{ color: CLR.bear }}>{r.m.slHit}%</td>
                          <td className="num">{r.m.to}%</td>
                          <td className="num" style={{ color: r.m.avgR >= 0 ? CLR.bull : CLR.bear }}>{r.m.avgR}R</td>
                          <td className="num">{r.m.pf === Infinity ? "∞" : r.m.pf}</td>
                          <td className="num" style={{ color: r.m.totR >= 0 ? CLR.bull : CLR.bear }}>{r.m.totR}R</td>
                          <td className="num" style={{ color: CLR.amber }}>{r.m.maxDD}R</td>
                          <td className="num">{r.m.avgHold}</td>
                          <td
                            className="num"
                            style={{ fontWeight: 800, color: r.nowSignal ? (r.dirUp ? CLR.bull : CLR.bear) : CLR.dim }}
                          >
                            {r.nowSignal ? "CÓ ✓" : "Không"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p key={tfKey} className="sub" style={{ color: CLR.dim }}>
                Khung {tfKey === "h4" ? "4H" : "1H"}: chưa có công thức nào đủ mẫu (≥8 lệnh) để xếp hạng.
              </p>
            )
          )}
          <p className="sub" style={{ marginTop: 4 }}>
            Đây là backtest lịch sử, không phải tín hiệu vào lệnh hiện tại — dùng để CHỌN RA công thức đáng thử nghiệm tiếp (kể cả live-forward), không phải để copy máy móc. Số lệnh (n) nhỏ thì đọc thận trọng; ưu tiên công thức vừa Win% cao vừa PF &gt; 1 (nếu PF ≤ 1, dù Win% cao thì trung bình vẫn lỗ do R:R kém).
          </p>
        </Panel>
      )}
      <Panel
        mod="CMT Pullback"
        title="CMT Pullback — daily có xu hướng thì vào theo pullback 4H · SL = swing gần nhất · TP = pivot Ngày"
        sub="Hướng lấy từ chuỗi Bước 8 (nhân quả) khi daily có xu hướng · Vào lệnh mỗi lần giá hồi (pullback) trên 4H · SL = swing low/high GẦN NHẤT (không dùng ATR) · TP = pivot Ngày gần nhất theo hướng · Thiếu swing hoặc chưa có pivot Ngày phía trước thì BỎ lệnh."
      >
        {step8Model && step8Model.stats ? (
          <>
            <div style={{ marginBottom: 14 }}>
              <div className="sub" style={{ margin: "0 0 6px" }}>
                Lịch sử vào/thoát lệnh trên khung 4H — chấm xanh: vào Mua · chấm đỏ: vào Bán · vòng tròn viền: điểm thoát (xanh = lời, đỏ = lỗ).
              </div>
              <TradeHistoryChart4H bars4h={step8Model.bars4h} marks={step8Model.tradeMarks} digits={digits} />
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 12,
              }}
            >
              <Chip cls="mut">
                Bước 8 ra hướng ở {step8Model.step8ActiveRate}% số phiên Ngày
                (còn lại là chờ/kẹt biên — không vào lệnh)
              </Chip>
            </div>
            <div
              style={{
                display: "flex",
                gap: 18,
                flexWrap: "wrap",
                marginBottom: 12,
              }}
            >
              <div>
                <div className="sub">Số lệnh</div>
                <b>{step8Model.stats.n}</b>
              </div>
              <div>
                <div className="sub">Winrate</div>
                <b>{step8Model.stats.winRate}%</b>
              </div>
              <div>
                <div className="sub">R trung bình/lệnh</div>
                <b>{step8Model.stats.avgR}R</b>
              </div>
              <div>
                <div className="sub">Profit factor</div>
                <b>{step8Model.stats.pf}</b>
              </div>
              <div>
                <div className="sub">Long / Short</div>
                <b>
                  {step8Model.stats.long} / {step8Model.stats.short}
                </b>
              </div>
              <div>
                <div className="sub">Chạm TP / SL / Hết hạn</div>
                <b>
                  {step8Model.stats.tp} / {step8Model.stats.sl} /{" "}
                  {step8Model.stats.timeout}
                </b>
              </div>
              <div>
                <div className="sub">Tỷ lệ lệnh nhồi</div>
                <b>
                  {step8Model.stats.addonRate}% ({step8Model.stats.addon} lệnh)
                </b>
              </div>
              <div>
                <div className="sub">Số nhịp có giao dịch</div>
                <b>{step8Model.stats.clusters}</b>
              </div>
              <div>
                <div className="sub">Winrate theo NHỊP</div>
                <b>{step8Model.stats.clusterWinRate}%</b>
              </div>
              <div>
                <div className="sub">TP theo Ngày / Tuần / ATR dự phòng</div>
                <b>
                  {step8Model.stats.bySource.daily || 0} /{" "}
                  {step8Model.stats.bySource.weekly || 0} /{" "}
                  {step8Model.stats.bySource.atr_fallback || 0}
                </b>
              </div>
            </div>
            <div
              style={{
                padding: 12,
                border: `1px solid ${CLR.line}`,
                borderRadius: 10,
              }}
            >
              <div className="sub" style={{ marginBottom: 8 }}>
                Chẩn đoán SL — cấu trúc so với ATR dự phòng
              </div>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Loại SL</th>
                    <th>Số lệnh</th>
                    <th>% dính SL</th>
                    <th>% chạm TP</th>
                    <th>R trung bình</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Cấu trúc (swing thật)</td>
                    <td className="num">
                      {step8Model.stats.bySLSource.structural.n}
                    </td>
                    <td className="num">
                      {step8Model.stats.bySLSource.structural.slRate}%
                    </td>
                    <td className="num">
                      {step8Model.stats.bySLSource.structural.tpRate}%
                    </td>
                    <td className="num">
                      {step8Model.stats.bySLSource.structural.avgR}R
                    </td>
                  </tr>
                  <tr>
                    <td>ATR dự phòng (×1.5)</td>
                    <td className="num">
                      {step8Model.stats.bySLSource.atr_fallback.n}
                    </td>
                    <td className="num">
                      {step8Model.stats.bySLSource.atr_fallback.slRate}%
                    </td>
                    <td className="num">
                      {step8Model.stats.bySLSource.atr_fallback.tpRate}%
                    </td>
                    <td className="num">
                      {step8Model.stats.bySLSource.atr_fallback.avgR}R
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="sub" style={{ margin: "12px 0 0" }}>
              So sánh với bảng "Backtest thật trên OHLC" ở trên (chỉ lọc bằng
              Dow D/W thuần) để biết cán cân bằng chứng + analog có thật sự
              cộng giá trị hay không trên đúng cặp này — nếu 2 bảng gần như
              giống nhau hoặc bảng này TỆ hơn, nghĩa là phần "Bước 8" (rút
              gọn) chưa chứng minh được có ích cho việc lọc hướng vào lệnh.
            </p>
          </>
        ) : (
          <Warn>
            Chưa đủ dữ liệu (cần đủ nến Tháng/Tuần/Ngày/4H/1H) để chạy backtest
            Bước 8.
          </Warn>
        )}
      </Panel>

      <Panel mod="Tham số" title="Tham số hệ thống phân tầng">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <label className="sub">
            SL = ATR ×{" "}
            <input
              type="number"
              step="0.1"
              min="0.5"
              max="4"
              value={opts.atrMult}
              onChange={(e) =>
                setOpts((o) => ({ ...o, atrMult: +e.target.value || 1.5 }))
              }
              style={{ width: 56 }}
            />
          </label>
          <label className="sub">
            R:R tối thiểu để nhận mốc Ngày{" "}
            <input
              type="number"
              step="0.1"
              min="0.5"
              max="3"
              value={opts.minRR}
              onChange={(e) =>
                setOpts((o) => ({ ...o, minRR: +e.target.value || 1.2 }))
              }
              style={{ width: 56 }}
            />
          </label>
          <label className="sub">
            R:R dự phòng (khi không có mốc cấu trúc){" "}
            <input
              type="number"
              step="0.5"
              min="1"
              max="5"
              value={opts.rrFallback}
              onChange={(e) =>
                setOpts((o) => ({ ...o, rrFallback: +e.target.value || 2 }))
              }
              style={{ width: 56 }}
            />
          </label>
          <label className="sub">
            Số lệnh nhồi tối đa/nhịp{" "}
            <input
              type="number"
              step="1"
              min="1"
              max="6"
              value={opts.maxStack}
              onChange={(e) =>
                setOpts((o) => ({ ...o, maxStack: +e.target.value || 3 }))
              }
              style={{ width: 56 }}
            />
          </label>
          <label className="sub">
            Vùng hồi giá quanh EMA20-4H (×ATR){" "}
            <input
              type="number"
              step="0.1"
              min="0.3"
              max="3"
              value={opts.pullbackZoneAtrMult}
              onChange={(e) =>
                setOpts((o) => ({
                  ...o,
                  pullbackZoneAtrMult: +e.target.value || 1.2,
                }))
              }
              style={{ width: 56 }}
            />
          </label>
          <label className="sub">
            Giữ lệnh tối đa (nến 1H){" "}
            <input
              type="number"
              step="4"
              min="8"
              max="200"
              value={opts.maxHold}
              onChange={(e) =>
                setOpts((o) => ({ ...o, maxHold: +e.target.value || 96 }))
              }
              style={{ width: 56 }}
            />
          </label>
        </div>
      </Panel>
    </>
  );
}

export default function App() {
  // ohlcStore: { D:{symbol:bars}, W:{symbol:bars} } — Twelve Data thật, gộp cả
  // 21 cặp FX + BTC/USDT trong 2 lệnh batch (Ngày+Tuần, đủ cho Screener). Tháng/
  // 4H/1H chỉ tải thêm riêng cho cặp đang mở xem sâu — xem pairExtra bên dưới.
  const [ohlcStore, setOhlcStore] = useState(null);
  const [vix, setVix] = useState(null);
  const [status, setStatus] = useState({
    ohlc: "loading",
    vix: "loading",
  });
  const [progress, setProgress] = useState("");
  const [reload, setReload] = useState(0);

  const [view, setView] = useState("screener"); // screener | cmt | intraday
  const [screenerScope, setScreenerScope] = useState("fast"); // fast (Ngày) | strategic (Tuần)
  const [pairKey, setPairKey] = useState("eurusd");
  const [layer, setLayer] = useState(7);
  const [tf, setTf] = useState("D");

  const [riskPctIn, setRiskPctIn] = useState(1);
  const cotByPair = useRef(new Map());
  const [cotTick, setCotTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setStatus({ ohlc: "loading", vix: "loading" });
    setOhlcStore({ D: {}, W: {} }); // reset — sẽ được lấp dần từng cặp một khi tải xong
    intradayCache.clear(); // reload = ép tải lại, bỏ cache Twelve Data cũ trong phiên
    batchSupported = true; // thử lại batch mỗi lần bấm Tải lại, phòng khi hạn mức đổi
    loadBulkOHLC(setProgress, (tf, sym, bars) => {
      if (!alive) return;
      // Đổ dần từng cặp vào store — Screener sẽ tự hiện thêm dòng ngay khi có, không
      // phải đợi tải xong hết cả 22 cặp mới thấy gì.
      setOhlcStore((prev) => ({
        ...(prev || { D: {}, W: {} }),
        [tf]: { ...((prev && prev[tf]) || {}), [sym]: bars },
      }));
    })
      .then(
        (store) =>
          alive &&
          (setOhlcStore(store),
          setStatus((x) => ({ ...x, ohlc: "ok" })),
          setProgress(""))
      )
      .catch(
        (e) =>
          alive &&
          (setStatus((x) => ({ ...x, ohlc: "err" })),
          setProgress(String(e.message || e)))
      );
    loadVIX()
      .then(
        (v) => alive && (setVix(v), setStatus((x) => ({ ...x, vix: "ok" })))
      )
      .catch(() => alive && setStatus((x) => ({ ...x, vix: "err" })));
    return () => {
      alive = false;
    };
  }, [reload]);

  // Chuỗi DXY (Ngày) dựng một lần từ Close THẬT của 6 cặp Twelve Data cấu thành công thức ICE.
  const series = useMemo(() => {
    if (!ohlcStore || !ohlcStore.D) return null;
    const need = ["EUR/USD", "USD/JPY", "GBP/USD", "USD/CAD", "USD/SEK", "USD/CHF"];
    if (!need.every((s) => ohlcStore.D[s] && ohlcStore.D[s].length)) return null;
    const base = ohlcStore.D["EUR/USD"];
    const dates = base.map((b) => b.d.slice(0, 10));
    const closeAt = (sym) => {
      const bars = ohlcStore.D[sym];
      const bd = bars.map((b) => b.d.slice(0, 10));
      const bc = bars.map((b) => b.c);
      return alignToDates(bd, bc, dates);
    };
    const eurusd = closeAt("EUR/USD"),
      usdjpy = closeAt("USD/JPY"),
      gbpusd = closeAt("GBP/USD"),
      usdcad = closeAt("USD/CAD"),
      usdsek = closeAt("USD/SEK"),
      usdchf = closeAt("USD/CHF");
    const dxy = dates.map((_, i) =>
      dxyFromPairCloses({
        eurusd: eurusd[i],
        usdjpy: usdjpy[i],
        gbpusd: gbpusd[i],
        usdcad: usdcad[i],
        usdsek: usdsek[i],
        usdchf: usdchf[i],
      })
    );
    return { dates, dxy };
  }, [ohlcStore]);

  const screenOpts = useMemo(
    () => ({
      atrPeriod: 14,
      slMult: 2,
      riskPct: Math.max(0.1, riskPctIn) / 100,
    }),
    [riskPctIn]
  );

  // Bộ truy cập Ngày+Tuần (bulk) theo cặp — dùng cho Screener.
  const pairData = useCallback(
    (c) => (c ? pairBarsFromStore(ohlcStore, tdSymbol(c)) : null),
    [ohlcStore]
  );

  const cfg = pairOf(pairKey);

  // Tháng/4H/1H — chỉ tải riêng cho cặp đang mở xem sâu (CMT/Intraday).
  const [pairExtra, setPairExtra] = useState({}); // symbol -> {status, error, M, H4, H1, note}
  // Set các symbol ĐÃ BẮT ĐẦU tải — dùng ref (không phải state) để việc effect
  // này tự ghi vào `pairExtra` (progress note, kết quả...) không làm nó tự chạy
  // lại rồi huỷ ngang chính phiên tải đang chạy (bug cũ: pairExtra vừa là điều
  // kiện chạy effect vừa là thứ effect ghi vào → mỗi lần ghi là effect tự huỷ
  // request đang chạy dở, kết quả trả về sau đó bị vứt bỏ vì cờ alive đã tắt).
  const pairExtraStarted = useRef(new Set());
  useEffect(() => {
    setPairExtra({}); // reload = ép tải lại luôn phần Tháng/4H/1H của cặp đang mở
    pairExtraStarted.current = new Set();
  }, [reload]);
  useEffect(() => {
    if (!["cmt", "intraday"].includes(view) || !cfg) return;
    const sym = tdSymbol(cfg);
    if (pairExtraStarted.current.has(sym)) return; // đã bắt đầu tải (hoặc xong) rồi
    pairExtraStarted.current.add(sym);
    setPairExtra((m) => ({ ...m, [sym]: { status: "loading" } }));
    let alive = true;
    loadPairExtraOHLC(sym, (msg) => {
      if (!alive) return;
      setPairExtra((m) => ({
        ...m,
        [sym]: { ...(m[sym] || { status: "loading" }), note: msg },
      }));
    })
      .then(
        (d) =>
          alive &&
          setPairExtra((m) => ({
            ...m,
            [sym]: { status: "ok", M: d.M, H4: d.H4, H1: d.H1 },
          }))
      )
      .catch(
        (e) =>
          alive &&
          setPairExtra((m) => ({
            ...m,
            [sym]: { status: "err", error: String(e.message || e) },
          }))
      );
    return () => {
      alive = false;
    };
  }, [view, cfg]); // KHÔNG phụ thuộc pairExtra — xem giải thích ở khai báo pairExtraStarted phía trên

  // Đầy đủ 5 khung cho MỘT cặp — Ngày/Tuần lấy từ bulk, Tháng/4H/1H lấy từ
  // pairExtra (null cho tới khi tải xong) — dùng cho CMT/Intraday.
  const fullPairData = useCallback(
    (c) => {
      if (!c) return null;
      const base = pairBarsFromStore(ohlcStore, tdSymbol(c));
      if (!base) return null;
      const extra = pairExtra[tdSymbol(c)];
      if (!extra || extra.status !== "ok") return null;
      return { D: base.D, W: base.W, M: extra.M, H4: extra.H4, H1: extra.H1 };
    },
    [ohlcStore, pairExtra]
  );
  const pairExtraStatus = cfg
    ? pairExtra[tdSymbol(cfg)] || { status: "loading" }
    : { status: "loading" };

  // Bộ lọc NHANH — khung Ngày, quét cả 21 cặp trên OHLC thật (pivot/TP/ATR từ High/Low).
  const screener = useMemo(() => {
    if (!ohlcStore) return null;
    const rows = [];
    for (const cfg of PAIRS) {
      const pd = pairData(cfg);
      if (!pd || pd.D.length < 250) continue; // cặp nào chưa tải xong/lỗi thì bỏ qua, không chặn cả bảng
      rows.push(screenPair(cfg, pd, screenOpts));
    }
    return rows.sort((a, b) => b.score - a.score);
  }, [ohlcStore, pairData, screenOpts]);

  // Bộ lọc CHIẾN LƯỢC — khung Tuần, phụ thuộc Tháng (xem 7b. screenPairStrategic).
  const screenerStrategic = useMemo(() => {
    if (!ohlcStore) return null;
    const rows = [];
    for (const cfg of PAIRS) {
      const pd = pairData(cfg);
      if (!pd || pd.D.length < 250) continue;
      const row = screenPairStrategic(cfg, pd, screenOpts);
      if (row) rows.push(row);
    }
    return rows.sort((a, b) => b.score - a.score);
  }, [ohlcStore, pairData, screenOpts]);

  // --- 1H/4H/D/W: dữ liệu OHLC thật (Twelve Data) + hệ thống phân tầng, nạp lười khi mở tab ---
  const [intradayOpts, setIntradayOpts] = useState({
    atrMult: 1.5,
    minRR: 1.2,
    rrFallback: 2,
    maxHold: 96,
    maxStack: 3,
    pullbackZoneAtrMult: 1.2,
  });
  // Bars đủ 5 khung của cặp đang mở: Ngày/Tuần từ bulk, Tháng/4H/1H tải lười riêng cặp.
  const intradaySymbol = cfg ? tdSymbol(cfg) : null;
  const pdOpen = fullPairData(cfg);
  const intradayEntry = pdOpen
    ? {
        status: "ok",
        m1: pdOpen.M,
        d1: pdOpen.D,
        w1: pdOpen.W,
        h4: pdOpen.H4,
        h1: pdOpen.H1,
      }
    : pairExtraStatus.status === "err"
    ? { status: "err", error: pairExtraStatus.error }
    : { status: "loading" };
  const intradayModel = useMemo(() => {
    if (!intradayEntry || intradayEntry.status !== "ok") return null;
    return buildLayeredModel(
      intradayEntry.d1,
      intradayEntry.w1,
      intradayEntry.h4,
      intradayEntry.h1,
      intradayOpts
    );
  }, [intradayEntry, intradayOpts]);
  const step8Model = useMemo(() => {
    if (!intradayEntry || intradayEntry.status !== "ok") return null;
    return buildStep8LayeredModel(
      intradayEntry.d1,
      intradayEntry.w1,
      intradayEntry.m1,
      intradayEntry.h4,
      intradayEntry.h1,
      intradayOpts
    );
  }, [intradayEntry, intradayOpts]);

  const t90Bt = useMemo(() => runT90Backtest(intradayEntry), [intradayEntry]);

  // Nạp COT lười cho cặp đang chọn (theo 2 chân đồng tiền)
  useEffect(() => {
    if (!cfg) return;
    let alive = true;
    const need = cfg.crypto
      ? ["BTC"]
      : [cfg.base, cfg.quote].filter((s) => s !== "USD" && COT_NAME[s]);
    Promise.all(need.map((s) => loadCOTFor(s).catch(() => null))).then(
      (res) => {
        if (!alive) return;
        need.forEach((s, i) => {
          if (res[i]) cotByPair.current.set(s, res[i]);
        });
        setCotTick((t) => t + 1);
      }
    );
    return () => {
      alive = false;
    };
  }, [cfg]);

  // COT tổng hợp cho cặp: crypto → chân BTC; cặp có USD → chân non-USD; cặp chéo → chênh lệch 2 chân
  const cotForPair = useMemo(() => {
    if (!cfg) return null;
    if (cfg.crypto) return cotByPair.current.get("BTC") || null;
    const legA = cfg.base !== "USD" ? cotByPair.current.get(cfg.base) : null;
    const legB = cfg.quote !== "USD" ? cotByPair.current.get(cfg.quote) : null;
    // net dương = ủng hộ base tăng so với quote
    if (cfg.base === "USD")
      return legB ? legB.map((x) => ({ d: x.d, net: -x.net })) : null; // USD/XXX: long XXX ⇒ USD/XXX giảm
    if (cfg.quote === "USD") return legA || null; // XXX/USD: long XXX ⇒ tăng
    if (legA && legB) {
      // chéo
      const mB = {};
      legB.forEach((x) => (mB[x.d] = x.net));
      return legA
        .filter((x) => mB[x.d] != null)
        .map((x) => ({ d: x.d, net: x.net - mB[x.d] }));
    }
    return legA || (legB ? legB.map((x) => ({ d: x.d, net: -x.net })) : null);
  }, [cfg, cotTick]);
  const cotName = cfg
    ? cfg.crypto
      ? "BITCOIN (CME)"
      : cfg.cross
      ? `${COT_NAME[cfg.base] || cfg.base} − ${
          COT_NAME[cfg.quote] || cfg.quote
        } (chênh lệch)`
      : `${COT_NAME[cfg.base === "USD" ? cfg.quote : cfg.base] || ""} (CME)`
    : "";

  // Mô hình CMT cho cặp đang chọn
  const model = useMemo(() => {
    if (!cfg) return null;
    const pd = fullPairData(cfg);
    if (!pd) return null;
    const closesP = pd.D.map((b) => b.c),
      datesP = pd.D.map((b) => b.d.slice(0, 10));
    // DXY (khung Ngày) căn theo chuỗi ngày riêng của cặp đang mở.
    const dxyAligned = series
      ? alignToDates(series.dates, series.dxy, datesP)
      : datesP.map(() => 100);
    const seas = seasonality(datesP, closesP);
    const m = buildCMTModel(pd, dxyAligned, vix, cotForPair, seas, cfg);
    // Gán cross + legs cho cặp chéo (cần chuỗi 2 chân, vd EUR/GBP cần EUR/USD & GBP/USD)
    // — lấy trực tiếp từ ohlcStore.D, không cần suy từ cross-rate ECB nữa.
    if (cfg.cross && ohlcStore && ohlcStore.D) {
      const baseBars =
        ohlcStore.D[cfg.base + "/USD"] || ohlcStore.D["USD/" + cfg.base];
      const quoteBars =
        ohlcStore.D["USD/" + cfg.quote] || ohlcStore.D[cfg.quote + "/USD"];
      if (baseBars && quoteBars) {
        const baseUSD = alignToDates(
          baseBars.map((b) => b.d.slice(0, 10)),
          baseBars.map((b) => b.c),
          datesP
        );
        const quoteUSD = alignToDates(
          quoteBars.map((b) => b.d.slice(0, 10)),
          quoteBars.map((b) => b.c),
          datesP
        );
        const tA = dowTrend(pivotsOHLC(baseBars, 4)).trend;
        const tB = dowTrend(pivotsOHLC(quoteBars, 4)).trend;
        const tX = m.frames.D.trend;
        const legSum =
          tA === "up" && tB === "down"
            ? "up"
            : tA === "down" && tB === "up"
            ? "down"
            : "mixed";
        m.cross = { tA, tB, tX, agree: legSum !== "mixed" && legSum === tX };
        const closes = closesP;
        const n0 = Math.max(0, closes.length - 90);
        const a0 = baseUSD[n0],
          b0 = quoteUSD[n0],
          x0 = closes[n0];
        m.legs = [];
        for (let i = n0; i < closes.length; i++)
          m.legs.push({
            d: datesP[i],
            a: Math.log(baseUSD[i] / a0),
            b: -Math.log(quoteUSD[i] / b0),
            cross: Math.log(closes[i] / x0),
          });
        const le = m.legs[m.legs.length - 1];
        const domA = Math.abs(le.a) >= Math.abs(le.b);
        le.note = `90 phiên gần nhất: chân ${cfg.base} đóng góp ${(
          le.a * 100
        ).toFixed(1)}%, chân ${cfg.quote} ${(le.b * 100).toFixed(
          1
        )}% vào biến động ${(le.cross * 100).toFixed(1)}% của ${
          cfg.label
        } → câu chuyện hiện tại chủ yếu là phía ${
          domA ? cfg.base : cfg.quote
        } (${CBANK[domA ? cfg.base : cfg.quote]}).`;
      }
    }
    return m;
  }, [series, ohlcStore, cfg, fullPairData, vix, cotForPair]);

  const indicator90 = useMemo(
    () => runIndicator90(intradayEntry),
    [intradayEntry]
  );
  const lab = useMemo(() => runLab(intradayEntry), [intradayEntry]);

  const hist = useMemo(() => {
    if (!cfg) return null;
    const pd = pairData(cfg);
    if (!pd) return null;
    const closes = pd.D.map((b) => b.c),
      dates = pd.D.map((b) => b.d.slice(0, 10));
    const states = buildStates(pd.D);
    return {
      closes,
      dates,
      events: scanPatternHistory(closes, dates),
      rule: scanBreakoutRule(closes),
      confl: backtestConfluenceRolling(closes),
      analog: analogProbabilities(pd.D, states),
      fibTargets: analogFibTargets(pd.D, states, 60),
      forward: analogForwardStats(pd.D, states, [3, 4, 5]),
      system: backtestSystem(closes),
      swings: scanSwings(closes, dates),
    };
  }, [ohlcStore, cfg, pairData]);

  const gate = model ? model.tradeGate : null;

  const openPairCMT = useCallback((key) => {
    setPairKey(key);
    setView("cmt");
    setLayer(7);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  if (status.ohlc === "err") {
    return (
      <div className="fxapp">
        <style>{CSS}</style>
        <div className="loading">
          <b>Không tải được dữ liệu OHLC (Twelve Data)</b>
          <p className="sub">
            {progress || "Kiểm tra kết nối mạng / API key rồi thử lại."}
          </p>
          <button className="bt" onClick={() => setReload((r) => r + 1)}>
            Thử lại
          </button>
        </div>
      </div>
    );
  }
  if (!ohlcStore) {
    return (
      <div className="fxapp">
        <style>{CSS}</style>
        <div className="loading">
          <div className="spin" />
          <span>{progress || "Đang khởi tạo…"}</span>
        </div>
      </div>
    );
  }
  const bulkTotal = PAIRS.length;
  const bulkLoaded = Object.keys(ohlcStore.D || {}).length;
  const bulkBusy = status.ohlc === "loading" && bulkLoaded < bulkTotal;

  const pd = fullPairData(cfg);
  // Nếu cặp đang mở chưa tải xong Tháng/4H/1H (lười) hoặc lỗi → báo trạng thái thay vì vỡ.
  // Screener KHÔNG cần pd/model (chỉ cần Ngày+Tuần bulk) nên không bị chặn ở đây.
  if (view !== "screener" && (!pd || !model)) {
    const isErr = pairExtraStatus.status === "err";
    return (
      <div className="fxapp">
        <style>{CSS}</style>
        <div className="loading">
          {isErr ? (
            <>
              <b>Chưa tải được Tháng/4H/1H cho {cfg ? cfg.label : "cặp này"}</b>
              <p className="sub">
                {pairExtraStatus.error ||
                  "Twelve Data có thể chưa hỗ trợ symbol này ở gói hiện tại."}
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="bt" onClick={() => setPairKey("eurusd")}>
                  Về EUR/USD
                </button>
                <button
                  className="bt"
                  onClick={() =>
                    setPairExtra((m) => {
                      const c = { ...m };
                      delete c[tdSymbol(cfg)];
                      return c;
                    })
                  }
                >
                  Thử lại
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="spin" />
              <span>
                {pairExtraStatus.note ||
                  `Đang tải Tháng/4H/1H cho ${cfg ? cfg.label : ""}…`}
              </span>
            </>
          )}
        </div>
      </div>
    );
  }

  const pdBulk = pairData(cfg); // Ngày+Tuần — luôn có sẵn kể cả khi đang ở view Screener
  const lastPrice = pd
    ? pd.D[pd.D.length - 1].c
    : pdBulk
    ? pdBulk.D[pdBulk.D.length - 1].c
    : 0;
  // Ma trận tương quan (Module 8) — Close Ngày thật của 7 cặp Major từ Twelve Data.
  const riskAllCloses = {};
  MATRIX_KEYS.forEach((k) => {
    const p = pairOf(k);
    const bars = p && ohlcStore && ohlcStore.D && ohlcStore.D[p.label];
    if (bars) riskAllCloses[k] = bars.map((b) => b.c);
  });
  // Quy đổi pip → USD: cần "1 đơn vị quote-currency = bao nhiêu USD" tại giá Close mới nhất.
  const riskQuotePerUSD = (() => {
    if (!cfg || cfg.quote === "USD" || cfg.crypto) return 1;
    const store = ohlcStore && ohlcStore.D;
    if (!store) return 1;
    const direct = store["USD/" + cfg.quote]; // close = quote-per-1-USD (đúng chiều cần)
    if (direct && direct.length) return direct[direct.length - 1].c;
    const inv = store[cfg.quote + "/USD"]; // close = USD-per-1-quote → nghịch đảo
    if (inv && inv.length) return 1 / inv[inv.length - 1].c;
    return 1;
  })();
  const pbBias = model ? model.playbook.bias : "side";
  const pbBiasPct = model ? model.playbook.biasPct : 50;
  // tfBars/tfPiv chỉ thật sự dùng ở view "cmt" (đã có pd/model lúc đó) — ở view Screener
  // pd/model có thể null, trả mảng rỗng an toàn thay vì vỡ.
  const tfBars = !pd
    ? []
    : tf === "M"
    ? pd.M
    : tf === "W"
    ? pd.W
    : tf === "H4"
    ? pd.H4
    : tf === "H1"
    ? pd.H1
    : pd.D;
  const tfCloses = tfBars.map((b) => b.c);
  const tfDates = tfBars.map((b) =>
    tf === "H4" || tf === "H1" ? b.d : b.d.slice(0, 10)
  );
  const tfPiv = !model
    ? []
    : tf === "M"
    ? model.pivM
    : tf === "W"
    ? model.pivW
    : tf === "H4"
    ? model.piv4
    : tf === "H1"
    ? model.piv1
    : model.pivD;

  const STEPS = [
    { t: "Bối cảnh vĩ mô", s: "Intermarket · chu kỳ · lịch" },
    { t: "Xu hướng", s: "Dow · MA · độ mạnh" },
    { t: "Cấu trúc giá", s: "Elliott · patterns · Fib" },
    { t: "Xác nhận", s: "Momentum · phân kỳ · COT" },
    { t: "Rủi ro", s: "Sizing · tương quan" },
    { t: "Kịch bản giao dịch", s: "If-then · trigger · vô hiệu" },
    { t: "Kiểm chứng lịch sử", s: "Mẫu hình quá khứ · độ chính xác" },
    { t: "Tổng hợp & kế hoạch", s: "Kế hoạch chính · canh gì · nếu-thì" },
  ];
  const vLabel = { up: "Thuận", down: "Nghịch", side: "Theo dõi" };
  const fLabel = { ok: "✓", err: "✕", loading: "…" };

  return (
    <div className="fxapp">
      <style>{CSS}</style>
      <header className="topbar">
        <div className="brand">
          FX · CMT
          <small>
            Bộ lọc tín hiệu CMT · phân tích top-down · vào lệnh đa khung
          </small>
        </div>
        {view !== "screener" && (
          <>
            <select
              className="pair"
              value={pairKey}
              onChange={(e) => {
                setPairKey(e.target.value);
              }}
            >
              {PAIRS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
            <span className="num" style={{ fontSize: 14, fontWeight: 600 }}>
              {lastPrice.toFixed(cfg.digits)}
            </span>
            <Chip cls={pbBias}>Cán cân {pbBiasPct}% tăng</Chip>
          </>
        )}
        <span
          style={{ marginLeft: "auto", color: CLR.dim, fontSize: 11 }}
          className="num"
        >
          Twelve Data OHLC {fLabel[status.ohlc]} · VIX {fLabel[status.vix]}
        </span>
        <button
          className="bt"
          title="Fetch lại toàn bộ OHLC Twelve Data / VIX mới nhất (app không tự động polling)"
          onClick={() => setReload((r) => r + 1)}
          style={{ padding: "5px 9px", fontSize: 12 }}
        >
          🔄
        </button>
      </header>

      <div className="tabs">
        <button
          className={`tab ${view === "screener" ? "on" : ""}`}
          onClick={() => setView("screener")}
        >
          🔍 Bộ lọc thị trường
        </button>
        {series && series.dates.length > 0 && (
          <span
            className="num"
            style={{
              alignSelf: "center",
              fontSize: 10.5,
              color: CLR.dim,
              marginLeft: -2,
              marginRight: 4,
            }}
          >
            (OHLC Twelve Data tới {fmtDateVN(series.dates[series.dates.length - 1])})
          </span>
        )}
        <button
          className={`tab ${view === "cmt" ? "on" : ""}`}
          onClick={() => setView("cmt")}
        >
          📐 Phân tích CMT ({cfg.label})
        </button>
        <button
          className={`tab ${view === "intraday" ? "on" : ""}`}
          onClick={() => setView("intraday")}
        >
          ⏱ D/W→4H→1H — vào lệnh & nhồi lệnh ({cfg.label})
        </button>
      </div>

      {view === "screener" && (
        <div
          className="main"
          style={{ maxWidth: 1240, margin: "0 auto", width: "100%" }}
        >
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <button
              className="bt"
              onClick={() => setScreenerScope("fast")}
              style={
                screenerScope === "fast"
                  ? { borderColor: CLR.blue, color: CLR.text, fontWeight: 700 }
                  : {}
              }
            >
              ⚡ Lệnh nhanh (Ngày)
            </button>
            <button
              className="bt"
              onClick={() => setScreenerScope("strategic")}
              style={
                screenerScope === "strategic"
                  ? { borderColor: CLR.blue, color: CLR.text, fontWeight: 700 }
                  : {}
              }
            >
              🧭 Lệnh chiến lược (Tuần)
            </button>
          </div>
          <p className="sub" style={{ margin: "-8px 0 14px" }}>
            {screenerScope === "fast"
              ? "Lệnh nhanh: xếp hạng theo breakout khung Ngày — giữ ngắn hơn."
              : "Lệnh chiến lược: xếp hạng theo breakout khung Tuần, có đối chiếu xu hướng Tháng — giữ dài hơi hơn."}{" "}
            Hai bảng độc lập, không cái nào chặn cái nào — tự quyết định vào
            lệnh nào.
          </p>
          {bulkBusy && (
            <div
              className="fnote"
              style={{
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div className="spin" style={{ width: 14, height: 14 }} />
              <span>
                Đang tải thêm — {bulkLoaded}/{bulkTotal} cặp có dữ liệu Ngày+Tuần.
                Bảng bên dưới tự cập nhật thêm dòng khi tải xong từng cặp,
                không cần chờ đủ hết.
              </span>
            </div>
          )}
          {screenerScope === "fast" ? (
            <ScreenerSection
              rows={screener}
              openPair={openPairCMT}
              scope="fast"
            />
          ) : (
            <ScreenerSection
              rows={screenerStrategic}
              openPair={openPairCMT}
              scope="strategic"
            />
          )}
        </div>
      )}

      {view === "cmt" && model && (
        <div className="layout">
          <nav className="rail">
            <div className="railhead">Trình tự phân tích CMT</div>
            {STEPS.map((st, i) => (
              <button
                key={i}
                className={`step ${layer === i ? "on" : ""}`}
                onClick={() => setLayer(i)}
              >
                <span className="stepline">
                  <span className={`dot ${model.verdicts[i]}`} />
                  {i < STEPS.length - 1 && <span className="vline" />}
                </span>
                <span>
                  <span className="steptitle">
                    {i + 1}. {st.t}
                  </span>
                  <span className="stepsub" style={{ display: "block" }}>
                    {st.s} ·{" "}
                    <b
                      style={{
                        color:
                          model.verdicts[i] === "up"
                            ? CLR.bull
                            : model.verdicts[i] === "down"
                            ? CLR.bear
                            : CLR.amber,
                      }}
                    >
                      {vLabel[model.verdicts[i]]}
                    </b>
                  </span>
                </span>
              </button>
            ))}
            <div className="confl">
              <b>Tổng hợp confluence</b>
              <p className="sub" style={{ margin: "6px 0 0" }}>
                Cán cân {model.playbook.biasPct}% nghiêng tăng (
                {model.playbook.bullScore}✓ tăng · {model.playbook.bearScore}✓
                giảm). Chi tiết if-then ở bước 6.
              </p>
            </div>
          </nav>
          <main className="main">
            {layer === 0 && (
              <MacroLayer
                cfg={cfg}
                corr={model.corr}
                diverge={model.diverge}
                dxy={series ? series.dxy : []}
                vix={vix || []}
                status={{ vix: status.vix, cot: cotForPair ? "ok" : "loading" }}
                seas={model.seas}
                legs={model.legs}
              />
            )}
            {layer === 1 && (
              <TrendLayer
                cfg={cfg}
                tf={tf}
                setTf={setTf}
                frames={model.frames}
                cross={model.cross}
                dates={tfDates}
                closes={tfCloses}
                digits={cfg.digits}
                piv={tfPiv}
                cascade={model.cascade}
              />
            )}
            {layer === 2 && (
              <StructureLayer
                key={pairKey}
                swings={hist ? hist.swings : null}
                dates={model.winDates}
                closes={model.winCloses}
                digits={cfg.digits}
                patterns={model.patterns}
                scens={model.scens}
              />
            )}
            {layer === 3 && (
              <ConfirmLayer
                dates={model.dates}
                closes={model.closes}
                rsiArr={model.rsiArr}
                macdArr={model.macdArr}
                stochArr={model.stochArr}
                cot={cotForPair}
                cotName={cotName}
                bt={backtestConfluenceRolling(model.closes)}
                trendD={model.frames.D.trend}
                status={{ cot: cotForPair ? "ok" : "loading", vix: status.vix }}
                div={model.div}
              />
            )}
            {layer === 4 && (
              <RiskLayer
                allCloses={riskAllCloses}
                matrixKeys={MATRIX_KEYS}
                vol={model.vol}
                cfg={cfg}
                digits={cfg.digits}
                quotePerUSD={riskQuotePerUSD}
                lastPrice={lastPrice}
              />
            )}
            {layer === 5 && (
              <PlaybookLayer
                cfg={cfg}
                pb={model.playbook}
                dates={model.winDates}
                closes={model.winCloses}
                digits={cfg.digits}
                ma50={model.ma50.slice(-model.winCloses.length)}
                ma200={model.ma200.slice(-model.winCloses.length)}
                goLayer={setLayer}
                analog={hist ? hist.analog : null}
                fibTargets={hist ? hist.fibTargets : null}
                forward={hist ? hist.forward : null}
                gates={model.gates}
              />
            )}
            {layer === 6 && (
              <HistoryLayer cfg={cfg} hist={hist} digits={cfg.digits} />
            )}
            {layer === 7 && (
              <SummaryLayer
                cfg={cfg}
                model={model}
                hist={hist}
                digits={cfg.digits}
                goLayer={setLayer}
              />
            )}
            <div
              className="foot"
              style={{ border: `1px solid ${CLR.line}`, borderRadius: 12 }}
            >
              Nguồn thật: OHLC Twelve Data (Tháng/Tuần/Ngày/4H/1H, đủ
              Open/High/Low/Close) · DXY tính theo công thức ICE từ chính các
              cặp Twelve Data · COT từ CFTC Socrata API (tuần). Chưa có nguồn
              keyless+CORS: volume futures, yield, dầu WTI, lịch kinh tế — mỗi
              chỗ thiếu được ghi rõ trong UI thay vì giả lập. Công cụ hỗ trợ
              quyết định theo khung CMT — không
              phải tín hiệu mua/bán.
            </div>
          </main>
        </div>
      )}

      {view === "intraday" && cfg && (
        <div
          className="main"
          style={{ maxWidth: 1180, margin: "0 auto", width: "100%" }}
        >
          <IntradayTab
            cfg={cfg}
            digits={cfg.digits}
            state={{
              status: intradayEntry ? intradayEntry.status : "loading",
              error: intradayEntry ? intradayEntry.error : null,
              model: intradayModel,
              step8Model,
              t90Bt,
              indicator90,
              lab,
              symbol: intradaySymbol,
              opts: intradayOpts,
              setOpts: setIntradayOpts,
            }}
          />
        </div>
      )}
    </div>
  );
}
