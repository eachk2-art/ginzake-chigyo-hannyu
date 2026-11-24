import { useState } from 'react';
import { ErrorMsg } from '../UI';
import BusyButton from '../BusyButton';
import TimeField from '../TimeField';
import { Field, Section, WitnessSelect, inputStyle } from '../FormParts';
import { updatePlan, changePlanHama } from '../../lib/api';
import { deliveryDestName, pondNameOnly, tantoushaName, originIkebaName } from '../../lib/masterLookup';
import { isAdmin, isTaikyo } from '../../lib/roles';
import { kgText, pointsOfKaimen, originOptions, witnessOptions, weighTarget, num } from '../../lib/planUtils';

/**
 * 予定の内容（★2026-11-24 親子方式）
 * ・予定数量・入れ目率・到着予定・元の池・海面立会者（予定）・備考の変更：管理者
 * ・浜の変更：太協・管理者。同じ浜の予定がすでにあれば「まとめますか」と聞いてから1つにまとめる
 */
export default function PlanEditPanel({ auth, masters, plan, locked, onChanged, onMerged }) {
  const admin = isAdmin(auth.role);
  const taikyo = isTaikyo(auth.role);
  const inactive = plan['予定状態'] === '取消' || plan['予定状態'] === '中止';
  const [editing, setEditing] = useState(false);

  return (
    <Section
      title="予定の内容"
      right={
        admin &&
        !editing && (
          <button style={editBtnStyle} onClick={() => setEditing(true)}>
            変更する
          </button>
        )
      }
    >
      {!editing && <PlanSummary masters={masters} plan={plan} />}
      {editing && (
        <EditForm
          auth={auth}
          masters={masters}
          plan={plan}
          onSaved={async () => {
            setEditing(false);
            await onChanged();
          }}
          onCancel={() => setEditing(false)}
        />
      )}
      {taikyo && !locked && !inactive && !editing && (
        <HamaChange auth={auth} masters={masters} plan={plan} onChanged={onChanged} onMerged={onMerged} />
      )}
    </Section>
  );
}

