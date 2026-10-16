// 価格・市場指標の HTML 部品（週ごとのページ、/markets/、/world/ で使う）
import { SITE } from '../../config/site.mjs';
import { PRICE_SERIES, priceByKey, CFTC, EXTERNAL_INDICATORS } from '../../config/markets.mjs';
import { escapeHtml as e } from './markdown.mjs';
import { jaDate } from './dates.mjs';
import { fmtNum, fmtPrice, fmtPriceChange, fmtContracts, priceUnitJa } from './units.mjs';
import { lineChart, barChart } from '../charts.mjs';

export const pricesOn = () => SITE.prices?.enabled !== false;

// 表示する項目（派生指標を含む）
export const DERIVED = {
  spread: { key: 'spread', nameJa: 'WTIとブレントの価格差（WTI−ブレント）', shortJa: 'WTI−ブレント', unit: 'USD/bbl' },
  crack321: { key: 'crack321', nameJa: '3-2-1クラックスプレッド（NY港ガソリン・軽油とWTIから算出）', shortJa: '3-2-1クラック', unit: 'USD/bbl' },
};

const cls = (d) => (d > 0 ? 'up' : d < 0 ? 'down' : 'flat');
const arrow = (d) => (d > 0 ? '▲' : d < 0 ? '▼' : '―');

function deltaSpan(d, unit) {
  if (d == null) return '<span class="flat">—</span>';
  return `<span class="${cls(d)}">${arrow(d)} ${e(fmtPriceChange(d, unit).replace(/^[+−±]/, ''))}</span>`;
}

/** 価格カード（週平均と前週比） */
export function priceCards(m, keys = ['wti', 'brent', 'spread', 'crack321']) {
  if (!m || !pricesOn()) return '';
  const items = keys
    .map((k) => {
      const def = priceByKey[k] ?? DERIVED[k];
      const a = m.prices?.[k] ?? m.derived?.[k];
      if (!def || !a) return '';
      return `<li class="kpi">
<span class="kpi-label">${e(def.shortJa)}<span class="kpi-tag">週平均</span></span>
<span class="kpi-value">${e(fmtPrice(a.value, def.unit, { withUnit: false }))}<span class="kpi-unit">${e(priceUnitJa(def.unit))}</span></span>
<span class="kpi-delta">${deltaSpan(a.change, def.unit)}</span>
<span class="kpi-sub">52週 ${e(fmtPrice(a.low52, def.unit, { withUnit: false }))}〜${e(fmtPrice(a.high52, def.unit, { withUnit: false }))}</span>
</li>`;
    })
    .join('');
  return items ? `<ul class="kpis">${items}</ul>` : '';
}

/** CFTC カード */
export function cftcCard(c) {
  if (!c) return '';
  return `<li class="kpi">
<span class="kpi-label">投機筋の買い越し<span class="kpi-tag">${jaDate(c.period).replace(/^\d+年/, '')}時点</span></span>
<span class="kpi-value">${e(fmtNum(c.net))}<span class="kpi-unit">枚</span></span>
<span class="kpi-delta"><span class="${cls(c.change)}">${arrow(c.change)} ${e(fmtContracts(Math.abs(c.change ?? 0)))}</span></span>
<span class="kpi-sub">建玉に占める割合 ${c.netPctOi ?? '—'}%</span>
</li>`;
}

/** 価格の一覧表（週平均・前週比・前年同週比・52週レンジ） */
export function priceTable(m) {
  if (!m || !pricesOn()) return '';
  const rows = [...PRICE_SERIES, DERIVED.spread, DERIVED.crack321]
    .map((def) => {
      const a = m.prices?.[def.key] ?? m.derived?.[def.key];
      if (!a) return '';
      const label = def.freq === 'weekly' ? `${jaDate(a.closeDate).replace(/^\d+年/, '')}時点` : `週平均（${a.days}日）`;
      return `<tr><th scope="row">${e(def.nameJa)}<span class="sub">${e(label)}</span></th>
<td>${e(fmtPrice(a.value, def.unit))}</td>
<td><span class="${cls(a.change)}">${e(fmtPriceChange(a.change, def.unit))}</span></td>
<td>${e(fmtPriceChange(a.yoyChange, def.unit))}</td>
<td class="range">${e(fmtPrice(a.low52, def.unit, { withUnit: false }))}〜${e(fmtPrice(a.high52, def.unit))}</td></tr>`;
    })
    .join('\n');
  return `<div class="table-wrap"><table class="data">
<thead><tr><th scope="col">指標</th><th scope="col">今週</th><th scope="col">前週比</th><th scope="col">前年同週比</th><th scope="col">52週の範囲（日次）</th></tr></thead>
<tbody>${rows}</tbody></table></div>`;
}

