import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { getSchedules, getLastUpdated } from '../lib/api';
import { today, addDays, toDateStr, formatJP, formatDateTimeJP } from '../lib/dateUtils';
import { ikebaBaseName, ikebaRegion, vehicleLabel, carrierNameByVehicle, kaimenPersonName, kaimenLocation, tantoushaName } from '../lib/masterLookup';
import { representativeStatus } from '../lib/statusUtils';
import { ErrorMsg, LoadingMsg, EmptyMsg, StatusBadge, statusAccentColor } from '../components/UI';
import CalendarPopup from '../components/CalendarPopup';

export default function HomeScreen({ onEditSchedule, initialFocus }) {
  const { auth } = useAuth();
  const { masters } = useMasters();
  const canEdit = auth.role === '太協';
  const [selectedDate, setSelectedDate] = useState(() =>
    initialFocus ? new Date(initialFocus.date.replace(/-/g, '/')) : today()
  );
  const [showCalendar, setShowCalendar] = useState(false);

  const [schedules, setSchedules] = useState(null);
  const [scheduleError, setScheduleError] = useState('');
  const [collapsed, setCollapsed] = useState(() => new Set()); // 池場：初期状態は開いている
  const [openKaimen, setOpenKaimen] = useState(() =>
    initialFocus ? new Set([`${initialFocus.ikebaId}|${initialFocus.kaimenId}`]) : new Set()
  ); // 海面業者：初期状態は閉じている（車輌明細を隠す）。ただし戻ってきた先の業者だけは開いておく

  function toggleIkeba(ikebaId) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(ikebaId)) next.delete(ikebaId);
      else next.add(ikebaId);
      return next;
    });
  }

  function toggleKaimen(key) {
    setOpenKaimen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const [lastUpdated, setLastUpdated] = useState(undefined); // undefined=未取得, null=データなし
  const [lastUpdatedError, setLastUpdatedError] = useState('');

  const loadLastUpdated = useCallback(() => {
    setLastUpdatedError('');
    getLastUpdated(auth)
      .then((d) => setLastUpdated(d.lastUpdated))
      .catch((e) => setLastUpdatedError(e.message));
  }, [auth]);

  const loadSchedules = useCallback(() => {
    const dateStr = toDateStr(selectedDate);
    setSchedules(null);
    setScheduleError('');
    // groupVisible:true … 運送会社ロールのときだけ、他社車輌が混ざる組み合わせも
    // まとめて見せる（ドライバー同士が連絡を取り合えるように）。この「他社も見える」
    // 挙動は当日1日分を見るホーム画面限定。積込予定一覧（期間指定）では意図的に渡さず、
    // 自社車輌の予定だけに絞る（先々の予定確認・後日の集計のしやすさを優先）。
    getSchedules(auth, { dateFrom: dateStr, dateTo: dateStr, groupVisible: true })
      .then(setSchedules)
      .catch((e) => setScheduleError(e.message));
  }, [auth, selectedDate]);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  useEffect(() => {
    loadLastUpdated();
  }, [loadLastUpdated]);

  // その日の予定を 池場 → 海面業者 の2階層でまとめる（車輌は海面業者の下にそのまま並べる）。
  // 単日表示なので、並び順は「積込順」のみで決める（無ければ積込予定IDの下2桁で暫定対応）。
  const groups = useMemo(() => {
    if (!schedules) return [];
    const orderKey = (s) => {
      const n = Number(s['積込順']);
      if (!isNaN(n) && s['積込順'] !== '' && s['積込順'] !== undefined) return n;
      const parts = String(s['積込予定ID']).split('-');
      const suffix = Number(parts[parts.length - 1]);
      return isNaN(suffix) ? 999999 : suffix;
    };

    const ikebaOrder = (masters?.池場 || []).map((p) => p['池場ID']);
    const orderIndex = (id) => {
      const i = ikebaOrder.indexOf(id);
      return i === -1 ? ikebaOrder.length : i;
    };

    const byIkeba = new Map();
    schedules.forEach((s) => {
      const ikebaId = s['池場ID'];
      if (!byIkeba.has(ikebaId)) byIkeba.set(ikebaId, new Map());
      const byKaimen = byIkeba.get(ikebaId);
      const kaimenId = s['海面業者ID'];
      if (!byKaimen.has(kaimenId)) byKaimen.set(kaimenId, []);
      byKaimen.get(kaimenId).push(s);
    });

    return Array.from(byIkeba.entries())
      .map(([ikebaId, byKaimen]) => {
        const kaimenGroups = Array.from(byKaimen.entries())
          .map(([kaimenId, items]) => {
            const sorted = [...items].sort((a, b) => orderKey(a) - orderKey(b));
            const totalKg = sorted.reduce((sum, s) => sum + (Number(s['予定数量kg']) || 0), 0);
            return {
              kaimenId,
              items: sorted,
              totalKg,
              minOrder: orderKey(sorted[0]),
              status: representativeStatus(sorted),
            };
          })
          .sort((a, b) => a.minOrder - b.minOrder);
        const totalCount = kaimenGroups.reduce((sum, g) => sum + g.items.length, 0);
        const totalKg = kaimenGroups.reduce((sum, g) => sum + g.totalKg, 0);
        return { ikebaId, kaimenGroups, totalCount, totalKg };
      })
      .sort((a, b) => orderIndex(a.ikebaId) - orderIndex(b.ikebaId));
  }, [schedules, masters]);

  return (
    <div style={{ minHeight: '100vh', width: '100%', overflowX: 'hidden', boxSizing: 'border-box', background: 'var(--c-bg)', color: 'var(--c-text)', paddingBottom: 40 }}>
      {/* 最終更新日時 */}
      <div style={{ padding: '14px 16px 0' }}>
        {lastUpdatedError ? (
          <ErrorMsg message={`最終更新日時の取得に失敗しました：${lastUpdatedError}`} onRetry={loadLastUpdated} />
        ) : lastUpdated === undefined ? (
          <div style={{ fontSize: 14, color: 'var(--c-text-3)' }}>最終更新日時を確認中…</div>
        ) : (
          <div
            style={{
              background: 'var(--c-bg-2)',
              border: '1px solid var(--c-border)',
              borderRadius: 12,
              padding: '12px 16px',
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--c-text-3)' }}>最終更新</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>
              {lastUpdated ? formatDateTimeJP(lastUpdated) : '更新履歴はまだありません'}
            </div>
          </div>
        )}
      </div>

      {/* 日付ヘッダー */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '20px 8px 10px',
          boxSizing: 'border-box',
          width: '100%',
        }}
      >
        <button onClick={() => setSelectedDate((d) => addDays(d, -1))} style={arrowBtnStyle}>
          ‹
        </button>
        <div style={{ fontSize: 20, fontWeight: 700, minWidth: 120, textAlign: 'center' }}>
          {formatJP(selectedDate)}
        </div>
        <button onClick={() => setSelectedDate((d) => addDays(d, 1))} style={arrowBtnStyle}>
          ›
        </button>
        <button onClick={() => setShowCalendar(true)} style={{ ...arrowBtnStyle, fontSize: 18 }}>
          📅
        </button>
      </div>

      {!sameDayAsToday(selectedDate) && (
        <div style={{ textAlign: 'center' }}>
          <button onClick={() => setSelectedDate(today())} style={todayLinkStyle}>
            今日に戻る
          </button>
        </div>
      )}

      {/* 予定一覧 */}
      <div style={{ padding: '10px 16px' }}>
        {scheduleError && (
          <ErrorMsg message={`予定の取得に失敗しました：${scheduleError}`} onRetry={loadSchedules} />
        )}
        {!scheduleError && schedules === null && <LoadingMsg>予定を読み込んでいます…</LoadingMsg>}
        {!scheduleError && schedules && schedules.length === 0 && (
          <EmptyMsg>この日の予定はありません</EmptyMsg>
        )}
        {!scheduleError &&
          groups.map(({ ikebaId, kaimenGroups, totalCount, totalKg }) => {
            const isOpen = !collapsed.has(ikebaId);
            return (
              <div
                key={ikebaId}
                style={{
                  background: 'var(--c-bg-2)',
                  border: '1px solid var(--c-border)',
                  borderRadius: 12,
                  marginBottom: 10,
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => toggleIkeba(ikebaId)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    padding: '12px 16px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--c-text)',
                    cursor: 'pointer',
                    minHeight: 42,
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 17, fontWeight: 700 }}>{ikebaBaseName(masters, ikebaId)}</span>
                    {ikebaRegion(masters, ikebaId) && (
                      <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--c-text-3)' }}>
                        {ikebaRegion(masters, ikebaId)}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: 15, fontWeight: 700 }}>
                      <span>{totalCount}台</span>
                      <span>{totalKg.toLocaleString()}kg</span>
                    </div>
                    <span style={{ color: 'var(--c-text-3)', fontWeight: 400, fontSize: 15 }}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>
                {isOpen &&
                  kaimenGroups.map(({ kaimenId, items, totalKg: kaimenTotalKg, status: kaimenStatus }) => {
                    const kaimenKey = `${ikebaId}|${kaimenId}`;
                    const kaimenOpen = openKaimen.has(kaimenKey);
                    return (
                      <div key={kaimenId} style={{ borderTop: '1px solid var(--c-border)' }}>
                        <button
                          onClick={() => toggleKaimen(kaimenKey)}
                          style={{
                            width: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                            padding: '10px 16px 10px 12px',
                            background: 'var(--c-ok-bg)',
                            border: 'none',
                            borderLeft: `5px solid ${statusAccentColor(kaimenStatus)}`,
                            color: 'var(--c-ok)',
                            cursor: 'pointer',
                            minHeight: 42,
                            textAlign: 'left',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontSize: 14, fontWeight: 700 }}>{kaimenPersonName(masters, kaimenId)}</span>
                              {kaimenLocation(masters, kaimenId) && (
                                <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.8 }}>
                                  {kaimenLocation(masters, kaimenId)}
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: 14, fontWeight: 700 }}>
                              <span>{items.length}台</span>
                              <span>{kaimenTotalKg.toLocaleString()}kg</span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <StatusBadge status={kaimenStatus} />
                            <span style={{ opacity: 0.8, fontWeight: 400, fontSize: 14 }}>{kaimenOpen ? '▲' : '▼'}</span>
                          </div>
                        </button>
                        {kaimenOpen &&
                          items.map((s) => (
                            <div
                              key={s['積込予定ID']}
                              onClick={canEdit ? () => onEditSchedule(s) : undefined}
                              style={{
                                padding: '10px 16px 10px 28px',
                                borderTop: '1px solid var(--c-border)',
                                background: 'var(--c-warn-bg)',
                                cursor: canEdit ? 'pointer' : 'default',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 15, color: 'var(--c-text)', fontWeight: 600 }}>
                                  {vehicleLabel(masters, s['車輌ID'])}（{carrierNameByVehicle(masters, s['車輌ID'])}）
                                </span>
                                <StatusBadge status={s['ステータス']} />
                              </div>
                              <div style={{ fontSize: 14, color: 'var(--c-text)', marginTop: 4 }}>
                                予定数量：{s['予定数量kg']}kg
                              </div>
                              <div style={{ fontSize: 14, color: 'var(--c-text-2)', marginTop: 2 }}>
                                内水面立会者：{tantoushaName(masters, s['内水面立会者ID'])}
                              </div>
                              {s['海面立会者ID'] && (
                                <div style={{ fontSize: 14, color: 'var(--c-text-2)', marginTop: 2 }}>
                                  海面立会者：{tantoushaName(masters, s['海面立会者ID'])}
                                </div>
                              )}
                              {canEdit && (
                                <div style={{ fontSize: 13, color: 'var(--c-accent)', marginTop: 6, textAlign: 'right' }}>
                                  編集 ›
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    );
                  })}
              </div>
            );
          })}
      </div>

      {showCalendar && (
        <CalendarPopup
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
          onClose={() => setShowCalendar(false)}
        />
      )}
    </div>
  );
}

function sameDayAsToday(date) {
  const t = today();
  return (
    date.getFullYear() === t.getFullYear() &&
    date.getMonth() === t.getMonth() &&
    date.getDate() === t.getDate()
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
