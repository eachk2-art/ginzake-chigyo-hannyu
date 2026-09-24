// ロール（事業者区分）の判定
// ★2026-09-23：太協を「管理者」と「太協（一般）」に分けた。
// ・管理者：マスタ管理・PIN再設定・変更履歴・運賃単価の閲覧・予定の取消・完了確認
// ・太協（一般）：予定の登録・編集、実績の入力、一括操作
// ※画面の出し分けはあくまで使いやすさのためで、権限の判定はPHP側でも必ず行っている
export const ROLE_ADMIN = '管理者';
export const ROLE_TAIKYO = '太協';

/** 管理者か */
export const isAdmin = (role) => role === ROLE_ADMIN;

/** 太協側（管理者を含む）か */
export const isTaikyo = (role) => role === ROLE_TAIKYO || role === ROLE_ADMIN;
