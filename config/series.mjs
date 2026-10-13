// 取得するEIA系列の定義（ここで一元管理する）
//
// 系列IDは EIA の Weekly Petroleum Status Report（WPSR）の週次系列ID。
// API v2 では後方互換ルート `/v2/seriesid/PET.{id}.W` で取得する。
//   API v2 ドキュメント: https://www.eia.gov/opendata/documentation.php
//   APIブラウザ:         https://www.eia.gov/opendata/browser/petroleum
//
// 【注意】構築環境からは EIA（www.eia.gov / api.eia.gov）へ接続できなかったため、
// 系列IDは実データで未検証。APIキー設定後に `npm run verify-series` を実行し、
// EIAが返す系列名（series-description）と単位が下記 expect と一致することを必ず確認すること。
//
// kind:
//   stock   … 在庫（期末値）。単位 MBBL（千バレル）
//   flow    … 流量（週平均の日量）。単位 MBBL/D（千バレル/日）
//   percent … 比率（%）
// group: ページ上の並び・見出し
// higherIs: 下書きの言い回し用（増加/減少 など）

export const SERIES = [
  {
    key: 'crude',
    id: 'WCESTUS1',
    nameJa: '原油在庫（戦略石油備蓄を除く）',
    shortJa: '原油在庫',
    kind: 'stock',
    unit: 'MBBL',
    group: '在庫',
    main: true,
    expect: { description: /Ending Stocks excluding SPR of Crude Oil/i, units: /MBBL/i },
    // 出典: https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=WCESTUS1&f=W
    sourceUrl: 'https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=WCESTUS1&f=W',
  },
  {
    key: 'spr',
    id: 'WCSSTUS1',
    nameJa: '戦略石油備蓄（SPR）',
    shortJa: 'SPR',
    kind: 'stock',
    unit: 'MBBL',
    group: '在庫',
    expect: { description: /Stocks of Crude Oil in SPR/i, units: /MBBL/i },
    // 出典: https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=WCSSTUS1&f=W
    sourceUrl: 'https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=WCSSTUS1&f=W',
  },
  {
    key: 'gasoline',
    id: 'WGTSTUS1',
    nameJa: 'ガソリン在庫',
    shortJa: 'ガソリン在庫',
    kind: 'stock',
    unit: 'MBBL',
    group: '在庫',
    main: true,
    expect: { description: /Ending Stocks of Total Gasoline/i, units: /MBBL/i },
    // 出典: https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=WGTSTUS1&f=W
    sourceUrl: 'https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=WGTSTUS1&f=W',
  },
  {
    key: 'distillate',
    id: 'WDISTUS1',
    nameJa: '留出油在庫（軽油・灯油など）',
    shortJa: '留出油在庫',
    kind: 'stock',
    unit: 'MBBL',
    group: '在庫',
    main: true,
    expect: { description: /Ending Stocks of Distillate Fuel Oil/i, units: /MBBL/i },
    // 出典: https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=WDISTUS1&f=W
    sourceUrl: 'https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=WDISTUS1&f=W',
  },
  {
    key: 'cushing',
    id: 'W_EPC0_SAX_YCUOK_MBBL',
    nameJa: 'クッシング（オクラホマ州）の原油在庫',
    shortJa: 'クッシング在庫',
    kind: 'stock',
    unit: 'MBBL',
    group: '在庫',
    expect: { description: /Cushing.*Crude Oil/i, units: /MBBL/i },
    // 出典: https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=W_EPC0_SAX_YCUOK_MBBL&f=W
    sourceUrl: 'https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=W_EPC0_SAX_YCUOK_MBBL&f=W',
  },
  {
    key: 'utilization',
    id: 'WPULEUS3',
    nameJa: '製油所の稼働率',
    shortJa: '製油所稼働率',
    kind: 'percent',
    unit: 'PCT',
    group: '製油所',
    expect: { description: /Percent Utilization of Refinery Operable Capacity/i, units: /%|PERCENT/i },
    // 出典: https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=WPULEUS3&f=W
    sourceUrl: 'https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=WPULEUS3&f=W',
  },
  {
    key: 'production',
    id: 'WCRFPUS2',
    nameJa: '原油の生産量',
    shortJa: '原油生産量',
    kind: 'flow',
    unit: 'MBBL/D',
    group: '需給',
    expect: { description: /Field Production of Crude Oil/i, units: /MBBL\/D/i },
    // 出典: https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=WCRFPUS2&f=W
    sourceUrl: 'https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=WCRFPUS2&f=W',
  },
  {
    key: 'imports',
    id: 'WCRIMUS2',
    nameJa: '原油の輸入量',
    shortJa: '原油輸入量',
    kind: 'flow',
    unit: 'MBBL/D',
    group: '需給',
    expect: { description: /Imports of Crude Oil/i, units: /MBBL\/D/i },
    // 出典: https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=WCRIMUS2&f=W
    sourceUrl: 'https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=WCRIMUS2&f=W',
  },
  {
    key: 'exports',
    id: 'WCREXUS2',
    nameJa: '原油の輸出量',
    shortJa: '原油輸出量',
    kind: 'flow',
    unit: 'MBBL/D',
    group: '需給',
    expect: { description: /Exports of Crude Oil/i, units: /MBBL\/D/i },
    // 出典: https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=WCREXUS2&f=W
    sourceUrl: 'https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=WCREXUS2&f=W',
  },
  {
    key: 'gasolineDemand',
    id: 'WGFUPUS2',
    nameJa: 'ガソリンの需要（製品供給量）',
    shortJa: 'ガソリン需要',
    kind: 'flow',
    unit: 'MBBL/D',
    group: '需給',
    expect: { description: /Product Supplied of Finished Motor Gasoline/i, units: /MBBL\/D/i },
    // 出典: https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=WGFUPUS2&f=W
    sourceUrl: 'https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=WGFUPUS2&f=W',
  },
];

// 「最新週が出たか」の判定に使う基準系列
export const PRIMARY_KEY = 'crude';

export const seriesByKey = Object.fromEntries(SERIES.map((s) => [s.key, s]));

// WPSR の公式ページ（出典リンク用）
export const WPSR_URL = 'https://www.eia.gov/petroleum/supply/weekly/';
export const EIA_API_BASE = 'https://api.eia.gov/v2';
