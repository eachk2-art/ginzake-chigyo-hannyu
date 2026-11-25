import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { getSeasonPlan, saveSeasonPlan } from '../lib/api';
import { ErrorMsg, LoadingMsg } from '../components/UI';
import BusyButton from '../components/BusyButton';
import { Field, inputStyle, smallBtnStyle } from '../components/FormParts';
import { num } from '../lib/planUtils';
import { pondNameOnly } from '../lib/masterLookup';
import { useSticky } from '../lib/sticky';
import {
  cellKey,
  lineKey,
  lineName,
  sortLines,
  seasonRange,
  seasonTargets,
  vaccineOf,
  tText,
} from '../lib/seasonPlan';

const DEFAULT_SEASON = '2026年秋';

/**
 * 浜池別搬入予定（★2026-11-25、太協・管理者）
 * シーズンの最初に、どの生産者へ、どの池場（元の池）から何t割り振るかを考える表。
 * ・1行目：池場の出荷予定数量（その池場から出せる量）
 * ・生産者の行：割り振り。下に小さく「予定に入れた数量」（搬入予定の合計）を出す
 * ・右：生産者ごとの合計・ワクチン本数（250kgに1本）・搬入目標
 * ・下：池場ごとの割り振りの小計と残り
 */
export default function SeasonPlanScreen() {
  const { auth } = useAuth();
  const { masters } = useMasters();
  const [season, setSeason] = useSticky('season.name', DEFAULT_SEASON);
  const [seasonInput, setSeasonInput] = useState(season);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [values, setValues] = useState({}); // cellKey → 入力中の文字列（t）
  const [savedSnap, setSavedSnap] = useState('');
  const [extraLines, setExtraLines] = useState([]); // 画面で足した池場の行（元の池つき）
  const [saveError, setSaveError] = useState('');
  const [addIkeba, setAddIkeba] = useState('');
  const [addOrigin, setAddOrigin] = useState('');

  const range = useMemo(() => seasonRange(masters, season), [masters, season]);
  const targets = useMemo(() => seasonTargets(masters, season), [masters, season]);

  const load = useCallback(async () => {
    setError('');
    setData(null);
    try {
      const d = await getSeasonPlan(auth, season, range?.from, range?.to);
      setData(d);
      const v = {};
      (d.rows || []).forEach((r) => {
        v[cellKey(r['海面業者ID'], r['池場ID'], r['由来池場ID'])] = tText(r['予定数量kg']);
      });
      setValues(v);
      setSavedSnap(JSON.stringify(v));
      setExtraLines([]);
    } catch (e) {
      setError(e.message);
    }
  }, [auth, season, range]);

  useEffect(() => {
    if (masters) load();
  }, [load, masters]);

  // 列（池場の行）：マスタの全池場＋保存済み・予定にある「元の池つき」＋画面で足したもの
  const lines = useMemo(() => {
    const map = new Map();
    (masters?.池場 || []).forEach((p) => map.set(lineKey(p['池場ID'], ''), { ikeba: p['池場ID'], origin: '' }));
    const add = (ikeba, origin) => {
      const o = origin && origin !== ikeba ? origin : '';
      map.set(lineKey(ikeba, o), { ikeba, origin: o });
    };
    (data?.rows || []).forEach((r) => add(r['池場ID'], r['由来池場ID']));
    (data?.actual || []).forEach((r) => add(r['池場ID'], r['由来池場ID']));
    extraLines.forEach((l) => add(l.ikeba, l.origin));
    return sortLines(masters, Array.from(map.values()));
  }, [masters, data, extraLines]);

  const actual = useMemo(() => {
    const m = {};
    (data?.actual || []).forEach((r) => {
      m[cellKey(r['海面業者ID'], r['池場ID'], r['由来池場ID'])] = num(r['予定数量kg']);
    });
    return m;
  }, [data]);

  const kaimens = masters?.海面業者 || [];
  const kgOf = (k) => num(values[k]) * 1000;
  const isSaved = savedSnap === JSON.stringify(values);

  function setCell(k, v) {
    setValues((x) => ({ ...x, [k]: v }));
  }

  async function save() {
    setSaveError('');
    const rows = [];
    Object.entries(values).forEach(([k, v]) => {
      if (String(v ?? '').trim() === '') return;
      if (isNaN(Number(v))) return;
      const [kaimen, ikeba, origin] = k.split('|');
      rows.push({ 海面業者ID: kaimen, 池場ID: ikeba, 由来池場ID: origin, 予定数量kg: String(Math.round(Number(v) * 1000 * 10) / 10) });
    });
    const bad = Object.values(values).find((v) => String(v ?? '').trim() !== '' && isNaN(Number(v)));
    if (bad !== undefined) {
      setSaveError(`数値でない入力があります：${bad}`);
      return;
    }
    try {
      await saveSeasonPlan(auth, season, rows);
      await load();
    } catch (e) {
      setSaveError(e.message);
    }
  }

  async function exportExcel() {
    setSaveError('');
    try {
      const kgValues = {};
      Object.keys(values).forEach((k) => (kgValues[k] = kgOf(k)));
      const { downloadSeasonPlanExcel } = await import('../lib/seasonPlanExcel');
      await downloadSeasonPlanExcel({ masters, season, lines, values: kgValues, fileName: `浜池別搬入予定_${season}.xlsx` });
    } catch (e) {
      setSaveError(`Excelの出力に失敗しました：${e.message}`);
    }
  }

  const ship = (masters?.池場 || []).find((p) => p['池場ID'] === addIkeba);
  const originChoices = ship ? (masters?.池場 || []).filter((p) => p['池場ID'] !== addIkeba && p['内水面業者ID'] === ship['内水面業者ID']) : [];

  // 集計
  const colSum = lines.map((l) => kaimens.reduce((s, k) => s + kgOf(cellKey(k['海面業者ID'], l.ikeba, l.origin)), 0));
  const seasons = Array.from(new Set([DEFAULT_SEASON, ...(data?.seasons || []), season]));

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', color: 'var(--c-text)', padding: '14px 12px 40px' }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, margin: '0 4px 10px' }}>浜池別搬入予定</h2>

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 8 }}>
        <Field label="シーズン" style={{ marginBottom: 0 }}>
          <select
            value={season}
            onChange={(e) => {
              setSeason(e.target.value);
              setSeasonInput(e.target.value);
            }}
            style={{ ...inputStyle, width: 180 }}
          >
            {seasons.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="新しいシーズン名" style={{ marginBottom: 0 }}>
          <input value={seasonInput} onChange={(e) => setSeasonInput(e.target.value)} style={{ ...inputStyle, width: 160 }} />
        </Field>
        <button style={smallBtnStyle} onClick={() => seasonInput.trim() && setSeason(seasonInput.trim())}>
          このシーズンを開く
        </button>
      </div>
      <div style={{ fontSize: 13, color: 'var(--c-text-3)', margin: '0 4px 12px', lineHeight: 1.6 }}>
        {range
          ? `「予定」は、${range.from}〜${range.to}（搬入目標マスタのこのシーズンの期間）に登録した搬入予定の合計です。`
          : '搬入目標マスタにこのシーズンの期間が無いため、「予定」（登録した搬入予定の合計）は出ません。'}
        数量の単位は t です。
      </div>

      {error && <ErrorMsg message={`読み込みに失敗しました：${error}`} onRetry={load} />}
      {!error && !data && <LoadingMsg>読み込んでいます…</LoadingMsg>}

      {data && (
        <>
          <div style={{ overflowX: 'auto', border: '1px solid var(--c-border)', borderRadius: 10 }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ ...th, position: 'sticky', left: 0, zIndex: 2, minWidth: 110 }} />
                  {lines.map((l) => (
                    <th key={lineKey(l.ikeba, l.origin)} style={th}>
                      {lineName(masters, l.ikeba, l.origin)}
                    </th>
                  ))}
                  <th style={th}>計</th>
                  <th style={th}>ワクチン</th>
                  <th style={th}>目標</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ background: 'var(--c-bg-3)' }}>
                  <td style={{ ...rowHead, background: 'var(--c-bg-3)' }}>池場の出荷予定</td>
                  {lines.map((l) => {
                    const k = cellKey('', l.ikeba, l.origin);
                    return (
                      <td key={k} style={td}>
                        <CellInput value={values[k] ?? ''} onChange={(v) => setCell(k, v)} />
                      </td>
                    );
                  })}
                  <td style={{ ...td, fontWeight: 700 }}>{tText(lines.reduce((s, l) => s + kgOf(cellKey('', l.ikeba, l.origin)), 0))}</td>
                  <td style={td} />
                  <td style={td} />
                </tr>
                {kaimens.map((k) => {
                  const id = k['海面業者ID'];
                  let sum = 0;
                  let vac = 0;
                  let act = 0;
                  lines.forEach((l) => {
                    const kg = kgOf(cellKey(id, l.ikeba, l.origin));
                    sum += kg;
                    vac += vaccineOf(kg);
                    act += actual[cellKey(id, l.ikeba, l.origin)] || 0;
                  });
                  const target = targets[id] || 0;
                  return (
                    <tr key={id}>
                      <td style={rowHead}>{k['氏名']}</td>
                      {lines.map((l) => {
                        const ck = cellKey(id, l.ikeba, l.origin);
                        const a = actual[ck] || 0;
                        const planned = kgOf(ck);
                        return (
                          <td key={ck} style={td}>
                            <CellInput value={values[ck] ?? ''} onChange={(v) => setCell(ck, v)} />
                            {a > 0 && (
                              <div style={{ fontSize: 11, marginTop: 2, color: Math.abs(a - planned) < 1 ? 'var(--c-ok)' : 'var(--c-warn)' }}>
                                予定 {tText(a)}
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td style={{ ...td, fontWeight: 700 }}>
                        {tText(sum)}
                        {act > 0 && <div style={{ fontSize: 11, color: 'var(--c-text-3)' }}>予定 {tText(act)}</div>}
                      </td>
                      <td style={td}>{vac > 0 ? `${vac}本` : ''}</td>
                      <td style={{ ...td, color: target > 0 && Math.abs(target - sum) >= 1 ? 'var(--c-warn)' : 'var(--c-text-2)' }}>{tText(target)}</td>
                    </tr>
                  );
                })}
                <tr style={{ background: 'var(--c-bg-3)' }}>
                  <td style={{ ...rowHead, background: 'var(--c-bg-3)' }}>小計</td>
                  {colSum.map((kg, i) => (
                    <td key={i} style={{ ...td, fontWeight: 700 }}>
                      {tText(kg)}
                    </td>
                  ))}
                  <td style={{ ...td, fontWeight: 700 }}>{tText(colSum.reduce((s, x) => s + x, 0))}</td>
                  <td style={td}>{(() => {
                    const v = kaimens.reduce((s, k) => s + lines.reduce((t, l) => t + vaccineOf(kgOf(cellKey(k['海面業者ID'], l.ikeba, l.origin))), 0), 0);
                    return v > 0 ? `${v}本` : '';
                  })()}</td>
                  <td style={td}>{tText(Object.values(targets).reduce((s, x) => s + x, 0))}</td>
                </tr>
                <tr>
                  <td style={rowHead}>残（出荷予定−小計）</td>
                  {lines.map((l, i) => {
                    const sup = kgOf(cellKey('', l.ikeba, l.origin));
                    const rest = sup - colSum[i];
                    return (
                      <td key={i} style={{ ...td, fontWeight: 700, color: rest < 0 ? 'var(--c-danger)' : 'var(--c-text-2)' }}>
                        {sup > 0 ? (Math.round(rest / 10) / 100).toString() : ''}
                      </td>
                    );
                  })}
                  <td style={td} />
                  <td style={td} />
                  <td style={td} />
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', margin: '12px 4px' }}>
            <Field label="列を足す（元の池つき）：出荷池" style={{ marginBottom: 0 }}>
              <select
                value={addIkeba}
                onChange={(e) => {
                  setAddIkeba(e.target.value);
                  setAddOrigin('');
                }}
                style={{ ...inputStyle, width: 160 }}
              >
                <option value="">選択</option>
                {(masters?.池場 || []).map((p) => (
                  <option key={p['池場ID']} value={p['池場ID']}>
                    {pondNameOnly(p['池場名'])}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="元の池" style={{ marginBottom: 0 }}>
              <select value={addOrigin} onChange={(e) => setAddOrigin(e.target.value)} style={{ ...inputStyle, width: 140 }} disabled={!addIkeba}>
                <option value="">選択</option>
                {originChoices.map((p) => (
                  <option key={p['池場ID']} value={p['池場ID']}>
                    {pondNameOnly(p['池場名'])}
                  </option>
                ))}
              </select>
            </Field>
            <button
              style={smallBtnStyle}
              disabled={!addIkeba || !addOrigin}
              onClick={() => {
                setExtraLines((x) => [...x, { ikeba: addIkeba, origin: addOrigin }]);
                setAddIkeba('');
                setAddOrigin('');
              }}
            >
              列を足す
            </button>
          </div>

          <ErrorMsg message={saveError} />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '8px 4px' }}>
            <BusyButton onClick={save} done={isSaved}>
              保存
            </BusyButton>
            <BusyButton variant="ghost" onClick={exportExcel}>
              Excelをダウンロード（搬入予定表・一覧）
            </BusyButton>
          </div>
          {!isSaved && <div style={{ fontSize: 13, color: 'var(--c-warn)', margin: '0 4px' }}>保存していない変更があります。Excelには、画面の今の数字が出ます。</div>}
        </>
      )}
    </div>
  );
}

function CellInput({ value, onChange }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step="0.5"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: 64,
        padding: '6px 6px',
        fontSize: 14,
        textAlign: 'right',
        borderRadius: 6,
        border: '1px solid var(--c-border-2)',
        background: 'var(--c-bg)',
        color: 'var(--c-text)',
      }}
    />
  );
}

const th = { border: '1px solid var(--c-border-2)', background: 'var(--c-bg-3)', padding: '6px 8px', fontWeight: 700, whiteSpace: 'nowrap' };
const td = { border: '1px solid var(--c-border-2)', padding: '4px 6px', textAlign: 'center', verticalAlign: 'top', whiteSpace: 'nowrap' };
const rowHead = { ...td, textAlign: 'left', fontWeight: 700, position: 'sticky', left: 0, background: 'var(--c-bg-2)', zIndex: 1 };
