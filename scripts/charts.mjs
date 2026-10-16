// ビルド時に SVG グラフを生成する（外部ライブラリなし・JSなしで表示できる）
//
// 色は CSS 変数（src/assets/style.css）で指定し、ライト/ダークを切り替える。
// 各週に <title> を持つ透明な領域を重ね、マウスを乗せると数値が出るようにしている（JS不要）。
import { escapeHtml } from './lib/markdown.mjs';
import { fmtNum } from './lib/units.mjs';

const W = 360;
const H = 230;
const M = { top: 22, right: 8, bottom: 26, left: 40 };

/** 軸の表示単位（グラフ内の数値は見やすい単位に丸める） */
export function axisUnit(kind) {
  if (kind === 'stock') return { label: '百万バレル', scale: (v) => v / 1000, digits: 0, tipDigits: 1 };
  if (kind === 'flow') return { label: '万バレル/日', scale: (v) => v / 10, digits: 0, tipDigits: 1 };
  return { label: '%', scale: (v) => v, digits: 0, tipDigits: 1 };
}

/** きりのよい目盛り */
export function niceTicks(min, max, count = 5) {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { lo, hi, step, ticks };
}

const f1 = (n) => (Math.round(n * 10) / 10).toString();

function monthLabels(periods, x) {
  const out = [];
  let lastMonth = null;
  periods.forEach((p, i) => {
    const m = Number(p.slice(5, 7));
    if (m !== lastMonth) {
      if (lastMonth !== null || Number(p.slice(8, 10)) <= 7) {
        const label = m === 1 || out.length === 0 ? `${p.slice(2, 4)}年${m}月` : `${m}月`;
        out.push({ x: x(i), label, first: out.length === 0 });
      }
      lastMonth = m;
    }
  });
  // 混み合う場合は間引く（2か月おき）。ラベル同士が近すぎるものも省く
  const thinned = out.length > 7 ? out.filter((_, i) => i % 2 === 0) : out;
  const kept = [];
  for (const m of thinned) if (!kept.length || m.x - kept.at(-1).x >= (kept.at(-1).label.length > 3 ? 64 : 36)) kept.push(m);
  return kept;
}

/**
 * 季節比較グラフ：直近52週の値と、過去5年の同じ週の範囲（帯）・平均（破線）
 * @param {{key,nameJa,kind,recent:[{period,value,avg5,min5,max5}]}} a analyze.mjs の系列データ
 */
