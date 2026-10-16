import test from 'node:test';
import assert from 'node:assert/strict';
import { weekFriday, weeklyBuckets, weeklySummary, spreadRows, crack321, cftcSummary, steoRows } from '../scripts/markets.mjs';
import { normalizeCftc, cftcUrl } from '../scripts/fetch-markets.mjs';

test('日付をその週（土〜金）の金曜日にまとめる', () => {
  assert.equal(weekFriday('2026-10-03'), '2026-10-09'); // 土曜
  assert.equal(weekFriday('2026-10-05'), '2026-10-09'); // 月曜
  assert.equal(weekFriday('2026-10-09'), '2026-10-09'); // 金曜
  assert.equal(weekFriday('2026-10-10'), '2026-10-16'); // 翌週の土曜
});

const daily = (from, values) =>
  values.map((v, i) => {
    const d = new Date(from + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    return { period: d.toISOString().slice(0, 10), value: v };
  });

test('週平均と前週比', () => {
  // 2026-09-28(月)〜10-02(金) と 10-05(月)〜10-09(金)
  const rows = [...daily('2026-09-28', [60, 61, 62, 63, 64]), ...daily('2026-10-05', [70, 70, 70, 70, 75])];
  const b = weeklyBuckets(rows);
  assert.equal(b.get('2026-10-02').avg, 62);
  const s = weeklySummary(rows, '2026-10-09');
  assert.equal(s.value, 71);
  assert.equal(s.prev, 62);
  assert.equal(s.change, 9);
  assert.equal(s.close, 75);
  assert.equal(s.closeDate, '2026-10-09');
  assert.equal(s.days, 5);
  assert.equal(s.high52, 75);
  assert.equal(s.low52, 60);
});

test('WTI−ブレントの価格差と3-2-1クラックスプレッド', () => {
  const wti = [{ period: '2026-10-09', value: 70 }];
  const brent = [{ period: '2026-10-09', value: 74 }];
  assert.deepEqual(spreadRows(wti, brent), [{ period: '2026-10-09', value: -4 }]);
  // ガソリン 2.00ドル/ガロン=84ドル/バレル、軽油 2.50ドル/ガロン=105ドル/バレル
  // (2×84 + 105 − 3×70) ÷ 3 = 21
  const c = crack321(wti, [{ period: '2026-10-09', value: 2 }], [{ period: '2026-10-09', value: 2.5 }]);
  assert.equal(Math.round(c[0].value * 1000) / 1000, 21);
  // どれかが欠けている日は計算しない
  assert.deepEqual(crack321(wti, [], []), []);
});

test('CFTC：マネージドマネーの買い越しと前週比', () => {
  const rows = normalizeCftc([
    { report_date_as_yyyy_mm_dd: '2026-09-29T00:00:00.000', open_interest_all: '1000000', m_money_positions_long_all: '300000', m_money_positions_short_all: '100000' },
    { report_date_as_yyyy_mm_dd: '2026-10-06T00:00:00.000', open_interest_all: '1000000', m_money_positions_long_all: '320000', m_money_positions_short_all: '90000' },
  ]);
  assert.equal(rows[1].period, '2026-10-06');
  const c = cftcSummary(rows, '2026-10-09');
  assert.equal(c.net, 230000);
  assert.equal(c.prevNet, 200000);
  assert.equal(c.change, 30000);
  assert.equal(c.netPctOi, 23);
});

test('CFTCのURL（WTIの市場コードで絞り込む）', () => {
  const u = cftcUrl({ since: '2026-01-01' });
  assert.equal(u.searchParams.get('cftc_contract_market_code'), '067651');
  assert.match(u.searchParams.get('$where'), /2026-01-01/);
});

test('STEO：取得月以降を予測として扱う', () => {
  const rows = steoRows(
    [
      { period: '2026-08', value: 1 },
      { period: '2026-09', value: 2 },
      { period: '2026-10', value: 3 },
    ],
    '2026-10-07T00:00:00Z',
    { fromYear: 2026 },
  );
  assert.deepEqual(rows.map((r) => r.forecast), [false, false, true]);
});
