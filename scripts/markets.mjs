// 価格・市場指標の集計
//
//   weeklyMarkets(raw, 週)  … 在庫統計と同じ集計週（土〜金）の週平均・前週比など（週ごとのページ用）
//   dashboard(raw)          … 最新の値と推移（/markets/ と /world/ 用）
//
//   node scripts/markets.mjs   → data/markets/dashboard.json を作る
import path from 'node:path';
import { PRICE_SERIES, STEO_SERIES, GALLONS_PER_BARREL } from '../config/markets.mjs';
import { paths, readJson, writeJson, existsSync, isMain } from './lib/io.mjs';
import { addDays, parseDate, shiftYears, fmtDate } from './lib/dates.mjs';

const round = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

/** その日を含む週（土〜金）の金曜日 */
export function weekFriday(date) {
  const wd = parseDate(date).getUTCDay();
  return addDays(date, (5 - wd + 7) % 7);
}

/** 日次・週次の行を「金曜終わりの週」にまとめる → Map(金曜 → {avg, last, lastDate, n}) */
export function weeklyBuckets(rows) {
  const m = new Map();
  for (const r of rows) {
    if (r.value == null || !Number.isFinite(r.value)) continue;
    const f = weekFriday(r.period);
    const b = m.get(f) ?? { sum: 0, n: 0, last: null, lastDate: null };
    b.sum += r.value;
    b.n += 1;
    if (!b.lastDate || r.period > b.lastDate) {
      b.last = r.value;
      b.lastDate = r.period;
    }
    m.set(f, b);
  }
  for (const b of m.values()) b.avg = b.sum / b.n;
  return m;
}

/** 2系列から日ごとに計算した系列（同じ日の両方がある日のみ） */
function combineDaily(seriesList, fn) {
  const maps = seriesList.map((rows) => new Map(rows.map((r) => [r.period, r.value])));
  const out = [];
  for (const [d] of maps[0]) {
    const vals = maps.map((m) => m.get(d));
    if (vals.every((v) => v != null && Number.isFinite(v))) out.push({ period: d, value: fn(...vals) });
  }
  return out.sort((a, b) => a.period.localeCompare(b.period));
}

/** WTIとブレントの価格差（ドル/バレル） */
export const spreadRows = (wti, brent) => combineDaily([wti, brent], (w, b) => w - b);

/** 3-2-1 クラックスプレッド（ドル/バレル）= (ガソリン2 + 軽油1 − 原油3) ÷ 3。製品はドル/ガロン→ドル/バレルに換算 */
export function crack321(wti, gasoline, ulsd) {
  return combineDaily([wti, gasoline, ulsd], (w, g, u) => (2 * g * GALLONS_PER_BARREL + u * GALLONS_PER_BARREL - 3 * w) / 3);
}

/** 週次の要約（週平均・前週比・前年同週比・52週の高値と安値・推移） */
export function weeklySummary(rows, week, { weeks = 52, field = 'avg' } = {}) {
  if (!rows?.length) return null;
  const b = weeklyBuckets(rows);
  const cur = b.get(week);
  if (!cur) return null;
  const prev = b.get(addDays(week, -7));
  const yearAgo = b.get(weekFriday(shiftYears(week, -1)));
  const recent = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const f = addDays(week, -7 * i);
    if (b.has(f)) recent.push({ period: f, value: round(b.get(f)[field], 3) });
  }
  const from = shiftYears(week, -1);
  const year = rows.filter((r) => r.period > from && r.period <= week && Number.isFinite(r.value)).map((r) => r.value);
  const v = cur[field];
  return {
    value: round(v, 3),
    close: round(cur.last, 3),
    closeDate: cur.lastDate,
    days: cur.n,
    prev: round(prev?.[field], 3),
    change: round(prev ? v - prev[field] : null, 3),
    changePct: round(prev ? ((v - prev[field]) / Math.abs(prev[field])) * 100 : null, 2),
    yearAgo: round(yearAgo?.[field], 3),
    yoyChange: round(yearAgo ? v - yearAgo[field] : null, 3),
    high52: round(year.length ? Math.max(...year) : null, 3),
    low52: round(year.length ? Math.min(...year) : null, 3),
    recent,
  };
}

/** CFTC：マネージドマネー（投機筋）などの買い越し */
export function cftcSummary(rows, week, { weeks = 52 } = {}) {
  if (!rows?.length) return null;
  const byFri = new Map(rows.map((r) => [weekFriday(r.period), r]));
  const cur = byFri.get(week);
  if (!cur) return null;
  const prev = byFri.get(addDays(week, -7));
  const net = (r) => (r ? r.mmLong - r.mmShort : null);
  const recent = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const r = byFri.get(addDays(week, -7 * i));
    if (r) recent.push({ period: r.period, value: net(r) });
  }
  const from = shiftYears(week, -1);
  const year = rows.filter((r) => r.period > from && r.period <= week).map(net);
  return {
    period: cur.period,
    long: cur.mmLong,
    short: cur.mmShort,
    net: net(cur),
    prevNet: net(prev),
    change: prev ? net(cur) - net(prev) : null,
    oi: cur.oi,
    netPctOi: cur.oi ? round((net(cur) / cur.oi) * 100, 1) : null,
    producerNet: cur.pmLong != null && cur.pmShort != null ? cur.pmLong - cur.pmShort : null,
    swapNet: cur.swapLong != null && cur.swapShort != null ? cur.swapLong - cur.swapShort : null,
    high52: year.length ? Math.max(...year) : null,
    low52: year.length ? Math.min(...year) : null,
    recent,
  };
}

