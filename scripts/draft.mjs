// data/weekly の数値から、ルールベースで日本語の解説の下書きを作る
//
//   content/weekly/YYYY-MM-DD.md が無い週だけ作る（人が仕上げた解説は上書きしない）
//   下書きには draft: true と「【要確認】」を付ける → build.mjs は出力しない
import path from 'node:path';
import { SERIES, seriesByKey } from '../config/series.mjs';
import { paths, readJson, writeText, listWeeks, existsSync, isMain, setActionOutput } from './lib/io.mjs';
import { jaDate, jaWeekday } from './lib/dates.mjs';
import { stringifyFrontMatter } from './lib/markdown.mjs';
import { fmtNum, fmtValue, fmtValueKl, mbblToKl } from './lib/units.mjs';

export const REVIEW_MARK = '【要確認】';

const abs1 = (x) => fmtNum(Math.abs(x), 1);

/** 前週比の言い回し（例: '312万バレル減少' / '0.4ポイント上昇' / '横ばい'） */
export function changePhrase(a) {
  if (a.change == null) return null;
  if (a.change === 0) return '横ばい';
  if (a.kind === 'percent') return `${abs1(a.change)}ポイント${a.change > 0 ? '上昇' : '低下'}`;
  const unit = a.kind === 'flow' ? '万バレル/日' : '万バレル';
  return `${abs1(a.change / 10)}${unit}${a.change > 0 ? '増加' : '減少'}`;
}

/** タイトル用の短い表現（例: '前週比312万バレル減'） */
export function titleChange(a) {
  if (a.change == null) return '';
  if (a.change === 0) return '前週比横ばい';
  return `前週比${abs1(a.change / 10)}万バレル${a.change > 0 ? '増' : '減'}`;
}

function avgPhrase(a) {
  if (a.pctAvg5 == null) return null;
  if (a.kind === 'percent') {
    const d = a.diffAvg5;
    if (Math.abs(d) < 0.05) return '過去5年の同じ週の平均とほぼ同じ水準だった';
    return `過去5年の同じ週の平均を${abs1(d)}ポイント${d > 0 ? '上回った' : '下回った'}`;
  }
  if (Math.abs(a.pctAvg5) < 0.05) return '過去5年の同じ週の平均とほぼ同じ水準だった';
  return `過去5年の同じ週の平均を${abs1(a.pctAvg5)}%${a.pctAvg5 > 0 ? '上回った' : '下回った'}`;
}

function yoyPhrase(a) {
  if (a.yoyChange == null) return null;
  if (a.kind === 'percent') return `前年同週と比べると${abs1(a.yoyChange)}ポイント${a.yoyChange >= 0 ? '高い' : '低い'}`;
  return `前年同週と比べると${abs1(a.yoyPct)}%${a.yoyChange >= 0 ? '多い' : '少ない'}`;
}

function rangePhrase(a) {
  if (a.rangePos === 'above') return '過去5年の同じ週の最大値を上回る水準となった';
  if (a.rangePos === 'below') return '過去5年の同じ週の最小値を下回る水準となった';
  return null;
}

/** 1系列分の文章 */
export function seriesSentence(a) {
  const s = seriesByKey[a.key];
  const kl = fmtValueKl(a.value, s);
  const level = `${fmtValue(a.value, s)}${kl ? `（${kl}）` : ''}`;
  const parts = [];
  const ch = changePhrase(a);
  parts.push(`${s.shortJa}は${level}で、前週比${ch === '横ばい' ? 'で横ばいだった' : `で${ch}した`}。`);
  const y = yoyPhrase(a);
  const av = avgPhrase(a);
  if (y && av) parts.push(`${y}水準で、${av}。`);
  else if (av) parts.push(`${av}。`);
  const r = rangePhrase(a);
  if (r) parts.push(`**${r}。**`);
  if (a.bigMove) parts.push(`**週間の変化幅は過去5年の通常の変動（標準偏差）の約${fmtNum(Math.abs(a.changeZ), 1)}倍と大きかった。**`);
  return parts.join('');
}

