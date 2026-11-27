// 到着時刻の検討（★2026-11-27）の計算
// 1車目の積込開始から、車を順に積み（入替をはさむ）、便の車が全部積み終わったら一緒に出発し、浜に着く――を
// 実績（納品完了の便だけ）の中央値（目安）と、4回に1回はこれより遅い時間（遅め）で積み上げる。
//   ・今シーズン優先：今シーズン（9月〜）の記録が十分にあればそれを使い、少なければ直近2年の記録を使う
//   ・補正：保存した検討の見込みと実績の差（1車目の積込開始からの時間で比べる）を、ルートごとに積み重ねて足す
//   ・実績から作る数字は保存しない。毎回その場で計算する（実績を直せば、次に開いたときから反映される）
import { minutesBetween, hm } from './travel';
import { bandOf, buildLoading } from './loadingTimes';
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

// 記録が無いときの仮の値（画面と根拠に「仮」と出す）
export const DEFAULTS = { perTonMin: 20, changeMin: 5, departWaitMin: 10 };
// 今シーズンの記録をこれ以上なら使う
const SEASON_MIN = { band: 3, perTon: 5, change: 5, wait: 5, travel: 3, start: 3 };
// 補正をかける件数
export const CORR_MIN = 3;

/** その日が入るシーズンの始まり（9月1日） */
export function seasonStartOf(dateStr) {
  const y = Number(String(dateStr).slice(0, 4));
  const m = Number(String(dateStr).slice(5, 7));
  return `${m >= 9 ? y : y - 1}-09-01`;
}

/** 今シーズンが十分なら今シーズン、だめなら直近2年。{ median, q3, n, src } または null */
function pick(sea, all, minN) {
  if (sea && sea.n >= minN) return { median: sea.median, q3: sea.q3, n: sea.n, src: '今シーズン' };
  if (all && all.n >= 1) return { median: all.median, q3: all.q3, n: all.n, src: '直近2年' };
  return null;
}

const routeKey = (ikeba, point) => `${ikeba}|${point}`;

/**
 * 補正：保存した検討の見込みと、実績（納品完了の便）の差
 *   studies：getArrivalStudies、arrivalRows：getArrivalTimes を enrich したもの
 * 戻り値：{ byRoute: Map(池場|浜 → {n, median}), items: [{…, 差, 使う, 理由}] }
 */
export function computeCorrections(studies, arrivalRows) {
  const byPlan = new Map((arrivalRows || []).map((r) => [r['搬入予定ID'], r]));
  const items = [];
  (studies || []).forEach((st) => {
    (st['便'] || []).forEach((r) => {
      const base = { 積込日: st['積込日'], 池場ID: st['池場ID'], 配送先ID: r['配送先ID'], 搬入予定ID: r['搬入予定ID'], 順番: r['順番'], 見込み分: r['開始からの見込み分'] };
      if (!r['使える']) return items.push({ ...base, 使う: false, 理由: r['理由'] });
      if (r['開始からの見込み分'] === null || r['開始からの見込み分'] === undefined) return items.push({ ...base, 使う: false, 理由: '見込みが計算できていない' });
      const a = byPlan.get(r['搬入予定ID']);
      if (!a) return items.push({ ...base, 使う: false, 理由: '浜到着の実績なし' });
      if (Number(a['便の順番']) !== Number(r['順番'])) return items.push({ ...base, 使う: false, 理由: '便の順番が違う' });
      const actual = minutesBetween(a['1車目の積込開始'], a['浜到着']);
      if (actual === null || actual <= 0 || actual > 12 * 60) return items.push({ ...base, 使う: false, 理由: '時刻の入力が足りない' });
      items.push({ ...base, 実績分: actual, 差: actual - r['開始からの見込み分'], 使う: true, 理由: '' });
    });
  });
  const m = new Map();
  items.filter((x) => x.使う).forEach((x) => {
    const k = routeKey(x.池場ID, x.配送先ID);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x.差);
  });
  const byRoute = new Map(Array.from(m.entries()).map(([k, v]) => [k, quart(v)]));
  return { byRoute, items };
}

