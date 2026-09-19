import { useState, useRef, useEffect } from 'react';

/**
 * 通信を伴う操作は、必ずこのBusyButtonを使う（新規開発プロンプト5章「待ち時間とフィードバック」準拠）。
 * ・押した瞬間に見た目が変化する
 * ・通信中はボタンを非活性化し、スピナーに差し替える
 * ・通信中の連打による二重送信を防ぐ
 * ・幅を固定し、スピナーへの切り替わりでガタつかないようにする
 * ・完了時は端末を軽く振動させる（音は鳴らさない）
 */
export default function BusyButton({
  onClick,
  children,
  variant = 'primary', // 'primary' | 'ghost' | 'danger'
  disabled = false,
  fullWidth = false,
  style,
}) {
  const [busy, setBusy] = useState(false);
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );

  async function handleClick(e) {
    if (busy || disabled) return; // 二重送信防止
    setBusy(true);
    try {
      await onClick?.(e);
      if (navigator.vibrate) navigator.vibrate(30);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  const base = {
    minHeight: 42, // タップ範囲は最低42px四方
    minWidth: fullWidth ? '100%' : 120, // 通信中もボタンの幅を固定する
    padding: '10px 18px',
    fontSize: 16,
    fontWeight: 600,
    borderRadius: 10,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    transition: 'transform 0.05s ease',
  };

  const variants = {
    primary: { background: 'var(--c-accent)', color: '#03202e', border: 'none' },
    ghost: {
      background: 'transparent',
      color: 'var(--c-text)',
      border: '1px solid var(--c-border-2)',
    },
    danger: {
      background: 'var(--c-danger-bg)',
      color: 'var(--c-danger)',
      border: '1px solid var(--c-danger)',
    },
  };

  const isDisabled = busy || disabled;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDisabled}
      style={{
        ...base,
        ...variants[variant],
        opacity: disabled && !busy ? 0.5 : 1,
        cursor: isDisabled ? 'default' : 'pointer',
        ...style,
      }}
      onPointerDown={(e) => {
        if (!isDisabled) e.currentTarget.style.transform = 'scale(0.97)';
      }}
      onPointerUp={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
      onPointerLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
    >
      {busy ? <Spinner /> : children}
    </button>
  );
}

function Spinner() {
  return (
    <span
      style={{
        width: 18,
        height: 18,
        borderRadius: '50%',
        border: '2.5px solid rgba(255,255,255,0.35)',
        borderTopColor: 'currentColor',
        display: 'inline-block',
        animation: 'busy-spin 0.7s linear infinite',
      }}
    />
  );
}
