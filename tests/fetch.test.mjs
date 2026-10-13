import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUrl, normalizeRows, mergeRows, fetchSeries } from '../scripts/fetch.mjs';
import { seriesByKey } from '../config/series.mjs';

test('API v2 の URL を組み立てる', () => {
  const u = buildUrl('WCESTUS1', { apiKey: 'KEY', start: '2016-10-13' });
  assert.equal(u.origin + u.pathname, 'https://api.eia.gov/v2/seriesid/PET.WCESTUS1.W');
  assert.equal(u.searchParams.get('api_key'), 'KEY');
  assert.equal(u.searchParams.get('start'), '2016-10-13');
});

test('レスポンスを数値化して昇順に並べる（欠損は除く）', () => {
  const rows = normalizeRows([
    { period: '2026-10-02', value: '421300' },
    { period: '2026-09-25', value: 420000 },
    { period: '2026-09-18', value: null },
    { period: 'bad', value: 1 },
  ]);
  assert.deepEqual(rows, [
    { period: '2026-09-25', value: 420000 },
    { period: '2026-10-02', value: 421300 },
  ]);
});

test('既存データに追加し、同じ週は新しい値（改定値）で上書きする', () => {
  const merged = mergeRows(
    [{ period: '2026-09-25', value: 1 }, { period: '2026-10-02', value: 2 }],
    [{ period: '2026-10-02', value: 3 }, { period: '2026-10-09', value: 4 }],
  );
  assert.deepEqual(merged.map((r) => r.value), [1, 3, 4]);
});

test('ページ送りで全件を取得し、start より前は捨てる', async () => {
  const all = Array.from({ length: 7 }, (_, i) => ({
    period: `2026-0${Math.floor(i / 4) + 8}-${String(1 + (i % 4) * 7).padStart(2, '0')}`,
    value: String(100 + i),
    'series-description': 'Weekly U.S. Ending Stocks excluding SPR of Crude Oil, Weekly',
    units: 'MBBL',
  }));
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    const off = Number(url.searchParams.get('offset'));
    const page = all.slice(off, off + 4);
    return { ok: true, json: async () => ({ response: { total: all.length, data: page } }) };
  };
  const { meta, rows } = await fetchSeries(seriesByKey.crude, { apiKey: 'K', start: '2026-08-08', fetchImpl });
  assert.equal(calls.length, 2);
  assert.equal(meta.units, 'MBBL');
  assert.ok(rows.every((r) => r.period >= '2026-08-08'));
  assert.equal(rows.length, 6);
});

test('エラーメッセージに APIキーを出さない', async () => {
  const fetchImpl = async () => ({ ok: false, status: 403, text: async () => 'invalid api_key=SECRET123' });
  await assert.rejects(fetchSeries(seriesByKey.crude, { apiKey: 'SECRET123', fetchImpl }), (err) => {
    assert.ok(!err.message.includes('SECRET123'));
    return true;
  });
});
