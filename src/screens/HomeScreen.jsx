import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { getPlanTree, getLastUpdated } from '../lib/api';
import { today, addDays, toDateStr, formatJP, formatDateTimeJP } from '../lib/dateUtils';
import { ErrorMsg, LoadingMsg, EmptyMsg } from '../components/UI';
import CalendarPopup from '../components/CalendarPopup';
import IkebaCard from '../components/PlanTree';
import { useSticky, toggleInSet } from '../lib/sticky';
import { ikebaOrderIndex } from '../lib/planUtils';

/**
 * ホーム（★2026-11-24 親子方式）：1日分を「池場（池場日誌） → 親（海面業者・浜） → 車輌」で表示する
 * nav：{ openPlan, openRun, openPondLog, openBulk }（App から渡す画面遷移）
 */
export default function HomeScreen({ nav }) {
  const { auth } = useAuth();
  const { masters } = useMasters();

  const [dateStr, setDateStr] = useSticky('home.date', () => toDateStr(today()));
  const selectedDate = new Date(dateStr.replace(/-/g, '/'));
  const [showCalendar, setShowCalendar] = useState(false);

  const [tree, setTree] = useState(null);
  const [error, setError] = useState('');
  const [closedIkeba, setClosedIkeba] = useSticky('home.closedIkeba', () => new Set()); // 池場：初期は開く
  const [openPlans, setOpenPlans] = useSticky('home.openPlans', () => new Set()); // 親：初期は閉じる

  const [lastUpdated, setLastUpdated] = useState(undefined);
  const [lastUpdatedError, setLastUpdatedError] = useState('');

  const loadLastUpdated = useCallback(() => {
    setLastUpdatedError('');
    getLastUpdated(auth)
      .then((d) => setLastUpdated(d.lastUpdated))
      .catch((e) => setLastUpdatedError(e.message));
  }, [auth]);

  const load = useCallback(() => {
    setTree(null);
    setError('');
    // groupVisible:true … 運送会社のときだけ、自社の車輌が付いている納品先は他社の車輌も見せる（ホームだけ）
    getPlanTree(auth, { dateFrom: dateStr, dateTo: dateStr, groupVisible: true })
      .then(setTree)
      .catch((e) => setError(e.message));
  }, [auth, dateStr]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadLastUpdated();
  }, [loadLastUpdated]);

  const ikebaList = useMemo(() => {
    const day = (tree || []).find((d) => d['日付'] === dateStr);
    if (!day) return [];
    const idx = ikebaOrderIndex(masters);
    return [...day['池場']].sort((a, b) => idx(a['池場ID']) - idx(b['池場ID']));
  }, [tree, dateStr, masters]);

  function moveDate(n) {
    setDateStr(toDateStr(addDays(selectedDate, n)));
  }

  const isToday = dateStr === toDateStr(today());

  return (
    <div style={{ minHeight: '100vh', width: '100%', overflowX: 'hidden', background: 'var(--c-bg)', color: 'var(--c-text)', paddingBottom: 40 }}>
      <div style={{ padding: '14px 16px 0' }}>
        {lastUpdatedError ? (
          <ErrorMsg message={`最終更新日時の取得に失敗しました：${lastUpdatedError}`} onRetry={loadLastUpdated} />
        ) : lastUpdated === undefined ? (
          <div style={{ fontSize: 14, color: 'var(--c-text-3)' }}>最終更新日時を確認中…</div>
        ) : (
          <div style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border)', borderRadius: 12, padding: '12px 16px' }}>
            <div style={{ fontSize: 12, color: 'var(--c-text-3)' }}>最終更新</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>
              {lastUpdated ? formatDateTimeJP(lastUpdated) : '更新履歴はまだありません'}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '20px 8px 10px' }}>
        <button onClick={() => moveDate(-1)} style={arrowBtnStyle}>
          ‹
        </button>
        <div style={{ fontSize: 20, fontWeight: 700, minWidth: 120, textAlign: 'center' }}>{formatJP(selectedDate)}</div>
        <button onClick={() => moveDate(1)} style={arrowBtnStyle}>
          ›
        </button>
        <button onClick={() => setShowCalendar(true)} style={{ ...arrowBtnStyle, fontSize: 18 }}>
          📅
        </button>
      </div>

      {!isToday && (
        <div style={{ textAlign: 'center' }}>
          <button onClick={() => setDateStr(toDateStr(today()))} style={todayLinkStyle}>
            今日に戻る
          </button>
        </div>
      )}

      <div style={{ padding: '10px 16px' }}>
        {error && <ErrorMsg message={`予定の取得に失敗しました：${error}`} onRetry={load} />}
        {!error && tree === null && <LoadingMsg>予定を読み込んでいます…</LoadingMsg>}
        {!error && tree && ikebaList.length === 0 && <EmptyMsg>この日の予定はありません</EmptyMsg>}
        {!error &&
          ikebaList.map((node) => (
            <IkebaCard
              key={node['池場ID']}
              date={dateStr}
              node={node}
              masters={masters}
              role={auth.role}
              open={!closedIkeba.has(node['池場ID'])}
              onToggle={() => toggleInSet(setClosedIkeba, node['池場ID'])}
              planOpen={(id) => openPlans.has(id)}
              onTogglePlan={(id) => toggleInSet(setOpenPlans, id)}
              onOpenPlan={nav.openPlan}
              onOpenRun={nav.openRun}
              onOpenPondLog={nav.openPondLog}
              onOpenArrivalPlan={nav.openArrivalPlan}
              onOpenBulk={nav.openBulk}
            />
          ))}
      </div>

      {showCalendar && (
        <CalendarPopup
          selectedDate={selectedDate}
          onSelect={(d) => setDateStr(toDateStr(d))}
          onClose={() => setShowCalendar(false)}
        />
      )}
    </div>
  );
}

const arrowBtnStyle = {
  minWidth: 42,
  minHeight: 42,
  fontSize: 22,
  background: 'var(--c-bg-2)',
  border: '1px solid var(--c-border-2)',
  borderRadius: 10,
  color: 'var(--c-text)',
  cursor: 'pointer',
};

const todayLinkStyle = {
  background: 'transparent',
  border: 'none',
  color: 'var(--c-accent)',
  fontSize: 14,
  cursor: 'pointer',
  padding: '4px 8px',
};
