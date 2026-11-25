import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { getRunDetail, getSchedules, saveRun } from '../lib/api';
import { formatJP } from '../lib/dateUtils';
import { ikebaBaseName, vehicleWithCarrier, kaimenPersonName, deliveryDestName } from '../lib/masterLookup';
import { ErrorMsg, LoadingMsg, StatusBadge } from '../components/UI';
import BusyButton from '../components/BusyButton';
import TimeField from '../components/TimeField';
import { Field, ScreenFrame, Section, inputStyle, noticeStyle, smallBtnStyle } from '../components/FormParts';
import { isAdmin } from '../lib/roles';
import { num, kgText, fishSummary, weighTarget, isInactiveStatus } from '../lib/planUtils';

const MAX_DETAILS = 6;
const ROUNDS_LIMIT = 20; // 積込回数から自動で作る計量欄の上限
const SMALL_UNIT_KG = 250; // 計量は250kgバケット単位

/**
 * 積込（運行）の画面（★2026-11-24 親子方式）：日付×車輌×回目で1つ。
 * ・積込開始・終了、ワクチン本数、積込回数、計量明細を入れる
 * ・積み分け（1台を2つ以上の納品先へ）のときは、計量の1回ごとに「行き先」を選ぶ
 * ・天候・水温・内水面立会者は池場日誌、出発時刻は納品先（現場）の画面で入れる
 */
export default function RunScreen({ runId, onClose, onOpenPlan, onOpenPondLog }) {
  const { auth } = useAuth();
  const { masters } = useMasters();
  const [run, setRun] = useState(null);
  const [items, setItems] = useState([]); // 便（割当）の形：入れ目率・ステータス用
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await getRunDetail(auth, runId);
      const list = await getSchedules(auth, { dateFrom: r['運行日'], dateTo: r['運行日'] });
      setItems((list || []).filter((s) => s['運行ID'] === runId));
      setRun(r);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(e.message);
    }
  }, [auth, runId]);

  useEffect(() => {
    setRun(null);
    load();
  }, [load]);

  const title = '積込・計量（車輌ごと）';
  if (!run) {
    return (
      <ScreenFrame title={title} onClose={onClose}>
        {error ? <ErrorMsg message={`読み込みに失敗しました：${error}`} onRetry={load} /> : <LoadingMsg>読み込んでいます…</LoadingMsg>}
      </ScreenFrame>
    );
  }

  return (
    <RunForm
      key={version}
      auth={auth}
      masters={masters}
      run={run}
      items={items}
      title={title}
      loadError={error}
      onReload={load}
      onClose={onClose}
      onOpenPlan={onOpenPlan}
      onOpenPondLog={onOpenPondLog}
    />
  );
}

