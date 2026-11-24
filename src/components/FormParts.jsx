import { useState } from 'react';
import { ErrorMsg } from './UI';
import BusyButton from './BusyButton';
import { STOP_REASONS } from '../lib/api';

// 親子方式（★2026-11-24）の画面で共通に使う入力部品

export const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 15,
  borderRadius: 8,
  border: '1px solid var(--c-border-2)',
  background: 'var(--c-bg-2)',
  color: 'var(--c-text)',
  boxSizing: 'border-box',
};

export const smallBtnStyle = {
  minHeight: 42,
  padding: '6px 14px',
  borderRadius: 8,
  border: '1px solid var(--c-border-2)',
  background: 'transparent',
  color: 'var(--c-text-2)',
  fontSize: 14,
  cursor: 'pointer',
};

export const noticeStyle = {
  background: 'var(--c-bg-2)',
  border: '1px solid var(--c-border-2)',
  borderRadius: 10,
  padding: '12px 16px',
  fontSize: 14,
  color: 'var(--c-text-2)',
  marginBottom: 16,
  lineHeight: 1.6,
};

// 車輌が未定・割当残りの印
export const UNDECIDED_BADGE = {
  display: 'inline-block',
  padding: '2px 10px',
  borderRadius: 999,
  background: 'var(--c-danger)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
  whiteSpace: 'nowrap',
};

export function Field({ label, children, style }) {
  return (
    <div style={{ marginBottom: 16, ...style }}>
      <label style={{ display: 'block', fontSize: 13, color: 'var(--c-text-3)', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

/** 画面の外枠：見出し・補足・閉じるボタン */
export function ScreenFrame({ title, sub, onClose, children }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', color: 'var(--c-text)', padding: '20px 16px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>{title}</h2>
        {onClose && (
          <button onClick={onClose} style={smallBtnStyle}>
            閉じる
          </button>
        )}
      </div>
      {sub && <div style={{ fontSize: 14, color: 'var(--c-text-2)', marginBottom: 18, lineHeight: 1.6 }}>{sub}</div>}
      {children}
    </div>
  );
}

/** 画面の中の区切り（見出しつきのカード） */
export function Section({ title, right, children, accent }) {
  return (
    <div
      style={{
        border: `1px solid ${accent || 'var(--c-border)'}`,
        borderRadius: 12,
        background: 'var(--c-bg-2)',
        padding: '14px 14px 6px',
        marginBottom: 16,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: accent || 'var(--c-text)' }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

/** 選択肢ボタン（もう一度押すと外れる） */
export function ChoiceRow({ options, value, onChange, disabled }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          disabled={disabled}
          onClick={() => onChange(value === o ? '' : o)}
          style={{
            minHeight: 42,
            padding: '8px 18px',
            borderRadius: 8,
            fontSize: 15,
            border: '1px solid var(--c-border-2)',
            background: value === o ? 'var(--c-accent)' : 'transparent',
            color: value === o ? '#03202e' : 'var(--c-text)',
            cursor: disabled ? 'default' : 'pointer',
          }}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/** あり／なし */
export function YesNoField({ label, value, onChange, disabled }) {
  return (
    <Field label={label}>
      <div style={{ display: 'flex', gap: 8 }}>
        {['あり', 'なし'].map((v) => (
          <button
            key={v}
            type="button"
            disabled={disabled}
            onClick={() => onChange(value === v ? '' : v)}
            style={{
              minHeight: 42,
              padding: '8px 18px',
              borderRadius: 8,
              fontSize: 15,
              border: '1px solid var(--c-border-2)',
              background: value === v ? (v === 'あり' ? 'var(--c-danger-bg)' : 'var(--c-accent)') : 'transparent',
              color: value === v ? (v === 'あり' ? 'var(--c-danger)' : '#03202e') : 'var(--c-text)',
              cursor: disabled ? 'default' : 'pointer',
            }}
          >
            {v}
          </button>
        ))}
      </div>
    </Field>
  );
}

const OTHER = '__OTHER__';

/**
 * 立会者の選択。値は「担当者ID」または「自由入力の氏名」（同じ列にそのまま入る）。
 * options：担当者マスタの行（太協担当）
 */
export function WitnessSelect({ label, value, onChange, options, disabled }) {
  const known = (options || []).some((t) => t['担当者ID'] === value);
  const [other, setOther] = useState(!!value && !known);
  const sel = other ? OTHER : known ? value : '';
  return (
    <Field label={label}>
      <select
        value={sel}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value;
          if (v === OTHER) {
            setOther(true);
            onChange('');
          } else {
            setOther(false);
            onChange(v);
          }
        }}
        style={inputStyle}
      >
        <option value="">（なし）</option>
        {(options || []).map((t) => (
          <option key={t['担当者ID']} value={t['担当者ID']}>
            {t['氏名']}
          </option>
        ))}
        <option value={OTHER}>その他（自由入力）</option>
      </select>
      {other && (
        <input
          type="text"
          placeholder="氏名を入力"
          value={value || ''}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...inputStyle, marginTop: 8 }}
        />
      )}
    </Field>
  );
}

/** 中止の入力（理由の選択＋メモ）。onSubmit(reason, note) */
export function StopPanel({ description, submitLabel = '中止を確定する', onSubmit }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (reason === 'その他' && !note.trim()) {
      setError('「その他」のときは、中止の理由を入力してください');
      return;
    }
    try {
      await onSubmit(reason, note.trim());
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div style={{ marginTop: 10, padding: 14, border: '1px solid #9575cd', borderRadius: 10, background: 'var(--c-bg)' }}>
      {description && (
        <div style={{ fontSize: 14, color: '#b39ddb', marginBottom: 10, lineHeight: 1.6 }}>{description}</div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {STOP_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setReason(r)}
            style={{
              minHeight: 42,
              padding: '8px 18px',
              borderRadius: 8,
              fontSize: 15,
              border: '1px solid var(--c-border-2)',
              background: reason === r ? '#5e35b1' : 'transparent',
              color: reason === r ? '#fff' : 'var(--c-text)',
              cursor: 'pointer',
            }}
          >
            {r}
          </button>
        ))}
      </div>
      <input
        type="text"
        placeholder={reason === 'その他' ? '中止の理由を入力（必須）' : '補足メモ（任意）'}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        style={inputStyle}
      />
      <ErrorMsg message={error} />
      <div style={{ marginTop: 10 }}>
        <BusyButton onClick={submit} disabled={!reason}>
          {submitLabel}
        </BusyButton>
      </div>
    </div>
  );
}

/** ▲▼の並べ替えボタン */
export function OrderButton({ label, title, disabled, onClick }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        minWidth: 42,
        minHeight: 42,
        borderRadius: 8,
        border: '1px solid var(--c-border-2)',
        background: 'var(--c-bg)',
        color: disabled ? 'var(--c-border-2)' : 'var(--c-text)',
        fontSize: 14,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {label}
    </button>
  );
}
