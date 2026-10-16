// 公開前チェック：仮の値が残っていないかを確認する
//   npm run check:launch
import path from 'node:path';
import { SITE } from '../config/site.mjs';
import { paths, listWeeks, existsSync } from './lib/io.mjs';
import { loadWeeks } from './build.mjs';

export async function checkLaunch() {
  const issues = [];
  const warn = [];
  if (/example\./.test(SITE.url) || !/^https:\/\//.test(SITE.url)) issues.push(`config/site.mjs の url が仮の値です（${SITE.url}）`);
  if (/X{4,}/.test(SITE.ga4Id)) issues.push(`config/site.mjs の ga4Id が仮の値です（${SITE.ga4Id}）。使わない場合は空文字にしてください`);
  if (/記入/.test(SITE.operator.name)) issues.push('config/site.mjs の operator.name（運営者名）が未記入です');
  if (/記入/.test(SITE.operator.contact)) issues.push('config/site.mjs の operator.contact（連絡先）が未記入です');
  if (SITE.ads.enabled && Object.values(SITE.ads.slots).some((s) => s.includes('ad-placeholder'))) {
    warn.push('広告枠が仮の表示のままです。広告を契約するまでは config/site.mjs の ads.enabled を false にすることをおすすめします');
  }
  if (SITE.prices?.enabled !== false && !SITE.prices?.licenseConfirmed) {
    issues.push('価格データ（EIAのスポット価格。元データは民間の情報会社）の利用条件が未確認です。確認後に config/site.mjs の prices.licenseConfirmed を true にするか、掲載しない場合は prices.enabled を false にしてください');
  }
  const p = paths();
  if (!existsSync(path.join(p.markets, 'dashboard.json'))) warn.push('市場指標のデータがありません（npm run fetch:markets と npm run markets を実行してください）');
  const raw = existsSync(path.join(p.raw, 'crude.json'));
  if (!raw) issues.push('data/raw にデータがありません（npm run fetch を実行してください）');
  const published = await loadWeeks({ log: () => {} });
  if (!published.length) issues.push('公開できる週がありません（解説を仕上げて draft: false にしてください）');
  const drafts = (await listWeeks(p.weeklyContent, '.md')).length - published.length;
  if (drafts > 0) warn.push(`下書きのままの週が ${drafts} 件あります（公開はされません）`);
  return { issues, warn };
}

const { issues, warn } = await checkLaunch();
for (const w of warn) console.log(`注意: ${w}`);
for (const i of issues) console.log(`要対応: ${i}`);
console.log(issues.length ? `\n公開前に ${issues.length} 件の対応が必要です` : '\n公開前チェックをすべて通過しました');
process.exit(issues.length ? 1 : 0);
