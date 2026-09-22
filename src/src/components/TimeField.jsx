import { useState, useEffect } from 'react';
import { formatTimeDigits } from '../lib/dateUtils';

/**
 * 時刻入力：コロン無しの4桁数字をテンキーで入力→自動整形する方式（要件定義書5章）。
 * value / onChange は "HH:mm" 形式の文字列（未入力なら ''）でやり取りする。
 */
export default function TimeField({ label, value, onChange }) {
  const [digits, setDigits] = useState(value ? value.replace(':', '') : '');

  useEffect(() => {
    setDigits(value ? value.replace(':', '') : '');
  }, [value]);

  function handleInput(e) {
    const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
    setDigits(raw);
    if (raw.length === 4) onChange(formatTimeDigits(raw));
    else if (raw.length === 0) onChange('');
  }

  function setNow() {
    const d = new Date();
    const hhmm = String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
    setDigits(hhmm);
    onChange(formatTimeDigits(hhmm));
  }

  function clear() {
    setDigits('');
    onChange('');
  }

  const display = digits.length === 4 ? formatTimeDigits(digits) : '--:--';

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 13, color: 'var(--c-text-3)', marginBottom: 6 }}>{label}</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="tel"
          inputMode="numeric"
          maxLength={4}
          placeholder="例:0930"
          value={digits}
          onChange={handleInput}
          style={{
            width: 100,
            padding: '10px 12px',
            fontSize: 16,
            textAlign: 'center',
            letterSpacing: 2,
            borderRadius: 8,
            border: '1px solid var(--c-border-2)',
            background: 'var(--c-bg-2)',
            color: 'var(--c-text)',
          }}
        />
        <span style={{ fontSize: 19, fontWeight: 700, minWidth: 56 }}>{display}</span>
        <button
          type="button"
          onClick={setNow}
          style={{
            minHeight: 42,
            padding: '8px 14px',
            fontSize: 14,
            fontWeight: 600,
            borderRadius: 8,
            border: '1px solid var(--c-border-2)',
            background: 'transparent',
            color: 'var(--c-text)',
            cursor: 'pointer',
          }}
        >
          現在時刻
        </button>
        {digits && (
          <button
            type="button"
            onClick={clear}
            style={{
              minHeight: 42,
              padding: '8px 12px',
              fontSize: 13,
              borderRadius: 8,
              border: '1px solid var(--c-border-2)',
              background: 'transparent',
              color: 'var(--c-text-3)',
              cursor: 'pointer',
            }}
          >
            クリア
          </button>
        )}
      </div>
    </div>
  );
}
