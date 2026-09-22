import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { getJointScheduleMarks } from '../lib/api';
import { today, addDays, toDateStr, formatJP, defaultSeasonRange } from '../lib/dateUtils';
import { ErrorMsg, LoadingMsg } from '../components/UI';

const DEFAULT_RANGE_DAYS = 13;

export default function JointScheduleScreen({ kaimenIds, onClose }) {
  const { auth } = useAuth();
  const { masters } = useMasters();

  const [dateFrom, setDateFrom] = useState(() => defaultSeasonRange().from);
  const [dateTo, setDateTo] = useState(() => defaultSeasonRange().to);
  const [marks, setMarks] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setMarks(null);
    setError('');
    getJointScheduleMarks(auth, kaimenIds, dateFrom, dateTo)
      .then((res) => setMarks(res.marks))
      .catch((e) => setError(e.message));
  }, [auth, kaimenIds, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  const people = kaimenIds.map((id) => {
    const k = (masters?.海面業者 || []).find((x) => x['海面業者ID'] === id);
    return { id, name: k ? k['氏名'] : id };
  });

  const days = [];
  for (let d = new Date(dateFrom.replace(/-/g, '/')); toDateStr(d) <= dateTo; d = addDays(d, 1)) {
    days.push(toDateStr(d));
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', color: 'var(--c-text)', padding: '20px 16px 60px' }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>共同予定表</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => window.print()} style={btnStyle}>
            印刷する
          </button>
          <button onClick={onClose} style={btnStyle}>
            閉じる
          </button>
        </div>
      </div>

      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: 'var(--c-text-3)' }}>
          期間
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={dateInputStyle} />
        </label>
        <span style={{ color: 'var(--c-text-3)' }}>〜</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={dateInputStyle} />
      </div>

      {error && <ErrorMsg message={`取得に失敗しました：${error}`} onRetry={load} />}
      {!error && marks === null && <LoadingMsg>読み込んでいます…</LoadingMsg>}

      {!error && marks && (
        <div className="print-area">
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>共同予定表</div>
          <div style={{ fontSize: 14, color: 'var(--c-text-2)', marginBottom: 16 }}>
            {formatJP(dateFrom)} 〜 {formatJP(dateTo)}
          </div>

          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>日付</th>
                {people.map((p) => (
                  <th key={p.id} style={{ ...thStyle, textAlign: 'center' }}>
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((date) => (
                <tr key={date}>
                  <td style={tdStyle}>{formatJP(date)}</td>
                  {people.map((p) => (
                    <td key={p.id} style={{ ...tdStyle, textAlign: 'center', fontSize: 18 }}>
                      {marks[date] && marks[date][p.id] ? '○' : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const btnStyle = {
  minHeight: 42,
  padding: '6px 14px',
  borderRadius: 8,
  border: '1px solid var(--c-border-2)',
  background: 'transparent',
  color: 'var(--c-text-2)',
  cursor: 'pointer',
};

const dateInputStyle = {
  marginLeft: 8,
  padding: '8px 10px',
  fontSize: 14,
  borderRadius: 8,
  border: '1px solid var(--c-border-2)',
  background: 'var(--c-bg-2)',
  color: 'var(--c-text)',
};

const tableStyle = {
  width: '100%',
  tableLayout: 'fixed',
  borderCollapse: 'collapse',
  fontSize: 15,
};

const thStyle = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: '2px solid var(--c-border-2)',
  color: 'var(--c-text-2)',
  fontSize: 13,
};

const tdStyle = {
  padding: '8px 10px',
  borderBottom: '1px solid var(--c-border)',
};
