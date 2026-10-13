// assets/js/site.js の設定（サイトURL・アセットのバージョン）を、HTML・JS・sitemap.xml・robots.txt に反映する。
//   node scripts/sync-site.mjs          … サイトURLとバージョンを反映
//   node scripts/sync-site.mjs --bump   … バージョンを現在日時に更新してから反映（CSS/JSを変えたら main へ反映する前に実行）
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE_JS = join(ROOT, 'assets/js/site.js');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'tests', 'scripts', '.netlify']);

let siteSrc = readFileSync(SITE_JS, 'utf8');

if (process.argv.includes('--bump')) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const version = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
  siteSrc = siteSrc.replace(/assetVersion: '\d+'/, `assetVersion: '${version}'`);
  writeFileSync(SITE_JS, siteSrc);
}

const url = siteSrc.match(/url: '([^']+)'/)?.[1]?.replace(/\/$/, '');
const version = siteSrc.match(/assetVersion: '(\d+)'/)?.[1];
if (!url || !version) throw new Error('site.js から url / assetVersion を読み取れませんでした');

// 現在 HTML などに書かれている URL は robots.txt の Sitemap 行から取得する
const robots = readFileSync(join(ROOT, 'robots.txt'), 'utf8');
const oldUrl = robots.match(/^Sitemap:\s*(\S+)\/sitemap\.xml/m)?.[1];
if (!oldUrl) throw new Error('robots.txt に Sitemap 行がありません');

const xmlEscape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) yield* walk(full);
    } else {
      yield full;
    }
  }
}

let changed = 0;
for (const file of walk(ROOT)) {
  const ext = extname(file);
  if (!['.html', '.js', '.xml', '.txt'].includes(ext)) continue;
  const src = readFileSync(file, 'utf8');
  let out = src;
  if (ext === '.xml') out = out.split(xmlEscape(oldUrl)).join(xmlEscape(url));
  else if (ext !== '.js') out = out.split(oldUrl).join(url);
  if (ext === '.html' || ext === '.js') {
    // /assets/... や ../calc/... の参照に付いた ?v=数字 を揃える
    out = out.replace(/(\.(?:css|js|svg|webp|png|jpg)\?v=)\d+/g, `$1${version}`);
  }
  if (out !== src) {
    writeFileSync(file, out);
    changed++;
    console.log('updated:', relative(ROOT, file));
  }
}
console.log(`URL: ${url} / version: ${version} / ${changed} files updated`);
