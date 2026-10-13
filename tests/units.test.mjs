import test from 'node:test';
import assert from 'node:assert/strict';
import { barrelsToKl, mbblToKl, fmtOkuMan, fmtValue, fmtValueKl, fmtChange, fmtChangeKl } from '../scripts/lib/units.mjs';
import { seriesByKey } from '../config/series.mjs';

test('1バレルは158.987294928リットル', () => {
  assert.equal(barrelsToKl(1), 0.158987294928);
  assert.ok(Math.abs(barrelsToKl(1_000_000) - 158987.294928) < 1e-6);
});

test('千バレル → キロリットル', () => {
  assert.ok(Math.abs(mbblToKl(1) - 158.987294928) < 1e-9);
  // 原油在庫 4億2,000万バレル ≒ 6,677万kL
  assert.equal(Math.round(mbblToKl(420000) / 1e4), 6677);
});

test('億・万の表記', () => {
  assert.equal(fmtOkuMan(421_300_000), '4億2,130万');
  assert.equal(fmtOkuMan(400_000_000), '4億');
  assert.equal(fmtOkuMan(13_400_000), '1,340万');
  assert.equal(fmtOkuMan(-3_120_000), '-312万');
  assert.equal(fmtOkuMan(3_500), '0.35万');
});

test('系列の値と換算値を表示する', () => {
  assert.equal(fmtValue(421300, seriesByKey.crude), '4億2,130万バレル');
  assert.equal(fmtValueKl(421300, seriesByKey.crude), '約6,698万kL');
  assert.equal(fmtValue(13400, seriesByKey.production), '1,340万バレル/日');
  assert.equal(fmtValueKl(13400, seriesByKey.production), '約213万kL/日');
  assert.equal(fmtValue(90.46, seriesByKey.utilization), '90.5%');
  assert.equal(fmtValueKl(90.46, seriesByKey.utilization), '');
});

test('変化量の表示（符号と単位）', () => {
  assert.equal(fmtChange(-3120, seriesByKey.crude), '−312.0万バレル');
  assert.equal(fmtChange(450, seriesByKey.gasolineDemand), '+45.0万バレル/日');
  assert.equal(fmtChange(0.4, seriesByKey.utilization), '+0.4ポイント');
  assert.equal(fmtChange(0, seriesByKey.crude), '±0.0万バレル');
  assert.equal(fmtChangeKl(-3120, seriesByKey.crude), '−49.6万kL');
});
