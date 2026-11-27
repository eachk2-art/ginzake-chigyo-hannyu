import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { getLoadingTimes, getTravelTimes, getArrivalTimes, getPlanTree, updatePlan } from '../lib/api';
import { today, addDays, toDateStr } from '../lib/dateUtils';
import { ErrorMsg, LoadingMsg } from '../components/UI';
import BusyButton from '../components/BusyButton';
import TimeField from '../components/TimeField';
import { Field, ScreenFrame, inputStyle, smallBtnStyle } from '../components/FormParts';
import { ikebaName, vehicleWithCarrier, deliveryDestName, kaimenPersonName } from '../lib/masterLookup';
import { isAdmin } from '../lib/roles';
import { num, kgText, isInactiveStatus, pointsOfKaimen, ikebaOrderIndex } from '../lib/planUtils';
import { hm } from '../lib/travel';
import { buildLoading } from '../lib/loadingTimes';
import { enrich, routeTable, clock, orderLabel } from '../lib/arrival';
import { makeModel, simulate, ceil5 } from '../lib/arrivalPlan';

/**
 * 到着時刻の検討（★2026-11-27、太協・管理者）
 * 日付・池場を決め、便ごとに行き先（海面業者・浜）・車輌と積込数量を並べ、1車目の積込開始を入れると、
 * 便ごとの積込・出発・浜到着の見込みが出る。今の予定から読み込むこともできる。
 *   ・車は入れた順に積む。車と車の間は、その池場の入替時間
 *   ・1つの便の車は、全部積み終わってから一緒に出発する
 *   ・積込時間・入替・出発までの待ち・移動時間は、記録の中央値（目安）と、4回に1回はこれより遅い時間（遅め）
 *   ・予定から読み込んだ便は、管理者が見込みの時刻を到着予定時刻に入れられる
 */
let seq = 0;
const newKey = () => `k${++seq}`;
const emptyVehicle = () => ({ key: newKey(), vehicleId: '', kg: '' });
const emptyRun = () => ({ key: newKey(), planId: '', kaimenId: '', pointId: '', vehicles: [emptyVehicle()], travelOvr: '', eta: '', etaInput: '' });
const pad = (t) => {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
};

