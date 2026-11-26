// 積込・搬入の全記録（★2026-11-26）
//   1レコード＝1台の車が1つの納品先へ運んだ分（積み分けの車は納品先ごとに分かれる）。納品完了の分だけ
//   列の定義は、画面の一覧とExcel出力の両方で使う
import {
  ikebaBaseName,
  pondNameOnly,
  kaimenLocation,
  deliveryDestName,
  vehicleLabel,
  carrierNameByVehicle,
  tantoushaName,
} from './masterLookup';
import { num } from './planUtils';

export const MAX_ROUNDS = 8; // 計量の横並びは8回まで
const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const find = (list, key, id) => (list || []).find((x) => String(x[key]) === String(id)) || null;
const r1 = (v) => Math.round(v * 10) / 10;
// 空なら空、それ以外は数値に（Excelで計算できるように）
const nb = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? '' : Number(v));

function minutesBetween(a, b) {
  const m = (t) => {
    const x = String(t || '').match(/^(\d{1,2}):(\d{2})/);
    return x ? Number(x[1]) * 60 + Number(x[2]) : null;
  };
  const x = m(a);
  const y = m(b);
  if (x === null || y === null) return '';
  let d = y - x;
  if (d < 0) d += 24 * 60; // 日をまたいだとき
  return d;
}

function weekOf(dateStr) {
  const d = new Date(dateStr.replace(/-/g, '/'));
  const diff = (d.getDay() + 6) % 7; // 月曜はじまり
  d.setDate(d.getDate() - diff);
  return `${d.getMonth() + 1}/${d.getDate()}の週`;
}

function seasonOf(masters, dateStr) {
  const g = (masters?.搬入目標 || []).find((x) => x['シーズン'] && x['開始日'] <= dateStr && x['終了日'] >= dateStr);
  return g ? g['シーズン'] : '';
}

const yes = (v) => (v === 'あり' ? 'あり' : v === 'なし' ? 'なし' : v || '');

/** 中間地点①〜③（★2026-11-27）：地点・内容と時刻 */
function midCols(masters, list) {
  const out = {};
  for (let n = 1; n <= 3; n++) {
    const m = (list || []).find((x) => Number(x['欄']) === n);
    const w = m ? (masters?.中間地点 || []).find((x) => x['中間地点ID'] === m['中間地点ID']) : null;
    out[`中間地点${n}`] = w ? w['地点・内容'] : m?.['中間地点ID'] || '';
    out[`中間地点${n}の時刻`] = m?.['時刻'] || '';
  }
  return out;
}

/**
 * getRecords の1件を、Excel・画面用の平らな1行にする
 */
