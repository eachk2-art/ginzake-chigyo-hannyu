import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { getPlanTree } from '../lib/api';
import { formatSlashJP, seasonRangeFromTargets } from '../lib/dateUtils';
import { ErrorMsg, LoadingMsg } from '../components/UI';
import BusyButton from '../components/BusyButton';
import { buildZentai, targetsInRange, tOf } from '../lib/zentai';
import { dateList } from '../lib/haisha';
import { useSticky } from '../lib/sticky';

/**
 * 全体予定（生産者別）（★2026-11-25、太協・管理者）
 * 担当者のExcel「全体予定」と同じ並び：日付 × 生産者（池場・数量t）、右に計・備考、下に計・目標・差。
 * 搬入予定（親）だけから作るので、車輌が決まる前の予定でも出せる。Excelにも出力できる
 */
export default function ZentaiScreen({ nav }) {
  const { auth } = useAuth();
  const { masters } = useMasters();
  const initRange = () => {
    const ids = (masters?.海面業者 || []).map((k) => k['海面業者ID']);
    return seasonRangeFromTargets(masters?.搬入目標 || [], ids);
  };
  const [from, setFrom] = useSticky('zentai.from', () => initRange().from);
  const [to, setTo] = useSticky('zentai.to', () => initRange().to);
  const [tree, setTree] = useState(null);
  const [error, setError] = useState('');
  const [xError, setXError] = useState('');

  const load = useCallback(() => {
    if (!from || !to || from > to) return;
    setTree(null);
    setError('');
    getPlanTree(auth, { dateFrom: from, dateTo: to })
      .then(setTree)
      .catch((e) => setError(e.message));
  }, [auth, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const z = useMemo(() => (tree && masters ? buildZentai(masters, tree, from, to) : null), [tree, masters, from, to]);
  const targets = useMemo(() => targetsInRange(masters, from, to), [masters, from, to]);

  // その日のその生産者の予定を開く（同じ日に2件あれば1件目）
  const planIdOf = (date, kaimenId) => {
    const day = (tree || []).find((d) => d['日付'] === date);
    for (const ik of day?.['池場'] || []) {
      const p = ik['親'].find((x) => x['海面業者ID'] === kaimenId && x['予定状態'] !== '取消');
      if (p) return p['搬入予定ID'];
    }
    return null;
  };

  async function exportExcel() {
    setXError('');
    if (dateList(from, to).length > 92) {
      setXError('期間は3か月までにしてください');
      return;
    }
    try {
      const { downloadZentaiExcel } = await import('../lib/zentaiExcel');
      await downloadZentaiExcel({ masters, tree, from, to, fileName: `全体予定_${from.replace(/-/g, '')}-${to.replace(/-/g, '')}.xlsx` });
    } catch (e) {
      setXError(`Excelの出力に失敗しました：${e.message}`);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', color: 'var(--c-text)', padding: '14px 12px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <h2 style={{ fontSize: 19, fontWeight: 700, margin: '0 8px 0 4px' }}>全体予定（生産者別）</h2>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={dateInputStyle} />
        <span style={{ color: 'var(--c-text-3)' }}>〜</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={dateInputStyle} />
        <BusyButton variant="ghost" onClick={exportExcel} disabled={!z}>
          Excelをダウンロード
        </BusyButton>
      </div>
      <div style={{ fontSize: 13, color: 'var(--c-text-3)', margin: '0 4px 10px' }}>
        搬入予定（納品先）の予定数量です（単位 t）。車輌が決まっていない予定も入ります。取消は出ません。中止は「中止」と出て、計に入りません。
      </div>
      <ErrorMsg message={xError} />
      {error && <ErrorMsg message={`予定の取得に失敗しました：${error}`} onRetry={load} />}
      {!error && !z && <LoadingMsg>読み込んでいます…</LoadingMsg>}

      {z && (
        <div style={{ overflowX: 'auto', border: '1px solid var(--c-border)', borderRadius: 10 }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ ...th, position: 'sticky', left: 0, zIndex: 2 }}>
                  日付
                </th>
                {z.kaimens.map((k) => (
                  <th key={k['海面業者ID']} colSpan={2} style={th}>
                    {k['氏名']}
                  </th>
                ))}
                <th rowSpan={2} style={th}>
                  計
                </th>
                <th rowSpan={2} style={th}>
                  備考
                </th>
              </tr>
              <tr>
                {z.kaimens.map((k) => [
                  <th key={`${k['海面業者ID']}p`} style={th2}>
                    池場
                  </th>,
                  <th key={`${k['海面業者ID']}q`} style={th2}>
                    数量
                  </th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {z.days.map((day) => {
                const sunday = new Date(day.date.replace(/-/g, '/')).getDay() === 0;
                return (
                  <tr key={day.date} style={{ background: sunday ? 'rgba(255, 107, 107, 0.08)' : 'transparent' }}>
                    <td style={{ ...dateTd, color: sunday ? 'var(--c-danger)' : 'var(--c-text)' }}>{formatSlashJP(day.date)}</td>
                    {z.kaimens.map((k) => {
                      const c = day.cells[k['海面業者ID']];
                      const open = c ? () => {
                        const id = planIdOf(day.date, k['海面業者ID']);
                        if (id) nav.openPlan(id);
                      } : undefined;
                      return [
                        <td key={`${k['海面業者ID']}p`} style={{ ...td, cursor: c ? 'pointer' : 'default' }} onClick={open}>
                          {c?.pond || ''}
                        </td>,
                        <td
                          key={`${k['海面業者ID']}q`}
                          style={{ ...td, fontWeight: 700, color: c?.stopped ? '#b39ddb' : 'var(--c-accent)', cursor: c ? 'pointer' : 'default' }}
                          onClick={open}
                        >
                          {c ? (c.stopped ? '中止' : tOf(c.kg)) : ''}
                        </td>,
                      ];
                    })}
                    <td style={{ ...td, fontWeight: 700 }}>{day.totalKg > 0 ? tOf(day.totalKg) : '0'}</td>
                    <td style={{ ...td, textAlign: 'left', color: 'var(--c-text-2)' }}>{day.note}</td>
                  </tr>
                );
              })}
              {[
                ['計', (id) => tOf(z.totals[id] || 0), tOf(z.grand)],
                ['目標', (id) => (targets[id] ? tOf(targets[id]) : ''), tOf(Object.values(targets).reduce((s, x) => s + x, 0)) || ''],
                ['差（計−目標）', (id) => (targets[id] ? tOf((z.totals[id] || 0) - targets[id]) : ''), ''],
              ].map(([label, fn, total]) => (
                <tr key={label} style={{ background: 'var(--c-bg-3)' }}>
                  <td style={{ ...dateTd, background: 'var(--c-bg-3)' }}>{label}</td>
                  {z.kaimens.map((k) => {
                    const v = fn(k['海面業者ID']);
                    return (
                      <td key={k['海面業者ID']} colSpan={2} style={{ ...td, fontWeight: 700, color: label.startsWith('差') && v !== '' && v < 0 ? 'var(--c-warn)' : 'var(--c-text)' }}>
                        {v}
                      </td>
                    );
                  })}
                  <td style={{ ...td, fontWeight: 700 }}>{total}</td>
                  <td style={td} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th = { border: '1px solid var(--c-border-2)', background: 'var(--c-bg-3)', padding: '6px 8px', fontWeight: 700, whiteSpace: 'nowrap' };
const th2 = { ...th, fontSize: 12, padding: '4px 6px' };
const td = { border: '1px solid var(--c-border-2)', padding: '4px 6px', textAlign: 'center', whiteSpace: 'nowrap' };
const dateTd = { ...td, fontWeight: 700, position: 'sticky', left: 0, background: 'var(--c-bg-2)', zIndex: 1 };
const dateInputStyle = {
  padding: '8px 10px',
  fontSize: 14,
  borderRadius: 8,
  border: '1px solid var(--c-border-2)',
  background: 'var(--c-bg-2)',
  color: 'var(--c-text)',
};
