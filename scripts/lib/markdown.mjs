// 最小限のフロントマター解析と Markdown → HTML 変換（外部ライブラリなし）
//
// 対応する記法: 見出し(##, ###)、段落、箇条書き(-)、番号付きリスト(1.)、
//              表(| a | b |)、引用(>)、太字(**)、リンク([text](url))、水平線(---)

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * フロントマター（--- で囲んだ YAML のごく一部）を解析する。
 * 対応: `key: value`（文字列・true/false・数値）と、`key:` の次行からの `  - 項目` のリスト
 */
export function parseFrontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: text };
  const data = {};
  let listKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && listKey) {
      data[listKey].push(unquote(item[1]));
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    const [, k, v] = kv;
    if (v === '') {
      data[k] = [];
      listKey = k;
    } else {
      data[k] = scalar(v);
      listKey = null;
    }
  }
  return { data, body: text.slice(m[0].length) };
}

function unquote(v) {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}

function scalar(v) {
  const t = v.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return unquote(t);
}

export function stringifyFrontMatter(data) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const item of v) lines.push(`  - ${quoteIfNeeded(item)}`);
    } else {
      lines.push(`${k}: ${typeof v === 'string' ? quoteIfNeeded(v) : v}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n');
}

function quoteIfNeeded(s) {
  return /^[\s"'\-]|:\s|#/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
}

function inline(s) {
  let out = escapeHtml(s);
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, url) => {
    const external = /^https?:\/\//.test(url);
    return `<a href="${url}"${external ? ' rel="noopener"' : ''}>${text}</a>`;
  });
  return out;
}

/** Markdown → HTML。見出しには id を付ける（目次用に headings も返す） */
export function markdownToHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  const headings = [];
  let para = [];
  let list = null; // { tag, items }
  let quote = [];
  let i = 0;

  const flushPara = () => {
    if (para.length) html.push(`<p>${inline(para.join(''))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) html.push(`<${list.tag}>${list.items.map((x) => `<li>${inline(x)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) html.push(`<blockquote><p>${inline(quote.join(''))}</p></blockquote>`);
    quote = [];
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
  };

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    let m;
    if (!t) {
      flushAll();
    } else if ((m = t.match(/^(#{2,4})\s+(.*)$/))) {
      flushAll();
      const level = m[1].length;
      const id = `h-${headings.length + 1}`;
      headings.push({ level, text: m[2], id });
      html.push(`<h${level} id="${id}">${inline(m[2])}</h${level}>`);
    } else if (/^---+$/.test(t)) {
      flushAll();
      html.push('<hr>');
    } else if (t.startsWith('|')) {
      flushAll();
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++].trim());
      i--;
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(/^\|[\s:|-]+\|$/.test(rows[1] ?? '') ? 2 : 1);
      html.push(
        `<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th scope="col">${inline(c)}</th>`).join('')}</tr></thead><tbody>${body
          .map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`,
      );
    } else if ((m = t.match(/^[-*]\s+(.*)$/))) {
      flushPara();
      flushQuote();
      if (list?.tag !== 'ul') flushList();
      list ??= { tag: 'ul', items: [] };
      list.items.push(m[1]);
    } else if ((m = t.match(/^\d+\.\s+(.*)$/))) {
      flushPara();
      flushQuote();
      if (list?.tag !== 'ol') flushList();
      list ??= { tag: 'ol', items: [] };
      list.items.push(m[1]);
    } else if ((m = t.match(/^>\s?(.*)$/))) {
      flushPara();
      flushList();
      quote.push(m[1]);
    } else {
      flushList();
      flushQuote();
      para.push(t);
    }
    i++;
  }
  flushAll();
  return { html: html.join('\n'), headings };
}

/** HTML タグを除いたテキスト（meta description 用） */
export function stripTags(html) {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}
