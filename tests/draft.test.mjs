import test from 'node:test';
import assert from 'node:assert/strict';
import { streakPhrase, changePhrase, titleChange, level, amount } from '../scripts/draft.mjs';

const series = (values, kind = 'stock') => ({
  kind,
  change: values.at(-1) - values.at(-2),
  recent: values.map((value, i) => ({ period: `2026-01-${String(i + 1).padStart(2, '0')}`, value })),
});

test('連続した増減を数える', () => {
  assert.equal(streakPhrase(series([10, 9, 8, 7])), '3週連続の減少');
  assert.equal(streakPhrase(series([1, 2, 3])), '2週連続の増加');
  assert.equal(streakPhrase(series([5, 4, 3, 2, 3])), '4週ぶりの増加');
  assert.equal(streakPhrase(series([5, 6, 5])), null);
  assert.equal(streakPhrase(series([90, 91, 92], 'percent')), '2週連続の上昇');
});

test('変化と水準の言い回し', () => {
  const a = { kind: 'stock', change: -3290, value: 416737 };
  assert.equal(changePhrase(a), '329.0万バレル減少');
  assert.equal(titleChange(a), '前週比329.0万バレル減');
  assert.equal(level(a), '4億1,674万バレル');
  assert.equal(amount(a), '329.0万バレル');
  assert.equal(level({ kind: 'flow', value: 13351 }), '日量1,335万バレル');
  assert.equal(changePhrase({ kind: 'percent', change: 0.2 }), '0.2ポイント上昇');
  assert.equal(changePhrase({ kind: 'stock', change: 0 }), '横ばい');
});
