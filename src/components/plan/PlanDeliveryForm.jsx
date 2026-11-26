import { useMemo, useState } from 'react';
import { ErrorMsg } from '../UI';
import BusyButton from '../BusyButton';
import TimeField from '../TimeField';
import { Field, Section, ChoiceRow, YesNoField, WitnessSelect, inputStyle } from '../FormParts';
import { savePlanDelivery } from '../../lib/api';
import { fishSummary, kgText, witnessOptions, representativeId, waypointOptions, waypointLabel } from '../../lib/planUtils';
import { vehicleWithCarrier } from '../../lib/masterLookup';

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
    // ★2026-11-27 中間地点①〜③と代表の車輌（空＝積込順の一番早い車輌）
    中間地点1ID: plan['中間地点1ID'] || '',
    中間地点1時刻: plan['中間地点1時刻'] || '',
    中間地点2ID: plan['中間地点2ID'] || '',
    中間地点2時刻: plan['中間地点2時刻'] || '',
    中間地点3ID: plan['中間地点3ID'] || '',
    中間地点3時刻: plan['中間地点3時刻'] || '',
    代表積込予定ID: plan['代表積込予定ID'] || '',
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
  const [midOpen, setMidOpen] = useState(false); // ★2026-11-27 中間地点は、ボタンで開く
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

  // 時刻の順番の確認（出発 → 中間地点①②③ → 浜到着 → 作業開始 → 作業終了）
  const toMin = (t) => {
    const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const seq = [
    ['出発', form.出発時刻],
    ['中間地点①', form.中間地点1時刻],
    ['中間地点②', form.中間地点2時刻],
    ['中間地点③', form.中間地点3時刻],
    ['浜到着', form.浜到着時刻],
    ['作業開始', form.作業開始時刻],
    ['作業終了', form.作業終了時刻],
  ].filter(([, t]) => toMin(t) !== null);
  let orderWarn = '';
  for (let i = 1; i < seq.length; i++) {
    if (toMin(seq[i][1]) < toMin(seq[i - 1][1])) {
      orderWarn = `${seq[i - 1][0]}（${seq[i - 1][1]}）より${seq[i][0]}（${seq[i][1]}）が早くなっています。確かめてください`;
      break;
    }
  }
  const allocs = plan['割当'] || [];
  const autoRep = representativeId({ ...plan, 代表積込予定ID: '' });

  async function save() {
    setError('');
    const noPoint = [1, 2, 3].find((n) => form[`中間地点${n}時刻`] && !form[`中間地点${n}ID`]);
    if (noPoint) {
      setError(`中間地点${'①②③'[noPoint - 1]}の地点・内容を選んでください（時刻だけ入っています）`);
      setMidOpen(true);
      return;
    }
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
      {/* ★2026-11-27：時刻は代表の車輌に聞いて、この納品先に1回入れる（全部の車輌に効く。ずれた車だけ「車ごとの入力」で直す） */}
      {allocs.length > 1 && (
        <Field label="代表の車輌（時刻を聞く車）">
          <select value={form.代表積込予定ID} disabled={disabled} onChange={(e) => set('代表積込予定ID', e.target.value)} style={inputStyle}>
            <option value="">積込順の一番早い車（{vehicleWithCarrier(masters, allocs.find((a) => a['積込予定ID'] === autoRep)?.['車輌ID'])}）</option>
            {allocs.map((a) => (
              <option key={a['積込予定ID']} value={a['積込予定ID']}>
                {vehicleWithCarrier(masters, a['車輌ID'])}
              </option>
            ))}
          </select>
        </Field>
      )}
      <TimeField label="出発時刻（池場を出た時刻）" value={form.出発時刻} disabled={disabled} onChange={(v) => set('出発時刻', v)} />
      {/* ★2026-11-27 中間地点①〜③：最初は閉じておき、ボタンで開く。閉じているときは入力済みの分だけ1行で出す */}
      <div style={{ marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setMidOpen((v) => !v)}
          style={{
            minHeight: 42,
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid var(--c-accent)',
            background: midOpen ? 'var(--c-bg-3)' : 'transparent',
            color: 'var(--c-accent)',
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          中間地点 {midOpen ? '▲' : '▼'}
        </button>
        {!midOpen && (
          <div style={{ fontSize: 14, color: 'var(--c-text-2)', marginTop: 6 }}>
            {[1, 2, 3]
              .filter((n) => form[`中間地点${n}ID`] || form[`中間地点${n}時刻`])
              .map((n) => `${'①②③'[n - 1]} ${waypointLabel(masters, form[`中間地点${n}ID`]) || '地点未選択'} ${form[`中間地点${n}時刻`] || '--:--'}`)
              .join('　') || '（入力なし）'}
          </div>
        )}
        {midOpen &&
          [1, 2, 3].map((n) => {
            const opts = waypointOptions(masters, n);
            const idKey = `中間地点${n}ID`;
            const tKey = `中間地点${n}時刻`;
            return (
              <div key={n} style={{ border: '1px dashed var(--c-border-2)', borderRadius: 10, padding: '10px 10px 0', marginTop: 10 }}>
                <Field label={`中間地点${'①②③'[n - 1]}　地点・内容`} style={{ marginBottom: 8 }}>
                  <select value={form[idKey]} disabled={disabled} onChange={(e) => set(idKey, e.target.value)} style={inputStyle}>
                    <option value="">（なし）</option>
                    {opts.map((w) => (
                      <option key={w['中間地点ID']} value={w['中間地点ID']}>
                        {w['地点・内容']}
                      </option>
                    ))}
                  </select>
                </Field>
                <TimeField label="時刻（4桁の数字で入力。例：0750）" value={form[tKey]} disabled={disabled} onChange={(v) => set(tKey, v)} />
              </div>
            );
          })}
      </div>
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

      {orderWarn && <div style={{ fontSize: 14, color: 'var(--c-warn)', marginBottom: 10 }}>⚠ {orderWarn}</div>}
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
