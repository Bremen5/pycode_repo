// data/raw の系列データから、週ごとの比較データ data/weekly/YYYY-MM-DD.json を作る
//
//   node scripts/analyze.mjs              最新週を処理（すでにあれば何もしない）
//   node scripts/analyze.mjs --weeks 4    直近4週分を処理（初回用）
//   node scripts/analyze.mjs --strict     発表済みのはずの週のデータが無ければ失敗終了
//   node scripts/analyze.mjs --force      既存ファイルも作り直す
import path from 'node:path';
import { SERIES, PRIMARY_KEY } from '../config/series.mjs';
import { paths, readJson, writeJson, existsSync, isMain, setActionOutput } from './lib/io.mjs';
import { addDays, diffDays, shiftYears, releaseSchedule, latestExpectedWeekEnding } from './lib/dates.mjs';

const YEARS = 5;
const RECENT_WEEKS = 52;
const BIG_MOVE_Z = 2; // 週間の変化が過去5年の標準偏差の何倍を超えたら「大きな変化」とするか

/** period → value の索引と、日付の近い週を探す関数 */
export function indexSeries(rows) {
  const map = new Map(rows.map((r) => [r.period, r.value]));
  const periods = rows.map((r) => r.period);
  return {
    map,
    periods,
    get: (d) => (map.has(d) ? map.get(d) : null),
    /** target から ±tol 日以内で最も近い週の値 */
    near(target, tol = 3) {
      let best = null;
      for (let k = -tol; k <= tol; k++) {
        const d = addDays(target, k);
        if (map.has(d) && (best === null || Math.abs(k) < Math.abs(best.k))) best = { k, d, v: map.get(d) };
      }
      return best ? { period: best.d, value: best.v } : null;
    },
  };
}

const round = (x, d = 3) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const pct = (a, b) => (a == null || b == null || b === 0 ? null : ((a - b) / Math.abs(b)) * 100);

/** 過去 YEARS 年の同じ週（各年 ±3日以内で最も近い週）の値 */
export function sameWeekHistory(idx, week, years = YEARS) {
  const vals = [];
  for (let y = 1; y <= years; y++) {
    const hit = idx.near(shiftYears(week, -y));
    if (hit) vals.push({ year: Number(hit.period.slice(0, 4)), period: hit.period, value: hit.value });
  }
  return vals;
}

export function fiveYearStats(idx, week, years = YEARS) {
  const hist = sameWeekHistory(idx, week, years);
  if (hist.length < years) return { avg: null, max: null, min: null, n: hist.length, values: hist };
  const v = hist.map((h) => h.value);
  return {
    avg: v.reduce((a, b) => a + b, 0) / v.length,
    max: Math.max(...v),
    min: Math.min(...v),
    n: v.length,
    values: hist,
  };
}

/** 過去 YEARS 年の週間変化の標準偏差（変化の大きさの目安） */
export function weeklyChangeStd(idx, week, years = YEARS) {
  const from = shiftYears(week, -years);
  const changes = [];
  for (let i = 1; i < idx.periods.length; i++) {
    const d = idx.periods[i];
    if (d <= from || d >= week) continue;
    const prev = idx.periods[i - 1];
    if (diffDays(d, prev) === 7) changes.push(idx.map.get(d) - idx.map.get(prev));
  }
  if (changes.length < 20) return null;
  const mean = changes.reduce((a, b) => a + b, 0) / changes.length;
  const variance = changes.reduce((a, b) => a + (b - mean) ** 2, 0) / (changes.length - 1);
  return Math.sqrt(variance);
}

