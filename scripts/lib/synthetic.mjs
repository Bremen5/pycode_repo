// 架空の週次データ（テストと表示確認用。実際のEIA統計ではない）
// 決まった乱数を使うので、毎回同じ値になる
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { SERIES } from '../../config/series.mjs';
import { addDays } from './dates.mjs';
import { writeJson } from './io.mjs';

// 水準・季節変動の幅・季節の山（年初からの割合）・週ごとの揺れ
const PROFILE = {
  crude: { base: 430000, amp: 14000, peak: 0.35, noise: 3500 },
  spr: { base: 395000, amp: 0, peak: 0, noise: 600, trend: 2500 },
  gasoline: { base: 228000, amp: 12000, peak: 0.1, noise: 2200 },
  distillate: { base: 122000, amp: 9000, peak: 0.2, noise: 1800 },
  cushing: { base: 28000, amp: 3500, peak: 0.4, noise: 900 },
  utilization: { base: 89, amp: 4.5, peak: 0.6, noise: 1.2 },
  production: { base: 13200, amp: 120, peak: 0.7, noise: 90, trend: 150 },
  imports: { base: 6400, amp: 300, peak: 0.5, noise: 520 },
  exports: { base: 4000, amp: 250, peak: 0.6, noise: 600 },
  gasolineDemand: { base: 8900, amp: 450, peak: 0.55, noise: 230 },
};

function rng(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

/** lastWeek（金曜）までの years 年分の週次データ */
export function syntheticSeries(key, lastWeek, years = 11) {
  const p = PROFILE[key];
  const r = rng([...key].reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const n = Math.round(years * 52.18);
  const rows = [];
  let drift = 0;
  for (let i = n; i >= 0; i--) {
    const period = addDays(lastWeek, -7 * i);
    const doy = (Number(period.slice(5, 7)) - 1) / 12 + Number(period.slice(8, 10)) / 365;
    const yearsFromEnd = i / 52.18;
    drift = drift * 0.9 + (r() - 0.5) * p.noise;
    const seasonal = p.amp * Math.cos(2 * Math.PI * (doy - p.peak));
    const trend = (p.trend ?? 0) * -yearsFromEnd * 0.2;
    const v = p.base + seasonal + trend + drift + (r() - 0.5) * p.noise * 0.5;
    rows.push({ period, value: key === 'utilization' ? Math.round(Math.min(v, 97) * 10) / 10 : Math.round(v) });
  }
  return rows;
}

/** dataDir/raw に全系列の架空データを書く */
export async function writeSyntheticRaw(dataDir, lastWeek, { omit = {} } = {}) {
  for (const s of SERIES) {
    let data = syntheticSeries(s.key, lastWeek);
    if (omit[s.key]) data = data.filter((d) => !omit[s.key].includes(d.period));
    await writeJson(path.join(dataDir, 'raw', `${s.key}.json`), { key: s.key, seriesId: s.id, synthetic: true, data });
  }
}

/** 一時ディレクトリに data/raw を作り、環境変数を向ける（テスト用） */
export async function setupTempSite(lastWeek, opts) {
  const dir = await mkdtemp(path.join(tmpdir(), 'eia-test-'));
  process.env.DATA_DIR = path.join(dir, 'data');
  process.env.WEEKLY_CONTENT_DIR = path.join(dir, 'content');
  process.env.DIST_DIR = path.join(dir, 'dist');
  await writeSyntheticRaw(process.env.DATA_DIR, lastWeek, opts);
  return dir;
}