export async function loadMarketRaw() {
  const dir = path.join(paths().markets, 'raw');
  const read = async (k) => (existsSync(path.join(dir, `${k}.json`)) ? (await readJson(path.join(dir, `${k}.json`))) : null);
  const prices = {};
  for (const s of PRICE_SERIES) prices[s.key] = (await read(s.key))?.data ?? [];
  const steo = {};
  let steoFetchedAt = null;
  for (const s of STEO_SERIES) {
    const j = await read(s.key);
    steo[s.key] = j?.data ?? [];
    steoFetchedAt ??= j?.fetchedAt ?? null;
  }
  return { prices, steo, steoFetchedAt, cftc: (await read('cftc'))?.data ?? [] };
}

export const hasMarketData = (raw) => Object.values(raw.prices).some((r) => r.length) || raw.cftc.length > 0;

/** 週ごとのページ用（データが無ければ null） */
export function weeklyMarkets(raw, week) {
  if (!hasMarketData(raw)) return null;
  const P = raw.prices;
  const prices = {};
  for (const s of PRICE_SERIES) {
    const sum = weeklySummary(P[s.key], week, { field: s.freq === 'weekly' ? 'last' : 'avg' });
    if (sum) prices[s.key] = sum;
  }
  const derived = {};
  const sp = weeklySummary(spreadRows(P.wti, P.brent), week);
  if (sp) derived.spread = sp;
  const cr = weeklySummary(crack321(P.wti, P.gasolineNYH, P.ulsdNYH), week);
  if (cr) derived.crack321 = cr;
  return { week, prices, derived, cftc: cftcSummary(raw.cftc, week) };
}

/** STEO：月次の値に予測かどうかの印を付ける（取得月以降を予測とみなす） */
export function steoRows(rows, fetchedAt, { fromYear = 2021 } = {}) {
  const firstForecast = fetchedAt ? fetchedAt.slice(0, 7) : null;
  return rows
    .filter((r) => r.period >= `${fromYear}-01`)
    .map((r) => ({ period: r.period.slice(0, 7), value: round(r.value, 3), forecast: firstForecast ? r.period.slice(0, 7) >= firstForecast : false }));
}

/** /markets/ と /world/ 用 */
export function dashboard(raw, now = new Date()) {
  if (!hasMarketData(raw) && !Object.values(raw.steo).some((r) => r.length)) return null;
  const lastDaily = raw.prices.wti?.at(-1)?.period ?? raw.cftc.at(-1)?.period ?? fmtDate(now);
  const week = weekFriday(lastDaily);
  const w = weeklyMarkets(raw, week) ?? { prices: {}, derived: {}, cftc: null };
  const long = {};
  for (const s of PRICE_SERIES) {
    const sum = weeklySummary(raw.prices[s.key], week, { weeks: 104, field: s.freq === 'weekly' ? 'last' : 'avg' });
    if (sum) long[s.key] = sum.recent;
  }
  const P = raw.prices;
  long.spread = weeklySummary(spreadRows(P.wti, P.brent), week, { weeks: 104 })?.recent ?? [];
  long.crack321 = weeklySummary(crack321(P.wti, P.gasolineNYH, P.ulsdNYH), week, { weeks: 104 })?.recent ?? [];
  long.cftc = cftcSummary(raw.cftc, week, { weeks: 104 })?.recent ?? [];

  const steo = {};
  for (const s of STEO_SERIES) steo[s.key] = steoRows(raw.steo[s.key], raw.steoFetchedAt);
  const supply = new Map(steo.worldSupply.map((r) => [r.period, r]));
  steo.balance = steo.worldDemand
    .filter((r) => supply.has(r.period))
    .map((r) => ({ period: r.period, value: round(supply.get(r.period).value - r.value, 3), forecast: r.forecast }));

  return {
    asOf: lastDaily,
    week,
    steoFetchedAt: raw.steoFetchedAt,
    latest: w,
    long,
    steo,
  };
}

if (isMain(import.meta.url)) {
  const raw = await loadMarketRaw();
  const d = dashboard(raw);
  if (!d) {
    console.log('市場データがありません（npm run fetch:markets を実行してください）');
  } else {
    await writeJson(path.join(paths().markets, 'dashboard.json'), d);
    console.log(`作成: data/markets/dashboard.json（最新 ${d.asOf}）`);
  }
}
