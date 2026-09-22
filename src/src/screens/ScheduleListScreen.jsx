import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { getSchedules } from '../lib/api';
import { today, addDays, toDateStr, formatJP, monthRange } from '../lib/dateUtils';
import { ikebaName, vehicleLabel, carrierNameByVehicle, kaimenName, tantoushaName } from '../lib/masterLookup';
import { representativeStatus } from '../lib/statusUtils';
import { ErrorMsg, LoadingMsg, EmptyMsg, StatusBadge } from '../components/UI';

const DEFAULT_RANGE_DAYS = 13; // 今日から2週間先まで

export default function ScheduleListScreen({ onCreateNew, onEditSchedule, initialFocus }) {
  const { auth } = useAuth();
  const { masters } = useMasters();
  const canEdit = auth.role === '太協';

  // 戻ってきた先が期間の外にある場合でも見えるよう、期間を必要な分だけ広げておく
  const [dateFrom, setDateFrom] = useState(() => {
    const base = toDateStr(today());
    return initialFocus && initialFocus.date < base ? initialFocus.date : base;
  });
  const [dateTo, setDateTo] = useState(() => {
    const base = toDateStr(addDays(today(), DEFAULT_RANGE_DAYS));
    return initialFocus && initialFocus.date > base ? initialFocus.date : base;
  });
  const [schedules, setSchedules] = useState(null);
  const [error, setError] = useState('');

  // 4階層ぶんの開閉状態。すべて初期状態は閉じている（キーは上の階層のキーを含めて一意にする）。
  // ただし、戻ってきた先の日付・池場・業者だけは開いた状態にしておく。
  const [openDate, setOpenDate] = useState(() => (initialFocus ? new Set([initialFocus.date]) : new Set()));
  const [openIkeba, setOpenIkeba] = useState(() =>
    initialFocus ? new Set([`${initialFocus.date}|${initialFocus.ikebaId}`]) : new Set()
  );
  const [openKaimen, setOpenKaimen] = useState(() =>
    initialFocus
      ? new Set([`${initialFocus.date}|${initialFocus.ikebaId}|${initialFocus.kaimenId}`])
      : new Set()
  );

  function makeToggler(setter) {
    return (key) => {
      setter((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    };
  }
  const toggleDate = makeToggler(setOpenDate);
  const toggleIkeba = makeToggler(setOpenIkeba);
  const toggleKaimen = makeToggler(setOpenKaimen);

  const load = useCallback(() => {
    setSchedules(null);
    setError('');
    getSchedules(auth, { dateFrom, dateTo })
      .then(setSchedules)
      .catch((e) => setError(e.message));
  }, [auth, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  // 積込順（列が無い古いデータは積込予定IDの下2桁で暫定対応）
  const loadingOrder = useCallback((s) => {
    const n = Number(s['積込順']);
    if (!isNaN(n) && s['積込順'] !== '' && s['積込順'] !== undefined) return n;
    const parts = String(s['積込予定ID']).split('-');
    const suffix = Number(parts[parts.length - 1]);
    return isNaN(suffix) ? 999999 : suffix;
  }, []);

  // 4階層でグルーピングする：日付 → 池場 → 海面業者 → 車輌（予定）。
  // 「1レコード＝車輌1台分」というデータの持ち方は変えず、表示側だけをまとめている。
  // 階層1（日付）の並び順：日付の早い順。予定が無い日は、そもそもグループが作られない。
  // 階層2（池場）の並び順：マスタ_池場の登録順
  // 階層3（海面業者）の並び順：そのグループ内で一番早い積込順の予定を基準にする
  // 階層4（車輌）の並び順：積込順
  const dateGroups = useMemo(() => {
    if (!schedules) return [];

    const ikebaOrder = (masters?.池場 || []).map((p) => p['池場ID']);
    const ikebaOrderIndex = (ikebaId) => {
      const i = ikebaOrder.indexOf(ikebaId);
      return i === -1 ? ikebaOrder.length : i;
    };

    const byDate = new Map();
    schedules.forEach((s) => {
      const dateKey = s['積込日'];
      if (!byDate.has(dateKey)) byDate.set(dateKey, new Map());
      const byIkeba = byDate.get(dateKey);
      const ikebaId = s['池場ID'];
      if (!byIkeba.has(ikebaId)) byIkeba.set(ikebaId, new Map());
      const byKaimen = byIkeba.get(ikebaId);
      const kaimenId = s['海面業者ID'];
      if (!byKaimen.has(kaimenId)) byKaimen.set(kaimenId, []);
      byKaimen.get(kaimenId).push(s);
    });

    return Array.from(byDate.entries())
      .map(([dateKey, byIkeba]) => {
        const ikebaGroups = Array.from(byIkeba.entries())
          .map(([ikebaId, byKaimen]) => {
            const kaimenGroups = Array.from(byKaimen.entries())
              .map(([kaimenId, items]) => {
                const sorted = [...items].sort((a, b) => loadingOrder(a) - loadingOrder(b));
                const totalKg = sorted.reduce((sum, s) => sum + (Number(s['予定数量kg']) || 0), 0);
                return {
                  kaimenId,
                  items: sorted,
                  totalKg,
                  minOrder: loadingOrder(sorted[0]),
                  status: representativeStatus(sorted),
                };
              })
              .sort((a, b) => a.minOrder - b.minOrder);
            const totalCount = kaimenGroups.reduce((sum, g) => sum + g.items.length, 0);
            const totalKg = kaimenGroups.reduce((sum, g) => sum + g.totalKg, 0);
            return { ikebaId, kaimenGroups, totalCount, totalKg };
          })
          .sort((a, b) => ikebaOrderIndex(a.ikebaId) - ikebaOrderIndex(b.ikebaId));
        const totalCount = ikebaGroups.reduce((sum, g) => sum + g.totalCount, 0);
        const totalKg = ikebaGroups.reduce((sum, g) => sum + g.totalKg, 0);
        return { dateKey, ikebaGroups, totalCount, totalKg };
      })
      .sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));
  }, [schedules, masters, loadingOrder]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', color: 'var(--c-text)', paddingBottom: 40 }}>
      {/* 期間絞り込み */}
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
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={dateInputStyle}
          />
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
        {canEdit && (
          <button
            onClick={onCreateNew}
            style={{
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
            }}
          >
            ＋ 新規登録
          </button>
        )}
      </div>

      <div style={{ padding: '10px 16px' }}>
        {error && <ErrorMsg message={`予定の取得に失敗しました：${error}`} onRetry={load} />}
        {!error && schedules === null && <LoadingMsg>予定を読み込んでいます…</LoadingMsg>}
        {!error && schedules && schedules.length === 0 && <EmptyMsg>この期間の予定はありません</EmptyMsg>}

        {!error && schedules && schedules.length > 0 && (
          <div style={{ fontSize: 13, color: 'var(--c-text-3)', margin: '4px 0 10px' }}>
            {schedules.length}件を表示中（{dateGroups.length}日）
          </div>
        )}

        {!error &&
          dateGroups.map(({ dateKey, ikebaGroups, totalCount, totalKg }) => {
            const dateOpen = openDate.has(dateKey);
            return (
              <div
                key={dateKey}
                style={{
                  background: 'var(--c-bg-2)',
                  border: '1px solid var(--c-border)',
                  borderRadius: 12,
                  marginBottom: 10,
                  overflow: 'hidden',
                }}
              >
                {/* 階層1：日付 */}
                <button
                  onClick={() => toggleDate(dateKey)}
                  style={{
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
                  }}
                >
                  <span>{formatJP(dateKey)}</span>
                  <span style={{ fontSize: 15, color: 'var(--c-text)', fontWeight: 700 }}>
                    {totalCount}台・{totalKg.toLocaleString()}kg{' '}
                    <span style={{ color: 'var(--c-text-3)', fontWeight: 400 }}>{dateOpen ? '▲' : '▼'}</span>
                  </span>
                </button>

                {dateOpen &&
                  ikebaGroups.map(({ ikebaId, kaimenGroups, totalCount: ikebaCount, totalKg: ikebaKg }) => {
                    const ikebaKey = `${dateKey}|${ikebaId}`;
                    const ikebaOpen = openIkeba.has(ikebaKey);
                    return (
                      <div key={ikebaId} style={{ borderTop: '1px solid var(--c-border)' }}>
                        {/* 階層2：池場 */}
                        <button
                          onClick={() => toggleIkeba(ikebaKey)}
                          style={{
                            width: '100%',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '12px 16px 12px 24px',
                            background: 'var(--c-bg)',
                            border: 'none',
                            color: 'var(--c-text)',
                            fontSize: 15,
                            fontWeight: 700,
                            cursor: 'pointer',
                            minHeight: 42,
                            textAlign: 'left',
                          }}
                        >
                          <span>{ikebaName(masters, ikebaId)}</span>
                          <span style={{ fontSize: 14, color: 'var(--c-text)', fontWeight: 700 }}>
                            {ikebaCount}台・{ikebaKg.toLocaleString()}kg{' '}
                            <span style={{ color: 'var(--c-text-3)', fontWeight: 400 }}>{ikebaOpen ? '▲' : '▼'}</span>
                          </span>
                        </button>

                        {ikebaOpen &&
                          kaimenGroups.map(({ kaimenId, items, totalKg: kaimenTotalKg, status: kaimenStatus }) => {
                            const kaimenKey = `${ikebaKey}|${kaimenId}`;
                            const kaimenOpen = openKaimen.has(kaimenKey);
                            return (
                              <div key={kaimenId} style={{ borderTop: '1px solid var(--c-border)' }}>
                                {/* 階層3：海面業者（生産者） */}
                                <button
                                  onClick={() => toggleKaimen(kaimenKey)}
                                  style={{
                                    width: '100%',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '10px 16px 10px 32px',
                                    background: 'var(--c-bg-3)',
                                    border: 'none',
                                    color: 'var(--c-text)',
                                    fontSize: 14,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    minHeight: 42,
                                    textAlign: 'left',
                                  }}
                                >
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {kaimenName(masters, kaimenId)}
                                    <StatusBadge status={kaimenStatus} />
                                  </span>
                                  <span style={{ fontSize: 14, color: 'var(--c-text)', fontWeight: 700 }}>
                                    合計 {items.length}台・{kaimenTotalKg.toLocaleString()}kg{' '}
                                    <span style={{ color: 'var(--c-text-3)', fontWeight: 400 }}>
                                      {kaimenOpen ? '▲' : '▼'}
                                    </span>
                                  </span>
                                </button>

                                {/* 階層4：車輌（予定） */}
                                {kaimenOpen &&
                                  items.map((s) => (
                                    <div
                                      key={s['積込予定ID']}
                                      onClick={canEdit ? () => onEditSchedule(s) : undefined}
                                      style={{
                                        padding: '10px 16px 10px 40px',
                                        borderTop: '1px solid var(--c-border)',
                                        cursor: canEdit ? 'pointer' : 'default',
                                      }}
                                    >
                                      <div
                                        style={{
                                          display: 'flex',
                                          justifyContent: 'space-between',
                                          alignItems: 'center',
                                        }}
                                      >
                                        <span style={{ fontSize: 15, color: 'var(--c-text)', fontWeight: 600 }}>
                                          {vehicleLabel(masters, s['車輌ID'])}
                                          （{carrierNameByVehicle(masters, s['車輌ID'])}）
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
                                        <div
                                          style={{
                                            fontSize: 13,
                                            color: 'var(--c-accent)',
                                            marginTop: 6,
                                            textAlign: 'right',
                                          }}
                                        >
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
            );
          })}
      </div>
    </div>
  );
}

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
