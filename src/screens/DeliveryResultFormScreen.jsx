import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { getScheduleDetail, createDeliveryResult, updateDeliveryResult, confirmDelivery } from '../lib/api';
import { formatJP, formatDateTimeJP } from '../lib/dateUtils';
import { ikebaName, vehicleLabel, kaimenName, tantoushaName } from '../lib/masterLookup';
import { ErrorMsg, LoadingMsg, StatusBadge } from '../components/UI';
import BusyButton from '../components/BusyButton';
import TimeField from '../components/TimeField';
import { isAdmin } from '../lib/roles';

const OTHER_TANTOUSHA = '__OTHER__';
const CONDITION_OPTIONS = ['良好', '要観察', '不良'];
const YESNO_FIELDS = [
  ['到着確認', '到着確認'],
  ['荷卸作業不備', '荷卸作業の不備'],
  ['車輌不備', '車輌の不備'],
  ['漁業者不備', '漁業者側の不備'],
];

export default function DeliveryResultFormScreen({ schedule, onSaved, onClose }) {
  const { auth } = useAuth();
  const { masters } = useMasters();

  const [detail, setDetail] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [delivery, setDelivery] = useState(null); // 保存後にその場で更新するためローカルに保持する

  useEffect(() => {
    getScheduleDetail(auth, schedule['積込予定ID'])
      .then((d) => {
        setDetail(d);
        setDelivery(d.delivery);
      })
      .catch((e) => setLoadError(e.message));
  }, [auth, schedule]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', color: 'var(--c-text)', padding: '20px 16px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>搬入実績の入力</h2>
        <button
          onClick={onClose}
          style={{
            minHeight: 42,
            padding: '6px 14px',
            borderRadius: 8,
            border: '1px solid var(--c-border-2)',
            background: 'transparent',
            color: 'var(--c-text-2)',
            cursor: 'pointer',
          }}
        >
          閉じる
        </button>
      </div>
      <div style={{ fontSize: 14, color: 'var(--c-text-2)', marginBottom: 20 }}>
        {formatJP(schedule['積込日'])}　{ikebaName(masters, schedule['池場ID'])}　
        {vehicleLabel(masters, schedule['車輌ID'])}　→　{kaimenName(masters, schedule['海面業者ID'])}
        {schedule['ステータス'] && (
          <span style={{ marginLeft: 8 }}>
            <StatusBadge status={schedule['ステータス']} />
          </span>
        )}
      </div>

      {loadError && <ErrorMsg message={`読み込みに失敗しました：${loadError}`} />}
      {!loadError && !detail && <LoadingMsg>読み込んでいます…</LoadingMsg>}
      {!loadError && detail && !detail.result && (
        <ErrorMsg message="先に「積込実績を入力する」から積込実績を登録してください（搬入実績は積込実績に紐づくため、先に作成が必要です）" />
      )}
      {!loadError && detail && detail.result && (
        <DeliveryResultForm
          auth={auth}
          masters={masters}
          schedule={schedule}
          resultId={detail.result['積込実績ID']}
          delivery={delivery}
          onLocalSave={setDelivery}
          onSaved={onSaved}
          onClose={onClose}
        />
      )}
    </div>
  );
}

