// 浜池別搬入予定（★2026-11-25）の共通の計算
import { ikebaBaseName, pondNameOnly } from './masterLookup';
import { num } from './planUtils';

export const VACCINE_KG = 250; // ワクチンは250kgに1本（1tあたり4本）

export const lineKey = (ikeba, origin) => `${ikeba}|${origin && origin !== ikeba ? origin : ''}`;
export const cellKey = (kaimen, ikeba, origin) => `${kaimen || ''}|${lineKey(ikeba, origin)}`;

/** ワクチン本数（250kgに1本。端数は1本に切り上げ） */
export function vaccineOf(kg) {
  const k = num(kg);
  return k > 0 ? Math.ceil(k / VACCINE_KG - 1e-9) : 0;
}

/** 池場の行の名前：「玉山」、元の池があれば「玉山(大沢)」 */
export function lineName(masters, ikeba, origin) {
  const name = pondNameOnly(ikebaBaseName(masters, ikeba));
  return origin ? `${name}(${pondNameOnly(ikebaBaseName(masters, origin))})` : name;
}

/** 池場の都道府県（内水面業者マスタの都道府県） */
export function prefOfIkeba(masters, ikeba) {
  const p = (masters?.池場 || []).find((x) => x['池場ID'] === ikeba);
  const n = p ? (masters?.内水面業者 || []).find((x) => x['内水面業者ID'] === p['内水面業者ID']) : null;
  return n?.['都道府県'] || '';
}

/** 池場の行（列）の並び：マスタの池場の順 → 元の池なしが先 */
export function sortLines(masters, lines) {
  const ids = (masters?.池場 || []).map((p) => p['池場ID']);
  const idx = (id) => {
    const i = ids.indexOf(id);
    return i === -1 ? 999 : i;
  };
  return [...lines].sort((a, b) => idx(a.ikeba) - idx(b.ikeba) || (a.origin ? 1 : 0) - (b.origin ? 1 : 0) || idx(a.origin) - idx(b.origin));
}

/** シーズンの期間（搬入目標マスタの、そのシーズン名の行の 開始日の最小〜終了日の最大） */
export function seasonRange(masters, season) {
  const list = (masters?.搬入目標 || []).filter((g) => g['シーズン'] === season && g['開始日'] && g['終了日']);
  if (list.length === 0) return null;
  return {
    from: list.map((g) => g['開始日']).sort()[0],
    to: list.map((g) => g['終了日']).sort().reverse()[0],
  };
}

/** そのシーズンの、海面業者ごとの目標数量kg */
export function seasonTargets(masters, season) {
  const out = {};
  (masters?.搬入目標 || [])
    .filter((g) => g['シーズン'] === season)
    .forEach((g) => {
      out[g['海面業者ID']] = (out[g['海面業者ID']] || 0) + num(g['目標数量kg']);
    });
  return out;
}

/** t表示（小数は2桁まで） */
export function tText(kg) {
  const t = Math.round((num(kg) / 1000) * 100) / 100;
  return t === 0 ? '' : String(t);
}
