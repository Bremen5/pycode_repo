// サイト全体の設定
export const SITE = {
  name: 'EIA石油在庫ウィークリー',
  tagline: '原油在庫・価格・世界の需給を日本語で',
  description:
    '米エネルギー情報局（EIA）の週間石油在庫統計を中心に、WTI・ブレントなどの原油価格、製品価格、投機筋の建玉、世界の石油需給まで、原油市場の主要な指標を日本語の解説とグラフで毎週まとめています。',
  // 本番URL（末尾スラッシュなし）。独自ドメインを取得したら差し替える
  url: 'https://example.netlify.app',
  lang: 'ja',
  locale: 'ja_JP',
  // 運営者情報（about.html に表示）
  operator: {
    name: '（運営者名を記入）',
    contact: '（連絡先メールアドレスまたはフォームURLを記入）',
  },
  // Google Analytics 4 の測定ID（プレースホルダー。本番IDに差し替える）
  ga4Id: 'G-XXXXXXXXXX',
  // 広告枠（中身はプレースホルダー。必ず「PR」表記を付けて表示する）
  ads: {
    enabled: true,
    slots: {
      // 週ごとのページ：解説の下
      afterArticle: '<div class="ad-placeholder">広告枠（解説の下）</div>',
      // サイドバー（スマホでは記事の末尾）
      sidebar: '<div class="ad-placeholder">広告枠（サイドバー）</div>',
    },
  },
  // 価格データ（EIAのスポット価格。元データは民間の情報会社）の掲載設定
  //   enabled: false にすると、価格（WTI・ブレント・製品・天然ガス）とクラックスプレッドを表示しない
  //   licenseConfirmed: EIAの利用条件（https://www.eia.gov/about/copyrights_reuse.php）を確認したら true にする
  prices: {
    enabled: true,
    licenseConfirmed: false,
  },
  source: {
    label: 'U.S. Energy Information Administration（EIA）',
    url: 'https://www.eia.gov/petroleum/supply/weekly/',
  },
  disclaimerShort:
    '本サイトは情報提供を目的としたものであり、特定の金融商品の売買を推奨するものではありません。',
};

// 1バレル = 158.987294928 リットル（米国の石油バレル = 42米ガロン）
export const LITERS_PER_BARREL = 158.987294928;
