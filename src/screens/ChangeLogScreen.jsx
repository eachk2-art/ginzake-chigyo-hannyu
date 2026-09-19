import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { getChangeLog } from '../lib/api';
import { today, addDays, toDateStr, formatDateTimeJP } from '../lib/dateUtils';
import { loginTileName } from '../lib/masterLookup';
import { ErrorMsg, LoadingMsg, EmptyMsg } from '../components/UI';

const DEFAULT_RANGE_DAYS = 13; // 今日から2週間さかのぼる
const TABLE_OPTIONS = ['積込予定', '積込実績', '積込実績明細', '搬入実績'];
const AUDIT_KEYS = ['削除フラグ', '作成日時', '作成者ログイン事業者ID', '更新日時', '更新者ログイン事業者ID'];
// 「対象ID」としてすでに見出しに表示している値なので、変更項目の一覧からは除外する
const PRIMARY_KEY_BY_TABLE = {
  積込予定: '積込予定ID',
  積込実績: '積込実績ID',
  積込実績明細: '積込実績明細ID',
  搬入実績: '搬入実績ID',
};

// 積込実績の更新ログだけ、変更後が {header, details} という入れ子の形で
// 保存されている（明細の増減も一緒に記録するため）。比較のために中身を取り出す。
function extractHeader(obj) {
  return obj && typeof obj === 'object' && 'header' in obj ? obj.header : obj;
}

function safeParse(str) {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function diffFields(beforeStr, afterStr, targetTable) {
  const before = extractHeader(safeParse(beforeStr)) || {};
  const after = extractHeader(safeParse(afterStr)) || {};
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const skipKeys = [...AUDIT_KEYS, PRIMARY_KEY_BY_TABLE[targetTable]].filter(Boolean);
  return keys
    .filter((k) => !skipKeys.includes(k))
    .filter((k) => String(before[k] ?? '') !== String(after[k] ?? ''))
    .map((k) => ({ key: k, before: before[k], after: after[k] }));
}

function detailCount(afterStr) {
  const after = safeParse(afterStr);
  return after && Array.isArray(after.details) ? after.details.length : null;
}

export default function ChangeLogScreen() {
  const { auth } = useAuth();
  const { masters } = useMasters();

  const [dateFrom, setDateFrom] = useState(toDateStr(addDays(today(), -DEFAULT_RANGE_DAYS)));
  const [dateTo, setDateTo] = useState(toDateStr(today()));
  const [targetTable, setTargetTable] = useState('');
  const [logs, setLogs] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLogs(null);
    setError('');
    getChangeLog(auth, { dateFrom, dateTo, targetTable: targetTable || undefined })
      .then(setLogs)
      .catch((e) => setError(e.message));
  }, [auth, dateFrom, dateTo, targetTable]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', color: 'var(--c-text)', paddingBottom: 40 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          padding: '14px 16px',
          borderBottom: '1px solid var(--c-border)',
        }}
      >
        <label style={{ fontSize: 13, color: 'var(--c-text-3)' }}>
          期間
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={dateInputStyle} />
        </label>
        <span style={{ color: 'var(--c-text-3)' }}>〜</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={dateInputStyle} />

        <select value={targetTable} onChange={(e) => setTargetTable(e.target.value)} style={selectStyle}>
          <option value="">すべての対象</option>
          {TABLE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div style={{ padding: '10px 16px' }}>
        {error && <ErrorMsg message={`変更履歴の取得に失敗しました：${error}`} onRetry={load} />}
        {!error && logs === null && <LoadingMsg>読み込んでいます…</LoadingMsg>}
        {!error && logs && logs.length === 0 && <EmptyMsg>この条件に一致する変更履歴はありません</EmptyMsg>}

        {!error && logs && logs.length > 0 && (
          <div style={{ fontSize: 13, color: 'var(--c-text-3)', margin: '4px 0 10px' }}>{logs.length}件</div>
        )}

        {!error &&
          logs &&
          logs.map((l) => {
            const diffs = diffFields(l['変更前'], l['変更後'], l['対象テーブル']);
            const dCount = detailCount(l['変更後']);
            return (
              <div
                key={l['変更ログID']}
                style={{
                  background: 'var(--c-bg-2)',
                  border: '1px solid var(--c-border)',
                  borderRadius: 12,
                  padding: '12px 16px',
                  marginBottom: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>
                    {l['対象テーブル']}
                    <OpBadge type={l['操作種別']} />
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--c-text-3)' }}>{formatDateTimeJP(l['操作日時'])}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--c-text-2)', marginTop: 4 }}>
                  対象ID：{l['対象ID']}　操作者：{loginTileName(masters, l['操作者ログイン事業者ID'])}
                </div>

                {diffs.length > 0 && (
                  <div style={{ marginTop: 10, borderTop: '1px solid var(--c-border)', paddingTop: 8 }}>
                    {diffs.map((d) => (
                      <div key={d.key} style={{ fontSize: 14, marginTop: 4 }}>
                        <span style={{ color: 'var(--c-text-3)' }}>{d.key}：</span>
                        {l['操作種別'] === '作成' ? (
                          <span style={{ color: 'var(--c-text)' }}>{String(d.after ?? '')}</span>
                        ) : (
                          <span style={{ color: 'var(--c-text)' }}>
                            {String(d.before ?? '(空)')} → {String(d.after ?? '(空)')}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {dCount !== null && (
                  <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginTop: 8 }}>明細：{dCount}件</div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

function OpBadge({ type }) {
  const colors = {
    作成: { bg: 'var(--c-ok-bg)', text: 'var(--c-ok)' },
    更新: { bg: 'var(--c-bg-3)', text: 'var(--c-text-2)' },
    取消: { bg: 'var(--c-danger-bg)', text: 'var(--c-danger)' },
  };
  const c = colors[type] || colors['更新'];
  return (
    <span
      style={{
        marginLeft: 8,
        fontSize: 12,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 20,
        background: c.bg,
        color: c.text,
      }}
    >
      {type}
    </span>
  );
}

const dateInputStyle = {
  marginLeft: 8,
  padding: '8px 10px',
  fontSize: 14,
  borderRadius: 8,
  border: '1px solid var(--c-border-2)',
  background: 'var(--c-bg-2)',
  color: 'var(--c-text)',
};

const selectStyle = {
  padding: '8px 10px',
  fontSize: 14,
  borderRadius: 8,
  border: '1px solid var(--c-border-2)',
  background: 'var(--c-bg-2)',
  color: 'var(--c-text)',
};
