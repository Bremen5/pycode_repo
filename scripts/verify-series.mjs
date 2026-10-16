// 系列IDとデータ項目が正しいかを確認する
//   - config/series.mjs と config/markets.mjs の EIA 系列：EIA が返す系列名・単位を expect と照合
//   - CFTC：WTI 原油の行が取得でき、必要な項目がそろっているか
//   EIA_API_KEY=xxxx npm run verify-series
import { SERIES } from '../config/series.mjs';
import { PRICE_SERIES, STEO_SERIES, CFTC } from '../config/markets.mjs';
import { fetchSeries, getJson } from './fetch.mjs';
import { cftcUrl } from './fetch-markets.mjs';
import { addDays, fmtDate } from './lib/dates.mjs';

const apiKey = process.env.EIA_API_KEY;
if (!apiKey) {
  console.error('環境変数 EIA_API_KEY を設定してください');
  process.exit(1);
}

let ng = 0;
const today = fmtDate(new Date());
for (const s of [...SERIES, ...PRICE_SERIES, ...STEO_SERIES]) {
  const isSteo = s.route?.startsWith('STEO.');
  try {
    const { meta, rows } = await fetchSeries(s, { apiKey, start: isSteo ? undefined : addDays(today, -60) });
    const okDesc = s.expect.description.test(meta.description);
    const okUnit = !s.expect.units || s.expect.units.test(meta.units);
    const ok = okDesc && okUnit && rows.length > 0;
    if (!ok) ng++;
    console.log(`${ok ? 'OK' : 'NG'}  ${s.id.padEnd(28)} ${s.nameJa}\n    EIA: ${meta.description} [${meta.units}] 最新 ${rows.at(-1)?.period ?? 'なし'}`);
  } catch (e) {
    ng++;
    console.log(`NG  ${s.id.padEnd(28)} ${s.nameJa}\n    エラー: ${e.message}`);
  }
}

try {
  const rows = await getJson(cftcUrl({ since: addDays(today, -40) }));
  const last = rows.at(-1) ?? {};
  const missing = Object.values(CFTC.fields).filter((f) => !(f in last));
  const ok = rows.length > 0 && missing.length === 0;
  if (!ok) ng++;
  console.log(`${ok ? 'OK' : 'NG'}  CFTC ${CFTC.marketCode}  ${last.market_and_exchange_names ?? ''}\n    件数 ${rows.length}${missing.length ? ` / 見つからない項目: ${missing.join(', ')}` : ''}`);
} catch (e) {
  ng++;
  console.log(`NG  CFTC ${CFTC.marketCode}\n    エラー: ${e.message}`);
}

console.log(ng ? `\n${ng}件を確認してください` : '\nすべての系列を確認できました');
process.exit(ng ? 1 : 0);
