// 配車表（★2026-11-25）：担当者がExcelで作っていた「予定表（配車表）」と同じ並びを、アプリのデータから作る
//   列：車輌（運送会社ごと → 通常ドライバーの名字＋車番）。車輌マスタの「配車表の列順」の順に並べる
//       （★11/25 スポットの列はやめた。列順が空欄の車輌が走ったとき・同じ日に2回目を走ったときだけ、右端に列を足す）
//   行：1日3段（上：積込順＋池場　中：浜（海面業者の所在地）：生産者　下：数量ｔ）
//   1週間（7日）で1ブロック
import { ikebaBaseName, pondNameOnly, kaimenPersonName, kaimenLocation, tantoushaName } from './masterLookup';
import { num } from './planUtils';

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
 * 戻り値：[{ runId, date, vehicleId, runNo, top, middle, bottom, stopped, extraKey, extraHeader }]
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
    // 浜のあとで改行し、生産者名が途中で折り返さないようにする（★11/25）
    const middle = parts.map((x) => `${x.loc ? `${x.loc}\n` : ''}${x.names.join('→')}`).join('\n');
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
      extraKey: `${first['車輌ID']}|${num(first['回目']) || 1}`,
      extraHeader: vehicleHeader(masters, first['車輌ID']) + ((num(first['回目']) || 1) > 1 ? `（${first['回目']}回目）` : ''),
      extraCarrierId: (find(masters?.車輌, '車輌ID', first['車輌ID']) || {})['運送会社ID'] || '',
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
 * ・列は、配車表の列順が入っている車輌（固定の列）。そのあとに、列順が空欄の車輌や2回目の運行があれば列を足す
 * 戻り値：{ dates, cols: [{key, carrierId, carrier, header, extra}], cell(date, colIndex) → run|null }
 */
export function buildBlock(masters, runs, dates, extraKeys = null) {
  const fixed = fixedColumns(masters).map((c) => ({ ...c, key: `${c.vehicleId}|1`, extra: false }));
  const inDates = runs.filter((r) => dates.includes(r.date));
  const cells = new Map(); // `${date}|${colKey}` → run
  const extras = new Map(); // colKey → 列
  inDates.forEach((r) => {
    const fixedKey = r.runNo === 1 && fixed.some((c) => c.vehicleId === r.vehicleId) ? `${r.vehicleId}|1` : null;
    const key = fixedKey || r.extraKey;
    if (!fixedKey && !extras.has(key)) {
      extras.set(key, { key, vehicleId: r.vehicleId, carrierId: r.extraCarrierId, carrier: carrierLabel(masters, r.extraCarrierId), header: r.extraHeader, extra: true });
    }
    if (!cells.has(`${r.date}|${key}`)) cells.set(`${r.date}|${key}`, r);
  });
  // Excelでは、期間全体で足した列をどの週にも出す（列をそろえる）
  if (extraKeys) {
    extraKeys.forEach((col) => {
      if (!extras.has(col.key)) extras.set(col.key, col);
    });
  }
  const extraCols = Array.from(extras.values()).sort((a, b) => String(a.key).localeCompare(String(b.key)));
  const cols = [...fixed, ...extraCols];
  return {
    dates,
    cols,
    extraCols,
    cell: (date, i) => cells.get(`${date}|${cols[i]?.key}`) || null,
  };
}

/** 期間を7日ずつのブロックに分ける */
export function weekBlocks(from, to) {
  const all = dateList(from, to);
  const out = [];
  for (let i = 0; i < all.length; i += 7) out.push(all.slice(i, i + 7));
  return out;
}
