// ステータスの「進み具合」の順序。数字が小さいほど手前の段階。
const STATUS_ORDER = {
  保留: 0,
  予定: 1,
  積込中: 2,
  輸送中: 3,
  搬入中: 4,
  搬入完了: 5,
  納品完了: 6,
};

/**
 * 複数車輌（同じ海面業者向けの1セット）の中から、業者名の横に出す
 * 「代表ステータス」を決める。
 * ・取消の車輌は判定から除外する（無かったものとして扱う）
 * ・残った車輌の中で、一番進んでいない（手前の）段階を代表とする
 * ・全車輌が取消なら「取消」を返す
 */
export function representativeStatus(items) {
  const active = items.filter((s) => s['ステータス'] !== '取消');
  if (active.length === 0) return '取消';
  return active.reduce((worst, s) => {
    const cur = STATUS_ORDER[s['ステータス']] ?? 1;
    const prev = STATUS_ORDER[worst] ?? 1;
    return cur < prev ? s['ステータス'] : worst;
  }, active[0]['ステータス']);
}
