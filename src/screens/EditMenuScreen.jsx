import { useMasters } from '../context/MasterContext';
import { formatJP } from '../lib/dateUtils';
import { ikebaName, vehicleLabel, kaimenName } from '../lib/masterLookup';
import { StatusBadge } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { isAdmin } from '../lib/roles';

export default function EditMenuScreen({ schedule, onSelect, onClose }) {
  const { masters } = useMasters();
  const { auth } = useAuth();
  // 納品完了の予定は、管理者以外は実績の入力・修正ができない
  const locked = schedule['ステータス'] === '納品完了' && !isAdmin(auth.role);

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
        <div
          style={{
            background: 'var(--c-bg-2)',
            border: '1px solid var(--c-border-2)',
            borderRadius: 10,
            padding: '12px 16px',
            fontSize: 14,
            color: 'var(--c-text-2)',
            marginBottom: 16,
          }}
        >
          この予定は納品完了です。内容の修正が必要な場合は管理者に依頼してください。
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* 予定の編集は管理者のみ（★2026-09-23） */}
        {isAdmin(auth.role) && <MenuButton onClick={() => onSelect('scheduleForm')}>予定の編集</MenuButton>}
        {!locked && (
          <>
            <MenuButton onClick={() => onSelect('loadingResultForm')}>積込実績を入力する</MenuButton>
            <MenuButton onClick={() => onSelect('deliveryResultForm')}>搬入実績を入力する</MenuButton>
            <MenuButton onClick={() => onSelect('bulkActions')}>この納品先へまとめて入力する</MenuButton>
          </>
        )}
      </div>
    </div>
  );
}

function MenuButton({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        minHeight: 56,
        padding: '14px 18px',
        borderRadius: 10,
        fontSize: 16,
        fontWeight: 700,
        border: '1px solid var(--c-border-2)',
        background: 'var(--c-bg-2)',
        color: 'var(--c-text)',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      {children} ›
    </button>
  );
}

const closeBtnStyle = {
  minHeight: 42,
  padding: '6px 14px',
  borderRadius: 8,
  border: '1px solid var(--c-border-2)',
  background: 'transparent',
  color: 'var(--c-text-2)',
  cursor: 'pointer',
};
