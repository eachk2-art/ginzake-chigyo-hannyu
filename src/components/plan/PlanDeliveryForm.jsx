import { useMemo, useState } from 'react';
import { ErrorMsg } from '../UI';
import BusyButton from '../BusyButton';
import TimeField from '../TimeField';
import { Field, Section, ChoiceRow, YesNoField, WitnessSelect, inputStyle } from '../FormParts';
import { savePlanDelivery } from '../../lib/api';
import { fishSummary, kgText, witnessOptions } from '../../lib/planUtils';

const CONDITION_OPTIONS = ['良好', '要観察', '不良'];
const ISSUE_FIELDS = [
  ['荷卸作業不備', '荷卸作業の不備'],
  ['車輌不備', '車輌の不備'],
  ['漁業者不備', '漁業者側の不備'],
];

function initialForm(plan) {
  return {
    搬入日: plan['搬入日'] || plan['積込日'] || '',
    出発時刻: plan['出発時刻'] || '',
    浜到着時刻: plan['浜到着時刻'] || '',
    作業開始時刻: plan['作業開始時刻'] || '',
    作業終了時刻: plan['作業終了時刻'] || '',
    到着確認: plan['到着確認'] || '',
    生簀ID: plan['生簀ID'] || '',
    海面水温: plan['海面水温'] ?? '',
    溶存酸素: plan['溶存酸素'] ?? '',
    海面投入後状態: plan['海面投入後状態'] || '',
    詳細: plan['詳細'] || '',
    荷卸作業不備: plan['荷卸作業不備'] || '',
    車輌不備: plan['車輌不備'] || '',
    漁業者不備: plan['漁業者不備'] || '',
    // 実績の立会者が無ければ、予定の立会者を初期値にする（1・2とも）
    海面立会者ID1:
      plan['海面立会者ID1'] || plan['海面立会者ID2'] ? plan['海面立会者ID1'] || '' : plan['予定海面立会者ID1'] || '',
    海面立会者ID2:
      plan['海面立会者ID1'] || plan['海面立会者ID2'] ? plan['海面立会者ID2'] || '' : plan['予定海面立会者ID2'] || '',
  };
}

/**
 * 現場（浜）の入力（★2026-11-24 親子方式）：納品先（親）に1回入れれば、全部の車輌に効く。
 * 車ごとに違う時刻・車輌の水温は、車輌の「車ごとの入力」で入れる。
 * disabledReason が入っていれば入力できない（理由を表示）
 */
