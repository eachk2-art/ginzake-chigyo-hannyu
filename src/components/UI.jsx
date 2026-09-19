// 6段階ステータス（要件定義書10章）の色分け
const STATUS_COLORS = {
  予定: { bg: 'var(--c-bg-3)', text: 'var(--c-text-2)' },
  積込中: { bg: 'var(--c-warn-bg)', text: 'var(--c-warn)' },
  輸送中: { bg: '#123a3a', text: '#4fd1c5' },
  搬入中: { bg: '#1c2f56', text: '#8ab4ff' },
  搬入完了: { bg: 'var(--c-ok-bg)', text: 'var(--c-ok)' },
  納品完了: { bg: '#0f3d20', text: '#8bf29b' },
  取消: { bg: 'var(--c-danger-bg)', text: 'var(--c-danger)' },
  保留: { bg: 'var(--c-warn-bg)', text: 'var(--c-warn)' },
};

export function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS['予定'];
  return (
    <span
      style={{
        background: c.bg,
        color: c.text,
        fontSize: 14,
        padding: '3px 10px',
        borderRadius: 20,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {status}
    </span>
  );
}

export function ErrorMsg({ message, onRetry }) {
  if (!message) return null;
  return (
    <div
      style={{
        background: 'var(--c-danger-bg)',
        color: 'var(--c-danger)',
        padding: '10px 14px',
        borderRadius: 10,
        fontSize: 15,
        margin: '10px 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        flexWrap: 'wrap',
      }}
    >
      <span>⚠ {message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            minHeight: 36,
            padding: '6px 14px',
            fontSize: 14,
            fontWeight: 600,
            borderRadius: 8,
            border: '1px solid var(--c-danger)',
            background: 'transparent',
            color: 'var(--c-danger)',
            cursor: 'pointer',
          }}
        >
          再読み込み
        </button>
      )}
    </div>
  );
}

export function EmptyMsg({ children }) {
  return (
    <div style={{ padding: '20px 14px', fontSize: 16, color: 'var(--c-text-3)', textAlign: 'center' }}>
      {children}
    </div>
  );
}

export function LoadingMsg({ children = '読み込み中…' }) {
  return (
    <div style={{ padding: '40px 14px', fontSize: 16, color: 'var(--c-text-3)', textAlign: 'center' }}>
      {children}
    </div>
  );
}
