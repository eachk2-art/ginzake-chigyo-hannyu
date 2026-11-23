import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { bulkEditSchedules } from '../lib/api';
import BusyButton from './BusyButton';
import { ErrorMsg } from './UI';
import { vehicleWithCarrier } from '../lib/masterLookup';

/**
 * 予定をまとめて修正するパネル（★2026-11-23、管理者のみ）。
 * ・同じ納品先の便から選んで、積込日の変更／池場の変更／車輌を未定に／取消／取消予定の削除 をまとめて行う
 * ・積込日・池場の変更と「車輌を未定に」は、実績のある便と取消・中止の便を飛ばす（サーバー側で判定）
 * ・積込日・池場を変えた便は、移した先の積込順の最後に並ぶ（そのため、この画面の一覧からは消える）
 */
export default function BulkEditPanel({ schedules, onDone }) {
  const { auth } = useAuth();
  const { masters } = useMasters();

  const [checked, setChecked] = useState(() => new Set());
  const [newDate, setNewDate] = useState('');
  const [newIkeba, setNewIkeba] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [resultMsg, setResultMsg] = useState('');

  // 一覧が読み直されたら、もう無い便のチェックは外す
  useEffect(() => {
    const ids = new Set(schedules.map((s) => s['積込予定ID']));
    setChecked((prev) => new Set([...prev].filter((id) => ids.has(id))));
  }, [schedules]);

  function toggle(id) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAll(on) {
    setChecked(on ? new Set(schedules.map((s) => s['積込予定ID'])) : new Set());
  }

  async function run(op, label, { value, confirmText } = {}) {
    setError('');
    setResultMsg('');
    const ids = schedules.map((s) => s['積込予定ID']).filter((id) => checked.has(id));
    if (ids.length === 0) return setError('修正する便を選んでください');
    if (!window.confirm(`選んだ${ids.length}便を${confirmText || label}します。よろしいですか？`)) return;
    try {
      const res = await bulkEditSchedules(auth, ids, op, value || '', op === 'cancel' ? reason : '');
      const done = res.outcomes.filter((o) => o.status.indexOf('スキップ') !== 0);
      const skipped = res.outcomes.filter((o) => o.status.indexOf('スキップ') === 0);
      const why = Array.from(new Set(skipped.map((o) => o.status.replace(/^スキップ（|）$/g, '')))).join('・');
      setResultMsg(`${label}：${done.length}件${skipped.length ? `（${skipped.length}件はスキップ：${why}）` : ''}`);
      if (op === 'cancel') setReason('');
      onDone?.();
    } catch (e) {
      setError(e.message);
    }
  }

  const sectionStyle = { marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--c-border-2)' };

  return (
    <div
      style={{
        margin: '0 16px 10px 28px',
        padding: 14,
        borderRadius: 10,
        border: '1px solid var(--c-border-2)',
        background: 'var(--c-bg)',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text-2)', marginBottom: 4 }}>
        予定をまとめて修正（管理者）
      </div>
      <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginBottom: 10, lineHeight: 1.6 }}>
        修正する便にチェックを入れてから、下の操作を選んでください。
        積込日・池場の変更と「車輌を未定に」は、実績が入っている便と、取消・中止の便には反映されません。
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button type="button" onClick={() => selectAll(true)} style={smallBtn}>すべて選ぶ</button>
        <button type="button" onClick={() => selectAll(false)} style={smallBtn}>選択を外す</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {schedules.map((s) => {
          const id = s['積込予定ID'];
          const st = s['ステータス'];
          return (
            <label
              key={id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '8px 10px',
                border: '1px solid var(--c-border-2)',
                borderRadius: 8,
                cursor: 'pointer',
                background: checked.has(id) ? 'var(--c-bg-3)' : 'transparent',
              }}
            >
              <input
                type="checkbox"
                checked={checked.has(id)}
                onChange={() => toggle(id)}
                style={{ width: 20, height: 20, marginTop: 2 }}
              />
              <span style={{ fontSize: 14 }}>
                <span style={{ fontWeight: 600 }}>{vehicleWithCarrier(masters, s['車輌ID'])}</span>
                <span style={{ color: 'var(--c-text-3)' }}>
                  　{(Number(s['予定数量kg']) || 0).toLocaleString()}kg　{st}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {/* 積込日の変更 */}
      <div style={sectionStyle}>
        <div style={labelStyle}>積込日を変更</div>
        <div style={rowStyle}>
          <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} style={inputStyle} />
          <BusyButton
            variant="ghost"
            disabled={!newDate}
            onClick={() => run('moveDate', '積込日の変更', { value: newDate, confirmText: `積込日 ${newDate} に変更` })}
          >
            積込日を変更する
          </BusyButton>
        </div>
      </div>

      {/* 池場の変更 */}
      <div style={sectionStyle}>
        <div style={labelStyle}>池場（内水面の場所）を変更</div>
        <div style={rowStyle}>
          <select value={newIkeba} onChange={(e) => setNewIkeba(e.target.value)} style={inputStyle}>
            <option value="">選択してください</option>
            {(masters?.池場 || [])
              .filter((p) => !p['削除フラグ'])
              .map((p) => (
                <option key={p['池場ID']} value={p['池場ID']}>
                  {p['池場名']}
                </option>
              ))}
          </select>
          <BusyButton
            variant="ghost"
            disabled={!newIkeba}
            onClick={() => {
              const name = (masters?.池場 || []).find((p) => p['池場ID'] === newIkeba)?.['池場名'] || newIkeba;
              run('changeIkeba', '池場の変更', { value: newIkeba, confirmText: `池場「${name}」に変更` });
            }}
          >
            池場を変更する
          </BusyButton>
        </div>
        <div style={noteStyle}>元の池（由来）が新しい池場と合わなくなった便は、元の池を空欄にします</div>
      </div>

      {/* 車輌を未定に */}
      <div style={sectionStyle}>
        <div style={labelStyle}>車輌を未定にする</div>
        <BusyButton variant="ghost" onClick={() => run('clearVehicle', '車輌を未定に', { confirmText: '車輌未定に' })}>
          車輌を未定にする
        </BusyButton>
      </div>

      {/* 取消 */}
      <div style={sectionStyle}>
        <div style={labelStyle}>予定を取消にする</div>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="取消の理由（任意。備考に入ります）"
          style={{ ...inputStyle, width: '100%', marginBottom: 8 }}
        />
        <BusyButton variant="danger" onClick={() => run('cancel', '取消', { confirmText: '取消に' })}>
          選んだ便を取消にする
        </BusyButton>
        <div style={noteStyle}>納品完了の便は取消になりません</div>
      </div>

      {/* 取消予定の削除 */}
      <div style={sectionStyle}>
        <div style={labelStyle}>取消にした予定を削除</div>
        <BusyButton
          variant="danger"
          onClick={() => run('delete', '取消予定の削除', { confirmText: '一覧から削除（取消の便だけ。データはデータベースに残ります）' })}
        >
          選んだ取消予定を削除する
        </BusyButton>
        <div style={noteStyle}>削除できるのは、取消にした便で、実績が入っていないものだけです</div>
      </div>

      {resultMsg && <div style={{ fontSize: 13, color: 'var(--c-ok)', marginTop: 12 }}>✓ {resultMsg}</div>}
      <ErrorMsg message={error} />
    </div>
  );
}

const labelStyle = { fontSize: 14, color: 'var(--c-text-2)', marginBottom: 6, fontWeight: 600 };
const rowStyle = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' };
const noteStyle = { fontSize: 12, color: 'var(--c-text-3)', marginTop: 6 };
const inputStyle = {
  padding: '10px 12px',
  fontSize: 15,
  borderRadius: 8,
  border: '1px solid var(--c-border-2)',
  background: 'var(--c-bg-2)',
  color: 'var(--c-text)',
  boxSizing: 'border-box',
};
const smallBtn = {
  minHeight: 36,
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid var(--c-border-2)',
  background: 'transparent',
  color: 'var(--c-text-2)',
  fontSize: 13,
  cursor: 'pointer',
};
