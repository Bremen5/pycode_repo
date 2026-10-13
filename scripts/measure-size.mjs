// 各ページの初回表示で読み込むファイル（HTML・CSS・JS・画像）の合計サイズを計測する。
//   node scripts/measure-size.mjs
// Netlify は gzip / brotli で圧縮して配信するため、圧縮後のサイズが実際の転送量の目安になる。
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, brotliCompressSync } from 'node:zlib';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PAGES = ['index.html', 'tools/jisshitsu-nenshu/index.html', 'about.html', 'privacy.html', '404.html'];
const LIMIT = 500 * 1024;

const toPath = (ref, fromFile) => {
  const clean = ref.split(/[?#]/)[0];
  if (/^(https?:)?\/\//.test(clean) || clean.startsWith('data:')) return null;
  return clean.startsWith('/') ? join(ROOT, clean) : resolve(dirname(fromFile), clean);
};

function collect(file, seen) {
  if (seen.has(file) || !existsSync(file)) return;
  seen.add(file);
  const src = readFileSync(file, 'utf8');
  const refs = [];
  if (file.endsWith('.html')) {
    for (const m of src.matchAll(/<(?:script|img|link)\b[^>]*?\s(?:src|href)="([^"]+)"/g)) {
      const tag = m[0];
      if (tag.startsWith('<link') && !/rel="(stylesheet|icon|modulepreload)"/.test(tag)) continue;
      refs.push(m[1]);
    }
  } else if (file.endsWith('.js')) {
    for (const m of src.matchAll(/(?:import|from)\s*['"]([^'"]+)['"]/g)) refs.push(m[1]);
  } else if (file.endsWith('.css')) {
    for (const m of src.matchAll(/url\(["']?([^"')]+)["']?\)/g)) refs.push(m[1]);
  }
  for (const r of refs) {
    const p = toPath(r, file);
    if (p) collect(p, seen);
  }
}

const kb = (n) => `${(n / 1024).toFixed(1)}KB`;
let ok = true;
for (const page of PAGES) {
  const seen = new Set();
  collect(join(ROOT, page), seen);
  let raw = 0;
  let gz = 0;
  let br = 0;
  for (const f of seen) {
    const buf = readFileSync(f);
    raw += buf.length;
    const compressible = /\.(html|css|js|svg|xml|txt)$/.test(f);
    gz += compressible ? gzipSync(buf, { level: 9 }).length : buf.length;
    br += compressible ? brotliCompressSync(buf).length : buf.length;
  }
  if (raw > LIMIT) ok = false;
  console.log(`${page.padEnd(36)} files=${seen.size}  raw=${kb(raw).padStart(8)}  gzip=${kb(gz).padStart(7)}  brotli=${kb(br).padStart(7)}`);
}
console.log(ok ? `すべてのページが目標（500KB）以下です（未圧縮でも）` : '目標（500KB）を超えるページがあります');
console.log('※GA4 の計測タグ（googletagmanager.com, 圧縮後 約100KB前後）は ID 設定後のみ読み込まれ、外部配信のため Netlify の転送量には含まれません');