export function flattenRecord(masters, rec) {
  const s = rec.schedule;
  const p = rec.plan;
  const run = rec.run || {};
  const res = rec.result || {};
  const dl = rec.delivery || {};
  const details = [...(rec.details || [])].sort((a, b) => num(a['積込回次']) - num(b['積込回次']));

  const ikeba = find(masters?.池場, '池場ID', s['池場ID']);
  const naisuimen = ikeba ? find(masters?.内水面業者, '内水面業者ID', ikeba['内水面業者ID']) : null;
  const kaimen = find(masters?.海面業者, '海面業者ID', s['海面業者ID']);
  const vehicle = find(masters?.車輌, '車輌ID', s['車輌ID']);
  const ikesu = find(masters?.生簀, '生簀ID', dl['生簀ID'] || p['生簀ID']);
  const origin = s['由来池場ID'] && s['由来池場ID'] !== s['池場ID'] ? pondNameOnly(ikebaBaseName(masters, s['由来池場ID'])) : '';
  const pond = pondNameOnly(ikebaBaseName(masters, s['池場ID']));

  const allocKg = num(s['予定数量kg']);
  const weighKg = num(rec['計量合計kg']);
  const prov = num(rec['暫定尾数']);
  const iremePlan = num(s['予定入れ目率']);
  const avgRaw = prov > 0 ? (weighKg * 1000) / prov : 0;
  const sizes = details.map((d) => num(d['平均サイズg'])).filter((x) => x > 0);
  const sizeMin = sizes.length ? Math.min(...sizes) : 0;
  const sizeMax = sizes.length ? Math.max(...sizes) : 0;
  // サイズ：池で測った平均サイズ（入力値）。回によって違うときは、計量で重みをつけた全体の平均（確定仕様の「全体の平均サイズ」）
  const sizeInput = sizes.length === 0 ? '' : sizeMin === sizeMax ? sizeMin : Math.floor(avgRaw * 10) / 10;
  const sea = dl['海面水温'];
  const car = dl['車輌水温'];
  const partners = (rec['積み分けの相手'] || [])
    .map((x) => `${find(masters?.海面業者, '海面業者ID', x['海面業者ID'])?.['氏名'] || x['海面業者ID']}（${deliveryDestName(masters, x['配送先ID'])}）${x['割当数量kg']}kg`)
    .join('、');
  const fare = rec['運賃'];
  const witness = (a, b) => [a, b].filter(Boolean).map((w) => tantoushaName(masters, w)).join('・');
  const d = new Date(s['積込日'].replace(/-/g, '/'));

  const row = {
    記録ID: s['積込予定ID'],
    搬入予定ID: s['搬入予定ID'],
    運行ID: s['運行ID'],
    回目: num(s['回目']) || 1,
    積み分け: rec['運行の割当数'] > 1 ? 'あり' : 'なし',
    積み分けの相手: partners,
    積込日: s['積込日'],
    曜日: DOW[d.getDay()],
    週: weekOf(s['積込日']),
    月: `${d.getFullYear()}年${d.getMonth() + 1}月`,
    シーズン: seasonOf(masters, s['積込日']),
    内水面業者: naisuimen ? naisuimen['略称'] || naisuimen['内水面業者名'] : '',
    池場: pond,
    元の池: origin,
    池場の表示: origin ? `${pond}（${origin}）` : pond,
    都道府県: naisuimen?.['都道府県'] || '',
    海面業者ID: s['海面業者ID'],
    生産者: kaimen?.['氏名'] || s['海面業者ID'],
    屋号: kaimen?.['屋号'] || '',
    所在地: kaimenLocation(masters, s['海面業者ID']),
    浜: deliveryDestName(masters, s['配送先ID']),
    生簀: ikesu ? `${ikesu['生簀No'] || ''}${ikesu['通称'] ? `（${ikesu['通称']}）` : ''}` : '',
    運送会社: carrierNameByVehicle(masters, s['車輌ID']),
    車番: vehicleLabel(masters, s['車輌ID']),
    ドライバー: vehicle?.['通常ドライバー担当者ID'] ? tantoushaName(masters, vehicle['通常ドライバー担当者ID']) : '',
    最大積載量kg: num(vehicle?.['最大積載数量kg']) || '',
    割当数量kg: allocKg,
    納品先の予定数量kg: num(p['予定数量kg']),
    入れ目率_予定: iremePlan,
    計量目標kg: Math.round(allocKg * (1 + iremePlan / 100)),
    到着予定時刻: s['到着予定時刻'] || '',
    積込開始: run['積込開始時刻'] || '',
    積込終了: run['積込終了時刻'] || '',
    積込の所要分: minutesBetween(run['積込開始時刻'], run['積込終了時刻']),
    積込回数_予定: nb(run['積込回数']),
    計量の回数: details.length,
    計量合計kg: weighKg,
    正味kg: weighKg > 0 ? r1(weighKg / (1 + iremePlan / 100)) : '',
    入れ目率_実績: weighKg > 0 && allocKg > 0 ? r1((weighKg / allocKg - 1) * 100) : '',
    平均サイズg: sizeInput,
    サイズの幅: sizes.length === 0 ? '' : sizeMin === sizeMax ? String(sizeMin) : `${sizeMin}〜${sizeMax}`,
    尾数_正味: avgRaw > 0 ? Math.floor((allocKg * 1000) / avgRaw) : '',
    尾数_入れ目込み: avgRaw > 0 ? Math.floor((weighKg * 1000) / avgRaw) : '',
    ワクチン本数: rec['ワクチン本数按分'] === '' ? '' : num(rec['ワクチン本数按分']),
    行き先未選択の回: rec['行き先未選択'] ? 'あり' : '',
    天候: res['天候'] || '',
    気温: nb(res['気温']),
    池の水温: nb(res['水温']),
    池の溶存酸素: nb(res['溶存酸素']),
    内水面立会者: witness(res['実際の内水面立会者ID'], res['内水面立会者ID2']),
    搬入日: dl['搬入日'] || '',
    出発: res['出発時刻'] || '',
    ...midCols(masters, rec['中間地点']),
    浜到着: dl['浜到着時刻'] || '',
    作業開始: dl['作業開始時刻'] || '',
    作業終了: dl['作業終了時刻'] || '',
    輸送の所要分: minutesBetween(res['出発時刻'], dl['浜到着時刻']),
    作業の所要分: minutesBetween(dl['作業開始時刻'], dl['作業終了時刻']),
    到着確認: yes(dl['到着確認']),
    海面水温: nb(sea),
    海面の溶存酸素: nb(dl['溶存酸素']),
    車輌の水温: nb(car),
    水温差_車輌_海面: sea !== '' && sea != null && car !== '' && car != null ? r1(num(car) - num(sea)) : '',
    投入後の状態: dl['海面投入後状態'] || '',
    荷卸作業不備: yes(dl['荷卸作業不備']),
    車輌不備: yes(dl['車輌不備']),
    漁業者不備: yes(dl['漁業者不備']),
    詳細: dl['詳細'] || '',
    海面立会者: witness(dl['海面立会者ID'], dl['海面立会者ID2']),
    完了確認日時: dl['完了確認日時'] || '',
    備考: p['備考'] || '',
  };
  for (let i = 0; i < MAX_ROUNDS; i++) {
    row[`計量${i + 1}回目kg`] = details[i] ? num(details[i]['実績数量kg']) : '';
  }
  if (details.length > MAX_ROUNDS) {
    row[`計量${MAX_ROUNDS}回目kg`] = details.slice(MAX_ROUNDS - 1).reduce((s2, x) => s2 + num(x['実績数量kg']), 0);
  }
  if (fare) {
    Object.assign(row, {
      運賃_地域: fare['地域区分'],
      運賃_計算方法: fare['計算方法'],
      運賃_kg単価: fare['kg単価'] === '' ? '' : num(fare['kg単価']),
      運賃_1車単価: fare['1車単価'] === '' ? '' : num(fare['1車単価']),
      運賃_按分: fare['按分'],
      運賃_数量kg: num(fare['数量kg']),
      自動運賃: fare['自動運賃'] === '' ? '' : num(fare['自動運賃']),
      請求運賃: fare['請求運賃'] === '' ? '' : num(fare['請求運賃']),
      精算運賃: fare['精算運賃'] === '' ? '' : num(fare['精算運賃']),
      運賃_締め済み: fare['確定済み'] ? '済み' : '',
    });
  }
  return row;
}

