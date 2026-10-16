// data/weekly の数値から、ルールベースで日本語の解説の下書きを作る
//
//   content/weekly/YYYY-MM-DD.md が無い週だけ作る（人が仕上げた解説は上書きしない）
//   下書きには draft: true と「【要確認】」を付ける → build.mjs は出力しない
import path from 'node:path';
import { SERIES, seriesByKey } from '../config/series.mjs';
import { paths, readJson, writeText, listWeeks, existsSync, isMain, setActionOutput } from './lib/io.mjs';
import { jaDate } from './lib/dates.mjs';
import { stringifyFrontMatter } from './lib/markdown.mjs';
import { fmtNum, fmtOkuMan, mbblToKl, fmtPrice } from './lib/units.mjs';
import { SITE } from '../config/site.mjs';

export const REVIEW_MARK = '【要確認】';

const abs1 = (x) => fmtNum(Math.abs(x), 1);

// ---------- 数値の言い回し ----------

/** 水準（例: '4億2,685万バレル' / '日量1,289万バレル' / '90.1%'） */
export function level(a, v = a.value) {
  if (a.kind === 'percent') return `${fmtNum(v, 1)}%`;
  if (a.kind === 'flow') return `日量${fmtOkuMan(v * 1000)}バレル`;
  return `${fmtOkuMan(v * 1000)}バレル`;
}

/** 変化の量（例: '576.3万バレル' / '1.4ポイント'） */
export function amount(a, d = a.change) {
  if (a.kind === 'percent') return `${abs1(d)}ポイント`;
  return `${abs1(d / 10)}万バレル`;
}

const upWord = (a) => (a.kind === 'percent' ? '上昇' : '増加');
const downWord = (a) => (a.kind === 'percent' ? '低下' : '減少');
const dirWord = (a, d = a.change) => (d > 0 ? upWord(a) : downWord(a));

/** 前週比の言い回し（例: '576.3万バレル減少' / '1.4ポイント上昇' / '横ばい'） */
export function changePhrase(a) {
  if (a.change == null) return null;
  if (a.change === 0) return '横ばい';
  return `${amount(a)}${dirWord(a)}`;
}

/** タイトル用の短い表現（例: '前週比576.3万バレル減'） */
export function titleChange(a) {
  if (a.change == null) return '';
  if (a.change === 0) return '前週比横ばい';
  return `前週比${abs1(a.change / 10)}万バレル${a.change > 0 ? '増' : '減'}`;
}

/** 直近の週ごとの変化（古い順） */
function weeklyChanges(a) {
  const out = [];
  for (let i = 1; i < (a.recent ?? []).length; i++) out.push(a.recent[i].value - a.recent[i - 1].value);
  return out;
}

/**
 * 連続性の表現（例: '3週連続の減少' / '4週ぶりの増加'）。該当しなければ null
 */
export function streakPhrase(a) {
  const ch = weeklyChanges(a);
  const last = ch.at(-1);
  if (!last) return null;
  const sign = Math.sign(last);
  let run = 0;
  for (let i = ch.length - 1; i >= 0 && Math.sign(ch[i]) === sign; i--) run++;
  if (run >= 2) return `${run}週連続の${dirWord(a, last)}`;
  let opposite = 0;
  for (let i = ch.length - 2; i >= 0 && Math.sign(ch[i]) === -sign; i--) opposite++;
  if (opposite >= 2) return `${opposite + 1}週ぶりの${dirWord(a, last)}`;
  return null;
}

/** 過去5年平均との比較（例: '過去5年の同じ週の平均を0.5%下回る水準' ） */
function vsAvg(a) {
  if (a.avg5 == null) return null;
  if (a.kind === 'percent') {
    if (Math.abs(a.diffAvg5) < 0.05) return '過去5年の同じ週の平均とほぼ同じ水準';
    return `過去5年の同じ週の平均（${fmtNum(a.avg5, 1)}%）を${abs1(a.diffAvg5)}ポイント${a.diffAvg5 > 0 ? '上回る' : '下回る'}水準`;
  }
  if (Math.abs(a.pctAvg5) < 0.05) return '過去5年の同じ週の平均とほぼ同じ水準';
  return `過去5年の同じ週の平均を${abs1(a.pctAvg5)}%${a.pctAvg5 > 0 ? '上回る' : '下回る'}水準`;
}

