// 実質年収比較ツールの画面処理（入力の読み書き・結果の描画・localStorage への保存）。
// 計算そのものは calc/salary.js、定数は config/rates-2026.js にある。
import '../site.js?v=202610130001';
import { calcOffer, compareOffers } from '../calc/salary.js?v=202610130001';
import { RATES_2026 as RATES } from '../config/rates-2026.js?v=202610130001';

const STORAGE_KEY = 'okane-tools:jisshitsu-nenshu:v1';
const MAN = 10_000;

// 金額（万円で入力）の項目。ロジックには円で渡す
const MONEY_FIELDS = new Set([
  'monthlySalary', 'bonusAmount', 'fixedOvertimePay', 'housingAllowance',
  'companyHousing', 'commute', 'retirement', 'otherBenefits',
]);

const DEFAULTS = {
  common: { age: 30, dependents: 0, healthRate: RATES.socialInsurance.healthRate },
  offers: {
    A: {
      monthlySalary: 30, bonusMode: 'months', bonusMonths: 4, bonusAmount: 0,
      hasFixedOvertime: false, fixedOvertimePay: 0, overtimeHours: 20,
      housingMode: 'allowance', housingAllowance: 2, companyHousing: 0,
      commute: 1.5, retirement: 0, otherBenefits: 0, holidays: 120, hoursPerDay: 8,
    },
    B: {
      monthlySalary: 32, bonusMode: 'amount', bonusMonths: 0, bonusAmount: 60,
      hasFixedOvertime: true, fixedOvertimePay: 4.5, overtimeHours: 25,
      housingMode: 'company', housingAllowance: 0, companyHousing: 4,
      commute: 1, retirement: 24, otherBenefits: 6, holidays: 115, hoursPerDay: 8,
    },
  },
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ───── 保存と復元（localStorage が使えない環境でも動くよう try/catch で囲む） ─────
function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const saved = JSON.parse(raw);
    return {
      common: { ...DEFAULTS.common, ...saved.common },
      offers: {
        A: { ...DEFAULTS.offers.A, ...saved.offers?.A },
        B: { ...DEFAULTS.offers.B, ...saved.offers?.B },
      },
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function saveState(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // プライベートブラウズなどで保存できない場合は、保存せずに計算だけ続ける
  }
}

function clearState() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 何もしない */
  }
}

// ───── フォームの組み立て ─────
function buildOfferFieldset(key) {
  const tpl = $('#offer-template');
  const node = tpl.content.firstElementChild.cloneNode(true);
  const prefix = `offer-${key.toLowerCase()}`;
  node.classList.add(prefix);
  node.dataset.offer = key;
  $('[data-slot="title"]', node).textContent = `${key}社`;

  for (const input of $$('[data-field]', node)) {
    const field = input.dataset.field;
    if (input.type === 'radio') {
      input.name = `${prefix}-${field}`;
      input.id = `${prefix}-${field}-${input.value}`;
    } else {
      input.id = `${prefix}-${field}`;
      input.name = input.id;
    }
  }
  for (const label of $$('[data-for]', node)) {
    label.htmlFor = `${prefix}-${label.dataset.for}`;
  }
  for (const hint of $$('[data-hint]', node)) {
    hint.id = `${prefix}-${hint.dataset.hint}-hint`;
    const input = $(`#${prefix}-${hint.dataset.hint}`, node);
    if (input) input.setAttribute('aria-describedby', hint.id);
  }
  for (const label of $$('[data-label]', node)) {
    label.id = `${prefix}-${label.dataset.label}-label`;
    const group = $(`[data-group="${label.dataset.label}"]`, node);
    if (group) group.setAttribute('aria-labelledby', label.id);
  }
  // 「A社 月給」のように、どちらの会社の項目か読み上げで分かるようにする
  for (const input of $$('input[type="number"]', node)) {
    const label = $(`label[for="${input.id}"]`, node);
    if (label) input.setAttribute('aria-label', `${key}社 ${label.textContent}`);
  }
  return node;
}

function writeForm(state) {
  const form = $('#calc-form');
  form.elements.age.value = state.common.age;
  form.elements.dependents.value = String(state.common.dependents);
  form.elements.healthRate.value = state.common.healthRate;
  for (const key of ['A', 'B']) {
    const fs = $(`[data-offer="${key}"]`);
    const values = state.offers[key];
    for (const input of $$('[data-field]', fs)) {
      const v = values[input.dataset.field];
      if (input.type === 'radio') input.checked = input.value === v;
      else if (input.type === 'checkbox') input.checked = Boolean(v);
      else input.value = v ?? '';
    }
    updateVisibility(fs);
  }
}