export function seasonalChart(a, { title } = {}) {
  const pts = a.recent.filter((r) => r.value != null);
  if (pts.length < 2) return '';
  const u = axisUnit(a.kind);
  const vals = pts.flatMap((r) => [r.value, r.min5, r.max5].filter((v) => v != null)).map(u.scale);
  const { lo, hi, ticks } = niceTicks(Math.min(...vals), Math.max(...vals));
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;
  const x = (i) => M.left + (i / (pts.length - 1)) * iw;
  const y = (v) => M.top + ih - ((u.scale(v) - lo) / (hi - lo)) * ih;
  const yt = (t) => M.top + ih - ((t - lo) / (hi - lo)) * ih;

  const banded = pts.map((r, i) => ({ ...r, i })).filter((r) => r.min5 != null && r.max5 != null);
  const band = banded.length
    ? `M${banded.map((r) => `${f1(x(r.i))},${f1(y(r.max5))}`).join('L')}L${banded
        .slice()
        .reverse()
        .map((r) => `${f1(x(r.i))},${f1(y(r.min5))}`)
        .join('L')}Z`
    : '';
  const avg = banded.length ? `M${banded.map((r) => `${f1(x(r.i))},${f1(y(r.avg5))}`).join('L')}` : '';
  const line = `M${pts.map((r, i) => `${f1(x(i))},${f1(y(r.value))}`).join('L')}`;
  const last = pts.at(-1);
  const name = title ?? a.nameJa;
  const step = iw / (pts.length - 1);

  const tip = (r) =>
    `${r.period}週 ${fmtNum(u.scale(r.value), u.tipDigits)}${u.label}` +
    (r.avg5 != null ? `（5年平均 ${fmtNum(u.scale(r.avg5), u.tipDigits)}、範囲 ${fmtNum(u.scale(r.min5), u.tipDigits)}〜${fmtNum(u.scale(r.max5), u.tipDigits)}）` : '');

  return `<figure class="chart">
<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t-${a.key} d-${a.key}" preserveAspectRatio="xMidYMid meet">
<title id="t-${a.key}">${escapeHtml(name)}の推移（直近52週）</title>
<desc id="d-${a.key}">直近52週の${escapeHtml(name)}を実線で、過去5年の同じ週の範囲を帯、平均を破線で示しています。単位は${u.label}。最新値は${last.period}週の${fmtNum(u.scale(last.value), u.tipDigits)}${u.label}。</desc>
${ticks.map((t) => `<line class="grid" x1="${M.left}" x2="${W - M.right}" y1="${f1(yt(t))}" y2="${f1(yt(t))}"/><text class="tick" x="${M.left - 6}" y="${f1(yt(t) + 4)}" text-anchor="end">${fmtNum(t, u.digits)}</text>`).join('\n')}
${monthLabels(pts.map((r) => r.period), x).map((m) => `<text class="tick" x="${f1(m.x)}" y="${H - 8}" text-anchor="${m.first ? 'start' : 'middle'}">${m.label}</text>`).join('\n')}
<text class="tick" x="4" y="13">${u.label}</text>
${band ? `<path class="band" d="${band}"/>` : ''}
${avg ? `<path class="avg" d="${avg}"/>` : ''}
<path class="line" d="${line}"/>
<circle class="dot" cx="${f1(x(pts.length - 1))}" cy="${f1(y(last.value))}" r="4"/>
<g class="hit">${pts.map((r, i) => `<rect x="${f1(x(i) - step / 2)}" y="${M.top}" width="${f1(step)}" height="${ih}"><title>${escapeHtml(tip(r))}</title></rect>`).join('')}</g>
</svg>
<figcaption><span class="key key-line"></span>直近52週 <span class="key key-avg"></span>過去5年平均 <span class="key key-band"></span>過去5年の範囲</figcaption>
</figure>`;
}

/**
 * 週間の変化の棒グラフ（直近 n 週）。増加と減少で色を分け、最新週だけ数値を表示する
 */
