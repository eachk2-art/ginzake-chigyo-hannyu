// 接続先URL（さくらのPHP版API）。
// ・.env の VITE_API_URL と、下のフォールバックURLは必ず同じ値にすること
// ・GAS版は2026-09-23に停止。スプレッドシートとGASのコードは凍結保存してある
const API_URL = import.meta.env.VITE_API_URL || 'https://e-taikyo.co.jp/chigyo/api/';

// ログインの有効期限切れ等（PHP版が code:'AUTH_REQUIRED' を返したとき）に呼ぶ処理。
// AuthContext 側で「ログアウトしてログイン画面に戻す」処理を登録する。
let onAuthExpired = null;
export function setAuthExpiredHandler(fn) {
  onAuthExpired = fn;
}

/**
 * API（PHP版／GAS版）へのPOST共通処理。
 * ・CORS制約のため Content-Type は必ず text/plain にする
 * ・loginId / role / refId は呼び出し側から渡された auth を毎回自動で付与する
 *   （GASはリクエストごとに独立しており、サーバー側にセッションを持たないため）
 * ・GASは負荷や再デプロイ直後などに、まれに一時的な通信エラー（404等）を
 *   返すことがあるため、失敗時は少し間を空けて自動で数回リトライする
 *   （新規開発プロンプト5章「連動する動作」の原則）
 */
const RETRY_COUNT = 3; // 初回＋最大3回リトライ＝最大4回試行
const RETRY_DELAY_MS = 600;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callAction(action, params = {}, auth = null) {
  const body = {
    action,
    loginId: auth?.loginId || '',
    role: auth?.role || '',
    refId: auth?.refId || '',
    token: auth?.token || '', // PHP版はこのトークンでログイン中の事業者を確認する（GAS版は無視する）
    ...params,
  };

  let lastError;
  for (let attempt = 0; attempt <= RETRY_COUNT; attempt++) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        // HTTPエラー（404等）はGAS側の一時的な不調のことが多いのでリトライ対象にする
        lastError = new Error(`通信エラーが発生しました（HTTP ${res.status}）`);
        if (attempt < RETRY_COUNT) {
          await sleep(RETRY_DELAY_MS * (attempt + 1));
          continue;
        }
        throw lastError;
      }

      const json = await res.json();
      if (!json.success) {
        // ログインの有効期限切れ等は、ログイン画面に戻す
        if (json.code === 'AUTH_REQUIRED' && onAuthExpired) onAuthExpired();
        // アプリ側の業務エラー（PIN違い等）はリトライしても直らないので即座に投げる
        throw new Error(json.error || '不明なエラーが発生しました');
      }
      return json.data;
    } catch (e) {
      lastError = e;
      // fetch自体が失敗した場合（電波状況等）や一時的なHTTPエラーはリトライする。
      // 業務エラー（success:falseから投げたもの）はリトライしても直らないので即座に投げる。
      if (attempt < RETRY_COUNT && isRetryable_(e)) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      throw lastError;
    }
  }
  throw lastError;
}

/** リトライして意味があるエラーか（通信そのものの失敗／一時的なHTTPエラー）を判定する */
function isRetryable_(e) {
  if (!e || typeof e.message !== 'string') return false;
  if (e.message.indexOf('通信エラーが発生しました') === 0) return true; // HTTPエラー
  if (e instanceof TypeError) return true; // fetch自体が失敗（ネットワーク不通等）
  return false;
}

// ---- 認証（ログイン前なのでauthなしで呼ぶ） ----
export const getLoginTiles = () => callAction('getLoginTiles');
export const login = (loginId, pin) => callAction('login', { loginId, pin });

// ---- マスタ ----
export const getMasters = (auth) => callAction('getMasters', {}, auth);

// ---- 積込予定 ----
export const getSchedules = (auth, params) => callAction('getSchedules', params, auth);
export const getScheduleDetail = (auth, scheduleId) =>
  callAction('getScheduleDetail', { scheduleId }, auth);