function DeliveryResultForm({ auth, masters, schedule, resultId, delivery, onLocalSave, onSaved, onClose }) {
  const isEdit = !!delivery;

  const taikyoTantousha = useMemo(
    () => (masters?.担当者 || []).filter((t) => t['区分'] === '太協担当'),
    [masters]
  );

  const initialTantoushaId = delivery?.['海面立会者ID'] || '';
  const initialIsOther = initialTantoushaId && !taikyoTantousha.some((t) => t['担当者ID'] === initialTantoushaId);

  const [form, setForm] = useState({
    搬入日: delivery?.['搬入日'] || schedule['積込日'] || '',
    浜到着時刻: delivery?.['浜到着時刻'] || '',
    作業開始時刻: delivery?.['作業開始時刻'] || '',
    作業終了時刻: delivery?.['作業終了時刻'] || '',
    海面水温: delivery?.['海面水温'] ?? '',
    溶存酸素: delivery?.['溶存酸素'] ?? '',
    海面投入後状態: delivery?.['海面投入後状態'] || '',
    詳細: delivery?.['詳細'] || '',
    到着確認: delivery?.['到着確認'] || '',
    荷卸作業不備: delivery?.['荷卸作業不備'] || '',
    車輌不備: delivery?.['車輌不備'] || '',
    漁業者不備: delivery?.['漁業者不備'] || '',
    備考: delivery?.['備考'] || '',
  });
  const [tantoushaSel, setTantoushaSel] = useState(initialIsOther ? OTHER_TANTOUSHA : initialTantoushaId);
  const [tantoushaFree, setTantoushaFree] = useState(initialIsOther ? initialTantoushaId : '');

  const [error, setError] = useState('');

  // ★2026-09-22追加：保存した時点の入力内容と今の入力内容が同じ間は「✓ 保存済み」表示にする
  const [savedSnapshot, setSavedSnapshot] = useState(null);
  const snapshotOf = (f, sel, free) => JSON.stringify({ f, sel, free });
  const isSaved = savedSnapshot !== null && savedSnapshot === snapshotOf(form, tantoushaSel, tantoushaFree);

  const [showConfirmPanel, setShowConfirmPanel] = useState(false);
  const [confirmed, setConfirmed] = useState(delivery?.['完了確認'] === 'あり');
  const [confirmedAt, setConfirmedAt] = useState(delivery?.['完了確認日時'] || '');

  function setF(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function buildTantoushaId() {
    return tantoushaSel === OTHER_TANTOUSHA ? tantoushaFree.trim() : tantoushaSel;
  }

  function validate() {
    if (!form.搬入日) return '搬入日を入力してください';
    if (tantoushaSel === OTHER_TANTOUSHA && !tantoushaFree.trim()) {
      return '海面立会者の氏名を入力してください（その他を選んだ場合）';
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
    const data = { ...form, 海面立会者ID: buildTantoushaId() };
    try {
      let saved;
      if (isEdit) {
        saved = await updateDeliveryResult(auth, delivery['搬入実績ID'], data);
      } else {
        saved = await createDeliveryResult(auth, schedule['積込予定ID'], resultId, data);
      }
      setSavedSnapshot(snapshotOf(form, tantoushaSel, tantoushaFree));
      onLocalSave(saved); // 画面遷移はせず、その場で編集モードに切り替える（続けて完了確認できるように）
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleConfirm() {
    if (!delivery) return; // 先に保存してからでないと完了確認できない
    try {
      const res = await confirmDelivery(auth, delivery['搬入実績ID']);
      setConfirmed(true);
      setConfirmedAt(res && res['完了確認日時'] ? res['完了確認日時'] : '');
      setShowConfirmPanel(false);
      onSaved?.(res); // 完了確認は一連の作業の区切りなので、ここで一覧に戻る
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div>
      <Field label="搬入日">
        <input type="date" value={form.搬入日} onChange={(e) => setF('搬入日', e.target.value)} style={inputStyle} />
      </Field>

      <YesNoField label="到着確認" value={form.到着確認} onChange={(v) => setF('到着確認', v)} />

      <TimeField label="浜到着時刻" value={form.浜到着時刻} onChange={(v) => setF('浜到着時刻', v)} />
      <TimeField label="作業開始時刻" value={form.作業開始時刻} onChange={(v) => setF('作業開始時刻', v)} />
      <TimeField label="作業終了時刻" value={form.作業終了時刻} onChange={(v) => setF('作業終了時刻', v)} />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Field label="海面水温（℃）" style={{ flex: 1, minWidth: 120 }}>
          <input
            type="number"
            value={form.海面水温}
            onChange={(e) => setF('海面水温', e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="溶存酸素（mg/L）" style={{ flex: 1, minWidth: 120 }}>
          <input
            type="number"
            step="0.1"
            value={form.溶存酸素}
            onChange={(e) => setF('溶存酸素', e.target.value)}
            style={inputStyle}
          />
        </Field>
      </div>

      <Field label="海面投入後の状態">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {CONDITION_OPTIONS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setF('海面投入後状態', form.海面投入後状態 === c ? '' : c)}
              style={{
                minHeight: 42,
                padding: '8px 18px',
                borderRadius: 8,
                fontSize: 15,
                border: '1px solid var(--c-border-2)',
                background: form.海面投入後状態 === c ? 'var(--c-accent)' : 'transparent',
                color: form.海面投入後状態 === c ? '#03202e' : 'var(--c-text)',
                cursor: 'pointer',
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </Field>

      <Field label="詳細（要観察・不良の場合の補足など）">
        <textarea
          value={form.詳細}
          onChange={(e) => setF('詳細', e.target.value)}
          rows={2}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </Field>

      {YESNO_FIELDS.filter(([key]) => key !== '到着確認').map(([key, label]) => (
        <YesNoField key={key} label={label} value={form[key]} onChange={(v) => setF(key, v)} />
      ))}

      <Field label="海面立会者">
        <select value={tantoushaSel} onChange={(e) => setTantoushaSel(e.target.value)} style={inputStyle}>
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

      <Field label="備考">
        <textarea
          value={form.備考}
          onChange={(e) => setF('備考', e.target.value)}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </Field>

      <ErrorMsg message={error} />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
        <BusyButton onClick={handleSave} done={isSaved}>
          保存
        </BusyButton>
        <BusyButton variant="ghost" onClick={onClose}>
          閉じる
        </BusyButton>
      </div>

      {/* 完了確認：他の項目とは別扱いにし、確認パネルを挟む。操作できるのは管理者のみ（★2026-09-23） */}
      {(confirmed || isAdmin(auth.role)) && (
      <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--c-border)' }}>
        {confirmed ? (
          <div
            style={{
              background: 'var(--c-ok-bg)',
              color: 'var(--c-ok)',
              padding: '12px 16px',
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            ✓ 完了確認済み{confirmedAt ? `（${formatDateTimeJP(confirmedAt)}）` : ''}
          </div>
        ) : (
          <>
            {!isEdit && (
              <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginBottom: 10 }}>
                先にこの画面の内容を一度保存してから、完了確認を行ってください。
              </div>
            )}
            <BusyButton
              variant="danger"
              disabled={!isEdit}
              onClick={() => setShowConfirmPanel((v) => !v)}
            >
              完了確認をする
            </BusyButton>
            {showConfirmPanel && (
              <div
                style={{
                  marginTop: 14,
                  padding: 16,
                  border: '1px solid var(--c-danger)',
                  borderRadius: 10,
                  background: 'var(--c-bg-2)',
                }}
              >
                <div style={{ fontSize: 14, color: 'var(--c-danger)', marginBottom: 10 }}>
                  完了確認を行うと、この予定は「納品完了」になります。誤入力がないか確認してから確定してください。
                </div>
                <BusyButton variant="danger" onClick={handleConfirm}>
                  完了確認を確定する
                </BusyButton>
              </div>
            )}
          </>
        )}
      </div>
      )}
    </div>
  );
}

function YesNoField({ label, value, onChange }) {
  return (
    <Field label={label}>
      <div style={{ display: 'flex', gap: 8 }}>
        {['あり', 'なし'].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(value === v ? '' : v)}
            style={{
              minHeight: 42,
              padding: '8px 18px',
              borderRadius: 8,
              fontSize: 15,
              border: '1px solid var(--c-border-2)',
              background: value === v ? (v === 'あり' ? 'var(--c-danger-bg)' : 'var(--c-accent)') : 'transparent',
              color: value === v ? (v === 'あり' ? 'var(--c-danger)' : '#03202e') : 'var(--c-text)',
              cursor: 'pointer',
            }}
          >
            {v}
          </button>
        ))}
      </div>
    </Field>
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
