// 全体予定（生産者別）をExcelに出力する（★2026-11-25）。担当者のExcel「全体予定」と同じ並び
import { buildZentai, targetsInRange, tOf } from './zentai';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const FONT = { name: 'Meiryo UI', size: 10 };
const thin = { style: 'thin', color: { argb: 'FF808080' } };
const medium = { style: 'medium', color: { argb: 'FF000000' } };
const box = { top: thin, bottom: thin, left: thin, right: thin };
const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7EEF7' } };
const SUN_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDECEC' } };

function dateLabel(d) {
  const x = new Date(d.replace(/-/g, '/'));
  return `${x.getMonth() + 1}/${x.getDate()}（${DOW[x.getDay()]}）`;
}

export async function downloadZentaiExcel({ masters, tree, from, to, fileName }) {
  const ExcelJS = (await import('exceljs')).default;
  const z = buildZentai(masters, tree, from, to);
  const targets = targetsInRange(masters, from, to);
  const n = z.kaimens.length;
  const colTotal = 2 + n * 2;
  const colNote = colTotal + 1;

  const wb = new ExcelJS.Workbook();
  wb.creator = '稚魚搬入管理アプリ';
  const ws = wb.addWorksheet('全体予定', {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: z.days.length <= 40 ? 1 : 0,
      horizontalCentered: true,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
    views: [{ state: 'frozen', xSplit: 1, ySplit: 3, showGridLines: false }],
  });
  ws.getColumn(1).width = 12;
  for (let i = 0; i < n; i++) {
    ws.getColumn(2 + i * 2).width = 10;
    ws.getColumn(3 + i * 2).width = 6;
  }
  ws.getColumn(colTotal).width = 7;
  ws.getColumn(colNote).width = 16;

  // タイトル
  ws.mergeCells(1, 1, 1, colNote);
  const d = new Date();
  ws.getCell(1, 1).value = `全体予定（生産者別）　${dateLabel(from)}〜${dateLabel(to)}　（数量：ｔ　${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} 作成）`;
  ws.getCell(1, 1).font = { ...FONT, size: 13, bold: true };

  // 見出し2段
  ws.mergeCells(2, 1, 3, 1);
  ws.getCell(2, 1).value = '日付';
  z.kaimens.forEach((k, i) => {
    const c = 2 + i * 2;
    ws.mergeCells(2, c, 2, c + 1);
    ws.getCell(2, c).value = k['氏名'];
    ws.getCell(3, c).value = '池場';
    ws.getCell(3, c + 1).value = '数量';
  });
  ws.mergeCells(2, colTotal, 3, colTotal);
  ws.getCell(2, colTotal).value = '計';
  ws.mergeCells(2, colNote, 3, colNote);
  ws.getCell(2, colNote).value = '備考';
  for (let r = 2; r <= 3; r++) {
    for (let c = 1; c <= colNote; c++) {
      const cell = ws.getCell(r, c);
      cell.font = { ...FONT, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', shrinkToFit: true };
      cell.fill = HEAD_FILL;
      cell.border = { ...box, top: r === 2 ? medium : thin, bottom: r === 3 ? medium : thin };
    }
  }

  // 日ごと
  let r = 4;
  z.days.forEach((day) => {
    const sunday = new Date(day.date.replace(/-/g, '/')).getDay() === 0;
    ws.getCell(r, 1).value = dateLabel(day.date);
    z.kaimens.forEach((k, i) => {
      const cell = day.cells[k['海面業者ID']];
      if (!cell) return;
      const c = 2 + i * 2;
      ws.getCell(r, c).value = cell.pond;
      ws.getCell(r, c + 1).value = cell.stopped ? '中止' : tOf(cell.kg);
    });
    ws.getCell(r, colTotal).value = tOf(day.totalKg);
    ws.getCell(r, colNote).value = day.note || null;
    for (let c = 1; c <= colNote; c++) {
      const cell = ws.getCell(r, c);
      cell.font = { ...FONT, bold: c === colTotal, color: sunday && c === 1 ? { argb: 'FFC62828' } : undefined };
      cell.alignment = { horizontal: c === colNote ? 'left' : 'center', vertical: 'middle', shrinkToFit: true };
      cell.border = box;
      if (sunday) cell.fill = SUN_FILL;
      if ((c >= 3 && c < colTotal && (c - 3) % 2 === 0) || c === colTotal) cell.numFmt = '0.0#;-0.0#;""';
    }
    ws.getRow(r).height = 17;
    r += 1;
  });

  // 計・目標・差
  const foot = [
    ['計', (id) => tOf(z.totals[id] || 0), tOf(z.grand)],
    ['目標', (id) => (targets[id] ? tOf(targets[id]) : null), tOf(Object.values(targets).reduce((s, x) => s + x, 0)) || null],
    ['差（計−目標）', (id) => (targets[id] ? tOf((z.totals[id] || 0) - targets[id]) : null), null],
  ];
  foot.forEach(([label, fn, total], fi) => {
    ws.getCell(r, 1).value = label;
    z.kaimens.forEach((k, i) => {
      const c = 2 + i * 2;
      ws.mergeCells(r, c, r, c + 1);
      ws.getCell(r, c).value = fn(k['海面業者ID']);
    });
    ws.getCell(r, colTotal).value = total;
    for (let c = 1; c <= colNote; c++) {
      const cell = ws.getCell(r, c);
      cell.font = { ...FONT, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', shrinkToFit: true };
      cell.fill = HEAD_FILL;
      cell.border = { ...box, top: fi === 0 ? medium : thin };
      if (c > 1) cell.numFmt = '0.0#';
    }
    r += 1;
  });

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
