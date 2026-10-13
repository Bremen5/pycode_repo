// dist/ に静的 HTML を出力する
//
//   node scripts/build.mjs                       本番用（下書きの週は出力しない）
//   node scripts/build.mjs --drafts --out DIR    下書き確認用（noindex・「下書き」表示付き）
import path from 'node:path';
import { readFile, rm, mkdir, copyFile, stat, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { SITE } from '../config/site.mjs';
import { SERIES, seriesByKey, WPSR_URL } from '../config/series.mjs';
import { paths, readJson, writeText, listFiles, listWeeks, existsSync, isMain } from './lib/io.mjs';
import { parseFrontMatter, markdownToHtml, escapeHtml, stripTags } from './lib/markdown.mjs';
import { jaDate, jaWeekday } from './lib/dates.mjs';
import { fmtValue, fmtValueKl, fmtChange, fmtChangeKl, fmtPct, fmtNum, unitLabel } from './lib/units.mjs';
import { seasonalChart, changeBarChart } from './charts.mjs';
import { REVIEW_MARK } from './draft.mjs';

export const PAGE_BUDGET = 300 * 1024; // 1ページの合計転送量の上限（自サイト分）

const e = escapeHtml;

// ---------- 共通部品 ----------

function render(tpl, vars) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? ''));
}

function breadcrumb(items) {
  const html = `<nav class="breadcrumb" aria-label="パンくずリスト"><ol>${items
    .map((it, i) => (i < items.length - 1 ? `<li><a href="${it.path}">${e(it.name)}</a></li>` : `<li aria-current="page">${e(it.name)}</li>`))
    .join('')}</ol></nav>`;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: SITE.url + it.path })),
  };
  return { html, ld };
}

const jsonLdTag = (objs) =>
  objs.map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n');

export function adSlot(name) {
  if (!SITE.ads.enabled) return '';
  return `<aside class="ad-slot" aria-label="広告"><span class="pr">PR</span>${SITE.ads.slots[name] ?? ''}</aside>`;
}

/** 掲載可能か：draft フラグが立っておらず、【要確認】の印も残っていない */
export function isPublishable(fm, body) {
  return fm.draft !== true && !String(body).includes(REVIEW_MARK) && !String(fm.title ?? '').includes(REVIEW_MARK) &&
    !(fm.summary ?? []).some((s) => String(s).includes(REVIEW_MARK));
}

// ---------- データの読み込み ----------

export async function loadWeeks({ includeDrafts = false, log = console.log } = {}) {
  const p = paths();
  const weeks = [];
  for (const w of await listWeeks(p.weeklyContent, '.md')) {
    const dataFile = path.join(p.weekly, `${w}.json`);
    if (!existsSync(dataFile)) {
      log(`警告: content/weekly/${w}.md に対応する data/weekly/${w}.json がないため出力しません`);
      continue;
    }
    const { data: fm, body } = parseFrontMatter(await readFile(path.join(p.weeklyContent, `${w}.md`), 'utf8'));
    const publishable = isPublishable(fm, body);
    if (!publishable && !includeDrafts) {
      log(`下書きのため出力しません: ${w}${fm.draft === true ? '（draft: true）' : `（${REVIEW_MARK} が残っています）`}`);
      continue;
    }
    weeks.push({ week: w, fm, body, draft: !publishable, data: await readJson(dataFile) });
  }
  return weeks.sort((a, b) => b.week.localeCompare(a.week)); // 新しい順
}

async function loadMdDir(dir) {
  const out = [];
  for (const f of await listFiles(dir, '.md')) {
    const { data, body } = parseFrontMatter(await readFile(path.join(dir, f), 'utf8'));
    out.push({ slug: f.replace(/\.md$/, ''), fm: data, body });
  }
  return out.sort((a, b) => (a.fm.order ?? 99) - (b.fm.order ?? 99));
}

// ---------- 週ページの部品 ----------

