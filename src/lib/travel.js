// 運行時間の目安（★2026-11-26 段階1）の計算
//   平均ではなく中央値を目安にする（雪の日など、たまの大きな遅れに引きずられないように）
//   ふだんの幅＝真ん中の半分が入る範囲（25%〜75%）

/** 中央値などをまとめて出す。values は分の配列 */
export function stats(values) {
  const v = values.filter((x) => typeof x === 'number' && x > 0).sort((a, b) => a - b);
  const n = v.length;
  if (n === 0) return null;
  const q = (p) => {
    const pos = (n - 1) * p;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return v[lo] + (v[hi] - v[lo]) * (pos - lo);
  };
  return { n, median: Math.round(q(0.5)), q1: Math.round(q(0.25)), q3: Math.round(q(0.75)), min: v[0], max: v[n - 1] };
}

/** 分 → 「2時間30分」 */
export function hm(min) {
  if (min === null || min === undefined || min === '' || isNaN(min)) return '';
  const m = Math.round(Number(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h > 0 ? `${h}時間${r > 0 ? `${r}分` : ''}` : `${r}分`;
}

/** 分 → 「2:30」（表用の短い形） */
export function hmShort(min) {
  if (min === null || min === undefined || min === '' || isNaN(min)) return '';
  const m = Math.round(Number(min));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** 出発の時間帯 */
export function departBand(t) {
  const h = Number(String(t || '').split(':')[0]);
  if (isNaN(h)) return '';
  if (h < 6) return '6時前';
  if (h < 9) return '6〜9時';
  if (h < 12) return '9〜12時';
  return '12時以降';
}

/** 条件ごとに分けて目安を出す：[{label, s}]（件数の多い順） */
export function breakdown(samples, keyFn) {
  const m = new Map();
  samples.forEach((x) => {
    const k = keyFn(x) || '（不明）';
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x['所要分']);
  });
  return Array.from(m.entries())
    .map(([label, vals]) => ({ label, s: stats(vals) }))
    .filter((x) => x.s)
    .sort((a, b) => b.s.n - a.s.n);
}

export const FEW = 3; // これより少ない件数は「参考」として薄く出す
