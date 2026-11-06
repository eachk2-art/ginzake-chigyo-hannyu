import { useState } from 'react';
import { useMasters } from '../context/MasterContext';
import { formatJP } from '../lib/dateUtils';
import { ikebaName, vehicleLabel, kaimenName } from '../lib/masterLookup';
import { StatusBadge, ErrorMsg } from '../components/UI';
import BusyButton from '../components/BusyButton';
import { useAuth } from '../context/AuthContext';
import { isAdmin, isTaikyo } from '../lib/roles';
import { stopSchedule, STOP_REASONS } from '../lib/api';

export default function EditMenuScreen({ schedule, onSelect, onClose, onChanged }) {
  const { masters } = useMasters();
  const { auth } = useAuth();
  // 納品完了の予定は、管理者以外は実績の入力・修正ができない
  const locked = schedule['ステータス'] === '納品完了' && !isAdmin(auth.role);
  // ★2026-11-06：取消・中止の便は、実績を入力する画面を出さない
  const inactive = schedule['ステータス'] === '取消' || schedule['ステータス'] === '中止';
  // 中止は当日の判断になるため、太協も操作できる（金額の入力は管理者のみ）★2026-11-06
  const canStop = isTaikyo(auth.role) && !inactive;

  const [showStop, setShowStop] = useState(false);
  const [stopReason, setStopReason] = useState('');
  const [stopNote, setStopNote] = useState('');
  const [error, setError] = useState('');

  async function handleStop() {
    setError('');
    try {
      await stopSchedule(auth, schedule['積込予定ID'], stopReason, stopNote);
      onChanged ? onChanged() : onClose?.();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', color: 'var(--c-text)', padding: '20px 16px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>この車輌の操作</h2>
        <button onClick={onClose} style={closeBtnStyle}>
          閉じる
        </button>
      </div>
      <div style={{ fontSize: 14, color: 'var(--c-text-2)', marginBottom: 24 }}>
        {formatJP(schedule['積込日'])}　{ikebaName(masters, schedule['池場ID'])}
        {vehicleLabel(masters, schedule['車輌ID'])}　→　{kaimenName(masters, schedule['海面業者ID'])}
        {schedule['ステータス'] && (
          <span style={{ marginLeft: 8 }}>
            <StatusBadge status={schedule['ステータス']} />
          </span>
        )}
      </div>

      {/* 納品完了になった予定は、管理者以外は実績を触れない（★2026-09-24） */}
      {locked && (
        <div style={noticeStyle}>この予定は納品完了です。内容の修正が必要な場合は管理者に依頼してください。</div>
      )}

      {/* 取消・中止の便は実績を入力しない（★2026-11-06） */}
      {inactive && (
        <div style={noticeStyle}>
          この便は「{schedule['ステータス']}」のため、実績の入力はできません。
          {schedule['ステータス'] === '中止' && schedule['中止理由'] && (
            <>
              <br />
              中止理由：{schedule['中止理由']}
              {schedule['中止理由メモ'] ? `／${schedule['中止理由メモ']}` : ''}
            </>
          )}
          {schedule['ステータス'] === '中止' && (
            <>
              <br />
              待機料が発生する場合は、運賃の画面（管理者）で入力してください。
              {isAdmin(auth.role) && <><br />中止をやめて通常に戻すときは「予定の編集」から操作してください。</>}
            </>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* 予定の編集は管理者のみ（★2026-09-23） */}
        {isAdmin(auth.role) && <MenuButton onClick={() => onSelect('scheduleForm')}>予定の編集</MenuButton>}
        {!locked && !inactive && (
          <>
            <MenuButton onClick={() => onSelect('loadingResultForm')}>積込実績を入力する</MenuButton>
            <MenuButton onClick={() => onSelect('deliveryResultForm')}>搬入実績を入力する</MenuButton>
            <MenuButton onClick={() => onSelect('bulkActions')}>この納品先へまとめて入力する</MenuButton>
          </>
        )}
        {/* 中止（天候・海況などで当日実行できなかった便）★2026-11-06 */}
        {canStop && (
          <MenuButton onClick={() => setShowStop((v) => !v)} accent="#5e35b1">
            この便を中止にする
          </MenuButton>
        )}
      </div>

      {canStop && showStop && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            border: '1px solid #5e35b1',
            borderRadius: 10,
            background: 'var(--c-bg-2)',
          }}
        >
          <div style={{ fontSize: 14, color: '#5e35b1', marginBottom: 10, lineHeight: 1.6 }}>
            天候・海況などで、この便が実行できなかったときに使います。
            <br />
            予定そのものが無くなった場合は「取消」（管理者のみ）です。待機料が発生する場合は、あとから運賃の画面で入力します。
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {STOP_REASONS.map((r) => (
              <button
                key={r}
                onClick={() => setStopReason(r)}
                style={{
                  minHeight: 42,
                  padding: '8px 18px',
                  borderRadius: 8,
                  fontSize: 15,
                  border: '1px solid var(--c-border-2)',
                  background: stopReason === r ? '#5e35b1' : 'transparent',
                  color: stopReason === r ? '#fff' : 'var(--c-text)',
                  cursor: 'pointer',
                }}
              >
                {r}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder={stopReason === 'その他' ? '中止の理由を入力（必須）' : '補足メモ（任意）'}
            value={stopNote}
            onChange={(e) => setStopNote(e.target.value)}
            style={inputStyle}
          />
          <ErrorMsg message={error} />
          <div style={{ marginTop: 10 }}>
            <BusyButton onClick={handleStop} disabled={!stopReason}>
              中止を確定する
            </BusyButton>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuButton({ onClick, children, accent }) {
  return (
    <button
      onClick={onClick}
      style={{
        minHeight: 56,
        padding: '14px 18px',
        borderRadius: 10,
        fontSize: 16,
        fontWeight: 700,
        border: `1px solid ${accent || 'var(--c-border-2)'}`,
        background: 'var(--c-bg-2)',
        color: accent || 'var(--c-text)',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      {children} ›
    </button>
  );
}

const noticeStyle = {
  background: 'var(--c-bg-2)',
  border: '1px solid var(--c-border-2)',
  borderRadius: 10,
  padding: '12px 16px',
  fontSize: 14,
  color: 'var(--c-text-2)',
  marginBottom: 16,
  lineHeight: 1.6,
};

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 15,
  borderRadius: 8,
  border: '1px solid var(--c-border-2)',
  background: 'var(--c-bg-2)',
  color: 'var(--c-text)',
  boxSizing: 'border-box',
};

const closeBtnStyle = {
  minHeight: 42,
  padding: '6px 14px',
  borderRadius: 8,
  border: '1px solid var(--c-border-2)',
  background: 'transparent',
  color: 'var(--c-text-2)',
  cursor: 'pointer',
};
