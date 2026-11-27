import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { getPlanDetail, stopPlan, resumePlan, cancelPlan, deletePlan, confirmPlans } from '../lib/api';
import { formatJP, formatDateTimeJP } from '../lib/dateUtils';
import { ikebaWithOrigin, kaimenName, deliveryDestName } from '../lib/masterLookup';
import { ErrorMsg, LoadingMsg, StatusBadge } from '../components/UI';
import BusyButton from '../components/BusyButton';
import { ScreenFrame, Section, StopPanel, inputStyle, noticeStyle, smallBtnStyle } from '../components/FormParts';
import AllocationSection from '../components/plan/AllocationSection';
import PlanDeliveryForm from '../components/plan/PlanDeliveryForm';
import PlanEditPanel from '../components/plan/PlanEditPanel';
import { isAdmin, isTaikyo } from '../lib/roles';
import { isPlanLocked } from '../lib/planUtils';
import { useStudyFlags } from '../lib/useStudyFlags';

/**
 * 納品先（搬入予定＝親）の画面（★2026-11-24 親子方式）
 * 今までの「この車輌の操作」「予定の編集」「搬入実績の入力」「この納品先へまとめて入力」を1つにした。
 *   ・車輌（割当）の一覧：積込・計量へ、車ごとの入力、車輌の割当・変更・外す、一部中止
 *   ・現場（浜）の入力：時刻・測定・生簀・不備・海面立会者（納品先に1回）
 *   ・予定の内容：管理者が変更、浜の変更は太協も可
 *   ・中止・取消・完了確認
 */
