// 到着時刻の検討（★2026-11-27）の計算
// 1車目の積込開始から、車を順に積み（入替をはさむ）、便の車が全部積み終わったら一緒に出発し、浜に着く――を
// 今までの記録の中央値（目安）と、4回に1回はこれより遅い時間（遅め）で積み上げる。
import { minutesBetween } from './travel';
import { bandOf } from './loadingTimes';
import { num } from './planUtils';

const minOf = (t) => {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** 0を含めてよい中央値・75%（出発までの待ちなど） */
export function quart(values) {
  const v = values.filter((x) => typeof x === 'number' && !isNaN(x)).sort((a, b) => a - b);
  const n = v.length;
  if (!n) return null;
  const q = (p) => {
    const pos = (n - 1) * p;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return v[lo] + (v[hi] - v[lo]) * (pos - lo);
  };
  return { n, median: Math.round(q(0.5)), q3: Math.round(q(0.75)) };
}

// 記録が無いときの仮の値（画面で「仮」と出す）
export const DEFAULTS = { perTonMin: 20, changeMin: 5, departWaitMin: 10 };

/**
 * 記録から、池場ごと・ルートごとの値を作る
 *   loadGroup：buildLoading の池場1件（bands, perTon, change）
 *   travelSamples：getTravelTimes（太協）
 *   arrivalRows：getArrivalTimes を enrich したもの（答え合わせ用）
 */
export function makeModel(loadGroup, travelSamples, ikebaId) {
  const own = (travelSamples || []).filter((x) => x['池場ID'] === ikebaId && !x['積み分け']);
  const wait = quart(
    own
      .map((x) => minutesBetween(x['最後の積込終了'], x['出発']))
      .filter((d) => d !== null && d >= 0 && d <= 120)
  );
  const travel = new Map();
  own.forEach((x) => {
    if (!travel.has(x['配送先ID'])) travel.set(x['配送先ID'], []);
    travel.get(x['配送先ID']).push(x['所要分']);
  });
  const travelQ = new Map(Array.from(travel.entries()).map(([k, v]) => [k, quart(v)]));
  return {
    bands: new Map((loadGroup?.bands || []).map((b) => [b.kg, b.s])),
    perTon: loadGroup?.perTon || null,
    change: loadGroup?.change || null,
    wait,
    travel: travelQ,
  };
}

/** 1台の積込時間 {med, late, src}：src＝'数量' | '1t' | '仮' */
function loadDur(model, kg) {
  const b = bandOf(kg);
  const s = b ? model.bands.get(b) : null;
  if (s && s.n >= 2) return { med: s.median, late: s.q3, src: '数量' };
  const k = num(kg) / 1000;
  if (model.perTon) return { med: Math.round(model.perTon.median * k), late: Math.round(model.perTon.q3 * k), src: '1t' };
  return { med: Math.round(DEFAULTS.perTonMin * k), late: Math.round(DEFAULTS.perTonMin * 1.25 * k), src: '仮' };
}

/**
 * 計算する
 *   runs：[{ 配送先ID, vehicles: [{車輌ID, kg}], travelOvr }]（積む順）
 *   start：1車目の積込開始 "HH:mm"
 * 戻り値：[{ vehicles: [{start, end, startLate, endLate, src}], depart, departLate, arrive, arriveLate, travelSrc, notes }]
 *   時刻は0時からの分。計算できないときは arrive が null
 */
export function simulate(model, runs, start) {
  let t = minOf(start);
  let tl = t;
  if (t === null) return [];
  const change = model.change ? { med: model.change.median, late: model.change.q3 } : { med: DEFAULTS.changeMin, late: DEFAULTS.changeMin * 2 };
  const wait = model.wait ? { med: model.wait.median, late: model.wait.q3 } : { med: DEFAULTS.departWaitMin, late: DEFAULTS.departWaitMin * 2 };
  let first = true;
  return runs.map((r) => {
    const vs = (r.vehicles || []).filter((v) => num(v.kg) > 0).map((v) => {
      if (!first) {
        t += change.med;
        tl += change.late;
      }
      first = false;
      const d = loadDur(model, v.kg);
      const row = { start: t, startLate: tl, end: t + d.med, endLate: tl + d.late, src: d.src };
      t = row.end;
      tl = row.endLate;
      return row;
    });
    if (vs.length === 0) return { vehicles: [], depart: null, arrive: null };
    const lastEnd = vs[vs.length - 1].end;
    const lastEndLate = vs[vs.length - 1].endLate;
    const depart = lastEnd + wait.med;
    const departLate = lastEndLate + wait.late;
    const ovr = num(r.travelOvr);
    const tq = model.travel.get(r.配送先ID);
    let travel = null;
    let travelSrc = '';
    if (ovr > 0) {
      travel = { med: ovr, late: ovr };
      travelSrc = '入力';
    } else if (tq) {
      travel = { med: tq.median, late: tq.q3 };
      travelSrc = `記録${tq.n}件`;
    }
    return {
      vehicles: vs,
      depart,
      departLate,
      arrive: travel ? depart + travel.med : null,
      arriveLate: travel ? departLate + travel.late : null,
      travel,
      travelSrc,
    };
  });
}

/** 5分単位に切り上げ */
export const ceil5 = (m) => Math.ceil(m / 5) * 5;
