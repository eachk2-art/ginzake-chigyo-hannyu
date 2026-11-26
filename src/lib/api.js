// 接続先URL（さくらのPHP版API）。
// ・.env の VITE_API_URL と、下のフォールバックURLは必ず同じ値にすること
// ・GAS版は2026-09-23に停止。スプレッドシートとGASのコードは凍結保存してある
// ・★2026-11-24 親子方式：この版の画面は api2 専用。ローカル確認は .env.development.local で api2 に向ける。
//   切り替えの日に .env とこのフォールバックURLを api2 に変える
const API_URL = import.meta.env.VITE_API_URL || 'https://e-taikyo.co.jp/chigyo/api2/';

// ログインの有効期限切れ等（PHP版が code:'AUTH_REQUIRED' を返したとき）に呼ぶ処理。
// AuthContext 側で「ログアウトしてログイン画面に戻す」処理を登録する。
let onAuthExpired = null;
export function setAuthExpiredHandler(fn) {
  onAuthExpired = fn;
}

/**
 * APIへのPOST共通処理。
 * ・CORS制約のため Content-Type は必ず text/plain にする
 * ・失敗時（通信そのものの失敗・HTTPエラー）は少し間を空けて自動で数回リトライする
 * ・業務エラーは error.code にサーバーのコード（例：MERGE_CONFIRM）を入れて投げる
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
    token: auth?.token || '', // PHP版はこのトークンでログイン中の事業者を確認する
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
        lastError = new Error(`通信エラーが発生しました（HTTP ${res.status}）`);
        if (attempt < RETRY_COUNT) {
          await sleep(RETRY_DELAY_MS * (attempt + 1));
          continue;
        }
        throw lastError;
      }

      const json = await res.json();
      if (!json.success) {
        if (json.code === 'AUTH_REQUIRED' && onAuthExpired) onAuthExpired();
        // 業務エラーはリトライしても直らないので即座に投げる
        const err = new Error(json.error || '不明なエラーが発生しました');
        err.code = json.code || '';
        err.business = true;
        throw err;
      }
      return json.data;
    } catch (e) {
      lastError = e;
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
  if (!e || typeof e.message !== 'string' || e.business) return false;
  if (e.message.indexOf('通信エラーが発生しました') === 0) return true; // HTTPエラー
  if (e instanceof TypeError) return true; // fetch自体が失敗（ネットワーク不通等）
  return false;
}

// ---- 認証（ログイン前なのでauthなしで呼ぶ） ----
export const getLoginTiles = (entryKey) => callAction('getLoginTiles', { entryKey });
export const login = (loginId, pin, entryKey) => callAction('login', { loginId, pin, entryKey });

// ---- 表示切替（★2026-11-13）。太協・管理者が、他の事業者の見え方を閲覧専用で確認する ----
export const getViewTargets = (auth) => callAction('getViewTargets', {}, auth);
export const switchView = (auth, targetLoginId) => callAction('switchView', { targetLoginId }, auth);
export const endView = (auth) => callAction('endView', {}, auth);

// ---- マスタ ----
export const getMasters = (auth) => callAction('getMasters', {}, auth);

// ---- 便（割当）の形での読み取り（予定表・配車チェックなどが使う） ----
export const getSchedules = (auth, params) => callAction('getSchedules', params, auth);
export const getScheduleDetail = (auth, scheduleId) => callAction('getScheduleDetail', { scheduleId }, auth);
export const getCompletedSchedules = (auth, params) => callAction('getCompletedSchedules', params, auth);
export const getChangeLog = (auth, params) => callAction('getChangeLog', params, auth);
export const getLastUpdated = (auth) => callAction('getLastUpdated', {}, auth);

// 中止理由の選択肢（サーバー側の STOP_REASONS と合わせる）
export const STOP_REASONS = ['積雪', '暴風', '時化', 'その他'];

// ==== 親子方式（★2026-11-24） ====
// 親＝搬入予定（日付×池場×海面業者×浜）、割当＝親にぶら下がる車輌（t_schedule の行）、
// 運行＝日付×車輌×回目（積込・計量はここに入れる）、池場日誌＝日付×池場

// ---- 読み取り ----
/** 日付 → 池場（池場日誌） → 親 → 割当。params：{ dateFrom, dateTo, groupVisible, kaimenId } */
export const getPlanTree = (auth, params) => callAction('getPlanTree', params, auth);
export const getPlanDetail = (auth, planId) => callAction('getPlanDetail', { planId }, auth);
export const getRunDetail = (auth, runId) => callAction('getRunDetail', { runId }, auth);

