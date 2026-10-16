// 原油価格・市場関連指標の定義（在庫統計とは別に一元管理する）
//
// 【注意1】構築環境からは EIA / CFTC へ接続できなかったため、系列IDとデータ項目名は実データで未検証。
//          APIキー設定後に `npm run verify-series` で、EIAが返す系列名・単位と下記 expect が一致することを確認すること。
// 【注意2】価格データの利用条件
//   - EIAのスポット価格（WTI・ブレント・製品・天然ガス）は EIA が無料公開しているが、元データは民間の情報会社
//     （EIAのページに "Source: Thomson Reuters" などと表示）。公開サイトでの再掲載の可否を EIA の利用条件
//     https://www.eia.gov/about/copyrights_reuse.php で確認し、確認後に config/site.mjs の prices.licenseConfirmed を true にする。
//   - 取引所の先物価格（NYMEX WTI・ICE Brent の清算値）は取引所のライセンスが必要なため扱わない。
//   - 小売価格（EIAの調査）と STEO（EIAの見通し）、CFTCの建玉報告は米国政府の公開データ。

// ---- EIA：日次・週次の価格（API v2 の後方互換ルート /v2/seriesid/{route}） ----
export const PRICE_SERIES = [
  {
    key: 'wti',
    route: 'PET.RWTC.D',
    id: 'RWTC',
    nameJa: 'WTI原油 スポット価格（クッシング）',
    shortJa: 'WTI',
    unit: 'USD/bbl',
    freq: 'daily',
    licensed: true, // 第三者データ（利用条件の確認が必要）
    expect: { description: /WTI.*Spot Price/i, units: /Dollars per Barrel/i },
    sourceUrl: 'https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=RWTC&f=D',
  },
  {
    key: 'brent',
    route: 'PET.RBRTE.D',
    id: 'RBRTE',
    nameJa: 'ブレント原油 スポット価格（欧州）',
    shortJa: 'ブレント',
    unit: 'USD/bbl',
    freq: 'daily',
    licensed: true,
    expect: { description: /Brent.*Spot Price/i, units: /Dollars per Barrel/i },
    sourceUrl: 'https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=RBRTE&f=D',
  },
  {
    key: 'gasolineNYH',
    route: 'PET.EER_EPMRU_PF4_Y35NY_DPG.D',
    id: 'EER_EPMRU_PF4_Y35NY_DPG',
    nameJa: 'ガソリン スポット価格（ニューヨーク港・従来型レギュラー）',
    shortJa: 'ガソリン（NY港）',
    unit: 'USD/gal',
    freq: 'daily',
    licensed: true,
    expect: { description: /New York Harbor Conventional Gasoline Regular Spot Price/i, units: /Dollars per Gallon/i },
    sourceUrl: 'https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=EER_EPMRU_PF4_Y35NY_DPG&f=D',
  },
  {
    key: 'ulsdNYH',
    route: 'PET.EER_EPD2DXL0_PF4_Y35NY_DPG.D',
    id: 'EER_EPD2DXL0_PF4_Y35NY_DPG',
    nameJa: '超低硫黄軽油 スポット価格（ニューヨーク港）',
    shortJa: '軽油（NY港）',
    unit: 'USD/gal',
    freq: 'daily',
    licensed: true,
    expect: { description: /New York Harbor Ultra-Low Sulfur No 2 Diesel Spot Price/i, units: /Dollars per Gallon/i },
    sourceUrl: 'https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=EER_EPD2DXL0_PF4_Y35NY_DPG&f=D',
  },
  {
    key: 'henryHub',
    route: 'NG.RNGWHHD.D',
    id: 'RNGWHHD',
    nameJa: '天然ガス スポット価格（ヘンリーハブ）',
    shortJa: '天然ガス',
    unit: 'USD/MMBtu',
    freq: 'daily',
    licensed: true,
    expect: { description: /Henry Hub Natural Gas Spot Price/i, units: /Dollars per Million Btu/i },
    sourceUrl: 'https://www.eia.gov/dnav/ng/hist/rngwhhdD.htm',
  },
  {
    key: 'retailGasoline',
    route: 'PET.EMM_EPMR_PTE_NUS_DPG.W',
    id: 'EMM_EPMR_PTE_NUS_DPG',
    nameJa: '米国のガソリン小売価格（レギュラー・全米平均）',
    shortJa: '米ガソリン小売',
    unit: 'USD/gal',
    freq: 'weekly',
    licensed: false, // EIA自身の調査
    expect: { description: /Regular.*Retail Gasoline Prices/i, units: /Dollars per Gallon/i },
    sourceUrl: 'https://www.eia.gov/petroleum/gasdiesel/',
  },
  {
    key: 'retailDiesel',
    route: 'PET.EMD_EPD2D_PTE_NUS_DPG.W',
    id: 'EMD_EPD2D_PTE_NUS_DPG',
    nameJa: '米国の軽油小売価格（全米平均）',
    shortJa: '米軽油小売',
    unit: 'USD/gal',
    freq: 'weekly',
    licensed: false,
    expect: { description: /Diesel.*Retail Prices/i, units: /Dollars per Gallon/i },
    sourceUrl: 'https://www.eia.gov/petroleum/gasdiesel/',
  },
];

