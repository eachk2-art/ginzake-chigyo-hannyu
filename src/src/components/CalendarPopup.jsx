import { useState } from 'react';
import { formatMonthJP, getDaysInMonth, getFirstDayOfWeek, sameDay } from '../lib/dateUtils';

const DOW_JP = ['日', '月', '火', '水', '木', '金', '土'];

export default function CalendarPopup({ selectedDate, onSelect, onClose }) {
  const [viewDate, setViewDate] = useState(new Date(selectedDate));

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDow = getFirstDayOfWeek(year, month);

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function changeMonth(diff) {
    setViewDate(new Date(year, month + diff, 1));
  }

  function pick(day) {
    if (!day) return;
    onSelect(new Date(year, month, day));
    onClose();
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100 }}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(340px, 92vw)',
          background: 'var(--c-bg-2)',
          border: '1px solid var(--c-border-2)',
          borderRadius: 14,
          padding: 18,
          zIndex: 101,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <button onClick={() => changeMonth(-1)} style={navBtnStyle}>
            ‹
          </button>
          <span style={{ fontSize: 17, fontWeight: 700 }}>{formatMonthJP(viewDate)}</span>
          <button onClick={() => changeMonth(1)} style={navBtnStyle}>
            ›
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
          {DOW_JP.map((w) => (
            <div key={w} style={{ textAlign: 'center', fontSize: 12, color: 'var(--c-text-3)' }}>
              {w}
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {cells.map((day, i) => {
            const isSelected = day && sameDay(new Date(year, month, day), selectedDate);
            return (
              <button
                key={i}
                disabled={!day}
                onClick={() => pick(day)}
                style={{
                  aspectRatio: '1 / 1',
                  minHeight: 38,
                  border: 'none',
                  borderRadius: 8,
                  background: isSelected ? 'var(--c-accent)' : 'transparent',
                  color: isSelected ? '#03202e' : day ? 'var(--c-text)' : 'transparent',
                  fontSize: 14,
                  fontWeight: isSelected ? 700 : 400,
                  cursor: day ? 'pointer' : 'default',
                }}
              >
                {day || ''}
              </button>
            );
          })}
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: 16,
            width: '100%',
            padding: '10px',
            background: 'transparent',
            border: '1px solid var(--c-border-2)',
            borderRadius: 8,
            color: 'var(--c-text-2)',
            fontSize: 15,
          }}
        >
          閉じる
        </button>
      </div>
    </>
  );
}

const navBtnStyle = {
  minWidth: 42,
  minHeight: 42,
  fontSize: 20,
  background: 'transparent',
  border: '1px solid var(--c-border-2)',
  borderRadius: 8,
  color: 'var(--c-text)',
  cursor: 'pointer',
};
