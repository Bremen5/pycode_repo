// node:test による計算ロジックの単体テスト。実行: node --test
//
// 期待値は、rates-2026.js の公式の料率・速算表を使って手計算した値（各テストのコメントに計算過程を記載）。
// 一般的な手取り計算サイト（2025年分ルール）の目安との比較:
//   年収500万円・30歳・扶養なし → 手取り 約390万円前後。2026年分は基礎控除の引上げ（58→最大104万円）、
//   健保料率 10.0→9.9%、雇用保険 0.55→0.5% の改正で、所得税・保険料がやや下がり 約394万円となる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RATES_2026 as R } from '../assets/js/config/rates-2026.js';
import {
  calcOffer,
  compareOffers,
  socialInsurance,
  employmentIncome,
  basicDeduction,
  healthStandard,
  pensionStandard,
  roundHalfDown,
} from '../assets/js/calc/salary.js';

const TOLERANCE = 3_000; // 誤差の許容範囲（円）

const baseOffer = {
  monthlySalary: 0,
  bonusMode: 'amount',
  bonusAmount: 0,
  bonusMonths: 0,
  hasFixedOvertime: false,
  fixedOvertimePay: 0,
  overtimeHours: 0,
  housingMode: 'allowance',
  housingAllowance: 0,
  companyHousing: 0,
  commute: 0,
  retirement: 0,
  otherBenefits: 0,
  holidays: 120,
  hoursPerDay: 8,
};
const common30 = { age: 30, dependents: 0, healthRate: 9.9 };
const offer = (o) => ({ ...baseOffer, ...o });

function near(actual, expected, label) {
  assert.ok(
    Math.abs(actual - expected) <= TOLERANCE,
    `${label}: 実際 ${actual.toLocaleString()} / 期待 ${expected.toLocaleString()}（差 ${actual - expected}）`,
  );
}

test('端数処理: 50銭以下切り捨て、50銭超切り上げ', () => {
  assert.equal(roundHalfDown(471.5), 471);
  assert.equal(roundHalfDown(471.51), 472);
  assert.equal(roundHalfDown(100), 100);
});

test('標準報酬月額の等級と上限', () => {
  assert.equal(healthStandard(250_000, R), 260_000);
  assert.equal(healthStandard(416_667, R), 410_000);
  assert.equal(healthStandard(2_000_000, R), 1_390_000); // 健保の上限（第50級）
  assert.equal(pensionStandard(1_000_000, R), 650_000); // 厚年の上限（第32級）
  assert.equal(pensionStandard(50_000, R), 88_000); // 厚年の下限（第1級）
});

test('2026年分の給与所得控除（最低保障74万円）と基礎控除', () => {
  assert.equal(employmentIncome(1_000_000, R), 260_000);
  assert.equal(employmentIncome(2_000_000, R), 1_260_000); // 200万 − 74万
  assert.equal(employmentIncome(3_000_000, R), 2_020_000); // 300万×70% − 8万
  assert.equal(employmentIncome(12_000_000, R), 10_050_000); // 上限195万
  assert.equal(basicDeduction(3_560_000, R), 1_040_000);
  assert.equal(basicDeduction(6_100_000, R), 670_000);
  assert.equal(basicDeduction(10_000_000, R), 620_000);
});

// 年収300万円（月給25万円・賞与なし・30歳・扶養なし）
// 標準報酬 26万円 → 健保 12,870 / 厚年 23,790 / 子育て支援金 299 / 雇用 1,250 = 月38,209 → 年458,508
// 給与所得 = 300万×70% − 8万 = 202万。所得税: (202万 − 458,508 − 104万)→521,000×5%×1.021 = 26,500
// 住民税: (202万 − 458,508 − 43万)→1,131,000×10% − 調整控除2,500 = 110,600 ＋ 均等割5,000 = 115,600
// 手取り = 300万 − 458,508 − 26,500 − 115,600 = 2,399,392
test('年収300万円', () => {
  const r = calcOffer(offer({ monthlySalary: 250_000 }), common30, R);
  assert.equal(r.gross, 3_000_000);
  near(r.socialInsurance.total, 458_508, '社会保険料');
  near(r.incomeTax.tax, 26_500, '所得税');
  near(r.residentTax.tax, 115_600, '住民税');
  near(r.takeHome, 2_399_392, '手取り');
});