/** 計量明細（1行＝計量1回）。行き先で分けた（按分した）その納品先の分 */
export function detailRows(masters, rec, flat) {
  return [...(rec.details || [])]
    .sort((a, b) => num(a['積込回次']) - num(b['積込回次']))
    .map((d) => {
      const kg = num(d['実績数量kg']);
      const size = num(d['平均サイズg']);
      return {
        記録ID: flat.記録ID,
        運行ID: flat.運行ID,
        積込日: flat.積込日,
        池場: pondNameOnly(ikebaBaseName(masters, d['池場ID'] || rec.schedule['池場ID'])),
        元の池: flat.元の池,
        運送会社: flat.運送会社,
        車番: flat.車番,
        行き先の生産者: flat.生産者,
        浜: flat.浜,
        回次: num(d['積込回次']),
        計量kg: kg,
        平均サイズg: size || '',
        暫定尾数: kg > 0 && size > 0 ? Math.floor((kg * 1000) / size) : '',
        按分: d['按分'] ? `${d['按分']}%` : '',
      };
    });
}

/**
 * 全記録の列（Excelの見出しの順）。width はExcelの列幅、num は数値の書式
 * 見出しの「_」は、Excelでは（）に直して出す
 */
export const RECORD_COLUMNS = [
  ['記録ID', 14], ['搬入予定ID', 14], ['運行ID', 14], ['回目', 5], ['積み分け', 7], ['積み分けの相手', 28],
  ['積込日', 11], ['曜日', 5], ['週', 11], ['月', 10], ['シーズン', 10],
  ['内水面業者', 12], ['池場', 9], ['元の池', 8], ['池場の表示', 12], ['都道府県', 8],
  ['海面業者ID', 8], ['生産者', 12], ['屋号', 10], ['所在地', 9], ['浜', 12], ['生簀', 10],
  ['運送会社', 10], ['車番', 9], ['ドライバー', 10], ['最大積載量kg', 9],
  ['割当数量kg', 9, '#,##0.0'], ['納品先の予定数量kg', 10, '#,##0.0'], ['入れ目率_予定', 8, '0.0'], ['計量目標kg', 9, '#,##0'], ['到着予定時刻', 8],
  ['積込開始', 7], ['積込終了', 7], ['積込の所要分', 7], ['積込回数_予定', 7], ['計量の回数', 7],
  ['計量合計kg', 9, '#,##0.0'], ['正味kg', 9, '#,##0.0'], ['入れ目率_実績', 8, '0.0'], ['平均サイズg', 8, '0.0'], ['サイズの幅', 10],
  ['尾数_正味', 9, '#,##0'], ['尾数_入れ目込み', 9, '#,##0'], ['ワクチン本数', 7, '0.#'],
  ...Array.from({ length: MAX_ROUNDS }, (_, i) => [`計量${i + 1}回目kg`, 7, '#,##0.0']),
  ['行き先未選択の回', 7],
  ['天候', 6], ['気温', 6], ['池の水温', 6], ['池の溶存酸素', 7], ['内水面立会者', 14],
  ['搬入日', 11], ['出発', 7],
  ['中間地点1', 12], ['中間地点1の時刻', 7], ['中間地点2', 12], ['中間地点2の時刻', 7], ['中間地点3', 12], ['中間地点3の時刻', 7],
  ['浜到着', 7], ['作業開始', 7], ['作業終了', 7], ['輸送の所要分', 7], ['作業の所要分', 7], ['到着確認', 6],
  ['海面水温', 6], ['海面の溶存酸素', 7], ['車輌の水温', 6], ['水温差_車輌_海面', 7, '0.0'], ['投入後の状態', 8],
  ['荷卸作業不備', 6], ['車輌不備', 6], ['漁業者不備', 6], ['詳細', 24], ['海面立会者', 14], ['完了確認日時', 16], ['備考', 20],
];

