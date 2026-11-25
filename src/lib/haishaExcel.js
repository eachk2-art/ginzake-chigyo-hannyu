// 配車表をExcel（.xlsx）に出力する（★2026-11-25）。担当者のExcelと同じ並び：
//   見出し2段（運送会社／ドライバー名字＋車番）、1日3段（上：池場　中：浜・生産者　下：数量ｔ）、1週間で1ブロック
// ・A4横で、1週間が1ページに収まるように縮小率を計算して入れる（週ごとに改ページ）
// ExcelJS は大きいので、出力するときだけ読み込む
import { buildBlock, carrierGroups, weekBlocks } from './haisha';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const FONT = { name: 'Meiryo UI', size: 10 };
const thin = { style: 'thin', color: { argb: 'FF808080' } };
const medium = { style: 'medium', color: { argb: 'FF000000' } };
const hair = { style: 'hair', color: { argb: 'FFB0B0B0' } };
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7EEF7' } };

// 行の高さ（ポイント）。30px ≒ 22.5pt
const H_TITLE = 20;
const H_HEAD = 18;
const H_TOP = 22.5; // 上：池場
const H_MID = 30; // 中：浜（改行）生産者 … 2行
const H_BOTTOM = 16; // 下：数量
const W_DATE = 11;
const W_COL = 13;

// A4横（842×595pt）。余白は左右0.4インチ、上下0.3インチ
const MARGIN = { left: 0.4, right: 0.4, top: 0.3, bottom: 0.3, header: 0.15, footer: 0.15 };
const PAGE_W = 842 - (MARGIN.left + MARGIN.right) * 72;
const PAGE_H = 595 - (MARGIN.top + MARGIN.bottom) * 72;

/** 列幅（文字数）→ ポイントのおおよそ */
const colPt = (w) => (w * 7 + 5) * 0.75;

function dateLabel(d) {
  const x = new Date(d.replace(/-/g, '/'));
  return `${x.getMonth() + 1}/${x.getDate()}（${DOW[x.getDay()]}）`;
}

export async function downloadHaishaExcel({ masters, runs, from, to, fileName }) {
  const ExcelJS = (await import('exceljs')).default;
  const blocks = weekBlocks(from, to);

  // 期間全体で足した列（列順が空欄の車輌・2回目）を集め、どの週にも同じ列を出す
  const extraAll = new Map();
  blocks.forEach((dates) => buildBlock(masters, runs, dates).extraCols.forEach((c) => extraAll.set(c.key, c)));
  const built = blocks.map((dates) => buildBlock(masters, runs, dates, Array.from(extraAll.values())));
  const nCols = built[0]?.cols.length || 0;
  const totalCols = 1 + nCols;

  // 1週間＝見出し2段＋7日×3段。1ページ目はタイトル行も入る
  const blockH = H_HEAD * 2 + 7 * (H_TOP + H_MID + H_BOTTOM) + H_TITLE;
  const totalW = colPt(W_DATE) + nCols * colPt(W_COL);
  const scale = Math.max(40, Math.min(100, Math.floor(Math.min(PAGE_H / blockH, PAGE_W / totalW) * 100)));

  const wb = new ExcelJS.Workbook();
  wb.creator = '稚魚搬入管理アプリ';
  const ws = wb.addWorksheet('予定表', {
    pageSetup: { paperSize: 9, orientation: 'landscape', scale, fitToPage: false, horizontalCentered: true, margins: MARGIN },
    views: [{ showGridLines: false }],
  });
  ws.getColumn(1).width = W_DATE;
  for (let c = 2; c <= totalCols; c++) ws.getColumn(c).width = W_COL;

  let r = 1;
  // タイトル行（右端に凡例）
  ws.mergeCells(r, 1, r, Math.max(1, totalCols - 3));
  const title = ws.getCell(r, 1);
  title.value = `稚魚搬入 予定表（配車表）　${dateLabel(from)}〜${dateLabel(to)}`;
  title.font = { ...FONT, size: 13, bold: true };
  if (totalCols >= 4) {
    ws.mergeCells(r, totalCols - 2, r, totalCols);
    const lg = ws.getCell(r, totalCols - 2);
    lg.value = '上：池場　中：浜・生産者　下：数量ｔ';
    lg.font = { ...FONT, size: 9, color: { argb: 'FF555555' } };
    lg.alignment = { horizontal: 'right', vertical: 'middle' };
  }
  ws.getRow(r).height = H_TITLE;
  r += 1;

  built.forEach((b, bi) => {
    const h1 = r;
    const h2 = r + 1;
    ws.mergeCells(h1, 1, h2, 1);
    ws.getCell(h1, 1).value = '日付';
    carrierGroups(b.cols).forEach((g) => {
      const c1 = 2 + g.from;
      if (g.span > 1) ws.mergeCells(h1, c1, h1, c1 + g.span - 1);
      ws.getCell(h1, c1).value = g.label;
    });
    b.cols.forEach((c, i) => {
      ws.getCell(h2, 2 + i).value = c.header;
    });
    [h1, h2].forEach((rr) => {
      ws.getRow(rr).height = H_HEAD;
      for (let c = 1; c <= totalCols; c++) {
        const cell = ws.getCell(rr, c);
        cell.font = { ...FONT, bold: true };
        cell.alignment = { horizontal: 'center', vertical: 'middle', shrinkToFit: true };
        cell.fill = HEADER_FILL;
        cell.border = { top: rr === h1 ? medium : thin, bottom: rr === h2 ? medium : thin, left: thin, right: thin };
      }
    });
    r = h2 + 1;

    b.dates.forEach((d) => {
      const rows = [r, r + 1, r + 2];
      ws.mergeCells(r, 1, r + 2, 1);
      const dc = ws.getCell(r, 1);
      dc.value = dateLabel(d);
      b.cols.forEach((c, i) => {
        const run = b.cell(d, i);
        if (!run) return;
        ws.getCell(rows[0], 2 + i).value = run.top;
        ws.getCell(rows[1], 2 + i).value = run.middle;
        ws.getCell(rows[2], 2 + i).value = run.stopped ? '中止' : Number(run.bottom);
      });
      rows.forEach((rr, k) => {
        ws.getRow(rr).height = [H_TOP, H_MID, H_BOTTOM][k];
        for (let c = 1; c <= totalCols; c++) {
          const cell = ws.getCell(rr, c);
          if (c === 1) {
            cell.font = { ...FONT, bold: true };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          } else {
            cell.font = { ...FONT, size: k === 2 ? 11 : 10, bold: k === 2 };
            // 上・下は1行に収める（はみ出すときは縮小）、中は改行どおり2行
            cell.alignment = k === 1 ? { horizontal: 'center', vertical: 'middle', wrapText: true } : { horizontal: 'center', vertical: 'middle', shrinkToFit: true };
            if (k === 2) cell.numFmt = '0.0##';
          }
          cell.border = { top: k === 0 ? medium : hair, bottom: k === 2 ? medium : hair, left: thin, right: thin };
        }
      });
      r += 3;
    });

    // 週ごとに改ページ
    if (bi < built.length - 1) ws.getRow(r - 1).addPageBreak();
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