function kpiCards(w, keys = ['crude', 'gasoline', 'distillate', 'utilization']) {
  return `<ul class="kpis">${keys
    .map((k) => {
      const a = w.data.series[k];
      const s = seriesByKey[k];
      return `<li class="kpi${a.highlight ? ' flag' : ''}"><div class="label">${e(s.shortJa)}${a.highlight ? '<span class="badge">注目</span>' : ''}</div><div class="value">${e(fmtValue(a.value, s)).replace(/(バレル\/日|バレル|%)$/, '<small>$1</small>')}</div><div class="delta">前週比 ${e(fmtChange(a.change, s))}</div></li>`;
    })
    .join('')}</ul>`;
}

function rangeCell(a, s) {
  if (a.min5 == null) return '—';
  const badge = a.rangePos === 'above' ? '<span class="badge">5年最大を上回る</span>' : a.rangePos === 'below' ? '<span class="badge">5年最小を下回る</span>' : '';
  const unit = /(バレル\/日|バレル|%)$/;
  return `${e(fmtValue(a.min5, s).replace(unit, ''))}〜${e(fmtValue(a.max5, s))}${badge}`;
}

function avgCell(a, s) {
  if (a.avg5 == null) return '—';
  const diff = s.kind === 'percent' ? fmtChange(a.diffAvg5, s) : fmtPct(a.pctAvg5);
  return `${e(diff)}<span class="sub">平均 ${e(fmtValue(a.avg5, s))}</span>`;
}

export function dataTable(w) {
  const rows = SERIES.map((s) => {
    const a = w.data.series[s.key];
    const kl = fmtValueKl(a.value, s);
    const chKl = fmtChangeKl(a.change, s);
    const flag = a.highlight;
    const big = a.bigMove ? '<span class="badge">変化大</span>' : '';
    return `<tr${flag ? ' class="flag"' : ''}><th scope="row">${e(s.nameJa)}${big}</th>
<td class="num">${e(fmtValue(a.value, s))}${kl ? `<span class="sub">${e(kl)}</span>` : ''}<span class="sub">${fmtNum(a.value, s.kind === 'percent' ? 1 : 0)} ${unitLabel(s)}</span></td>
<td class="num">${e(fmtChange(a.change, s))}${chKl ? `<span class="sub">${e(chKl)}</span>` : ''}</td>
<td class="num">${s.kind === 'percent' ? e(fmtChange(a.yoyChange, s)) : e(fmtPct(a.yoyPct))}</td>
<td class="num">${avgCell(a, s)}</td>
<td class="num range">${rangeCell(a, s)}</td></tr>`;
  }).join('\n');
  return `<div class="table-wrap"><table class="data">
<caption class="note">${jaDate(w.week)}までの週。「5年」は過去5年の同じ週（各年で日付の最も近い週）との比較。</caption>
<thead><tr><th scope="col">項目</th><th scope="col">今週</th><th scope="col">前週比</th><th scope="col">前年同週比</th><th scope="col">過去5年平均との差</th><th scope="col">過去5年の範囲</th></tr></thead>
<tbody>
${rows}
</tbody></table></div>
<p class="note">キロリットル換算は 1バレル＝158.987リットル で計算しています。在庫は週末時点の量、生産・輸出入・需要は週平均の1日あたりの量です。「注目」「変化大」は、過去5年の同じ週の範囲を外れた項目や、週間の変化が過去5年の通常の変動（標準偏差）の2倍以上だった項目です。</p>`;
}

function releaseInfo(r) {
  return `${jaDate(r.jstDate)}（${jaWeekday(r.jstDate)}）${r.jstTime}（日本時間）／米東部時間 ${jaDate(r.etDate)} ${r.etTime}`;
}

function sourceBox(w) {
  return `<div class="source-box"><p>出典：<a href="${WPSR_URL}" rel="noopener">${e(SITE.source.label)}, Weekly Petroleum Status Report</a>（${jaDate(w.week)}までの週）。元データ：${SERIES.map(
    (s) => `<a href="${s.sourceUrl}" rel="noopener">${e(s.shortJa)}（${e(s.id)}）</a>`,
  ).join('、')}</p><p>${e(SITE.disclaimerShort)}</p></div>`;
}

