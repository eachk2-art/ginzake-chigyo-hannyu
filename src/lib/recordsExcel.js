// 積込・搬入の全記録をExcelに出力する（★2026-11-26）
//   シート1「全記録」：1行＝1台の車×1つの納品先（納品完了の分）
//   シート2「計量明細」：1行＝計量1回
// どちらも1行目が見出しの「データベースの形」。フィルターと見出しの固定を付ける（ピボットにしやすいように結合はしない）
import { RECORD_COLUMNS, FARE_COLUMNS, DETAIL_COLUMNS, headerLabel } from './records';

const FONT = { name: 'Meiryo UI', size: 10 };
const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7EEF7' } };
const thin = { style: 'thin', color: { argb: 'FFBFBFBF' } };

function addTable(wb, name, columns, rows) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1, xSplit: 0 }] });
  ws.columns = columns.map(([key, width, fmt]) => ({ header: headerLabel(key), key, width: Math.max(width, 5), style: fmt ? { numFmt: fmt } : {} }));
  rows.forEach((r) => ws.addRow(r));
  const head = ws.getRow(1);
  head.height = 30;
  head.eachCell((c) => {
    c.font = { ...FONT, bold: true };
    c.fill = HEAD_FILL;
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = { top: thin, bottom: thin, left: thin, right: thin };
  });
  for (let i = 2; i <= rows.length + 1; i++) {
    ws.getRow(i).font = FONT;
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}

export async function downloadRecordsExcel({ rows, details, withFare, fileName }) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = '稚魚搬入管理アプリ';
  addTable(wb, '全記録', withFare ? [...RECORD_COLUMNS, ...FARE_COLUMNS] : RECORD_COLUMNS, rows);
  addTable(wb, '計量明細', DETAIL_COLUMNS, details);

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
