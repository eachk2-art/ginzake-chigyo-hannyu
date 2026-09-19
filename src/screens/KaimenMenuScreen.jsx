import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';

export default function KaimenMenuScreen({ onSelect }) {
  const { auth, logout } = useAuth();
  const { masters } = useMasters();

  const self = (masters?.海面業者 || []).find((k) => k['海面業者ID'] === auth.refId);
  const isYokoura = !!(self && (self['所在地'] || '').indexOf('横浦') >= 0);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', color: 'var(--c-text)', padding: '20px 16px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <span style={{ fontSize: 15, color: 'var(--c-text-2)' }}>{auth.tileName}</span>
        <button
          onClick={logout}
          style={{
            minHeight: 42,
            padding: '6px 14px',
            borderRadius: 8,
            border: '1px solid var(--c-border-2)',
            background: 'transparent',
            color: 'var(--c-text-3)',
            cursor: 'pointer',
          }}
        >
          ログアウト
        </button>
      </div>

      <h2 style={{ fontSize: 19, fontWeight: 700, marginBottom: 20 }}>稚魚搬入管理</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <MenuButton onClick={() => onSelect('schedule')}>予定表</MenuButton>
        {isYokoura && <MenuButton onClick={() => onSelect('joint')}>共同予定表（横浦地区）</MenuButton>}
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