function sidebar(weeks, guides) {
  return `<aside class="sidebar" aria-label="サイドバー">
${adSlot('sidebar')}
<div class="sidebar-box"><h2>最近の週</h2><ul>${weeks
    .slice(0, 6)
    .map((w) => `<li><a href="/weekly/${w.week}/">${jaDate(w.week)}週</a></li>`)
    .join('')}</ul></div>
<div class="sidebar-box"><h2>ガイド</h2><ul>${guides.map((g) => `<li><a href="/guide/${g.slug}/">${e(g.fm.title)}</a></li>`).join('')}</ul></div>
</aside>`;
}

// ---------- ページ生成 ----------

export async function build({ includeDrafts = false, outDir, log = console.log } = {}) {
  const p = paths();
  const dist = outDir ? path.resolve(outDir) : p.dist;
  await rm(dist, { recursive: true, force: true });
  await mkdir(path.join(dist, 'assets'), { recursive: true });

  // アセット（内容のハッシュをファイル名に入れて長期キャッシュできるようにする）
  const css = await readFile(path.join(p.assets, 'style.css'));
  const cssFile = `style.${createHash('sha256').update(css).digest('hex').slice(0, 10)}.css`;
  await writeText(path.join(dist, 'assets', cssFile), css);
  for (const f of await readdir(p.assets)) {
    if (f !== 'style.css') await copyFile(path.join(p.assets, f), path.join(dist, 'assets', f));
  }

  const layout = await readFile(path.join(p.templates, 'layout.html'), 'utf8');
  const weeks = await loadWeeks({ includeDrafts, log });
  const guides = await loadMdDir(p.guideContent);
  const pages = await loadMdDir(p.pagesContent);
  const year = new Date().getUTCFullYear();
  const urls = [];
  const robots = includeDrafts ? '<meta name="robots" content="noindex,nofollow">' : '';

  async function page(rel, { title, description, content, ogType = 'website', ld = [], crumbs, withSidebar = false, extraSource = '', sitemap = true, lastmod }) {
    const urlPath = '/' + rel.replace(/index\.html$/, '');
    const bc = crumbs ? breadcrumb(crumbs) : null;
    const html = render(layout, {
      title: e(title),
      ogTitle: e(title),
      description: e(description),
      canonical: e(SITE.url + urlPath),
      robots,
      ogType,
      ogImage: `${SITE.url}/assets/ogp.png`,
      siteName: e(SITE.name),
      cssFile,
      faviconFile: 'logo.svg',
      ga4Id: e(SITE.ga4Id),
      jsonLd: jsonLdTag([...ld, ...(bc ? [bc.ld] : [])]),
      breadcrumb: bc?.html ?? '',
      content: (includeDrafts ? '<p class="draft-banner">下書きプレビュー（公開用ではありません）</p>' : '') + content,
      sidebar: withSidebar ? sidebar(weeks, guides) : '',
      layoutClass: withSidebar ? ' has-sidebar' : '',
      sourceUrl: SITE.source.url,
      sourceLabel: e(SITE.source.label),
      extraSource,
      disclaimerShort: e(SITE.disclaimerShort),
      year,
    });
    await writeText(path.join(dist, rel), html);
    if (sitemap) urls.push({ loc: SITE.url + urlPath, lastmod });
  }

  // 週ごとのページ
  for (let i = 0; i < weeks.length; i++) {
    const w = weeks[i];
    const newer = weeks[i - 1];
    const older = weeks[i + 1];
    const md = markdownToHtml(w.body);
    const crude = w.data.series.crude;
    const others = SERIES.filter((s) => s.key !== 'crude');
    const r = w.data.release;
    const nr = w.data.nextRelease;
    const published = w.fm.date ?? r.jstDate;
    const modified = w.fm.updated ?? published;
    const desc = w.fm.description ?? stripTags(md.html).slice(0, 120);

    const content = `<article>
<h1>${e(w.fm.title)}</h1>
<p class="meta">集計週：${jaDate(w.week)}まで ／ 発表：${releaseInfo(r)}${r.delayed ? '（祝日のため通常より遅れて発表）' : ''}</p>
${w.fm.summary?.length ? `<section class="summary" aria-labelledby="sum-h"><h2 id="sum-h">今週の要点</h2><ul>${w.fm.summary.map((s) => `<li>${e(s)}</li>`).join('')}</ul></section>` : ''}
${kpiCards(w)}
<div class="charts two">
<div class="chart-card"><h3>原油在庫（SPR除く）と過去5年の範囲</h3>${seasonalChart(crude, { title: '原油在庫（SPR除く）' })}</div>
<div class="chart-card"><h3>原油在庫の前週比</h3>${changeBarChart(crude, { title: '原油在庫（SPR除く）' })}</div>
</div>
<h2>今週の数値一覧</h2>
${dataTable(w)}
<h2>解説</h2>
${md.html}
${adSlot('afterArticle')}
<h2>各項目の推移</h2>
<p class="note">実線が直近52週、帯が過去5年の同じ週の最小〜最大、破線が過去5年の平均です。グラフにマウスを重ねると各週の数値が表示されます（数値は上の表でも確認できます）。</p>
<div class="charts two">
${others.map((s) => `<div class="chart-card"><h3>${e(s.nameJa)}</h3>${seasonalChart(w.data.series[s.key])}</div>`).join('\n')}
</div>
<h2>次回の発表予定</h2>
<p>${jaDate(nr.weekEnding)}までの週のデータは、<strong>${releaseInfo(nr)}</strong>に発表される予定です${nr.delayed ? '（米国の祝日のため通常より遅れる見込み）' : ''}。祝日などで変更されることがあるため、<a href="https://www.eia.gov/petroleum/supply/weekly/schedule.php" rel="noopener">EIAの公式スケジュール</a>もご確認ください。</p>
<nav class="meta" aria-label="前後の週">${older ? `<a href="/weekly/${older.week}/">← ${jaDate(older.week)}週</a>` : ''}${older && newer ? '　｜　' : ''}${newer ? `<a href="/weekly/${newer.week}/">${jaDate(newer.week)}週 →</a>` : ''}</nav>
${sourceBox(w)}
</article>`;

    const pageUrl = `${SITE.url}/weekly/${w.week}/`;
    const ld = [
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: w.fm.title,
        description: desc,
        datePublished: published,
        dateModified: modified,
        inLanguage: 'ja',
        mainEntityOfPage: pageUrl,
        image: `${SITE.url}/assets/ogp.png`,
        author: { '@type': 'Organization', name: SITE.name, url: SITE.url },
        publisher: { '@type': 'Organization', name: SITE.name, url: SITE.url },
        isBasedOn: WPSR_URL,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'Dataset',
        name: `EIA週間石油在庫統計 ${jaDate(w.week)}までの週`,
        description: `${jaDate(w.week)}までの週の米国の原油・ガソリン・留出油在庫、SPR、クッシング在庫、製油所稼働率、原油の生産・輸出入、ガソリン需要と、前週比・前年同週比・過去5年の同じ週との比較。`,
        url: pageUrl,
        temporalCoverage: w.week,
        spatialCoverage: 'United States',
        inLanguage: 'ja',
        isBasedOn: WPSR_URL,
        creator: { '@type': 'Organization', name: 'U.S. Energy Information Administration', url: 'https://www.eia.gov/' },
        variableMeasured: SERIES.map((s) => s.nameJa),
        isAccessibleForFree: true,
      },
    ];
    await page(`weekly/${w.week}/index.html`, {
      title: w.fm.title,
      description: desc,
      content,
      ogType: 'article',
      ld,
      crumbs: [{ name: 'トップ', path: '/' }, { name: '過去の週', path: '/weekly/' }, { name: `${jaDate(w.week)}週`, path: `/weekly/${w.week}/` }],
      withSidebar: true,
      lastmod: modified,
    });
  }

  // 過去の週の一覧
  const weekListHtml = (list) =>
    `<ul class="week-list">${list
      .map((w) => `<li><a href="/weekly/${w.week}/">${e(w.fm.title)}</a><span class="ex">${e(w.fm.summary?.[0] ?? '')}</span></li>`)
      .join('')}</ul>`;
  await page('weekly/index.html', {
    title: `過去の週の一覧｜${SITE.name}`,
    description: `EIA週間石油在庫統計の日本語解説のバックナンバーです。${SITE.description}`,
    content: `<h1>過去の週の一覧</h1>${weeks.length ? weekListHtml(weeks) : '<p>まだ公開された週はありません。</p>'}`,
    crumbs: [{ name: 'トップ', path: '/' }, { name: '過去の週', path: '/weekly/' }],
  });

  // トップ
  const latest = weeks[0];
  const top = latest
    ? `<h1>${e(SITE.name)}</h1>
<p class="meta">${e(SITE.tagline)}</p>
<section class="summary" aria-labelledby="sum-h"><h2 id="sum-h">最新週の要点（${jaDate(latest.week)}までの週）</h2><ul>${(latest.fm.summary ?? []).map((s) => `<li>${e(s)}</li>`).join('')}</ul>
<p style="margin:8px 0 0"><a href="/weekly/${latest.week}/">${e(latest.fm.title)} の解説を読む →</a></p></section>
${kpiCards(latest)}
<div class="charts two">
<div class="chart-card"><h3>原油在庫（SPR除く）と過去5年の範囲</h3>${seasonalChart(latest.data.series.crude, { title: '原油在庫（SPR除く）' })}</div>
<div class="chart-card"><h3>ガソリン在庫と過去5年の範囲</h3>${seasonalChart(latest.data.series.gasoline)}</div>
</div>
<p class="note">次回の発表予定：${releaseInfo(latest.data.nextRelease)}</p>
<h2>過去の週</h2>
${weekListHtml(weeks.slice(0, 12))}
<p><a href="/weekly/">すべての週を見る →</a></p>`
    : `<h1>${e(SITE.name)}</h1><p>${e(SITE.description)}</p><p>最初の週の解説を準備中です。</p>`;
  await page('index.html', {
    title: `${SITE.name}｜${SITE.tagline}`,
    description: SITE.description,
    content: `${top}
<h2>はじめての方へ</h2>
<ul class="card-list">${guides.map((g) => `<li><a href="/guide/${g.slug}/">${e(g.fm.title)}</a><p>${e(g.fm.description ?? '')}</p></li>`).join('')}</ul>`,
    ld: [{ '@context': 'https://schema.org', '@type': 'WebSite', name: SITE.name, url: SITE.url + '/', inLanguage: 'ja' }],
    lastmod: latest?.fm.updated ?? latest?.fm.date ?? latest?.data.release.jstDate,
  });

  // ガイド
  await page('guide/index.html', {
    title: `ガイド｜${SITE.name}`,
    description: 'EIA週間石油在庫統計の基礎知識・読み方・発表時刻・用語集・API統計との違いをまとめたガイドです。',
    content: `<h1>ガイド</h1><ul class="card-list">${guides.map((g) => `<li><a href="/guide/${g.slug}/">${e(g.fm.title)}</a><p>${e(g.fm.description ?? '')}</p></li>`).join('')}</ul>`,
    crumbs: [{ name: 'トップ', path: '/' }, { name: 'ガイド', path: '/guide/' }],
  });
  for (const g of guides) {
    const md = markdownToHtml(g.body);
    const toc = md.headings.filter((h) => h.level === 2);
    await page(`guide/${g.slug}/index.html`, {
      title: `${g.fm.title}｜${SITE.name}`,
      description: g.fm.description ?? stripTags(md.html).slice(0, 120),
      ogType: 'article',
      content: `<article><h1>${e(g.fm.title)}</h1>${g.fm.updated ? `<p class="meta">更新日：${jaDate(g.fm.updated)}</p>` : ''}
${toc.length > 2 ? `<nav class="toc" aria-label="目次"><strong>目次</strong><ol>${toc.map((h) => `<li><a href="#${h.id}">${e(h.text)}</a></li>`).join('')}</ol></nav>` : ''}
${md.html}
<div class="source-box"><p>参考：<a href="${WPSR_URL}" rel="noopener">${e(SITE.source.label)}, Weekly Petroleum Status Report</a></p><p>${e(SITE.disclaimerShort)}</p></div></article>`,
      ld: [
        {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: g.fm.title,
          description: g.fm.description ?? '',
          dateModified: g.fm.updated,
          inLanguage: 'ja',
          mainEntityOfPage: `${SITE.url}/guide/${g.slug}/`,
          author: { '@type': 'Organization', name: SITE.name, url: SITE.url },
          publisher: { '@type': 'Organization', name: SITE.name, url: SITE.url },
        },
      ],
      crumbs: [{ name: 'トップ', path: '/' }, { name: 'ガイド', path: '/guide/' }, { name: g.fm.title, path: `/guide/${g.slug}/` }],
      withSidebar: true,
      lastmod: g.fm.updated,
    });
  }

  // 固定ページ（about / privacy / disclaimer）
  for (const pg of pages) {
    const body = pg.body
      .replaceAll('{{operatorName}}', SITE.operator.name)
      .replaceAll('{{operatorContact}}', SITE.operator.contact)
      .replaceAll('{{siteName}}', SITE.name)
      .replaceAll('{{ga4Id}}', SITE.ga4Id);
    await page(`${pg.slug}.html`, {
      title: `${pg.fm.title}｜${SITE.name}`,
      description: pg.fm.description ?? '',
      content: `<article><h1>${e(pg.fm.title)}</h1>${markdownToHtml(body).html}</article>`,
      crumbs: [{ name: 'トップ', path: '/' }, { name: pg.fm.title, path: `/${pg.slug}.html` }],
      lastmod: pg.fm.updated,
    });
  }

  // 404
  await page('404.html', {
    title: `ページが見つかりません｜${SITE.name}`,
    description: 'お探しのページは見つかりませんでした。',
    content: `<h1>ページが見つかりません</h1><p>お探しのページは移動または削除された可能性があります。</p><ul><li><a href="/">トップページ（最新週）</a></li><li><a href="/weekly/">過去の週の一覧</a></li><li><a href="/guide/">ガイド</a></li></ul>`,
    sitemap: false,
  });

  // sitemap.xml / robots.txt
  if (!includeDrafts) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${e(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
    await writeText(path.join(dist, 'sitemap.xml'), xml);
    await writeText(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE.url}/sitemap.xml\n`);
  } else {
    await writeText(path.join(dist, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  }

  const sizes = await checkPageWeights(dist, cssFile);
  const max = sizes[0];
  log(`出力: ${path.relative(process.cwd(), dist) || dist}（週 ${weeks.length}件、ガイド ${guides.length}件、計 ${sizes.length}ページ）`);
  if (max) log(`最大のページ: ${max.file} ${(max.total / 1024).toFixed(1)}KB（HTML ${(max.html / 1024).toFixed(1)}KB + CSS・画像）`);
  const over = sizes.filter((s) => s.total > PAGE_BUDGET);
  if (over.length) throw new Error(`300KBを超えるページがあります: ${over.map((s) => s.file).join(', ')}`);
  return { weeks: weeks.map((w) => w.week), pages: sizes.length, sizes, dist };
}

/** 各ページの HTML + CSS + ロゴ の合計サイズ（外部の計測タグは除く） */
export async function checkPageWeights(dist, cssFile) {
  const shared = (await stat(path.join(dist, 'assets', cssFile))).size + (await stat(path.join(dist, 'assets', 'logo.svg'))).size;
  const out = [];
  async function walk(dir) {
    for (const ent of await readdir(dir, { withFileTypes: true })) {
      const f = path.join(dir, ent.name);
      if (ent.isDirectory()) await walk(f);
      else if (ent.name.endsWith('.html')) {
        const html = (await stat(f)).size;
        out.push({ file: path.relative(dist, f), html, total: html + shared });
      }
    }
  }
  await walk(dist);
  return out.sort((a, b) => b.total - a.total);
}

if (isMain(import.meta.url)) {
  const includeDrafts = process.argv.includes('--drafts');
  const i = process.argv.indexOf('--out');
  const outDir = i >= 0 ? process.argv[i + 1] : undefined;
  build({ includeDrafts, outDir }).catch((err) => {
    console.error(`ビルドに失敗しました: ${err.message}`);
    process.exit(1);
  });
}