export const FARE_COLUMNS = [
  ['運賃_地域', 7], ['運賃_計算方法', 8], ['運賃_kg単価', 7], ['運賃_1車単価', 9, '#,##0'], ['運賃_按分', 16], ['運賃_数量kg', 9, '#,##0.0'],
  ['自動運賃', 10, '#,##0'], ['請求運賃', 10, '#,##0'], ['精算運賃', 10, '#,##0'], ['運賃_締め済み', 6],
];

export const DETAIL_COLUMNS = [
  ['記録ID', 14], ['運行ID', 14], ['積込日', 11], ['池場', 9], ['元の池', 8], ['運送会社', 10], ['車番', 9],
  ['行き先の生産者', 12], ['浜', 12], ['回次', 5], ['計量kg', 8, '#,##0.0'], ['平均サイズg', 8, '0.0'], ['暫定尾数', 9, '#,##0'], ['按分', 8],
];

/** 見出しの表示名：「入れ目率_予定」→「入れ目率（予定）」、「水温差_車輌_海面」→「水温差（車輌−海面）」 */
export function headerLabel(key) {
  if (key === '水温差_車輌_海面') return '水温差（車輌−海面）';
  const mid = key.match(/^中間地点(\d)(.*)$/);
  if (mid) return `中間地点${'①②③'[Number(mid[1]) - 1]}${mid[2]}`;
  const i = key.indexOf('_');
  return i < 0 ? key : `${key.slice(0, i)}（${key.slice(i + 1).replace(/_/g, '・')}）`;
}