export default function PlanDeliveryForm({ auth, masters, plan, runs, disabledReason, onSaved }) {
  const [form, setForm] = useState(() => initialForm(plan));
  const [savedSnap, setSavedSnap] = useState(() => JSON.stringify(initialForm(plan)));
  const [error, setError] = useState('');
  const witnesses = witnessOptions(masters);
  const disabled = !!disabledReason;
  const isSaved = savedSnap === JSON.stringify(form);

  const ikesuOptions = (masters?.生簀 || []).filter((k) => k['海面業者ID'] === plan['海面業者ID']);

  // この納品先の分の計量（行き先がこの親の回。行き先未選択は、その運行の割当が1つだけのときに数える）
  const fish = useMemo(() => {
    const planId = plan['搬入予定ID'];
    let partial = false;
    const rows = [];
    (runs || []).forEach((r) => {
      const single = (r['割当'] || []).length <= 1;
      (r['明細'] || []).forEach((d) => {
        const dest = d['行き先搬入予定ID'];
        if (dest === planId || (!dest && single)) rows.push(d);
        else if (!dest) partial = true;
      });
    });
    return { ...fishSummary(rows, plan['予定数量kg']), partial, count: rows.length };
  }, [runs, plan]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setError('');
    if (!form.搬入日) {
      setError('搬入日を入力してください');
      return;
    }
    try {
      await savePlanDelivery(auth, plan['搬入予定ID'], form);
      setSavedSnap(JSON.stringify(form));
      await onSaved();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <Section title="現場（浜）の入力">
      {disabledReason && (
        <div style={{ fontSize: 14, color: 'var(--c-warn)', marginBottom: 12, lineHeight: 1.6 }}>{disabledReason}</div>
      )}

      {fish.count > 0 && (
        <div style={{ border: '1px solid var(--c-border-2)', borderRadius: 10, padding: '10px 12px', marginBottom: 14, fontSize: 14, lineHeight: 1.8 }}>
          <div style={{ fontWeight: 700 }}>この納品先の内容（計量から）</div>
          <div>
            計量合計 {kgText(fish.kg)}kg（入れ目込み）／ 予定数量 {kgText(plan['予定数量kg'])}kg
          </div>
          {fish.fishRaw > 0 && (
            <div style={{ fontSize: 17, fontWeight: 700 }}>
              {fish.fishNet.toLocaleString()}尾（入れ目込み {fish.fishGross.toLocaleString()}尾）　平均 {fish.avg}g
            </div>
          )}
          {fish.partial && (
            <div style={{ color: 'var(--c-warn)' }}>積み分けの車で、行き先が選ばれていない計量があります（ここには数えていません）</div>
          )}
        </div>
      )}

      <Field label="搬入日">
        <input type="date" value={form.搬入日} disabled={disabled} onChange={(e) => set('搬入日', e.target.value)} style={inputStyle} />
      </Field>
      <TimeField label="出発時刻（池場を出た時刻）" value={form.出発時刻} disabled={disabled} onChange={(v) => set('出発時刻', v)} />
      <YesNoField label="到着確認" value={form.到着確認} disabled={disabled} onChange={(v) => set('到着確認', v)} />
      <TimeField label="浜到着時刻" value={form.浜到着時刻} disabled={disabled} onChange={(v) => set('浜到着時刻', v)} />
      <TimeField label="作業開始時刻" value={form.作業開始時刻} disabled={disabled} onChange={(v) => set('作業開始時刻', v)} />
      <TimeField label="作業終了時刻" value={form.作業終了時刻} disabled={disabled} onChange={(v) => set('作業終了時刻', v)} />

      <Field label="生簀（後から入力しても構いません）">
        <select value={form.生簀ID} disabled={disabled} onChange={(e) => set('生簀ID', e.target.value)} style={inputStyle}>
          <option value="">未選択</option>
          {ikesuOptions.map((k) => (
            <option key={k['生簀ID']} value={k['生簀ID']}>
              {k['生簀No']}
              {k['通称'] ? `（${k['通称']}）` : ''}
              {k['規格'] ? `　${k['規格']}` : ''}
            </option>
          ))}
        </select>
      </Field>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Field label="海面水温（℃）" style={{ flex: 1, minWidth: 120 }}>
          <input
            type="number"
            step="0.1"
            inputMode="decimal"
            value={form.海面水温}
            disabled={disabled}
            onChange={(e) => set('海面水温', e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="溶存酸素（mg/L）" style={{ flex: 1, minWidth: 120 }}>
          <input
            type="number"
            step="0.1"
            inputMode="decimal"
            value={form.溶存酸素}
            disabled={disabled}
            onChange={(e) => set('溶存酸素', e.target.value)}
            style={inputStyle}
          />
        </Field>
      </div>
      <div style={{ fontSize: 13, color: 'var(--c-text-3)', margin: '-6px 0 14px' }}>
        車輌の水温は、上の車輌ごとの「車ごとの入力」で入れます。
      </div>

      <Field label="海面投入後の状態">
        <ChoiceRow options={CONDITION_OPTIONS} value={form.海面投入後状態} disabled={disabled} onChange={(v) => set('海面投入後状態', v)} />
      </Field>
      <Field label="詳細（要観察・不良・不備の内容など）">
        <textarea
          value={form.詳細}
          disabled={disabled}
          onChange={(e) => set('詳細', e.target.value)}
          rows={2}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </Field>
      {ISSUE_FIELDS.map(([k, label]) => (
        <YesNoField key={k} label={label} value={form[k]} disabled={disabled} onChange={(v) => set(k, v)} />
      ))}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <WitnessSelect label="海面立会者1" value={form.海面立会者ID1} disabled={disabled} onChange={(v) => set('海面立会者ID1', v)} options={witnesses} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <WitnessSelect label="海面立会者2" value={form.海面立会者ID2} disabled={disabled} onChange={(v) => set('海面立会者ID2', v)} options={witnesses} />
        </div>
      </div>

      <ErrorMsg message={error} />
      {!disabled && (
        <div style={{ marginBottom: 10 }}>
          <BusyButton onClick={save} done={isSaved && !!plan['搬入日']}>
            現場の入力を保存
          </BusyButton>
        </div>
      )}
    </Section>
  );
}
