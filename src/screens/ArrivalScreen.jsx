import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { getArrivalTimes, getArrivalStudies } from '../lib/api';
import { today, addDays, toDateStr, formatSlashJP } from '../lib/dateUtils';
import { ErrorMsg, LoadingMsg, EmptyMsg } from '../components/UI';
import TimeField from '../components/TimeField';
import { ikebaBaseName, pondNameOnly, deliveryDestName, kaimenPersonName } from '../lib/masterLookup';
import { useSticky, toggleInSet } from '../lib/sticky';
import { hm, FEW } from '../lib/travel';
import { SNOW_KINDS } from '../lib/loadingTimes';
import { ikebaOrderIndex } from '../lib/planUtils';
import { enrich, lateCounts, LATE_BUCKETS, routeTable, startsByIkeba, clock, lateText, orderLabel } from '../lib/arrival';
import { computeCorrections, CORR_MIN } from '../lib/arrivalPlan';

/**
 * 到着の振り返り（★2026-11-27、太協・管理者。はじめは「到着の見込み」という名前だった）
 * 実績は納品完了（完了確認済み）の便だけ。
 * 海面業者は人を頼んで、到着予定の1時間ほど前から待っている。いちばん困るのは「当日になって到着が大きく遅れる」こと。
 *   ・到着予定と実際：連絡した到着予定（前日までに決めていた時刻）と実際の浜到着の差を、天候・除雪で分けて数える
 *   ・当日に到着予定を遅らせた便、30分以上遅れた便の一覧
 *   ・到着の目安：その日その池場の1車目の積込開始から浜到着まで（ルート×便の順番）。1車目の開始時刻を入れると見込みを出す
 */
const PERIODS = [
  { key: '90', label: '直近90日', days: 90 },
  { key: '365', label: '直近1年', days: 365 },
  { key: '730', label: '直近2年', days: 730 },
];

