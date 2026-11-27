import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { isAdmin, isTaikyo } from '../lib/roles';

// ★2026-11-28 メニューの並びを整理（この順に表示）。who：all＝全員／taikyo＝太協・管理者／carrier＝太協・管理者・運送会社／admin＝管理者
const MENU = [
  { key: 'home', label: 'ホーム', who: 'all' },
  { key: 'scheduleList', label: '積込予定一覧', who: 'all' },
  { key: 'kaimenPicker', label: '浜個別予定', who: 'taikyo' }, // 旧名：予定表
  { key: 'contacts', label: '連絡先', who: 'carrier' },
  { key: 'locations', label: '池場・搬入先', who: 'carrier' },
  { key: 'arrivalPlan', label: '到着時刻の検討', who: 'taikyo' }, // ★2026-11-27
  { key: 'loadingTimes', label: '積込時間', who: 'taikyo' }, // ★2026-11-27 積込時間の傾向
  { key: 'travel', label: '運行時間', who: 'carrier' }, // ★2026-11-26 運行時間の目安
  { key: 'fleetCheck', label: '配車チェック', who: 'taikyo' },
  { key: 'zentai', label: '全体予定', who: 'taikyo' }, // ★2026-11-25 生産者別（車輌が決まる前）
  { key: 'haisha', label: '配車表', who: 'taikyo' }, // ★2026-11-25
  { key: 'dashboard', label: '集計', who: 'taikyo' },
  { key: 'records', label: '記録', who: 'taikyo' }, // ★2026-11-26 積込・搬入の全記録
  { key: 'fares', label: '運賃', who: 'taikyo' },
  { key: 'seasonPlan', label: '浜池別予定', who: 'taikyo' }, // ★2026-11-25
  { key: 'arrival', label: '到着の振返り', who: 'taikyo' }, // ★2026-11-27（旧名：到着の見込み → 到着の振り返り）
  { key: 'changeLog', label: '変更履歴', who: 'admin' },
  { key: 'masterAdmin', label: 'マスタ管理', who: 'admin' },
  { key: 'entryQr', label: '入口QR', who: 'admin' },
];

export default function NavBar({ screen, onChange }) {
  const { auth, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const taikyo = isTaikyo(auth.role);
  const can = {
    all: true,
    taikyo,
    carrier: taikyo || auth.role === '運送会社',
    admin: isAdmin(auth.role),
  };
  const items = MENU.filter((m) => can[m.who]);

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
