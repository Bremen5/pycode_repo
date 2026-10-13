// 給与・税・社会保険の計算ロジック（純粋関数のみ。DOM や localStorage には触れない）。
// 数値の定数は呼び出し側から rates（assets/js/config/rates-YYYY.js）として受け取る。

/** 50銭以下切り捨て・50銭超切り上げ（社会保険料を給与から控除する際の端数処理） */
export function roundHalfDown(x) {
  return Math.ceil(x - 0.5);
}

const floorTo = (x, unit) => Math.floor(x / unit) * unit;
const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);

/** [上限(以下), ...] 形式の表から該当行を探す。上限 null は最終行。 */
function findBracket(table, value) {
  return table.find(([limit]) => limit === null || value <= limit);
}

/** 従業員負担分（労使折半）の保険料。ratePercent は労使合計の % */
export function employeeShare(base, ratePercent) {
  // 浮動小数の誤差を避けるため、料率を 1/1000 % 単位の整数にしてから計算する
  return roundHalfDown((base * Math.round(ratePercent * 1000)) / 200_000);
}

/** 報酬月額 → 健康保険の標準報酬月額 */
export function healthStandard(monthly, rates) {
  const grades = rates.socialInsurance.standardGrades;
  let standard = grades[0][1];
  for (const [lower, value] of grades) {
    if (monthly >= lower) standard = value;
  }
  return standard;
}

/** 報酬月額 → 厚生年金の標準報酬月額（健康保険の等級を上下限で丸める） */
export function pensionStandard(monthly, rates) {
  const si = rates.socialInsurance;
  return Math.min(Math.max(healthStandard(monthly, rates), si.pensionMinStandard), si.pensionMaxStandard);
}

/** 介護保険の対象年齢か（40歳以上65歳未満） */
export function isCareTarget(age, rates) {
  const si = rates.socialInsurance;
  return age >= si.careAgeFrom && age < si.careAgeUntil;
}

/**
 * 年間の社会保険料（従業員負担分）
 * @param {object} p
 * @param {number} p.monthlyRemuneration 報酬月額（月給＋手当＋通勤手当＋残業代の月平均）
 * @param {number} p.annualBonus 賞与の年額
 * @param {number} p.annualWages 雇用保険の対象となる賃金の年額（賞与を含む総支給額）
 * @param {number} p.age 年齢
 * @param {number} [p.healthRate] 健康保険料率（%）。省略時は rates の値
 */
export function socialInsurance({ monthlyRemuneration, annualBonus, annualWages, age, healthRate }, rates) {
  const si = rates.socialInsurance;
  const hRate = Number.isFinite(healthRate) && healthRate > 0 ? healthRate : si.healthRate;
  const care = isCareTarget(age, rates);

  const hStd = healthStandard(monthlyRemuneration, rates);
  const pStd = pensionStandard(monthlyRemuneration, rates);

  // 毎月の給与分
  const monthly = {
    health: employeeShare(hStd, hRate),
    care: care ? employeeShare(hStd, si.careRate) : 0,
    childSupport: employeeShare(hStd, si.childSupportRate),
    pension: employeeShare(pStd, si.pensionRate),
  };

  // 賞与分（年額を支給回数で均等に分けて上限を判定）
  const times = annualBonus > 0 ? si.bonusPaymentsPerYear : 0;
  const bonus = { health: 0, care: 0, childSupport: 0, pension: 0 };
  let healthBonusTotal = 0;
  for (let i = 0; i < times; i++) {
    const stdBonus = floorTo(annualBonus / times, si.standardBonusUnit);
    const hBonus = Math.max(0, Math.min(stdBonus, si.healthBonusCapPerYear - healthBonusTotal));
    healthBonusTotal += hBonus;
    const pBonus = Math.min(stdBonus, si.pensionBonusCapPerPayment);
    bonus.health += employeeShare(hBonus, hRate);
    bonus.care += care ? employeeShare(hBonus, si.careRate) : 0;
    bonus.childSupport += employeeShare(hBonus, si.childSupportRate);
    bonus.pension += employeeShare(pBonus, si.pensionRate);
  }

  // 雇用保険は標準報酬ではなく実際の賃金額に料率をかける（毎月の給与・賞与ごとに端数処理）
  const monthlyWage = (annualWages - annualBonus) / 12;
  const employment =
    roundHalfDown((monthlyWage * si.employmentRate) / 100) * 12 +
    (times ? roundHalfDown(((annualBonus / times) * si.employmentRate) / 100) * times : 0);

  const result = {
    healthStandard: hStd,
    pensionStandard: pStd,
    health: monthly.health * 12 + bonus.health,
    care: monthly.care * 12 + bonus.care,
    childSupport: monthly.childSupport * 12 + bonus.childSupport,
    pension: monthly.pension * 12 + bonus.pension,
    employment,
  };
  result.total = result.health + result.care + result.childSupport + result.pension + result.employment;
  return result;
}