// 年収500万円（月給416,667円）
// 標準報酬 41万円 → 健保 20,295 / 厚年 37,515 / 子育て 471 / 雇用 2,083 = 月60,364 → 年724,368
// 給与所得 = 500万（4,000円単位切捨て）×80% − 44万 = 356万
// 所得税: (356万 − 724,368 − 104万)→1,795,000×5%×1.021 = 91,600
// 住民税: (356万 − 724,368 − 43万)→2,405,000×10% − 2,500 = 238,000 ＋ 5,000 = 243,000
// 手取り = 5,000,004 − 724,368 − 91,600 − 243,000 = 3,941,036
test('年収500万円', () => {
  const r = calcOffer(offer({ monthlySalary: 416_667 }), common30, R);
  near(r.socialInsurance.total, 724_368, '社会保険料');
  near(r.incomeTax.tax, 91_600, '所得税');
  near(r.residentTax.tax, 243_000, '住民税');
  near(r.takeHome, 3_941_036, '手取り');
});

// 年収800万円（月給666,667円）
// 健保の標準報酬 68万円、厚年は上限65万円 → 健保 33,660 / 厚年 59,475 / 子育て 782 / 雇用 3,333 = 月97,250 → 年1,167,000
// 給与所得 = 8,000,004 − (10%＋110万=1,900,000) = 6,100,004 → 基礎控除67万（489万超655万以下）
// 所得税: 4,263,000×20% − 427,500 = 425,100 ×1.021 = 434,000
// 住民税: 4,503,000×10% − 2,500 = 447,800 ＋ 5,000 = 452,800
// 手取り = 8,000,004 − 1,167,000 − 434,000 − 452,800 = 5,946,204
test('年収800万円（厚生年金の上限に到達）', () => {
  const r = calcOffer(offer({ monthlySalary: 666_667 }), common30, R);
  assert.equal(r.socialInsurance.pensionStandard, 650_000);
  near(r.socialInsurance.total, 1_167_000, '社会保険料');
  near(r.incomeTax.tax, 434_000, '所得税');
  near(r.residentTax.tax, 452_800, '住民税');
  near(r.takeHome, 5_946_204, '手取り');
});

// 年収1,200万円（月給100万円）
// 健保の標準報酬 98万円、厚年65万円 → 健保 48,510 / 厚年 59,475 / 子育て 1,127 / 雇用 5,000 = 月114,112 → 年1,369,344
// 給与所得 = 1,200万 − 195万 = 1,005万 → 基礎控除62万
// 所得税: 8,060,000×23% − 636,000 = 1,217,800 ×1.021 = 1,243,300
// 住民税: 8,250,000×10% − 2,500 = 822,500 ＋ 5,000 = 827,500
// 手取り = 1,200万 − 1,369,344 − 1,243,300 − 827,500 = 8,559,856
test('年収1,200万円', () => {
  const r = calcOffer(offer({ monthlySalary: 1_000_000 }), common30, R);
  near(r.socialInsurance.total, 1_369_344, '社会保険料');
  near(r.incomeTax.tax, 1_243_300, '所得税');
  near(r.residentTax.tax, 827_500, '住民税');
  near(r.takeHome, 8_559_856, '手取り');
});

// 介護保険: 標準報酬41万円 × 1.62% ÷ 2 = 3,321円/月
test('介護保険料: 39歳は対象外、40歳から対象', () => {
  const o = offer({ monthlySalary: 416_667 });
  const r39 = calcOffer(o, { ...common30, age: 39 }, R);
  const r40 = calcOffer(o, { ...common30, age: 40 }, R);
  assert.equal(r39.socialInsurance.care, 0);
  assert.equal(r40.socialInsurance.care, 3_321 * 12);
  assert.equal(r40.socialInsurance.total - r39.socialInsurance.total, 3_321 * 12);
  assert.ok(r40.takeHome < r39.takeHome);
});

test('介護保険料: 64歳は対象、65歳は対象外', () => {
  const o = offer({ monthlySalary: 416_667 });
  assert.equal(calcOffer(o, { ...common30, age: 64 }, R).socialInsurance.care, 3_321 * 12);
  assert.equal(calcOffer(o, { ...common30, age: 65 }, R).socialInsurance.care, 0);
});

