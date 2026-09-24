import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { getSchedules } from '../lib/api';
import { formatJP, formatDateTimeJP, formatTimeDigits, defaultSeasonRange } from '../lib/dateUtils';
import { representativeStatus } from '../lib/statusUtils';
import { ErrorMsg, LoadingMsg, EmptyMsg } from '../components/UI';
import { ikebaBaseName } from '../lib/masterLookup';

// 印刷したときにA4縦1枚の体裁になるよう、表は最低この行数で組む
const MIN_PRINT_ROWS = 15;

export default function KaimenScheduleScreen({ kaimenId, onClose }) {
  const { auth } = useAuth();
  const { masters } = useMasters();

  const [dateFrom, setDateFrom] = useState(() => defaultSeasonRange().from);
  const [dateTo, setDateTo] = useState(() => defaultSeasonRange().to);
  const [allSchedules, setAllSchedules] = useState(null); // 期間指定なし＝全期間（最終更新日の算出にも使う）
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setAllSchedules(null);
    setError('');
    getSchedules(auth, { kaimenId })
      .then(setAllSchedules)
      .catch((e) => setError(e.message));
  }, [auth, kaimenId]);

  useEffect(() => {
    load();
  }, [load]);

  const kaimen = (masters?.海面業者 || []).find((k) => k['海面業者ID'] === kaimenId);

  const lastUpdated = useMemo(() => {
    if (!allSchedules || allSchedules.length === 0) return null;
    const times = allSchedules.map((s) => s['更新日時']).filter(Boolean);
    if (times.length === 0) return null;
    return times.sort()[times.length - 1];
  }, [allSchedules]);

  // 表示期間内・日付ごとにまとめる（1日＝1行）。全車輌が取消の日は表示しない。
  const rows = useMemo(() => {
    if (!allSchedules) return [];
    const inRange = allSchedules.filter((s) => s['積込日'] >= dateFrom && s['積込日'] <= dateTo);
    const byDate = new Map();
    inRange.forEach((s) => {
      if (!byDate.has(s['積込日'])) byDate.set(s['積込日'], []);
      byDate.get(s['積込日']).push(s);
    });
    return Array.from(byDate.entries())
      .map(([date, items]) => {
        const status = representativeStatus(items);
        const active = items.filter((s) => s['ステータス'] !== '取消');
        const totalKg = active.reduce((sum, s) => sum + (Number(s['予定数量kg']) || 0), 0);
        // ★2026-09-24：内水面業者名ではなく池場名を表示する
        const ikebaNames = Array.from(new Set(active.map((s) => ikebaBaseName(masters, s['池場ID'])))).filter(
          Boolean
        );
        const arrivalTimes = active.map((s) => s['到着予定時刻']).filter(Boolean).sort();
        return {
          date,
          status,
          totalKg,
          suisan: ikebaNames.join('、'),
          arrival: arrivalTimes[0] || '',
          note: status === '納品完了' ? '終了' : '',
        };
      })
      .filter((r) => r.status !== '取消' && r.totalKg > 0)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [allSchedules, dateFrom, dateTo, masters]);

  const totalKg = rows.reduce((sum, r) => sum + r.totalKg, 0);
  const deliveredKg = rows.filter((r) => r.status === '納品完了').reduce((sum, r) => sum + r.totalKg, 0);
  const remainingKg = totalKg - deliveredKg;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', color: 'var(--c-text)', padding: '20px 16px 60px' }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>予定表</h2>
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
      {!error && allSchedules === null && <LoadingMsg>読み込んでいます…</LoadingMsg>}

      {!error && allSchedules && (
        <div className="print-area">
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{kaimen ? kaimen['氏名'] : kaimenId} 様</div>
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

          {rows.length === 0 && <EmptyMsg>この期間の予定はありません</EmptyMsg>}

          {rows.length > 0 && (
            <>
              <table style={tableStyle}>
                {/* ★2026-09-24：日付と数量を広げ、到着予定は中央寄せ、余った分を備考へ */}
                <colgroup>
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '28%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={thStyle}>日付</th>
                    <th style={thStyle}>池場</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>数量（kg）</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>到着予定</th>
                    <th style={thStyle}>備考</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.date}>
                      <td style={tdStyle}>{formatJP(r.date)}</td>
                      <td style={tdStyle}>{r.suisan}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{r.totalKg.toLocaleString()}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {r.arrival ? formatTimeDigits(r.arrival.replace(':', '')) : ''}
                      </td>
                      <td style={tdStyle}>{r.note}</td>
                    </tr>
                  ))}
                  {/* 用紙に収まる形を保つため、15行になるまで空行を足す（★2026-09-24） */}
                  {Array.from({ length: Math.max(0, MIN_PRINT_ROWS - rows.length) }).map((_, i) => (
                    <tr key={`blank-${i}`}>
                      <td style={tdStyle}>&nbsp;</td>
                      <td style={tdStyle} />
                      <td style={tdStyle} />
                      <td style={tdStyle} />
                      <td style={tdStyle} />
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...tdStyle, fontWeight: 700 }} colSpan={2}>
                      合計
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{totalKg.toLocaleString()}</td>
                    <td style={tdStyle} colSpan={2} />
                  </tr>
                </tbody>
              </table>

              <div style={{ marginTop: 14, fontSize: 14 }}>
                合計 {totalKg.toLocaleString()}kg　／　搬入済み {deliveredKg.toLocaleString()}kg　／　予定{' '}
                {remainingKg.toLocaleString()}kg
              </div>
            </>
          )}
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
