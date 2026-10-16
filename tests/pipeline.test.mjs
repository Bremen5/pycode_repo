// analyze → draft → build を合成データで通しで確認する
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { setupTempSite, syntheticSeries } from '../scripts/lib/synthetic.mjs';
import { run as analyze } from '../scripts/analyze.mjs';
import { run as draft, REVIEW_MARK } from '../scripts/draft.mjs';
import { build, PAGE_BUDGET } from '../scripts/build.mjs';
import { writeJson } from '../scripts/lib/io.mjs';
import { parseFrontMatter } from '../scripts/lib/markdown.mjs';

const quiet = () => {};
const LAST = '2026-10-02';
// 10/2週の発表（10/7）後、10/9週の発表（祝日で10/15に遅れる）前
const NOW = new Date('2026-10-14T23:00:00Z');

/** 下書きを人が仕上げた状態にする */
async function finalize(file) {
  const text = await readFile(file, 'utf8');
  await writeFile(file, text.replace('draft: true', 'draft: false').replaceAll(REVIEW_MARK, ''));
}

test('初回：直近4週分を作り、下書きはビルドに出ない。仕上げると出る', async () => {
  const dir = await setupTempSite(LAST);
  const r = await analyze({ weeks: 4, now: NOW, log: quiet });
  assert.deepEqual(r.created, ['2026-09-11', '2026-09-18', '2026-09-25', '2026-10-02']);
  assert.equal(r.missingExpected, false);

  const drafts = await draft({ log: quiet });
  assert.equal(drafts.length, 4);
  const md = await readFile(path.join(dir, 'content', `${LAST}.md`), 'utf8');
  const { data: fm } = parseFrontMatter(md);
  assert.equal(fm.draft, true);
  assert.ok(md.includes(REVIEW_MARK));
  assert.match(fm.title, /^EIA原油在庫 2026年10月2日週｜前週比[\d.]+万バレル[増減]$/);
  assert.equal(fm.summary.length, 3);

  // 下書きのままならビルドに出ない
  let b = await build({ log: quiet });
  assert.deepEqual(b.weeks, []);
  assert.equal(existsSync(path.join(dir, 'dist/weekly', LAST)), false);

  // 1週だけ仕上げる
  await finalize(path.join(dir, 'content', `${LAST}.md`));
  b = await build({ log: quiet });
  assert.deepEqual(b.weeks, [LAST]);
  const html = await readFile(path.join(dir, 'dist/weekly', LAST, 'index.html'), 'utf8');
  assert.ok(html.includes('出典：<a href="https://www.eia.gov/petroleum/supply/weekly/"'));
  assert.ok(html.includes('特定の金融商品の売買を推奨するものではありません'));
  assert.ok(html.includes('<span class="pr">PR</span>'));
  assert.ok(html.includes('"@type":"Article"') && html.includes('"@type":"Dataset"'));
  assert.ok(html.includes('<link rel="canonical"'));
  assert.ok(html.includes('kL'));
  assert.ok(html.includes('<svg'));
  assert.ok(!html.includes(REVIEW_MARK));
  // 価格と市場（同じ週）
  assert.ok(html.includes('id="markets"'));
  assert.ok(html.includes('CFTC'));
  // 次回発表：10/9週は祝日（コロンブスデー）で木曜に遅れる
  assert.ok(html.includes('2026年10月16日（金）00:00'));
  assert.ok(html.includes('通常より遅れる見込み'));

  const feed = await readFile(path.join(dir, 'dist/feed.xml'), 'utf8');
  assert.ok(feed.includes(`/weekly/${LAST}/`));
  assert.ok(!feed.includes('/weekly/2026-09-25/'));

  const sitemap = await readFile(path.join(dir, 'dist/sitemap.xml'), 'utf8');
  assert.ok(sitemap.includes(`/weekly/${LAST}/`));
  assert.ok(!sitemap.includes('/weekly/2026-09-25/'));
  for (const f of ['index.html', '404.html', 'about.html', 'privacy.html', 'disclaimer.html', 'guide/index.html', 'markets/index.html', 'world/index.html', 'feed.xml']) {
    assert.ok(existsSync(path.join(dir, 'dist', f)), f);
  }
  for (const s of b.sizes) assert.ok(s.total <= PAGE_BUDGET, `${s.file} ${s.total}`);
});

test('【要確認】が残っていれば draft: false でも出力しない', async () => {
  const dir = await setupTempSite(LAST);
  await analyze({ weeks: 1, now: NOW, log: quiet });
  await draft({ log: quiet });
  const file = path.join(dir, 'content', `${LAST}.md`);
  await writeFile(file, (await readFile(file, 'utf8')).replace('draft: true', 'draft: false'));
  const b = await build({ log: quiet });
  assert.deepEqual(b.weeks, []);
});

test('発表が遅れてデータが未更新なら、新しい週も下書きも作らない', async () => {
  const dir = await setupTempSite(LAST);
  await analyze({ weeks: 1, now: NOW, log: quiet });
  await draft({ log: quiet });

  // 翌週の再実行（日本時間 金曜8:00）。EIAの発表が遅れて raw は前回のまま
  const later = new Date('2026-10-15T23:00:00Z');
  const r = await analyze({ now: later, log: quiet });
  assert.deepEqual(r.created, []);
  assert.equal(r.expected, '2026-10-09');
  assert.equal(r.missingExpected, true); // --strict ならここで失敗終了になる
  assert.deepEqual(await draft({ log: quiet }), []);
  assert.deepEqual((await readdir(path.join(dir, 'content'))).sort(), [`${LAST}.md`]);
});

test('一部の系列だけ最新週が欠けている場合は、その週を処理しない', async () => {
  const dir = await setupTempSite('2026-10-09', { omit: { cushing: ['2026-10-09'] } });
  const r = await analyze({ now: new Date('2026-10-15T23:00:00Z'), log: quiet });
  assert.deepEqual(r.created, ['2026-10-02']);
  assert.equal(r.latestAvailable, '2026-10-02');
  assert.equal(existsSync(path.join(dir, 'data/weekly/2026-10-09.json')), false);
});

test('最新週が追加されたら、その週だけ下書きを作る（既存の解説は上書きしない）', async () => {
  const dir = await setupTempSite(LAST);
  await analyze({ weeks: 1, now: NOW, log: quiet });
  await draft({ log: quiet });
  const prevFile = path.join(dir, 'content', `${LAST}.md`);
  await writeFile(prevFile, '---\ntitle: 仕上げ済み\nweekEnding: 2026-10-02\ndraft: false\n---\n本文\n');

  // 新しい週のデータが届く
  const { SERIES } = await import('../config/series.mjs');
  for (const s of SERIES) {
    await writeJson(path.join(dir, 'data/raw', `${s.key}.json`), { key: s.key, data: syntheticSeries(s.key, '2026-10-09') });
  }
  const r = await analyze({ now: new Date('2026-10-15T23:00:00Z'), log: quiet });
  assert.deepEqual(r.created, ['2026-10-09']);
  assert.deepEqual(await draft({ log: quiet }), ['2026-10-09']);
  assert.ok((await readFile(prevFile, 'utf8')).includes('仕上げ済み'));
});