// ---- EIA STEO（短期エネルギー見通し・月次。将来の月は EIA の予測値） ----
// 系列一覧: https://www.eia.gov/outlooks/steo/data/browser/
export const STEO_SERIES = [
  { key: 'worldSupply', route: 'STEO.PAPR_WORLD.M', id: 'PAPR_WORLD', nameJa: '世界の液体燃料の生産量', unit: 'MBBL/D_MILLION', expect: { description: /World.*production/i } },
  { key: 'worldDemand', route: 'STEO.PATC_WORLD.M', id: 'PATC_WORLD', nameJa: '世界の液体燃料の消費量', unit: 'MBBL/D_MILLION', expect: { description: /World.*consumption/i } },
  { key: 'opecCrude', route: 'STEO.COPR_OPEC.M', id: 'COPR_OPEC', nameJa: 'OPECの原油生産量', unit: 'MBBL/D_MILLION', expect: { description: /OPEC.*crude oil production/i } },
  { key: 'usCrude', route: 'STEO.COPRPUS.M', id: 'COPRPUS', nameJa: '米国の原油生産量', unit: 'MBBL/D_MILLION', expect: { description: /U\.S\..*crude oil production/i } },
  { key: 'oecdStocks', route: 'STEO.PASC_OECD_T3.M', id: 'PASC_OECD_T3', nameJa: 'OECDの商業在庫（期末）', unit: 'MBBL_MILLION', expect: { description: /OECD.*commercial inventor/i } },
];

// ---- CFTC 建玉明細（Disaggregated, Futures Only）。米国政府の公開データ ----
// データセット: https://publicreporting.cftc.gov/  （Socrata API、キー不要）
export const CFTC = {
  dataset: '72hh-3qpy',
  base: 'https://publicreporting.cftc.gov/resource',
  marketCode: '067651', // CRUDE OIL, LIGHT SWEET-WTI - NEW YORK MERCANTILE EXCHANGE
  nameJa: 'WTI原油先物（NYMEX）の建玉',
  fields: {
    date: 'report_date_as_yyyy_mm_dd',
    openInterest: 'open_interest_all',
    mmLong: 'm_money_positions_long_all',
    mmShort: 'm_money_positions_short_all',
    pmLong: 'prod_merc_positions_long',
    pmShort: 'prod_merc_positions_short',
    swapLong: 'swap_positions_long_all',
    swapShort: 'swap__positions_short_all',
  },
  sourceUrl: 'https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm',
};

// 1枚 = 1,000バレル（NYMEX WTI）
export const BARRELS_PER_CONTRACT = 1000;
// 1バレル = 42米ガロン
export const GALLONS_PER_BARREL = 42;

export const priceByKey = Object.fromEntries(PRICE_SERIES.map((s) => [s.key, s]));
export const steoByKey = Object.fromEntries(STEO_SERIES.map((s) => [s.key, s]));

// 本サイトで自動取得していないが、専門的に重要な指標（出典と発表時期をページで案内する）
export const EXTERNAL_INDICATORS = [
  { name: 'ドバイ原油・オマーン原油', org: 'S&P Global Platts／GME（オマーン先物）', when: '毎営業日', note: 'アジア向け原油の代表指標。日本の輸入原油の価格に直結するが、データは有料', url: 'https://www.spglobal.com/commodityinsights/' },
  { name: 'マーバン原油先物', org: 'ICE Futures Abu Dhabi', when: '毎営業日', note: 'UAE産の軽質原油。アジア向けの指標の一つ', url: 'https://www.ice.com/ifad' },
  { name: 'OPECバスケット価格', org: 'OPEC', when: '毎営業日（翌営業日に公表）', note: 'OPEC加盟国の主要油種の平均価格', url: 'https://www.opec.org/' },
  { name: '米国の稼働リグ数', org: 'Baker Hughes', when: '毎週金曜 13:00（米東部）', note: '米国の掘削活動の目安。生産量に数か月遅れて影響するとされる', url: 'https://rigcount.bakerhughes.com/' },
  { name: 'API週間石油統計', org: '米国石油協会（API）', when: '毎週火曜 16:30（米東部）', note: 'EIA統計の前日に伝えられる業界統計（購読者向け）', url: 'https://www.api.org/' },
  { name: 'OPEC月報（MOMR）', org: 'OPEC', when: '毎月中旬', note: '世界の需給見通しとOPEC加盟国の生産量（二次情報による推計）', url: 'https://www.opec.org/opec_web/en/publications/338.htm' },
  { name: 'IEA石油市場報告（OMR）', org: '国際エネルギー機関（IEA）', when: '毎月中旬', note: '世界の需給と在庫。詳細は有料', url: 'https://www.iea.org/topics/oil-market-report' },
  { name: 'JODI石油データ', org: 'JODI（IEFなど8機関）', when: '毎月', note: '各国の生産・需要・在庫の月次データ', url: 'https://www.jodidata.org/' },
  { name: '日本のガソリン小売価格', org: '資源エネルギー庁「石油製品価格調査」', when: '毎週水曜（月曜時点の価格）', note: 'レギュラーガソリン・軽油・灯油の全国平均と都道府県別', url: 'https://www.enecho.meti.go.jp/statistics/petroleum_and_lpgas/pl007/' },
  { name: '日本の石油統計（週報）', org: '石油連盟', when: '毎週', note: '国内製油所の稼働率、原油処理量、製品在庫', url: 'https://www.paj.gr.jp/statis/' },
];