const pad = (t) => {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
};
const minOf = (t) => {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export default function ArrivalScreen() {
  const { auth } = useAuth();
  const { masters } = useMasters();
  const [period, setPeriod] = useSticky('arrival.period', '365');
  const [rows, setRows] = useState(null);
  const [studies, setStudies] = useState([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useSticky('arrival.open', () => new Set());
  const [routeKey, setRouteKey] = useSticky('arrival.route', '');
  const [startTime, setStartTime] = useState('');

  const load = useCallback(() => {
    const days = PERIODS.find((p) => p.key === period)?.days || 365;
    setRows(null);
    setError('');
    const from = toDateStr(addDays(today(), -days));
    const to = toDateStr(today());
    Promise.all([getArrivalTimes(auth, from, to), getArrivalStudies(auth, from, to)])
      .then(([a, s]) => {
        setStudies(s || []);
        setRows(a);
      })
      .catch((e) => setError(e.message));
  }, [auth, period]);

  useEffect(() => {
    load();
  }, [load]);

  const list = useMemo(() => enrich(rows || []).sort((a, b) => (a['積込日'] < b['積込日'] ? 1 : a['積込日'] > b['積込日'] ? -1 : 0)), [rows]);
  const routes = useMemo(() => {
    const idx = ikebaOrderIndex(masters);
    return routeTable(list).sort(
      (a, b) => idx(a.ikeba) - idx(b.ikeba) || deliveryDestName(masters, a.point).localeCompare(deliveryDestName(masters, b.point), 'ja')
    );
  }, [list, masters]);
  const starts = useMemo(() => startsByIkeba(list), [list]);
  const corr = useMemo(() => computeCorrections(studies, list), [studies, list]);

  const routeName = (ik, pt) => `${pondNameOnly(ikebaBaseName(masters, ik))} → ${deliveryDestName(masters, pt)}`;
  const route = routes.find((r) => r.key === routeKey) || null;
  const st = route ? starts[route.ikeba] : null;
  const startMin = minOf(startTime);

  const kindRows = [{ label: '全体', items: list }, ...SNOW_KINDS.map((k) => ({ label: k, items: list.filter((x) => x.kind === k) }))]
    .map((k) => ({ ...k, c: lateCounts(k.items) }))
    .filter((k) => k.label === '全体' || k.c.n > 0);
  const shifted = list.filter((x) => x.dayShift !== null && x.dayShift > 0);
  const late30 = list.filter((x) => x.late !== null && x.late > 30);
  const noEta = list.filter((x) => !x.announced).length;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', color: 'var(--c-text)', padding: '14px 12px 40px' }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, margin: '0 4px 10px' }}>到着の振り返り</h2>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {PERIODS.map((p) => (
          <button key={p.key} onClick={() => setPeriod(p.key)} style={toggleStyle(period === p.key)}>
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 13, color: 'var(--c-text-3)', margin: '0 4px 12px', lineHeight: 1.6 }}>
        納品完了（完了確認済み）の便だけを、代表の車輌の浜到着時刻で数えます。「連絡した到着予定」は、前日までに入っていた到着予定時刻です
        （当日に作った便は最初に入れた時刻）。{FEW}件より少ないものは参考です。
      </div>

      {error && <ErrorMsg message={`読み込みに失敗しました：${error}`} onRetry={load} />}
      {!error && !rows && <LoadingMsg>読み込んでいます…</LoadingMsg>}
      {rows && list.length === 0 && <EmptyMsg>この期間に、浜到着時刻が入った便がありません</EmptyMsg>}

      {rows && list.length > 0 && (
        <>
          {/* ---- 到着の目安（1車目の積込開始から） ---- */}
          <Card title="到着の目安（1車目の積込開始から）">
            <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginBottom: 8, lineHeight: 1.6 }}>
              その日その池場の1車目の積込開始から、浜に着くまでの時間です。2便目・3便目は、前の便の積込を待つ分も含みます。
            </div>
            <select value={routeKey} onChange={(e) => setRouteKey(e.target.value)} style={selectStyle}>
              <option value="">ルートを選ぶ（池場 → 浜）</option>
              {routes.map((r) => (
                <option key={r.key} value={r.key}>
                  {routeName(r.ikeba, r.point)}
                </option>
              ))}
            </select>
            {route && (
              <>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', margin: '10px 0 6px' }}>
                  <div style={{ width: 150 }}>
                    <TimeField label="1車目の積込開始" value={startTime} onChange={setStartTime} />
                  </div>
                  {st?.all && (
                    <button onClick={() => setStartTime(pad(clock(st.all.median)))} style={toggleStyle(false)}>
                      ふだん {clock(st.all.median)}
                    </button>
                  )}
                  {st?.除雪あり && (
                    <button onClick={() => setStartTime(pad(clock(st.除雪あり.median)))} style={toggleStyle(false)}>
                      除雪の日 {clock(st.除雪あり.median)}
                    </button>
                  )}
                </div>
                {route.rows.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--c-text-3)' }}>1車目の積込開始と浜到着の両方が入った便がありません</div>
                ) : (
                  <Table
                    head={[
                      '便の順番',
                      '目安（中央値）',
                      '遅め',
                      '最長',
                      '件数',
                      ...(startMin !== null ? ['到着の見込み', '遅めの見込み', '連絡の目安（＋15〜30分）'] : []),
                    ]}
                    rows={route.rows.map((r) => ({
                      dim: r.s.n < FEW,
                      cells: [
                        r.order,
                        hm(r.s.median),
                        hm(r.s.q3),
                        hm(r.s.max),
                        `${r.s.n}件${r.s.n < FEW ? '（参考）' : ''}`,
                        ...(startMin !== null
                          ? [`${clock(startMin + r.s.median)}ごろ`, clock(startMin + r.s.q3), `${clock(startMin + r.s.median + 15)}〜${clock(startMin + r.s.median + 30)}`]
                          : []),
                      ],
                    }))}
                  />
                )}
                <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 4, lineHeight: 1.6 }}>
                  遅め＝4回に1回はこれより遅くなる時間です。1車目の開始時刻の目安は「積込時間」の画面でも池場ごとに見られます。
                </div>
              </>
            )}

            <div style={{ ...subTitle, marginTop: 14 }}>全ルートの目安（1車目の積込開始 → 浜到着、中央値）</div>
            <Table
              head={['ルート', '1便目', '2便目', '3便目以降']}
              rows={routes.map((r) => ({
                cells: [
                  routeName(r.ikeba, r.point),
                  ...['1便目', '2便目', '3便目以降'].map((o) => {
                    const x = r.rows.find((y) => y.order === o);
                    return x ? `${hm(x.s.median)}（${x.s.n}）` : '';
                  }),
                ],
              }))}
              firstLeft
            />
          </Card>

          {/* ---- 到着予定と実際 ---- */}
          <Card title="連絡した到着予定と、実際の浜到着">
            <Table
              head={['区分', '便数', ...LATE_BUCKETS.map((b) => b.label)]}
              rows={kindRows.map((k) => ({
                cells: [
                  k.label,
                  k.c.n,
                  ...LATE_BUCKETS.map((b) => {
                    const c = k.c.counts[b.key];
                    return c ? `${c}（${Math.round((c * 100) / k.c.n)}%）` : '—';
                  }),
                ],
                warn: true,
              }))}
              warnCols={[5, 6]}
            />
            {noEta > 0 && <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 4 }}>到着予定時刻が入っていない便 {noEta}件は数えていません。</div>}
          </Card>

          {/* ---- 検討の見込みと実績（補正） ---- */}
          <Card title="到着時刻の検討の見込みと実績">
            <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginBottom: 8, lineHeight: 1.6 }}>
              保存した「到着時刻の検討」の見込みと実績を、1車目の積込開始から着くまでの時間で比べます（除雪などで開始が遅れた分は差に入りません）。
              検討のときと車輌・数量・便の順番が同じ便だけを使います。{CORR_MIN}件以上になったルートは、次の検討でこの差を足して計算します。
            </div>
            {corr.byRoute.size === 0 ? (
              <div style={{ fontSize: 14, color: 'var(--c-text-3)' }}>比べられた便はまだありません</div>
            ) : (
              <Table
                head={['ルート', '比べた便', '差（中央値）', '次の検討']}
                rows={routes
                  .map((r) => ({ r, c: corr.byRoute.get(r.key) }))
                  .concat(
                    Array.from(corr.byRoute.keys())
                      .filter((k) => !routes.find((r) => r.key === k))
                      .map((k) => ({ r: { key: k, ikeba: k.split('|')[0], point: k.split('|')[1] }, c: corr.byRoute.get(k) }))
                  )
                  .filter((x) => x.c)
                  .map(({ r, c }) => ({
                    dim: c.n < CORR_MIN,
                    cells: [
                      routeName(r.ikeba, r.point),
                      `${c.n}件`,
                      c.median === 0 ? '差なし' : c.median > 0 ? `見込みより${hm(c.median)}遅い` : `見込みより${hm(-c.median)}早い`,
                      c.n >= CORR_MIN ? `${c.median >= 0 ? '＋' : '−'}${hm(Math.abs(c.median)) || '0分'} 補正する` : `あと${CORR_MIN - c.n}件で補正`,
                    ],
                  }))}
                firstLeft
              />
            )}
          </Card>
          <ListCard
            id="studyItems"
            open={open.has('studyItems')}
            onToggle={() => toggleInSet(setOpen, 'studyItems')}
            title={`検討と実績の比べ方（1便ずつ）　${corr.items.length}件`}
            note="補正に使わなかった便は、その理由を出します。"
            list={[]}
            masters={masters}
            routeName={routeName}
            custom={
              <Table
                head={['日付', 'ルート', '便', '見込み', '実績', '差', '補正に']}
                rows={[...corr.items]
                  .sort((a, b) => (a.積込日 < b.積込日 ? 1 : -1))
                  .map((x) => ({
                    dim: !x.使う,
                    cells: [
                      formatSlashJP(x.積込日),
                      routeName(x.池場ID, x.配送先ID),
                      orderLabel(x.順番),
                      x.見込み分 != null ? hm(x.見込み分) : '—',
                      x.実績分 != null ? hm(x.実績分) : '—',
                      x.差 == null ? '—' : x.差 === 0 ? '差なし' : x.差 > 0 ? `実績が${hm(x.差)}遅い` : `実績が${hm(-x.差)}早い`,
                      x.使う ? '使う' : `使わない（${x.理由}）`,
                    ],
                  }))}
              />
            }
          />

          <ListCard
            id="shifted"
            open={open.has('shifted')}
            onToggle={() => toggleInSet(setOpen, 'shifted')}
            title={`当日になって到着予定を遅らせた便　${shifted.length}件`}
            note="変更履歴から、積込日の当日に到着予定時刻を後ろへ動かした便です。"
            list={shifted}
            masters={masters}
            routeName={routeName}
            showShift
          />
          <ListCard
            id="late30"
            open={open.has('late30')}
            onToggle={() => toggleInSet(setOpen, 'late30')}
            title={`連絡した到着予定より30分以上遅れた便　${late30.length}件`}
            list={late30}
            masters={masters}
            routeName={routeName}
          />
        </>
      )}
    </div>
  );
}