/** 過去5年の範囲を外れたときの一文 */
function rangeNote(a) {
  const many = a.kind === 'percent' ? '高い' : '多い';
  const few = a.kind === 'percent' ? '低い' : '少ない';
  if (a.rangePos === 'above') return `**この時期としては過去5年で最も${many}水準です（過去5年の同じ週の最大値${level(a, a.max5)}を上回りました）。**`;
  if (a.rangePos === 'below') return `**この時期としては過去5年で最も${few}水準です（過去5年の同じ週の最小値${level(a, a.min5)}を下回りました）。**`;
  return '';
}

function bigMoveNote(a) {
  if (!a.bigMove) return '';
  return `**週間の変化幅は、過去5年の通常の変動（標準偏差）の約${fmtNum(Math.abs(a.changeZ), 1)}倍と大きくなりました。**`;
}

/** 在庫の一文（例: '…は前週から576.3万バレル減り、4億2,685万バレルとなりました。3週連続の減少です。'） */
function stockSentence(a, name, { kl = false } = {}) {
  const s = [];
  const klText = kl ? `（約${fmtOkuMan(mbblToKl(a.value))}kL）` : '';
  if (a.change === 0) s.push(`${name}は前週から横ばいの${level(a)}${klText}でした。`);
  else {
    const chKl = kl ? `（約${abs1(mbblToKl(a.change) / 1e4)}万kL）` : '';
    s.push(`${name}は前週から${amount(a)}${chKl}${a.change > 0 ? '増え' : '減り'}、${level(a)}${klText}となりました。`);
  }
  const st = streakPhrase(a);
  const av = vsAvg(a);
  if (st && av) s.push(`${st}で、${av}です。`);
  else if (st || av) s.push(`${st ?? av}です。`);
  return s.join('') + rangeNote(a) + bigMoveNote(a);
}

/** 流量・比率の一文 */
function flowSentence(a, name) {
  const s = [`${name}は${level(a)}で、`];
  s.push(a.change === 0 ? '前週から横ばいでした。' : `前週から${amount(a)}${dirWord(a)}しました。`);
  const av = vsAvg(a);
  if (av) s.push(`${av}です。`);
  return s.join('') + rangeNote(a) + bigMoveNote(a);
}

/** 「今週のポイント」の1項目 */
function pointLine(a) {
  const s = seriesByKey[a.key];
  const parts = [];
  if (a.rangePos === 'above') parts.push(`過去5年の同じ週の最大値を上回る水準（${level(a)}）`);
  if (a.rangePos === 'below') parts.push(`過去5年の同じ週の最小値を下回る水準（${level(a)}）`);
  if (a.bigMove) parts.push(`前週比${changePhrase(a)}と、変化幅が通常の約${fmtNum(Math.abs(a.changeZ), 1)}倍`);
  return `- **${s.shortJa}**：${parts.join('。')}`;
}

// ---------- 価格と市場 ----------

const usd = (v) => `${fmtNum(Math.abs(v), 2)}ドル`;
const moveWord = (d) => (d > 0 ? '上昇' : d < 0 ? '下落' : '横ばい');

/** 価格と建玉の段落（事実の記述のみ。因果や見通しは書かない） */
export function marketsParagraphs(m) {
  if (!m) return [];
  const out = [];
  const P = m.prices ?? {};
  if (SITE.prices?.enabled !== false && P.wti) {
    const s = [];
    s.push(`WTI原油のスポット価格（クッシング）は週平均で1バレル${fmtPrice(P.wti.value, 'USD/bbl', { withUnit: false })}ドルと、前週から${P.wti.change === 0 ? '横ばいでした' : `${usd(P.wti.change)}${moveWord(P.wti.change)}しました`}。`);
    if (P.brent) s.push(`ブレント原油は${fmtPrice(P.brent.value, 'USD/bbl', { withUnit: false })}ドル（前週比${P.brent.change >= 0 ? '+' : '−'}${usd(P.brent.change)}）でした。`);
    if (m.derived?.spread) s.push(`WTIとブレントの価格差は${m.derived.spread.value < 0 ? `WTIが${usd(m.derived.spread.value)}安い` : `WTIが${usd(m.derived.spread.value)}高い`}水準です。`);
    out.push(s.join(''));
    const t = [];
    if (m.derived?.crack321) t.push(`NY港のガソリン・軽油価格とWTIから計算した3-2-1クラックスプレッド（精製マージンの目安）は1バレル${fmtNum(m.derived.crack321.value, 2)}ドルで、前週から${usd(m.derived.crack321.change)}${moveWord(m.derived.crack321.change)}しました。`);
    if (P.retailGasoline) t.push(`米国のガソリン小売価格（全米平均）は1ガロン${fmtNum(P.retailGasoline.value, 3)}ドルでした。`);
    if (t.length) out.push(t.join(''));
  }
  const c = m.cftc;
  if (c) {
    out.push(
      `米商品先物取引委員会（CFTC）の建玉明細（${jaDate(c.period)}時点）によると、WTI原油先物のマネージドマネー（ヘッジファンドなど）の買い越しは${fmtNum(c.net)}枚で、前週から${fmtNum(Math.abs(c.change ?? 0))}枚${(c.change ?? 0) >= 0 ? '増えました' : '減りました'}。`,
    );
  }
  return out;
}