export function changeBarChart(a, { weeks = 12, title } = {}) {
  const pts = a.recent.slice(-(weeks + 1));
  const ch = [];
  for (let i = 1; i < pts.length; i++) ch.push({ period: pts[i].period, d: pts[i].value - pts[i - 1].value });
  if (!ch.length) return '';
  const u = a.kind === 'percent' ? { label: 'ポイント', scale: (v) => v } : { label: a.kind === 'flow' ? '万バレル/日' : '万バレル', scale: (v) => v / 10 };
  const vals = ch.map((c) => u.scale(c.d));
  const { lo, hi, ticks } = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals), 4);
  const h = 200;
  const iw = W - M.left - M.right;
  const ih = h - M.top - M.bottom;
  const yt = (t) => M.top + ih - ((t - lo) / (hi - lo)) * ih;
  const slot = iw / ch.length;
  const bw = Math.max(6, slot - 6);
  const name = title ?? a.nameJa;
  const last = ch.at(-1);

  const bars = ch
    .map((c, i) => {
      const v = u.scale(c.d);
      const y0 = yt(0);
      const y1 = yt(v);
      const top = Math.min(y0, y1);
      const bh = Math.max(1, Math.abs(y1 - y0));
      const bx = M.left + i * slot + (slot - bw) / 2;
      const cls = c.d >= 0 ? 'bar-up' : 'bar-down';
      const label = `${c.period}週 ${v >= 0 ? '+' : '−'}${fmtNum(Math.abs(v), 1)}${u.label}`;
      return `<rect class="${cls}" x="${f1(bx)}" y="${f1(top)}" width="${f1(bw)}" height="${f1(bh)}" rx="2"><title>${escapeHtml(label)}</title></rect>`;
    })
    .join('');
  const lv = u.scale(last.d);
  const ly = lv >= 0 ? yt(lv) - 6 : yt(lv) + 14;

  return `<figure class="chart">
<svg viewBox="0 0 ${W} ${h}" role="img" aria-labelledby="tb-${a.key} db-${a.key}" preserveAspectRatio="xMidYMid meet">
<title id="tb-${a.key}">${escapeHtml(name)}の前週比（直近${ch.length}週）</title>
<desc id="db-${a.key}">直近${ch.length}週の${escapeHtml(name)}の前週からの変化。増加は青、減少は赤。最新週は${lv >= 0 ? '+' : '−'}${fmtNum(Math.abs(lv), 1)}${u.label}。</desc>
${ticks.map((t) => `<line class="${t === 0 ? 'zero' : 'grid'}" x1="${M.left}" x2="${W - M.right}" y1="${f1(yt(t))}" y2="${f1(yt(t))}"/><text class="tick" x="${M.left - 6}" y="${f1(yt(t) + 4)}" text-anchor="end">${fmtNum(t, Math.abs(t) < 10 && t % 1 ? 1 : 0)}</text>`).join('\n')}
<text class="tick" x="4" y="13">${u.label}</text>
${bars}
<text class="val" x="${f1(W - M.right)}" y="${f1(ly)}" text-anchor="end">${lv >= 0 ? '+' : '−'}${fmtNum(Math.abs(lv), 1)}</text>
<text class="tick" x="${M.left + (slot - bw) / 2}" y="${h - 8}">${ch[0].period.slice(5).replace('-', '/')}</text>
<text class="tick" x="${W - M.right}" y="${h - 8}" text-anchor="end">${last.period.slice(5).replace('-', '/')}</text>
</svg>
<figcaption><span class="key key-up"></span>増加 <span class="key key-down"></span>減少（単位：${u.label}）</figcaption>
</figure>`;
}