/** 1系列・1週分の比較 */
export function analyzeSeries(series, rows, week) {
  const idx = indexSeries(rows);
  const value = idx.get(week);
  if (value == null) return null;
  const prevHit = idx.near(addDays(week, -7), 1);
  const prev = prevHit?.value ?? null;
  const yearAgoHit = idx.near(shiftYears(week, -1));
  const yearAgo = yearAgoHit?.value ?? null;
  const s5 = fiveYearStats(idx, week);
  const change = prev == null ? null : value - prev;
  const std = weeklyChangeStd(idx, week);
  const z = change != null && std ? change / std : null;
  const rangePos = s5.max == null ? null : value > s5.max ? 'above' : value < s5.min ? 'below' : 'within';

  const recent = idx.periods
    .filter((d) => d <= week && d > addDays(week, -7 * RECENT_WEEKS))
    .map((d) => {
      const st = fiveYearStats(idx, d);
      return { period: d, value: idx.get(d), avg5: round(st.avg), min5: st.min, max5: st.max };
    });

  return {
    key: series.key,
    id: series.id,
    nameJa: series.nameJa,
    kind: series.kind,
    unit: series.unit,
    value,
    prev,
    prevPeriod: prevHit?.period ?? null,
    change: round(change),
    changePct: round(pct(value, prev)),
    yearAgo,
    yearAgoPeriod: yearAgoHit?.period ?? null,
    yoyChange: round(yearAgo == null ? null : value - yearAgo),
    yoyPct: round(pct(value, yearAgo)),
    avg5: round(s5.avg),
    max5: s5.max,
    min5: s5.min,
    fiveYearValues: s5.values,
    diffAvg5: round(s5.avg == null ? null : value - s5.avg),
    pctAvg5: round(pct(value, s5.avg)),
    rangePos,
    changeStd5: round(std),
    changeZ: round(z, 2),
    bigMove: z != null && Math.abs(z) >= BIG_MOVE_Z,
    highlight: rangePos === 'above' || rangePos === 'below' || (z != null && Math.abs(z) >= BIG_MOVE_Z),
    recent,
  };
}

/** すべての系列がその週の値を持っているか */
export function isWeekComplete(rawByKey, week) {
  return SERIES.every((s) => rawByKey[s.key]?.data?.some((r) => r.period === week));
}

export function analyzeWeek(rawByKey, week, now = new Date()) {
  const series = {};
  for (const s of SERIES) series[s.key] = analyzeSeries(s, rawByKey[s.key].data, week);
  return {
    weekEnding: week,
    release: releaseSchedule(week),
    nextRelease: releaseSchedule(addDays(week, 7)),
    generatedAt: now.toISOString(),
    source: 'U.S. Energy Information Administration (EIA), Weekly Petroleum Status Report',
    series,
  };
}

export async function loadRaw() {
  const p = paths();
  const out = {};
  for (const s of SERIES) {
    const f = path.join(p.raw, `${s.key}.json`);
    out[s.key] = existsSync(f) ? await readJson(f) : { data: [] };
  }
  return out;
}

/**
 * 処理対象の週を決めて data/weekly に書き出す。
 * 戻り値: { created: [週], latestAvailable, expected, missingExpected }
 */
export async function run({ weeks = 1, force = false, now = new Date(), log = console.log } = {}) {
  const p = paths();
  const raw = await loadRaw();
  const primary = raw[PRIMARY_KEY].data.map((r) => r.period);
  // 全系列がそろっている週のうち新しいものから weeks 週
  const complete = primary.filter((w) => isWeekComplete(raw, w));
  const targets = complete.slice(-weeks);
  const latestAvailable = complete.at(-1) ?? null;
  const expected = latestExpectedWeekEnding(now);

  if (primary.at(-1) && primary.at(-1) !== latestAvailable) {
    log(`注意: ${primary.at(-1)} の週は一部の系列が未更新のため処理しません`);
  }

  const created = [];
  for (const w of targets) {
    const file = path.join(p.weekly, `${w}.json`);
    if (existsSync(file) && !force) continue;
    await writeJson(file, analyzeWeek(raw, w, now));
    created.push(w);
    log(`作成: data/weekly/${w}.json`);
  }
  if (!created.length) log(`新しい週のデータはありません（最新: ${latestAvailable ?? 'なし'}）`);
  const missingExpected = !latestAvailable || latestAvailable < expected;
  return { created, latestAvailable, expected, missingExpected };
}

function argValue(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}

if (isMain(import.meta.url)) {
  const weeks = Number(argValue('--weeks', 1));
  const force = process.argv.includes('--force');
  const strict = process.argv.includes('--strict');
  const r = await run({ weeks, force });
  await setActionOutput('created', r.created.join(','));
  await setActionOutput('latest', r.latestAvailable ?? '');
  if (r.missingExpected) {
    const msg = `発表済みのはずの ${r.expected} 週のデータがまだありません（手元の最新: ${r.latestAvailable ?? 'なし'}）`;
    if (strict) {
      console.error(`エラー: ${msg}。EIAの発表遅延（祝日など）を確認してください`);
      process.exit(1);
    }
    console.log(`注意: ${msg}`);
  }
}
