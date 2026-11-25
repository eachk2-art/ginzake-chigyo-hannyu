// 浜池別搬入予定をExcelに出力する（★2026-11-25）
//   シート1「搬入予定表」：生産者ごとの「○年銀鮭種苗搬入予定表」（1ページに3人、横に並べる）
//   シート2「浜池別一覧」：生産者×池場の割り振り表（池場の出荷予定・小計・残つき）
import { lineName, prefOfIkeba, vaccineOf, cellKey } from './seasonPlan';
import { num } from './planUtils';

const FONT = { name: 'Meiryo UI', size: 11 };
const thin = { style: 'thin', color: { argb: 'FF000000' } };
const box = { top: thin, bottom: thin, left: thin, right: thin };
const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7EEF7' } };
const BLOCK_W = [12, 5, 8, 7, 4, 12]; // 項目・単位・数量・ワクチン・本・備考
const GAP_W = 3;
const ITEM_ROWS = 13; // 品目の行数（足りなければ広げる）

function todayJP() {
  const d = new Date();
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

const tNum = (kg) => Math.round((num(kg) / 1000) * 100) / 100;

/**
 * masters・season・lines（[{ikeba, origin}] 並び済み）・values（cellKey → kg）からブックを作ってダウンロードする
 */
export async function downloadSeasonPlanExcel({ masters, season, lines, values, fileName }) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = '稚魚搬入管理アプリ';
  const year = (String(season).match(/(\d{4})/) || [])[1] || String(new Date().getFullYear());
  const kaimens = masters?.海面業者 || [];

  // ---------------- シート1：生産者ごとの搬入予定表 ----------------
  const ws = wb.addWorksheet('搬入予定表', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: false, scale: 100, horizontalCentered: true, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
    views: [{ showGridLines: false }],
  });
  const perRow = 3;
  const stride = BLOCK_W.length + 1;
  for (let b = 0; b < perRow; b++) {
    BLOCK_W.forEach((w, i) => (ws.getColumn(b * stride + i + 1).width = w));
    if (b < perRow - 1) ws.getColumn(b * stride + BLOCK_W.length + 1).width = GAP_W;
  }

  // 生産者ごとの品目（都道府県のまとまり → 池場の行）
  const people = kaimens
    .map((k) => {
      const groups = new Map();
      let kg = 0;
      lines.forEach((l) => {
        const v = num(values[cellKey(k['海面業者ID'], l.ikeba, l.origin)]);
        if (v <= 0) return;
        const pref = prefOfIkeba(masters, l.ikeba);
        if (!groups.has(pref)) groups.set(pref, []);
        groups.get(pref).push({ name: lineName(masters, l.ikeba, l.origin), kg: v });
        kg += v;
      });
      return { k, groups, kg };
    })
    .filter((x) => x.kg > 0);

  const blockRows = (p) => Array.from(p.groups.values()).reduce((s, g) => s + 1 + g.length, 0);
  const items = Math.max(ITEM_ROWS, ...people.map(blockRows));
  const bandH = 7 + items + 2; // 見出し7行＋品目＋計＋余白
  const band = (n) => 1 + n * bandH;

  people.forEach((p, i) => {
    const top = band(Math.floor(i / perRow));
    const c0 = (i % perRow) * stride + 1;
    const col = (n) => c0 + n;
    const cell = (r, n) => ws.getCell(top + r, col(n));

    cell(0, 4).value = todayJP();
    ws.mergeCells(top, col(4), top, col(5));
    cell(0, 4).alignment = { horizontal: 'right' };
    ws.mergeCells(top + 1, col(0), top + 1, col(5));
    cell(1, 0).value = `${year}年銀鮭種苗搬入予定表`;
    cell(1, 0).font = { ...FONT, size: 14, bold: true };
    cell(1, 0).alignment = { horizontal: 'center' };
    ws.mergeCells(top + 2, col(3), top + 2, col(5));
    cell(2, 3).value = '太協物産株式会社';
    cell(2, 3).alignment = { horizontal: 'right' };
    ws.mergeCells(top + 3, col(3), top + 3, col(5));
    cell(3, 3).value = '水産飼料部';
    cell(3, 3).alignment = { horizontal: 'right' };
    ws.mergeCells(top + 4, col(0), top + 4, col(2));
    cell(4, 0).value = `${p.k['氏名']}　様`;
    cell(4, 0).font = { ...FONT, size: 13, bold: true };
    cell(4, 0).border = { bottom: thin };

    // 表の見出し
    const hr = 6;
    ['項目', '単位', '数量', 'ワクチン', '', '備考'].forEach((t, n) => {
      const c = cell(hr, n);
      c.value = t || null;
      c.font = { ...FONT, bold: true };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.fill = HEAD_FILL;
      c.border = box;
    });
    ws.mergeCells(top + hr, col(3), top + hr, col(4));

    let r = hr + 1;
    p.groups.forEach((rows, pref) => {
      cell(r, 0).value = pref ? `${pref.replace(/県$/, '')}県産種苗` : '種苗';
      cell(r, 0).font = { ...FONT, bold: true };
      ws.mergeCells(top + r, col(0), top + r, col(2));
      r += 1;
      rows.forEach((x) => {
        cell(r, 0).value = x.name;
        cell(r, 1).value = 'ｔ';
        cell(r, 2).value = tNum(x.kg);
        cell(r, 2).numFmt = '0.0#';
        cell(r, 3).value = vaccineOf(x.kg);
        cell(r, 4).value = '本';
        r += 1;
      });
    });
    // 罫線（品目の枠は固定の行数）
    for (let rr = hr + 1; rr <= hr + items; rr++) {
      for (let n = 0; n < 6; n++) {
        const c = cell(rr, n);
        c.border = { left: n === 4 ? undefined : thin, right: n === 3 ? undefined : thin, top: { style: 'hair' }, bottom: { style: 'hair' } };
        if (!c.font) c.font = FONT;
        if (n === 1 || n === 4) c.alignment = { horizontal: 'center' };
      }
    }
    const tr = hr + items + 1;
    cell(tr, 0).value = '計';
    cell(tr, 1).value = 'ｔ';
    cell(tr, 2).value = tNum(p.kg);
    cell(tr, 2).numFmt = '0.0#';
    let vac = 0;
    p.groups.forEach((rows) => rows.forEach((x) => (vac += vaccineOf(x.kg))));
    cell(tr, 3).value = vac;
    cell(tr, 4).value = '本';
    for (let n = 0; n < 6; n++) {
      const c = cell(tr, n);
      c.font = { ...FONT, bold: true };
      c.border = { top: thin, bottom: thin, left: n === 4 ? undefined : thin, right: n === 3 ? undefined : thin };
      if (n === 1 || n === 4) c.alignment = { horizontal: 'center' };
    }
    // 3人ごとに改ページ
    if (i % perRow === perRow - 1 && i < people.length - 1) ws.getRow(top + bandH - 1).addPageBreak();
  });

  // ---------------- シート2：浜池別一覧（割り振り表） ----------------
  const ws2 = wb.addWorksheet('浜池別一覧', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
    views: [{ showGridLines: false }],
  });
  ws2.getColumn(1).width = 16;
  lines.forEach((_, i) => (ws2.getColumn(2 + i).width = 9));
  const last = 2 + lines.length;
  ws2.getColumn(last).width = 9;
  ws2.getColumn(last + 1).width = 9;
  ws2.mergeCells(1, 1, 1, Math.min(last + 1, 8));
  ws2.getCell(1, 1).value = `${season}　浜池別搬入予定（単位：ｔ）　${todayJP()}`;
  ws2.getCell(1, 1).font = { ...FONT, size: 13, bold: true };

  const head = ['', ...lines.map((l) => lineName(masters, l.ikeba, l.origin)), '計', 'ワクチン'];
  head.forEach((t, i) => (ws2.getCell(3, 1 + i).value = t));
  const supply = ['池場の出荷予定', ...lines.map((l) => tNum(values[cellKey('', l.ikeba, l.origin)]) || null)];
  supply.push(lines.reduce((s, l) => s + tNum(values[cellKey('', l.ikeba, l.origin)]), 0) || null);
  supply.forEach((v, i) => (ws2.getCell(4, 1 + i).value = v));
  let rr = 5;
  const colSum = lines.map(() => 0);
  kaimens.forEach((k) => {
    ws2.getCell(rr, 1).value = k['氏名'];
    let sum = 0;
    let vac = 0;
    lines.forEach((l, i) => {
      const kg = num(values[cellKey(k['海面業者ID'], l.ikeba, l.origin)]);
      if (kg > 0) ws2.getCell(rr, 2 + i).value = tNum(kg);
      sum += kg;
      vac += vaccineOf(kg);
      colSum[i] += kg;
    });
    ws2.getCell(rr, last).value = sum > 0 ? tNum(sum) : null;
    ws2.getCell(rr, last + 1).value = vac || null;
    rr += 1;
  });
  ws2.getCell(rr, 1).value = '小計';
  colSum.forEach((kg, i) => (ws2.getCell(rr, 2 + i).value = tNum(kg) || null));
  ws2.getCell(rr, last).value = tNum(colSum.reduce((s, x) => s + x, 0)) || null;
  rr += 1;
  ws2.getCell(rr, 1).value = '残';
  lines.forEach((l, i) => {
    const sup = num(values[cellKey('', l.ikeba, l.origin)]);
    ws2.getCell(rr, 2 + i).value = sup > 0 ? Math.round((sup - colSum[i]) / 10) / 100 : null;
  });
  for (let r = 3; r <= rr; r++) {
    for (let c = 1; c <= last + 1; c++) {
      const cell = ws2.getCell(r, c);
      cell.border = box;
      cell.font = { ...FONT, bold: r === 3 || r === 4 || r >= rr - 1 || c === 1 };
      cell.alignment = { horizontal: c === 1 ? 'left' : 'center', vertical: 'middle', shrinkToFit: true };
      if (r === 3 || r === 4 || r >= rr - 1) cell.fill = HEAD_FILL;
      if (c > 1 && r > 3 && c < last + 1) cell.numFmt = '0.0#';
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