function readForm() {
  const form = $('#calc-form');
  const state = {
    common: {
      age: Number(form.elements.age.value) || 0,
      dependents: Number(form.elements.dependents.value) || 0,
      healthRate: Number(form.elements.healthRate.value) || RATES.socialInsurance.healthRate,
    },
    offers: {},
  };
  for (const key of ['A', 'B']) {
    const fs = $(`[data-offer="${key}"]`);
    const values = {};
    for (const input of $$('[data-field]', fs)) {
      const field = input.dataset.field;
      if (input.type === 'radio') {
        if (input.checked) values[field] = input.value;
      } else if (input.type === 'checkbox') {
        values[field] = input.checked;
      } else {
        values[field] = input.value === '' ? 0 : Number(input.value);
      }
    }
    state.offers[key] = { ...DEFAULTS.offers[key], ...values };
  }
  return state;
}

/** 選んだ入力方法に応じて、関係する項目だけを表示する */
function updateVisibility(fs) {
  for (const el of $$('[data-show]', fs)) {
    const [field, expected] = el.dataset.show.split('=');
    const inputs = $$(`[data-field="${field}"]`, fs);
    let current;
    if (inputs[0]?.type === 'checkbox') current = String(inputs[0].checked);
    else current = inputs.find((i) => i.checked)?.value;
    el.hidden = current !== expected;
  }
}

/** 画面の入力（万円）をロジック用（円）に変換 */
function toYen(offer) {
  const out = { ...offer };
  for (const f of MONEY_FIELDS) out[f] = Math.round((Number(offer[f]) || 0) * MAN);
  return out;
}

// ───── 表示用の整形 ─────
const yen = (v) => `${Math.round(v).toLocaleString('ja-JP')}円`;
const man = (v) => `${(Math.round(v / 1000) / 10).toLocaleString('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}万円`;
const signed = (v, fmt) => (v > 0 ? '+' : v < 0 ? '−' : '±') + fmt(Math.abs(v));

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function renderVerdict(a, b, cmp) {
  const el = $('#verdict');
  if (a.realAnnual <= 0 && b.realAnnual <= 0) {
    el.innerHTML = '<p class="verdict-label">月給などを入力すると、ここに結果が表示されます</p>';
    return;
  }
  if (cmp.winner === 'even') {
    el.innerHTML = '<p class="verdict-label">実質年収の比較</p><p class="verdict-main">A社とB社は同じです</p>';
    return;
  }
  const w = cmp.winner;
  const diff = Math.abs(cmp.annual);
  const hourly = w === 'B' ? cmp.hourly : -cmp.hourly;
  const hourlyText =
    hourly >= 0 ? `実質時給も${yen(hourly)}高い` : `ただし実質時給は${yen(-hourly)}低い（労働時間が長い）`;
  el.innerHTML = `
    <p class="verdict-label">実質年収で比べると</p>
    <p class="verdict-main"><span><span class="is-${w.toLowerCase()}">${w}社</span>が</span> <span>年間 ${escapeHtml(man(diff))}</span> <span>有利</span></p>
    <p class="verdict-sub">月あたり ${escapeHtml(man(diff / 12))}（${escapeHtml(yen(diff / 12))}）／${escapeHtml(hourlyText)}</p>`;
}

function renderBars(a, b) {
  const max = Math.max(a.realAnnual, b.realAnnual, 1);
  const pct = (v) => `${Math.max(0, (v / max) * 100).toFixed(1)}%`;
  $('#bars').innerHTML = `
    <div class="bar-row"><span>A社</span><div class="bar-track"><div class="bar-fill a" style="width:${pct(a.realAnnual)}">${man(a.realAnnual)}</div></div></div>
    <div class="bar-row"><span>B社</span><div class="bar-track"><div class="bar-fill b" style="width:${pct(b.realAnnual)}">${man(b.realAnnual)}</div></div></div>`;
}

