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

// 実際には運ばれていない状態（台数・数量の合計から外す）★2026-11-06
export const INACTIVE_STATUSES = ['取消', '中止'];

export function isInactive(status) {
  return INACTIVE_STATUSES.includes(status);
}

/**
 * 複数車輌（同じ海面業者向けの1セット）の中から、業者名の横に出す
 * 「代表ステータス」を決める。
 * ・取消・中止の車輌は判定から除外する（運ばれていないものとして扱う）
 * ・残った車輌の中で、一番進んでいない（手前の）段階を代表とする
 * ・全車輌が取消／中止なら、その状態を返す（混在していれば「中止」を優先）
 */
export function representativeStatus(items) {
  const active = items.filter((s) => !isInactive(s['ステータス']));
  if (active.length === 0) {
    return items.some((s) => s['ステータス'] === '中止') ? '中止' : '取消';
  }
  return active.reduce((worst, s) => {
    const cur = STATUS_ORDER[s['ステータス']] ?? 1;
    const prev = STATUS_ORDER[worst] ?? 1;
    return cur < prev ? s['ステータス'] : worst;
  }, active[0]['ステータス']);
}