/** CFTC の表 */
export function cftcTable(c) {
  if (!c) return '';
  const row = (name, v, note = '') => `<tr><th scope="row">${e(name)}${note ? `<span class="sub">${e(note)}</span>` : ''}</th><td>${v}</td></tr>`;
  return `<div class="table-wrap"><table class="data compact">
<thead><tr><th scope="col">項目（${jaDate(c.period)}時点）</th><th scope="col">枚数</th></tr></thead>
<tbody>
${row('マネージドマネー：買い', e(fmtContracts(c.long)))}
${row('マネージドマネー：売り', e(fmtContracts(c.short)))}
${row('マネージドマネー：買い越し', `<strong>${e(fmtContracts(c.net))}</strong>`, `前週比 ${fmtContracts(c.change, { sign: true })}`)}
${row('生産者・取引業者などの差し引き', e(fmtContracts(c.producerNet)), '実需の事業者。通常は売り越し（ヘッジ）')}
${row('スワップディーラーの差し引き', e(fmtContracts(c.swapNet)))}
${row('建玉の総数（未決済の契約）', e(fmtContracts(c.oi)))}
</tbody></table></div>
<p class="note table-note">1枚＝1,000バレル。マネージドマネーは、ヘッジファンドなどの資金運用者の区分です。過去52週の買い越しの範囲：${e(fmtContracts(c.low52))}〜${e(fmtContracts(c.high52))}。</p>`;
}

export function wtiBrentChart(long, id, { title = 'WTIとブレント（週平均）' } = {}) {
  if (!pricesOn()) return '';
  return lineChart({
    id,
    title,
    unit: 'ドル/バレル',
    digits: 2,
    series: [
      { name: 'WTI', points: long.wti ?? [] },
      { name: 'ブレント', points: long.brent ?? [] },
    ],
  });
}

export function cftcChart(points, id) {
  return barChart({
    id,
    title: 'マネージドマネーの買い越し（WTI原油先物）',
    unit: '万枚',
    digits: 1,
    points: points.map((p) => ({ period: p.period, value: p.value / 1e4 })),
    caption: '<span><i class="key key-up"></i>買い越し</span><span><i class="key key-down"></i>売り越し</span>',
  });
}

/** 価格・建玉の出典表示 */
export function marketSourceNote() {
  const parts = [];
  if (pricesOn())
    parts.push(
      `価格：<a href="https://www.eia.gov/petroleum/data.php#prices" rel="noopener">EIA（スポット価格・小売価格）</a>。スポット価格の元データは民間の情報会社で、EIAが公表しているものです。取引所の先物清算値ではありません。`,
    );
  parts.push(`建玉：<a href="${CFTC.sourceUrl}" rel="noopener">米商品先物取引委員会（CFTC）Commitments of Traders</a>（毎週金曜に、同じ週の火曜時点の数値を公表）。`);
  return parts.map((p) => `<p>${p}</p>`).join('');
}

/** 自動取得していない主要指標の案内 */
export function externalTable() {
  return `<div class="table-wrap"><table class="data compact ext">
<thead><tr><th scope="col">指標</th><th scope="col">発表元</th><th scope="col">更新</th><th scope="col">ポイント</th></tr></thead>
<tbody>${EXTERNAL_INDICATORS.map(
    (x) => `<tr><th scope="row"><a href="${x.url}" rel="noopener">${e(x.name)}</a></th><td>${e(x.org)}</td><td>${e(x.when)}</td><td>${e(x.note)}</td></tr>`,
  ).join('')}</tbody></table></div>`;
}