function PlanSummary({ masters, plan }) {
  const rows = [
    ['予定数量', `${kgText(plan['予定数量kg'])}kg（入れ目 ${plan['予定入れ目率'] || 0}% ／ 計量の目安 ${weighTarget(plan['予定数量kg'], plan['予定入れ目率']).toLocaleString()}kg）`],
    ['到着予定', plan['到着予定時刻'] || '—'],
    ['元の池', originIkebaName(masters, plan) || 'なし'],
    [
      '海面立会者（予定）',
      [plan['予定海面立会者ID1'], plan['予定海面立会者ID2']]
        .filter(Boolean)
        .map((w) => tantoushaName(masters, w))
        .join('・') || '—',
    ],
    ['備考', plan['備考'] || '—'],
  ];
  return (
    <div style={{ fontSize: 14, lineHeight: 1.8, marginBottom: 10 }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: 8 }}>
          <span style={{ color: 'var(--c-text-3)', minWidth: 110 }}>{k}</span>
          <span style={{ whiteSpace: 'pre-wrap' }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function EditForm({ auth, masters, plan, onSaved, onCancel }) {
  const [f, setF] = useState({
    予定数量kg: plan['予定数量kg'] ?? '',
    予定入れ目率: plan['予定入れ目率'] ?? '',
    到着予定時刻: plan['到着予定時刻'] || '',
    由来池場ID: plan['由来池場ID'] || '',
    予定海面立会者ID1: plan['予定海面立会者ID1'] || '',
    予定海面立会者ID2: plan['予定海面立会者ID2'] || '',
    備考: plan['備考'] || '',
  });
  const [error, setError] = useState('');
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const origins = originOptions(masters, plan['池場ID']);
  const witnesses = witnessOptions(masters);
  const assigned = num(plan['割当済kg']);

  async function save() {
    setError('');
    if (!(num(f.予定数量kg) > 0)) {
      setError('予定数量を入力してください');
      return;
    }
    try {
      await updatePlan(auth, plan['搬入予定ID'], { ...f, 予定数量kg: String(num(f.予定数量kg)) });
      await onSaved();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Field label="予定数量（kg）" style={{ flex: 1, minWidth: 140 }}>
          <input type="number" inputMode="decimal" value={f.予定数量kg} onChange={(e) => set('予定数量kg', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="予定入れ目率（％）" style={{ flex: 1, minWidth: 140 }}>
          <input type="number" inputMode="decimal" value={f.予定入れ目率} onChange={(e) => set('予定入れ目率', e.target.value)} style={inputStyle} />
        </Field>
      </div>
      {assigned > 0 && num(f.予定数量kg) < assigned && (
        <div style={{ fontSize: 13, color: 'var(--c-warn)', margin: '-6px 0 12px' }}>
          車輌の割当の合計（{kgText(assigned)}kg）より少なくなります。車輌の割当数量も直してください
        </div>
      )}
      <TimeField label="到着予定時刻" value={f.到着予定時刻} onChange={(v) => set('到着予定時刻', v)} />
      <Field label="元の池（由来）">
        <select value={f.由来池場ID} onChange={(e) => set('由来池場ID', e.target.value)} style={inputStyle}>
          <option value="">なし（この池で育った稚魚）</option>
          {origins.map((p) => (
            <option key={p['池場ID']} value={p['池場ID']}>
              {pondNameOnly(p['池場名'])}
            </option>
          ))}
        </select>
      </Field>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <WitnessSelect label="海面立会者（予定）1" value={f.予定海面立会者ID1} onChange={(v) => set('予定海面立会者ID1', v)} options={witnesses} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <WitnessSelect label="海面立会者（予定）2" value={f.予定海面立会者ID2} onChange={(v) => set('予定海面立会者ID2', v)} options={witnesses} />
        </div>
      </div>
      <Field label="備考">
        <textarea value={f.備考} onChange={(e) => set('備考', e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
      </Field>
      <ErrorMsg message={error} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <BusyButton onClick={save}>保存</BusyButton>
        <BusyButton variant="ghost" onClick={onCancel}>
          やめる
        </BusyButton>
      </div>
    </div>
  );
}

function HamaChange({ auth, masters, plan, onChanged, onMerged }) {
  const [open, setOpen] = useState(false);
  const [pointId, setPointId] = useState(plan['配送先ID'] || '');
  const [error, setError] = useState('');
  const points = pointsOfKaimen(masters, plan['海面業者ID']);

  async function save() {
    setError('');
    if (!pointId || pointId === plan['配送先ID']) {
      setError('新しい浜を選んでください');
      return;
    }
    try {
      await changePlanHama(auth, plan['搬入予定ID'], pointId, false);
      setOpen(false);
      await onChanged();
    } catch (e) {
      if (e.code !== 'MERGE_CONFIRM') {
        setError(e.message);
        return;
      }
      const ok = window.confirm(
        `${e.message}\n\n「OK」で、この予定の車輌・数量・計量を、${deliveryDestName(masters, pointId)} の予定に移して1つにまとめます。この予定は無くなります。`
      );
      if (!ok) return;
      try {
        const res = await changePlanHama(auth, plan['搬入予定ID'], pointId, true);
        setOpen(false);
        if (res && res['まとめ先']) onMerged(res['まとめ先']);
        else await onChanged();
      } catch (e2) {
        setError(e2.message);
      }
    }
  }

  if (!open) {
    return (
      <div style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 14, color: 'var(--c-text-2)', marginRight: 10 }}>浜：{deliveryDestName(masters, plan['配送先ID'])}</span>
        <button style={editBtnStyle} onClick={() => setOpen(true)}>
          浜を変える
        </button>
      </div>
    );
  }
  return (
    <div style={{ border: '1px solid var(--c-border-2)', borderRadius: 10, padding: 12, marginBottom: 12, background: 'var(--c-bg)' }}>
      <Field label={`新しい浜（今：${deliveryDestName(masters, plan['配送先ID'])}）`}>
        <select value={pointId} onChange={(e) => setPointId(e.target.value)} style={inputStyle}>
          {points.map((d) => (
            <option key={d['配送先ID']} value={d['配送先ID']}>
              {d['配送先名']}
            </option>
          ))}
        </select>
      </Field>
      <ErrorMsg message={error} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <BusyButton onClick={save}>浜を変える</BusyButton>
        <BusyButton variant="ghost" onClick={() => setOpen(false)}>
          やめる
        </BusyButton>
      </div>
    </div>
  );
}

const editBtnStyle = {
  minHeight: 38,
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid var(--c-accent)',
  background: 'transparent',
  color: 'var(--c-accent)',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};