test('賞与: 厚生年金は1回150万円が上限（年2回に分割）', () => {
  const si = socialInsurance(
    { monthlyRemuneration: 500_000, annualBonus: 4_000_000, annualWages: 10_000_000, age: 30 },
    R,
  );
  // 毎月: 50万×9.15% = 45,750 ×12 = 549,000、賞与: 150万×9.15% = 137,250 ×2回 = 274,500
  assert.equal(si.pension, 549_000 + 274_500);
  // 健保の賞与は年度累計573万円まで → 200万×2回はすべて対象
  assert.equal(si.health, 24_750 * 12 + 99_000 * 2);
});

test('賞与の月数入力（月給×月数）', () => {
  const r = calcOffer(offer({ monthlySalary: 300_000, bonusMode: 'months', bonusMonths: 4 }), common30, R);
  assert.equal(r.bonus, 1_200_000);
  assert.equal(r.gross, 4_800_000);
});

test('残業代と固定残業代', () => {
  // 所定労働時間 (365−120)×8 = 1,960時間 → 月163.33時間、時給 = 30万 ÷ 163.33 ≒ 1,836.7円
  const o = offer({ monthlySalary: 300_000, overtimeHours: 20 });
  const r = calcOffer(o, common30, R);
  assert.equal(r.overtimeAnnual, Math.floor((300_000 / (1960 / 12)) * 1.25 * 20) * 12);
  assert.equal(r.totalHours, 1960 + 240);
  // 固定残業代が実残業代より多い場合は固定額
  const fixed = calcOffer({ ...o, hasFixedOvertime: true, fixedOvertimePay: 60_000 }, common30, R);
  assert.equal(fixed.overtimeAnnual, 720_000);
  // 実残業代のほうが多い場合は差額が支払われる
  const fixedSmall = calcOffer({ ...o, hasFixedOvertime: true, fixedOvertimePay: 10_000 }, common30, R);
  assert.equal(fixedSmall.overtimeAnnual, r.overtimeAnnual);
});

test('福利厚生: 社宅・DC・その他は非課税として実質年収に上乗せ', () => {
  const plain = calcOffer(offer({ monthlySalary: 300_000 }), common30, R);
  const withBenefits = calcOffer(
    offer({ monthlySalary: 300_000, housingMode: 'company', companyHousing: 50_000, retirement: 240_000, otherBenefits: 60_000 }),
    common30,
    R,
  );
  assert.equal(withBenefits.takeHome, plain.takeHome);
  assert.equal(withBenefits.realAnnual - plain.realAnnual, 600_000 + 240_000 + 60_000);
});

test('住宅手当は課税・社会保険の対象', () => {
  const plain = calcOffer(offer({ monthlySalary: 300_000 }), common30, R);
  const withAllowance = calcOffer(offer({ monthlySalary: 300_000, housingAllowance: 30_000 }), common30, R);
  assert.equal(withAllowance.gross - plain.gross, 360_000);
  assert.ok(withAllowance.takeHome - plain.takeHome < 360_000);
});

test('通勤手当は非課税（月15万円まで）だが社会保険料の計算には含まれる', () => {
  const plain = calcOffer(offer({ monthlySalary: 300_000 }), common30, R);
  const withCommute = calcOffer(offer({ monthlySalary: 300_000, commute: 20_000 }), common30, R);
  assert.equal(withCommute.gross, plain.gross);
  assert.ok(withCommute.socialInsurance.total > plain.socialInsurance.total);
});

test('扶養1人で所得税・住民税が下がる', () => {
  const o = offer({ monthlySalary: 416_667 });
  const r0 = calcOffer(o, common30, R);
  const r1 = calcOffer(o, { ...common30, dependents: 1 }, R);
  assert.ok(r1.incomeTax.tax < r0.incomeTax.tax);
  assert.ok(r1.residentTax.tax < r0.residentTax.tax);
});

test('A社とB社の比較', () => {
  const a = calcOffer(offer({ monthlySalary: 300_000 }), common30, R);
  const b = calcOffer(offer({ monthlySalary: 300_000, housingMode: 'company', companyHousing: 50_000 }), common30, R);
  const c = compareOffers(a, b);
  assert.equal(c.winner, 'B');
  assert.equal(c.annual, 600_000);
  assert.equal(c.monthly, 50_000);
  assert.equal(compareOffers(a, a).winner, 'even');
});

test('不正な入力でも NaN にならない', () => {
  const r = calcOffer({ monthlySalary: 'abc', holidays: 400, hoursPerDay: -1 }, { age: '' }, R);
  assert.equal(r.gross, 0);
  assert.equal(r.realHourly, 0);
  assert.ok(Number.isFinite(r.takeHome));
});
