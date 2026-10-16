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

/** 価格・建玉・世界の需給の架空データ（dataDir/markets/raw） */
export async function writeSyntheticMarkets(dataDir, lastWeek, { years = 10 } = {}) {
  const r = rng(424242);
  const dir = path.join(dataDir, 'markets', 'raw');
  const days = [];
  const start = addDays(lastWeek, -Math.round(years * 365.25));
  for (let d = start; d <= lastWeek; d = addDays(d, 1)) {
    const wd = new Date(d + 'T00:00:00Z').getUTCDay();
    if (wd !== 0 && wd !== 6) days.push(d);
  }
  let wti = 62;
  let hh = 3;
  const P = { wti: [], brent: [], gasolineNYH: [], ulsdNYH: [], henryHub: [], retailGasoline: [], retailDiesel: [] };
  for (const d of days) {
    const doy = (Number(d.slice(5, 7)) - 1) / 12;
    wti += (72 - wti) * 0.004 + (r() - 0.5) * 2.2;
    hh += (3.2 - hh) * 0.01 + (r() - 0.5) * 0.12 + 0.01 * Math.cos(2 * Math.PI * (doy - 0.05));
    hh = Math.max(1.6, hh);
    const brent = wti + 3.6 + (r() - 0.5) * 1.2;
    const gas = (wti + 22 + 10 * Math.cos(2 * Math.PI * (doy - 0.4)) + (r() - 0.5) * 3) / 42;
    const ulsd = (wti + 32 + 6 * Math.cos(2 * Math.PI * (doy - 0.95)) + (r() - 0.5) * 3) / 42;
    P.wti.push({ period: d, value: Math.round(wti * 100) / 100 });
    P.brent.push({ period: d, value: Math.round(brent * 100) / 100 });
    P.gasolineNYH.push({ period: d, value: Math.round(gas * 1000) / 1000 });
    P.ulsdNYH.push({ period: d, value: Math.round(ulsd * 1000) / 1000 });
    P.henryHub.push({ period: d, value: Math.round(hh * 100) / 100 });
    if (new Date(d + 'T00:00:00Z').getUTCDay() === 1) {
      P.retailGasoline.push({ period: d, value: Math.round((gas + 0.95 + (r() - 0.5) * 0.04) * 1000) / 1000 });
      P.retailDiesel.push({ period: d, value: Math.round((ulsd + 1.25 + (r() - 0.5) * 0.04) * 1000) / 1000 });
    }
  }
  for (const [key, data] of Object.entries(P)) await writeJson(path.join(dir, `${key}.json`), { key, synthetic: true, data });

  // CFTC（火曜時点）
  const cftc = [];
  let mm = 220000;
  for (const d of days) {
    if (new Date(d + 'T00:00:00Z').getUTCDay() !== 2) continue;
    mm += (200000 - mm) * 0.05 + (r() - 0.5) * 40000;
    const short = 60000 + Math.round(r() * 50000);
    cftc.push({ period: d, oi: 1700000 + Math.round((r() - 0.5) * 200000), mmLong: Math.round(mm + short), mmShort: short, pmLong: 400000, pmShort: 650000, swapLong: 500000, swapShort: 300000 });
  }
  await writeJson(path.join(dir, 'cftc.json'), { key: 'cftc', synthetic: true, data: cftc });

  // STEO（月次。2015年1月〜翌年12月）
  const endYear = Number(lastWeek.slice(0, 4)) + 1;
  const steo = { worldSupply: [], worldDemand: [], opecCrude: [], usCrude: [], oecdStocks: [] };
  let stocks = 2850;
  for (let y = 2015; y <= endYear; y++) {
    for (let m = 1; m <= 12; m++) {
      const t = y - 2015 + (m - 1) / 12;
      const covid = y === 2020 && m >= 3 && m <= 8 ? -14 * Math.sin(((m - 2) / 7) * Math.PI) : 0;
      const demand = 95 + 0.95 * t + 1.2 * Math.cos(2 * Math.PI * ((m - 1) / 12 - 0.6)) + covid + (r() - 0.5) * 0.4;
      const supply = demand + (r() - 0.5) * 1.6 + (y === 2020 && m >= 4 && m <= 6 ? 4 : 0);
      stocks += (supply - demand) * 30 * 0.4;
      const period = `${y}-${String(m).padStart(2, '0')}`;
      steo.worldSupply.push({ period, value: Math.round(supply * 100) / 100 });
      steo.worldDemand.push({ period, value: Math.round(demand * 100) / 100 });
      steo.opecCrude.push({ period, value: Math.round((30 - (t > 5 ? 3 : 0) + (r() - 0.5) * 0.6) * 100) / 100 });
      steo.usCrude.push({ period, value: Math.round((9.4 + 0.42 * t - (y === 2020 ? 1.5 : 0)) * 100) / 100 });
      steo.oecdStocks.push({ period, value: Math.round(stocks) });
    }
  }
  const fetchedAt = new Date(lastWeek + 'T00:00:00Z').toISOString();
  for (const [key, data] of Object.entries(steo)) await writeJson(path.join(dir, `${key}.json`), { key, synthetic: true, fetchedAt, data });
}

/** dataDir/raw に全系列の架空データを書く */
export async function writeSyntheticRaw(dataDir, lastWeek, opts = {}) {
  const omit = opts.omit ?? {};
  for (const s of SERIES) {
    let data = syntheticSeries(s.key, lastWeek);
    if (omit[s.key]) data = data.filter((d) => !omit[s.key].includes(d.period));
    await writeJson(path.join(dataDir, 'raw', `${s.key}.json`), { key: s.key, seriesId: s.id, synthetic: true, data });
  }
  if (opts.markets !== false) await writeSyntheticMarkets(dataDir, lastWeek);
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
