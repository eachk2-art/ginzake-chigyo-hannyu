import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { getJointScheduleMarks } from '../lib/api';
import { today, addDays, toDateStr, formatJP, formatSlashJP, formatDateTimeJP, defaultSeasonRange, printWithTitle, fileDateStamp } from '../lib/dateUtils';
import { ErrorMsg, LoadingMsg } from '../components/UI';

const DEFAULT_RANGE_DAYS = 13;
// 印刷したときにA4縦1枚の体裁になるよう、表は最低この行数で組む
const MIN_PRINT_ROWS = 20;

export default function JointScheduleScreen({ kaimenIds, onClose }) {
  const { auth } = useAuth();
  const { masters } = useMasters();

  const [dateFrom, setDateFrom] = useState(() => defaultSeasonRange().from);
  const [dateTo, setDateTo] = useState(() => defaultSeasonRange().to);
  const [marks, setMarks] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null); // ★2026-09-24：個別の予定表と同じく最終更新を出す
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setMarks(null);
    setError('');
    getJointScheduleMarks(auth, kaimenIds, dateFrom, dateTo)
      .then((res) => {
        setMarks(res.marks);
        setLastUpdated(res.lastUpdated || null);
      })
      .catch((e) => setError(e.message));
  }, [auth, kaimenIds, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  // PDFとして保存するときのファイル名（★2026-09-24）
  function handlePrint() {
    printWithTitle(`${fileDateStamp(lastUpdated)}更新_横浦全体予定表`);
  }

  const people = kaimenIds.map((id) => {
    const k = (masters?.海面業者 || []).find((x) => x['海面業者ID'] === id);
    return { id, name: k ? k['氏名'] : id };
  });

  // ★2026-09-24：期間内の全日ではなく、誰かの予定が入っている日だけを行にする
  const days = [];
  for (let d = new Date(dateFrom.replace(/-/g, '/')); toDateStr(d) <= dateTo; d = addDays(d, 1)) {
    const date = toDateStr(d);
    if (marks && marks[date] && people.some((p) => marks[date][p.id])) days.push(date);
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', color: 'var(--c-text)', padding: '20px 16px 60px' }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>横浦地区全体予定表</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handlePrint} style={btnStyle}>
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
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>横浦地区全体予定表</div>
          <div style={{ fontSize: 14, color: 'var(--c-text-2)', marginBottom: 14 }}>
            {formatJP(dateFrom)} 〜 {formatJP(dateTo)}
          </div>
          <div
            style={{
              background: 'var(--c-bg-2)',
              border: '1px solid var(--c-border)',
              borderRadius: 12,
              padding: '10px 16px',
              marginBottom: 18,
              display: 'inline-block',
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--c-text-3)' }}>最終更新</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>
              {lastUpdated ? formatDateTimeJP(lastUpdated) : '更新履歴はまだありません'}
            </div>
          </div>

          {/* ★2026-09-24：備考欄は設けず、日付以外は氏名の列で等分する */}
          <table style={tableStyle}>
            <colgroup>
              <col style={{ width: '25%' }} />
              {people.map((p) => (
                <col key={p.id} />
              ))}
            </colgroup>
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
                  <td style={tdStyle}>{formatSlashJP(date)}</td>
                  {people.map((p) => (
                    <td key={p.id} style={{ ...tdStyle, textAlign: 'center', fontSize: 18 }}>
                      {marks[date] && marks[date][p.id] ? '○' : ''}
                    </td>
                  ))}
                </tr>
              ))}
              {/* 用紙に収まる形を保つため、20行になるまで空行を足す（★2026-09-24） */}
              {Array.from({ length: Math.max(0, MIN_PRINT_ROWS - days.length) }).map((_, i) => (
                <tr key={`blank-${i}`}>
                  <td style={tdStyle}>&nbsp;</td>
                  {people.map((p) => (
                    <td key={p.id} style={tdStyle} />
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
  fontSize: 16,
};

// ★2026-09-24：印刷したときに読みやすいよう、見出し・本文とも濃く・太くする
const thStyle = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: '2px solid var(--c-border-2)',
  color: 'var(--c-text)',
  fontSize: 14,
  fontWeight: 700,
};

const tdStyle = {
  padding: '8px 10px',
  borderBottom: '1px solid var(--c-border)',
  color: 'var(--c-text)',
  fontWeight: 600,
};