// ---- 親（搬入予定） ----
/** dataList：[{積込日, 池場ID, 海面業者ID, 配送先ID, 予定数量kg, 予定入れ目率, 到着予定時刻, 由来池場ID, 備考,
 *   予定海面立会者ID1/2（管理者のみ）, 車輌: [{車輌ID, 割当数量kg, 回目}]}] */
export const createPlans = (auth, dataList) => callAction('createPlans', { dataList }, auth);
export const updatePlan = (auth, planId, data) => callAction('updatePlan', { planId, data }, auth);
/** 浜の変更。同じ浜の親があると error.code === 'MERGE_CONFIRM'。まとめるときは merge=true で呼び直す */
export const changePlanHama = (auth, planId, deliveryPointId, merge = false) =>
  callAction('changePlanHama', { planId, deliveryPointId, merge }, auth);
export const cancelPlan = (auth, planId, reason) => callAction('cancelPlan', { planId, reason }, auth);
export const deletePlan = (auth, planId) => callAction('deletePlan', { planId }, auth);
export const stopPlan = (auth, planId, reason, note) => callAction('stopPlan', { planId, reason, note }, auth);
export const resumePlan = (auth, planId) => callAction('resumePlan', { planId }, auth);
export const reorderPlans = (auth, date, ikebaId, planIds) =>
  callAction('reorderPlans', { date, ikebaId, planIds }, auth);

// ---- 割当（車輌） ----
export const assignVehicle = (auth, planId, vehicleId, kg, runNo) =>
  callAction('assignVehicle', { planId, vehicleId, kg, runNo }, auth);
/** changes：{ kg, vehicleId, runNo } のうち変えるものだけ */
export const updateAllocation = (auth, scheduleId, changes) =>
  callAction('updateAllocation', { scheduleId, ...changes }, auth);
export const unassignVehicle = (auth, scheduleId) => callAction('unassignVehicle', { scheduleId }, auth);
export const stopAllocation = (auth, scheduleId, reason, note) =>
  callAction('stopAllocation', { scheduleId, reason, note }, auth);
export const resumeAllocation = (auth, scheduleId) => callAction('resumeAllocation', { scheduleId }, auth);
export const reorderAllocations = (auth, planId, scheduleIds) =>
  callAction('reorderAllocations', { planId, scheduleIds }, auth);

// ---- 積込（運行）・池場日誌 ----
/** header：{積込開始時刻, 積込終了時刻, ワクチン本数, 積込回数, 備考}
 *  details：[{明細ID?, 池場ID, 実績数量kg, 平均サイズg, 行き先搬入予定ID}]（あるべき最終形を送る） */
export const saveRun = (auth, runId, header, details) => callAction('saveRun', { runId, header, details }, auth);
/** data：{天候, 気温, 水温, 溶存酸素, 内水面立会者ID1, 内水面立会者ID2, 備考} */
export const savePondLog = (auth, date, ikebaId, data) => callAction('savePondLog', { date, ikebaId, data }, auth);

// ---- 現場（浜）・完了確認 ----
export const savePlanDelivery = (auth, planId, data) => callAction('savePlanDelivery', { planId, data }, auth);
/** data：{車輌水温, 出発時刻上書き, 浜到着時刻上書き, 作業開始時刻上書き, 作業終了時刻上書き} */
export const saveAllocationDelivery = (auth, scheduleId, data) =>
  callAction('saveAllocationDelivery', { scheduleId, data }, auth);
