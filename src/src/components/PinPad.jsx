export default function PinPad({ value, onChange, maxLength = 6 }) {
  function press(d) {
    if (value.length >= maxLength) return;
    onChange(value + d);
  }
  function backspace() {
    onChange(value.slice(0, -1));
  }

  const dots = Array.from({ length: maxLength }, (_, i) => i < value.length);
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      <div style={{ display: 'flex', gap: 12 }}>
        {dots.map((filled, i) => (
          <span
            key={i}
            style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: filled ? 'var(--c-accent)' : 'transparent',
              border: '2px solid var(--c-border-2)',
            }}
          />
        ))}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          width: '100%',
          maxWidth: 300,
        }}
      >
        {keys.map((k, i) => {
          if (k === '') return <div key={i} />;
          const isBack = k === '⌫';
          return (
            <button
              key={i}
              type="button"
              onClick={() => (isBack ? backspace() : press(k))}
              style={{
                minHeight: 56,
                fontSize: 22,
                fontWeight: 600,
                borderRadius: 12,
                border: '1px solid var(--c-border-2)',
                background: 'var(--c-bg-2)',
                color: 'var(--c-text)',
                cursor: 'pointer',
              }}
            >
              {k}
            </button>
          );
        })}
      </div>
    </div>
  );
}
