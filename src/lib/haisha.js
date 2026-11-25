// 配車表（★2026-11-25）：担当者がExcelで作っていた「予定表（配車表）」と同じ並びを、アプリのデータから作る
//   列：車輌（運送会社ごと → 通常ドライバーの名字＋車番）。車輌マスタの「配車表の列順」が入っている車輌が固定の列
//       ＋ スポットの列（列順が空欄の車輌、同じ日に2回目を走る車輌）。最低2列
//   行：1日3段（上：積込順＋池場　中：浜（海面業者の所在地）：生産者　下：数量ｔ）
//   1週間（7日）で1ブロック
import { ikebaBaseName, pondNameOnly, kaimenPersonName, kaimenLocation, tantoushaName } from './masterLookup';
import { num } from './planUtils';

export const MIN_SPOT_COLS = 2;
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';

export function circled(n) {
  const i = Number(n);
  return i >= 1 && i <= 20 ? CIRCLED[i - 1] : i > 0 ? `(${i})` : '';
}

const find = (list, key, id) => (list || []).find((x) => String(x[key]) === String(id)) || null;

/** 名字（氏名の最初の空白まで。空白が無ければ氏名そのまま） */
export function familyName(fullName) {
  const s = String(fullName || '').trim();
  const m = s.split(/[\s　]+/);
  return m[0] || s;
}

/** 運送会社の表示名（略称があれば略称） */
function carrierLabel(masters, carrierId) {
  const c = find(masters?.運送会社, '運送会社ID', carrierId);
  return c ? c['運送会社名'] || c['略称'] || carrierId : carrierId || '';
}

/** 列見出し（下段）：「木村 504」＝通常ドライバーの名字＋車番 */
export function vehicleHeader(masters, vehicleId) {
  const v = find(masters?.車輌, '車輌ID', vehicleId);
  if (!v) return vehicleId || '';
  const driver = v['通常ドライバー担当者ID'] ? familyName(tantoushaName(masters, v['通常ドライバー担当者ID'])) : '';
  return [driver, v['車番']].filter(Boolean).join(' ');
}

/** スポットの列に出す車輌の名前：「車番（運送会社の略称）」 */
function spotVehicleLabel(masters, vehicleId) {
  const v = find(masters?.車輌, '車輌ID', vehicleId);
  if (!v) return vehicleId || '';
  const c = find(masters?.運送会社, '運送会社ID', v['運送会社ID']);
  const cname = c ? c['略称'] || c['運送会社名'] : '';
  const driver = v['通常ドライバー担当者ID'] ? familyName(tantoushaName(masters, v['通常ドライバー担当者ID'])) : '';
  return `${[driver, v['車番']].filter(Boolean).join(' ')}${cname ? `（${cname}）` : ''}`;
}

/** 池場名：「玉山」、元の池があれば「玉山（大沢）」 */
function pondLabel(masters, s) {
  const name = pondNameOnly(ikebaBaseName(masters, s['池場ID']));
  const origin = s['由来池場ID'] && s['由来池場ID'] !== s['池場ID'] ? pondNameOnly(ikebaBaseName(masters, s['由来池場ID'])) : '';
  return origin ? `${name}（${origin}）` : name;
}

/** 数量ｔ（小数は3桁まで、末尾の0は消す） */
export function tonText(kg) {
  const t = Math.round((num(kg) / 1000) * 1000) / 1000;
  return t === 0 ? '' : String(t);
}

/** 固定の列（配車表の列順が入っている車輌）。運送会社ごとの見出しのまとまりも返す */
export function fixedColumns(masters) {
  const list = (masters?.車輌 || [])
    .filter((v) => String(v['配車表の列順'] ?? '') !== '')
    .sort((a, b) => num(a['配車表の列順']) - num(b['配車表の列順']));
  return list.map((v) => ({
    vehicleId: v['車輌ID'],
    carrierId: v['運送会社ID'],
    carrier: carrierLabel(masters, v['運送会社ID']),
    header: vehicleHeader(masters, v['車輌ID']),
  }));
}

/** 隣り合う同じ運送会社の列をまとめる：[{label, from, span}] */
export function carrierGroups(cols) {
  const out = [];
  cols.forEach((c, i) => {
    const last = out[out.length - 1];
    if (last && last.key === c.carrierId && c.carrierId) last.span += 1;
    else out.push({ key: c.carrierId, label: c.carrier, from: i, span: 1 });
  });
  return out;
}

