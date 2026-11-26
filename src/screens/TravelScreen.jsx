import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { getTravelTimes } from '../lib/api';
import { today, addDays, toDateStr, formatSlashJP } from '../lib/dateUtils';
import { ErrorMsg, LoadingMsg, EmptyMsg } from '../components/UI';
import { ikebaBaseName, pondNameOnly, deliveryDestName, vehicleLabel, carrierNameByVehicle, tantoushaName, kaimenPersonName } from '../lib/masterLookup';
import { isTaikyo } from '../lib/roles';
import { useSticky, toggleInSet } from '../lib/sticky';
import { stats, hm, hmShort, departBand, breakdown, midpointBreakdown, FEW } from '../lib/travel';
import { ikebaOrderIndex, waypointLabel } from '../lib/planUtils';

/**
 * 運行時間の目安（★2026-11-26 段階1、太協・管理者・運送会社）
 * 便ごとの「出発（池場を出た時刻）→ 浜到着」から、池場→浜のルートごとに所要時間を積み重ね、中央値を目安にする。
 * ・運送会社：ルートごとの目安・ふだんの幅・件数・天候別だけ
 * ・太協・管理者：さらにドライバー別・出発の時間帯別・月別、1回ずつの記録、積込と作業の所要時間
 * ・積み分けの車（1台で2か所へ）は、2か所目の到着が寄り道込みになるので目安に入れない
 */
const PERIODS = [
  { key: '90', label: '直近90日', days: 90 },
  { key: '365', label: '直近1年', days: 365 },
  { key: '730', label: '直近2年', days: 730 },
];

