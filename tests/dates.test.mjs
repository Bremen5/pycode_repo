import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseSchedule, latestExpectedWeekEnding, usFederalHolidays, isUsEasternDst, shiftYears } from '../scripts/lib/dates.mjs';

test('通常の週は水曜10:30（米東部）に発表。夏時間は日本時間 水曜23:30', () => {
  const r = releaseSchedule('2026-10-02');
  assert.equal(r.etDate, '2026-10-07');
  assert.equal(r.etTime, '10:30');
  assert.equal(r.jstDate, '2026-10-07');
  assert.equal(r.jstTime, '23:30');
  assert.equal(r.delayed, false);
});

test('冬時間は日本時間 木曜0:30', () => {
  const r = releaseSchedule('2026-01-09');
  assert.equal(r.jstDate, '2026-01-15');
  assert.equal(r.jstTime, '00:30');
});

test('発表週の月曜が祝日なら木曜11:00に遅れる（2026年コロンブスデー）', () => {
  const r = releaseSchedule('2026-10-09');
  assert.equal(r.delayed, true);
  assert.equal(r.etDate, '2026-10-15');
  assert.equal(r.etTime, '11:00');
  assert.equal(r.jstDate, '2026-10-16');
  assert.equal(r.jstTime, '00:00');
});

test('米国の祝日（振替を含む）', () => {
  const h = usFederalHolidays(2026);
  for (const d of ['2026-01-01', '2026-01-19', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25']) {
    assert.ok(h.has(d), d);
  }
});

test('米東部の夏時間', () => {
  assert.equal(isUsEasternDst('2026-03-07'), false);
  assert.equal(isUsEasternDst('2026-03-08'), true);
  assert.equal(isUsEasternDst('2026-10-31'), true);
  assert.equal(isUsEasternDst('2026-11-01'), false);
});

test('発表済みのはずの最新週：祝日週は木曜まで前の週のまま', () => {
  // 日本時間 木曜8:00（UTC 水曜23:00）の定期実行。祝日週なので 10/9 週はまだ未発表
  assert.equal(latestExpectedWeekEnding(new Date('2026-10-14T23:00:00Z')), '2026-10-02');
  // 日本時間 金曜8:00 の再実行では発表済み
  assert.equal(latestExpectedWeekEnding(new Date('2026-10-15T23:00:00Z')), '2026-10-09');
  // 通常週：日本時間 木曜8:00 には発表済み
  assert.equal(latestExpectedWeekEnding(new Date('2026-10-07T23:00:00Z')), '2026-10-02');
});

test('n年前の同じ日付（2/29は2/28へ）', () => {
  assert.equal(shiftYears('2024-02-29', -1), '2023-02-28');
  assert.equal(shiftYears('2026-10-09', -5), '2021-10-09');
});
