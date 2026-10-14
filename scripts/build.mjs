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
import { seasonalChart, changeBarChart, sparkline } from './charts.mjs';
import { REVIEW_MARK } from './draft.mjs';

export const PAGE_BUDGET = 300 * 1024; // 1ページの合計転送量の上限（自サイト分）

const e = escapeHtml;
const SCHEDULE_URL = 'https://www.eia.gov/petroleum/supply/weekly/schedule.php';
const MAIN_KEYS = ['crude', 'gasoline', 'distillate', 'utilization'];
const GROUPS = [
  { name: '在庫', keys: ['crude', 'cushing', 'spr', 'gasoline', 'distillate'] },
  { name: '製油所', keys: ['utilization'] },
  { name: '原油の需給・ガソリン需要', keys: ['production', 'imports', 'exports', 'gasolineDemand'] },
];

// ---------- 共通部品 ----------

function render(tpl, vars) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
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

function analyticsTag() {
  if (!SITE.ga4Id) return '';
  const id = e(SITE.ga4Id);
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}');</script>`;
}

export function adSlot(name) {
  if (!SITE.ads.enabled) return '';
  return `<aside class="ad-slot" aria-label="広告"><span class="pr">PR</span>${SITE.ads.slots[name] ?? ''}</aside>`;
}

/** 掲載可能か：draft フラグが立っておらず、【要確認】の印も残っていない */
export function isPublishable(fm, body) {
  return (
    fm.draft !== true &&
    !String(body).includes(REVIEW_MARK) &&
    !String(fm.title ?? '').includes(REVIEW_MARK) &&
    !(fm.summary ?? []).some((s) => String(s).includes(REVIEW_MARK))
  );
}

const weekLabel = (w) => `${jaDate(w)}週`;
const UNIT_RE = /(バレル\/日|バレル|%)$/;

/** 値を「数字」と「単位」に分ける（例: '4億2,685万バレル' → ['4億2,685万', 'バレル']） */
function splitUnit(text) {
  const m = text.match(UNIT_RE);
  return m ? [text.slice(0, -m[1].length), m[1]] : [text, ''];
}

/** 前週比（矢印・色・言葉つき。色だけに頼らない） */
function deltaHtml(a, s) {
  if (a.change == null) return '<span class="flat">前週比 —</span>';
  const cls = a.change > 0 ? 'up' : a.change < 0 ? 'down' : 'flat';
  const arrow = a.change > 0 ? '▲' : a.change < 0 ? '▼' : '―';
  return `<span class="${cls}">${arrow} ${e(fmtChange(a.change, s).replace(/^[+−±]/, ''))}</span>`;
}

function vsAvgText(a, s) {
  if (a.avg5 == null) return '';
  return s.kind === 'percent' ? `5年平均比 ${fmtChange(a.diffAvg5, s)}` : `5年平均比 ${fmtPct(a.pctAvg5)}`;
}

