// 全体予定（生産者別）（★2026-11-25）：担当者のExcel「全体予定」と同じ並び
//   行：日付　列：生産者ごとに「池場・数量（t）」、右に「計」と「備考」、下に「計」「目標」「差」
//   搬入予定（親）だけから作るので、車輌が決まっていなくても出せる
import { ikebaBaseName, pondNameOnly } from './masterLookup';
import { num } from './planUtils';
import { dateList } from './haisha';

function pondLabel(masters, p) {
  const name = pondNameOnly(ikebaBaseName(masters, p['池場ID']));
  const o = p['由来池場ID'] && p['由来池場ID'] !== p['池場ID'] ? pondNameOnly(ikebaBaseName(masters, p['由来池場ID'])) : '';
  return o ? `${name}（${o}）` : name;
}

/**
 * tree：getPlanTree の結果、from・to：期間
 * 戻り値：{ kaimens, days: [{date, cells: {海面業者ID: {pond, kg, stopped}}, totalKg, note}], totals: {海面業者ID: kg}, grand }
 */
export function buildZentai(masters, tree, from, to) {
  const kaimens = masters?.海面業者 || [];
  const byDate = new Map();
  (tree || []).forEach((day) => {
    day['池場'].forEach((ik) => {
      ik['親'].forEach((p) => {
        if (p['予定状態'] === '取消') return;
        if (!byDate.has(day['日付'])) byDate.set(day['日付'], []);
        byDate.get(day['日付']).push(p);
      });
    });
  });

  const totals = {};
  const days = dateList(from, to).map((date) => {
    const plans = byDate.get(date) || [];
    const cells = {};
    const ponds = [];
    const stops = [];
    let totalKg = 0;
    plans.forEach((p) => {
      const id = p['海面業者ID'];
      const stopped = p['予定状態'] === '中止';
      const pond = pondLabel(masters, p);
      const kg = stopped ? 0 : num(p['予定数量kg']);
      const c = cells[id] || { ponds: [], kg: 0, stopped: true };
      if (!c.ponds.includes(pond)) c.ponds.push(pond);
      c.kg += kg;
      c.stopped = c.stopped && stopped;
      cells[id] = c;
      if (!stopped) {
        totalKg += kg;
        totals[id] = (totals[id] || 0) + kg;
        if (!ponds.includes(pond)) ponds.push(pond);
      } else {
        const reason = p['中止理由'] ? `中止（${p['中止理由']}）` : '中止';
        if (!stops.includes(reason)) stops.push(reason);
      }
    });
    Object.values(cells).forEach((c) => (c.pond = c.ponds.join('・')));
    return { date, cells, totalKg, note: [...ponds, ...stops].join('・') };
  });
  const grand = Object.values(totals).reduce((s, x) => s + x, 0);
  return { kaimens, days, totals, grand };
}

/** そのシーズン（期間に重なる搬入目標）の、生産者ごとの目標kg */
export function targetsInRange(masters, from, to) {
  const out = {};
  (masters?.搬入目標 || [])
    .filter((g) => g['開始日'] && g['終了日'] && g['開始日'] <= to && g['終了日'] >= from)
    .forEach((g) => {
      out[g['海面業者ID']] = (out[g['海面業者ID']] || 0) + num(g['目標数量kg']);
    });
  return out;
}

/** t（小数2桁まで） */
export const tOf = (kg) => Math.round((num(kg) / 1000) * 100) / 100;
