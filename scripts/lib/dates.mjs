// 日付ユーティリティ（すべて UTC の 'YYYY-MM-DD' 文字列で扱う）

const DAY = 86400000;

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function fmtDate(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(s, n) {
  return fmtDate(new Date(parseDate(s).getTime() + n * DAY));
}

export function diffDays(a, b) {
  return Math.round((parseDate(a) - parseDate(b)) / DAY);
}

/** 同じ月日の n 年前（2/29 は 2/28 に寄せる） */
export function shiftYears(s, years) {
  const [y, m, d] = s.split('-').map(Number);
  const ty = y + years;
  const last = new Date(Date.UTC(ty, m, 0)).getUTCDate();
  return fmtDate(new Date(Date.UTC(ty, m - 1, Math.min(d, last))));
}

/** 'YYYY-MM-DD' → 'YYYY年M月D日' */
export function jaDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];
export function jaWeekday(s) {
  return WEEKDAYS_JA[parseDate(s).getUTCDay()];
}

// ---- 米国の祝日と夏時間 ----

/** その月の第 n 回目の曜日（weekday: 0=日）。n=-1 で最終 */
function nthWeekday(year, month, weekday, n) {
  if (n > 0) {
    const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
    return fmtDate(new Date(Date.UTC(year, month - 1, day)));
  }
  const lastDate = new Date(Date.UTC(year, month, 0));
  const back = (lastDate.getUTCDay() - weekday + 7) % 7;
  return fmtDate(new Date(lastDate.getTime() - back * DAY));
}

function observed(s) {
  const wd = parseDate(s).getUTCDay();
  if (wd === 6) return addDays(s, -1);
  if (wd === 0) return addDays(s, 1);
  return s;
}

/** 米連邦政府の祝日（振替後の日付） */
export function usFederalHolidays(year) {
  const list = [
    observed(`${year}-01-01`),
    nthWeekday(year, 1, 1, 3), // キング牧師記念日
    nthWeekday(year, 2, 1, 3), // ワシントン誕生日
    nthWeekday(year, 5, 1, -1), // メモリアルデー
    observed(`${year}-07-04`),
    nthWeekday(year, 9, 1, 1), // レーバーデー
    nthWeekday(year, 10, 1, 2), // コロンブスデー
    observed(`${year}-11-11`),
    nthWeekday(year, 11, 4, 4), // 感謝祭
    observed(`${year}-12-25`),
  ];
  if (year >= 2021) list.push(observed(`${year}-06-19`)); // ジューンティーンス
  // 翌年元日の振替が12/31になる場合
  const nextNewYear = observed(`${year + 1}-01-01`);
  if (nextNewYear.startsWith(String(year))) list.push(nextNewYear);
  return new Set(list);
}

export function isUsHoliday(s) {
  return usFederalHolidays(Number(s.slice(0, 4))).has(s);
}

/** 米東部時間の夏時間か（3月第2日曜〜11月第1日曜。日付単位で判定） */
export function isUsEasternDst(s) {
  const y = Number(s.slice(0, 4));
  const start = nthWeekday(y, 3, 0, 2);
  const end = nthWeekday(y, 11, 0, 1);
  return s >= start && s < end;
}

/** 米東部時間の日時 → UTC の Date */
export function easternToUtc(s, hh, mm) {
  const offset = isUsEasternDst(s) ? 4 : 5;
  const d = parseDate(s);
  return new Date(d.getTime() + (hh + offset) * 3600000 + mm * 60000);
}

/** UTC Date → 日本時間の表示用 { date:'YYYY-MM-DD', time:'HH:MM' } */
export function toJst(date) {
  const j = new Date(date.getTime() + 9 * 3600000);
  const iso = j.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/**
 * 集計週（金曜終わり）のデータの発表予定。
 * 通常は翌週水曜 10:30（米東部時間）。発表週の月〜水に連邦祝日があれば木曜 11:00 に遅れる。
 * 実際の日程はEIAの公式スケジュールで変更されることがある。
 */
export function releaseSchedule(weekEnding) {
  const wed = addDays(weekEnding, 5);
  const delayed = [addDays(weekEnding, 3), addDays(weekEnding, 4), wed].some(isUsHoliday);
  const etDate = delayed ? addDays(weekEnding, 6) : wed;
  const [hh, mm] = delayed ? [11, 0] : [10, 30];
  const utc = easternToUtc(etDate, hh, mm);
  const jst = toJst(utc);
  return {
    weekEnding,
    etDate,
    etTime: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
    utc: utc.toISOString(),
    jstDate: jst.date,
    jstTime: jst.time,
    delayed,
  };
}

/** 現在時刻 now の時点で、発表済みのはずの最新の集計週（金曜） */
export function latestExpectedWeekEnding(now = new Date()) {
  const today = fmtDate(now);
  const wd = parseDate(today).getUTCDay();
  let friday = addDays(today, -((wd - 5 + 7) % 7));
  for (let i = 0; i < 4; i++) {
    if (new Date(releaseSchedule(friday).utc) <= now) return friday;
    friday = addDays(friday, -7);
  }
  return friday;
}