/** 指標カード用の小さな推移グラフ（直近 n 週） */
export function sparkline(a, { weeks = 26 } = {}) {
  const pts = a.recent.slice(-weeks).filter((r) => r.value != null);
  if (pts.length < 2) return '';
  const w = 120;
  const h = 30;
  const vals = pts.map((r) => r.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const x = (i) => 2 + (i / (pts.length - 1)) * (w - 6);
  const y = (v) => (hi === lo ? h / 2 : 3 + (1 - (v - lo) / (hi - lo)) * (h - 6));
  const d = pts.map((r, i) => `${f1(x(i))},${f1(y(r.value))}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="直近${pts.length}週の推移"><polyline class="line" points="${d}" vector-effect="non-scaling-stroke"/></svg>`;
}

/** 横軸のラベル（週次 'YYYY-MM-DD' は月、月次 'YYYY-MM' は年） */
function xLabels(periods, x) {
  if (periods[0]?.length === 7) {
    const out = [];
    periods.forEach((p, i) => {
      if (p.endsWith('-01')) out.push({ x: x(i), label: `${p.slice(0, 4)}年` });
    });
    const kept = [];
    for (const m of out) if (!kept.length || m.x - kept.at(-1).x >= 44) kept.push(m);
    return kept;
  }
  const span = periods.length;
  const out = [];
  let lastMonth = null;
  periods.forEach((p, i) => {
    const m = Number(p.slice(5, 7));
    if (m !== lastMonth) {
      if (lastMonth !== null) out.push({ x: x(i), label: m === 1 ? `${p.slice(2, 4)}年1月` : `${m}月`, m });
      lastMonth = m;
    }
  });
  const step = span > 60 ? 3 : span > 30 ? 2 : 1;
  const filtered = out.filter((o) => (o.m - 1) % step === 0);
  const kept = [];
  for (const m of filtered) if (!kept.length || m.x - kept.at(-1).x >= (Math.max(kept.at(-1).label.length, m.label.length) > 3 ? 62 : 34)) kept.push(m);
  return kept;
}

/**
 * 汎用の折れ線グラフ（1〜3系列）。予測値（forecast: true）は破線で描く
 * spec: { id, title, desc, unit, digits, series: [{ name, points: [{period, value, forecast}] }], zero, keys: 凡例を出すか }
 */
export function lineChart(spec) {
  const { id, title, unit, digits = 1, zero = false } = spec;
  const series = spec.series.filter((s) => s.points?.length >= 2);
  if (!series.length) return '';
  const periods = [...new Set(series.flatMap((s) => s.points.map((p) => p.period)))].sort();
  const idx = new Map(periods.map((p, i) => [p, i]));
  const vals = series.flatMap((s) => s.points.map((p) => p.value)).filter((v) => v != null);
  if (zero) vals.push(0);
  const { lo, hi, ticks } = niceTicks(Math.min(...vals), Math.max(...vals));
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;
  const x = (i) => M.left + (periods.length === 1 ? iw / 2 : (i / (periods.length - 1)) * iw);
  const y = (v) => M.top + ih - ((v - lo) / (hi - lo)) * ih;
  const step = iw / Math.max(1, periods.length - 1);
  const path = (pts) => `M${pts.map((p) => `${f1(x(idx.get(p.period)))},${f1(y(p.value))}`).join('L')}`;
  const lines = series
    .map((s, k) => {
      const hist = s.points.filter((p) => !p.forecast);
      const fc = s.points.filter((p) => p.forecast);
      const fcPath = fc.length ? path([...(hist.length ? [hist.at(-1)] : []), ...fc]) : '';
      return `${hist.length >= 2 ? `<path class="line s${k + 1}" d="${path(hist)}"/>` : ''}${fcPath ? `<path class="line s${k + 1} fc" d="${fcPath}"/>` : ''}`;
    })
    .join('');
  const fcStart = series[0].points.find((p) => p.forecast);
  const shade = fcStart
    ? `<rect class="fc-zone" x="${f1(x(idx.get(fcStart.period)))}" y="${M.top}" width="${f1(W - M.right - x(idx.get(fcStart.period)))}" height="${ih}"/><text class="tick" x="${f1(W - M.right - 2)}" y="${M.top + 12}" text-anchor="end">予測</text>`
    : '';
  const byPeriod = periods.map((p) => series.map((s) => s.points.find((q) => q.period === p)));
  const tips = periods
    .map((p, i) => {
      const parts = byPeriod[i].map((pt, k) => (pt ? `${series[k].name} ${fmtNum(pt.value, digits)}` : null)).filter(Boolean);
      const fc = byPeriod[i].some((pt) => pt?.forecast) ? '（予測）' : '';
      return `<rect x="${f1(x(i) - step / 2)}" y="${M.top}" width="${f1(Math.max(step, 2))}" height="${ih}"><title>${escapeHtml(`${p} ${parts.join('／')}${unit ? ` ${unit}` : ''}${fc}`)}</title></rect>`;
    })
    .join('');
  const legend = series.length > 1 || spec.keys
    ? `<figcaption>${series.map((s, k) => `<span><i class="key key-s${k + 1}"></i>${escapeHtml(s.name)}</span>`).join('')}${fcStart ? '<span><i class="key key-fc"></i>予測（EIA）</span>' : ''}</figcaption>`
    : fcStart ? '<figcaption><span><i class="key key-fc"></i>予測（EIA）</span></figcaption>' : '';
  const last = series.map((s) => s.points.at(-1));
  return `<figure class="chart">
<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t-${id} d-${id}" preserveAspectRatio="xMidYMid meet">
<title id="t-${id}">${escapeHtml(title)}</title>
<desc id="d-${id}">${escapeHtml(spec.desc ?? `${series.map((s, k) => `${s.name}の最新値は${last[k].period}の${fmtNum(last[k].value, digits)}`).join('、')}。単位は${unit}。`)}</desc>
${shade}
${ticks.map((t) => `<line class="${t === 0 && zero ? 'zero' : 'grid'}" x1="${M.left}" x2="${W - M.right}" y1="${f1(y(t))}" y2="${f1(y(t))}"/><text class="tick" x="${M.left - 6}" y="${f1(y(t) + 4)}" text-anchor="end">${fmtNum(t, Math.abs(hi - lo) < 10 ? 1 : 0)}</text>`).join('\n')}
${xLabels(periods, x).map((m) => `<text class="tick" x="${f1(m.x)}" y="${H - 8}" text-anchor="middle">${m.label}</text>`).join('\n')}
<text class="tick" x="4" y="13">${escapeHtml(unit)}</text>
${lines}
<g class="hit">${tips}</g>
</svg>
${legend}
</figure>`;
}

/** 汎用の棒グラフ（プラスとマイナスで色を分ける。予測値は薄く） */
export function barChart(spec) {
  const { id, title, unit, digits = 1, points } = spec;
  if (!points?.length) return '';
  const h = 210;
  const vals = points.map((p) => p.value);
  const { lo, hi, ticks } = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals), 4);
  const iw = W - M.left - M.right;
  const ih = h - M.top - M.bottom;
  const y = (v) => M.top + ih - ((v - lo) / (hi - lo)) * ih;
  const slot = iw / points.length;
  const bw = Math.max(1, slot - (points.length > 60 ? 1 : 3));
  const x = (i) => M.left + i * slot + slot / 2;
  const bars = points
    .map((p, i) => {
      const y0 = y(0);
      const y1 = y(p.value);
      return `<rect class="${p.value >= 0 ? 'bar-up' : 'bar-down'}${p.forecast ? ' fc' : ''}" x="${f1(M.left + i * slot + (slot - bw) / 2)}" y="${f1(Math.min(y0, y1))}" width="${f1(bw)}" height="${f1(Math.max(0.8, Math.abs(y1 - y0)))}"><title>${escapeHtml(`${p.period} ${p.value >= 0 ? '+' : '−'}${fmtNum(Math.abs(p.value), digits)} ${unit}${p.forecast ? '（予測）' : ''}`)}</title></rect>`;
    })
    .join('');
  const periods = points.map((p) => p.period);
  return `<figure class="chart">
<svg viewBox="0 0 ${W} ${h}" role="img" aria-labelledby="t-${id} d-${id}" preserveAspectRatio="xMidYMid meet">
<title id="t-${id}">${escapeHtml(title)}</title>
<desc id="d-${id}">${escapeHtml(spec.desc ?? `${title}。最新は${points.at(-1).period}の${fmtNum(points.at(-1).value, digits)}${unit}。`)}</desc>
${ticks.map((t) => `<line class="${t === 0 ? 'zero' : 'grid'}" x1="${M.left}" x2="${W - M.right}" y1="${f1(y(t))}" y2="${f1(y(t))}"/><text class="tick" x="${M.left - 6}" y="${f1(y(t) + 4)}" text-anchor="end">${fmtNum(t, Math.abs(hi - lo) < 10 ? 1 : 0)}</text>`).join('\n')}
${xLabels(periods, x).map((m) => `<text class="tick" x="${f1(m.x)}" y="${h - 8}" text-anchor="middle">${m.label}</text>`).join('\n')}
<text class="tick" x="4" y="13">${escapeHtml(unit)}</text>
${bars}
</svg>
<figcaption>${spec.caption ?? `<span><i class="key key-up"></i>プラス</span><span><i class="key key-down"></i>マイナス</span>`}</figcaption>
</figure>`;
}