/** 給与所得控除額 */
export function employmentIncomeDeduction(income, rates) {
  const d = rates.incomeTax.employmentIncomeDeduction;
  const base = income >= d.roundingFrom && income < d.roundingBelow ? floorTo(income, d.roundingUnit) : income;
  const [, rate, add] = findBracket(d.brackets, base);
  return Math.min(base, Math.max(Math.floor(base * rate + add), d.minimum));
}

/** 給与所得（給与収入 − 給与所得控除） */
export function employmentIncome(income, rates) {
  const d = rates.incomeTax.employmentIncomeDeduction;
  const base = income >= d.roundingFrom && income < d.roundingBelow ? floorTo(income, d.roundingUnit) : income;
  return Math.max(0, base - employmentIncomeDeduction(income, rates));
}

/** 所得税の基礎控除 */
export function basicDeduction(totalIncome, rates) {
  return findBracket(rates.incomeTax.basicDeduction, totalIncome)[1];
}

/** 所得税＋復興特別所得税（年額） */
export function incomeTax({ salaryIncome, socialInsuranceTotal, dependents = 0 }, rates) {
  const t = rates.incomeTax;
  const totalIncome = employmentIncome(salaryIncome, rates);
  const deductions = socialInsuranceTotal + basicDeduction(totalIncome, rates) + t.dependentDeduction * dependents;
  const taxable = floorTo(Math.max(0, totalIncome - deductions), t.taxableIncomeUnit);
  const [, rate, sub] = findBracket(t.brackets, taxable);
  const baseTax = Math.max(0, Math.floor(taxable * rate - sub));
  const tax = floorTo(Math.floor(baseTax * (1 + t.reconstructionRate)), t.taxUnit);
  return { totalIncome, taxable, baseTax, tax };
}

/** 住民税（簡易計算。所得割＋均等割の年額） */
export function residentTax({ salaryIncome, socialInsuranceTotal, dependents = 0 }, rates) {
  const r = rates.residentTax;
  const totalIncome = employmentIncome(salaryIncome, rates);

  // 非課税限度額
  const ex = r.exemption;
  const perCapitaLimit = dependents > 0 ? ex.perPerson * (1 + dependents) + ex.base + ex.perCapitaAdd : ex.single;
  const incomeLimit = dependents > 0 ? ex.perPerson * (1 + dependents) + ex.base + ex.incomeAdd : ex.single;

  const basic = findBracket(r.basicDeduction, totalIncome)[1];
  const deductions = socialInsuranceTotal + basic + r.dependentDeduction * dependents;
  const taxable = floorTo(Math.max(0, totalIncome - deductions), r.taxableIncomeUnit);

  let incomePart = 0;
  if (totalIncome > incomeLimit) {
    const a = r.adjustment;
    let adjustment = 0;
    if (totalIncome <= a.maxTotalIncome) {
      const diff = a.basicDiff + a.dependentDiff * dependents;
      adjustment =
        taxable <= a.threshold
          ? Math.min(diff, taxable) * a.rate
          : Math.max((diff - (taxable - a.threshold)) * a.rate, a.minimum);
    }
    incomePart = floorTo(Math.max(0, taxable * r.incomeRate - adjustment), r.taxUnit);
  }
  const perCapita = totalIncome > perCapitaLimit ? r.perCapita : 0;
  return { totalIncome, taxable, incomePart, perCapita, tax: incomePart + perCapita };
}

