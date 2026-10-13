// config/series.mjs の系列IDが正しいかを、EIA API が返す系列名と単位で確認する
//   EIA_API_KEY=xxxx npm run verify-series
import { SERIES } from '../config/series.mjs';
import { fetchSeries } from './fetch.mjs';
import { addDays, fmtDate } from './lib/dates.mjs';

const apiKey = process.env.EIA_API_KEY;
if (!apiKey) {
  console.error('環境変数 EIA_API_KEY を設定してください');
  process.exit(1);
}

let ng = 0;
const start = addDays(fmtDate(new Date()), -60);
for (const s of SERIES) {
  try {
    const { meta, rows } = await fetchSeries(s, { apiKey, start });
    const okDesc = s.expect.description.test(meta.description);
    const okUnit = s.expect.units.test(meta.units);
    const ok = okDesc && okUnit && rows.length > 0;
    if (!ok) ng++;
    console.log(
      `${ok ? 'OK' : 'NG'}  ${s.id.padEnd(24)} ${s.nameJa}\n    EIA: ${meta.description} [${meta.units}] 最新 ${rows.at(-1)?.period ?? 'なし'}`,
    );
  } catch (e) {
    ng++;
    console.log(`NG  ${s.id.padEnd(24)} ${s.nameJa}\n    エラー: ${e.message}`);
  }
}
console.log(ng ? `\n${ng}件の系列を確認してください` : '\nすべての系列を確認できました');
process.exit(ng ? 1 : 0);
