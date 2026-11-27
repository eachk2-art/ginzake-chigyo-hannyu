import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { getLoadingTimes, getTravelTimes, getArrivalTimes, getArrivalStudies, getArrivalStudy, saveArrivalStudy, updatePlan } from '../lib/api';
import { today, addDays, toDateStr, formatDateTimeJP } from '../lib/dateUtils';
import { ErrorMsg, LoadingMsg } from '../components/UI';
import BusyButton from '../components/BusyButton';
import TimeField from '../components/TimeField';
import { Field, ScreenFrame, inputStyle, smallBtnStyle } from '../components/FormParts';
import { ikebaName, vehicleWithCarrier, deliveryDestName, kaimenPersonName } from '../lib/masterLookup';
import { isAdmin } from '../lib/roles';
import { num, kgText, pointsOfKaimen, ikebaOrderIndex } from '../lib/planUtils';
import { hm } from '../lib/travel';
import { enrich, routeTable, clock, orderLabel } from '../lib/arrival';
import { makeModel, simulate, ceil5, corrText } from '../lib/arrivalPlan';

/**
 * 到着時刻の検討（★2026-11-27、太協・管理者）
 * 日付・池場を決め、便ごとに行き先（海面業者・浜）・車輌と積込数量を並べ、1車目の積込開始を入れると、
 * 便ごとの積込・出発・浜到着の見込みが出る。
 *   ・日付×池場ごとに1件保存できる（直すと上書き。変更履歴に残る）。保存した検討は「その時点のメモ」で、予定が変わっても書き換えない
 *   ・開いたときに今の予定と比べ、違えば知らせる。「今の予定で計算し直す」で読み込み直せる
 *   ・計算は毎回その場で、納品完了の便の実績から（今シーズン優先・補正つき）。何を根拠にしたかを出す
 *   ・1つの便の車は、全部積み終わってから一緒に出発する
 *   ・予定の便は、管理者が見込みの時刻を到着予定時刻に入れられる
 */
let seq = 0;
const newKey = () => `k${++seq}`;
const emptyVehicle = () => ({ key: newKey(), vehicleId: '', kg: '' });
const emptyRun = () => ({ key: newKey(), planId: '', kaimenId: '', pointId: '', vehicles: [emptyVehicle()], travelOvr: '' });
const pad = (t) => {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
};

/** 今の予定（サーバーの顔ぶれ）→ 画面の便 */
const runsFromComp = (comp) =>
  (comp || []).map((p) => ({
    key: newKey(),
    planId: p['搬入予定ID'],
    kaimenId: p['海面業者ID'],
    pointId: p['配送先ID'],
    vehicles: (p['車輌'] || []).map((v) => ({ key: newKey(), vehicleId: v['車輌ID'] || '', kg: v.kg ? String(v.kg) : '' })),
    travelOvr: '',
  }));
/** 保存した便 → 画面の便 */
const runsFromStudy = (list) =>
  (list || []).map((r) => ({
    key: newKey(),
    planId: r['搬入予定ID'] || '',
    kaimenId: r['海面業者ID'] || '',
    pointId: r['配送先ID'] || '',
    vehicles: (r['車輌'] || []).map((v) => ({ key: newKey(), vehicleId: v['車輌ID'] || '', kg: v.kg ? String(v.kg) : '' })),
    travelOvr: r['移動時間入力'] ? String(r['移動時間入力']) : '',
  }));
/** 画面の便 → 保存する形 */
const runsToSave = (runs) =>
  runs.map((r) => ({
    搬入予定ID: r.planId,
    海面業者ID: r.kaimenId,
    配送先ID: r.pointId,
    車輌: r.vehicles.map((v) => ({ 車輌ID: v.vehicleId, kg: num(v.kg) })),
    移動時間入力: num(r.travelOvr) || '',
  }));