export default function TravelScreen() {
  const { auth } = useAuth();
  const { masters } = useMasters();
  const taikyo = isTaikyo(auth.role);
  const [period, setPeriod] = useSticky('travel.period', '365');
  const [samples, setSamples] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useSticky('travel.open', () => new Set());

  const load = useCallback(() => {
    const days = PERIODS.find((p) => p.key === period)?.days || 365;
    setSamples(null);
    setError('');
    getTravelTimes(auth, toDateStr(addDays(today(), -days)), toDateStr(today()))
      .then(setSamples)
      .catch((e) => setError(e.message));
  }, [auth, period]);

  useEffect(() => {
    load();
  }, [load]);

  const routes = useMemo(() => {
    if (!samples) return [];
    const idx = ikebaOrderIndex(masters);
    const m = new Map();
    samples
      .filter((x) => !x['積み分け'])
      .forEach((x) => {
        const k = `${x['池場ID']}|${x['配送先ID']}`;
        if (!m.has(k)) m.set(k, { key: k, ikeba: x['池場ID'], point: x['配送先ID'], list: [] });
        m.get(k).list.push(x);
      });
    return Array.from(m.values())
      .map((r) => ({ ...r, s: stats(r.list.map((x) => x['所要分'])), list: [...r.list].sort((a, b) => (a['積込日'] < b['積込日'] ? 1 : -1)) }))
      .sort((a, b) => idx(a.ikeba) - idx(b.ikeba) || deliveryDestName(masters, a.point).localeCompare(deliveryDestName(masters, b.point), 'ja'));
  }, [samples, masters]);

  // 太協向け：池場ごとの積込の所要、浜ごとの作業の所要
  const loadByPond = useMemo(() => {
    if (!taikyo || !samples) return [];
    return breakdown(
      samples.filter((x) => x['積込の所要分']).map((x) => ({ ...x, 所要分: x['積込の所要分'] })),
      (x) => pondNameOnly(ikebaBaseName(masters, x['池場ID']))
    );
  }, [samples, masters, taikyo]);
  const workByPoint = useMemo(() => {
    if (!taikyo || !samples) return [];
    return breakdown(
      samples.filter((x) => x['作業の所要分']).map((x) => ({ ...x, 所要分: x['作業の所要分'] })),
      (x) => deliveryDestName(masters, x['配送先ID'])
    );
  }, [samples, masters, taikyo]);

  const splitCount = (samples || []).filter((x) => x['積み分け']).length;
  // ドライバー別は、便の代表の車輌のドライバーで数える
  const driverOf = (vehicleId) => {
    const v = (masters?.車輌 || []).find((x) => x['車輌ID'] === vehicleId);
    return v?.['通常ドライバー担当者ID'] ? tantoushaName(masters, v['通常ドライバー担当者ID']) : vehicleLabel(masters, vehicleId);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', color: 'var(--c-text)', padding: '14px 12px 40px' }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, margin: '0 4px 10px' }}>運行時間の目安</h2>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            style={{
              minHeight: 42,
              padding: '6px 14px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              border: '1px solid var(--c-border-2)',
              background: period === p.key ? 'var(--c-accent)' : 'transparent',
              color: period === p.key ? '#03202e' : 'var(--c-text)',
              cursor: 'pointer',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 13, color: 'var(--c-text-3)', margin: '0 4px 12px', lineHeight: 1.6 }}>
        池場を出てから浜に着くまでの時間です（出発時刻〜浜到着時刻が入っている便から）。何台かで一緒に走った便は、代表の車輌の時刻で1件と数えます。目安は真ん中の値（中央値）、ふだんの幅は真ん中の半分が入る範囲です。
        {FEW}件より少ないものは参考です。
        {taikyo && splitCount > 0 && `積み分けの車（${splitCount}件）は寄り道込みになるので、目安には入れていません。`}
      </div>

      {error && <ErrorMsg message={`読み込みに失敗しました：${error}`} onRetry={load} />}
      {!error && !samples && <LoadingMsg>読み込んでいます…</LoadingMsg>}
      {samples && routes.length === 0 && <EmptyMsg>この期間に、出発と浜到着の時刻が入っている便がありません</EmptyMsg>}

      {routes.map((r) => {
        const isOpen = open.has(r.key);
        const few = r.s.n < FEW;
        return (
          <div key={r.key} style={{ border: '1px solid var(--c-border)', borderRadius: 12, background: 'var(--c-bg-2)', marginBottom: 10, overflow: 'hidden' }}>
            <button
              onClick={() => toggleInSet(setOpen, r.key)}
              style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'transparent', border: 'none', color: 'var(--c-text)', cursor: 'pointer', textAlign: 'left' }}
            >
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  {pondNameOnly(ikebaBaseName(masters, r.ikeba))} → {deliveryDestName(masters, r.point)}
                </div>
                <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginTop: 2 }}>
                  {r.s.n}件{few ? '（参考）' : ''}　ふだんの幅 {hmShort(r.s.q1)}〜{hmShort(r.s.q3)}　最短 {hmShort(r.s.min)}／最長 {hmShort(r.s.max)}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: few ? 'var(--c-text-3)' : 'var(--c-accent)', whiteSpace: 'nowrap' }}>{hm(r.s.median)}</span>
                <span style={{ color: 'var(--c-text-3)' }}>{isOpen ? '▲' : '▼'}</span>
              </div>
            </button>
            {isOpen && (
              <div style={{ padding: '0 14px 12px', borderTop: '1px solid var(--c-border)' }}>
                <Breakdown title="天候別" rows={breakdown(r.list, (x) => x['天候'])} />
                {taikyo && (() => {
                  // ★2026-11-27 中間地点（太協・管理者だけ）
                  const mb = midpointBreakdown(r.list, (id) => waypointLabel(masters, id));
                  return (
                    <>
                      <Breakdown title="中間地点：出発からの時間" rows={mb.fromDepart} />
                      <Breakdown title="中間地点：そこから浜到着までの時間" rows={mb.toArrive} />
                    </>
                  );
                })()}
                {taikyo && (
                  <>
                    <Breakdown title="ドライバー別" rows={breakdown(r.list, (x) => driverOf(x['車輌ID']))} />
                    <Breakdown title="出発の時間帯別" rows={breakdown(r.list, (x) => departBand(x['出発']))} />
                    <Breakdown title="月別" rows={breakdown(r.list, (x) => `${Number(x['積込日'].slice(5, 7))}月`)} />
                  </>
                )}
                <div style={{ fontSize: 14, fontWeight: 700, margin: '12px 0 6px' }}>1回ずつの記録（新しい順）</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        {['日付', '出発', ...(taikyo ? ['中間地点'] : []), '浜到着', '所要', '天候', '台数', ...(taikyo ? ['代表の車輌', '生産者'] : [])].map((h) => (
                          <th key={h} style={th}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {r.list.slice(0, 30).map((x, i) => (
                        <tr key={i}>
                          <td style={td}>{formatSlashJP(x['積込日'])}</td>
                          <td style={td}>{x['出発']}</td>
                          {taikyo && (
                            <td style={{ ...td, textAlign: 'left', fontSize: 12 }}>
                              {(x['中間地点'] || [])
                                .filter((m) => m['時刻'])
                                .map((m) => `${waypointLabel(masters, m['中間地点ID'])} ${m['時刻']}`)
                                .join('　')}
                            </td>
                          )}
                          <td style={td}>{x['浜到着']}</td>
                          <td style={{ ...td, fontWeight: 700 }}>{hmShort(x['所要分'])}</td>
                          <td style={td}>{x['天候']}</td>
                          <td style={td}>{x['台数'] ? `${x['台数']}台` : ''}</td>
                          {taikyo && (
                            <>
                              <td style={td}>
                                {vehicleLabel(masters, x['車輌ID'])}（{carrierNameByVehicle(masters, x['車輌ID'])}）
                                {(x['車輌一覧'] || []).length > 1 && <span style={{ color: 'var(--c-text-3)' }}>　ほか{x['車輌一覧'].length - 1}台</span>}
                              </td>
                              <td style={td}>{kaimenPersonName(masters, x['海面業者ID'])}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {r.list.length > 30 && <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 4 }}>ほか {r.list.length - 30}件</div>}
              </div>
            )}
          </div>
        );
      })}

      {taikyo && (loadByPond.length > 0 || workByPoint.length > 0) && (
        <div style={{ border: '1px solid var(--c-border)', borderRadius: 12, background: 'var(--c-bg-2)', padding: '4px 14px 12px', marginTop: 16 }}>
          <Breakdown title="積込の所要時間（池場ごと。積込開始〜終了）" rows={loadByPond} />
          <Breakdown title="作業の所要時間（浜ごと。作業開始〜終了）" rows={workByPoint} />
        </div>
      )}
    </div>
  );
}

function Breakdown({ title, rows }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{title}</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['', '目安', 'ふだんの幅', '件数'].map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.label} style={{ color: x.s.n < FEW ? 'var(--c-text-3)' : 'var(--c-text)' }}>
                <td style={{ ...td, textAlign: 'left' }}>{x.label}</td>
                <td style={{ ...td, fontWeight: 700 }}>{hm(x.s.median)}</td>
                <td style={td}>
                  {hmShort(x.s.q1)}〜{hmShort(x.s.q3)}
                </td>
                <td style={td}>
                  {x.s.n}件{x.s.n < FEW ? '（参考）' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th = { border: '1px solid var(--c-border-2)', background: 'var(--c-bg-3)', padding: '5px 8px', fontWeight: 700, whiteSpace: 'nowrap' };
const td = { border: '1px solid var(--c-border-2)', padding: '4px 8px', textAlign: 'center', whiteSpace: 'nowrap' };
