import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { getSchedules } from '../lib/api';
import { today, addDays, toDateStr, formatSlashJP } from '../lib/dateUtils';
import { ErrorMsg, LoadingMsg } from '../components/UI';
import BusyButton from '../components/BusyButton';
import { buildRuns, buildBlock, carrierGroups, dateList } from '../lib/haisha';
import { useSticky } from '../lib/sticky';
import { smallBtnStyle } from '../components/FormParts';

/**
 * 配車表（★2026-11-25）：担当者のExcel「予定表」と同じ並びで、1週間分を表示する。Excelにも出力できる
 * ・列：車輌マスタの「配車表の列順」の順。列順が空欄の車輌が走ったとき・2回目の運行があるときだけ、右端に列を足す
 * ・1日3段：上＝積込順＋池場、中＝浜（所在地）：生産者、下＝数量ｔ
 * ・セルを押すと、その車輌の積込・計量の画面を開く
 */
export default function HaishaScreen({ nav }) {
  const { auth } = useAuth();
  const { masters } = useMasters();
  const [from, setFrom] = useSticky('haisha.from', () => toDateStr(today()));
  const to = toDateStr(addDays(new Date(from.replace(/-/g, '/')), 6));
  const [schedules, setSchedules] = useState(null);
  const [error, setError] = useState('');

  // Excelの期間（初期は表示中の1週間）
  const [xFrom, setXFrom] = useState(from);
  const [xTo, setXTo] = useState(to);
  const [xError, setXError] = useState('');

  const load = useCallback(() => {
    setSchedules(null);
    setError('');
    getSchedules(auth, { dateFrom: from, dateTo: to })
      .then(setSchedules)
      .catch((e) => setError(e.message));
  }, [auth, from, to]);

  useEffect(() => {
    load();
    setXFrom(from);
    setXTo(to);
  }, [load, from, to]);

  const block = useMemo(() => {
    if (!schedules || !masters) return null;
    return buildBlock(masters, buildRuns(masters, schedules), dateList(from, to));
  }, [schedules, masters, from, to]);

  function moveWeek(n) {
    setFrom(toDateStr(addDays(new Date(from.replace(/-/g, '/')), n * 7)));
  }

  async function exportExcel() {
    setXError('');
    if (!xFrom || !xTo || xFrom > xTo) {
      setXError('期間を正しく入れてください');
      return;
    }
    if (dateList(xFrom, xTo).length > 92) {
      setXError('期間は3か月までにしてください');
      return;
    }
    try {
      const list = await getSchedules(auth, { dateFrom: xFrom, dateTo: xTo });
      const { downloadHaishaExcel } = await import('../lib/haishaExcel');
      await downloadHaishaExcel({
        masters,
        runs: buildRuns(masters, list),
        from: xFrom,
        to: xTo,
        fileName: `配車表_${xFrom.replace(/-/g, '')}-${xTo.replace(/-/g, '')}.xlsx`,
      });
    } catch (e) {
      setXError(`Excelの出力に失敗しました：${e.message}`);
    }
  }

  const cols = block?.cols || [];
  const noOrder = masters && !(masters.車輌 || []).some((v) => String(v['配車表の列順'] ?? '') !== '');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', color: 'var(--c-text)', padding: '14px 12px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <h2 style={{ fontSize: 19, fontWeight: 700, margin: '0 8px 0 4px' }}>配車表</h2>
        <button style={arrowBtnStyle} onClick={() => moveWeek(-1)}>
          ‹ 前の週
        </button>
        <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} style={dateInputStyle} />
        <span style={{ fontSize: 14, color: 'var(--c-text-2)' }}>から7日間</span>
        <button style={arrowBtnStyle} onClick={() => moveWeek(1)}>
          次の週 ›
        </button>
        <button style={smallBtnStyle} onClick={() => setFrom(toDateStr(today()))}>
          今日から
        </button>
      </div>

      {noOrder && (
        <div style={{ fontSize: 14, color: 'var(--c-warn)', marginBottom: 10, lineHeight: 1.6 }}>
          車輌マスタに「配車表の列順」が入っている車輌がありません。マスタ管理 → 車輌で、左から並べたい順に 1, 2, 3… を入れてください。
        </div>
      )}
      {block && block.extraCols.length > 0 && (
        <div style={{ fontSize: 13, color: 'var(--c-warn)', marginBottom: 8 }}>
          右端の「＊」の列は、配車表の列順が空欄の車輌か、同じ日の2回目の運行です。
        </div>
      )}

      {error && <ErrorMsg message={`予定の取得に失敗しました：${error}`} onRetry={load} />}
      {!error && !block && <LoadingMsg>読み込んでいます…</LoadingMsg>}

      {block && (
        <div style={{ overflowX: 'auto', border: '1px solid var(--c-border)', borderRadius: 10 }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: '100%' }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ ...thStyle, position: 'sticky', left: 0, zIndex: 2 }}>
                  日付
                </th>
                {carrierGroups(cols).map((g) => (
                  <th key={`${g.key}-${g.from}`} colSpan={g.span} style={thStyle}>
                    {g.label}
                  </th>
                ))}
              </tr>
              <tr>
                {cols.map((c) => (
                  <th key={c.key} style={{ ...thStyle, background: c.extra ? '#3a2e12' : thStyle.background }}>
                    {c.extra ? '＊' : ''}
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.dates.map((d) => (
                <tr key={d}>
                  <td style={{ ...dateTdStyle, position: 'sticky', left: 0, zIndex: 1 }}>{formatSlashJP(d)}</td>
                  {cols.map((c, i) => (
                    <RunCell key={c.key} run={block.cell(d, i)} onOpen={nav.openRun} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ fontSize: 13, color: 'var(--c-text-3)', margin: '8px 4px 18px' }}>
        上：積込順・池場　中：浜・生産者　下：数量ｔ（車輌未定・取消は出ません。中止は「中止」）
      </div>

      <div style={{ border: '1px solid var(--c-border)', borderRadius: 12, background: 'var(--c-bg-2)', padding: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Excelに出力</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          <input type="date" value={xFrom} onChange={(e) => setXFrom(e.target.value)} style={dateInputStyle} />
          <span style={{ color: 'var(--c-text-3)' }}>〜</span>
          <input type="date" value={xTo} onChange={(e) => setXTo(e.target.value)} style={dateInputStyle} />
        </div>
        <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginBottom: 10 }}>7日ずつ1ブロックにして、1枚のシートに並べます（週ごとに改ページ）。</div>
        <ErrorMsg message={xError} />
        <BusyButton onClick={exportExcel} disabled={!masters}>
          Excelをダウンロード
        </BusyButton>
      </div>
    </div>
  );
}

function RunCell({ run, onOpen }) {
  const base = {
    border: '1px solid var(--c-border-2)',
    padding: '4px 6px',
    minWidth: 104,
    textAlign: 'center',
    verticalAlign: 'top',
    background: 'transparent',
  };
  if (!run) return <td style={base} />;
  return (
    <td style={{ ...base, cursor: 'pointer' }} onClick={() => onOpen(run.runId)}>
      <div style={{ fontWeight: 600 }}>{run.top}</div>
      <div style={{ color: 'var(--c-text-2)', margin: '2px 0', whiteSpace: 'pre-line' }}>{run.middle}</div>
      <div style={{ fontWeight: 700, fontSize: 15, color: run.stopped ? '#b39ddb' : 'var(--c-accent)' }}>{run.bottom}</div>
    </td>
  );
}

const thStyle = {
  border: '1px solid var(--c-border-2)',
  background: 'var(--c-bg-3)',
  padding: '6px 8px',
  fontWeight: 700,
  whiteSpace: 'nowrap',
};

const dateTdStyle = {
  border: '1px solid var(--c-border-2)',
  background: 'var(--c-bg-2)',
  padding: '6px 8px',
  fontWeight: 700,
  whiteSpace: 'nowrap',
  verticalAlign: 'middle',
};

const arrowBtnStyle = {
  minHeight: 42,
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid var(--c-border-2)',
  background: 'var(--c-bg-2)',
  color: 'var(--c-text)',
  fontSize: 14,
  cursor: 'pointer',
};

const dateInputStyle = {
  padding: '8px 10px',
  fontSize: 14,
  borderRadius: 8,
  border: '1px solid var(--c-border-2)',
  background: 'var(--c-bg-2)',
  color: 'var(--c-text)',
};
