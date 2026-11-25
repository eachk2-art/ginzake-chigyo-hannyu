// 配車表をExcel（.xlsx）に出力する（★2026-11-25）。担当者のExcelと同じ並び：
//   見出し2段（運送会社／ドライバー名字＋車番）、1日3段（上：池場　中：浜・生産者　下：数量ｔ）、1週間で1ブロック
// ExcelJS は大きいので、出力するときだけ読み込む
import { buildBlock, carrierGroups, weekBlocks } from './haisha';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const FONT = { name: 'Meiryo UI', size: 11 };
const thin = { style: 'thin', color: { argb: 'FF808080' } };
const medium = { style: 'medium', color: { argb: 'FF000000' } };
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7EEF7' } };
const SPOT_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4E0' } };

function dateLabel(d) {
  const x = new Date(d.replace(/-/g, '/'));
  return `${x.getMonth() + 1}/${x.getDate()}（${DOW[x.getDay()]}）`;
}

/**
 * masters・runs（buildRuns の結果）・期間から、ブックを作ってダウンロードする
 */
export async function downloadHaishaExcel({ masters, runs, from, to, fileName }) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = '稚魚搬入管理アプリ';
  const ws = wb.addWorksheet('予定表', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
    views: [{ showGridLines: false }],
  });

  const blocks = weekBlocks(from, to);
  // 列数は、いちばんスポットが多い週に合わせる（どの週も同じ列幅にする）
  const built = blocks.map((dates) => buildBlock(masters, runs, dates));
  const fixedCount = built[0]?.fixed.length || 0;
  const spotCount = Math.max(...built.map((b) => b.spotCount), 2);
  const totalCols = 1 + fixedCount + spotCount;

  ws.getColumn(1).width = 12;
  for (let c = 2; c <= totalCols; c++) ws.getColumn(c).width = 14;

  let r = 1;
  ws.mergeCells(r, 1, r, Math.min(totalCols, 6));
  const title = ws.getCell(r, 1);
  title.value = `稚魚搬入 予定表（配車表）　${dateLabel(from)}〜${dateLabel(to)}`;
  title.font = { ...FONT, size: 14, bold: true };
  r += 1;

  built.forEach((b, bi) => {
    // 凡例（右上）
    const legendCol = Math.max(2, totalCols - 2);
    ['上：池場', '中：浜・生産者', '下：数量ｔ'].forEach((t, i) => {
      const cell = ws.getCell(r, legendCol + i);
      cell.value = t;
      cell.font = { ...FONT, size: 9, color: { argb: 'FF555555' } };
      cell.alignment = { horizontal: 'center' };
    });
    r += 1;

    // 見出し1段目：日付・運送会社（同じ会社の列をまとめる）・スポット
    const h1 = r;
    const h2 = r + 1;
    ws.mergeCells(h1, 1, h2, 1);
    ws.getCell(h1, 1).value = '日付';
    carrierGroups(b.fixed).forEach((g) => {
      const c1 = 2 + g.from;
      const c2 = c1 + g.span - 1;
      if (g.span > 1) ws.mergeCells(h1, c1, h1, c2);
      ws.getCell(h1, c1).value = g.label;
    });
    if (spotCount > 0) {
      const c1 = 2 + fixedCount;
      if (spotCount > 1) ws.mergeCells(h1, c1, h1, c1 + spotCount - 1);
      ws.getCell(h1, c1).value = 'スポット';
    }
    // 見出し2段目：ドライバー名字＋車番
    b.fixed.forEach((c, i) => {
      ws.getCell(h2, 2 + i).value = c.header;
    });
    for (let i = 0; i < spotCount; i++) ws.getCell(h2, 2 + fixedCount + i).value = `スポット${i + 1}`;

    for (let rr = h1; rr <= h2; rr++) {
      for (let c = 1; c <= totalCols; c++) {
        const cell = ws.getCell(rr, c);
        cell.font = { ...FONT, bold: true };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.fill = HEADER_FILL;
        cell.border = { top: rr === h1 ? medium : thin, bottom: rr === h2 ? medium : thin, left: thin, right: thin };
      }
    }
    r = h2 + 1;

    // 1日3段
    b.dates.forEach((d) => {
      const rows = [r, r + 1, r + 2];
      ws.mergeCells(r, 1, r + 2, 1);
      const dc = ws.getCell(r, 1);
      dc.value = dateLabel(d);
      dc.font = { ...FONT, bold: true };
      dc.alignment = { horizontal: 'center', vertical: 'middle' };

      const put = (col, run, isSpot) => {
        if (!run) return;
        ws.getCell(rows[0], col).value = isSpot ? `${run.spotLabel}\n${run.top}` : run.top;
        ws.getCell(rows[1], col).value = run.middle;
        const qty = run.stopped ? '中止' : Number(run.bottom);
        ws.getCell(rows[2], col).value = qty;
      };
      b.fixed.forEach((c, i) => put(2 + i, b.cell(d, i), false));
      for (let i = 0; i < spotCount; i++) put(2 + fixedCount + i, b.spot(d, i), true);

      rows.forEach((rr, k) => {
        ws.getRow(rr).height = k === 0 ? 30 : k === 1 ? 30 : 18;
        for (let c = 1; c <= totalCols; c++) {
          const cell = ws.getCell(rr, c);
          if (c > 1) {
            cell.font = { ...FONT, size: k === 2 ? 11 : 10, bold: k === 2 };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            if (k === 2) cell.numFmt = '0.0##';
            if (c > 1 + fixedCount) cell.fill = SPOT_FILL;
          }
          cell.border = {
            top: k === 0 ? medium : { style: 'hair', color: { argb: 'FFB0B0B0' } },
            bottom: k === 2 ? medium : { style: 'hair', color: { argb: 'FFB0B0B0' } },
            left: thin,
            right: thin,
          };
        }
      });
      r += 3;
    });

    // 週ごとに改ページ
    if (bi < built.length - 1) {
      ws.getRow(r - 1).addPageBreak();
      r += 2;
    }
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