/**
 * 記録から、その池場・その日付のための値をそろえる
 *   hist：{ loadingRuns, travel, arrival（enrich 済み）, studies }
 */
export function makeModel(hist, ikebaId, date) {
  const ss = seasonStartOf(date || new Date().toISOString().slice(0, 10));
  const inSeason = (d) => String(d) >= ss;
  const gAll = buildLoading(hist.loadingRuns || []).find((g) => g.ikebaId === ikebaId) || null;
  const gSea = buildLoading((hist.loadingRuns || []).filter((r) => inSeason(r['積込日']))).find((g) => g.ikebaId === ikebaId) || null;

  const own = (hist.travel || []).filter((x) => x['池場ID'] === ikebaId && !x['積み分け']);
  const waitOf = (list) =>
    quart(list.map((x) => minutesBetween(x['最後の積込終了'], x['出発'])).filter((d) => d !== null && d >= 0 && d <= 120));
  const travelOf = (list, point) => quart(list.filter((x) => x['配送先ID'] === point).map((x) => x['所要分']));
  const ownSea = own.filter((x) => inSeason(x['積込日']));
  const kindOf = (g, label) => g?.start?.kinds?.find((k) => k.label === label)?.s || null;

  return {
    ikebaId,
    seasonStart: ss,
    bandsSea: new Map((gSea?.bands || []).map((b) => [b.kg, b.s])),
    bandsAll: new Map((gAll?.bands || []).map((b) => [b.kg, b.s])),
    perTon: pick(gSea?.perTon, gAll?.perTon, SEASON_MIN.perTon),
    change: pick(gSea?.change, gAll?.change, SEASON_MIN.change),
    wait: pick(waitOf(ownSea), waitOf(own), SEASON_MIN.wait),
    travelFor: (point) => pick(travelOf(ownSea, point), travelOf(own, point), SEASON_MIN.travel),
    startUsual: pick(gSea?.start?.all, gAll?.start?.all, SEASON_MIN.start),
    startSnow: pick(kindOf(gSea, '除雪あり'), kindOf(gAll, '除雪あり'), SEASON_MIN.start),
    corr: computeCorrections(hist.studies, hist.arrival).byRoute,
  };
}

const srcText = (x) => `${x.src} ${x.n}件`;

/** 1台の積込時間 {med, late, basis} */
function loadDur(model, kg) {
  const b = bandOf(kg);
  const sea = b ? model.bandsSea.get(b) : null;
  if (sea && sea.n >= SEASON_MIN.band) return { med: sea.median, late: sea.q3, basis: `${b.toLocaleString()}kgの記録（今シーズン ${sea.n}件）` };
  const all = b ? model.bandsAll.get(b) : null;
  if (all && all.n >= 2) return { med: all.median, late: all.q3, basis: `${b.toLocaleString()}kgの記録（直近2年 ${all.n}件）` };
  const k = num(kg) / 1000;
  if (model.perTon) {
    return {
      med: Math.round(model.perTon.median * k),
      late: Math.round(model.perTon.q3 * k),
      basis: `1tあたり ${hm(model.perTon.median)}で計算（${srcText(model.perTon)}）`,
    };
  }
  return { med: Math.round(DEFAULTS.perTonMin * k), late: Math.round(DEFAULTS.perTonMin * 1.25 * k), basis: `記録なし（仮に1t ${DEFAULTS.perTonMin}分）`, guess: true };
}

/**
 * 計算する
 *   runs：[{ 配送先ID, vehicles: [{kg}], travelOvr }]（積む順）
 *   start：1車目の積込開始 "HH:mm"
 * 戻り値：{ runs: [{ vehicles: [{start, end, basis}], depart, departLate, arriveRaw, arrive, arriveLate, travel, corr }], common: [根拠の行] }
 *   時刻は0時からの分。移動時間が分からないときは arrive が null
 */