/**
 * 便（getSchedules の結果）から、運行ごとのセルを作る
 * 戻り値：[{ runId, date, vehicleId, runNo, top, middle, bottom, stopped, spotLabel }]
 */
export function buildRuns(masters, schedules) {
  const byRun = new Map();
  (schedules || []).forEach((s) => {
    if (!s['運行ID'] || s['ステータス'] === '取消') return; // 車輌未定・取消は出さない
    if (!byRun.has(s['運行ID'])) byRun.set(s['運行ID'], []);
    byRun.get(s['運行ID']).push(s);
  });
  const runs = [];
  byRun.forEach((items, runId) => {
    const sorted = [...items].sort((a, b) => num(a['積込順']) - num(b['積込順']));
    const active = sorted.filter((s) => s['ステータス'] !== '中止');
    const first = sorted[0];
    // 上：積込順（その日のその池場の中での順番）＋池場
    const ponds = [];
    sorted.forEach((s) => {
      const p = pondLabel(masters, s);
      if (!ponds.some((x) => x.p === p)) ponds.push({ p, order: num(s['積込順']) });
    });
    const top = ponds.map((x) => `${circled(x.order)}${x.p}`).join('・');
    // 中：浜（所在地）：生産者。同じ浜へ積み分けなら「横浦：木村豊→木村茂」
    const parts = [];
    sorted.forEach((s) => {
      const loc = kaimenLocation(masters, s['海面業者ID']);
      const name = kaimenPersonName(masters, s['海面業者ID']);
      const last = parts[parts.length - 1];
      if (last && last.loc === loc) {
        if (!last.names.includes(name)) last.names.push(name);
      } else parts.push({ loc, names: [name] });
    });
    const middle = parts.map((x) => `${x.loc ? `${x.loc}：` : ''}${x.names.join('→')}`).join('／');
    const kg = active.reduce((sum, s) => sum + num(s['予定数量kg']), 0);
    runs.push({
      runId,
      date: first['積込日'],
      vehicleId: first['車輌ID'],
      runNo: num(first['回目']) || 1,
      top,
      middle,
      bottom: active.length === 0 ? '中止' : tonText(kg),
      stopped: active.length === 0,
      planIds: Array.from(new Set(sorted.map((s) => s['搬入予定ID']))),
      spotLabel: spotVehicleLabel(masters, first['車輌ID']) + ((num(first['回目']) || 1) > 1 ? `・${first['回目']}回目` : ''),
    });
  });
  return runs;
}

/** 日付の配列（from〜to） */
export function dateList(from, to) {
  const out = [];
  const d = new Date(from.replace(/-/g, '/'));
  const end = new Date(to.replace(/-/g, '/'));
  while (d <= end && out.length < 120) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/**
 * 1ブロック（数日分）の表を作る
 * 戻り値：{ dates, fixed, spotCount, cell(date, colIndex) → run|null, spot(date, i) → run|null }
 */
export function buildBlock(masters, runs, dates) {
  const fixed = fixedColumns(masters);
  const fixedIndex = new Map(fixed.map((c, i) => [c.vehicleId, i]));
  const fixedCells = new Map(); // `${date}|${col}` → run
  const spots = new Map(); // date → [run]
  dates.forEach((d) => spots.set(d, []));
  runs
    .filter((r) => spots.has(r.date))
    .sort((a, b) => a.runNo - b.runNo || String(a.vehicleId).localeCompare(String(b.vehicleId)))
    .forEach((r) => {
      const col = fixedIndex.get(r.vehicleId);
      const key = `${r.date}|${col}`;
      if (col !== undefined && r.runNo === 1 && !fixedCells.has(key)) fixedCells.set(key, r);
      else spots.get(r.date).push(r);
    });
  const spotCount = Math.max(MIN_SPOT_COLS, ...Array.from(spots.values()).map((l) => l.length));
  return {
    dates,
    fixed,
    spotCount,
    cell: (date, col) => fixedCells.get(`${date}|${col}`) || null,
    spot: (date, i) => spots.get(date)?.[i] || null,
  };
}

/** 期間を7日ずつのブロックに分ける */
export function weekBlocks(from, to) {
  const all = dateList(from, to);
  const out = [];
  for (let i = 0; i < all.length; i += 7) out.push(all.slice(i, i + 7));
  return out;
}