function ListCard({ open, onToggle, title, note, list, masters, routeName, showShift, custom }) {
  return (
    <div style={{ border: '1px solid var(--c-border)', borderRadius: 12, background: 'var(--c-bg-2)', marginBottom: 12, overflow: 'hidden' }}>
      <button onClick={onToggle} style={headBtn}>
        <span style={{ fontSize: 16, fontWeight: 700 }}>{title}</span>
        <span style={{ color: 'var(--c-text-3)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 14px 12px', borderTop: '1px solid var(--c-border)' }}>
          {note && <div style={{ fontSize: 13, color: 'var(--c-text-3)', margin: '8px 0' }}>{note}</div>}
          {custom ? (
            <div style={{ marginTop: 8 }}>{custom}</div>
          ) : list.length === 0 ? (
            <div style={{ fontSize: 14, color: 'var(--c-text-3)', marginTop: 8 }}>ありません</div>
          ) : (
            <div style={{ marginTop: 8 }}>
              <Table
                head={['日付', 'ルート', '生産者', '便', '連絡した予定', ...(showShift ? ['当日の変更'] : []), '浜到着', '差', '1車目の開始', '天候']}
                rows={list.map((x) => ({
                  cells: [
                    formatSlashJP(x['積込日']),
                    routeName(x['池場ID'], x['配送先ID']),
                    kaimenPersonName(masters, x['海面業者ID']),
                    orderLabel(x['便の順番']),
                    x.announced || '—',
                    ...(showShift ? [(x['当日の変更'] || []).map((c) => `${c['時刻']}に→${c['到着予定'] || '空欄'}`).join('、') + `（${lateText(x.dayShift)}）`] : []),
                    x['浜到着'],
                    lateText(x.late),
                    x['1車目の積込開始'] || '—',
                    [x['天候'], x['除雪'] ? '除雪あり' : ''].filter(Boolean).join('・'),
                  ],
                }))}
                firstLeft={false}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={{ border: '1px solid var(--c-border)', borderRadius: 12, background: 'var(--c-bg-2)', marginBottom: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function Table({ head, rows, firstLeft, warnCols }) {
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
                <td
                  key={j}
                  style={{
                    ...td,
                    textAlign: firstLeft && j === 0 ? 'left' : 'center',
                    fontWeight: j === 1 && String(head[1]).startsWith('目安') ? 700 : 400,
                    color: warnCols && warnCols.includes(j) && c !== '—' ? 'var(--c-danger, #ff8a80)' : undefined,
                  }}
                >
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
const selectStyle = { minHeight: 44, fontSize: 15, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--c-border-2)', background: 'var(--c-bg)', color: 'var(--c-text)', maxWidth: '100%' };
const headBtn = { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'transparent', border: 'none', color: 'var(--c-text)', cursor: 'pointer', textAlign: 'left' };
const subTitle = { fontSize: 14, fontWeight: 700, margin: '12px 0 6px' };
const th = { border: '1px solid var(--c-border-2)', background: 'var(--c-bg-3)', padding: '5px 8px', fontWeight: 700, whiteSpace: 'nowrap' };
const td = { border: '1px solid var(--c-border-2)', padding: '4px 8px', whiteSpace: 'nowrap' };