/** 保存した検討と今の予定の違い（文章で） */
function diffsOf(saved, comp, masters) {
  const out = [];
  const name = (k, p) => `${kaimenPersonName(masters, k)}（${deliveryDestName(masters, p)}）`;
  const vText = (vs) => {
    const a = (vs || []).filter((v) => num(v.kg) > 0);
    return `${a.length}台・${kgText(a.reduce((s, v) => s + num(v.kg), 0))}kg`;
  };
  const vKey = (vs) => JSON.stringify((vs || []).filter((v) => num(v.kg) > 0).map((v) => [v['車輌ID'] || '', Math.round(num(v.kg) * 10) / 10]));
  const cur = new Map((comp || []).map((p, i) => [p['搬入予定ID'], { ...p, i }]));
  const savedIds = new Set();
  (saved || []).forEach((r, i) => {
    const pid = r['搬入予定ID'];
    if (!pid) {
      out.push(`${i + 1}便目（${name(r['海面業者ID'], r['配送先ID'])}）は、予定から読み込んでいない便です`);
      return;
    }
    savedIds.add(pid);
    const c = cur.get(pid);
    if (!c) {
      out.push(`${name(r['海面業者ID'], r['配送先ID'])}：取消・中止になったか、日付・池場が変わりました`);
      return;
    }
    if (vKey(r['車輌']) !== vKey(c['車輌'])) out.push(`${name(c['海面業者ID'], c['配送先ID'])}：車輌・数量が変わりました（${vText(r['車輌'])} → ${vText(c['車輌'])}）`);
    if (c.i !== i) out.push(`${name(c['海面業者ID'], c['配送先ID'])}：便の順番が変わりました（${i + 1}便目 → ${c.i + 1}便目）`);
  });
  (comp || []).forEach((p) => {
    if (!savedIds.has(p['搬入予定ID'])) out.push(`${name(p['海面業者ID'], p['配送先ID'])}：保存したあとに追加された予定です`);
  });
  return out;
}

