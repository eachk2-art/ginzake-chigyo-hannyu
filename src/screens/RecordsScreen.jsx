import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { getRecords } from '../lib/api';
import { formatSlashJP, seasonRangeFromTargets } from '../lib/dateUtils';
import { ErrorMsg, LoadingMsg, EmptyMsg } from '../components/UI';
import BusyButton from '../components/BusyButton';
import { inputStyle, smallBtnStyle } from '../components/FormParts';
import { flattenRecord, detailRows } from '../lib/records';
import { useSticky } from '../lib/sticky';
import { isAdmin } from '../lib/roles';
import { kgText } from '../lib/planUtils';

/**
 * 積込・搬入の全記録（★2026-11-26、太協・管理者）
 * 1行＝1台の車×1つの納品先（積み分けの車は納品先ごとに分かれる）。納品完了の分だけ。
 * 画面は主な列だけの一覧。Excelには全部の列（全記録）と計量明細（1行＝計量1回）を出す。
 * 運賃の列は管理者だけ。
 */
export default function RecordsScreen({ nav }) {
  const { auth } = useAuth();
  const { masters } = useMasters();
  const init = () => seasonRangeFromTargets(masters?.搬入目標 || [], (masters?.海面業者 || []).map((k) => k['海面業者ID']));
  const [from, setFrom] = useSticky('records.from', () => init().from);
  const [to, setTo] = useSticky('records.to', () => init().to);
  const [recs, setRecs] = useState(null);
  const [error, setError] = useState('');
  const [xError, setXError] = useState('');
  const [fIkeba, setFIkeba] = useSticky('records.ikeba', '');
  const [fKaimen, setFKaimen] = useSticky('records.kaimen', '');
  const [fCarrier, setFCarrier] = useSticky('records.carrier', '');

  const load = useCallback(() => {
    if (!from || !to || from > to) return;
    setRecs(null);
    setError('');
    getRecords(auth, from, to)
      .then(setRecs)
      .catch((e) => setError(e.message));
  }, [auth, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  // 平らにした行（と、元の記録）
  const all = useMemo(() => (recs && masters ? recs.map((r) => ({ rec: r, row: flattenRecord(masters, r) })) : null), [recs, masters]);

  const shown = useMemo(() => {
    if (!all) return null;
    return all.filter(({ rec }) => {
      const s = rec.schedule;
      if (fIkeba && s['池場ID'] !== fIkeba) return false;
      if (fKaimen && s['海面業者ID'] !== fKaimen) return false;
      if (fCarrier) {
        const v = (masters?.車輌 || []).find((x) => x['車輌ID'] === s['車輌ID']);
        if (!v || v['運送会社ID'] !== fCarrier) return false;
      }
      return true;
    });
  }, [all, fIkeba, fKaimen, fCarrier, masters]);

  const total = useMemo(() => {
    const t = { n: 0, alloc: 0, weigh: 0, fish: 0 };
    (shown || []).forEach(({ row }) => {
      t.n += 1;
      t.alloc += Number(row.割当数量kg) || 0;
      t.weigh += Number(row.計量合計kg) || 0;
      t.fish += Number(row.尾数_正味) || 0;
    });
    return t;
  }, [shown]);

  async function exportExcel() {
    setXError('');
    try {
      const rows = shown.map((x) => x.row);
      const details = shown.flatMap(({ rec, row }) => detailRows(masters, rec, row));
      const { downloadRecordsExcel } = await import('../lib/recordsExcel');
      await downloadRecordsExcel({
        rows,
        details,
        withFare: isAdmin(auth.role),
        fileName: `積込搬入記録_${from.replace(/-/g, '')}-${to.replace(/-/g, '')}.xlsx`,
      });
    } catch (e) {
      setXError(`Excelの出力に失敗しました：${e.message}`);
    }
  }

  const selectStyle = { ...inputStyle, width: 'auto', minWidth: 120, padding: '8px 10px', fontSize: 14 };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', color: 'var(--c-text)', padding: '14px 12px 40px' }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, margin: '0 4px 10px' }}>積込・搬入の記録</h2>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={selectStyle} />
        <span style={{ color: 'var(--c-text-3)' }}>〜</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={selectStyle} />
        <select value={fIkeba} onChange={(e) => setFIkeba(e.target.value)} style={selectStyle}>
          <option value="">池場：すべて</option>
          {(masters?.池場 || []).map((p) => (
            <option key={p['池場ID']} value={p['池場ID']}>
              {p['池場名']}
            </option>
          ))}
        </select>
        <select value={fKaimen} onChange={(e) => setFKaimen(e.target.value)} style={selectStyle}>
          <option value="">生産者：すべて</option>
          {(masters?.海面業者 || []).map((k) => (
            <option key={k['海面業者ID']} value={k['海面業者ID']}>
              {k['氏名']}
            </option>
          ))}
        </select>
        <select value={fCarrier} onChange={(e) => setFCarrier(e.target.value)} style={selectStyle}>
          <option value="">運送会社：すべて</option>
          {(masters?.運送会社 || []).map((c) => (
            <option key={c['運送会社ID']} value={c['運送会社ID']}>
              {c['略称'] || c['運送会社名']}
            </option>
          ))}
        </select>
        {(fIkeba || fKaimen || fCarrier) && (
          <button
            style={smallBtnStyle}
            onClick={() => {
              setFIkeba('');
              setFKaimen('');
              setFCarrier('');
            }}
          >
            絞り込みを外す
          </button>
        )}
      </div>
      <div style={{ fontSize: 13, color: 'var(--c-text-3)', margin: '0 4px 10px', lineHeight: 1.6 }}>
        納品完了（完了確認済み）の分だけです。1行＝1台の車×1つの納品先で、積み分けの車は納品先ごとに分かれます。
        Excelには、画面の絞り込みどおりに、全部の列（全記録）と計量明細（1行＝計量1回）を出します{isAdmin(auth.role) ? '（運賃の列つき）' : ''}。
      </div>

      {error && <ErrorMsg message={`記録の取得に失敗しました：${error}`} onRetry={load} />}
      {!error && !shown && <LoadingMsg>読み込んでいます…</LoadingMsg>}
      {shown && shown.length === 0 && <EmptyMsg>この期間・条件の、納品完了の記録はありません</EmptyMsg>}

      {shown && shown.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', margin: '4px 4px 10px', fontSize: 15, fontWeight: 700 }}>
            <span>{total.n}件</span>
            <span>割当 {kgText(total.alloc)}kg</span>
            <span>計量 {kgText(total.weigh)}kg</span>
            <span>尾数 {total.fish.toLocaleString()}尾</span>
            <BusyButton onClick={exportExcel}>Excelに出力</BusyButton>
          </div>
          <ErrorMsg message={xError} />
          <div style={{ overflowX: 'auto', border: '1px solid var(--c-border)', borderRadius: 10 }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['積込日', '池場', '生産者', '浜', '車輌', '割当kg', '計量kg', '入れ目率', 'サイズg', '尾数（正味）', '搬入日', '投入後', '積み分け'].map((h) => (
                    <th key={h} style={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map(({ rec, row }) => (
                  <tr key={row.記録ID} onClick={() => nav.openPlan(row.搬入予定ID)} style={{ cursor: 'pointer' }}>
                    <td style={td}>{formatSlashJP(row.積込日)}</td>
                    <td style={td}>{row.池場の表示}</td>
                    <td style={td}>{row.生産者}</td>
                    <td style={td}>{row.浜}</td>
                    <td style={td}>
                      {row.車番}
                      {row.回目 > 1 ? `（${row.回目}回目）` : ''}
                      <span style={{ color: 'var(--c-text-3)', fontSize: 12 }}>　{row.運送会社}</span>
                    </td>
                    <td style={tdNum}>{kgText(row.割当数量kg)}</td>
                    <td style={tdNum}>{row.計量合計kg ? kgText(row.計量合計kg) : ''}</td>
                    <td style={tdNum}>{row.入れ目率_実績 !== '' ? `${row.入れ目率_実績}%` : ''}</td>
                    <td style={tdNum} title={row.サイズの幅}>
                      {row.平均サイズg}
                    </td>
                    <td style={tdNum}>{row.尾数_正味 !== '' ? row.尾数_正味.toLocaleString() : ''}</td>
                    <td style={td}>{row.搬入日 ? formatSlashJP(row.搬入日) : ''}</td>
                    <td style={td}>{row.投入後の状態}</td>
                    <td style={{ ...td, color: 'var(--c-accent)' }}>{rec['運行の割当数'] > 1 ? 'あり' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const th = { border: '1px solid var(--c-border-2)', background: 'var(--c-bg-3)', padding: '6px 8px', fontWeight: 700, whiteSpace: 'nowrap' };
const td = { border: '1px solid var(--c-border-2)', padding: '5px 8px', whiteSpace: 'nowrap' };
const tdNum = { ...td, textAlign: 'right' };
