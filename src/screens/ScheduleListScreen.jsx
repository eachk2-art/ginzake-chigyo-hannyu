import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { getPlanTree, reorderPlans, reorderAllocations } from '../lib/api';
import { today, addDays, toDateStr, formatJP, monthRange } from '../lib/dateUtils';
import { ErrorMsg, LoadingMsg, EmptyMsg } from '../components/UI';
import IkebaCard from '../components/PlanTree';
import { isTaikyo, isAdmin } from '../lib/roles';
import { useSticky, toggleInSet } from '../lib/sticky';
import { ikebaOrderIndex, num, kgText, isInactiveStatus } from '../lib/planUtils';

const DEFAULT_RANGE_DAYS = 13; // 今日から2週間先まで

/**
 * 積込予定一覧（★2026-11-24 親子方式）：日付 → 池場（池場日誌） → 親 → 車輌
 * ・納品先（親）の並べ替えは管理者、納品先の中の車輌の並べ替えは太協も可
 */
export default function ScheduleListScreen({ nav }) {
  const { auth } = useAuth();
  const { masters } = useMasters();
  const canCreate = isTaikyo(auth.role);
  const canReorderPlan = isAdmin(auth.role);
  const canReorderAlloc = isTaikyo(auth.role);

  const [dateFrom, setDateFrom] = useSticky('list.from', () => toDateStr(today()));
  const [dateTo, setDateTo] = useSticky('list.to', () => toDateStr(addDays(today(), DEFAULT_RANGE_DAYS)));
  const [tree, setTree] = useState(null);
  const [error, setError] = useState('');
  const [openDates, setOpenDates] = useSticky('list.openDates', () => new Set());
  const [openIkeba, setOpenIkeba] = useSticky('list.openIkeba', () => new Set());
  const [openPlans, setOpenPlans] = useSticky('list.openPlans', () => new Set());
  const [orderError, setOrderError] = useState('');
  const [moving, setMoving] = useState(false);

  const load = useCallback(() => {
    setError('');
    return getPlanTree(auth, { dateFrom, dateTo })
      .then(setTree)
      .catch((e) => setError(e.message));
  }, [auth, dateFrom, dateTo]);

  useEffect(() => {
    setTree(null);
    load();
  }, [load]);

  const days = useMemo(() => {
    const idx = ikebaOrderIndex(masters);
    return (tree || []).map((d) => {
      const ikebas = [...d['池場']].sort((a, b) => idx(a['池場ID']) - idx(b['池場ID']));
      const runIds = new Set();
      let kg = 0;
      ikebas.forEach((ik) =>
        ik['親'].forEach((p) => {
          (p['割当'] || []).forEach((a) => {
            if (!isInactiveStatus(a['ステータス'])) runIds.add(a['運行ID'] || a['積込予定ID']);
          });
          if (isTaikyo(auth.role)) {
            if (!isInactiveStatus(p['ステータス'])) kg += num(p['予定数量kg']);
          } else {
            (p['割当'] || []).forEach((a) => {
              if (!isInactiveStatus(a['ステータス'])) kg += num(a['予定数量kg']);
            });
          }
        })
      );
      const planCount = ikebas.reduce((s, ik) => s + ik['親'].length, 0);
      return { date: d['日付'], ikebas, runCount: runIds.size, kg, planCount };
    });
  }, [tree, masters, auth.role]);

  async function runReorder(fn) {
    setOrderError('');
    setMoving(true);
    try {
      await fn();
      await load();
    } catch (e) {
      setOrderError(e.message);
    } finally {
      setMoving(false);
    }
  }

  function movePlan(date, node, index, dir) {
    const plans = node['親'];
    const target = index + dir;
    if (target < 0 || target >= plans.length || moving) return;
    const ids = plans.map((p) => p['搬入予定ID']);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    runReorder(() => reorderPlans(auth, date, node['池場ID'], ids));
  }

  function moveAlloc(plan, index, dir) {
    const allocs = plan['割当'] || [];
    const target = index + dir;
    if (target < 0 || target >= allocs.length || moving) return;
    const ids = allocs.map((a) => a['積込予定ID']);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    runReorder(() => reorderAllocations(auth, plan['搬入予定ID'], ids));
  }

  const totalPlans = days.reduce((s, d) => s + d.planCount, 0);

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
        {[10, 11, 12].map((m) => (
          <button
            key={m}
            onClick={() => {
              const { from, to } = monthRange(today().getFullYear(), m);
              setDateFrom(from);
              setDateTo(to);
            }}
            style={monthBtnStyle}
          >
            {m}月
          </button>
        ))}
        {canCreate && (
          <button onClick={nav.openCreate} style={createBtnStyle}>
            ＋ 新規登録
          </button>
        )}
      </div>

      <div style={{ padding: '10px 16px' }}>
        {error && <ErrorMsg message={`予定の取得に失敗しました：${error}`} onRetry={load} />}
        {orderError && <ErrorMsg message={`並べ替えに失敗しました：${orderError}`} />}
        {!error && tree === null && <LoadingMsg>予定を読み込んでいます…</LoadingMsg>}
        {!error && tree && days.length === 0 && <EmptyMsg>この期間の予定はありません</EmptyMsg>}
        {!error && tree && days.length > 0 && (
          <div style={{ fontSize: 13, color: 'var(--c-text-3)', margin: '4px 0 10px' }}>
            納品先 {totalPlans}件を表示中（{days.length}日）
          </div>
        )}

        {!error &&
          days.map((d) => {
            const dateOpen = openDates.has(d.date);
            return (
              <div
                key={d.date}
                style={{
                  background: 'var(--c-bg-2)',
                  border: '1px solid var(--c-border)',
                  borderRadius: 12,
                  marginBottom: 10,
                  overflow: 'hidden',
                }}
              >
                <button onClick={() => toggleInSet(setOpenDates, d.date)} style={dateBtnStyle}>
                  <span>{formatJP(d.date)}</span>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>
                    {d.runCount}台・{kgText(d.kg)}kg{' '}
                    <span style={{ color: 'var(--c-text-3)', fontWeight: 400 }}>{dateOpen ? '▲' : '▼'}</span>
                  </span>
                </button>
                {dateOpen && (
                  <div style={{ padding: '0 8px 4px' }}>
                    {d.ikebas.map((node) => {
                      const key = `${d.date}|${node['池場ID']}`;
                      return (
                        <IkebaCard
                          key={key}
                          date={d.date}
                          node={node}
                          masters={masters}
                          role={auth.role}
                          open={openIkeba.has(key)}
                          onToggle={() => toggleInSet(setOpenIkeba, key)}
                          planOpen={(id) => openPlans.has(id)}
                          onTogglePlan={(id) => toggleInSet(setOpenPlans, id)}
                          onOpenPlan={nav.openPlan}
                          onOpenRun={nav.openRun}
                          onOpenPondLog={nav.openPondLog}
                          onOpenBulk={nav.openBulk}
                          onMovePlan={canReorderPlan ? (i, dir) => movePlan(d.date, node, i, dir) : undefined}
                          onMoveAlloc={canReorderAlloc ? moveAlloc : undefined}
                          moving={moving}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

const dateBtnStyle = {
  width: '100%',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '14px 16px',
  background: 'transparent',
  border: 'none',
  color: 'var(--c-text)',
  fontSize: 18,
  fontWeight: 700,
  cursor: 'pointer',
  minHeight: 42,
  textAlign: 'left',
};

const monthBtnStyle = {
  minHeight: 42,
  padding: '8px 12px',
  fontSize: 14,
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

const createBtnStyle = {
  marginLeft: 'auto',
  minHeight: 42,
  padding: '8px 16px',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 700,
  border: 'none',
  background: 'var(--c-accent)',
  color: '#03202e',
  cursor: 'pointer',
};