/**
 * 1社分の求人条件から、額面・手取り・実質年収・実質時給を計算する。
 * @param {object} offer 求人条件（金額はすべて円）
 * @param {number} offer.monthlySalary 月給（基本給＋固定手当。固定残業代は含めない）
 * @param {'amount'|'months'} offer.bonusMode 賞与の入力方法
 * @param {number} offer.bonusAmount 賞与の年額（bonusMode=amount）
 * @param {number} offer.bonusMonths 賞与の月数（bonusMode=months。月給×月数）
 * @param {boolean} offer.hasFixedOvertime 固定残業代の有無
 * @param {number} offer.fixedOvertimePay 固定残業代（月額）
 * @param {number} offer.overtimeHours 月平均の残業時間
 * @param {'allowance'|'company'} offer.housingMode 住宅手当か、借上げ社宅か
 * @param {number} offer.housingAllowance 住宅手当（月額・課税）
 * @param {number} offer.companyHousing 借上げ社宅の会社負担額（月額・非課税として扱う）
 * @param {number} offer.commute 通勤手当（月額）
 * @param {number} offer.retirement 企業型DC・退職金の積立相当額（年額）
 * @param {number} offer.otherBenefits その他の福利厚生の年間価値
 * @param {number} offer.holidays 年間休日数
 * @param {number} offer.hoursPerDay 1日の所定労働時間
 * @param {object} common 共通条件 { age, dependents, healthRate }
 * @param {object} rates 年度の定数
 */
export function calcOffer(offer, common, rates) {
  const monthlySalary = num(offer.monthlySalary);
  const holidays = Math.min(num(offer.holidays), rates.daysPerYear);
  const hoursPerDay = num(offer.hoursPerDay);
  const overtimeHours = num(offer.overtimeHours);
  const age = num(common.age);
  const dependents = Math.floor(num(common.dependents));

  // 労働時間
  const scheduledHours = (rates.daysPerYear - holidays) * hoursPerDay;
  const totalHours = scheduledHours + overtimeHours * 12;

  // 残業代：時給 × 1.25 × 時間。固定残業代がある場合は、実残業代が上回った分だけ追加で支払われる前提
  const hourlyBase = scheduledHours > 0 ? monthlySalary / (scheduledHours / 12) : 0;
  const actualOvertimeMonthly = Math.floor(hourlyBase * rates.overtimePremium * overtimeHours);
  const overtimeMonthly = offer.hasFixedOvertime
    ? Math.max(num(offer.fixedOvertimePay), actualOvertimeMonthly)
    : actualOvertimeMonthly;

  const bonus =
    offer.bonusMode === 'months' ? Math.floor(monthlySalary * num(offer.bonusMonths)) : Math.floor(num(offer.bonusAmount));

  const housingAllowance = offer.housingMode === 'company' ? 0 : num(offer.housingAllowance);
  const companyHousing = offer.housingMode === 'company' ? num(offer.companyHousing) : 0;
  const commute = num(offer.commute);
  const commuteTaxable = Math.max(0, commute - rates.commuteTaxFreeMonthly);

  // 額面年収（課税される給与収入）
  const gross = (monthlySalary + overtimeMonthly + housingAllowance + commuteTaxable) * 12 + bonus;

  // 社会保険：通勤手当は全額が報酬に含まれる
  const monthlyRemuneration = monthlySalary + overtimeMonthly + housingAllowance + commute;
  const si = socialInsurance(
    {
      monthlyRemuneration,
      annualBonus: bonus,
      annualWages: monthlyRemuneration * 12 + bonus,
      age,
      healthRate: Number(common.healthRate),
    },
    rates,
  );

  const it = incomeTax({ salaryIncome: gross, socialInsuranceTotal: si.total, dependents }, rates);
  const rt = residentTax({ salaryIncome: gross, socialInsuranceTotal: si.total, dependents }, rates);

  const deductionsTotal = si.total + it.tax + rt.tax;
  const takeHome = gross - deductionsTotal;

  const benefits = {
    companyHousing: companyHousing * 12,
    retirement: num(offer.retirement),
    other: num(offer.otherBenefits),
  };
  benefits.total = benefits.companyHousing + benefits.retirement + benefits.other;

  const realAnnual = takeHome + benefits.total;
  const realHourly = totalHours > 0 ? realAnnual / totalHours : 0;

  return {
    gross,
    bonus,
    overtimeAnnual: overtimeMonthly * 12,
    commuteAnnual: commute * 12,
    socialInsurance: si,
    incomeTax: it,
    residentTax: rt,
    deductionsTotal,
    takeHome,
    benefits,
    realAnnual,
    realMonthly: realAnnual / 12,
    scheduledHours,
    totalHours,
    realHourly,
  };
}

/** A社とB社の比較（B − A）。winner は 'A' | 'B' | 'even' */
export function compareOffers(a, b) {
  const annual = b.realAnnual - a.realAnnual;
  const hourly = b.realHourly - a.realHourly;
  return {
    annual,
    monthly: annual / 12,
    hourly,
    winner: annual > 0 ? 'B' : annual < 0 ? 'A' : 'even',
  };
}