export const confirmPlans = (auth, planIds) => callAction('confirmPlans', { planIds }, auth);
/** operation：changeDate（extra.date）／changeIkeba（extra.ikebaId）／cancel（extra.reason）／deleteCancelled */
export const bulkEditPlans = (auth, planIds, operation, extra = {}) =>
  callAction('bulkEditPlans', { planIds, operation, ...extra }, auth);

// ---- 海面業者向け：横浦地区の共同予定表 ----
export const getJointScheduleMarks = (auth, kaimenIds, dateFrom, dateTo) =>
  callAction('getJointScheduleMarks', { kaimenIds, dateFrom, dateTo }, auth);

// ---- 運賃（SCR-060）。閲覧は太協も可、金額の修正・締めは管理者のみ ----
export const getFareSummary = (auth, dateFrom, dateTo, qtyMode, carrierId) =>
  callAction('getFareSummary', { dateFrom, dateTo, qtyMode, carrierId }, auth);
export const setScheduleFare = (auth, scheduleId, billedFare, reason, note) =>
  callAction('setScheduleFare', { scheduleId, billedFare, reason, note }, auth);
// 待機料（中止便のみ。管理者のみ）★2026-11-06
export const setScheduleStandbyFare = (auth, scheduleId, standbyFare, billedFare, reason, note) =>
  callAction('setScheduleFare', { scheduleId, standbyFare, billedFare, reason, note }, auth);
export const listFareClosings = (auth) => callAction('listFareClosings', {}, auth);
export const closeFares = (auth, dateFrom, dateTo, qtyMode, title) =>
  callAction('closeFares', { dateFrom, dateTo, qtyMode, title }, auth);
export const reopenFares = (auth, closingId) => callAction('reopenFares', { closingId }, auth);
export const exportFares = (auth, dateFrom, dateTo, qtyMode, carrierId, scope, format) =>
  callAction('exportFares', { dateFrom, dateTo, qtyMode, carrierId, scope, format }, auth);

// ---- 浜池別搬入予定（★2026-11-25、太協・管理者） ----
/** dateFrom・dateTo は、実際の予定（搬入予定）の合計を集める積込日の範囲（シーズンの期間） */
export const getSeasonPlan = (auth, season, dateFrom, dateTo) =>
  callAction('getSeasonPlan', { season, dateFrom, dateTo }, auth);
/** rows：[{海面業者ID（空＝池場の出荷予定）, 池場ID, 由来池場ID, 予定数量kg}]（シーズンの表の最終形） */
export const saveSeasonPlan = (auth, season, rows) => callAction('saveSeasonPlan', { season, rows }, auth);

// ---- 積込・搬入の全記録（★2026-11-26、太協・管理者。運賃は管理者だけ） ----
export const getRecords = (auth, dateFrom, dateTo) => callAction('getRecords', { dateFrom, dateTo }, auth);

// ---- 集計ダッシュボード（SCR-130、太協・管理者）★2026-11-06 ----
export const getDashboard = (auth, params) => callAction('getDashboard', params || {}, auth);

// ---- マスタ管理（SCR-100） ----
export const adminListMaster = (auth, master, includeDeleted = true) =>
  callAction('adminListMaster', { master, includeDeleted }, auth);
export const adminSuggestId = (auth, master, parentId) =>
  callAction('adminSuggestId', { master, parentId }, auth);
export const adminCreateMaster = (auth, master, data, pin = null) =>
  callAction('adminCreateMaster', pin === null ? { master, data } : { master, data, pin }, auth);
export const adminUpdateMaster = (auth, master, id, data) =>
  callAction('adminUpdateMaster', { master, id, data }, auth);
export const adminBulkSaveMaster = (auth, master, rows) =>
  callAction('adminBulkSaveMaster', { master, rows }, auth);
export const adminSetDeleted = (auth, master, id, deleted) =>
  callAction('adminSetDeleted', { master, id, deleted }, auth);
export const adminCheckUsage = (auth, master, id) =>
  callAction('adminCheckUsage', { master, id }, auth);
export const adminResetPin = (auth, loginId, newPin) =>
  callAction('adminResetPin', { loginId, newPin }, auth);
