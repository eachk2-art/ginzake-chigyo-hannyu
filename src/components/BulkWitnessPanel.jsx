import { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { bulkSetWitness } from '../lib/api';
import BusyButton from './BusyButton';
import { ErrorMsg } from './UI';
import { tantoushaName } from '../lib/masterLookup';

const KEEP = '__KEEP__';
const OTHER = '__OTHER__';

/**
 * 立会者をまとめて変更するパネル（★2026-11-12、管理者のみ）。
 * ・同じ納品先の便から、変更したい便を選んで、内水面立会者・海面立会者をまとめて書き換える
 * ・予定の立会者に加え、積込実績・搬入実績がすでにあれば、その立会者も書き換える（サーバー側で処理）
 * ・取消・中止の便は選べない
 */
export default function BulkWitnessPanel({ schedules, onDone }) {
  const { auth } = useAuth();
  const { masters } = useMasters();
  const taikyoTantousha = useMemo(
    () => (masters?.担当者 || []).filter((t) => t['区分'] === '太協担当'),
    [masters]
  );
  const vehicleOf = (id) => (masters?.車輌 || []).find((v) => v['車輌ID'] === id);

  const selectable = schedules.filter((s) => s['予定状態'] !== '取消' && s['予定状態'] !== '中止');
  const [checked, setChecked] = useState(() => new Set(selectable.map((s) => s['積込予定ID'])));
  const [naiSel, setNaiSel] = useState(KEEP);
  const [naiFree, setNaiFree] = useState('');
  const [kaiSel, setKaiSel] = useState(KEEP);
  const [kaiFree, setKaiFree] = useState('');
  const [error, setError] = useState('');
  const [resultMsg, setResultMsg] = useState('');

  function toggle(id) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function valueOf(sel, free) {
    return sel === OTHER ? free.trim() : sel;
  }

  async function handleApply() {
    setError('');
    setResultMsg('');
    const ids = selectable.map((s) => s['積込予定ID']).filter((id) => checked.has(id));
    if (ids.length === 0) return setError('変更する便を選んでください');
    if (naiSel === KEEP && kaiSel === KEEP) return setError('変更する立会者を選んでください');
    if (naiSel === OTHER && !naiFree.trim()) return setError('内水面立会者の氏名を入力してください');
    if (kaiSel === OTHER && !kaiFree.trim()) return setError('海面立会者の氏名を入力してください');

    const changes = {};
    if (naiSel !== KEEP) changes.naisuimen = valueOf(naiSel, naiFree);
    if (kaiSel !== KEEP) changes.kaimen = valueOf(kaiSel, kaiFree);
    try {
      const res = await bulkSetWitness(auth, ids, changes);
      const applied = res.outcomes.filter((o) => o.status.indexOf('スキップ') !== 0).length;
      const skipped = res.outcomes.length - applied;
      setResultMsg(`立会者：${applied}件を変更${skipped ? `（${skipped}件はスキップ）` : ''}`);
      onDone?.();
    } catch (e) {
      setError(e.message);
    }
  }

  function WitnessSelect({ label, sel, setSel, free, setFree }) {
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 14, color: 'var(--c-text-2)', marginBottom: 6 }}>{label}</div>
        <select value={sel} onChange={(e) => setSel(e.target.value)} style={inputStyle}>
          <option value={KEEP}>変更しない</option>
          <option value="">未定にする（空にする）</option>
          {taikyoTantousha.map((t) => (
            <option key={t['担当者ID']} value={t['担当者ID']}>
              {t['氏名']}
            </option>
          ))}
          <option value={OTHER}>その他（自由入力）</option>
        </select>
        {sel === OTHER && (
          <input
            type="text"
            placeholder="氏名を入力"
            value={free}
            onChange={(e) => setFree(e.target.value)}
            style={{ ...inputStyle, marginTop: 8 }}
          />
        )}
      </div>
    );
  }

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
        立会者をまとめて変更（管理者）
      </div>
      <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginBottom: 12 }}>
        予定の立会者を書き換えます。積込実績・搬入実績が入っている便は、実績の立会者も書き換えます（入力済みでも上書き）
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {schedules.map((s) => {
          const id = s['積込予定ID'];
          const disabled = s['予定状態'] === '取消' || s['予定状態'] === '中止';
          const v = vehicleOf(s['車輌ID']);
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
                opacity: disabled ? 0.5 : 1,
                cursor: disabled ? 'default' : 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={!disabled && checked.has(id)}
                disabled={disabled}
                onChange={() => toggle(id)}
                style={{ width: 20, height: 20, marginTop: 2 }}
              />
              <span style={{ fontSize: 14 }}>
                <span style={{ fontWeight: 600 }}>{v ? v['車番'] : s['車輌ID']}</span>
                {disabled && `（${s['予定状態']}）`}
                <br />
                <span style={{ fontSize: 13, color: 'var(--c-text-3)' }}>
                  内水面：{tantoushaName(masters, s['内水面立会者ID']) || '未定'}　／　海面：
                  {tantoushaName(masters, s['海面立会者ID']) || '未定'}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {WitnessSelect({ label: '内水面立会者', sel: naiSel, setSel: setNaiSel, free: naiFree, setFree: setNaiFree })}
      {WitnessSelect({ label: '海面立会者', sel: kaiSel, setSel: setKaiSel, free: kaiFree, setFree: setKaiFree })}

      <BusyButton onClick={handleApply}>選んだ便の立会者を変更する</BusyButton>

      {resultMsg && <div style={{ fontSize: 13, color: 'var(--c-ok)', marginTop: 12 }}>✓ {resultMsg}</div>}
      <ErrorMsg message={error} />
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 15,
  borderRadius: 8,
  border: '1px solid var(--c-border-2)',
  background: 'var(--c-bg-2)',
  color: 'var(--c-text)',
  boxSizing: 'border-box',
};
