// テスト用の合成データ（実データではない）。決まった乱数で毎回同じ値を作る
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { SERIES } from '../../config/series.mjs';
import { addDays } from '../../scripts/lib/dates.mjs';
import { writeJson } from '../../scripts/lib/io.mjs';

const BASE = {
  crude: 430000, spr: 400000, gasoline: 225000, distillate: 120000, cushing: 30000,
  utilization: 90, production: 13000, imports: 6500, exports: 4000, gasolineDemand: 8900,
};

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** lastWeek（金曜）までの years 年分の週次データ */
export function syntheticSeries(key, lastWeek, years = 11) {
  const r = rng(key.length * 7919 + 17);
  const n = Math.round(years * 52.18);
  const rows = [];
  for (let i = n; i >= 0; i--) {
    const period = addDays(lastWeek, -7 * i);
    const t = (n - i) / 52.18;
    const base = BASE[key];
    const amp = key === 'utilization' ? 4 : base * 0.04;
    const v = base + amp * Math.sin(2 * Math.PI * t) + (r() - 0.5) * amp * 0.6;
    rows.push({ period, value: Math.round(v * 10) / 10 });
  }
  return rows;
}

/** 一時ディレクトリに data/raw を作り、環境変数を向ける */
export async function setupTempSite(lastWeek, { omit = {} } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'eia-test-'));
  process.env.DATA_DIR = path.join(dir, 'data');
  process.env.WEEKLY_CONTENT_DIR = path.join(dir, 'content');
  process.env.DIST_DIR = path.join(dir, 'dist');
  for (const s of SERIES) {
    let data = syntheticSeries(s.key, lastWeek);
    if (omit[s.key]) data = data.filter((d) => !omit[s.key].includes(d.period));
    await writeJson(path.join(dir, 'data/raw', `${s.key}.json`), { key: s.key, seriesId: s.id, data });
  }
  return dir;
}
