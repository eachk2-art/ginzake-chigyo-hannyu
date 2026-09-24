import { useMasters } from '../context/MasterContext';
import { kaimenName } from '../lib/masterLookup';

export default function KaimenPickerScreen({ onSelectKaimen, onSelectJoint }) {
  const { masters } = useMasters();
  const list = masters?.海面業者 || [];
  const yokouraIds = list.filter((k) => (k['所在地'] || '').indexOf('横浦') >= 0).map((k) => k['海面業者ID']);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', color: 'var(--c-text)', padding: '20px 16px 60px' }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, marginBottom: 16 }}>予定表</h2>

      {yokouraIds.length > 0 && (
        <button
          onClick={() => onSelectJoint(yokouraIds)}
          style={{ ...rowStyle, marginBottom: 16, borderColor: 'var(--c-accent)' }}
        >
          横浦地区全体予定表 ›
        </button>
      )}

      <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginBottom: 8 }}>海面業者を選んでください</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {list.map((k) => (
          <button key={k['海面業者ID']} onClick={() => onSelectKaimen(k['海面業者ID'])} style={rowStyle}>
            {kaimenName(masters, k['海面業者ID'])} ›
          </button>
        ))}
      </div>
    </div>
  );
}

const rowStyle = {
  width: '100%',
  minHeight: 50,
  padding: '12px 16px',
  borderRadius: 10,
  fontSize: 15,
  fontWeight: 600,
  border: '1px solid var(--c-border-2)',
  background: 'var(--c-bg-2)',
  color: 'var(--c-text)',
  textAlign: 'left',
  cursor: 'pointer',
};