// ---------- 下書き全体 ----------

export function buildSummary(w) {
  const { crude, gasoline, distillate, utilization } = w.series;
  const st = streakPhrase(crude);
  const av = vsAvg(crude);
  const l1 = `原油在庫は${changePhrase(crude) === '横ばい' ? '横ばい' : `${amount(crude)}${crude.change > 0 ? '増' : '減'}`}の${level(crude)}。${[st, av].filter(Boolean).join('で、')}${st || av ? '。' : ''}`;
  const l2 = `ガソリン在庫は${changePhrase(gasoline)}、留出油在庫は${changePhrase(distillate)}。`;
  const hl = SERIES.filter((s) => s.key !== 'crude' && ['above', 'below'].includes(w.series[s.key]?.rangePos));
  const extra = hl.length
    ? `${hl[0].shortJa}は過去5年の同じ週で最も${w.series[hl[0].key].rangePos === 'above' ? (hl[0].kind === 'percent' ? '高い' : '多い') : hl[0].kind === 'percent' ? '低い' : '少ない'}水準。`
    : '';
  const l3 = `製油所の稼働率は${fmtNum(utilization.value, 1)}%（前週比${changePhrase(utilization)}）。${extra}`;
  return [l1, l2, l3];
}

export function buildDraft(w) {
  const S = w.series;
  const title = `EIA原油在庫 ${jaDate(w.weekEnding)}週｜${titleChange(S.crude)}`;
  const summary = buildSummary(w);
  const highlights = SERIES.filter((s) => S[s.key]?.highlight);
  const r = w.release;
  const net = S.imports.value - S.exports.value;
  const netPrev = S.imports.prev != null && S.exports.prev != null ? S.imports.prev - S.exports.prev : null;

  const body = [
    `> ${REVIEW_MARK} この解説は数値から自動生成した下書きです。数値の照合と文章の仕上げが終わるまで公開されません（draft: true）。`,
    '',
    '## 今週のポイント',
    '',
    ...(highlights.length
      ? highlights.map((s) => pointLine(S[s.key]))
      : ['- 過去5年の同じ週の範囲を外れた項目や、変化が特に大きかった項目はありませんでした。']),
    '',
    '## 原油：在庫と需給',
    '',
    `${REVIEW_MARK} EIAが${jaDate(r.jstDate)}（日本時間）に発表した${jaDate(w.weekEnding)}までの週の統計によると、${stockSentence(S.crude, '原油在庫（戦略石油備蓄を除く）', { kl: true })}`,
    '',
    `${stockSentence(S.cushing, 'WTI原油先物の受け渡し地点であるクッシングの在庫')}${stockSentence(S.spr, '戦略石油備蓄（SPR）')}`,
    '',
    `${flowSentence(S.production, '原油の生産量')}輸入量は${level(S.imports)}、輸出量は${level(S.exports)}で、輸入から輸出を差し引いた純輸入量は${net >= 0 ? level(S.imports, net) : `日量${fmtOkuMan(-net * 1000)}バレルの輸出超過`}でした${netPrev != null ? `（前週は${level(S.imports, netPrev)}）` : ''}。`,
    '',
    '## 石油製品：ガソリンと留出油',
    '',
    `${stockSentence(S.gasoline, 'ガソリン在庫')}${flowSentence(S.gasolineDemand, '需要の目安となるガソリンの製品供給量')}`,
    '',
    stockSentence(S.distillate, '軽油や暖房油を含む留出油の在庫'),
    '',
    '## 製油所',
    '',
    flowSentence(S.utilization, '製油所の稼働率'),
    '',
    ...(marketsParagraphs(w.markets).length ? ['## 価格と市場', '', ...marketsParagraphs(w.markets).flatMap((p) => [p, '']), ] : []),
    '## 背景',
    '',
    `${REVIEW_MARK} 変化が大きかった項目について、公開情報（EIAの週報本文、製油所の稼働やハリケーンなどに関する報道）で確認できる背景があれば、出典リンクを付けて補足する。確認できなければこの節を削除する。出典のない推測は書かない。`,
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