export default function PlanScreen({ planId, onClose, onOpenRun, onOpenPondLog, onOpenArrivalPlan, onReplacePlan }) {
  const { auth } = useAuth();
  const { masters } = useMasters();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0); // 保存のたびに入力欄を作り直す（最新の値で開き直す）

  const load = useCallback(async () => {
    setError('');
    try {
      const d = await getPlanDetail(auth, planId);
      setData(d);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(e.message);
    }
  }, [auth, planId]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  // ★2026-11-27 この日・この池場の「到着時刻の検討」（保存してあれば、この便の見込みを出す）
  const pDate = data?.plan?.['積込日'] || '';
  const pIkeba = data?.plan?.['池場ID'] || '';
  const studyFlags = useStudyFlags(auth, pDate, pDate, isTaikyo(auth.role) && !!pDate, version);
  const studyFlag = studyFlags.get(`${pDate}|${pIkeba}`);

  if (error && !data) {
    return (
      <ScreenFrame title="納品先" onClose={onClose}>
        <ErrorMsg message={`読み込みに失敗しました：${error}`} onRetry={load} />
      </ScreenFrame>
    );
  }
  if (!data) {
    return (
      <ScreenFrame title="納品先" onClose={onClose}>
        <LoadingMsg>読み込んでいます…</LoadingMsg>
      </ScreenFrame>
    );
  }

  const plan = data.plan;
  const runs = data.runs || [];
  const st = plan['ステータス'];
  const state = plan['予定状態'];
  const locked = isPlanLocked(plan, auth.role);
  const inactive = state === '取消' || state === '中止';
  const noVehicle = (plan['割当'] || []).length === 0;

  let deliveryDisabled = '';
  if (!isTaikyo(auth.role)) deliveryDisabled = '閲覧のみです。';
  else if (inactive) deliveryDisabled = `この納品先は「${state}」のため、現場の入力はできません。`;
  else if (locked) deliveryDisabled = 'この納品先は納品完了です。修正が必要な場合は管理者に依頼してください。';
  else if (noVehicle) deliveryDisabled = '車輌が未定のため、現場の入力はまだできません。先に管理者が車輌を割り当てます。';

  return (
    <ScreenFrame
      title={`${kaimenName(masters, plan['海面業者ID'])}`}
      sub={
        <>
          {formatJP(plan['積込日'])}　{ikebaWithOrigin(masters, plan)} → 浜：{deliveryDestName(masters, plan['配送先ID'])}
          <span style={{ marginLeft: 8 }}>
            <StatusBadge status={st} />
          </span>
          <div style={{ marginTop: 8 }}>
            <button style={smallBtnStyle} onClick={() => onOpenPondLog(plan['積込日'], plan['池場ID'])}>
              この日の池場日誌（天候・水温・内水面立会者） ›
            </button>
            {isTaikyo(auth.role) && onOpenArrivalPlan && (
              <button style={{ ...smallBtnStyle, marginLeft: 8 }} onClick={() => onOpenArrivalPlan(plan['積込日'], plan['池場ID'])}>
                この日の到着時刻の検討 ›
              </button>
            )}
          </div>
          {isTaikyo(auth.role) && !plan['浜到着時刻'] && (plan['到着予定時刻'] || studyFlag) && (
            <div style={{ marginTop: 6, fontSize: 14 }}>
              到着予定時刻：{plan['到着予定時刻'] || '未入力'}
              {studyFlag?.['到着']?.[plan['搬入予定ID']] && (
                <span style={{ color: 'var(--c-text-3)', marginLeft: 8 }}>
                  （到着の検討 {formatDateTimeJP(studyFlag['保存日時'])} 保存の見込み：{studyFlag['到着'][plan['搬入予定ID']]}
                  {studyFlag['予定と違う'] ? '・検討後に予定が変わっています' : ''}）
                </span>
              )}
            </div>
          )}
        </>
      }
      onClose={onClose}
    >
      {error && <ErrorMsg message={error} onRetry={load} />}

      {locked && <div style={noticeStyle}>この納品先は納品完了です。内容の修正が必要な場合は管理者に依頼してください。</div>}
      {state === '中止' && (
        <div style={{ ...noticeStyle, borderColor: '#9575cd' }}>
          この納品先は中止です。中止理由：{plan['中止理由']}
          {plan['中止理由メモ'] ? `／${plan['中止理由メモ']}` : ''}
          <br />
          待機料が発生する場合は、運賃の画面（管理者）で車輌ごとに入力してください。
        </div>
      )}
      {state === '取消' && <div style={noticeStyle}>この納品先は取消です。{plan['備考'] ? `（${plan['備考']}）` : ''}</div>}

      <AllocationSection
        key={`a${version}`}
        auth={auth}
        masters={masters}
        plan={plan}
        runs={runs}
        locked={locked}
        onChanged={load}
        onOpenRun={(runId) => onOpenRun(runId, plan['搬入予定ID'])}
      />

      <PlanDeliveryForm
        key={`d${version}`}
        auth={auth}
        masters={masters}
        plan={plan}
        runs={runs}
        disabledReason={deliveryDisabled}
        onSaved={load}
      />

      <PlanEditPanel
        key={`e${version}`}
        auth={auth}
        masters={masters}
        plan={plan}
        locked={locked}
        onChanged={load}
        onMerged={(newId) => onReplacePlan(newId)}
      />

      <StatePanel key={`s${version}`} auth={auth} plan={plan} locked={locked} noVehicle={noVehicle} onChanged={load} onDeleted={onClose} />
    </ScreenFrame>
  );
}