function flagBadge(a) {
  if (a.rangePos === 'above') return '<span class="badge">5年最高</span>';
  if (a.rangePos === 'below') return '<span class="badge">5年最低</span>';
  if (a.bigMove) return '<span class="badge">変化大</span>';
  return '';
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

// ---------- 部品 ----------

export function kpiCards(data, keys = MAIN_KEYS) {
  return `<ul class="kpis">${keys
    .map((k) => {
      const a = data.series[k];
      const s = seriesByKey[k];
      const [num, unit] = splitUnit(fmtValue(a.value, s));
      return `<li class="kpi${a.highlight ? ' flag' : ''}">
<span class="kpi-label">${e(s.shortJa)}${flagBadge(a)}</span>
<span class="kpi-value">${e(num)}<span class="kpi-unit">${e(unit)}</span></span>
<span class="kpi-delta">${deltaHtml(a, s)}</span>
<span class="kpi-sub">${e(vsAvgText(a, s))}</span>
${sparkline(a)}
</li>`;
    })
    .join('')}</ul>
<p class="kpi-foot">▲増加・上昇／▼減少・低下（前週比）。小さなグラフは直近26週の推移。</p>`;
}

function rangeCell(a, s) {
  if (a.min5 == null) return '—';
  const badge = a.rangePos === 'above' ? '<span class="badge">5年最大を上回る</span>' : a.rangePos === 'below' ? '<span class="badge">5年最小を下回る</span>' : '';
  return `${e(fmtValue(a.min5, s).replace(UNIT_RE, ''))}〜${e(fmtValue(a.max5, s))}${badge}`;
}

function avgCell(a, s) {
  if (a.avg5 == null) return '—';
  const diff = s.kind === 'percent' ? fmtChange(a.diffAvg5, s) : fmtPct(a.pctAvg5);
  return `${e(diff)}<span class="sub">平均 ${e(fmtValue(a.avg5, s))}</span>`;
}

export function dataTable(data) {
  const row = (s) => {
    const a = data.series[s.key];
    const kl = fmtValueKl(a.value, s);
    const chKl = fmtChangeKl(a.change, s);
    const cls = a.change > 0 ? 'up' : a.change < 0 ? 'down' : '';
    return `<tr${a.highlight ? ' class="flag"' : ''}><th scope="row">${e(s.nameJa)}${a.bigMove ? '<br><span class="badge">変化大</span>' : ''}</th>
<td>${e(fmtValue(a.value, s))}${kl ? `<span class="sub">${e(kl)}</span>` : ''}<span class="sub">${fmtNum(a.value, s.kind === 'percent' ? 1 : 0)} ${unitLabel(s)}</span></td>
<td><span class="${cls}">${e(fmtChange(a.change, s))}</span>${chKl ? `<span class="sub">${e(chKl)}</span>` : ''}</td>
<td>${s.kind === 'percent' ? e(fmtChange(a.yoyChange, s)) : e(fmtPct(a.yoyPct))}</td>
<td>${avgCell(a, s)}</td>
<td class="range">${rangeCell(a, s)}</td></tr>`;
  };
  const body = GROUPS.map(
    (g) => `<tr class="group"><th colspan="6" scope="colgroup">${e(g.name)}</th></tr>\n${g.keys.map((k) => row(seriesByKey[k])).join('\n')}`,
  ).join('\n');
  return `<div class="table-wrap"><table class="data">
<caption class="visually-hidden">${jaDate(data.weekEnding)}までの週の数値一覧</caption>
<thead><tr><th scope="col">項目</th><th scope="col">今週</th><th scope="col">前週比</th><th scope="col">前年同週比</th><th scope="col">過去5年平均との差</th><th scope="col">過去5年の範囲</th></tr></thead>
<tbody>
${body}
</tbody></table></div>
<p class="note table-note">在庫は週末時点の量、生産・輸出入・需要は1週間平均の1日あたりの量です。キロリットル換算は1バレル＝158.987リットルで計算しています。「過去5年」は各年で日付が最も近い週との比較です。黄色の行は、過去5年の同じ週の範囲を外れた項目、または週間の変化が過去5年の通常の変動（標準偏差）の2倍以上だった項目です。</p>`;
}

function releaseText(r) {
  return `${jaDate(r.jstDate)}（${jaWeekday(r.jstDate)}）${r.jstTime}`;
}

function nextReleaseCallout(nr) {
  return `<div class="callout"><span class="icon" aria-hidden="true">次</span><div>
<p class="big">${releaseText(nr)}<small>（日本時間）</small></p>
<p class="note">${jaDate(nr.weekEnding)}までの週のデータの発表予定です（米東部時間 ${jaDate(nr.etDate)} ${nr.etTime}）。${nr.delayed ? '米国の祝日のため、通常より遅れる見込みです。' : ''}日程は変更されることがあるため、<a href="${SCHEDULE_URL}" rel="noopener">EIAの公式スケジュール</a>もご確認ください。</p>
</div></div>`;
}

function chartCard(a, { title, chart, showValue = true } = {}) {
  const s = seriesByKey[a.key];
  return `<div class="chart-card${a.highlight ? ' flag' : ''}">
<div class="chart-head"><h3>${e(title ?? s.nameJa)}</h3>${showValue ? `<span class="val">${e(fmtValue(a.value, s))} ${deltaHtml(a, s)}</span>` : ''}</div>
${chart ?? seasonalChart(a)}
</div>`;
}

function sourceBox(w) {
  return `<div class="source-box"><p><strong>出典</strong>：<a href="${WPSR_URL}" rel="noopener">${e(SITE.source.label)}, Weekly Petroleum Status Report</a>（${jaDate(w.week)}までの週）</p><p>元データ：${SERIES.map(
    (s) => `<a href="${s.sourceUrl}" rel="noopener">${e(s.shortJa)}</a>`,
  ).join('、')}</p><p>${e(SITE.disclaimerShort)}</p></div>`;
}

function weekListHtml(list) {
  return `<ul class="week-list">${list
    .map(
      (w) => `<li><a href="/weekly/${w.week}/"><span class="date">${jaDate(w.week)}までの週</span><span class="ttl">${e(w.fm.title)}</span><span class="ex">${e(w.fm.summary?.[0] ?? '')}</span></a></li>`,
    )
    .join('')}</ul>`;
}

function guideCards(guides, { exclude } = {}) {
  return `<ul class="card-grid">${guides
    .filter((g) => g.slug !== exclude)
    .map(
      (g, i) => `<li><a href="/guide/${g.slug}/"><span class="num-label">GUIDE ${String(g.fm.order ?? i + 1).padStart(2, '0')}</span><strong>${e(g.fm.shortTitle ?? g.fm.title)}</strong><span class="desc">${e(g.fm.description ?? '')}</span></a></li>`,
    )
    .join('')}</ul>`;
}

function sidebar(weeks, guides) {
  const latest = weeks[0];
  return `<aside class="sidebar" aria-label="サイドバー">
${adSlot('sidebar')}
<div class="sidebar-sticky">
${latest ? `<div class="side-box"><h2>次回の発表（日本時間）</h2><p class="big">${releaseText(latest.data.nextRelease)}</p></div>` : ''}
<div class="side-box"><h2>最近の週</h2><ul>${weeks
    .slice(0, 6)
    .map((w) => `<li><a href="/weekly/${w.week}/">${weekLabel(w.week)}</a></li>`)
    .join('')}</ul></div>
<div class="side-box"><h2>はじめての方へ</h2><ul>${guides.map((g) => `<li><a href="/guide/${g.slug}/">${e(g.fm.shortTitle ?? g.fm.title)}</a></li>`).join('')}</ul></div>
</div>
</aside>`;
}

// ---------- ページ生成 ----------

export async function build({ includeDrafts = false, outDir, banner = '', log = console.log } = {}) {
  const p = paths();
  const dist = outDir ? path.resolve(outDir) : p.dist;
  await rm(dist, { recursive: true, force: true });
  await mkdir(path.join(dist, 'assets'), { recursive: true });

  // アセット（CSSは内容のハッシュをファイル名に入れて長期キャッシュできるようにする）
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
  const bannerHtml =
    banner || (includeDrafts ? '<div class="draft-banner">下書きプレビュー（公開用ではありません）</div>' : '');

  async function page(rel, opts) {
    const { title, description, content, ogType = 'website', ld = [], crumbs, withSidebar = false, sitemap = true, lastmod, hero = '', nav = '' } = opts;
    const urlPath = '/' + rel.replace(/index\.html$/, '');
    const bc = crumbs ? breadcrumb(crumbs) : null;
    const current = ' aria-current="page"';
    const html = render(layout, {
      title: e(title),
      ogTitle: e(title),
      description: e(description),
      canonical: e(SITE.url + urlPath),
      robots,
      ogType,
      ogImage: `${SITE.url}/assets/ogp.png`,
      siteName: e(SITE.name),
      tagline: e(SITE.tagline),
      siteDescription: e(SITE.description),
      cssFile,
      analytics: analyticsTag(),
      jsonLd: jsonLdTag([...ld, ...(bc ? [bc.ld] : [])]),
      banner: bannerHtml,
      hero,
      breadcrumb: bc?.html ?? '',
      content,
      sidebar: withSidebar ? sidebar(weeks, guides) : '',
      layoutClass: withSidebar ? ' has-sidebar' : '',
      navHome: nav === 'home' ? current : '',
      navWeekly: nav === 'weekly' ? current : '',
      navGuide: nav === 'guide' ? current : '',
      navGlossary: nav === 'glossary' ? current : '',
      sourceUrl: SITE.source.url,
      sourceLabel: e(SITE.source.label),
      disclaimerShort: e(SITE.disclaimerShort),
      year,
    });
    await writeText(path.join(dist, rel), html);
    if (sitemap) urls.push({ loc: SITE.url + urlPath, lastmod });
  }

  // ----- 週ごとのページ -----
  for (let i = 0; i < weeks.length; i++) {
    const w = weeks[i];
    const newer = weeks[i - 1];
    const older = weeks[i + 1];
    const md = markdownToHtml(w.body);
    const d = w.data;
    const crude = d.series.crude;
    const r = d.release;
    const published = w.fm.date ?? r.jstDate;
    const modified = w.fm.updated ?? published;
    const desc = w.fm.description ?? stripTags(md.html).slice(0, 120);

    const content = `<article>
<header class="page-head">
<span class="eyebrow">EIA週間石油在庫統計｜${jaDate(w.week)}までの週</span>
<h1>${e(w.fm.title)}</h1>
<ul class="meta"><li>発表：<strong>${releaseText(r)}</strong>（日本時間）${r.delayed ? '・祝日のため通常より遅れて発表' : ''}</li><li>掲載：${jaDate(published)}${modified !== published ? `（更新：${jaDate(modified)}）` : ''}</li></ul>
</header>
${w.fm.summary?.length ? `<section class="summary" aria-labelledby="sum-h"><h2 id="sum-h">今週の要点</h2><ol>${w.fm.summary.map((s) => `<li>${e(s)}</li>`).join('')}</ol></section>` : ''}
${kpiCards(d)}
<ul class="page-toc" aria-label="このページの目次">
<li><a href="#charts">主要グラフ</a></li><li><a href="#commentary">解説</a></li><li><a href="#table">数値一覧</a></li><li><a href="#all-charts">各項目の推移</a></li><li><a href="#next">次回の発表</a></li>
</ul>
<section class="section" id="charts" aria-labelledby="charts-h">
<h2 id="charts-h">原油在庫の推移</h2>
<p class="section-sub">青線が直近52週、灰色の帯が過去5年の同じ週の最小〜最大、破線が過去5年の平均です。</p>
<div class="charts two">
${chartCard(crude, { title: '原油在庫（SPR除く）', chart: seasonalChart(crude, { title: '原油在庫（SPR除く）' }) })}
${chartCard(crude, { title: '原油在庫の前週比（直近12週）', chart: changeBarChart(crude, { title: '原油在庫（SPR除く）' }), showValue: false })}
</div>
</section>
<section class="section prose" id="commentary" aria-label="解説">
${md.html}
</section>
${adSlot('afterArticle')}
<section class="section" id="table" aria-labelledby="table-h">
<h2 id="table-h">今週の数値一覧</h2>
${dataTable(d)}
</section>
<section class="section" id="all-charts" aria-labelledby="all-h">
<h2 id="all-h">各項目の推移と過去5年の範囲</h2>
<p class="section-sub">グラフにマウスを重ねる（タップする）と各週の数値が表示されます。</p>
${GROUPS.map((g) => {
  const keys = g.keys.filter((k) => k !== 'crude');
  return keys.length ? `<h3>${e(g.name)}</h3><div class="charts two">${keys.map((k) => chartCard(d.series[k])).join('\n')}</div>` : '';
}).join('\n')}
</section>
<section class="section" id="next" aria-labelledby="next-h">
<h2 id="next-h">次回の発表予定</h2>
${nextReleaseCallout(d.nextRelease)}
</section>
<nav class="pager" aria-label="前後の週">${older ? `<a class="prev" href="/weekly/${older.week}/"><small>← 前の週</small>${weekLabel(older.week)}</a>` : ''}${newer ? `<a class="next" href="/weekly/${newer.week}/"><small>次の週 →</small>${weekLabel(newer.week)}</a>` : ''}</nav>
${sourceBox(w)}
<section class="section" aria-labelledby="g-h"><h2 id="g-h">統計の読み方</h2>${guideCards(guides.slice(0, 3))}</section>
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
        publisher: { '@type': 'Organization', name: SITE.name, url: SITE.url, logo: { '@type': 'ImageObject', url: `${SITE.url}/assets/apple-touch-icon.png` } },
        isBasedOn: WPSR_URL,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'Dataset',
        name: `EIA週間石油在庫統計 ${jaDate(w.week)}までの週`,
        description: `${jaDate(w.week)}までの週の米国の原油・ガソリン・留出油在庫、戦略石油備蓄、クッシング在庫、製油所稼働率、原油の生産・輸出入、ガソリン需要と、前週比・前年同週比・過去5年の同じ週との比較。`,
        url: pageUrl,
        temporalCoverage: `${w.week}`,
        spatialCoverage: { '@type': 'Place', name: 'United States' },
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
      crumbs: [{ name: 'トップ', path: '/' }, { name: 'バックナンバー', path: '/weekly/' }, { name: weekLabel(w.week), path: `/weekly/${w.week}/` }],
      withSidebar: true,
      nav: i === 0 ? 'home' : 'weekly',
      lastmod: modified,
    });
  }

  // ----- バックナンバー -----
  const byYear = new Map();
  for (const w of weeks) {
    const y = w.week.slice(0, 4);
    byYear.set(y, [...(byYear.get(y) ?? []), w]);
  }
  await page('weekly/index.html', {
    title: `バックナンバー（過去の週の一覧）｜${SITE.name}`,
    description: `EIA週間石油在庫統計の日本語解説のバックナンバーです。原油・ガソリン・留出油在庫や製油所稼働率の動きを、週ごとに振り返れます。`,
    content: `<header class="page-head"><span class="eyebrow">BACK NUMBER</span><h1>バックナンバー</h1><p class="lead">これまでに公開した週ごとの解説の一覧です（新しい順）。</p></header>
${weeks.length ? [...byYear].map(([y, list]) => `<h2 class="year-head">${y}年</h2>${weekListHtml(list)}`).join('\n') : '<p class="empty">まだ公開された週はありません。</p>'}`,
    crumbs: [{ name: 'トップ', path: '/' }, { name: 'バックナンバー', path: '/weekly/' }],
    withSidebar: true,
    nav: 'weekly',
  });

  // ----- トップ -----
  const latest = weeks[0];
  const hero = `<section class="hero"><div class="wrap hero-inner">
<div>
<span class="eyebrow">毎週更新・日本語解説</span>
<h1>米国の石油在庫を、<br>毎週わかりやすく。</h1>
<p class="lead">${e(SITE.description)}</p>
</div>
${
  latest
    ? `<div class="hero-latest"><h2>最新週｜${jaDate(latest.week)}までの週</h2>
<a class="ttl" href="/weekly/${latest.week}/">${e(latest.fm.title)}</a>
<ol>${(latest.fm.summary ?? []).map((s) => `<li>${e(s)}</li>`).join('')}</ol>
<div class="hero-actions"><a class="btn" href="/weekly/${latest.week}/">今週の解説を読む →</a><span class="chip">次回発表 ${releaseText(latest.data.nextRelease)}</span></div>
</div>`
    : `<div class="hero-latest"><h2>最新週</h2><p>最初の週の解説を準備中です。</p></div>`
}
</div></section>`;

  const topContent = latest
    ? `<section aria-labelledby="kpi-h"><h2 id="kpi-h" class="visually-hidden">主要指標</h2>${kpiCards(latest.data)}</section>
<section class="section" aria-labelledby="tc-h">
<h2 id="tc-h">在庫の水準を過去5年と比べる</h2>
<p class="section-sub">青線が直近52週、灰色の帯が過去5年の同じ週の範囲、破線が過去5年の平均です。</p>
<div class="charts two">
${chartCard(latest.data.series.crude, { title: '原油在庫（SPR除く）' })}
${chartCard(latest.data.series.gasoline)}
${chartCard(latest.data.series.distillate)}
${chartCard(latest.data.series.utilization)}
</div>
<p style="margin-top:12px"><a href="/weekly/${latest.week}/#all-charts">すべての項目のグラフを見る →</a></p>
</section>
<section class="section" aria-labelledby="recent-h"><h2 id="recent-h">最近の解説</h2>${weekListHtml(weeks.slice(0, 6))}${weeks.length > 6 ? '<p style="margin-top:12px"><a href="/weekly/">バックナンバーをすべて見る →</a></p>' : ''}</section>`
    : `<p class="empty">最初の週の解説を準備中です。公開までしばらくお待ちください。</p>`;

  await page('index.html', {
    title: `${SITE.name}｜${SITE.tagline}`,
    description: SITE.description,
    hero,
    nav: 'home',
    withSidebar: true,
    content: `${topContent}
<section class="section" aria-labelledby="feat-h"><h2 id="feat-h">このサイトでわかること</h2>
<ul class="features">
<li><strong>毎週の在庫の増減</strong><p>原油・ガソリン・留出油の在庫、製油所の稼働率、原油の生産・輸出入など10項目を、毎週日本語でまとめます。</p></li>
<li><strong>過去5年との比較</strong><p>前週比だけでなく、前年同週や過去5年の同じ時期と比べて、今の水準が多いのか少ないのかをグラフで示します。</p></li>
<li><strong>キロリットル換算つき</strong><p>元のバレル表記に加えて、日本で馴染みのあるキロリットル換算を併記します。</p></li>
<li><strong>人が確認して公開</strong><p>数値はEIAから自動で取得し、解説は元データと照合したうえで公開しています。</p></li>
</ul></section>
<section class="section" aria-labelledby="guide-h"><h2 id="guide-h">はじめての方へ</h2>${guideCards(guides)}</section>`,
    ld: [
      { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE.name, url: SITE.url + '/', inLanguage: 'ja', description: SITE.description },
      { '@context': 'https://schema.org', '@type': 'Organization', name: SITE.name, url: SITE.url + '/', logo: `${SITE.url}/assets/apple-touch-icon.png` },
    ],
    lastmod: latest?.fm.updated ?? latest?.fm.date ?? latest?.data.release.jstDate,
  });

  // ----- ガイド -----
  await page('guide/index.html', {
    title: `はじめての方へ｜EIA在庫統計のガイド｜${SITE.name}`,
    description: 'EIA週間石油在庫統計の基礎知識、数字の読み方、発表時刻（日本時間）、用語集、API統計との違いをまとめたガイドです。',
    content: `<header class="page-head"><span class="eyebrow">GUIDE</span><h1>はじめての方へ</h1><p class="lead">EIA週間石油在庫統計を読むための基礎知識をまとめました。上から順に読むと、毎週の解説がより理解しやすくなります。</p></header>${guideCards(guides)}`,
    crumbs: [{ name: 'トップ', path: '/' }, { name: 'はじめての方へ', path: '/guide/' }],
    withSidebar: true,
    nav: 'guide',
  });
  for (const g of guides) {
    const md = markdownToHtml(g.body);
    const toc = md.headings.filter((h) => h.level === 2);
    await page(`guide/${g.slug}/index.html`, {
      title: `${g.fm.title}｜${SITE.name}`,
      description: g.fm.description ?? stripTags(md.html).slice(0, 120),
      ogType: 'article',
      nav: g.slug === 'glossary' ? 'glossary' : 'guide',
      content: `<article>
<header class="page-head"><span class="eyebrow">GUIDE ${String(g.fm.order ?? '').padStart(2, '0')}</span><h1>${e(g.fm.title)}</h1>${g.fm.updated ? `<ul class="meta"><li>更新日：${jaDate(g.fm.updated)}</li></ul>` : ''}</header>
${toc.length > 2 ? `<nav class="toc" aria-label="目次"><strong>目次</strong><ol>${toc.map((h) => `<li><a href="#${h.id}">${e(h.text)}</a></li>`).join('')}</ol></nav>` : ''}
<div class="prose">${md.html}</div>
${latest ? `<div class="cta"><p>最新週の数字で確かめてみましょう<small>${jaDate(latest.week)}までの週の解説</small></p><a class="btn" href="/weekly/${latest.week}/">最新週の解説へ →</a></div>` : ''}
<section class="section" aria-labelledby="rel-h"><h2 id="rel-h">ほかのガイド</h2>${guideCards(guides, { exclude: g.slug })}</section>
</article>`,
      ld: [
        {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: g.fm.title,
          description: g.fm.description ?? '',
          dateModified: g.fm.updated,
          inLanguage: 'ja',
          mainEntityOfPage: `${SITE.url}/guide/${g.slug}/`,
          image: `${SITE.url}/assets/ogp.png`,
          author: { '@type': 'Organization', name: SITE.name, url: SITE.url },
          publisher: { '@type': 'Organization', name: SITE.name, url: SITE.url },
        },
      ],
      crumbs: [{ name: 'トップ', path: '/' }, { name: 'はじめての方へ', path: '/guide/' }, { name: g.fm.shortTitle ?? g.fm.title, path: `/guide/${g.slug}/` }],
      withSidebar: true,
      lastmod: g.fm.updated,
    });
  }

  // ----- 固定ページ（about / privacy / disclaimer） -----
  for (const pg of pages) {
    const body = pg.body
      .replaceAll('{{operatorName}}', SITE.operator.name)
      .replaceAll('{{operatorContact}}', SITE.operator.contact)
      .replaceAll('{{siteName}}', SITE.name)
      .replaceAll('{{ga4Id}}', SITE.ga4Id);
    await page(`${pg.slug}.html`, {
      title: `${pg.fm.title}｜${SITE.name}`,
      description: pg.fm.description ?? '',
      content: `<article><header class="page-head"><h1>${e(pg.fm.title)}</h1>${pg.fm.updated ? `<ul class="meta"><li>最終更新日：${jaDate(pg.fm.updated)}</li></ul>` : ''}</header><div class="prose">${markdownToHtml(body).html}</div></article>`,
      crumbs: [{ name: 'トップ', path: '/' }, { name: pg.fm.title, path: `/${pg.slug}.html` }],
      lastmod: pg.fm.updated,
    });
  }

  // ----- 404 -----
  await page('404.html', {
    title: `ページが見つかりません｜${SITE.name}`,
    description: 'お探しのページは見つかりませんでした。',
    content: `<div class="empty"><p class="eyebrow">404 NOT FOUND</p><h1>ページが見つかりません</h1><p>お探しのページは移動または削除された可能性があります。</p><p><a class="btn" href="/">トップページへ</a></p><p><a href="/weekly/">バックナンバー</a>　｜　<a href="/guide/">はじめての方へ</a></p></div>`,
    sitemap: false,
  });

  // ----- sitemap.xml / robots.txt / feed.xml -----
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
  await writeText(path.join(dist, 'feed.xml'), atomFeed(weeks.slice(0, 20)));

  const sizes = await checkPageWeights(dist, cssFile);
  const max = sizes[0];
  log(`出力: ${path.relative(process.cwd(), dist) || dist}（週 ${weeks.length}件、ガイド ${guides.length}件、計 ${sizes.length}ページ）`);
  if (max) log(`最大のページ: ${max.file} ${(max.total / 1024).toFixed(1)}KB（HTML ${(max.html / 1024).toFixed(1)}KB + CSS・画像）`);
  const over = sizes.filter((s) => s.total > PAGE_BUDGET);
  if (over.length) throw new Error(`300KBを超えるページがあります: ${over.map((s) => s.file).join(', ')}`);
  return { weeks: weeks.map((w) => w.week), pages: sizes.length, sizes, dist };
}

/** 週ごとの解説の更新情報（Atom） */
export function atomFeed(weeks) {
  const updated = weeks[0] ? `${weeks[0].fm.updated ?? weeks[0].fm.date ?? weeks[0].data.release.jstDate}T00:00:00+09:00` : new Date().toISOString();
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="ja">
  <title>${e(SITE.name)}</title>
  <subtitle>${e(SITE.description)}</subtitle>
  <link href="${SITE.url}/" />
  <link rel="self" href="${SITE.url}/feed.xml" />
  <id>${SITE.url}/</id>
  <updated>${updated}</updated>
${weeks
  .map((w) => {
    const d = `${w.fm.date ?? w.data.release.jstDate}T00:00:00+09:00`;
    const u = `${w.fm.updated ?? w.fm.date ?? w.data.release.jstDate}T00:00:00+09:00`;
    return `  <entry>
    <title>${e(w.fm.title)}</title>
    <link href="${SITE.url}/weekly/${w.week}/" />
    <id>${SITE.url}/weekly/${w.week}/</id>
    <published>${d}</published>
    <updated>${u}</updated>
    <author><name>${e(SITE.name)}</name></author>
    <summary>${e((w.fm.summary ?? []).join(' '))}</summary>
  </entry>`;
  })
  .join('\n')}
</feed>
`;
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
