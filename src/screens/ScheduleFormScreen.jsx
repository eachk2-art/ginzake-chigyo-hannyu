import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { createSchedule, updateSchedule, cancelSchedule, deleteSchedule, bulkCreateSchedule } from '../lib/api';
import { ErrorMsg } from '../components/UI';
import BusyButton from '../components/BusyButton';
import TimeField from '../components/TimeField';
import { isAdmin } from '../lib/roles';
import { kaimenName } from '../lib/masterLookup';

const OTHER_TANTOUSHA = '__OTHER__';

export default function ScheduleFormScreen({ initial, onSaved, onCancelEdit, onOpenLoadingResult }) {
  const { auth } = useAuth();
  const { masters } = useMasters();
  const isEdit = !!initial;

  const taikyoTantousha = useMemo(
    () => (masters?.担当者 || []).filter((t) => t['区分'] === '太協担当'),
    [masters]
  );

  const initialTantoushaIsOther =
    isEdit &&
    initial['内水面立会者ID'] &&
    !taikyoTantousha.some((t) => t['担当者ID'] === initial['内水面立会者ID']);

  const [form, setForm] = useState({
    積込日: initial?.['積込日'] || '',
    池場ID: initial?.['池場ID'] || '',
    車輌ID: initial?.['車輌ID'] || '',
    海面業者ID: initial?.['海面業者ID'] || '',
    配送先ID: initial?.['配送先ID'] || '',
    予定数量kg: initial?.['予定数量kg'] || '',
    予定入れ目率: initial?.['予定入れ目率'] ?? '5',
    到着予定時刻: initial?.['到着予定時刻'] || '',
    予定状態: initial?.['予定状態'] === '保留' ? '保留' : '通常',
    備考: initial?.['備考'] || '',
  });
  const [tantoushaSel, setTantoushaSel] = useState(
    initialTantoushaIsOther ? OTHER_TANTOUSHA : initial?.['内水面立会者ID'] || ''
  );
  const [tantoushaFree, setTantoushaFree] = useState(initialTantoushaIsOther ? initial['内水面立会者ID'] : '');

  const [error, setError] = useState('');
  const [showCancelPanel, setShowCancelPanel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // 複数台まとめて登録（新規登録のときだけ使う）。
  // key: 車輌ID、value: その車輌の予定数量kg（文字列）。オブジェクトに存在する＝選択中。
  const [multiMode, setMultiMode] = useState(false);
  const [vehicleQty, setVehicleQty] = useState({});

  function toggleVehicleChecked(vehicleId) {
    setVehicleQty((prev) => {
      const next = { ...prev };
      if (vehicleId in next) {
        delete next[vehicleId];
      } else {
        next[vehicleId] = '';
      }
      return next;
    });
  }

  function setVehicleQtyValue(vehicleId, val) {
    setVehicleQty((prev) => ({ ...prev, [vehicleId]: val }));
  }

  function set(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  const suryoKg = Number(form.予定数量kg) || 0;
  const ireme = Number(form.予定入れ目率) || 0;
  const keiryoKg = Math.round(suryoKg * (1 + ireme / 100));

  // 選択中の車輌の最大積載数量を超えていないかチェックする（登録時点で気づけるように）。
  const selectedVehicle = (masters?.車輌 || []).find((v) => v['車輌ID'] === form.車輌ID);
  const maxLoadKg = Number(selectedVehicle?.['最大積載数量kg']) || null;
  // ★2026-09-22変更：入れ目込みの数量ではなく、予定数量そのものが最大積載数量を超える場合だけ警告する
  const overCapacity = !!maxLoadKg && suryoKg > maxLoadKg;

  function buildTantoushaId() {
    if (tantoushaSel === OTHER_TANTOUSHA) return tantoushaFree.trim();
    return tantoushaSel;
  }

  function validate() {
    if (!form.積込日) return '積込日を入力してください';
    if (!form.池場ID) return '池場を選択してください';
    if (!form.海面業者ID) return '海面業者を選択してください';
    if (multiMode) {
      const entries = Object.entries(vehicleQty);
      if (entries.length === 0) return '車輌を1台以上選択してください';
      if (entries.some(([, qty]) => !Number(qty))) return '選択した車輌すべてに予定数量を入力してください';
    } else {
      if (!form.車輌ID) return '車輌を選択してください';
      if (!suryoKg) return '予定数量を入力してください';
    }
    if (tantoushaSel === OTHER_TANTOUSHA && !tantoushaFree.trim()) {
      return '内水面立会者の氏名を入力してください（その他を選んだ場合）';
    }
    return '';
  }

  async function handleSave() {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError('');

    if (multiMode) {
      const dataList = Object.entries(vehicleQty).map(([vehicleId, qtyStr]) => {
        const q = Number(qtyStr) || 0;
        const keiryo = Math.round(q * (1 + ireme / 100));
        return {
          積込日: form.積込日,
          池場ID: form.池場ID,
          車輌ID: vehicleId,
          海面業者ID: form.海面業者ID,
          配送先ID: form.配送先ID,
          予定数量kg: String(q),
          予定入れ目率: String(ireme),
          予定計量数量kg: String(keiryo),
          到着予定時刻: form.到着予定時刻,
          内水面立会者ID: buildTantoushaId(),
          予定状態: form.予定状態,
          備考: form.備考,
        };
      });
      try {
        await bulkCreateSchedule(auth, dataList);
        onSaved?.();
      } catch (e) {
        setError(e.message);
      }
      return;
    }

    const data = {
      積込日: form.積込日,
      池場ID: form.池場ID,
      車輌ID: form.車輌ID,
      海面業者ID: form.海面業者ID,
      配送先ID: form.配送先ID,
      予定数量kg: String(suryoKg),
      予定入れ目率: String(ireme),
      予定計量数量kg: String(keiryoKg),
      到着予定時刻: form.到着予定時刻,
      内水面立会者ID: buildTantoushaId(),
      予定状態: form.予定状態,
      備考: form.備考,
    };
    try {
      if (isEdit) {
        await updateSchedule(auth, initial['積込予定ID'], data);
      } else {
        await createSchedule(auth, data);
      }
      onSaved?.();
    } catch (e) {
      setError(e.message);
    }
  }

  // 取消にした予定を一覧から消す（管理者のみ。データはDBに残る）
  async function handleDeleteSchedule() {
    setError('');
    if (!window.confirm('この取消予定を一覧から削除しますか？\n\n一覧・ホーム画面に表示されなくなります。（データはデータベースに残るので、必要なら戻せます）')) return;
    try {
      await deleteSchedule(auth, initial['積込予定ID']);
      onSaved?.();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleCancelSchedule() {
    setError('');
    try {
      await cancelSchedule(auth, initial['積込予定ID'], cancelReason);
      onSaved?.();
    } catch (e) {
      setError(e.message);
    }
  }

  // ★2026-09-25：配送先は、選んだ海面業者に登録されているものだけを出す。
  // （同じ場所でも業者ごとに1件ずつ登録されているため、そのままだと同じ名前が並ぶ）
  // その業者の配送先が無いときは、全件から選べるようにし、業者名を添えて区別する。
  const deliveryAll = masters?.配送先 || [];
  const deliveryMine = deliveryAll.filter((d) => d['海面業者ID'] === form.海面業者ID);
  const deliveryFiltered = form.海面業者ID !== '' && deliveryMine.length > 0;
  const deliveryOptions = deliveryFiltered ? deliveryMine : deliveryAll;

  // 海面業者を変えたときは、その業者に合わない配送先を選んだままにしない
  useEffect(() => {
    if (!deliveryFiltered) return;
    const ok = deliveryMine.some((d) => d['配送先ID'] === form.配送先ID);
    if (!ok) set('配送先ID', deliveryMine.length === 1 ? deliveryMine[0]['配送先ID'] : '');
  }, [form.海面業者ID, deliveryFiltered]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', color: 'var(--c-text)', padding: '20px 16px 60px' }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, margin: '0 0 18px' }}>
        {isEdit ? '積込予定の編集' : '積込予定の新規登録'}
      </h2>

      <Field label="積込日">
        <input type="date" value={form.積込日} onChange={(e) => set('積込日', e.target.value)} style={inputStyle} />
      </Field>

      <Field label="池場">
        <select value={form.池場ID} onChange={(e) => set('池場ID', e.target.value)} style={inputStyle}>
          <option value="">選択してください</option>
          {(masters?.池場 || []).map((p) => (
            <option key={p['池場ID']} value={p['池場ID']}>
              {p['池場名']}
            </option>
          ))}
        </select>
      </Field>

      {!isEdit && (
        <div style={{ marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => {
              setMultiMode((m) => !m);
              setVehicleQty({});
              set('車輌ID', '');
            }}
            style={{
              minHeight: 42,
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              border: '1px solid var(--c-border-2)',
              background: multiMode ? 'var(--c-accent)' : 'transparent',
              color: multiMode ? '#03202e' : 'var(--c-text)',
              cursor: 'pointer',
            }}
          >
            {multiMode ? '✓ 複数台まとめて登録' : '複数台まとめて登録にする'}
          </button>
        </div>
      )}

      {!multiMode && (
        <Field label="車輌">
          <select value={form.車輌ID} onChange={(e) => set('車輌ID', e.target.value)} style={inputStyle}>
            <option value="">選択してください</option>
            {(masters?.車輌 || []).map((v) => {
              const carrier = (masters?.運送会社 || []).find((c) => c['運送会社ID'] === v['運送会社ID']);
              return (
                <option key={v['車輌ID']} value={v['車輌ID']}>
                  {v['車番']}（{carrier ? carrier['略称'] || carrier['運送会社名'] : v['運送会社ID']}）
                </option>
              );
            })}
          </select>
        </Field>
      )}

      <Field label="海面業者">
        <select value={form.海面業者ID} onChange={(e) => set('海面業者ID', e.target.value)} style={inputStyle}>
          <option value="">選択してください</option>
          {(masters?.海面業者 || []).map((k) => (
            <option key={k['海面業者ID']} value={k['海面業者ID']}>
              {k['氏名']}（{k['屋号']}）
            </option>
          ))}
        </select>
      </Field>

      <Field label="配送先">
        <select value={form.配送先ID} onChange={(e) => set('配送先ID', e.target.value)} style={inputStyle}>
          <option value="">選択してください</option>
          {deliveryOptions.map((d) => (
            <option key={d['配送先ID']} value={d['配送先ID']}>
              {d['配送先名']}
              {deliveryFiltered ? '' : `（${kaimenName(masters, d['海面業者ID'])}）`}
            </option>
          ))}
        </select>
      </Field>

      {multiMode && (
        <Field label="車輌（複数選択、車輌ごとに予定数量を入力）">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(masters?.車輌 || []).map((v) => {
              const vehicleId = v['車輌ID'];
              const carrier = (masters?.運送会社 || []).find((c) => c['運送会社ID'] === v['運送会社ID']);
              const checked = vehicleId in vehicleQty;
              const qty = Number(vehicleQty[vehicleId]) || 0;
              const rowKeiryo = Math.round(qty * (1 + ireme / 100));
              const rowMaxLoadKg = Number(v['最大積載数量kg']) || null;
              const rowOverCapacity = checked && qty > 0 && !!rowMaxLoadKg && qty > rowMaxLoadKg;
              return (
                <div
                  key={vehicleId}
                  style={{
                    padding: '10px 12px',
                    border: '1px solid var(--c-border-2)',
                    borderRadius: 8,
                    background: checked ? 'var(--c-bg-3)' : 'transparent',
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleVehicleChecked(vehicleId)}
                      style={{ width: 20, height: 20 }}
                    />
                    <span style={{ fontSize: 14, fontWeight: 600 }}>
                      {v['車番']}（{carrier ? carrier['略称'] || carrier['運送会社名'] : v['運送会社ID']}）
                    </span>
                  </label>
                  {checked && (
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="number"
                        min="0"
                        placeholder="予定数量kg"
                        value={vehicleQty[vehicleId]}
                        onChange={(e) => setVehicleQtyValue(vehicleId, e.target.value)}
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      {qty > 0 && (
                        <span
                          style={{
                            fontSize: 13,
                            whiteSpace: 'nowrap',
                            color: rowOverCapacity ? 'var(--c-danger)' : 'var(--c-text-3)',
                          }}
                        >
                          入れ目込み{rowKeiryo.toLocaleString()}kg
                          {rowOverCapacity && `（予定数量が上限${rowMaxLoadKg.toLocaleString()}kg超過）`}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {Object.keys(vehicleQty).length > 0 && (
            <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginTop: 8 }}>
              選択中：{Object.keys(vehicleQty).length}台　合計予定数量：
              {Object.values(vehicleQty)
                .reduce((sum, q) => sum + (Number(q) || 0), 0)
                .toLocaleString()}
              kg
            </div>
          )}
        </Field>
      )}

      {multiMode ? (
        <Field label="予定入れ目率（%）※選択した全車輌に共通で適用されます">
          <input
            type="number"
            min="0"
            value={form.予定入れ目率}
            onChange={(e) => set('予定入れ目率', e.target.value)}
            style={inputStyle}
          />
        </Field>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12 }}>
            <Field label="予定数量（kg）" style={{ flex: 1 }}>
              <input
                type="number"
                min="0"
                value={form.予定数量kg}
                onChange={(e) => set('予定数量kg', e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="予定入れ目率（%）" style={{ flex: 1 }}>
              <input
                type="number"
                min="0"
                value={form.予定入れ目率}
                onChange={(e) => set('予定入れ目率', e.target.value)}
                style={inputStyle}
              />
            </Field>
          </div>

          <div style={{ margin: '-6px 0 16px' }}>
            <div style={{ fontSize: 14, color: 'var(--c-text-3)' }}>
              予定計量数量（参考値）：{keiryoKg}kg
            </div>
            {overCapacity && (
              <div style={{ fontSize: 13, color: 'var(--c-danger)', marginTop: 4 }}>
                ※ 予定数量が、選択中の車輌の最大積載数量（{maxLoadKg}kg）を超えています。車輌を変更するか、予定数量を見直してください
              </div>
            )}
          </div>
        </>
      )}

      <TimeField
        label="到着予定時刻（海面業者向け予定表に表示）"
        value={form.到着予定時刻}
        onChange={(v) => set('到着予定時刻', v)}
      />

      <Field label="内水面立会者">
        <select
          value={tantoushaSel}
          onChange={(e) => setTantoushaSel(e.target.value)}
          style={inputStyle}
        >
          <option value="">選択してください</option>
          {taikyoTantousha.map((t) => (
            <option key={t['担当者ID']} value={t['担当者ID']}>
              {t['氏名']}
            </option>
          ))}
          <option value={OTHER_TANTOUSHA}>その他（自由入力）</option>
        </select>
        {tantoushaSel === OTHER_TANTOUSHA && (
          <input
            type="text"
            placeholder="氏名を入力"
            value={tantoushaFree}
            onChange={(e) => setTantoushaFree(e.target.value)}
            style={{ ...inputStyle, marginTop: 8 }}
          />
        )}
      </Field>

      <Field label="予定状態">
        <div style={{ display: 'flex', gap: 8 }}>
          {['通常', '保留'].map((st) => (
            <button
              key={st}
              onClick={() => set('予定状態', st)}
              style={{
                minHeight: 42,
                padding: '8px 18px',
                borderRadius: 8,
                fontSize: 15,
                border: '1px solid var(--c-border-2)',
                background: form.予定状態 === st ? 'var(--c-accent)' : 'transparent',
                color: form.予定状態 === st ? '#03202e' : 'var(--c-text)',
                cursor: 'pointer',
              }}
            >
              {st}
            </button>
          ))}
        </div>
      </Field>

      <Field label="備考">
        <textarea
          value={form.備考}
          onChange={(e) => set('備考', e.target.value)}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </Field>

      <ErrorMsg message={error} />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
        <BusyButton onClick={handleSave}>保存</BusyButton>
        <BusyButton variant="ghost" onClick={() => onCancelEdit?.()}>
          閉じる
        </BusyButton>
        {isEdit && (
          <BusyButton variant="ghost" onClick={() => onOpenLoadingResult?.(initial)}>
            積込実績を入力する
          </BusyButton>
        )}
        {/* 予定の取消は管理者のみ（★2026-09-23）。取消済みの予定は、管理者だけが一覧から削除できる（★2026-09-24） */}
        {isEdit && isAdmin(auth.role) && initial['予定状態'] !== '取消' && (
          <BusyButton variant="danger" onClick={() => setShowCancelPanel((v) => !v)}>
            この予定を取消にする
          </BusyButton>
        )}
        {isEdit && isAdmin(auth.role) && initial['予定状態'] === '取消' && (
          <BusyButton variant="danger" onClick={handleDeleteSchedule}>
            この取消予定を一覧から削除する
          </BusyButton>
        )}
      </div>

      {isEdit && isAdmin(auth.role) && showCancelPanel && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            border: '1px solid var(--c-danger)',
            borderRadius: 10,
            background: 'var(--c-bg-2)',
          }}
        >
          <div style={{ fontSize: 14, color: 'var(--c-danger)', marginBottom: 8 }}>
            取消にすると、一覧・ホーム画面に「取消」と表示されます（削除ではありません）。理由を入力してください。
          </div>
          <input
            type="text"
            placeholder="取消理由（任意）"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            style={inputStyle}
          />
          <div style={{ marginTop: 10 }}>
            <BusyButton variant="danger" onClick={handleCancelSchedule}>
              取消を確定する
            </BusyButton>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children, style }) {
  return (
    <div style={{ marginBottom: 16, ...style }}>
      <label style={{ display: 'block', fontSize: 13, color: 'var(--c-text-3)', marginBottom: 6 }}>{label}</label>
      {children}
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
