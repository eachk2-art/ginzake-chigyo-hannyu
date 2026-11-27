import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { getLoadingTimes } from '../lib/api';
import { today, addDays, toDateStr, formatSlashJP } from '../lib/dateUtils';
import { ErrorMsg, LoadingMsg, EmptyMsg } from '../components/UI';
import { ikebaBaseName, pondNameOnly, vehicleLabel, carrierNameByVehicle } from '../lib/masterLookup';
import { useSticky, toggleInSet } from '../lib/sticky';
import { hm, hmShort, FEW } from '../lib/travel';
import { buildLoading } from '../lib/loadingTimes';
import { ikebaOrderIndex, kgText } from '../lib/planUtils';

/**
 * 積込時間の傾向（★2026-11-27、太協・管理者）
 * 今の記録（車ごとの積込開始・終了と数量）から、池場ごとに
 *   ・数量（250kg単位）ごとの積込時間：中央値・最短・最長・回数
 *   ・車の入替（前の車の積込終了 → 次の車の積込開始）
 *   ・日ごとの流れ：何台・何便・合計何t、最初の積込開始〜最後の積込終了
 * を出す。網寄せ・池替えは記録していないので、その分も含んだ時間になる（配車を考えるときの参考）
 */
const PERIODS = [
  { key: '90', label: '直近90日', days: 90 },
  { key: '365', label: '直近1年', days: 365 },
  { key: '730', label: '直近2年', days: 730 },
];

