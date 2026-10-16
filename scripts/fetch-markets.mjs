// 価格・市場関連指標を取得し、data/markets/raw/{key}.json に保存する
//
//   EIA（スポット価格・小売価格・STEO）: 環境変数 EIA_API_KEY が必要
//   CFTC（建玉明細）: キー不要
//
// 一部の取得に失敗しても、取得できたものは保存する。失敗があれば終了コード1（Actionsで通知）。
import path from 'node:path';
import { PRICE_SERIES, STEO_SERIES, CFTC } from '../config/markets.mjs';
import { paths, readJson, writeJson, existsSync, isMain } from './lib/io.mjs';
import { addDays, shiftYears, fmtDate } from './lib/dates.mjs';
import { fetchSeries, mergeRows, getJson, redact } from './fetch.mjs';

const HISTORY_YEARS = 10;
const REFRESH_DAYS = 60;

async function saveIfChanged(file, meta, data, now, log, label) {
  const existing = existsSync(file) ? await readJson(file) : null;
  if (JSON.stringify(existing?.data ?? []) === JSON.stringify(data)) {
    log(`${label.padEnd(28)} 変更なし（最新 ${data.at(-1)?.period ?? 'なし'}）`);
    return false;
  }
  await writeJson(file, { ...meta, fetchedAt: now.toISOString(), data });
  log(`${label.padEnd(28)} 計${data.length}件（最新 ${data.at(-1)?.period ?? 'なし'}）`);
  return true;
}

/** EIA の価格・STEO 系列 */
export async function fetchEiaMarkets({ apiKey, now = new Date(), fetchImpl, log = console.log } = {}) {
  if (!apiKey) throw new Error('環境変数 EIA_API_KEY が設定されていません');
  const dir = path.join(paths().markets, 'raw');
  const errors = [];
  for (const s of [...PRICE_SERIES, ...STEO_SERIES]) {
    try {
      const file = path.join(dir, `${s.key}.json`);
      const existing = existsSync(file) ? await readJson(file) : null;
      const last = existing?.data?.at(-1)?.period;
      const isSteo = s.route.startsWith('STEO.');
      // STEO は予測値が毎月改定されるため、毎回すべて取り直す
      const start = isSteo ? undefined : last ? addDays(last, -REFRESH_DAYS) : shiftYears(fmtDate(now), -HISTORY_YEARS);
      const { meta, rows } = await fetchSeries(s, { apiKey, start, fetchImpl });
      const data = isSteo ? rows.filter((r) => r.period >= '2015-01') : mergeRows(existing?.data ?? [], rows);
      await saveIfChanged(
        file,
        { key: s.key, seriesId: s.id, route: s.route, nameJa: s.nameJa, eiaDescription: meta.description, eiaUnits: meta.units },
        data,
        now,
        log,
        s.id,
      );
    } catch (e) {
      errors.push(`${s.id}: ${redact(e.message)}`);
    }
  }
  return errors;
}

/** CFTC の Socrata API の URL */
export function cftcUrl({ since, offset = 0, limit = 5000 } = {}) {
  const u = new URL(`${CFTC.base}/${CFTC.dataset}.json`);
  u.searchParams.set('cftc_contract_market_code', CFTC.marketCode);
  if (since) u.searchParams.set('$where', `${CFTC.fields.date} >= '${since}T00:00:00'`);
  u.searchParams.set('$order', `${CFTC.fields.date} ASC`);
  u.searchParams.set('$limit', String(limit));
  u.searchParams.set('$offset', String(offset));
  return u;
}

/** CFTC の行 → {period, oi, mmLong, ...}（数値化） */
export function normalizeCftc(rows) {
  const f = CFTC.fields;
  const num = (v) => (v == null || v === '' ? null : Number(v));
  return rows
    .map((r) => ({
      period: String(r[f.date] ?? '').slice(0, 10),
      oi: num(r[f.openInterest]),
      mmLong: num(r[f.mmLong]),
      mmShort: num(r[f.mmShort]),
      pmLong: num(r[f.pmLong]),
      pmShort: num(r[f.pmShort]),
      swapLong: num(r[f.swapLong]),
      swapShort: num(r[f.swapShort]),
    }))
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.period) && Number.isFinite(r.mmLong) && Number.isFinite(r.mmShort))
    .sort((a, b) => a.period.localeCompare(b.period));
}

export async function fetchCftc({ now = new Date(), fetchImpl = fetch, log = console.log } = {}) {
  const file = path.join(paths().markets, 'raw', 'cftc.json');
  const existing = existsSync(file) ? await readJson(file) : null;
  const last = existing?.data?.at(-1)?.period;
  const since = last ? addDays(last, -28) : shiftYears(fmtDate(now), -HISTORY_YEARS);
  const rows = [];
  for (let offset = 0; ; ) {
    const page = await getJson(cftcUrl({ since, offset }), { fetchImpl });
    if (!Array.isArray(page) || !page.length) break;
    rows.push(...page);
    offset += page.length;
    if (page.length < 5000) break;
  }
  const incoming = normalizeCftc(rows);
  const map = new Map((existing?.data ?? []).map((r) => [r.period, r]));
  for (const r of incoming) map.set(r.period, r);
  const data = [...map.values()].sort((a, b) => a.period.localeCompare(b.period));
  await saveIfChanged(file, { key: 'cftc', dataset: CFTC.dataset, marketCode: CFTC.marketCode }, data, now, log, `CFTC ${CFTC.marketCode}`);
}

export async function fetchMarkets({ apiKey, now = new Date(), fetchImpl, log = console.log } = {}) {
  const errors = [];
  try {
    errors.push(...(await fetchEiaMarkets({ apiKey, now, fetchImpl, log })));
  } catch (e) {
    errors.push(`EIA: ${redact(e.message)}`);
  }
  try {
    await fetchCftc({ now, fetchImpl, log });
  } catch (e) {
    errors.push(`CFTC: ${e.message}`);
  }
  return errors;
}

if (isMain(import.meta.url)) {
  const errors = await fetchMarkets({ apiKey: process.env.EIA_API_KEY });
  if (errors.length) {
    console.error(`市場データの取得に失敗した系列があります:\n  ${errors.join('\n  ')}`);
    process.exit(1);
  }
}
