// 親子方式（★2026-11-24）の画面で共通に使う小さな関数
import { isAdmin } from './roles';

/** 数値に（空・数値でないものは0） */
export function num(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

/** kgの表示（整数なら桁区切り、小数は1桁まで） */
export function kgText(v) {
  const n = Math.round(num(v) * 10) / 10;
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/** 実際には運ばれない状態か */
export function isInactiveStatus(st) {
  return st === '取消' || st === '中止';
}

/** 納品完了の親は、管理者以外は書き換えられない（サーバーでも同じ判定をしている） */
export function isPlanLocked(plan, role) {
  return plan?.['ステータス'] === '納品完了' && !isAdmin(role);
}

/** 立会者の選択肢（太協担当） */
export function witnessOptions(masters) {
  return (masters?.担当者 || []).filter((t) => t['区分'] === '太協担当');
}

/** その海面業者の浜（配送先）。登録が無ければ全件 */
export function pointsOfKaimen(masters, kaimenId) {
  const all = masters?.配送先 || [];
  const mine = all.filter((d) => d['海面業者ID'] === kaimenId);
  return mine.length > 0 ? mine : all;
}

/** 出荷池と同じ内水面業者の、出荷池以外の池（元の池の選択肢） */
export function originOptions(masters, ikebaId) {
  const list = masters?.池場 || [];
  const ship = list.find((p) => p['池場ID'] === ikebaId);
  if (!ship) return [];
  return list.filter((p) => p['池場ID'] !== ikebaId && p['内水面業者ID'] === ship['内水面業者ID']);
}

/** 池場の並び（マスタの順） */
export function ikebaOrderIndex(masters) {
  const ids = (masters?.池場 || []).map((p) => p['池場ID']);
  return (id) => {
    const i = ids.indexOf(id);
    return i === -1 ? ids.length : i;
  };
}

/**
 * 計量明細から尾数を出す（確定仕様）
 *   水槽ごとの暫定尾数 ＝ 計量値 ÷ 平均サイズ
 *   全体の平均サイズ   ＝ 計量合計（入れ目込み）÷ 暫定尾数の合計
 *   尾数（正味）       ＝ 予定数量 ÷ 全体の平均サイズ
 *   尾数（入れ目込み） ＝ 計量合計 ÷ 全体の平均サイズ
 * 計算は丸めずに行い、表示のときだけ切り捨てる
 */
export function fishSummary(rows, plannedKg) {
  let kg = 0;
  let fishRaw = 0;
  (rows || []).forEach((r) => {
    const k = num(r['実績数量kg']);
    const size = num(r['平均サイズg']);
    kg += k;
    if (k > 0 && size > 0) fishRaw += (k * 1000) / size;
  });
  if (fishRaw <= 0) return { kg, fishRaw: 0, avg: 0, fishNet: 0, fishGross: 0 };
  const avgRaw = (kg * 1000) / fishRaw;
  const planned = num(plannedKg);
  return {
    kg,
    fishRaw,
    avg: Math.floor(avgRaw * 10) / 10,
    fishNet: planned > 0 ? Math.floor((planned * 1000) / avgRaw) : 0,
    fishGross: Math.floor((kg * 1000) / avgRaw),
  };
}

/** 予定数量 × (1 + 入れ目率/100) を整数で */
export function weighTarget(plannedKg, iremeRate) {
  return Math.round(num(plannedKg) * (1 + num(iremeRate) / 100));
}
