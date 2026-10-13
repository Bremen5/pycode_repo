// 2026年（令和8年）分の税率・保険料率などの定数。
// 年度が変わったら、このファイルを複製して rates-2027.js を作り、値を差し替える（手順は README.md）。
// 計算ロジック（assets/js/calc/salary.js）には数値を直接書かず、必ずこのファイルから渡すこと。
//
// 出典の確認日はすべて 2026-10-13。
// ※確認時、作業環境のネットワーク制限で公式サイトの本文を直接取得できなかったため、
//   Web検索の結果（公式サイトと、それを引用した解説記事）で数値を照合した。
//   公開前に、各URLの一次資料で値をもう一度確認すること。

export const RATES_2026 = Object.freeze({
  year: 2026,
  label: '2026年（令和8年）分',

  // ───────────── 社会保険（従業員負担分の計算に使う） ─────────────
  socialInsurance: {
    // 健康保険料率（労使合計, %）。協会けんぽの全国平均。令和8年3月分（4月納付分）から 10.00% → 9.90%。
    // 出典: https://www.kyoukaikenpo.or.jp/ （令和8年度 都道府県単位保険料率） / https://www.rodo.co.jp/news/211243/
    // 確認日: 2026-10-13
    healthRate: 9.9,

    // 介護保険料率（労使合計, %）。40歳以上65歳未満（介護保険第2号被保険者）だけが対象。令和8年3月分から 1.62%。
    // 出典: https://www.kyoukaikenpo.or.jp/ / https://www.rodo.co.jp/news/212017/
    // 確認日: 2026-10-13
    careRate: 1.62,
    careAgeFrom: 40, // この年齢から対象
    careAgeUntil: 65, // この年齢になったら対象外（65歳以上は市区町村が徴収）

    // 子ども・子育て支援金率（労使合計, %）。全国一律。令和8年4月分（5月納付分）から徴収開始。
    // 出典: https://www.kyoukaikenpo.or.jp/shibu/chiba/public_relations/002 （令和8年度 保険料率について）
    // 確認日: 2026-10-13
    childSupportRate: 0.23,

    // 厚生年金保険料率（労使合計, %）。2017年9月から18.3%で固定。
    // 出典: https://www.nenkin.go.jp/service/kounen/hokenryo/ryogaku/ryogakuhyo/index.html
    // 確認日: 2026-10-13
    pensionRate: 18.3,

    // 厚生年金の標準報酬月額の下限・上限（第1級 8.8万円〜第32級 65万円）。
    // ※2025年の年金制度改正法により、上限は2027年9月に68万円、2028年9月に71万円、2029年9月に75万円へ段階的に引き上げ予定。
    // 出典: https://www.nenkin.go.jp/service/kounen/hokenryo/ryogaku/ryogakuhyo/index.html
    // 確認日: 2026-10-13
    pensionMinStandard: 88_000,
    pensionMaxStandard: 650_000,

    // 賞与の上限。厚生年金: 1回（1か月）あたり標準賞与額150万円。健康保険: 年度累計573万円。
    // 出典: https://www.nenkin.go.jp/service/kounen/hokenryo/hoshu/20141203.html
    // 確認日: 2026-10-13
    pensionBonusCapPerPayment: 1_500_000,
    healthBonusCapPerYear: 5_730_000,
    standardBonusUnit: 1_000, // 標準賞与額は1,000円未満を切り捨て

    // 雇用保険料率（労働者負担, %）。一般の事業。令和8年4月1日〜令和9年3月31日は 5/1000（=0.5%）。
    // 出典: https://jsite.mhlw.go.jp/tochigi-roudoukyoku/newpage_01657.html （令和8年度 雇用保険料率のご案内）
    // 確認日: 2026-10-13
    employmentRate: 0.5,

    // 健康保険の標準報酬月額 等級表（第1級〜第50級）。[報酬月額の下限（以上）, 標準報酬月額]。
    // 厚生年金はこの表を pensionMinStandard〜pensionMaxStandard の範囲に丸めて使う（厚年1級=健保4級, 厚年32級=健保35級）。
    // 出典: https://www.kyoukaikenpo.or.jp/g7/cat330/sb3150/ （保険料額表）
    // 確認日: 2026-10-13
    standardGrades: [
      [0, 58_000], [63_000, 68_000], [73_000, 78_000], [83_000, 88_000], [93_000, 98_000],
      [101_000, 104_000], [107_000, 110_000], [114_000, 118_000], [122_000, 126_000], [130_000, 134_000],
      [138_000, 142_000], [146_000, 150_000], [155_000, 160_000], [165_000, 170_000], [175_000, 180_000],
      [185_000, 190_000], [195_000, 200_000], [210_000, 220_000], [230_000, 240_000], [250_000, 260_000],
      [270_000, 280_000], [290_000, 300_000], [310_000, 320_000], [330_000, 340_000], [350_000, 360_000],
      [370_000, 380_000], [395_000, 410_000], [425_000, 440_000], [455_000, 470_000], [485_000, 500_000],
      [515_000, 530_000], [545_000, 560_000], [575_000, 590_000], [605_000, 620_000], [635_000, 650_000],
      [665_000, 680_000], [695_000, 710_000], [730_000, 750_000], [770_000, 790_000], [810_000, 830_000],
      [855_000, 880_000], [905_000, 930_000], [955_000, 980_000], [1_005_000, 1_030_000], [1_055_000, 1_090_000],
      [1_115_000, 1_150_000], [1_175_000, 1_210_000], [1_235_000, 1_270_000], [1_295_000, 1_330_000], [1_355_000, 1_390_000],
    ],

    // 賞与の支給回数（年額で入力された賞与を、この回数に均等分割して上限判定する）。計算上の前提。
    bonusPaymentsPerYear: 2,
  },

  // ───────────── 所得税（2026年分） ─────────────
  incomeTax: {
    // 給与所得控除（令和7年度改正で最低保障額 55万→65万、令和8年度改正で本則 65万→69万、
    // さらに令和8・9年分は給与収入220万円以下に特例5万円を上乗せ → 実質の最低保障額は74万円）。
    // [収入の上限（以下）, 率, 加算額]。上限 null は「それ超」。控除額 = max(収入×率+加算, minimum)。
    // 出典: https://www.mof.go.jp/tax_policy/tax_reform/outline/fy2026/08taikou_01.htm （令和8年度税制改正の大綱）
    //       https://www.nta.go.jp/publication/pamph/gensen/2026kaisei.pdf （令和8年度 源泉所得税の改正のあらまし）
    //       https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1410.htm （No.1410 給与所得控除）
    // 確認日: 2026-10-13
    employmentIncomeDeduction: {
      minimum: 740_000,
      brackets: [
        [2_200_000, 0, 740_000],
        [3_600_000, 0.3, 80_000],
        [6_600_000, 0.2, 440_000],
        [8_500_000, 0.1, 1_100_000],
        [null, 0, 1_950_000],
      ],
      // 年末調整の「給与所得控除後の給与等の金額の表」と同じく、この範囲の収入は4,000円単位に切り捨ててから計算する。
      roundingFrom: 2_200_000,
      roundingBelow: 6_600_000,
      roundingUnit: 4_000,
    },

    // 基礎控除（合計所得金額で判定）。本則62万円（令和8年度改正で58万→62万）＋令和8・9年分の特例加算
    // （合計所得489万円以下 +42万円、489万円超655万円以下 +5万円）。[合計所得の上限（以下）, 控除額]。
    // 出典: https://www.nta.go.jp/users/gensen/2026kiso/index.htm （令和8年度税制改正 基礎控除の引上げ等）
    //       https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1199.htm （No.1199 基礎控除）
    // 確認日: 2026-10-13
    basicDeduction: [
      [4_890_000, 1_040_000],
      [6_550_000, 670_000],
      [23_500_000, 620_000],
      [24_000_000, 480_000],
      [24_500_000, 320_000],
      [25_000_000, 160_000],
      [null, 0],
    ],

    // 一般の扶養控除（16歳以上の扶養親族1人あたり）。簡易計算として配偶者もこの額で扱う。
    // 出典: https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1180.htm （No.1180 扶養控除）
    // 確認日: 2026-10-13
    dependentDeduction: 380_000,

    // 所得税の速算表。[課税所得の上限（以下）, 税率, 控除額]。
    // 出典: https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm （No.2260 所得税の税率）
    // 確認日: 2026-10-13
    brackets: [
      [1_949_000, 0.05, 0],
      [3_299_000, 0.1, 97_500],
      [6_949_000, 0.2, 427_500],
      [8_999_000, 0.23, 636_000],
      [17_999_000, 0.33, 1_536_000],
      [39_999_000, 0.4, 2_796_000],
      [null, 0.45, 4_796_000],
    ],
    taxableIncomeUnit: 1_000, // 課税所得は1,000円未満切り捨て

    // 復興特別所得税（基準所得税額の2.1%、2037年分まで）。
    // 出典: https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm
    // 確認日: 2026-10-13
    reconstructionRate: 0.021,
    taxUnit: 100, // 申告納税額は100円未満切り捨て
  },

  // ───────────── 住民税（簡易計算） ─────────────
  // 実際の住民税は「前年の所得」に対して翌年度に課税される。このツールでは、入力した年収が続いた場合の
  // 1年分の目安として、同じ年の所得に令和9年度分の住民税のルールを当てはめて計算する。
  residentTax: {
    // 所得割の税率（市区町村6%＋都道府県4%）。
    // 出典: https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/150790_06.html （個人住民税）
    // 確認日: 2026-10-13
    incomeRate: 0.1,

    // 均等割（市区町村3,000円＋都道府県1,000円）＋森林環境税1,000円。自治体の超過課税は考慮しない。
    // 出典: https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/150790_06.html
    //       https://www.city.yokohama.lg.jp/kurashi/koseki-zei-hoken/zeikin/y-shizei/kojin-shiminzei-kenminzei/kojin-shiminzei-shosai/
    // 確認日: 2026-10-13
    perCapita: 5_000,

    // 住民税の基礎控除（43万円で据え置き）。[合計所得の上限（以下）, 控除額]。
    // 給与所得控除は令和9年度分から所得税と同じ（最低保障74万円）になるため、incomeTax の表を共用する。
    // 出典: https://www.pref.osaka.lg.jp/o050030/zei/alacarte/reiwa8_zeikai.html （令和8年度税制改正 個人住民税）
    // 確認日: 2026-10-13
    basicDeduction: [
      [24_000_000, 430_000],
      [24_500_000, 290_000],
      [25_000_000, 150_000],
      [null, 0],
    ],
    dependentDeduction: 330_000, // 一般の扶養控除（住民税）

    // 調整控除（所得税との人的控除額の差による負担増を調整）。差額は基礎控除5万円・一般扶養5万円として簡易計算。
    // 出典: https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/150790_06.html
    // 確認日: 2026-10-13
    adjustment: {
      basicDiff: 50_000,
      dependentDiff: 50_000,
      rate: 0.05,
      threshold: 2_000_000,
      minimum: 2_500,
      maxTotalIncome: 25_000_000,
    },

    // 非課税限度額（1級地の目安）。合計所得がこれ以下なら非課税。
    // 単身: 45万円。扶養あり: 35万円×(本人+扶養人数)＋10万円＋加算（均等割21万円／所得割32万円）。
    // 出典: https://www.city.yokohama.lg.jp/kurashi/koseki-zei-hoken/zeikin/y-shizei/kojin-shiminzei-kenminzei/kojin-shiminzei-shosai/
    // 確認日: 2026-10-13
    exemption: {
      single: 450_000,
      perPerson: 350_000,
      base: 100_000,
      perCapitaAdd: 210_000,
      incomeAdd: 320_000,
    },
    taxableIncomeUnit: 1_000,
    taxUnit: 100,
  },

  // ───────────── その他 ─────────────
  // 通勤手当の非課税限度額（月額。電車・バス等の交通機関利用の場合）。超えた分は課税される。
  // ※社会保険料の計算では、通勤手当は全額が報酬に含まれる。
  // 出典: https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2582.htm （No.2582 電車・バスなどの通勤手当）
  // 確認日: 2026-10-13
  commuteTaxFreeMonthly: 150_000,

  // 時間外労働の割増率（月60時間までの法定割増率）。
  // 出典: https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/roudouzikan/index.html
  // 確認日: 2026-10-13
  overtimePremium: 1.25,

  daysPerYear: 365,
});

export default RATES_2026;
