// 到着の見込み（★2026-11-27）の計算
//   ・遅れ＝実際の浜到着 − 連絡した到着予定（前日までに決めていた時刻）。マイナスは早く着いた
//   ・1車目の開始からの時間＝その日その池場の1車目の積込開始 → 浜到着
//   ・当日の変更＝当日になって到着予定を動かした分（プラスは遅らせた）
import { stats, minutesBetween } from './travel';
import { snowKind } from './loadingTimes';

const minOf = (t) => {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** a → b の差（分、符号つき）。日またぎは±12時間の範囲に直す */
export function signedMinutes(a, b) {
  const x = minOf(a);
  const y = minOf(b);
  if (x === null || y === null) return null;
  let d = y - x;
  if (d > 720) d -= 1440;
  if (d < -720) d += 1440;
  return d;
}

/** 分（0時から）→ "6:30" */
export function clock(min) {
  if (min === null || min === undefined || isNaN(min)) return '';
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** 符号つきの分 → 「15分遅れ」「20分早い」「予定どおり」 */
export function lateText(d) {
  if (d === null || d === undefined) return '';
  if (d === 0) return '予定どおり';
  const a = Math.abs(d);
  const t = a >= 60 ? `${Math.floor(a / 60)}時間${a % 60 ? `${a % 60}分` : ''}` : `${a}分`;
  return d > 0 ? `${t}遅れ` : `${t}早い`;
}

export const LATE_BUCKETS = [
  { key: 'early30', label: '30分以上早い', test: (d) => d <= -30 },
  { key: 'early', label: '早い（30分以内）', test: (d) => d < 0 && d > -30 },
  { key: 'ok', label: '予定〜15分遅れ', test: (d) => d >= 0 && d <= 15 },
  { key: 'late15', label: '15〜30分遅れ', test: (d) => d > 15 && d <= 30 },
  { key: 'late30', label: '30分以上遅れ', test: (d) => d > 30 },
];

export const orderLabel = (n) => (!n ? '—' : n >= 3 ? '3便目以降' : `${n}便目`);

/** 1件ずつに計算した値を足す */
export function enrich(rows) {
  return (rows || []).map((x) => {
    const announced = x['前日までの到着予定'] || x['到着予定'] || '';
    const late = announced ? signedMinutes(announced, x['浜到着']) : null;
    const ff = minutesBetween(x['1車目の積込開始'], x['浜到着']);
    const changes = x['当日の変更'] || [];
    const finalEta = changes.length ? changes[changes.length - 1]['到着予定'] : '';
    const dayShift = changes.length && announced && finalEta ? signedMinutes(announced, finalEta) : null;
    return {
      ...x,
      announced,
      late,
      fromFirst: ff !== null && ff > 0 && ff < 12 * 60 ? ff : null,
      dayShift,
      kind: snowKind(x['除雪'], x['天候']),
    };
  });
}

/** 遅れの区分ごとの件数：{ n, counts: {key: 件数} } */
export function lateCounts(list) {
  const v = list.filter((x) => x.late !== null);
  const counts = {};
  LATE_BUCKETS.forEach((b) => {
    counts[b.key] = v.filter((x) => b.test(x.late)).length;
  });
  return { n: v.length, counts };
}

/**
 * ルート（池場→浜）×便の順番ごとの「1車目の開始から浜到着まで」
 * 戻り値：[{ key, ikeba, point, rows: [{order, s}] , starts }]
 *   starts … その池場の1車目の積込開始（日ごと）を、区分ごとに中央値にしたもの {全体, 除雪あり, ...}
 */
export function routeTable(list) {
  const m = new Map();
  list.forEach((x) => {
    const k = `${x['池場ID']}|${x['配送先ID']}`;
    if (!m.has(k)) m.set(k, { key: k, ikeba: x['池場ID'], point: x['配送先ID'], list: [] });
    m.get(k).list.push(x);
  });
  return Array.from(m.values()).map((r) => {
    const om = new Map();
    r.list.forEach((x) => {
      if (x.fromFirst === null) return;
      const o = orderLabel(x['便の順番']);
      if (!om.has(o)) om.set(o, []);
      om.get(o).push(x.fromFirst);
    });
    const rows = Array.from(om.entries())
      .map(([order, vals]) => ({ order, s: stats(vals) }))
      .filter((x) => x.s)
      .sort((a, b) => a.order.localeCompare(b.order, 'ja'));
    return { ...r, rows };
  });
}

/** 池場ごとの1車目の積込開始（日ごとに1件）：{ all, 区分名: s } */
export function startsByIkeba(list) {
  const m = new Map();
  list.forEach((x) => {
    const t = minOf(x['1車目の積込開始']);
    if (t === null) return;
    const k = `${x['池場ID']}|${x['積込日']}`;
    if (!m.has(k)) m.set(k, { ikeba: x['池場ID'], t, kind: x.kind });
  });
  const out = {};
  Array.from(m.values()).forEach((d) => {
    if (!out[d.ikeba]) out[d.ikeba] = { all: [], 雪以外: [], '雪（除雪なし）': [], 除雪あり: [] };
    out[d.ikeba].all.push(d.t);
    out[d.ikeba][d.kind].push(d.t);
  });
  Object.keys(out).forEach((k) => {
    Object.keys(out[k]).forEach((j) => {
      out[k][j] = stats(out[k][j]);
    });
  });
  return out;
}
