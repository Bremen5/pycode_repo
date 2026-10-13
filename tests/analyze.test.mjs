import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSeries, fiveYearStats, indexSeries } from '../scripts/analyze.mjs';
import { seriesByKey } from '../config/series.mjs';
import { addDays } from '../scripts/lib/dates.mjs';

const WEEK = '2026-10-09';
// 過去5年の「同じ週」（各年で ±3日以内の最も近い金曜）
const SAME_WEEKS = { 2025: '2025-10-10', 2024: '2024-10-11', 2023: '2023-10-06', 2022: '2022-10-07', 2021: '2021-10-08' };
const SAME_VALUES = { 2025: 410000, 2024: 420000, 2023: 430000, 2022: 440000, 2021: 450000 };

/** 2020年から WEEK まで毎週 400000、特定の週だけ値を変えたデータ */
function makeRows(overrides) {
  const rows = [];
  for (let d = '2020-01-03'; d <= WEEK; d = addDays(d, 7)) rows.push({ period: d, value: overrides[d] ?? 400000 });
  return rows;
}

const base = {
  [WEEK]: 425000,
  '2026-10-02': 428000,
  ...Object.fromEntries(Object.entries(SAME_WEEKS).map(([y, d]) => [d, SAME_VALUES[y]])),
};

test('前週比を計算する', () => {
  const a = analyzeSeries(seriesByKey.crude, makeRows(base), WEEK);
  assert.equal(a.value, 425000);
  assert.equal(a.prev, 428000);
  assert.equal(a.prevPeriod, '2026-10-02');
  assert.equal(a.change, -3000);
  assert.equal(a.changePct, Math.round((-3000 / 428000) * 100 * 1000) / 1000);
});

test('前年同週比は1年前の最も近い週と比べる', () => {
  const a = analyzeSeries(seriesByKey.crude, makeRows(base), WEEK);
  assert.equal(a.yearAgoPeriod, '2025-10-10');
  assert.equal(a.yearAgo, 410000);
  assert.equal(a.yoyChange, 15000);
  assert.equal(a.yoyPct, Math.round((15000 / 410000) * 100 * 1000) / 1000);
});

test('過去5年の同じ週の平均・最大・最小', () => {
  const idx = indexSeries(makeRows(base));
  const s = fiveYearStats(idx, WEEK);
  assert.deepEqual(s.values.map((v) => v.period), ['2025-10-10', '2024-10-11', '2023-10-06', '2022-10-07', '2021-10-08']);
  assert.equal(s.n, 5);
  assert.equal(s.avg, 430000);
  assert.equal(s.max, 450000);
  assert.equal(s.min, 410000);

  const a = analyzeSeries(seriesByKey.crude, makeRows(base), WEEK);
  assert.equal(a.diffAvg5, -5000);
  assert.equal(a.pctAvg5, Math.round((-5000 / 430000) * 100 * 1000) / 1000);
  assert.equal(a.rangePos, 'within');
});

test('過去5年の範囲を外れたら highlight になる', () => {
  const below = analyzeSeries(seriesByKey.crude, makeRows({ ...base, [WEEK]: 405000 }), WEEK);
  assert.equal(below.rangePos, 'below');
  assert.equal(below.highlight, true);
  const above = analyzeSeries(seriesByKey.crude, makeRows({ ...base, [WEEK]: 455000 }), WEEK);
  assert.equal(above.rangePos, 'above');
  assert.equal(above.highlight, true);
});

test('過去5年分のデータがそろわなければ5年比較は null', () => {
  const rows = makeRows(base).filter((r) => r.period >= '2023-01-01');
  const a = analyzeSeries(seriesByKey.crude, rows, WEEK);
  assert.equal(a.avg5, null);
  assert.equal(a.rangePos, null);
  assert.equal(a.yoyChange, 15000);
});

test('前週のデータが欠けていれば前週比は null', () => {
  const rows = makeRows(base).filter((r) => r.period !== '2026-10-02');
  const a = analyzeSeries(seriesByKey.crude, rows, WEEK);
  assert.equal(a.change, null);
});

test('うるう年をまたいでも同じ週を見つける', () => {
  const idx = indexSeries(makeRows({}));
  // 2024-02-29 の1年前は 2023-02-28 → 近い金曜 2023-03-03
  const s = fiveYearStats(idx, '2024-03-01', 3);
  assert.deepEqual(s.values.map((v) => v.period), ['2023-03-03', '2022-03-04', '2021-02-26']);
});

test('大きな週間変化を検出する（過去5年の標準偏差の2倍以上）', () => {
  const ov = {};
  // ふだんは毎週 ±2000 程度の変動
  let d = '2020-01-03';
  let i = 0;
  for (; d < '2026-10-02'; d = addDays(d, 7)) ov[d] ??= 400000 + (i++ % 2 ? 1000 : -1000);
  ov['2026-10-02'] = 400000;
  ov[WEEK] = 400000 - 9000;
  const a = analyzeSeries(seriesByKey.crude, makeRows(ov), WEEK);
  assert.equal(a.bigMove, true);
  assert.ok(a.changeZ < -2);
});
