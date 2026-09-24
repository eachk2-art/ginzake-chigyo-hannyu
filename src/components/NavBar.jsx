import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { isAdmin, isTaikyo } from '../lib/roles';

const ITEMS = [
  { key: 'home', label: 'ホーム' },
  { key: 'scheduleList', label: '積込予定一覧' },
];
const TAIKYO_ITEMS = [
  { key: 'kaimenPicker', label: '予定表' },
  { key: 'fares', label: '運賃' },
];
const ADMIN_ONLY_ITEMS = [
  { key: 'changeLog', label: '変更履歴' },
  { key: 'masterAdmin', label: 'マスタ管理' },
];
const CONTACTS_ITEM = { key: 'contacts', label: '連絡先' };
const LOCATIONS_ITEM = { key: 'locations', label: '池場・搬入先' };

export default function NavBar({ screen, onChange }) {
  const { auth, logout } = useAuth();
  const [open, setOpen] = useState(false);
  let items = ITEMS;
  if (isTaikyo(auth.role) || auth.role === '運送会社') items = [...items, CONTACTS_ITEM, LOCATIONS_ITEM];
  if (isTaikyo(auth.role)) items = [...items, ...TAIKYO_ITEMS];
  if (isAdmin(auth.role)) items = [...items, ...ADMIN_ONLY_ITEMS];

  function select(key) {
    onChange(key);
    setOpen(false); // スマホでは項目を選んだらプルダウンを閉じる
  }

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: 'var(--c-bg)',
        borderBottom: '1px solid var(--c-border)',
      }}
    >
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '10px 16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* スマホ幅でのみ表示される３本線ボタン（CSS側で出し分け） */}
          <button
            className="nav-hamburger-btn"
            onClick={() => setOpen((v) => !v)}
            aria-label="メニュー"
            style={{
              minWidth: 42,
              minHeight: 42,
              fontSize: 20,
              background: 'transparent',
              border: '1px solid var(--c-border-2)',
              borderRadius: 8,
              color: 'var(--c-text)',
              cursor: 'pointer',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ☰
          </button>

          {/* PCでは常に横並び表示、スマホでは３本線タップ時のみプルダウン表示（CSS側で制御） */}
          <div className={`nav-links${open ? ' nav-links-open' : ''}`}>
            {items.map((item) => (
              <button
                key={item.key}
                onClick={() => select(item.key)}
                style={{
                  padding: '8px 14px',
                  minHeight: 42,
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  border: '1px solid var(--c-border-2)',
                  background: screen === item.key ? 'var(--c-accent)' : 'transparent',
                  color: screen === item.key ? '#03202e' : 'var(--c-text)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--c-text-3)' }}>
            {auth.tileName}（{auth.role}）
          </span>
          <button
            onClick={logout}
            style={{
              fontSize: 13,
              padding: '6px 12px',
              minHeight: 42,
              background: 'transparent',
              border: '1px solid var(--c-border-2)',
              borderRadius: 8,
              color: 'var(--c-text-3)',
            }}
          >
            ログアウト
          </button>
        </div>
      </div>
    </div>
  );
}