export default function LoadingTimesScreen() {
  const { auth } = useAuth();
  const { masters } = useMasters();
  const [period, setPeriod] = useSticky('loading.period', '365');
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState('');
  const [openIkeba, setOpenIkeba] = useSticky('loading.openIkeba', () => new Set());
  const [openDays, setOpenDays] = useSticky('loading.openDays', () => new Set());

  const load = useCallback(() => {
    const days = PERIODS.find((p) => p.key === period)?.days || 365;
    setRuns(null);
    setError('');
    getLoadingTimes(auth, toDateStr(addDays(today(), -days)), toDateStr(today()))
      .then(setRuns)
      .catch((e) => setError(e.message));
  }, [auth, period]);

  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(() => {
    if (!runs) return [];
    const idx = ikebaOrderIndex(masters);
    return buildLoading(runs).sort((a, b) => idx(a.ikebaId) - idx(b.ikebaId));
  }, [runs, masters]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', color: 'var(--c-text)', padding: '14px 12px 40px' }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, margin: '0 4px 10px' }}>積込時間の傾向</h2>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {PERIODS.map((p) => (
          <button key={p.key} onClick={() => setPeriod(p.key)} style={toggleStyle(period === p.key)}>
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 13, color: 'var(--c-text-3)', margin: '0 4px 12px', lineHeight: 1.6 }}>
        車ごとの積込開始〜積込終了から出した、配車を考えるときの参考です。数量は予定数量を250kg単位にまとめています。
        網寄せ・池替えの時間も含んだ時間です。車の入替は、前の車の積込終了から次の車の積込開始まで（90分を超える間は数えません）。
        {FEW}回より少ないものは参考です。
      </div>

      {error && <ErrorMsg message={`読み込みに失敗しました：${error}`} onRetry={load} />}
      {!error && !runs && <LoadingMsg>読み込んでいます…</LoadingMsg>}
      {runs && groups.length === 0 && <EmptyMsg>この期間の積込の記録がありません</EmptyMsg>}

      {groups.map((g) => {
        const open = openIkeba.has(g.ikebaId);
        return (
          <div key={g.ikebaId} style={{ border: '1px solid var(--c-border)', borderRadius: 12, background: 'var(--c-bg-2)', marginBottom: 12, overflow: 'hidden' }}>
            <button onClick={() => toggleInSet(setOpenIkeba, g.ikebaId)} style={headBtn}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{pondNameOnly(ikebaBaseName(masters, g.ikebaId))}</div>
                <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginTop: 2 }}>
                  {g.days.length}日・{g.runs.length}便
                  {g.perTon && `　1tあたり 約${hm(g.perTon.median)}`}
                  {g.change && `　車の入替 約${hm(g.change.median)}`}
                </div>
              </div>
              <span style={{ color: 'var(--c-text-3)' }}>{open ? '▲' : '▼'}</span>
            </button>

            {open && (
              <div style={{ padding: '0 14px 12px', borderTop: '1px solid var(--c-border)' }}>
                <div style={subTitle}>数量ごとの積込時間（1台分）</div>
                {g.bands.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--c-text-3)' }}>積込開始・終了の両方が入った便がありません</div>
                ) : (
                  <Table
                    head={['数量', '目安（中央値）', '最短', '最長', 'ふだんの幅', '回数']}
                    rows={g.bands.map((b) => ({
                      dim: b.s.n < FEW,
                      cells: [`${b.kg.toLocaleString()}kg`, hm(b.s.median), hm(b.s.min), hm(b.s.max), `${hmShort(b.s.q1)}〜${hmShort(b.s.q3)}`, `${b.s.n}回${b.s.n < FEW ? '（参考）' : ''}`],
                    }))}
                  />
                )}
                {g.change && (
                  <>
                    <div style={subTitle}>車の入替（前の車の積込終了 → 次の車の積込開始）</div>
                    <Table
                      head={['目安（中央値）', '最短', '最長', 'ふだんの幅', '回数']}
                      rows={[{ dim: g.change.n < FEW, cells: [hm(g.change.median), hm(g.change.min), hm(g.change.max), `${hmShort(g.change.q1)}〜${hmShort(g.change.q3)}`, `${g.change.n}回`] }]}
                    />
                  </>
                )}

                <div style={subTitle}>日ごとの流れ（新しい順）</div>
                {g.days.map((d) => {
                  const k = `${g.ikebaId}|${d.date}`;
                  const dOpen = openDays.has(k);
                  return (
                    <div key={k} style={{ border: '1px solid var(--c-border-2)', borderRadius: 10, marginBottom: 8, background: 'var(--c-bg)' }}>
                      <button onClick={() => toggleInSet(setOpenDays, k)} style={{ ...headBtn, padding: '10px 12px' }}>
                        <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                          <b>{formatSlashJP(d.date)}</b>　{d.vehicles}台・{d.runs}便・予定 {kgText(d.plannedKg / 1000)}t（計量 {kgText(d.weighedKg / 1000)}t）
                          <br />
                          <span style={{ color: 'var(--c-text-2)' }}>
                            {d.first && d.last ? `${d.first}〜${d.last}（${hm(d.span)}）` : '時刻の入力なし'}
                            {d.changeMedian !== null && `　入替 約${hm(d.changeMedian)}`}
                            {d.weather && `　${d.weather}`}
                            {d.waterTemp !== '' && `　池 ${d.waterTemp}℃`}
                          </span>
                        </div>
                        <span style={{ color: 'var(--c-text-3)' }}>{dOpen ? '▲' : '▼'}</span>
                      </button>
                      {dOpen && (
                        <div style={{ padding: '0 10px 10px' }}>
                          <Table
                            head={['順', '車輌', '積込開始', '積込終了', '所要', '予定', '計量', '回数', '前の車との入替']}
                            rows={d.rows.map((r, i) => ({
                              cells: [
                                i + 1,
                                `${vehicleLabel(masters, r['車輌ID'])}（${carrierNameByVehicle(masters, r['車輌ID'])}）${r['回目'] > 1 ? `${r['回目']}回目` : ''}${(r['池場ID'] || []).length > 1 ? '＊複数の池場' : ''}`,
                                r['積込開始'] || '—',
                                r['積込終了'] || '—',
                                r['積込の所要分'] ? hm(r['積込の所要分']) : '',
                                `${kgText(r['予定数量kg'])}kg`,
                                r['計量合計kg'] ? `${kgText(r['計量合計kg'])}kg` : '',
                                r['計量の回数'] || '',
                                r.入替分 !== null && r.入替分 !== undefined ? hm(r.入替分) : '',
                              ],
                            }))}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Table({ head, rows }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 4 }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} style={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ color: r.dim ? 'var(--c-text-3)' : 'var(--c-text)' }}>
              {r.cells.map((c, j) => (
                <td key={j} style={{ ...td, fontWeight: j === 1 && head[1].startsWith('目安') ? 700 : 400 }}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const toggleStyle = (on) => ({
  minHeight: 42,
  padding: '6px 14px',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  border: '1px solid var(--c-border-2)',
  background: on ? 'var(--c-accent)' : 'transparent',
  color: on ? '#03202e' : 'var(--c-text)',
  cursor: 'pointer',
});
const headBtn = { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'transparent', border: 'none', color: 'var(--c-text)', cursor: 'pointer', textAlign: 'left' };
const subTitle = { fontSize: 14, fontWeight: 700, margin: '12px 0 6px' };
const th = { border: '1px solid var(--c-border-2)', background: 'var(--c-bg-3)', padding: '5px 8px', fontWeight: 700, whiteSpace: 'nowrap' };
const td = { border: '1px solid var(--c-border-2)', padding: '4px 8px', textAlign: 'center', whiteSpace: 'nowrap' };