export default function ArrivalPlanScreen({ initialDate, initialIkebaId, onClose }) {
  const { auth } = useAuth();
  const { masters } = useMasters();
  const admin = isAdmin(auth.role);

  const [date, setDate] = useState(initialDate || toDateStr(today()));
  const [ikebaId, setIkebaId] = useState(initialIkebaId || '');
  const [start, setStart] = useState('');
  const [startBasis, setStartBasis] = useState('');
  const [runs, setRuns] = useState([emptyRun()]);
  const [note, setNote] = useState('');
  const [hist, setHist] = useState(null);
  const [histError, setHistError] = useState('');
  const [loaded, setLoaded] = useState(null); // { study, comp, changed }
  const [loadError, setLoadError] = useState('');
  const [savedSnap, setSavedSnap] = useState('');
  const [saveError, setSaveError] = useState('');
  const [msg, setMsg] = useState('');
  const [showBasis, setShowBasis] = useState(false);
  const [showSavedBasis, setShowSavedBasis] = useState(false);
  const [etaInput, setEtaInput] = useState({}); // 搬入予定ID → 入れる時刻
  const [etaDone, setEtaDone] = useState({}); // 搬入予定ID → 入れた時刻

  // 実績（直近2年、納品完了の便だけ）と、保存した検討（補正用）
  const loadHist = useCallback(() => {
    setHist(null);
    setHistError('');
    const from = toDateStr(addDays(today(), -730));
    const to = toDateStr(today());
    Promise.all([getLoadingTimes(auth, from, to), getTravelTimes(auth, from, to), getArrivalTimes(auth, from, to), getArrivalStudies(auth, from, to)])
      .then(([l, t, a, s]) => setHist({ loadingRuns: l, travel: t, arrival: enrich(a), studies: s }))
      .catch((e) => setHistError(e.message));
  }, [auth]);
  useEffect(() => {
    loadHist();
  }, [loadHist]);

  // 日付・池場を選んだら、保存した検討（無ければ今の予定）を開く
  const loadStudy = useCallback(async () => {
    setLoaded(null);
    setLoadError('');
    setMsg('');
    setSaveError('');
    setEtaInput({});
    setEtaDone({});
    if (!date || !ikebaId) return;
    try {
      const r = await getArrivalStudy(auth, date, ikebaId);
      const comp = r['今の予定'] || [];
      setLoaded({ study: r.study, comp, changed: r['予定と違う'] });
      if (r.study) {
        const st = r.study;
        const rs = runsFromStudy(st['便']);
        setRuns(rs.length ? rs : [emptyRun()]);
        setStart(st['1車目の積込開始'] || '');
        setStartBasis(st['開始の決め方'] || '');
        setNote(st['メモ'] || '');
        setSavedSnap(JSON.stringify({ r: runsToSave(rs), s: st['1車目の積込開始'] || '', n: st['メモ'] || '' }));
      } else {
        setRuns(comp.length ? runsFromComp(comp) : [emptyRun()]);
        setStart('');
        setStartBasis('');
        setNote('');
        setSavedSnap('');
        setMsg(comp.length ? `保存した検討はありません。今の予定（${comp.length}便）を読み込みました。` : 'この日・この池場の予定はありません。便を足して検討できます。');
      }
    } catch (e) {
      setLoadError(e.message);
    }
  }, [auth, date, ikebaId]);
  useEffect(() => {
    loadStudy();
  }, [loadStudy]);

  const model = useMemo(() => (hist && ikebaId ? makeModel(hist, ikebaId, date) : null), [hist, ikebaId, date]);
  const usual = model?.startUsual || null;
  const snowStart = model?.startSnow || null;

  // 新しく検討するときは、1車目の積込開始に「ふだん」の目安を入れておく
  useEffect(() => {
    if (!loaded || loaded.study || start || !usual) return;
    setStart(pad(clock(usual.median)));
    setStartBasis(`ふだん（${usual.src} ${usual.n}日の中央値）`);
  }, [loaded, usual, start]);

  const inputRuns = runs.map((r) => ({ 配送先ID: r.pointId, vehicles: r.vehicles.map((v) => ({ kg: v.kg })), travelOvr: r.travelOvr }));
  const sim = model ? simulate(model, inputRuns, start) : { runs: [], common: [] };
  const results = sim.runs;
  const actualRoutes = useMemo(() => (hist ? routeTable(hist.arrival.filter((x) => x['池場ID'] === ikebaId)) : []), [hist, ikebaId]);
  const compById = new Map((loaded?.comp || []).map((p) => [p['搬入予定ID'], p]));
  const startMin = (() => {
    const m = String(start).match(/^(\d{1,2}):(\d{2})/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  })();

  const vehicleName = (id) => (id ? vehicleWithCarrier(masters, id) : '車輌未定');
  // 計算の根拠（画面に出し、保存もする）
  const basis = {
    計算日時: formatDateTimeJP(new Date().toISOString()),
    共通: [`1車目の積込開始：${start || '未入力'}${startBasis ? `（${startBasis}）` : ''}`, ...sim.common],
    便: runs.map((r, i) => {
      const res = results[i];
      const lines = [];
      (res?.vehicles || []).forEach((v, k) => {
        const vid = r.vehicles.filter((x) => num(x.kg) > 0)[k]?.vehicleId;
        lines.push(`${vehicleName(vid)} ${kgText(v.kg)}kg：積込 ${hm(v.end - v.start)}（${v.basis}）`);
      });
      if (res?.travel) lines.push(`移動：${res.travel.basis}`);
      else if (res?.vehicles?.length) lines.push('移動：記録なし（移動時間を入れると計算します）');
      if (res?.travel) lines.push(corrText(res.corr));
      if (res?.arrive != null) lines.push(`浜到着の見込み ${clock(res.arrive)}（遅め ${clock(res.arriveLate)}）`);
      return { 見出し: `${i + 1}便目 ${r.kaimenId ? `${kaimenPersonName(masters, r.kaimenId)}・${deliveryDestName(masters, r.pointId)}` : '（行き先未定）'}`, 行: lines };
    }),
  };

  const snap = JSON.stringify({ r: runsToSave(runs), s: start, n: note });
  const dirty = snap !== savedSnap;
  const diffs = loaded?.study && loaded.changed ? diffsOf(loaded.study['便'], loaded.comp, masters) : [];

  async function save() {
    setSaveError('');
    try {
      const data = {
        '1車目の積込開始': start,
        開始の決め方: startBasis,
        メモ: note,
        便: runsToSave(runs),
        結果: runs.map((r, i) => {
          const res = results[i] || {};
          return {
            搬入予定ID: r.planId,
            配送先ID: r.pointId,
            出発: res.depart != null ? clock(res.depart) : '',
            到着: res.arrive != null ? clock(res.arrive) : '',
            到着遅め: res.arriveLate != null ? clock(res.arriveLate) : '',
            開始からの見込み分: res.offsetRaw ?? null, // 補正をかける前（補正はこの値と実績の差で計算する）
            補正分: res.corr?.applied ? res.corr.median : 0,
          };
        }),
        根拠: basis,
      };
      await saveArrivalStudy(auth, date, ikebaId, data);
      await loadStudy();
    } catch (e) {
      setSaveError(e.message);
    }
  }

  async function writeEta(planId, v) {
    if (!planId || !v) return;
    await updatePlan(auth, planId, { 到着予定時刻: v });
    setEtaDone((m) => ({ ...m, [planId]: v }));
  }

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

  const idx = ikebaOrderIndex(masters);
  const ikebaList = [...(masters?.池場 || [])].sort((a, b) => idx(a['池場ID']) - idx(b['池場ID']));
  const vehicles = masters?.車輌 || [];
  const totalKg = runs.reduce((s, r) => s + r.vehicles.reduce((t, v) => t + num(v.kg), 0), 0);
  const totalCars = runs.reduce((s, r) => s + r.vehicles.filter((v) => num(v.kg) > 0).length, 0);
  const lastRes = [...results].reverse().find((x) => x?.vehicles?.length);

  return (
    <ScreenFrame
      title="到着時刻の検討"
      sub="便ごとに行き先・車輌・積込数量を並べ、1車目の積込開始を入れると、浜到着の見込みが出ます。車は上から順に積み、1つの便の車は全部積み終わってから一緒に出発する、として計算します。"
      onClose={onClose}
    >
      {histError && <ErrorMsg message={`実績の読み込みに失敗しました：${histError}`} onRetry={loadHist} />}
      {!histError && !hist && <LoadingMsg>実績を読み込んでいます…</LoadingMsg>}

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

        <ErrorMsg message={loadError} />
        {ikebaId && !loaded && !loadError && <LoadingMsg>検討を読み込んでいます…</LoadingMsg>}
        {loaded?.study && (
          <div style={{ fontSize: 14, color: 'var(--c-text-2)', margin: '4px 0 6px' }}>
            保存した検討を開いています（{formatDateTimeJP(loaded.study['保存日時'])} 保存）
          </div>
        )}
        {msg && <div style={{ fontSize: 14, color: 'var(--c-text-2)', margin: '4px 0 6px' }}>{msg}</div>}
        {diffs.length > 0 && (
          <div style={warnBox}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>保存したあとに、予定が変わっています</div>
            {diffs.map((d, i) => (
              <div key={i}>・{d}</div>
            ))}
            <div style={{ marginTop: 6, fontSize: 13 }}>「今の予定で計算し直す」で、今の予定を読み込み直せます（保存するまでは、保存した検討はそのままです）。</div>
          </div>
        )}
        {loaded && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '6px 0' }}>
            {loaded.comp.length > 0 && (
              <button
                style={smallBtnStyle}
                onClick={() => {
                  setRuns(runsFromComp(loaded.comp));
                  setMsg(`今の予定（${loaded.comp.length}便）を読み込みました。よければ保存してください。`);
                }}
              >
                今の予定で計算し直す
              </button>
            )}
            <button style={smallBtnStyle} onClick={() => setRuns([emptyRun()])}>
              白紙にする
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 8 }}>
          <div style={{ width: 160 }}>
            <TimeField
              label="1車目の積込開始"
              value={start}
              onChange={(v) => {
                setStart(v);
                setStartBasis('手入力');
              }}
            />
          </div>
          {usual && (
            <button
              style={chipStyle}
              onClick={() => {
                setStart(pad(clock(usual.median)));
                setStartBasis(`ふだん（${usual.src} ${usual.n}日の中央値）`);
              }}
            >
              ふだん {clock(usual.median)}
            </button>
          )}
          {snowStart && (
            <button
              style={chipStyle}
              onClick={() => {
                setStart(pad(clock(snowStart.median)));
                setStartBasis(`除雪の日（${snowStart.src} ${snowStart.n}日の中央値）`);
              }}
            >
              除雪の日 {clock(snowStart.median)}
            </button>
          )}
        </div>
        {startBasis && <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 4 }}>1車目の積込開始：{startBasis}</div>}
      </div>

      {ikebaId &&
        loaded &&
        runs.map((r, i) => {
          const res = results[i];
          const points = r.kaimenId ? pointsOfKaimen(masters, r.kaimenId) : [];
          const order = orderLabel(i + 1);
          const actual = actualRoutes.find((x) => x.point === r.pointId)?.rows.find((x) => x.order === order);
          const cp = r.planId ? compById.get(r.planId) : null;
          const eta = etaDone[r.planId] || cp?.['到着予定時刻'] || '';
          const suggest = res?.arrive != null ? pad(clock(ceil5(res.arrive + 15))) : '';
          const etaVal = etaInput[r.planId] || suggest;
          return (
            <div key={r.key} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ fontSize: 17, fontWeight: 700 }}>
                  {i + 1}便目
                  {r.planId && <span style={{ fontSize: 12, color: 'var(--c-text-3)', marginLeft: 8 }}>{cp ? '予定の便' : '予定に無い便（取消など）'}</span>}
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
                    <div style={{ fontSize: 13, color: vr?.guess ? 'var(--c-warn)' : 'var(--c-text-2)', minWidth: 150, paddingBottom: 10 }}>
                      {vr && num(v.kg) > 0 ? `積込 ${clock(vr.start)}〜${clock(vr.end)}${vr.guess ? '（仮）' : ''}` : ''}
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
                    placeholder={model && r.pointId && model.travelFor(r.pointId) ? `記録 ${model.travelFor(r.pointId).median}分` : ''}
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
                        <span style={dim}>（遅め {clock(res.arriveLate)}）</span>
                      </div>
                      <div>
                        連絡の目安　<b>
                          {clock(res.arrive + 15)}〜{clock(res.arrive + 30)}
                        </b>
                      </div>
                      {res.corr?.applied && <div style={dim}>{corrText(res.corr)}</div>}
                    </>
                  ) : (
                    <div style={{ color: 'var(--c-warn)' }}>{r.pointId ? 'この池場からこの浜への移動時間の記録がありません。移動時間（分）を入れてください。' : '浜を選んでください。'}</div>
                  )}
                  {actual && startMin !== null && (
                    <div style={dim}>
                      これまでの実績：{order}は1車目の開始から {hm(actual.s.median)}で到着（{actual.s.n}件）→ {clock(startMin + actual.s.median)}ごろ
                    </div>
                  )}
                  {cp && (
                    <div style={{ marginTop: 6, borderTop: '1px solid var(--c-border)', paddingTop: 6 }}>
                      {cp['浜到着時刻'] ? (
                        <>
                          浜到着（実績）：<b>{cp['浜到着時刻']}</b>
                        </>
                      ) : (
                        <>
                          今の到着予定時刻：<b>{eta || '未入力'}</b>
                          {admin && res.arrive != null && (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 4 }}>
                              <div style={{ width: 150 }}>
                                <TimeField label="到着予定に入れる時刻" value={etaVal} onChange={(t) => setEtaInput((m) => ({ ...m, [r.planId]: t }))} />
                              </div>
                              <BusyButton onClick={() => writeEta(r.planId, etaVal)} done={!!eta && eta === etaVal} doneLabel="✓ 入っています">
                                この時刻を到着予定に入れる
                              </BusyButton>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

      {ikebaId && loaded && (
        <>
          <button style={{ ...smallBtnStyle, marginBottom: 12 }} onClick={() => setRuns((rs) => [...rs, emptyRun()])}>
            ＋ 便を足す
          </button>
          <div style={{ fontSize: 14, color: 'var(--c-text-2)', marginBottom: 10 }}>
            合計 {totalCars}台・{kgText(totalKg)}kg
            {lastRes && `　最後の車の積込終了 ${clock(lastRes.vehicles[lastRes.vehicles.length - 1].end)}ごろ`}
          </div>

          <div style={card}>
            <Field label="メモ（任意）">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </Field>
            <ErrorMsg message={saveError} />
            <BusyButton onClick={save} done={!!loaded.study && !dirty} disabled={!start || !hist}>
              {loaded.study ? 'この検討で上書き保存' : 'この検討を保存'}
            </BusyButton>
            <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 6, lineHeight: 1.6 }}>
              日付×池場ごとに1件保存します（直すと上書き。前の内容は変更履歴に残ります）。保存しても予定の到着予定時刻は変わりません。
            </div>
          </div>

          <div style={card}>
            <button style={toggleHead} onClick={() => setShowBasis((x) => !x)}>
              <span>計算の根拠（今の計算）</span>
              <span>{showBasis ? '▲' : '▼'}</span>
            </button>
            {showBasis && <BasisView basis={basis} />}
          </div>
          {loaded.study?.['根拠'] && (
            <div style={card}>
              <button style={toggleHead} onClick={() => setShowSavedBasis((x) => !x)}>
                <span>保存したときの根拠（{formatDateTimeJP(loaded.study['保存日時'])}）</span>
                <span>{showSavedBasis ? '▲' : '▼'}</span>
              </button>
              {showSavedBasis && <BasisView basis={loaded.study['根拠']} />}
            </div>
          )}
        </>
      )}
    </ScreenFrame>
  );
}