/** 中止・取消・削除・完了確認 */
function StatePanel({ auth, plan, locked, noVehicle, onChanged, onDeleted }) {
  const admin = isAdmin(auth.role);
  const taikyo = isTaikyo(auth.role);
  const state = plan['予定状態'];
  const confirmed = plan['完了確認'] === 'あり';
  const [panel, setPanel] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const canStop = taikyo && !locked && state !== '取消' && state !== '中止';
  const canResume = admin && state === '中止';
  const canCancel = admin && state !== '取消' && !confirmed;
  const canDelete = admin && state === '取消';
  const canConfirm = admin && !confirmed && state === '通常' && !noVehicle;

  if (!taikyo) return null;

  async function run(fn) {
    setError('');
    setInfo('');
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <Section title="中止・取消・完了確認">
      {confirmed && (
        <div style={{ background: 'var(--c-ok-bg)', color: 'var(--c-ok)', padding: '10px 14px', borderRadius: 10, fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
          ✓ 完了確認済み{plan['完了確認日時'] ? `（${formatDateTimeJP(plan['完了確認日時'])}）` : ''}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {canConfirm && (
          <button style={{ ...smallBtnStyle, color: 'var(--c-ok)', borderColor: 'var(--c-ok)' }} onClick={() => setPanel(panel === 'confirm' ? '' : 'confirm')}>
            完了確認をする
          </button>
        )}
        {canStop && (
          <button style={{ ...smallBtnStyle, color: '#b39ddb', borderColor: '#9575cd' }} onClick={() => setPanel(panel === 'stop' ? '' : 'stop')}>
            納品先ごと中止にする
          </button>
        )}
        {canResume && (
          <BusyButton
            variant="ghost"
            onClick={() =>
              run(async () => {
                if (!window.confirm('中止を取り消して、通常の予定に戻しますか？\n\n車輌の中止も一緒に戻ります。中止理由と待機料は消えます。')) return;
                await resumePlan(auth, plan['搬入予定ID']);
                await onChanged();
              })
            }
          >
            中止を取り消す
          </BusyButton>
        )}
        {canCancel && (
          <button style={{ ...smallBtnStyle, color: 'var(--c-danger)' }} onClick={() => setPanel(panel === 'cancel' ? '' : 'cancel')}>
            取消にする
          </button>
        )}
        {canDelete && (
          <BusyButton
            variant="danger"
            onClick={() =>
              run(async () => {
                if (!window.confirm('この取消予定を一覧から削除しますか？\n\n（データはデータベースに残るので、必要なら戻せます）')) return;
                await deletePlan(auth, plan['搬入予定ID']);
                onDeleted();
              })
            }
          >
            取消予定を削除
          </BusyButton>
        )}
      </div>
      {!canConfirm && admin && !confirmed && state === '通常' && noVehicle && (
        <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginBottom: 10 }}>車輌が未定のため、完了確認はできません。</div>
      )}

      {panel === 'confirm' && (
        <div style={{ padding: 14, border: '1px solid var(--c-ok)', borderRadius: 10, marginBottom: 12, background: 'var(--c-bg)' }}>
          <div style={{ fontSize: 14, color: 'var(--c-ok)', marginBottom: 10, lineHeight: 1.6 }}>
            完了確認を行うと、この納品先は「納品完了」になります（時刻などが未入力でも確認できます）。
            <br />
            搬入日が空なら積込日、海面立会者が空なら予定の立会者が入ります。
          </div>
          <BusyButton
            onClick={() =>
              run(async () => {
                const res = await confirmPlans(auth, [plan['搬入予定ID']]);
                const skipped = res?.skipped || [];
                if (skipped.length > 0) setInfo(`完了確認できませんでした：${skipped[0]['理由']}`);
                setPanel('');
                await onChanged();
              })
            }
          >
            完了確認を確定する
          </BusyButton>
        </div>
      )}

      {panel === 'stop' && (
        <StopPanel
          description="天候・海況などで、この納品先が実行できなかったときに使います。付いている車輌も全部中止になります。予定そのものが無くなった場合は「取消」（管理者のみ）です。"
          onSubmit={async (reason, note) => {
            await stopPlan(auth, plan['搬入予定ID'], reason, note);
            setPanel('');
            await onChanged();
          }}
        />
      )}

      {panel === 'cancel' && (
        <div style={{ padding: 14, border: '1px solid var(--c-danger)', borderRadius: 10, marginBottom: 12, background: 'var(--c-bg)' }}>
          <div style={{ fontSize: 14, color: 'var(--c-danger)', marginBottom: 10 }}>
            予定そのものが無くなったときに使います。付いている車輌も取消になります。理由は備考に入ります。
          </div>
          <input
            type="text"
            placeholder="取消の理由（任意）"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            style={{ ...inputStyle, marginBottom: 10 }}
          />
          <BusyButton
            variant="danger"
            onClick={() =>
              run(async () => {
                await cancelPlan(auth, plan['搬入予定ID'], cancelReason);
                setPanel('');
                await onChanged();
              })
            }
          >
            取消を確定する
          </BusyButton>
        </div>
      )}

      <ErrorMsg message={error} />
      {info && <div style={{ fontSize: 14, color: 'var(--c-warn)', marginBottom: 10 }}>{info}</div>}
    </Section>
  );
}
