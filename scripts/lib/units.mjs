// 単位換算と日本語の数値表記
import { LITERS_PER_BARREL } from '../../config/site.mjs';

/** バレル → キロリットル */
export function barrelsToKl(barrels) {
  return (barrels * LITERS_PER_BARREL) / 1000;
}

/** 千バレル（MBBL, MBBL/D）→ キロリットル（kL, kL/日） */
export function mbblToKl(mbbl) {
  return barrelsToKl(mbbl * 1000);
}

const nf = (digits) =>
  new Intl.NumberFormat('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function fmtNum(n, digits = 0) {
  return nf(digits).format(n);
}

/**
 * 数値を「億・万」で表す（例: 421,300,000 → '4億2,130万'）。
 * 1万未満は「万」の小数で表す（例: 3,500 → '0.35万'）。
 */
export function fmtOkuMan(n, manDigits = 0) {
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  const man = a / 1e4;
  if (a >= 1e8) {
    const oku = Math.floor(man / 1e4);
    const restMan = Math.round(man - oku * 1e4);
    if (restMan === 1e4) return `${sign}${fmtNum(oku + 1)}億`;
    return restMan === 0 ? `${sign}${fmtNum(oku)}億` : `${sign}${fmtNum(oku)}億${fmtNum(restMan)}万`;
  }
  if (a >= 1e4) return `${sign}${fmtNum(man, manDigits)}万`;
  return `${sign}${fmtNum(man, 2)}万`;
}

/** 変化量用：千バレル → 「〇〇万バレル」の数値部分（小数1桁、符号なし） */
export function mbblToManBarrels(mbbl) {
  return mbbl / 10;
}

/** 系列の値の表示（元の単位） */
export function fmtValue(value, series) {
  if (value == null || Number.isNaN(value)) return '—';
  if (series.kind === 'percent') return `${fmtNum(value, 1)}%`;
  if (series.kind === 'flow') return `${fmtOkuMan(value * 1000)}バレル/日`;
  return `${fmtOkuMan(value * 1000)}バレル`;
}

/** 系列の値の表示（キロリットル換算）。percent は換算なし */
export function fmtValueKl(value, series) {
  if (value == null || Number.isNaN(value) || series.kind === 'percent') return '';
  const kl = mbblToKl(value);
  return series.kind === 'flow' ? `約${fmtOkuMan(kl)}kL/日` : `約${fmtOkuMan(kl)}kL`;
}

/** 変化量の表示（符号付き） */
export function fmtChange(change, series) {
  if (change == null || Number.isNaN(change)) return '—';
  const sign = change > 0 ? '+' : change < 0 ? '−' : '±';
  const a = Math.abs(change);
  if (series.kind === 'percent') return `${sign}${fmtNum(a, 1)}ポイント`;
  const unit = series.kind === 'flow' ? 'バレル/日' : 'バレル';
  return `${sign}${fmtNum(a / 10, 1)}万${unit}`;
}

export function fmtChangeKl(change, series) {
  if (change == null || Number.isNaN(change) || series.kind === 'percent') return '';
  const sign = change > 0 ? '+' : change < 0 ? '−' : '±';
  const kl = mbblToKl(Math.abs(change));
  return `${sign}${fmtNum(kl / 1e4, 1)}万kL${series.kind === 'flow' ? '/日' : ''}`;
}

export function fmtPct(p, digits = 1) {
  if (p == null || Number.isNaN(p)) return '—';
  const sign = p > 0 ? '+' : p < 0 ? '−' : '±';
  return `${sign}${fmtNum(Math.abs(p), digits)}%`;
}

/** 元の単位の表記（表の見出し用） */
export function unitLabel(series) {
  return { stock: '千バレル', flow: '千バレル/日', percent: '%' }[series.kind];
}