function RunForm({ auth, masters, run, items, title, loadError, onReload, onClose, onOpenPlan, onOpenPondLog }) {
  const allocs = run['割当'] || [];
  const itemOf = (sid) => items.find((s) => s['積込予定ID'] === sid);
  const liveAllocs = allocs.filter((a) => !isInactiveStatus(a['予定状態']));
  const needDest = allocs.length >= 2; // 積み分け
  const locked = !isAdmin(auth.role) && items.some((s) => s['ステータス'] === '納品完了');
  const allStopped = allocs.length > 0 && liveAllocs.length === 0;
  const ikebaIds = Array.from(new Set(allocs.map((a) => a['池場ID'])));
  const defaultIkeba = ikebaIds[0] || '';
  const ikebaOfPlan = (planId) => allocs.find((a) => a['搬入予定ID'] === planId)?.['池場ID'] || defaultIkeba;

  const [header, setHeader] = useState({
    積込開始時刻: run['積込開始時刻'] || '',
    積込終了時刻: run['積込終了時刻'] || '',
    ワクチン本数: run['ワクチン本数'] ?? '',
    積込回数: run['積込回数'] ?? '',
    備考: run['備考'] || '',
  });
  // 計量の空の欄を1つ作る（直前の回の平均サイズ・行き先を引き継ぐ）
  function blankRow(rs) {
    const last = [...rs].reverse().find((r) => String(r.平均サイズg || '') !== '');
    const lastDest = rs.length > 0 ? rs[rs.length - 1].行き先 : '';
    return {
      id: null,
      池場ID: lastDest ? ikebaOfPlan(lastDest) : defaultIkeba,
      実績数量kg: '',
      平均サイズg: last ? last.平均サイズg : '',
      行き先: needDest ? lastDest : '',
    };
  }
  // 積込回数の数まで、空の欄を足す（★2026-11-25）
  function fillTo(rs, n) {
    const out = [...rs];
    while (out.length < Math.min(n, ROUNDS_LIMIT)) out.push(blankRow(out));
    return out;
  }
  const isBlankNew = (r) => !r.id && String(r.実績数量kg ?? '') === '';
  const [rows, setRows] = useState(() =>
    fillTo(
      (run['明細'] || []).map((d) => ({
        id: d['明細ID'],
        池場ID: d['池場ID'] || defaultIkeba,
        実績数量kg: d['実績数量kg'] ?? '',
        平均サイズg: d['平均サイズg'] ?? '',
        行き先: d['行き先搬入予定ID'] || '',
      })),
      num(run['積込回数'])
    )
  );
  // 「＋計量明細を追加」で足した欄の数量にカーソルを置く（★2026-11-25）
  const qtyRefs = useRef([]);
  const [focusIdx, setFocusIdx] = useState(null);
  useEffect(() => {
    if (focusIdx === null) return;
    qtyRefs.current[focusIdx]?.focus();
    setFocusIdx(null);
  }, [focusIdx]);
  const snapOf = (h, rs) => JSON.stringify({ h, rs: rs.filter((r) => !isBlankNew(r)).map((r) => [r.id || null, r.池場ID, String(r.実績数量kg), String(r.平均サイズg), r.行き先]) });
  const [savedSnap, setSavedSnap] = useState(() => snapOf(header, rows));
  const isSaved = savedSnap === snapOf(header, rows);
  const [error, setError] = useState('');

  const setH = (k, v) => setHeader((h) => ({ ...h, [k]: v }));
  function setRow(i, k, v) {
    setRows((rs) =>
      rs.map((r, idx) => {
        if (idx !== i) return r;
        const next = { ...r, [k]: v };
        if (k === '行き先' && v) next.池場ID = ikebaOfPlan(v);
        return next;
      })
    );
  }
  // 平均サイズは、変えた回以降で同じ値だった回にも反映する（今までと同じ）
  function setRowSize(i, val) {
    setRows((rs) => {
      const prev = rs[i]['平均サイズg'];
      return rs.map((r, idx) => {
        if (idx === i) return { ...r, 平均サイズg: val };
        if (idx > i && String(r['平均サイズg']) === String(prev)) return { ...r, 平均サイズg: val };
        return r;
      });
    });
  }

  // 積込回数（250kgバケット換算）の目安：車輌マスタの積載量から
  const vehicle = (masters?.車輌 || []).find((v) => v['車輌ID'] === run['車輌ID']);
  const capacityKg = num(vehicle?.['最大積載数量kg']) || num(vehicle?.['水槽容量']) * num(vehicle?.['水槽数']);
  const suggestedRounds = capacityKg > 0 ? Math.ceil(capacityKg / SMALL_UNIT_KG) : 0;
  const plannedRounds = num(header.積込回数) > 0 ? num(header.積込回数) : suggestedRounds;
  const maxDetails = Math.max(MAX_DETAILS, plannedRounds + 2); // 積込回数より多く積んだときのため、2回分の余裕を持たせる

  function addRow() {
    if (rows.length >= maxDetails) return;
    setFocusIdx(rows.length);
    setRows((rs) => [...rs, blankRow(rs)]);
  }

  // 積込回数を入れたら、その数まで計量の欄を出す。減らしたときは、後ろの未入力の欄だけ消す（★2026-11-25）
  function changeRounds(v) {
    setH('積込回数', v);
    const n = num(v);
    setRows((rs) => {
      if (n > rs.length) return fillTo(rs, n);
      const out = [...rs];
      while (out.length > n && out.length > 0 && isBlankNew(out[out.length - 1])) out.pop();
      return out;
    });
  }

  // 行き先（納品先）ごとの目標と計量
  const dests = allocs.map((a) => {
    const it = itemOf(a['積込予定ID']);
    const mine = rows.filter((r) => (needDest ? r.行き先 === a['搬入予定ID'] : true));
    const target = weighTarget(a['割当数量kg'], it?.['予定入れ目率']);
    return { a, it, rows: mine, target, fish: fishSummary(mine, a['割当数量kg']) };
  });
  const totalKg = rows.reduce((s, r) => s + num(r.実績数量kg), 0);
  const totalTarget = dests.filter((d) => !isInactiveStatus(d.a['予定状態'])).reduce((s, d) => s + d.target, 0);
  const remainingKg = totalTarget - totalKg;
  const enteredRows = rows.filter((r) => !isBlankNew(r)).length; // 数量を入れた回の数
  const remainingRounds = Math.max(plannedRounds - enteredRows, 0);
  const perBucketKg = remainingRounds > 0 && remainingKg > 0 ? Math.round(remainingKg / remainingRounds) : 0;
  const noDestCount = needDest ? rows.filter((r) => !isBlankNew(r) && !r.行き先).length : 0;

  async function handleSave() {
    setError('');
    if (needDest && noDestCount > 0) {
      setError('積み分けの車輌です。計量の行き先（どの納品先の分か）をすべての回で選んでください');
      return;
    }
    // 積込回数から自動で出した欄のうち、数量を入れていないものは送らない
    const details = rows.filter((r) => !isBlankNew(r)).map((r) => {
      const d = { 池場ID: r.池場ID, 実績数量kg: r.実績数量kg, 平均サイズg: r.平均サイズg ?? '', 行き先搬入予定ID: r.行き先 };
      if (r.id) d['明細ID'] = r.id;
      return d;
    });
    try {
      const saved = await saveRun(auth, run['運行ID'], header, details);
      const newRows = (saved?.['明細'] || []).map((d) => ({
        id: d['明細ID'],
        池場ID: d['池場ID'] || defaultIkeba,
        実績数量kg: d['実績数量kg'] ?? '',
        平均サイズg: d['平均サイズg'] ?? '',
        行き先: d['行き先搬入予定ID'] || '',
      }));
      setRows(fillTo(newRows, num(header.積込回数)));
      setSavedSnap(snapOf(header, newRows));
    } catch (e) {
      setError(e.message);
    }
  }

  const disabled = locked || allStopped;

  return (
    <ScreenFrame
      title={title}
      sub={
        <>
          {formatJP(run['運行日'])}　{vehicleWithCarrier(masters, run['車輌ID'])}
          {num(run['回目']) > 1 && <span style={{ color: 'var(--c-warn)' }}>　{run['回目']}回目</span>}
          {needDest && <span style={{ marginLeft: 8, color: 'var(--c-accent)', fontWeight: 700 }}>積み分け</span>}
        </>
      }
      onClose={onClose}
    >
      {loadError && <ErrorMsg message={loadError} onRetry={onReload} />}
      {locked && <div style={noticeStyle}>この車輌の納品先に納品完了のものがあるため、修正は管理者だけができます。</div>}
      {allStopped && <div style={noticeStyle}>この車輌は中止（または取消）のため、積込の入力はできません。</div>}

      <Section title="この車輌の納品先">
        {dests.map(({ a, it, target }) => (
          <div key={a['積込予定ID']} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ fontSize: 14, lineHeight: 1.6 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                {kaimenPersonName(masters, a['海面業者ID'])}　浜：{deliveryDestName(masters, a['配送先ID'])}
              </div>
              <div style={{ color: 'var(--c-text-2)' }}>
                {ikebaBaseName(masters, a['池場ID'])}／割当 {kgText(a['割当数量kg'])}kg（入れ目 {it?.['予定入れ目率'] || 0}% → 目標 {target.toLocaleString()}kg）
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              {it && <StatusBadge status={it['ステータス']} />}
              <button style={smallBtnStyle} onClick={() => onOpenPlan(a['搬入予定ID'])}>
                納品先 ›
              </button>
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {ikebaIds.map((ik) => (
            <button key={ik} style={smallBtnStyle} onClick={() => onOpenPondLog(run['運行日'], ik)}>
              {ikebaBaseName(masters, ik)}の池場日誌 ›
            </button>
          ))}
        </div>
      </Section>

      <Section title="積込">
        <TimeField label="積込開始時刻" value={header.積込開始時刻} disabled={disabled} onChange={(v) => setH('積込開始時刻', v)} />
        <TimeField label="積込終了時刻" value={header.積込終了時刻} disabled={disabled} onChange={(v) => setH('積込終了時刻', v)} />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Field label="ワクチン本数" style={{ flex: 1, minWidth: 120 }}>
            <input type="number" value={header.ワクチン本数} disabled={disabled} onChange={(e) => setH('ワクチン本数', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="積込回数（250kgバケット換算）" style={{ flex: 1, minWidth: 160 }}>
            <input
              type="number"
              inputMode="numeric"
              value={header.積込回数}
              disabled={disabled}
              placeholder={suggestedRounds > 0 ? String(suggestedRounds) : ''}
              onChange={(e) => changeRounds(e.target.value)}
              style={inputStyle}
            />
          </Field>
        </div>
        <div style={{ fontSize: 13, color: 'var(--c-text-3)', margin: '-8px 0 14px' }}>
          {suggestedRounds > 0
            ? `車輌マスタからの目安：${suggestedRounds}回（${capacityKg.toLocaleString()}kg積み）`
            : '車輌マスタに水槽・積載量の情報がありません'}
        </div>
        <Field label="備考">
          <textarea value={header.備考} disabled={disabled} onChange={(e) => setH('備考', e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
        </Field>
      </Section>

      <Section title={`計量明細（合計 ${kgText(totalKg)}kg・${enteredRows}回）`}>
        {totalTarget > 0 && (
          <div style={{ border: '1px solid var(--c-border-2)', borderRadius: 10, padding: '10px 12px', marginBottom: 12, fontSize: 14, background: 'var(--c-bg)' }}>
            <div style={{ color: 'var(--c-text-2)' }}>この車輌の目標（入れ目込み）：{totalTarget.toLocaleString()}kg</div>
            {remainingKg > 0 ? (
              <>
                <div style={{ marginTop: 4, fontSize: 16, fontWeight: 700, color: 'var(--c-warn)' }}>あと {kgText(remainingKg)}kg</div>
                {plannedRounds > 0 && remainingRounds > 0 && (
                  <div style={{ color: 'var(--c-text-2)' }}>
                    積込回数{plannedRounds}回のうち残り{remainingRounds}回・1回あたり約{perBucketKg.toLocaleString()}kg
                  </div>
                )}
              </>
            ) : remainingKg < 0 ? (
              <div style={{ marginTop: 4, fontSize: 16, fontWeight: 700, color: 'var(--c-danger)' }}>目標を {kgText(-remainingKg)}kg 超過しています</div>
            ) : (
              <div style={{ marginTop: 4, fontSize: 16, fontWeight: 700, color: 'var(--c-ok)' }}>目標に到達しました</div>
            )}
          </div>
        )}

        {rows.map((r, i) => {
          const kg = num(r.実績数量kg);
          const size = num(r.平均サイズg);
          return (
            <div key={i} style={{ border: '1px solid var(--c-border-2)', borderRadius: 10, padding: 12, marginBottom: 10, background: 'var(--c-bg)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{i + 1}回目</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}
                    style={{ fontSize: 13, color: 'var(--c-danger)', background: 'none', border: 'none', cursor: 'pointer', minHeight: 36 }}
                  >
                    この明細を削除
                  </button>
                )}
              </div>
              {needDest && (
                <Field label="行き先（どの納品先の分か）">
                  <select
                    value={r.行き先}
                    disabled={disabled}
                    onChange={(e) => setRow(i, '行き先', e.target.value)}
                    style={{ ...inputStyle, borderColor: r.行き先 ? 'var(--c-border-2)' : 'var(--c-warn)' }}
                  >
                    <option value="">選んでください</option>
                    {liveAllocs.map((a) => (
                      <option key={a['搬入予定ID']} value={a['搬入予定ID']}>
                        {kaimenPersonName(masters, a['海面業者ID'])}（{deliveryDestName(masters, a['配送先ID'])}）
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {ikebaIds.length > 1 && !needDest ? (
                <Field label="池場">
                  <select value={r.池場ID} disabled={disabled} onChange={(e) => setRow(i, '池場ID', e.target.value)} style={inputStyle}>
                    {ikebaIds.map((ik) => (
                      <option key={ik} value={ik}>
                        {ikebaBaseName(masters, ik)}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginBottom: 8 }}>池場：{ikebaBaseName(masters, r.池場ID)}</div>
              )}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Field label="実績数量（kg）" style={{ flex: 1, minWidth: 130 }}>
                  <input
                    ref={(el) => {
                      qtyRefs.current[i] = el;
                    }}
                    type="number"
                    inputMode="decimal"
                    value={r.実績数量kg}
                    disabled={disabled} onChange={(e) => setRow(i, '実績数量kg', e.target.value)} style={inputStyle} />
                </Field>
                <Field label="平均サイズ（g）" style={{ flex: 1, minWidth: 130 }}>
                  <input type="number" inputMode="decimal" value={r.平均サイズg} disabled={disabled} onChange={(e) => setRowSize(i, e.target.value)} style={inputStyle} />
                </Field>
              </div>
              {kg > 0 && size > 0 && (
                <div style={{ fontSize: 13, color: 'var(--c-text-2)', marginTop: -6 }}>この回の尾数：約 {Math.floor((kg * 1000) / size).toLocaleString()}尾</div>
              )}
            </div>
          );
        })}

        {!disabled && rows.length < maxDetails && (
          <button type="button" onClick={addRow} style={dashedBtnStyle}>
            ＋ 計量明細を追加（{rows.length}/{maxDetails}）
          </button>
        )}

        {dests.some((d) => d.fish.fishRaw > 0) && (
          <div style={{ marginTop: 6, marginBottom: 12 }}>
            {dests
              .filter((d) => d.fish.fishRaw > 0)
              .map((d) => (
                <div key={d.a['積込予定ID']} style={{ border: '1px solid var(--c-border-2)', borderRadius: 10, padding: '10px 12px', marginBottom: 8, fontSize: 14, lineHeight: 1.8 }}>
                  <div style={{ fontWeight: 700 }}>
                    {needDest ? `${kaimenPersonName(masters, d.a['海面業者ID'])}（${deliveryDestName(masters, d.a['配送先ID'])}）の分` : 'この車輌の尾数'}
                  </div>
                  <div>
                    計量 {kgText(d.fish.kg)}kg（入れ目込み）／ 割当 {kgText(d.a['割当数量kg'])}kg
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>
                    {d.fish.fishNet.toLocaleString()}尾（入れ目込み {d.fish.fishGross.toLocaleString()}尾）　平均 {d.fish.avg}g
                  </div>
                </div>
              ))}
          </div>
        )}
        {noDestCount > 0 && (
          <div style={{ fontSize: 14, color: 'var(--c-warn)', marginBottom: 10 }}>行き先が選ばれていない回が {noDestCount}回 あります</div>
        )}
      </Section>

      <ErrorMsg message={error} />
      {!disabled && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
          <BusyButton onClick={handleSave} done={isSaved && (run['明細'] || []).length + rows.length > 0}>
            保存
          </BusyButton>
          <BusyButton variant="ghost" onClick={onClose}>
            閉じる
          </BusyButton>
        </div>
      )}
    </ScreenFrame>
  );
}

const dashedBtnStyle = {
  minHeight: 42,
  padding: '8px 16px',
  borderRadius: 8,
  border: '1px dashed var(--c-border-2)',
  background: 'transparent',
  color: 'var(--c-text-2)',
  cursor: 'pointer',
  marginBottom: 12,
};
