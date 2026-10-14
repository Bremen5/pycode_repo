// 表示確認用のデモサイトを作る（架空のデータを使用。実際のEIA統計ではない）
//
//   npm run demo           → dist-demo/ に出力
//   npx serve dist-demo    → ブラウザで確認
//
// データ・下書きは .demo/ に作るため、data/ や content/weekly/ は変更しない
import path from 'node:path';
import { rm, readFile, writeFile } from 'node:fs/promises';
import { ROOT, listWeeks } from './lib/io.mjs';
import { writeSyntheticRaw } from './lib/synthetic.mjs';
import { latestExpectedWeekEnding } from './lib/dates.mjs';
import { REVIEW_MARK } from './draft.mjs';

const work = path.join(ROOT, '.demo');
await rm(work, { recursive: true, force: true });
process.env.DATA_DIR = path.join(work, 'data');
process.env.WEEKLY_CONTENT_DIR = path.join(work, 'content');

const { run: analyze } = await import('./analyze.mjs');
const { run: draft } = await import('./draft.mjs');
const { build } = await import('./build.mjs');

const quiet = () => {};
await writeSyntheticRaw(process.env.DATA_DIR, latestExpectedWeekEnding(new Date()));
await analyze({ weeks: 8, log: quiet });
await draft({ log: quiet });

// 下書きを「仕上げ済み」の状態にする（デモ用）
for (const w of await listWeeks(process.env.WEEKLY_CONTENT_DIR, '.md')) {
  const f = path.join(process.env.WEEKLY_CONTENT_DIR, `${w}.md`);
  let t = await readFile(f, 'utf8');
  t = t
    .replace('draft: true', 'draft: false')
    .split('\n')
    .filter((l) => !l.startsWith(`> ${REVIEW_MARK}`))
    .join('\n')
    .replace(/\n## 背景\n\n.*\n?$/, '\n')
    .replaceAll(`${REVIEW_MARK} `, '');
  await writeFile(f, t);
}

await build({
  outDir: path.join(ROOT, 'dist-demo'),
  includeDrafts: false,
  banner: '<div class="sample-banner">表示確認用のデモです。数値は架空のデータで、実際のEIA統計ではありません。</div>',
});
console.log('npx serve dist-demo で確認できます');