export function simulate(model, runs, start) {
  const s0 = minOf(start);
  if (s0 === null || !model) return { runs: [], common: [] };
  let t = s0;
  let tl = s0;
  const change = model.change ? { med: model.change.median, late: model.change.q3 } : { med: DEFAULTS.changeMin, late: DEFAULTS.changeMin * 2 };
  const wait = model.wait ? { med: model.wait.median, late: model.wait.q3 } : { med: DEFAULTS.departWaitMin, late: DEFAULTS.departWaitMin * 2 };
  const common = [
    `記録は納品完了（完了確認済み）の便だけ。今シーズン（${model.seasonStart.slice(0, 4)}年9月〜）の記録が十分にあればそれを、少なければ直近2年の記録を使う`,
    `車の入替：${model.change ? `${hm(change.med)}（遅め ${hm(change.late)}）／${srcText(model.change)}` : `記録なし（仮に${DEFAULTS.changeMin}分）`}`,
    `積み終わり→出発：${model.wait ? `${hm(wait.med) || '0分'}（遅め ${hm(wait.late) || '0分'}）／${srcText(model.wait)}` : `記録なし（仮に${DEFAULTS.departWaitMin}分）`}`,
  ];
  let first = true;
  const out = runs.map((r) => {
    const vs = (r.vehicles || [])
      .filter((v) => num(v.kg) > 0)
      .map((v) => {
        if (!first) {
          t += change.med;
          tl += change.late;
        }
        first = false;
        const d = loadDur(model, v.kg);
        const row = { start: t, startLate: tl, end: t + d.med, endLate: tl + d.late, basis: d.basis, guess: !!d.guess, kg: num(v.kg) };
        t = row.end;
        tl = row.endLate;
        return row;
      });
    if (vs.length === 0) return { vehicles: [], depart: null, arrive: null };
    const depart = vs[vs.length - 1].end + wait.med;
    const departLate = vs[vs.length - 1].endLate + wait.late;
    const ovr = num(r.travelOvr);
    const tq = r.配送先ID ? model.travelFor(r.配送先ID) : null;
    let travel = null;
    if (ovr > 0) travel = { med: ovr, late: ovr, basis: `入力した${ovr}分` };
    else if (tq) travel = { med: tq.median, late: tq.q3, basis: `${hm(tq.median)}（遅め ${hm(tq.q3)}）／${srcText(tq)}` };
    if (!travel) return { vehicles: vs, depart, departLate, arrive: null, arriveRaw: null, travel: null, corr: null };
    const c = model.corr.get(routeKey(model.ikebaId, r.配送先ID));
    const corr = c && c.n >= CORR_MIN ? c.median : 0;
    const arriveRaw = depart + travel.med;
    return {
      vehicles: vs,
      depart,
      departLate,
      arriveRaw,
      arrive: arriveRaw + corr,
      arriveLate: departLate + travel.late + corr,
      travel,
      corr: c ? { n: c.n, median: c.median, applied: c.n >= CORR_MIN } : null,
      offsetRaw: arriveRaw - s0,
    };
  });
  return { runs: out, common };
}

/** 補正の説明 */
export function corrText(c) {
  if (!c) return '補正なし（このルートで、検討と実績を比べられた便がまだありません）';
  const d = c.median === 0 ? '差なし' : c.median > 0 ? `見込みより${hm(c.median)}遅い` : `見込みより${hm(-c.median)}早い`;
  return c.applied
    ? `補正 ${c.median >= 0 ? '＋' : '−'}${hm(Math.abs(c.median)) || '0分'}（これまでの検討と実績：${d}・${c.n}件）`
    : `補正なし（検討と実績を比べられた便が${c.n}件。${CORR_MIN}件になったら補正します）`;
}

/** 5分単位に切り上げ */
export const ceil5 = (m) => Math.ceil(m / 5) * 5;