function renderFlow(a, b, cmp) {
  const row = (cls, label, va, vb, fmt = man, note = '') =>
    `<tr class="${cls}"><th scope="row">${label}${note ? `<small>${note}</small>` : ''}</th><td>${fmt(va)}</td><td>${fmt(vb)}</td></tr>`;
  const minus = (v) => `−${man(v)}`;
  const minusYen = (v) => `−${yen(v)}`;
  const plus = (v) => `+${man(v)}`;
  const plusYen = (v) => `+${yen(v)}`;
  const hasCare = a.socialInsurance.care > 0 || b.socialInsurance.care > 0;

  $('#flow').innerHTML = `
    <div class="flow-wrap" role="region" aria-label="計算の内訳（横にスクロールできます）" tabindex="0"><table class="flow">
      <caption>額面から実質時給までの流れ（年額）</caption>
      <thead><tr><th scope="col">項目</th><th scope="col">A社</th><th scope="col">B社</th></tr></thead>
      <tbody>
        ${row('step-key', '① 額面年収', a.gross, b.gross, man, '月給×12＋賞与＋残業代＋課税手当')}
        ${row('sub', 'うち賞与', a.bonus, b.bonus, yen)}
        ${row('sub', 'うち残業代', a.overtimeAnnual, b.overtimeAnnual, yen)}
        ${row('step-minus', '② 差し引かれる額', a.deductionsTotal, b.deductionsTotal, minus, '社会保険料＋所得税＋住民税')}
        ${row('sub', '健康保険', a.socialInsurance.health, b.socialInsurance.health, minusYen)}
        ${hasCare ? row('sub', '介護保険', a.socialInsurance.care, b.socialInsurance.care, minusYen) : ''}
        ${row('sub', '子ども・子育て支援金', a.socialInsurance.childSupport, b.socialInsurance.childSupport, minusYen)}
        ${row('sub', '厚生年金', a.socialInsurance.pension, b.socialInsurance.pension, minusYen)}
        ${row('sub', '雇用保険', a.socialInsurance.employment, b.socialInsurance.employment, minusYen)}
        ${row('sub', '所得税（復興税含む）', a.incomeTax.tax, b.incomeTax.tax, minusYen)}
        ${row('sub', '住民税（目安）', a.residentTax.tax, b.residentTax.tax, minusYen)}
        ${row('step-key', '③ 手取り年収', a.takeHome, b.takeHome)}
        ${row('step-plus', '④ 福利厚生の上乗せ', a.benefits.total, b.benefits.total, plus, '非課税の福利厚生')}
        ${row('sub', '借上げ社宅の会社負担', a.benefits.companyHousing, b.benefits.companyHousing, plusYen)}
        ${row('sub', 'DC・退職金の積立', a.benefits.retirement, b.benefits.retirement, plusYen)}
        ${row('sub', 'その他の福利厚生', a.benefits.other, b.benefits.other, plusYen)}
        ${row('step-key', '⑤ 実質年収', a.realAnnual, b.realAnnual, man, '手取り＋福利厚生')}
        ${row('sub', '月あたり', a.realMonthly, b.realMonthly, yen)}
        ${row('', '年間総労働時間', a.totalHours, b.totalHours, (v) => `${Math.round(v).toLocaleString('ja-JP')}時間`, '所定＋残業')}
        ${row('step-key', '⑥ 実質時給', a.realHourly, b.realHourly, yen, '実質年収÷年間総労働時間')}
        <tr><th scope="row">差額（B社−A社）</th><td class="diff" colspan="2">年額 ${signed(cmp.annual, man)}／月額 ${signed(cmp.monthly, yen)}／時給 ${signed(cmp.hourly, yen)}</td></tr>
      </tbody>
    </table></div>`;
}

function update() {
  const state = readForm();
  for (const fs of $$('[data-offer]')) updateVisibility(fs);
  const a = calcOffer(toYen(state.offers.A), state.common, RATES);
  const b = calcOffer(toYen(state.offers.B), state.common, RATES);
  const cmp = compareOffers(a, b);
  renderVerdict(a, b, cmp);
  renderBars(a, b);
  renderFlow(a, b, cmp);
  saveState(state);
}

function init() {
  const container = $('#offers');
  if (!container) return;
  container.append(buildOfferFieldset('A'), buildOfferFieldset('B'));
  writeForm(loadState());

  const form = $('#calc-form');
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', (e) => e.preventDefault());
  $('#reset-button').addEventListener('click', () => {
    clearState();
    writeForm(structuredClone(DEFAULTS));
    update();
  });
  update();
}

init();
