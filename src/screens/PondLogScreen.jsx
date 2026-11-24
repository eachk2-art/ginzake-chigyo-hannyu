import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { getPlanTree, savePondLog } from '../lib/api';
import { formatJP } from '../lib/dateUtils';
import { ikebaName, kaimenPersonName, deliveryDestName } from '../lib/masterLookup';
import { ErrorMsg, LoadingMsg, StatusBadge } from '../components/UI';
import BusyButton from '../components/BusyButton';
import { Field, ScreenFrame, Section, ChoiceRow, WitnessSelect, inputStyle } from '../components/FormParts';
import { isTaikyo } from '../lib/roles';
import { kgText, witnessOptions } from '../lib/planUtils';

const WEATHER_OPTIONS = ['晴れ', '曇り', '雨', '雪'];

function formOf(log) {
  return {
    天候: log?.['天候'] || '',
    気温: log?.['気温'] ?? '',
    水温: log?.['水温'] ?? '',
    溶存酸素: log?.['溶存酸素'] ?? '',
    内水面立会者ID1: log?.['内水面立会者ID1'] || '',
    内水面立会者ID2: log?.['内水面立会者ID2'] || '',
    備考: log?.['備考'] || '',
  };
}

/**
 * 池場日誌（★2026-11-24 親子方式）：その日のその池場で1件。太協・管理者が入力する。
 * 天候・気温・水温・溶存酸素・内水面立会者（2名まで）。立会者は予定と実績を分けず、当日替われば直す
 */
export default function PondLogScreen({ date, ikebaId, onClose, onOpenPlan }) {
  const { auth } = useAuth();
  const { masters } = useMasters();
  const [node, setNode] = useState(undefined); // undefined=読み込み中, null=この日この池場の予定なし
  const [error, setError] = useState('');
  const [form, setForm] = useState(formOf(null));
  const [savedSnap, setSavedSnap] = useState('');
  const [saveError, setSaveError] = useState('');
  const [formKey, setFormKey] = useState(0);
  const canEdit = isTaikyo(auth.role);

  const load = useCallback(async () => {
    setError('');
    try {
      const tree = await getPlanTree(auth, { dateFrom: date, dateTo: date });
      const day = (tree || []).find((d) => d['日付'] === date);
      const n = day ? day['池場'].find((x) => x['池場ID'] === ikebaId) || null : null;
      setNode(n);
      const f = formOf(n?.['池場日誌']);
      setForm(f);
      setSavedSnap(n?.['池場日誌'] ? JSON.stringify(f) : '');
      setFormKey((k) => k + 1);
    } catch (e) {
      setError(e.message);
    }
  }, [auth, date, ikebaId]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const witnesses = witnessOptions(masters);
  const isSaved = savedSnap !== '' && savedSnap === JSON.stringify(form);

  async function save() {
    setSaveError('');
    try {
      const saved = await savePondLog(auth, date, ikebaId, form);
      const f = formOf(saved);
      setForm(f);
      setSavedSnap(JSON.stringify(f));
    } catch (e) {
      setSaveError(e.message);
    }
  }

  return (
    <ScreenFrame title="池場日誌" sub={`${formatJP(date)}　${ikebaName(masters, ikebaId)}`} onClose={onClose}>
      {error && <ErrorMsg message={`読み込みに失敗しました：${error}`} onRetry={load} />}
      {!error && node === undefined && <LoadingMsg>読み込んでいます…</LoadingMsg>}

      {node !== undefined && (
        <>
          <Section title="天候・水温・内水面立会者">
            <div key={formKey}>
              <Field label="天候">
                <ChoiceRow options={WEATHER_OPTIONS} value={form.天候} disabled={!canEdit} onChange={(v) => set('天候', v)} />
              </Field>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Field label="気温（℃）" style={{ flex: 1, minWidth: 110 }}>
                  <input type="number" step="0.1" inputMode="decimal" disabled={!canEdit} value={form.気温} onChange={(e) => set('気温', e.target.value)} style={inputStyle} />
                </Field>
                <Field label="水温（℃）" style={{ flex: 1, minWidth: 110 }}>
                  <input type="number" step="0.1" inputMode="decimal" disabled={!canEdit} value={form.水温} onChange={(e) => set('水温', e.target.value)} style={inputStyle} />
                </Field>
                <Field label="溶存酸素（mg/L）" style={{ flex: 1, minWidth: 110 }}>
                  <input type="number" step="0.1" inputMode="decimal" disabled={!canEdit} value={form.溶存酸素} onChange={(e) => set('溶存酸素', e.target.value)} style={inputStyle} />
                </Field>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <WitnessSelect label="内水面立会者1" value={form.内水面立会者ID1} disabled={!canEdit} onChange={(v) => set('内水面立会者ID1', v)} options={witnesses} />
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <WitnessSelect label="内水面立会者2" value={form.内水面立会者ID2} disabled={!canEdit} onChange={(v) => set('内水面立会者ID2', v)} options={witnesses} />
                </div>
              </div>
              <Field label="備考">
                <textarea value={form.備考} disabled={!canEdit} onChange={(e) => set('備考', e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
              </Field>
              <ErrorMsg message={saveError} />
              {canEdit && (
                <div style={{ marginBottom: 10 }}>
                  <BusyButton onClick={save} done={isSaved}>
                    保存
                  </BusyButton>
                </div>
              )}
            </div>
          </Section>

          <Section title="この日・この池場の納品先">
            {(!node || node['親'].length === 0) && (
              <div style={{ fontSize: 14, color: 'var(--c-text-3)', marginBottom: 10 }}>この日・この池場の予定はありません</div>
            )}
            {node &&
              node['親'].map((p) => (
                <div
                  key={p['搬入予定ID']}
                  onClick={canEdit ? () => onOpenPlan(p['搬入予定ID']) : undefined}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 0',
                    borderTop: '1px solid var(--c-border)',
                    cursor: canEdit ? 'pointer' : 'default',
                    fontSize: 14,
                  }}
                >
                  <span>
                    {kaimenPersonName(masters, p['海面業者ID'])}（{deliveryDestName(masters, p['配送先ID'])}）　{kgText(p['予定数量kg'])}kg・
                    {(p['割当'] || []).length}台
                  </span>
                  <StatusBadge status={p['ステータス']} />
                </div>
              ))}
          </Section>
        </>
      )}
    </ScreenFrame>
  );
}
