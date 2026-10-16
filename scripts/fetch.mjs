// EIA API v2 から週次系列を取得し、data/raw/{key}.json に保存する
//
//   初回（ファイルなし）: 過去10年分を一括取得
//   2回目以降        : 直近の数週間を取り直して追加・更新（EIAの改定値も反映）
//
// APIキーは環境変数 EIA_API_KEY から読む（GitHub Actions では Secrets）。
import path from 'node:path';
import { SERIES, EIA_API_BASE } from '../config/series.mjs';
import { paths, readJson, writeJson, existsSync, isMain } from './lib/io.mjs';
import { addDays, shiftYears, fmtDate } from './lib/dates.mjs';

const HISTORY_YEARS = 10;
const REFRESH_WEEKS = 8;
const PAGE_LENGTH = 5000; // EIA API v2 の1回あたりの上限

export function buildUrl(seriesId, { apiKey, start, offset = 0, route }) {
  const u = new URL(`${EIA_API_BASE}/seriesid/${route ?? `PET.${seriesId}.W`}`);
  u.searchParams.set('api_key', apiKey);
  if (start) u.searchParams.set('start', start);
  u.searchParams.set('length', String(PAGE_LENGTH));
  u.searchParams.set('offset', String(offset));
  return u;
}

export const redact = (s) => String(s).replace(/api_key=[^&\s]+/g, 'api_key=***');

export async function getJson(url, { retries = 4, fetchImpl = fetch } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetchImpl(url);
      if (res.ok) return await res.json();
      const body = await res.text();
      lastErr = new Error(`HTTP ${res.status}: ${redact(body.slice(0, 300))}`);
      if (res.status < 500 && res.status !== 429) break; // キー不正などは再試行しない
    } catch (e) {
      lastErr = new Error(redact(e.message));
    }
    if (i < retries) await new Promise((r) => setTimeout(r, 2000 * 2 ** i));
  }
  throw lastErr;
}

/** API レスポンスの data 配列 → [{period, value}]（昇順・数値化） */
export function normalizeRows(rows) {
  const out = [];
  for (const r of rows ?? []) {
    const value = r.value === null || r.value === '' ? NaN : Number(r.value);
    if (!/^\d{4}-\d{2}(-\d{2})?$/.test(r.period) || !Number.isFinite(value)) continue;
    out.push({ period: r.period, value });
  }
  return out.sort((a, b) => a.period.localeCompare(b.period));
}

/** 既存データに新しいデータを重ねる（同じ週は新しい値で上書き） */
export function mergeRows(existing, incoming) {
  const map = new Map(existing.map((r) => [r.period, r.value]));
  for (const r of incoming) map.set(r.period, r.value);
  return [...map.entries()]
    .map(([period, value]) => ({ period, value }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

export async function fetchSeries(series, { apiKey, start, fetchImpl }) {
  const rows = [];
  const seen = new Set();
  let meta = {};
  for (let offset = 0; ; ) {
    const json = await getJson(buildUrl(series.id, { apiKey, start, offset, route: series.route }), { fetchImpl });
    const resp = json.response ?? {};
    const data = resp.data ?? [];
    if (data[0]) {
      meta = {
        description: data[0]['series-description'] ?? data[0].seriesDescription ?? '',
        units: data[0].units ?? data[0].unit ?? '',
      };
    }
    let added = 0;
    for (const r of data) {
      if (seen.has(r.period)) continue;
      seen.add(r.period);
      rows.push(r);
      added++;
    }
    const total = Number(resp.total ?? 0);
    offset += data.length;
    if (!data.length || !added || offset >= total) break;
  }
  // start パラメーターが効かない場合に備えて、手元でも期間を絞る
  return { meta, rows: normalizeRows(rows).filter((r) => !start || r.period >= start) };
}

export async function fetchAll({ apiKey, now = new Date(), fetchImpl, log = console.log } = {}) {
  if (!apiKey) throw new Error('環境変数 EIA_API_KEY が設定されていません');
  const p = paths();
  const results = [];
  for (const s of SERIES) {
    const file = path.join(p.raw, `${s.key}.json`);
    const existing = existsSync(file) ? await readJson(file) : null;
    const last = existing?.data?.at(-1)?.period;
    const start = last ? addDays(last, -7 * REFRESH_WEEKS) : shiftYears(fmtDate(now), -HISTORY_YEARS);
    const { meta, rows } = await fetchSeries(s, { apiKey, start, fetchImpl });
    const data = mergeRows(existing?.data ?? [], rows);
    const changed = JSON.stringify(data) !== JSON.stringify(existing?.data ?? []);
    if (!changed) {
      log(`${s.id.padEnd(24)} 変更なし（最新 ${data.at(-1)?.period ?? 'なし'}）`);
      results.push({ key: s.key, latest: data.at(-1)?.period, changed });
      continue;
    }
    await writeJson(file, {
      key: s.key,
      seriesId: s.id,
      nameJa: s.nameJa,
      unit: s.unit,
      source: s.sourceUrl,
      eiaDescription: meta.description || existing?.eiaDescription || '',
      eiaUnits: meta.units || existing?.eiaUnits || '',
      fetchedAt: now.toISOString(),
      data,
    });
    log(`${s.id.padEnd(24)} ${rows.length}件取得 → 計${data.length}件（最新 ${data.at(-1)?.period ?? 'なし'}）`);
    results.push({ key: s.key, latest: data.at(-1)?.period, changed });
  }
  return results;
}

if (isMain(import.meta.url)) {
  fetchAll({ apiKey: process.env.EIA_API_KEY }).catch((e) => {
    console.error(`取得に失敗しました: ${redact(e.message)}`);
    process.exit(1);
  });
}
