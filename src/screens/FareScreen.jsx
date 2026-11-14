import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import {
  getFareSummary,
  setScheduleFare,
  setScheduleStandbyFare,
  closeFares,
  reopenFares,
  exportFares,
} from '../lib/api';
import { isAdmin } from '../lib/roles';
import { formatSlashJP, printWithTitle, fileDateStamp } from '../lib/dateUtils';
import { ikebaBaseName, kaimenPersonName, kaimenLocation, vehicleLabel, vehicleWithCarrier } from '../lib/masterLookup';
import BusyButton from '../components/BusyButton';
import { ErrorMsg, LoadingMsg, EmptyMsg } from '../components/UI';

// 月の初日・末日を "yyyy-MM-dd" で返す
function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const p = (n) => String(n).padStart(2, '0');
  return { from: `${y}-${p(m)}-01`, to: `${y}-${p(m)}-${p(last)}` };
}

// "2026-11-01" → "2026/11/1"（シーズンの選択肢の表示用）★2026-11-14
function ymdSlash(str) {
  return String(str || '').split('-').map(Number).join('/');
}

function currentYm() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function FareScreen() {
  const { auth } = useAuth();
  const { masters } = useMasters();
  const admin = isAdmin(auth.role);

  const [periodMode, setPeriodMode] = useState('month'); // month / season
  const [ym, setYm] = useState(currentYm);
  const [seasonId, setSeasonId] = useState('');
  const [qtyMode, setQtyMode] = useState('actual_or_plan'); // actual_or_plan / actual
  const [carrierId, setCarrierId] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // 金額を直す対象の行
  const [message, setMessage] = useState('');

  // シーズンの選択肢は、搬入目標マスタから作る。
  // ★2026-11-14：同じシーズン名は1つにまとめ、期間はいちばん早い開始日〜いちばん遅い終了日にする
  // （海面業者ごとに開始日・終了日が少し違うと、同じ「2026」が2つ並んでしまっていたため）。
  // シーズン名が空欄の行だけは、開始日〜終了日の組み合わせでまとめる
  const seasons = useMemo(() => {
    const map = new Map();
    (masters?.搬入目標 || []).forEach((g) => {
      if (g['削除フラグ'] || !g['開始日'] || !g['終了日']) return;
      const name = (g['シーズン'] || '').trim();
      const key = name ? `name:${name}` : `date:${g['開始日']}_${g['終了日']}`;
      const cur = map.get(key);
      if (!cur) {
        map.set(key, { id: key, from: g['開始日'], to: g['終了日'], name });
      } else {
        if (g['開始日'] < cur.from) cur.from = g['開始日'];
        if (g['終了日'] > cur.to) cur.to = g['終了日'];
      }
    });
    return Array.from(map.values()).sort((a, b) => (a.from < b.from ? 1 : -1));
  }, [masters]);

  const range = useMemo(() => {
    if (periodMode === 'season') {
      const s = seasons.find((x) => x.id === seasonId) || seasons[0];
      return s ? { from: s.from, to: s.to, label: s.name || `${s.from}〜${s.to}` } : null;
    }
    const r = monthRange(ym);
    return { ...r, label: `${ym.replace('-', '年')}月` };
  }, [periodMode, seasonId, seasons, ym]);

  const load = useCallback(() => {
    if (!range) return;
    setData(null);
    setError('');
    getFareSummary(auth, range.from, range.to, qtyMode, carrierId)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [auth, range, qtyMode, carrierId]);

  useEffect(() => {
    load();
  }, [load]);

  // 運送会社ごとにまとめる
  const groups = useMemo(() => {
    if (!data) return [];
    const map = new Map();
    data.rows.forEach((r) => {
      const key = r['運送会社ID'] || '';
      if (!map.has(key)) map.set(key, { carrierId: key, rows: [], qty: 0, fare: 0 });
      const g = map.get(key);
      g.rows.push(r);
      g.qty += Number(r['数量kg']) || 0;
      g.fare += Number(r['精算運賃']) || 0;
    });
    return Array.from(map.values());
  }, [data]);

  const carrierName = (id) => {
    const c = (masters?.運送会社 || []).find((x) => x['運送会社ID'] === id);
    return c ? c['略称'] || c['運送会社名'] : id || '運送会社なし';
  };

  async function handleClose() {
    setError('');
    setMessage('');
    if (!window.confirm(`${range.label} の運賃を締めますか？\n\n締めると、この期間の単価と金額が確定し、単価マスタを直しても変わらなくなります。`)) return;
    try {
      const res = await closeFares(auth, range.from, range.to, qtyMode, range.label);
      setMessage(`締めました（${res['便数']}便・${Number(res['合計運賃']).toLocaleString()}円）`);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleReopen() {
    setError('');
    setMessage('');
    if (!window.confirm('締めを解除しますか？\n\n解除すると、現在の単価マスタで計算し直されます。')) return;
    try {
      await reopenFares(auth, data.closing['運賃締めID']);
      setMessage('締めを解除しました');
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleExport(scope) {
    setError('');
    try {
      const res = await exportFares(auth, range.from, range.to, qtyMode, carrierId, scope, 'xlsx');
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: res.mime }));
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (e) {
      setError(e.message);
    }
  }

  function handlePrint() {
    printWithTitle(`${fileDateStamp('')}_運賃一覧_${range ? range.label : ''}`);
  }

  if (editing) {
    return (
      <FareEditScreen
        auth={auth}
        masters={masters}
        row={editing}
        reasons={data?.reasons || []}
        onSaved={() => {
          setEditing(null);
          load();
        }}
        onClose={() => setEditing(null)}
      />
    );
  }

  return (
    <div style={{ padding: '18px 16px 60px', maxWidth: 1100, margin: '0 auto' }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 20, margin: '4px 0 2px' }}>運送会社別 輸送一覧・運賃</h2>
          <div style={{ fontSize: 13, color: 'var(--c-text-3)' }}>
            {admin ? '金額の修正・締めができます' : '閲覧のみです（金額の修正は管理者）'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <BusyButton variant="ghost" onClick={() => handleExport('all')}>
            Excel（まとめて）
          </BusyButton>
          <BusyButton variant="ghost" onClick={() => handleExport('byCarrier')}>
            Excel（会社ごと）
          </BusyButton>
          <BusyButton variant="ghost" onClick={handlePrint}>
            印刷・PDF
          </BusyButton>
        </div>
      </div>

      <div className="no-print" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', margin: '14px 0' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13, color: 'var(--c-text-3)' }}>期間</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <Toggle active={periodMode === 'month'} onClick={() => setPeriodMode('month')}>
              月別
            </Toggle>
            <Toggle active={periodMode === 'season'} onClick={() => setPeriodMode('season')}>
              シーズン
            </Toggle>
          </div>
        </div>

        {periodMode === 'month' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor="fare-ym" style={{ fontSize: 13, color: 'var(--c-text-3)' }}>
              対象の月
            </label>
            <input id="fare-ym" type="month" value={ym} onChange={(e) => setYm(e.target.value)} style={inputStyle} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor="fare-season" style={{ fontSize: 13, color: 'var(--c-text-3)' }}>
              シーズン
            </label>
            <select
              id="fare-season"
              value={seasons.some((x) => x.id === seasonId) ? seasonId : seasons[0]?.id || ''}
              onChange={(e) => setSeasonId(e.target.value)}
              style={inputStyle}
            >
              {seasons.length === 0 && <option value="">（搬入目標マスタに期間がありません）</option>}
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {/* ★2026-11-14：期間も添えて、何を選んだか分かるようにする */}
                  {s.name ? `${s.name}（${ymdSlash(s.from)}〜${ymdSlash(s.to)}）` : `${ymdSlash(s.from)}〜${ymdSlash(s.to)}`}
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13, color: 'var(--c-text-3)' }}>数量</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <Toggle active={qtyMode === 'actual'} onClick={() => setQtyMode('actual')}>
              実績のみ
            </Toggle>
            <Toggle active={qtyMode === 'actual_or_plan'} onClick={() => setQtyMode('actual_or_plan')}>
              実績＋予定
            </Toggle>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label htmlFor="fare-carrier" style={{ fontSize: 13, color: 'var(--c-text-3)' }}>
            運送会社
          </label>
          <select id="fare-carrier" value={carrierId} onChange={(e) => setCarrierId(e.target.value)} style={inputStyle}>
            <option value="">すべて</option>
            {(masters?.運送会社 || [])
              .filter((c) => !c['削除フラグ'])
              .map((c) => (
                <option key={c['運送会社ID']} value={c['運送会社ID']}>
                  {c['略称'] || c['運送会社名']}
                </option>
              ))}
          </select>
        </div>
      </div>

      <ErrorMsg message={error} />
      {message && <div style={{ color: 'var(--c-ok)', fontSize: 14, marginBottom: 10 }}>{message}</div>}
      {!error && data === null && <LoadingMsg>読み込んでいます…</LoadingMsg>}

      {data && (
        <div className="print-area">
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>
            運賃一覧　{range.label}
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <Card label="便数" value={`${data.totals['便数']}便`} />
            <Card label="数量合計" value={`${Number(data.totals['数量kg']).toLocaleString()}kg`} />
            <Card label="精算運賃" value={`${Number(data.totals['精算運賃']).toLocaleString()}円`} />
            {admin && Number(data.totals['差額']) !== 0 && (
              <Card
                label="自動計算との差"
                value={`${Number(data.totals['差額']) > 0 ? '+' : ''}${Number(data.totals['差額']).toLocaleString()}円`}
              />
            )}
            {Number(data.totals['単価未登録']) > 0 && (
              <Card label="単価が未登録" value={`${data.totals['単価未登録']}便`} warn />
            )}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              background: data.closing ? 'var(--c-ok-bg)' : 'var(--c-bg-2)',
              border: `1px solid ${data.closing ? 'var(--c-ok)' : 'var(--c-border)'}`,
              borderRadius: 10,
              padding: '10px 14px',
              marginBottom: 14,
            }}
          >
            <span style={{ fontSize: 14, color: data.closing ? 'var(--c-ok)' : 'var(--c-text-2)' }}>
              {data.closing
                ? `確定済み（${data.closing['名称'] || `${data.closing['開始日']}〜${data.closing['終了日']}`}）`
                : 'この期間はまだ締めていません'}
            </span>
            {admin && (
              <span className="no-print">
                {data.closing ? (
                  <BusyButton variant="ghost" onClick={handleReopen}>
                    締めを解除する
                  </BusyButton>
                ) : (
                  <BusyButton onClick={handleClose}>この期間を締める</BusyButton>
                )}
              </span>
            )}
          </div>

          {data.rows.length === 0 && <EmptyMsg>この期間の予定はありません</EmptyMsg>}

          {groups.map((g) => (
            <div key={g.carrierId || 'none'} style={{ marginBottom: 18 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--c-ok-bg)',
                  color: 'var(--c-ok)',
                  border: '1px solid var(--c-border)',
                  borderRadius: '10px 10px 0 0',
                  padding: '10px 14px',
                  fontSize: 15,
                  fontWeight: 700,
                }}
              >
                <span>{carrierName(g.carrierId)}</span>
                <span>
                  {g.rows.length}便・{g.qty.toLocaleString()}kg・{g.fare.toLocaleString()}円
                </span>
              </div>

              <table style={tableStyle}>
                <colgroup>
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '14%' }} />
                  {admin && <col style={{ width: '10%' }} />}
                  <col style={{ width: admin ? '23%' : '33%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={thStyle}>積込日</th>
                    <th style={thStyle}>車輌・池場</th>
                    <th style={thStyle}>納品先</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>数量kg</th>
                    {admin && <th style={{ ...thStyle, textAlign: 'right' }}>単価</th>}
                    <th style={{ ...thStyle, textAlign: 'right' }}>運賃</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => {
                    const adjusted = r['請求運賃'] !== '';
                    return (
                      <tr
                        key={r['積込予定ID']}
                        onClick={admin && !data.closing ? () => setEditing(r) : undefined}
                        style={{ cursor: admin && !data.closing ? 'pointer' : 'default' }}
                      >
                        <td style={tdStyle}>
                          <div>{formatSlashJP(r['積込日'])}</div>
                          <div style={subStyle}>
                            {r['数量種別']}
                            {r['取消'] ? '・取消' : ''}
                            {r['中止'] && r['中止理由'] ? `・${r['中止理由']}` : ''}
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <div>{vehicleLabel(masters, r['車輌ID'])}</div>
                          <div style={subStyle}>{ikebaBaseName(masters, r['池場ID'])}</div>
                        </td>
                        <td style={tdStyle}>
                          <div>{kaimenPersonName(masters, r['海面業者ID'])}</div>
                          <div style={subStyle}>{kaimenLocation(masters, r['海面業者ID'])}</div>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          {Number(r['数量kg']).toLocaleString()}
                        </td>
                        {admin && (
                          <td style={{ ...tdStyle, textAlign: 'right' }}>
                            {r['単価未登録'] ? (
                              <span style={{ color: 'var(--c-warn)' }}>未登録</span>
                            ) : r['計算方法'] === '1車単価' ? (
                              // ★2026-11-14：1車単価
                              <>
                                <div>1車</div>
                                <div style={subStyle}>
                                  {r['1車単価'] !== '' ? `${Number(r['1車単価']).toLocaleString()}円` : ''}
                                </div>
                              </>
                            ) : (
                              r['kg単価']
                            )}
                          </td>
                        )}
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <div style={{ fontWeight: 700 }}>
                            {r['精算運賃'] === '' ? '―' : `${Number(r['精算運賃']).toLocaleString()}円`}
                          </div>
                          {r['計算できない理由'] && (
                            <div style={{ ...subStyle, color: 'var(--c-warn)' }}>{r['計算できない理由']}</div>
                          )}
                          {/* 1車単価の按分（★2026-11-14） */}
                          {r['按分'] && <div style={subStyle}>{r['按分']}</div>}
                          {/* 中止便は待機料が精算額になる（★2026-11-06） */}
                          {r['中止'] && r['待機料'] !== '' && (
                            <div style={{ ...subStyle, color: '#5e35b1' }}>待機料</div>
                          )}
                          {adjusted && !r['中止'] && (
                            <div style={{ ...subStyle, color: 'var(--c-warn)' }}>
                              調整{r['調整理由'] ? `：${r['調整理由']}` : ''}
                              {r['自動運賃'] !== '' && `（自動 ${Number(r['自動運賃']).toLocaleString()}円）`}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}

          {data.rows.length > 0 && (
            <div style={{ textAlign: 'right', marginTop: 10 }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>
                合計 {Number(data.totals['精算運賃']).toLocaleString()}円
              </div>
              {Number(data.totals['中止便数']) > 0 && (
                <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginTop: 2 }}>
                  うち中止 {data.totals['中止便数']}便・待機料 {Number(data.totals['待機料']).toLocaleString()}円
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 1便の金額を直す画面（管理者のみ）
function FareEditScreen({ auth, masters, row, reasons, onSaved, onClose }) {
  const [fare, setFare] = useState(row['請求運賃'] || '');
  const [reason, setReason] = useState(row['調整理由'] || '');
  const [note, setNote] = useState(row['調整メモ'] || '');
  const [standby, setStandby] = useState(row['待機料'] || '');
  const [error, setError] = useState('');
  // 中止便は、運賃ではなく待機料を入力する（★2026-11-06）
  const stopped = !!row['中止'];

  const vehicle = (masters?.車輌 || []).find((v) => v['車輌ID'] === row['車輌ID']);
  const maxLoad = Number(vehicle?.['最大積載数量kg']) || 0;
  const price = Number(row['kg単価']) || 0;
  const fullFare = maxLoad > 0 && price > 0 ? Math.round(maxLoad * price) : 0;

  async function save() {
    setError('');
    try {
      if (stopped) {
        await setScheduleStandbyFare(auth, row['積込予定ID'], standby, '', reason, note);
      } else {
        await setScheduleFare(auth, row['積込予定ID'], fare, reason, note);
      }
      onSaved();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div style={{ padding: '18px 16px 60px', maxWidth: 560, margin: '0 auto' }}>
      <h2 style={{ fontSize: 19, margin: '4px 0 12px' }}>{stopped ? '待機料の入力（中止便）' : '運賃の調整'}</h2>

      <div style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border)', borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontSize: 14, lineHeight: 1.8 }}>
        <div>
          {formatSlashJP(row['積込日'])}　{vehicleWithCarrier(masters, row['車輌ID'])}
        </div>
        <div>
          {ikebaBaseName(masters, row['池場ID'])} → {kaimenPersonName(masters, row['海面業者ID'])}
        </div>
        <div>
          数量 {Number(row['数量kg']).toLocaleString()}kg（{row['数量種別']}）　
          {row['計算方法'] === '1車単価'
            ? `1車単価 ${row['1車単価'] !== '' ? Number(row['1車単価']).toLocaleString() + '円' : ''}${row['按分'] ? `（${row['按分']}）` : ''}`
            : row['kg単価']
              ? `単価 ${row['kg単価']}円`
              : '単価未登録'}　
          {row['自動運賃'] !== '' ? `自動計算 ${Number(row['自動運賃']).toLocaleString()}円` : ''}
        </div>
        {stopped && (
          <div style={{ color: '#5e35b1' }}>
            この便は中止です{row['中止理由'] ? `（${row['中止理由']}）` : ''}。運賃は計算せず、待機料だけを入力します。
          </div>
        )}
      </div>

      {stopped && (
        <div style={{ marginBottom: 14 }}>
          <label
            htmlFor="standby-input"
            style={{ fontSize: 14, color: 'var(--c-text-2)', display: 'block', marginBottom: 4 }}
          >
            待機料（円）
          </label>
          <input
            id="standby-input"
            type="number"
            inputMode="numeric"
            value={standby}
            onChange={(e) => setStandby(e.target.value)}
            placeholder="発生しない場合は空欄"
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>
      )}

      <div style={{ marginBottom: 14, display: stopped ? 'none' : 'block' }}>
        <label htmlFor="fare-input" style={{ fontSize: 14, color: 'var(--c-text-2)', display: 'block', marginBottom: 4 }}>
          請求運賃（円）
        </label>
        <input
          id="fare-input"
          type="number"
          inputMode="numeric"
          value={fare}
          onChange={(e) => setFare(e.target.value)}
          placeholder={row['自動運賃'] !== '' ? `空欄なら自動計算 ${row['自動運賃']}円` : '空欄なら計算なし'}
          style={{ ...inputStyle, width: '100%' }}
        />
        {fullFare > 0 && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--c-text-3)' }}>
              満車（{maxLoad.toLocaleString()}kg）なら {fullFare.toLocaleString()}円
            </span>
            <button
              type="button"
              onClick={() => setFare(String(fullFare))}
              style={{ minHeight: 42, padding: '6px 12px', fontSize: 13, borderRadius: 8, border: '1px solid var(--c-border-2)', background: 'transparent', color: 'var(--c-text-2)', cursor: 'pointer' }}
            >
              この金額を入れる
            </button>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 14 }}>
        <label htmlFor="fare-reason" style={{ fontSize: 14, color: 'var(--c-text-2)', display: 'block', marginBottom: 4 }}>
          調整理由
        </label>
        <select id="fare-reason" value={reason} onChange={(e) => setReason(e.target.value)} style={{ ...inputStyle, width: '100%' }}>
          <option value="">（なし）</option>
          {reasons.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label htmlFor="fare-note" style={{ fontSize: 14, color: 'var(--c-text-2)', display: 'block', marginBottom: 4 }}>
          メモ
        </label>
        <textarea
          id="fare-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          style={{ ...inputStyle, width: '100%', resize: 'vertical' }}
        />
      </div>

      <ErrorMsg message={error} />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <BusyButton onClick={save}>保存</BusyButton>
        <BusyButton variant="ghost" onClick={onClose}>
          閉じる
        </BusyButton>
      </div>
    </div>
  );
}

function Toggle({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: 42,
        padding: '6px 14px',
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 600,
        border: '1px solid var(--c-border-2)',
        background: active ? 'var(--c-accent)' : 'transparent',
        color: active ? '#03202e' : 'var(--c-text)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function Card({ label, value, warn }) {
  return (
    <div
      style={{
        background: warn ? 'var(--c-warn-bg)' : 'var(--c-bg-2)',
        border: `1px solid ${warn ? 'var(--c-warn)' : 'var(--c-border)'}`,
        borderRadius: 10,
        padding: '10px 16px',
        minWidth: 130,
      }}
    >
      <div style={{ fontSize: 12, color: warn ? 'var(--c-warn)' : 'var(--c-text-3)' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2, color: warn ? 'var(--c-warn)' : 'var(--c-text)' }}>{value}</div>
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
  boxSizing: 'border-box',
};

const tableStyle = {
  width: '100%',
  tableLayout: 'fixed',
  borderCollapse: 'collapse',
  fontSize: 15,
  background: 'var(--c-bg-2)',
  border: '1px solid var(--c-border)',
};

const thStyle = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: '2px solid var(--c-border-2)',
  color: 'var(--c-text)',
  fontSize: 13,
  fontWeight: 700,
};

const tdStyle = {
  padding: '8px 10px',
  borderBottom: '1px solid var(--c-border)',
  color: 'var(--c-text)',
  verticalAlign: 'top',
};

const subStyle = {
  fontSize: 12,
  color: 'var(--c-text-3)',
  marginTop: 2,
};