export const createSchedule = (auth, data) => callAction('createSchedule', { data }, auth);
export const updateSchedule = (auth, scheduleId, data) =>
  callAction('updateSchedule', { scheduleId, data }, auth);
export const cancelSchedule = (auth, scheduleId, reason) =>
  callAction('cancelSchedule', { scheduleId, reason }, auth);
// 取消にした予定を一覧から消す（管理者のみ。データは削除フラグで残る）
export const deleteSchedule = (auth, scheduleId) => callAction('deleteSchedule', { scheduleId }, auth);
export const bulkCreateSchedule = (auth, dataList) =>
  callAction('bulkCreateSchedule', { dataList }, auth);
// 積込順の並べ替え（納品先のまとまり・車輌のどちらの入れ替えにも使う）
export const reorderSchedules = (auth, date, ikebaId, scheduleIds) =>
  callAction('reorderSchedules', { date, ikebaId, scheduleIds }, auth);

// ---- 積込実績・搬入実績 ----
export const createLoadingResult = (auth, scheduleId, header, details) =>
  callAction('createLoadingResult', { scheduleId, header, details }, auth);
export const updateLoadingResult = (auth, resultId, header, details) =>
  callAction('updateLoadingResult', { resultId, header, details }, auth);
export const createDeliveryResult = (auth, scheduleId, resultId, data) =>
  callAction('createDeliveryResult', { scheduleId, resultId, data }, auth);
export const updateDeliveryResult = (auth, deliveryId, data) =>
  callAction('updateDeliveryResult', { deliveryId, data }, auth);
export const confirmDelivery = (auth, deliveryId) =>
  callAction('confirmDelivery', { deliveryId }, auth);

// ---- 一覧・連絡先・集計 ----
export const getCompletedSchedules = (auth, params) =>
  callAction('getCompletedSchedules', params, auth);
export const getCarrierSummary = (auth, params) => callAction('getCarrierSummary', params, auth);
export const getAggregates = (auth, aggregateType, params) =>
  callAction('getAggregates', { aggregateType, ...params }, auth);
export const getChangeLog = (auth, params) => callAction('getChangeLog', params, auth);
export const getLastUpdated = (auth) => callAction('getLastUpdated', {}, auth);

// ---- 一括操作（同じ海面業者向けの複数車輌にまとめて反映） ----
export const bulkSetLoadingResultField = (auth, scheduleIds, field, value) =>
  callAction('bulkSetLoadingResultField', { scheduleIds, field, value }, auth);
export const bulkSetDeliveryResultField = (auth, scheduleIds, field, value) =>
  callAction('bulkSetDeliveryResultField', { scheduleIds, field, value }, auth);
export const bulkConfirmDelivery = (auth, scheduleIds) =>
  callAction('bulkConfirmDelivery', { scheduleIds }, auth);

// ---- 海面業者向け：横浦地区の共同予定表 ----
export const getJointScheduleMarks = (auth, kaimenIds, dateFrom, dateTo) =>
  callAction('getJointScheduleMarks', { kaimenIds, dateFrom, dateTo }, auth);

// ---- マスタ管理（SCR-100、太協のみ。PHP版でのみ使える） ----
export const adminListMaster = (auth, master, includeDeleted = true) =>
  callAction('adminListMaster', { master, includeDeleted }, auth);
export const adminSuggestId = (auth, master, parentId) =>
  callAction('adminSuggestId', { master, parentId }, auth);
export const adminCreateMaster = (auth, master, data, pin = null) =>
  callAction('adminCreateMaster', pin === null ? { master, data } : { master, data, pin }, auth);
export const adminUpdateMaster = (auth, master, id, data) =>
  callAction('adminUpdateMaster', { master, id, data }, auth);
export const adminSetDeleted = (auth, master, id, deleted) =>
  callAction('adminSetDeleted', { master, id, deleted }, auth);
export const adminCheckUsage = (auth, master, id) =>
  callAction('adminCheckUsage', { master, id }, auth);
export const adminResetPin = (auth, loginId, newPin) =>
  callAction('adminResetPin', { loginId, newPin }, auth);
