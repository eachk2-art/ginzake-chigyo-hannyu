import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { getDashboard } from '../lib/api';
import { formatSlashJP, formatDateTimeJP, printWithTitle, fileDateStamp } from '../lib/dateUtils';
import { kaimenPersonName, ikebaBaseName } from '../lib/masterLookup';
import { ErrorMsg, LoadingMsg } from '../components/UI';

/**
 * SCR-130 集計ダッシュボード（★2026-11-06）
 * ・期間はシーズン単位が基本。任意の期間にも切り替えられる
 * ・「搬入済み」は納品完了した便のみ。数量は予定数量kgで集計する
 * ・A4縦1枚に収まるように組んである
 */
export default function DashboardScreen({ onClose }) {
  const { auth } = useAuth();
  const { masters } = useMasters();

  const [season, setSeason] = useState('');
  const [custom, setCustom] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    setData(null);
    const params = custom && dateFrom && dateTo ? { dateFrom, dateTo } : season ? { season } : {};
    getDashboard(auth, params)
      .then((d) => {
        setData(d);
        if (!season && d.period['シーズン']) setSeason(d.period['シーズン']);
        if (!dateFrom) setDateFrom(d.period['開始日']);
        if (!dateTo) setDateTo(d.period['終了日']);
      })
      .catch((e) => setError(e.message));
  }, [auth, season, custom, dateFrom, dateTo]);

  const carrierName = (id) => {
    const c = (masters?.運送会社 || []).find((r) => r['運送会社ID'] === id);
    return c ? c['略称'] || c['運送会社名'] : id || '（車輌未設定）';
  };

  // ★2026-11-06：並び順はサーバー側（dashboard.php）で決めている。
  // 画面側では並べ替えず、実績が無い業者・池場・運送会社も0件の行として出す。
  // （毎回同じ顔ぶれ・同じ順で並ぶので、期間を変えても見比べやすい）
  const kaimenRows = data ? data.byKaimen : [];
  const ikebaRows = data ? data.byIkeba : [];
  const carrierRows = data ? data.byCarrier : [];

  const maxDayKg = useMemo(
    () => (data ? Math.max(1, ...data.byDay.map((d) => Number(d['予定kg']) || 0)) : 1),
    [data]
  );

  function handlePrint() {
    printWithTitle(`${fileDateStamp()}_搬入集計${data?.period['シーズン'] ? '_' + data.period['シーズン'] : ''}`);
  }

  const t = data?.totals;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', color: 'var(--c-text)', padding: '18px 16px 60px' }}>
      <div
        className="no-print"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}
      >
        <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>集計</h2>
        <button onClick={onClose} style={ghostBtn}>
          閉じる
        </button>
      </div>

      <div className="no-print" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <select
          value={custom ? '__custom__' : season}
          onChange={(e) => {
            if (e.target.value === '__custom__') {
              setCustom(true);
            } else {
              setCustom(false);
              setSeason(e.target.value);
            }
          }}
          style={inputStyle}
        >
          {(data?.seasons || []).map((s) => (
            <option key={s['シーズン']} value={s['シーズン']}>
              {s['シーズン']}
            </option>
          ))}
          <option value="__custom__">期間を指定する</option>
        </select>
        {custom && (
          <>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} />
            <span>〜</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} />
          </>
        )}
        <button onClick={handlePrint} style={ghostBtn}>
          印刷・PDF（A4縦）
        </button>
      </div>

      <ErrorMsg message={error} />
      {!data && !error && <LoadingMsg />}

      {data && (
        <div className="print-area">
          {/* 見出し */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                ギンザケ稚魚　搬入集計{data.period['シーズン'] ? `　${data.period['シーズン']}` : ''}
              </div>
              <div style={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                {formatSlashJP(data.period['開始日'])} 〜 {formatSlashJP(data.period['終了日'])}
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--c-text-3)' }}>
              出力 {formatDateTimeJP(new Date().toISOString())}
            </div>
          </div>

          {/* ① 全体サマリー */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <SummaryCard label="搬入目標" value={num(t['目標kg'])} unit="kg" />
            <SummaryCard label="搬入済み" value={num(t['搬入済kg'])} unit="kg" strong />
            <SummaryCard label="残" value={num(t['残kg'])} unit="kg" />
            <SummaryCard label="進捗" value={t['進捗率'] === '' ? '―' : t['進捗率']} unit="%" strong />
          </div>
          <div
            style={{
              display: 'flex',
              gap: 18,
              flexWrap: 'wrap',
              fontSize: 12,
              color: 'var(--c-text-2)',
              border: '1px solid var(--c-border)',
              borderRadius: 8,
              padding: '6px 10px',
              marginBottom: 12,
            }}
          >
            <span>
              尾数（正味）<b style={{ fontSize: 14, color: 'var(--c-text)' }}>{num(t['尾数'])}</b> 尾
            </span>
            <span>
              尾数（入れ目込み）<b style={{ fontSize: 14, color: 'var(--c-text)' }}>{num(t['尾数込み'])}</b> 尾
            </span>
            <span>
              平均サイズ <b style={{ fontSize: 14, color: 'var(--c-text)' }}>{t['平均サイズg'] || '―'}</b> g
            </span>
            <span>
              完了 {t['完了便数']} / {t['便数']} 便
            </span>
            <span>中止 {t['中止便数']} 便</span>
            <span>取消 {t['取消便数']} 便</span>
          </div>

          {/* ② 海面業者別 */}
          <SectionTitle>
            海面業者別の進捗
            <span style={{ fontWeight: 400, fontSize: 10, color: 'var(--c-text-3)', marginLeft: 8 }}>
              正味＝入れ目を含まない数量（予定数量）／込み＝入れ目を含む計量値
            </span>
          </SectionTitle>
          <table className="dash" style={tableStyle}>
            <colgroup>
                <col style={{ width: '19%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '6%' }} />
                <col style={{ width: '6%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={th}>業者</th>
                <th style={thR}>目標kg</th>
                <th style={thR}>搬入済kg</th>
                <th style={thR}>残kg</th>
                <th style={{ ...th, width: '16%' }}>進捗</th>
                <th style={thR}>
                  尾数
                  <br />
                  正味
                </th>
                <th style={thR}>
                  尾数
                  <br />
                  入れ目込
                </th>
                <th style={thR}>平均g</th>
                <th style={thR}>便</th>
              </tr>
            </thead>
            <tbody>
              {kaimenRows.map((r) => (
                <tr key={r['海面業者ID']}>
                  <td style={td}>{kaimenPersonName(masters, r['海面業者ID']) || r['海面業者ID']}</td>
                  <td style={tdR}>{r['目標kg'] === '' ? '―' : num(r['目標kg'])}</td>
                  <td style={{ ...tdR, fontWeight: 700 }}>{num(r['搬入済kg'])}</td>
                  <td style={tdR}>{r['残kg'] === '' ? '―' : num(r['残kg'])}</td>
                  <td style={td}>
                    <ProgressBar percent={r['進捗率']} />
                  </td>
                  <td style={{ ...tdR, fontWeight: 700 }}>{num(r['尾数'])}</td>
                  <td style={{ ...tdR, color: 'var(--c-text-2)' }}>{num(r['尾数込み'])}</td>
                  <td style={tdR}>{r['平均サイズg'] || '―'}</td>
                  <td style={tdR}>
                    {r['完了便数']}/{r['便数']}
                  </td>
                </tr>
              ))}
              {kaimenRows.length === 0 && (
                <tr>
                  <td style={td} colSpan={8}>
                    この期間のデータはありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* ③ 池場別（列が多いので全幅） */}
          <SectionTitle style={{ marginTop: 12 }}>池場別の出荷</SectionTitle>
          <table className="dash" style={tableStyle}>
            <colgroup>
              <col style={{ width: '28%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '12%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={th}>池場</th>
                <th style={thR}>
                  出荷kg
                  <br />
                  正味
                </th>
                <th style={thR}>
                  計量kg
                  <br />
                  入れ目込
                </th>
                <th style={thR}>
                  尾数
                  <br />
                  正味
                </th>
                <th style={thR}>
                  尾数
                  <br />
                  入れ目込
                </th>
                <th style={thR}>便</th>
              </tr>
            </thead>
            <tbody>
              {ikebaRows.map((r) => (
                <tr key={r['池場ID']}>
                  <td style={td}>{ikebaBaseName(masters, r['池場ID']) || r['池場ID']}</td>
                  <td style={{ ...tdR, fontWeight: 700 }}>{num(r['搬入済kg'])}</td>
                  <td style={{ ...tdR, color: 'var(--c-text-2)' }}>{num(r['計量kg'])}</td>
                  <td style={{ ...tdR, fontWeight: 700 }}>{num(r['尾数'])}</td>
                  <td style={{ ...tdR, color: 'var(--c-text-2)' }}>{num(r['尾数込み'])}</td>
                  <td style={tdR}>
                    {r['完了便数']}/{r['便数']}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ④ 運送会社別 */}
          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <div style={{ width: '56%' }}>
              <SectionTitle>運送会社別</SectionTitle>
              <table className="dash" style={tableStyle}>
                <colgroup>
                  <col style={{ width: '34%' }} />
                  <col style={{ width: '24%' }} />
                  <col style={{ width: '24%' }} />
                  <col style={{ width: '18%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={th}>運送会社</th>
                    <th style={thR}>搬入済kg</th>
                    <th style={thR}>便</th>
                    <th style={thR}>中止</th>
                  </tr>
                </thead>
                <tbody>
                  {carrierRows.map((r) => (
                    <tr key={r['運送会社ID'] || 'none'}>
                      <td style={td}>{carrierName(r['運送会社ID'])}</td>
                      <td style={{ ...tdR, fontWeight: 700 }}>{num(r['搬入済kg'])}</td>
                      <td style={tdR}>
                        {r['完了便数']}/{r['便数']}
                      </td>
                      <td style={tdR}>{r['中止便数']}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ⑤ 日別の推移 */}
          <SectionTitle style={{ marginTop: 12 }}>日別の搬入（薄い部分は未完了）</SectionTitle>
          <DayChart rows={data.byDay} max={maxDayKg} />
        </div>
      )}
    </div>
  );
}

function num(v) {
  const n = Number(v);
  if (!isFinite(n) || v === '' || v === null || v === undefined) return '―';
  return Math.round(n).toLocaleString();
}

function SummaryCard({ label, value, unit, strong }) {
  return (
    <div
      style={{
        flex: 1,
        border: '1px solid var(--c-border)',
        borderRadius: 8,
        padding: '8px 10px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--c-text-3)' }}>{label}</div>
      <div style={{ fontSize: strong ? 24 : 20, fontWeight: 700, lineHeight: 1.2 }}>
        {value}
        <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 2 }}>{unit}</span>
      </div>
    </div>
  );
}

function ProgressBar({ percent }) {
  const p = Number(percent);
  const width = isFinite(p) && percent !== '' ? Math.min(100, Math.max(0, p)) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div
        style={{
          flex: 1,
          height: 10,
          border: '1px solid var(--c-border-2)',
          borderRadius: 5,
          overflow: 'hidden',
        }}
      >
        <div className="bar-progress" style={{ width: `${width}%`, height: '100%', background: '#2e7d32' }} />
      </div>
      <span style={{ fontSize: 11, minWidth: 34, textAlign: 'right' }}>
        {percent === '' ? '―' : `${percent}%`}
      </span>
    </div>
  );
}

function DayChart({ rows, max }) {
  if (!rows || rows.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--c-text-3)' }}>この期間の予定はありません</div>;
  }
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 90, borderBottom: '1px solid var(--c-border-2)' }}>
      {rows.map((d) => {
        const planned = Number(d['予定kg']) || 0;
        const done = Number(d['搬入済kg']) || 0;
        const h = Math.round((planned / max) * 78);
        const hDone = Math.round((done / max) * 78);
        return (
          <div
            key={d['日付']}
            title={`${d['日付']}　予定${planned.toLocaleString()}kg／搬入済${done.toLocaleString()}kg`}
            style={{ flex: 1, minWidth: 3, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}
          >
            <div className="bar-plan" style={{ height: h - hDone, background: '#cfd8dc' }} />
            <div className="bar-done" style={{ height: hDone, background: '#1565c0' }} />
            <div style={{ fontSize: 7, textAlign: 'center', color: 'var(--c-text-3)', lineHeight: 1.1 }}>
              {String(d['日付']).slice(8, 10)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SectionTitle({ children, style }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, margin: '0 0 4px', ...style }}>{children}</div>
  );
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 12,
};
const th = {
  textAlign: 'left',
  padding: '4px 6px',
  borderBottom: '1px solid var(--c-border-2)',
  fontWeight: 700,
  fontSize: 11,
  color: 'var(--c-text-2)',
};
const thR = { ...th, textAlign: 'right' };
const td = {
  padding: '4px 6px',
  borderBottom: '1px solid var(--c-border)',
};
const tdR = { ...td, textAlign: 'right' };

const inputStyle = {
  minHeight: 42,
  padding: '6px 10px',
  fontSize: 14,
  borderRadius: 8,
  border: '1px solid var(--c-border-2)',
  background: 'var(--c-bg-2)',
  color: 'var(--c-text)',
};

const ghostBtn = {
  minHeight: 42,
  padding: '6px 14px',
  borderRadius: 8,
  border: '1px solid var(--c-border-2)',
  background: 'transparent',
  color: 'var(--c-text-2)',
  cursor: 'pointer',
};