export default function ArrivalPlanScreen({ initialDate, initialIkebaId, onClose }) {
  const { auth } = useAuth();
  const { masters } = useMasters();
  const admin = isAdmin(auth.role);

  const [date, setDate] = useState(initialDate || toDateStr(today()));
  const [ikebaId, setIkebaId] = useState(initialIkebaId || '');
  const [start, setStart] = useState('');
  const [runs, setRuns] = useState([emptyRun()]);
  const [snowDay, setSnowDay] = useState(false);
  const [hist, setHist] = useState(null); // { loading, travel, arrival }
  const [histError, setHistError] = useState('');
  const [readMsg, setReadMsg] = useState('');
  const [readError, setReadError] = useState('');

  // 記録（直近2年）を読む
  const loadHist = useCallback(() => {
    setHist(null);
    setHistError('');
    const from = toDateStr(addDays(today(), -730));
    const to = toDateStr(today());
    Promise.all([getLoadingTimes(auth, from, to), getTravelTimes(auth, from, to), getArrivalTimes(auth, from, to)])
      .then(([l, t, a]) => setHist({ loading: buildLoading(l), travel: t, arrival: enrich(a) }))
      .catch((e) => setHistError(e.message));
  }, [auth]);
  useEffect(() => {
    loadHist();
  }, [loadHist]);

  const loadGroup = hist ? hist.loading.find((g) => g.ikebaId === ikebaId) : null;
  const model = useMemo(() => (hist && ikebaId ? makeModel(loadGroup, hist.travel, ikebaId) : null), [hist, loadGroup, ikebaId]);
  const startKinds = loadGroup?.start?.kinds || [];
  const usual = loadGroup?.start?.all?.median ?? null;
  const snowStart = startKinds.find((k) => k.label === '除雪あり')?.s?.median ?? null;
  const actualRoutes = useMemo(() => (hist ? routeTable(hist.arrival.filter((x) => x['池場ID'] === ikebaId)) : []), [hist, ikebaId]);

  const inputRuns = runs.map((r) => ({ 配送先ID: r.pointId, vehicles: r.vehicles.map((v) => ({ 車輌ID: v.vehicleId, kg: v.kg })), travelOvr: r.travelOvr }));
  const results = model ? simulate(model, inputRuns, start) : [];

  // 予定から読み込む
  const readPlans = useCallback(
    async (d, ik) => {
      setReadMsg('');
      setReadError('');
      if (!d || !ik) return;
      try {
        const tree = await getPlanTree(auth, { dateFrom: d, dateTo: d });
        const day = (tree || []).find((x) => x['日付'] === d);
        const node = day ? day['池場'].find((x) => x['池場ID'] === ik) : null;
        const plans = (node?.['親'] || []).filter((p) => !isInactiveStatus(p['ステータス']));
        if (plans.length === 0) {
          setReadMsg('この日・この池場の予定はありません。下に便を足して検討できます。');
          return;
        }
        setRuns(
          plans.map((p) => {
            const allocs = (p['割当'] || []).filter((a) => !isInactiveStatus(a['ステータス']));
            return {
              key: newKey(),
              planId: p['搬入予定ID'],
              kaimenId: p['海面業者ID'],
              pointId: p['配送先ID'],
              vehicles: allocs.length
                ? allocs.map((a) => ({ key: newKey(), vehicleId: a['車輌ID'] || '', kg: String(num(a['予定数量kg']) || '') }))
                : [{ key: newKey(), vehicleId: '', kg: String(num(p['予定数量kg']) || '') }],
              travelOvr: '',
              eta: p['到着予定時刻'] || '',
              etaInput: '',
            };
          })
        );
        const snow = node?.['池場日誌']?.['除雪'] === '1';
        setSnowDay(snow);
        setReadMsg(`予定から${plans.length}便を読み込みました。${snow ? '池場日誌が「除雪あり」です。' : ''}`);
      } catch (e) {
        setReadError(e.message);
      }
    },
    [auth]
  );
  useEffect(() => {
    if (initialDate && initialIkebaId) readPlans(initialDate, initialIkebaId);
  }, [initialDate, initialIkebaId, readPlans]);

  // 1車目の開始が空なら、記録の目安を入れておく（除雪の日は除雪の目安）
  useEffect(() => {
    if (start || usual === null) return;
    setStart(pad(clock(snowDay && snowStart !== null ? snowStart : usual)));
  }, [usual, snowStart, snowDay, start]);

  const setRun = (i, patch) => setRuns((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const setVehicle = (i, vi, patch) =>
    setRuns((rs) => rs.map((r, j) => (j === i ? { ...r, vehicles: r.vehicles.map((v, k) => (k === vi ? { ...v, ...patch } : v)) } : r)));
  const moveRun = (i, d) =>
    setRuns((rs) => {
      const j = i + d;
      if (j < 0 || j >= rs.length) return rs;
      const c = [...rs];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });

  async function writeEta(i, v) {
    const r = runs[i];
    if (!r?.planId || !v) return;
    await updatePlan(auth, r.planId, { 到着予定時刻: v });
    setRun(i, { eta: v, etaInput: v });
  }

  const ikebaList = [...(masters?.池場 || [])].sort((a, b) => ikebaOrderIndex(masters)(a['池場ID']) - ikebaOrderIndex(masters)(b['池場ID']));
  const vehicles = masters?.車輌 || [];
  const totalKg = runs.reduce((s, r) => s + r.vehicles.reduce((t, v) => t + num(v.kg), 0), 0);
  const totalCars = runs.reduce((s, r) => s + r.vehicles.filter((v) => num(v.kg) > 0).length, 0);

  return (
    <ScreenFrame
      title="到着時刻の検討"
      sub="便ごとに行き先・車輌・積込数量を並べ、1車目の積込開始を入れると、浜到着の見込みが出ます。車は上から順に積み、1つの便の車は全部積み終わってから一緒に出発する、として計算します。"
      onClose={onClose}
    >
      {histError && <ErrorMsg message={`記録の読み込みに失敗しました：${histError}`} onRetry={loadHist} />}
      {!histError && !hist && <LoadingMsg>記録を読み込んでいます…</LoadingMsg>}

      <div style={card}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="日付" style={{ minWidth: 160 }}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="池場（内水面）" style={{ flex: 1, minWidth: 200 }}>
            <select value={ikebaId} onChange={(e) => setIkebaId(e.target.value)} style={inputStyle}>
              <option value="">選んでください</option>
              {ikebaList.map((p) => (
                <option key={p['池場ID']} value={p['池場ID']}>
                  {ikebaName(masters, p['池場ID'])}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          <BusyButton onClick={() => readPlans(date, ikebaId)} disabled={!date || !ikebaId} variant="ghost">
            予定から読み込む
          </BusyButton>
          <button style={smallBtnStyle} onClick={() => setRuns([emptyRun()])}>
            白紙にする
          </button>
        </div>
        {readMsg && <div style={{ fontSize: 13, color: 'var(--c-text-2)', margin: '4px 0' }}>{readMsg}</div>}
        <ErrorMsg message={readError} />

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 8 }}>
          <div style={{ width: 160 }}>
            <TimeField label="1車目の積込開始" value={start} onChange={setStart} />
          </div>
          {usual !== null && (
            <button style={chipStyle} onClick={() => setStart(pad(clock(usual)))}>
              ふだん {clock(usual)}
            </button>
          )}
          {snowStart !== null && (
            <button style={chipStyle} onClick={() => setStart(pad(clock(snowStart)))}>
              除雪の日 {clock(snowStart)}
            </button>
          )}
        </div>
        {ikebaId && hist && (
          <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 6, lineHeight: 1.6 }}>
            この池場の記録：
            {model?.perTon ? `1tあたり 約${hm(model.perTon.median)}` : '積込時間の記録なし（1t 20分で仮に計算）'}
            {model?.change ? `／車の入替 約${hm(model.change.median)}` : '／入替の記録なし（5分で仮に計算）'}
            {model?.wait ? `／積み終わり→出発 約${hm(model.wait.median) || '0分'}` : '／出発までの記録なし（10分で仮に計算）'}
          </div>
        )}
      </div>

      {ikebaId &&
        runs.map((r, i) => {
          const res = results[i];
          const points = r.kaimenId ? pointsOfKaimen(masters, r.kaimenId) : [];
          const order = orderLabel(i + 1);
          const actual = actualRoutes.find((x) => x.ikeba === ikebaId && x.point === r.pointId)?.rows.find((x) => x.order === order);
          const startMin = (() => {
            const m = String(start).match(/^(\d{1,2}):(\d{2})/);
            return m ? Number(m[1]) * 60 + Number(m[2]) : null;
          })();
          const suggest = res?.arrive != null ? pad(clock(ceil5(res.arrive + 15))) : '';
          return (
            <div key={r.key} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ fontSize: 17, fontWeight: 700 }}>
                  {i + 1}便目
                  {r.planId && <span style={{ fontSize: 12, color: 'var(--c-text-3)', marginLeft: 8 }}>予定から読込</span>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={smallBtnStyle} disabled={i === 0} onClick={() => moveRun(i, -1)}>
                    ↑
                  </button>
                  <button style={smallBtnStyle} disabled={i === runs.length - 1} onClick={() => moveRun(i, 1)}>
                    ↓
                  </button>
                  <button style={smallBtnStyle} onClick={() => setRuns((rs) => rs.filter((_, j) => j !== i))}>
                    外す
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Field label="海面業者" style={{ flex: 1, minWidth: 160 }}>
                  <select
                    value={r.kaimenId}
                    onChange={(e) => {
                      const pts = pointsOfKaimen(masters, e.target.value);
                      setRun(i, { kaimenId: e.target.value, pointId: pts.length === 1 ? pts[0]['配送先ID'] : '', planId: '' });
                    }}
                    style={inputStyle}
                  >
                    <option value="">選んでください</option>
                    {(masters?.海面業者 || []).map((k) => (
                      <option key={k['海面業者ID']} value={k['海面業者ID']}>
                        {k['氏名']}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="浜" style={{ flex: 1, minWidth: 160 }}>
                  <select value={r.pointId} onChange={(e) => setRun(i, { pointId: e.target.value, planId: '' })} style={inputStyle}>
                    <option value="">選んでください</option>
                    {points.map((p) => (
                      <option key={p['配送先ID']} value={p['配送先ID']}>
                        {p['配送先名']}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              {r.vehicles.map((v, vi) => {
                const vr = res?.vehicles?.[r.vehicles.slice(0, vi).filter((x) => num(x.kg) > 0).length];
                return (
                  <div key={v.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 6 }}>
                    <Field label={`車輌${vi + 1}`} style={{ flex: 2, minWidth: 170, marginBottom: 0 }}>
                      <select value={v.vehicleId} onChange={(e) => setVehicle(i, vi, { vehicleId: e.target.value })} style={inputStyle}>
                        <option value="">（未定）</option>
                        {vehicles.map((x) => (
                          <option key={x['車輌ID']} value={x['車輌ID']}>
                            {vehicleWithCarrier(masters, x['車輌ID'])}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="積込数量kg" style={{ width: 120, marginBottom: 0 }}>
                      <input type="number" inputMode="numeric" value={v.kg} onChange={(e) => setVehicle(i, vi, { kg: e.target.value })} style={inputStyle} />
                    </Field>
                    <div style={{ fontSize: 13, color: 'var(--c-text-2)', minWidth: 150, paddingBottom: 10 }}>
                      {vr && num(v.kg) > 0
                        ? `積込 ${clock(vr.start)}〜${clock(vr.end)}${vr.src === '1t' ? '（1tあたりで計算）' : vr.src === '仮' ? '（仮）' : ''}`
                        : ''}
                    </div>
                    <button style={{ ...smallBtnStyle, marginBottom: 6 }} onClick={() => setRun(i, { vehicles: r.vehicles.filter((_, k) => k !== vi) })}>
                      ×
                    </button>
                  </div>
                );
              })}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', margin: '4px 0 8px' }}>
                <button style={smallBtnStyle} onClick={() => setRun(i, { vehicles: [...r.vehicles, emptyVehicle()] })}>
                  ＋ 車輌を足す
                </button>
                <Field label="移動時間（分）※記録が無いときなど" style={{ width: 230, marginBottom: 0 }}>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={r.travelOvr}
                    placeholder={model?.travel.get(r.pointId) ? `記録 ${model.travel.get(r.pointId).median}分` : ''}
                    onChange={(e) => setRun(i, { travelOvr: e.target.value })}
                    style={inputStyle}
                  />
                </Field>
              </div>

              {res && res.vehicles.length > 0 && start && (
                <div style={resultBox}>
                  <div>
                    出発　<b>{clock(res.depart)}ごろ</b>
                    <span style={dim}>（遅め {clock(res.departLate)}）</span>
                  </div>
                  {res.arrive != null ? (
                    <>
                      <div style={{ fontSize: 18 }}>
                        浜到着　<b>{clock(res.arrive)}ごろ</b>
                        <span style={dim}>
                          （遅め {clock(res.arriveLate)}・移動 {hm(res.travel.med)}／{res.travelSrc}）
                        </span>
                      </div>
                      <div>
                        連絡の目安　<b>
                          {clock(res.arrive + 15)}〜{clock(res.arrive + 30)}
                        </b>
                      </div>
                    </>
                  ) : (
                    <div style={{ color: 'var(--c-warn)' }}>{r.pointId ? 'この池場からこの浜への移動時間の記録がありません。移動時間（分）を入れてください。' : '浜を選んでください。'}</div>
                  )}
                  {actual && startMin !== null && (
                    <div style={dim}>
                      これまでの実績：{order}は1車目の開始から {hm(actual.s.median)}で到着（{actual.s.n}件）→ {clock(startMin + actual.s.median)}ごろ
                    </div>
                  )}
                  {r.planId && (
                    <div style={{ marginTop: 6, borderTop: '1px solid var(--c-border)', paddingTop: 6 }}>
                      今の到着予定時刻：<b>{r.eta || '未入力'}</b>
                      {admin && res.arrive != null && (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 4 }}>
                          <div style={{ width: 150 }}>
                            <TimeField label="到着予定に入れる時刻" value={r.etaInput || suggest} onChange={(t) => setRun(i, { etaInput: t })} />
                          </div>
                          <BusyButton
                            onClick={() => writeEta(i, r.etaInput || suggest)}
                            done={!!r.eta && r.eta === (r.etaInput || suggest)}
                            doneLabel="✓ 入れました"
                          >
                            この時刻を到着予定に入れる
                          </BusyButton>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {r.planId && (r.kaimenId || r.pointId) && (
                <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 4 }}>
                  {kaimenPersonName(masters, r.kaimenId)}・{deliveryDestName(masters, r.pointId)}
                </div>
              )}
            </div>
          );
        })}

      {ikebaId && (
        <>
          <button style={{ ...smallBtnStyle, marginBottom: 12 }} onClick={() => setRuns((rs) => [...rs, emptyRun()])}>
            ＋ 便を足す
          </button>
          <div style={{ fontSize: 14, color: 'var(--c-text-2)' }}>
            合計 {totalCars}台・{kgText(totalKg)}kg
            {results.length > 0 && results[results.length - 1]?.vehicles?.length > 0 &&
              `　最後の車の積込終了 ${clock(results[results.length - 1].vehicles[results[results.length - 1].vehicles.length - 1].end)}ごろ`}
          </div>
        </>
      )}
    </ScreenFrame>
  );
}

const card = { border: '1px solid var(--c-border)', borderRadius: 12, background: 'var(--c-bg-2)', padding: '12px 14px', marginBottom: 12 };
const resultBox = { background: 'var(--c-bg)', border: '1px solid var(--c-border-2)', borderRadius: 10, padding: '10px 12px', fontSize: 15, lineHeight: 1.8 };
const dim = { fontSize: 13, color: 'var(--c-text-3)', marginLeft: 6 };
const chipStyle = { ...smallBtnStyle, minHeight: 42 };
