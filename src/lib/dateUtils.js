const DOW_JP = ['日', '月', '火', '水', '木', '金', '土'];

export function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function toDateStr(date) {
  // yyyy-MM-dd 形式（Asia/Tokyoのローカル時刻ベース。GASにもこの形式で送る）
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatJP(date) {
  // M月D日（曜）
  const d = new Date(date);
  return `${d.getMonth() + 1}月${d.getDate()}日（${DOW_JP[d.getDay()]}）`;
}

/** 予定表の表用：M/D（曜） 例）11/1（土）★2026-09-24追加 */
export function formatSlashJP(date) {
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}（${DOW_JP[d.getDay()]}）`;
}

export function sameDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export function parseDateStr(val) {
  // GASから返る "yyyy-MM-dd" 文字列をDateに変換する
  if (!val) return null;
  return new Date(String(val).replace(/\//g, '-'));
}

/** "HHmm"（4桁・コロン無し）を "HH:mm" に整形する。時刻入力の自動整形用 */
export function formatTimeDigits(digits) {
  const d = String(digits).replace(/[^0-9]/g, '').padStart(4, '0').slice(-4);
  return `${d.slice(0, 2)}:${d.slice(2, 4)}`;
}

export function formatMonthJP(date) {
  const d = new Date(date);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

export function getDaysInMonth(year, month) {
  // month: 0始まり
  return new Date(year, month + 1, 0).getDate();
}

export function getFirstDayOfWeek(year, month) {
  return new Date(year, month, 1).getDay();
}

/**
 * GASから返る日時を "yyyy年M月d日 HH:mm" 表示用に整形する。
 * 本来は "yyyy-MM-dd HH:mm:ss" の文字列で返る想定だが、スプレッドシート側の
 * セル書式が「書式なしテキスト」になっていない行が混ざっていると、GASが
 * Date型をそのままJSON化してしまい "2026-09-15T04:14:53.000Z" のような
 * ISO形式（Tを挟む・UTC時刻）で来ることがある。どちらの形式でも正しく
 * 解釈できるようにする（new Dateはブラウザのローカルタイムゾーンで
 * 年月日・時刻を取り出すため、日本国内で使う前提であればどちらの形式でも
 * 結果的に正しい日本時間が表示される）。
 */
/** 種苗の搬入シーズン（毎年11/1〜12/31）の期間を返す。年をまたいでも自動的に「今年」になる */
export function defaultSeasonRange() {
  const y = today().getFullYear();
  return { from: `${y}-11-01`, to: `${y}-12-31` };
}

/** 指定した年月（1〜12）の1日〜末日の範囲を返す */
export function monthRange(year, month) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

export function formatDateTimeJP(str) {
  if (!str) return null;
  const s = String(str);
  const d = s.includes('T') ? new Date(s) : new Date(s.replace(' ', 'T'));
  if (isNaN(d.getTime())) return s; // 万一解釈できなければ、元の文字列をそのまま表示する
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}年${m}月${day}日 ${hh}:${mm}`;
}

/**
 * 印刷（PDF保存）用に、一時的にページのタイトルを差し替えてから印刷する。
 * ブラウザは「PDFに保存」のファイル名にページのタイトルを使うため（★2026-09-24）。
 */
export function printWithTitle(title) {
  const original = document.title;
  document.title = title;
  const restore = () => {
    document.title = original;
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  window.print();
  setTimeout(restore, 3000); // afterprintが動かないブラウザ向けの保険
}

/** 印刷ファイル名用に "yyyyMMdd" を作る（更新日時が無ければ今日の日付） */
export function fileDateStamp(dateTimeStr) {
  const src = dateTimeStr || toDateStr(today());
  return String(src).replace(/[^0-9]/g, '').slice(0, 8);
}
