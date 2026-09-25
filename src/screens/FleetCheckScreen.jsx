import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { getSchedules } from '../lib/api';
import { isTaikyo } from '../lib/roles';
import { today, addDays, toDateStr, formatJP, printWithTitle, fileDateStamp } from '../lib/dateUtils';
import { ikebaBaseName, kaimenPersonName, vehicleLabel, carrierNameByVehicle } from '../lib/masterLookup';
import { ErrorMsg, LoadingMsg, EmptyMsg } from '../components/UI';

// 積載率がこの値を下回ると「余裕あり」として知らせる（0.7＝70%）
const LOW_LOAD_RATIO = 0.7;
// 同じ車輌の便で、到着予定時刻がこの時間以上離れていたら「2回運行では？」と知らせる
const LONG_GAP_HOURS = 3;

/** "HH:mm" を分に直す。空や形式違いは null */
function timeToMinutes(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || ''));
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export default function FleetCheckScreen({ onEditSchedule }) {
  const { auth } = useAuth();
  const { masters } = useMasters();
  const [date, setDate] = useState(() => toDateStr(today()));
  const [schedules, setSchedules] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setSchedules(null);
    setError('');
    getSchedules(auth, { dateFrom: date, dateTo: date })
      .then(setSchedules)
      .catch((e) => setError(e.message));
  }, [auth, date]);

  useEffect(() => {
    load();
  }, [load]);

  // 車輌ごとにまとめ、積載量・重複を判定する
  const vehicles = useMemo(() => {
    if (!schedules) return [];
    const active = schedules.filter((s) => s['ステータス'] !== '取消' && s['ステータス'] !== '中止');
    const map = new Map();
    active.forEach((s) => {
      const id = s['車輌ID'] || '';
      if (!map.has(id)) map.set(id, { vehicleId: id, rows: [] });
      map.get(id).rows.push(s);
    });

    return Array.from(map.values())
      .map((v) => {
        const master = (masters?.車輌 || []).find((x) => x['車輌ID'] === v.vehicleId);
        const maxLoad = Number(master?.['最大積載数量kg']) || 0;
        const rows = v.rows
          .slice()
          .sort((a, b) => Number(a['積込順'] || 0) - Number(b['積込順'] || 0));
        const totalKg = rows.reduce((sum, s) => sum + (Number(s['予定数量kg']) || 0), 0);
        const ikebaIds = Array.from(new Set(rows.map((s) => s['池場ID'])));

        const warnings = [];
        if (!v.vehicleId) warnings.push({ level: 'error', text: '車輌が設定されていない予定があります' });
        if (maxLoad === 0 && v.vehicleId) warnings.push({ level: 'warn', text: '車輌マスタに最大積載数量が登録されていません' });
        if (maxLoad > 0 && totalKg > maxLoad) {
          warnings.push({
            level: 'error',
            text: `積載量オーバー（${totalKg.toLocaleString()}kg ／ 上限 ${maxLoad.toLocaleString()}kg）`,
          });
        }
        if (maxLoad > 0 && totalKg > 0 && totalKg < maxLoad * LOW_LOAD_RATIO) {
          warnings.push({
            level: 'warn',
            text: `積載に余裕があります（${Math.round((totalKg / maxLoad) * 100)}％）`,
          });
        }
        // ★2026-09-25：1台で複数の納品先に分けたり、複数の池場から積み合わせたりするため、
        // 池場や納品先が違うことは警告にしない。積載量に収まっているかだけで判断する。
        // ただし、到着予定時刻が大きく離れている場合は2回運行の可能性があるので知らせる。
        const times = rows.map((s) => timeToMinutes(s['到着予定時刻'])).filter((t) => t !== null);
        if (rows.length > 1 && times.length > 1) {
          const gap = Math.max(...times) - Math.min(...times);
          if (gap >= LONG_GAP_HOURS * 60) {
            warnings.push({
              level: 'warn',
              text: `到着予定時刻が${Math.floor(gap / 60)}時間以上離れています。2回運行になっていませんか`,
            });
          }
        }

        const splitLoad = rows.length > 1;
        return { ...v, rows, master, maxLoad, totalKg, warnings, splitLoad, ikebaIds };
      })
      .sort((a, b) => String(a.vehicleId).localeCompare(String(b.vehicleId)));
  }, [schedules, masters]);

  const totals = useMemo(() => {
    const trips = vehicles.reduce((sum, v) => sum + v.rows.length, 0);
    const kg = vehicles.reduce((sum, v) => sum + v.totalKg, 0);
    const errors = vehicles.reduce((sum, v) => sum + v.warnings.filter((w) => w.level === 'error').length, 0);
    const warns = vehicles.reduce((sum, v) => sum + v.warnings.filter((w) => w.level === 'warn').length, 0);
    return { trips, kg, errors, warns, cars: vehicles.length };
  }, [vehicles]);

  const cancelled = useMemo(
    () => (schedules || []).filter((s) => s['ステータス'] === '取消' || s['ステータス'] === '中止'),
    [schedules]
  );

  if (!isTaikyo(auth.role)) return null;

  return (
    <div style={{ padding: '18px 16px 60px', maxWidth: 900, margin: '0 auto' }}>
      <div className="no-print">
        <h2 style={{ fontSize: 20, margin: '4px 0 2px' }}>配車チェック</h2>
        <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginBottom: 12 }}>
          その日に予定が入っている車輌を並べ、積載量・重複配車を確認します
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
          <button type="button" onClick={() => setDate(toDateStr(addDays(new Date(date.replace(/-/g, '/')), -1)))} style={navBtn}>
            ← 前日
          </button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} aria-label="日付" />
          <button type="button" onClick={() => setDate(toDateStr(addDays(new Date(date.replace(/-/g, '/')), 1)))} style={navBtn}>
            翌日 →
          </button>
          <button type="button" onClick={() => setDate(toDateStr(today()))} style={navBtn}>
            今日
          </button>
          <button
            type="button"
            onClick={() => printWithTitle(`${fileDateStamp(date)}_配車チェック`)}
            style={navBtn}
          >
            印刷・PDF
          </button>
        </div>
      </div>

      <ErrorMsg message={error} />
      {!error && schedules === null && <LoadingMsg>読み込んでいます…</LoadingMsg>}

      {schedules && (
        <div className="print-area">
          <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 10 }}>
            配車チェック　{formatJP(date)}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <Card label="車輌" value={`${totals.cars}台`} />
            <Card label="便数" value={`${totals.trips}便`} />
            <Card label="予定数量" value={`${totals.kg.toLocaleString()}kg`} />
            <Card label="要確認" value={`${totals.errors}件`} tone={totals.errors > 0 ? 'error' : 'ok'} />
            <Card label="注意" value={`${totals.warns}件`} tone={totals.warns > 0 ? 'warn' : 'ok'} />
          </div>

          {vehicles.length === 0 && <EmptyMsg>この日の予定はありません</EmptyMsg>}

          {vehicles.map((v) => {
            const hasError = v.warnings.some((w) => w.level === 'error');
            const hasWarn = !hasError && v.warnings.length > 0;
            const ratio = v.maxLoad > 0 ? Math.min(v.totalKg / v.maxLoad, 1.3) : 0;
            return (
              <div
                key={v.vehicleId || 'none'}
                style={{
                  background: 'var(--c-bg-2)',
                  border: `1px solid ${hasError ? 'var(--c-danger)' : hasWarn ? 'var(--c-warn)' : 'var(--c-border)'}`,
                  borderRadius: 12,
                  padding: '12px 14px',
                  marginBottom: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 700 }}>
                      {v.vehicleId ? vehicleLabel(masters, v.vehicleId) : '車輌未設定'}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginTop: 2 }}>
                      {v.vehicleId ? carrierNameByVehicle(masters, v.vehicleId) : ''}
                      {v.master?.['通常ドライバー担当者ID'] ? `　${driverName(masters, v.master['通常ドライバー担当者ID'])}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 17, fontWeight: 700 }}>
                      {v.totalKg.toLocaleString()}
                      {v.maxLoad > 0 && (
                        <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--c-text-3)' }}>
                          {' '}
                          / {v.maxLoad.toLocaleString()}kg
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--c-text-3)' }}>
                      {v.rows.length}便{v.splitLoad ? '（積み分け）' : ''}
                    </div>
                  </div>
                </div>

                {v.maxLoad > 0 && (
                  <div style={{ height: 8, borderRadius: 4, background: 'var(--c-bg-3)', margin: '10px 0', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min(ratio * 100, 100)}%`,
                        height: '100%',
                        background: v.totalKg > v.maxLoad ? 'var(--c-danger)' : hasWarn ? 'var(--c-warn)' : 'var(--c-ok)',
                      }}
                    />
                  </div>
                )}

                {v.warnings.map((w, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: w.level === 'error' ? 'var(--c-danger)' : 'var(--c-warn)',
                      marginTop: 4,
                    }}
                  >
                    {w.level === 'error' ? '⚠ ' : '・'}
                    {w.text}
                  </div>
                ))}

                <div style={{ marginTop: 8 }}>
                  {v.rows.map((s) => (
                    <button
                      key={s['積込予定ID']}
                      type="button"
                      onClick={onEditSchedule ? () => onEditSchedule(s) : undefined}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        background: 'var(--c-warn-bg)',
                        border: '1px solid var(--c-border)',
                        borderRadius: 8,
                        padding: '8px 10px',
                        marginTop: 6,
                        color: 'var(--c-text)',
                        fontSize: 14,
                        cursor: onEditSchedule ? 'pointer' : 'default',
                        minHeight: 42,
                      }}
                    >
                      {ikebaBaseName(masters, s['池場ID'])} → {kaimenPersonName(masters, s['海面業者ID'])}　
                      {(Number(s['予定数量kg']) || 0).toLocaleString()}kg
                      {s['到着予定時刻'] ? `　着 ${s['到着予定時刻']}` : ''}
                      {s['ステータス'] !== '予定' ? `　（${s['ステータス']}）` : ''}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {cancelled.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text-2)', marginBottom: 6 }}>
                取消・中止の予定（{cancelled.length}件）
              </div>
              {cancelled.map((s) => (
                <div key={s['積込予定ID']} style={{ fontSize: 13, color: 'var(--c-text-3)', marginBottom: 4 }}>
                  {vehicleLabel(masters, s['車輌ID'])}　{ikebaBaseName(masters, s['池場ID'])} →{' '}
                  {kaimenPersonName(masters, s['海面業者ID'])}（{s['ステータス']}）
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function driverName(masters, staffId) {
  const s = (masters?.担当者 || []).find((x) => x['担当者ID'] === staffId);
  return s ? s['氏名'] : '';
}

function Card({ label, value, tone }) {
  const color =
    tone === 'error' ? 'var(--c-danger)' : tone === 'warn' ? 'var(--c-warn)' : tone === 'ok' ? 'var(--c-ok)' : 'var(--c-text)';
  return (
    <div
      style={{
        background: 'var(--c-bg-2)',
        border: '1px solid var(--c-border)',
        borderRadius: 10,
        padding: '10px 16px',
        minWidth: 110,
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--c-text-3)' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2, color }}>{value}</div>
    </div>
  );
}

const inputStyle = {
  minHeight: 42,
  padding: '8px 12px',
  fontSize: 15,
  borderRadius: 8,
  border: '1px solid var(--c-border-2)',
  background: 'var(--c-bg-2)',
  color: 'var(--c-text)',
};

const navBtn = {
  minHeight: 42,
  padding: '8px 14px',
  fontSize: 14,
  fontWeight: 600,
  borderRadius: 8,
  border: '1px solid var(--c-border-2)',
  background: 'transparent',
  color: 'var(--c-text)',
  cursor: 'pointer',
};
