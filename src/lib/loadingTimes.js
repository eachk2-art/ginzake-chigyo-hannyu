// 積込時間の傾向（★2026-11-27）：池場ごとに「この数量なら何分」「車の入替は何分」を、記録から出す
// 配車を考えるときの参考（予想を固く決めるものではない）
import { stats, minutesBetween } from './travel';
import { num } from './planUtils';

export const BAND_KG = 250; // 数量は250kg単位にまとめる（1,000kg・1,250kg・1,500kg…）

/** 予定数量を250kg単位に丸める */
export function bandOf(kg) {
  const k = num(kg);
  if (k <= 0) return null;
  return Math.max(BAND_KG, Math.round(k / BAND_KG) * BAND_KG);
}

const minOf = (t) => {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * 運行の一覧（getLoadingTimes）を、池場ごとにまとめる
 * 戻り値：[{ ikebaId, bands: [{kg, s}], perTon: s, change: s, days: [...], runs }]
 *  ・複数の池場から積んだ運行は、数量ごとの時間には入れない（最初の池場の日の流れには出す）
 */
export function buildLoading(runs) {
  const byIkeba = new Map();
  (runs || []).forEach((r) => {
    const ik = (r['池場ID'] || [])[0];
    if (!ik) return;
    if (!byIkeba.has(ik)) byIkeba.set(ik, []);
    byIkeba.get(ik).push(r);
  });

  return Array.from(byIkeba.entries()).map(([ikebaId, list]) => {
    const single = list.filter((r) => (r['池場ID'] || []).length === 1);
    // 数量ごとの積込時間
    const bandMap = new Map();
    const perTon = [];
    single.forEach((r) => {
      const m = r['積込の所要分'];
      const b = bandOf(r['予定数量kg']);
      if (!m || m <= 0 || m > 240 || !b) return;
      if (!bandMap.has(b)) bandMap.set(b, []);
      bandMap.get(b).push(m);
      perTon.push((m * 1000) / num(r['予定数量kg']));
    });
    const bands = Array.from(bandMap.entries())
      .map(([kg, vals]) => ({ kg, s: stats(vals) }))
      .sort((a, b) => a.kg - b.kg);

    // 日ごとの流れと、車の入替（前の車の積込終了 → 次の車の積込開始）
    const byDate = new Map();
    list.forEach((r) => {
      if (!byDate.has(r['積込日'])) byDate.set(r['積込日'], []);
      byDate.get(r['積込日']).push(r);
    });
    const changes = [];
    const days = Array.from(byDate.entries())
      .map(([date, rs]) => {
        const sorted = [...rs].sort((a, b) => (minOf(a['積込開始']) ?? 9999) - (minOf(b['積込開始']) ?? 9999));
        const rows = sorted.map((r, i) => {
          const prev = sorted[i - 1];
          const gap = prev ? minutesBetween(prev['積込終了'], r['積込開始']) : null;
          const ok = gap !== null && gap >= 0 && gap <= 90; // 90分を超える間は、休憩などとして入替に数えない
          if (ok) changes.push(gap);
          return { ...r, 入替分: ok ? gap : null };
        });
        const starts = rows.map((r) => minOf(r['積込開始'])).filter((x) => x !== null);
        const ends = rows.map((r) => minOf(r['積込終了'])).filter((x) => x !== null);
        const first = starts.length ? Math.min(...starts) : null;
        const last = ends.length ? Math.max(...ends) : null;
        const dayChanges = rows.map((r) => r.入替分).filter((x) => x !== null);
        return {
          date,
          rows,
          vehicles: new Set(rows.map((r) => r['車輌ID'])).size,
          runs: rows.length,
          plannedKg: rows.reduce((s, r) => s + num(r['予定数量kg']), 0),
          weighedKg: rows.reduce((s, r) => s + num(r['計量合計kg']), 0),
          first: rows.find((r) => minOf(r['積込開始']) === first)?.['積込開始'] || '',
          last: rows.find((r) => minOf(r['積込終了']) === last)?.['積込終了'] || '',
          span: first !== null && last !== null && last > first ? last - first : null,
          changeMedian: stats(dayChanges)?.median ?? null,
          weather: rows.find((r) => r['天候'])?.['天候'] || '',
          waterTemp: rows.find((r) => r['池の水温'] !== '')?.['池の水温'] || '',
        };
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    return { ikebaId, bands, perTon: stats(perTon), change: stats(changes), days, runs: list };
  });
}
