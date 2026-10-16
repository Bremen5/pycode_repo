// 監修者用の学習テキスト（study/*.md）を1つのHTMLにまとめる（非公開・サイトには含めない）
//   npm run study → study-dist/study.html（ブラウザで開く。印刷すればPDFにもできる）
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { ROOT, writeText } from './lib/io.mjs';
import { markdownToHtml, escapeHtml } from './lib/markdown.mjs';

const dir = path.join(ROOT, 'study');
const files = (await readdir(dir)).filter((f) => f.endsWith('.md')).sort((a, b) => (a === 'README.md' ? -1 : b === 'README.md' ? 1 : a.localeCompare(b)));
const chapters = [];
for (const f of files) {
  let md = await readFile(path.join(dir, f), 'utf8');
  // 章どうしのリンク（01-basics.md など）をページ内リンクにする
  md = md.replace(/\]\((\d\d-[a-z-]+)\.md\)/g, '](#$1)');
  const title = (md.match(/^#\s+(.+)$/m) ?? [, f])[1];
  const body = md.replace(/^#\s+.+$/m, '').replace(/^- \[ \] /gm, '- ☐ ');
  chapters.push({ id: f.replace(/\.md$/, ''), title, html: markdownToHtml(body).html });
}
const css = `
:root{color-scheme:light dark;--bg:#fff;--fg:#15181d;--muted:#5b6575;--line:#e1e4ea;--accent:#0b3554;--soft:#f3f5f8;--link:#1a5aa6}
@media (prefers-color-scheme:dark){:root{--bg:#121417;--fg:#edf0f4;--muted:#a3adbb;--line:#2c333d;--accent:#8fc2ff;--soft:#1b2027;--link:#8fc2ff}}
body{margin:0;background:var(--bg);color:var(--fg);font-family:system-ui,-apple-system,"Hiragino Sans","BIZ UDPGothic","Noto Sans JP",Meiryo,sans-serif;line-height:1.9;font-size:16px}
main{max-width:46em;margin:0 auto;padding:24px 16px 80px}
a{color:var(--link)}
h1{font-size:28px;margin:0 0 8px;color:var(--accent)}
h2.chapter{font-size:24px;margin:72px 0 16px;padding-top:16px;border-top:3px solid var(--accent);color:var(--accent);page-break-before:always}
h2{font-size:19px;margin:36px 0 10px;border-left:4px solid var(--accent);padding-left:10px}
h3{font-size:16.5px;margin:24px 0 6px}
table{border-collapse:collapse;width:100%;font-size:14px;margin:0 0 16px}
th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
thead th{background:var(--soft)}
.table-wrap{overflow-x:auto}
blockquote{margin:0 0 16px;padding:10px 16px;background:var(--soft);border-left:4px solid #e0a100;border-radius:4px}
blockquote p{margin:0}
hr{border:0;border-top:1px solid var(--line);margin:28px 0}
.toc{background:var(--soft);padding:12px 20px;border-radius:8px}
.toc ol{margin:6px 0 0}
.meta{color:var(--muted);font-size:14px}
@media print{body{font-size:11pt}a{color:inherit;text-decoration:none}.toc{page-break-after:always}}
`;
const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>監修者のための石油市場テキスト</title><style>${css}</style></head><body><main>
<h1>監修者のための石油市場テキスト</h1>
<p class="meta">非公開の学習用資料（${new Date().toISOString().slice(0, 10)} 生成）。数値は目安のため、記事で使う前に一次情報で確認すること。</p>
<nav class="toc"><strong>目次</strong><ol>${chapters.slice(1).map((c) => `<li><a href="#${c.id}">${escapeHtml(c.title)}</a></li>`).join('')}</ol></nav>
${chapters.map((c, i) => `<section id="${c.id}">${i ? `<h2 class="chapter">${escapeHtml(c.title)}</h2>` : ''}${c.html}</section>`).join('\n')}
</main></body></html>`;
await writeText(path.join(ROOT, 'study-dist', 'study.html'), html);
console.log(`出力: study-dist/study.html（${chapters.length}ファイル、${Math.round(html.length / 1024)}KB）`);