function BasisView({ basis }) {
  return (
    <div style={{ fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.7, marginTop: 8 }}>
      {basis['計算日時'] && <div style={{ color: 'var(--c-text-3)' }}>計算日時：{basis['計算日時']}</div>}
      {(basis['共通'] || []).map((l, i) => (
        <div key={i}>・{l}</div>
      ))}
      {(basis['便'] || []).map((r, i) => (
        <div key={i} style={{ marginTop: 6 }}>
          <div style={{ fontWeight: 700, color: 'var(--c-text)' }}>{r['見出し']}</div>
          {(r['行'] || []).map((l, j) => (
            <div key={j} style={{ paddingLeft: 12 }}>
              ・{l}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const card = { border: '1px solid var(--c-border)', borderRadius: 12, background: 'var(--c-bg-2)', padding: '12px 14px', marginBottom: 12 };
const resultBox = { background: 'var(--c-bg)', border: '1px solid var(--c-border-2)', borderRadius: 10, padding: '10px 12px', fontSize: 15, lineHeight: 1.8 };
const warnBox = { background: 'var(--c-warn-bg)', border: '1px solid var(--c-warn)', color: 'var(--c-warn)', borderRadius: 10, padding: '10px 12px', fontSize: 14, lineHeight: 1.7, margin: '6px 0' };
const dim = { fontSize: 13, color: 'var(--c-text-3)', marginLeft: 6 };
const chipStyle = { ...smallBtnStyle, minHeight: 42 };
const toggleHead = { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'transparent', border: 'none', color: 'var(--c-text)', fontSize: 15, fontWeight: 700, cursor: 'pointer', padding: 0, textAlign: 'left' };