export function buildSummary(w) {
  const { crude, gasoline, distillate, utilization } = w.series;
  const lines = [];
  lines.push(`原油在庫（SPR除く）は前週比${changePhrase(crude)}${crude.pctAvg5 != null ? `、${avgPhrase(crude)}` : ''}。`);
  lines.push(`ガソリン在庫は${changePhrase(gasoline)}、留出油在庫は${changePhrase(distillate)}。`);
  const hl = SERIES.filter((s) => w.series[s.key]?.highlight).map((s) => s.shortJa);
  lines.push(
    `製油所の稼働率は${fmtNum(utilization.value, 1)}%（前週比${changePhrase(utilization)}）。` +
      (hl.length ? `過去5年と比べて目立つ動き：${hl.slice(0, 3).join('、')}${hl.length > 3 ? 'など' : ''}。` : ''),
  );
  return lines;
}

export function buildDraft(w) {
  const crude = w.series.crude;
  const title = `EIA原油在庫 ${jaDate(w.weekEnding)}週｜${titleChange(crude)}`;
  const summary = buildSummary(w);
  const highlights = SERIES.filter((s) => w.series[s.key]?.highlight);
  const sentence = (k) => seriesSentence(w.series[k]);
  const r = w.release;
  const nr = w.nextRelease;
  const crudeKl = fmtNum(mbblToKl(Math.abs(crude.change ?? 0)) / 1e4, 1);

  const body = [
    `> ${REVIEW_MARK} この解説は数値から自動生成した下書きです。数値の照合と文章の仕上げが終わるまで公開されません（draft: true）。`,
    '',
    '## 今週のポイント',
    '',
    ...(highlights.length
      ? highlights.map((s) => `- ${REVIEW_MARK} **${s.shortJa}**：${sentence(s.key)}`)
      : ['- 過去5年の同じ週の範囲を外れた項目や、変化が特に大きかった項目はありませんでした。']),
    '',
    '## 原油',
    '',
    `${REVIEW_MARK} EIAが${jaDate(r.etDate)}（米東部時間）に発表した${jaDate(w.weekEnding)}までの週の統計によると、${sentence('crude')}${crude.change ? `前週からの変化量は、キロリットルに換算すると約${crudeKl}万kLにあたる。` : ''}`,
    '',
    `${sentence('cushing')}${sentence('spr')}`,
    '',
    `${sentence('production')}${sentence('imports')}${sentence('exports')}`,
    '',
    '## 石油製品',
    '',
    `${sentence('gasoline')}${sentence('gasolineDemand')}`,
    '',
    sentence('distillate'),
    '',
    '## 製油所',
    '',
    sentence('utilization'),
    '',
    '## 背景（人が追記）',
    '',
    `${REVIEW_MARK} 変化が大きかった項目について、公開情報（EIAの週報本文、ハリケーン・製油所トラブルなどの報道）で確認できる背景があれば、出典を付けて補足する。出典のない推測は書かない。`,
    '',
    '## 来週の発表予定',
    '',
    `次回（${jaDate(nr.weekEnding)}までの週）の発表は、${jaDate(nr.jstDate)}（${jaWeekday(nr.jstDate)}）${nr.jstTime}（日本時間）の予定です${nr.delayed ? '（米国の祝日のため通常より遅れる見込み）' : ''}。祝日などで変更される場合があるため、EIAの公式スケジュールもご確認ください。`,
    '',
  ].join('\n');

  const fm = {
    title,
    weekEnding: w.weekEnding,
    draft: true,
    description: `${jaDate(w.weekEnding)}までの週のEIA週間石油在庫統計を日本語で解説。${summary[0]}`,
    summary,
  };
  return stringifyFrontMatter(fm) + body;
}

/** 下書きの無い週について下書きを作る。作った週の配列を返す */
export async function run({ log = console.log } = {}) {
  const p = paths();
  const weeks = await listWeeks(p.weekly, '.json');
  const created = [];
  for (const w of weeks) {
    const file = path.join(p.weeklyContent, `${w}.md`);
    if (existsSync(file)) continue;
    const data = await readJson(path.join(p.weekly, `${w}.json`));
    await writeText(file, buildDraft(data));
    created.push(w);
    log(`下書きを作成: content/weekly/${w}.md`);
  }
  if (!created.length) log('新しい下書きはありません');
  return created;
}

if (isMain(import.meta.url)) {
  const created = await run();
  await setActionOutput('drafts', created.join(','));
}
