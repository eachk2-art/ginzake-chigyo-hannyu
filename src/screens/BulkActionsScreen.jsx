import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { getSchedules } from '../lib/api';
import { formatJP } from '../lib/dateUtils';
import { ikebaName, kaimenName } from '../lib/masterLookup';
import { ErrorMsg, LoadingMsg } from '../components/UI';
import BulkActionsPanel from '../components/BulkActionsPanel';

export default function BulkActionsScreen({ schedule, onClose }) {
  const { auth } = useAuth();
  const { masters } = useMasters();
  const [siblings, setSiblings] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setSiblings(null);
    setError('');
    const d = schedule['積込日'];
    getSchedules(auth, { dateFrom: d, dateTo: d })
      .then((list) => {
        setSiblings(
          list.filter((s) => s['池場ID'] === schedule['池場ID'] && s['海面業者ID'] === schedule['海面業者ID'])
        );
      })
      .catch((e) => setError(e.message));
  }, [auth, schedule]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', color: 'var(--c-text)', padding: '20px 16px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>この納品先へまとめて入力</h2>
        <button onClick={onClose} style={closeBtnStyle}>
          閉じる
        </button>
      </div>
      <div style={{ fontSize: 14, color: 'var(--c-text-2)', marginBottom: 20 }}>
        {formatJP(schedule['積込日'])}　{ikebaName(masters, schedule['池場ID'])}　→　
        {kaimenName(masters, schedule['海面業者ID'])}
      </div>

      {error && <ErrorMsg message={`読み込みに失敗しました：${error}`} onRetry={load} />}
      {!error && siblings === null && <LoadingMsg>読み込んでいます…</LoadingMsg>}
      {!error && siblings && (
        <BulkActionsPanel scheduleIds={siblings.map((s) => s['積込予定ID'])} onDone={load} />
      )}
    </div>
  );
}

const closeBtnStyle = {
  minHeight: 42,
  padding: '6px 14px',
  borderRadius: 8,
  border: '1px solid var(--c-border-2)',
  background: 'transparent',
  color: 'var(--c-text-2)',
  cursor: 'pointer',
};
