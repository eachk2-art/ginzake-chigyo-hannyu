import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { bulkSetLoadingResultField, bulkSetDeliveryResultField, bulkConfirmDelivery } from '../lib/api';
import TimeField from './TimeField';
import BusyButton from './BusyButton';
import { ErrorMsg } from './UI';
import { isAdmin } from '../lib/roles';

// 出発時刻は積込実績側、それ以外（浜到着・作業開始・作業終了）は搬入実績側の項目。
const FIELDS = [
  { key: '出発時刻', label: '出発時刻', table: 'loading' },
  { key: '浜到着時刻', label: '浜到着時刻', table: 'delivery' },
  { key: '作業開始時刻', label: '作業開始時刻', table: 'delivery' },
  { key: '作業終了時刻', label: '作業終了時刻', table: 'delivery' },
];

/**
 * 同じ納品先（海面業者）向けの車輌（scheduleIds）に、出発〜作業終了までの時刻・
 * 完了確認をまとめて反映するパネル。
 * ・すでに値が入っている車輌には反映しない（上書きしない）
 * ・完了確認は、作業終了時刻まで入力済みの車輌だけを対象にする
 * （どちらもGAS側で判定・スキップする。ここでは結果をそのまま表示するだけ）
 */
export default function BulkActionsPanel({ scheduleIds, onDone }) {
  const { auth } = useAuth();
  const [values, setValues] = useState({ 出発時刻: '', 浜到着時刻: '', 作業開始時刻: '', 作業終了時刻: '' });
  const [error, setError] = useState('');
  const [resultMsg, setResultMsg] = useState('');

  function setValue(key, v) {
    setValues((s) => ({ ...s, [key]: v }));
  }

  function summarize(outcomes) {
    const applied = outcomes.filter((o) => o.status.indexOf('スキップ') !== 0);
    const skipped = outcomes.length - applied.length;
    return `${applied.length}件に反映${skipped ? `（${skipped}件はスキップ）` : ''}`;
  }

  async function run(action, label) {
    setError('');
    setResultMsg('');
    try {
      const res = await action();
      setResultMsg(`${label}：${summarize(res.outcomes)}`);
      onDone?.();
    } catch (e) {
      setError(e.message);
    }
  }

  function applyField(field) {
    const value = values[field.key];
    if (!value) {
      setError(`${field.label}を入力してください`);
      return;
    }
    const action =
      field.table === 'loading'
        ? () => bulkSetLoadingResultField(auth, scheduleIds, field.key, value)
        : () => bulkSetDeliveryResultField(auth, scheduleIds, field.key, value);
    run(action, field.label);
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
        この納品先の全車輌（{scheduleIds.length}台）にまとめて反映
      </div>
      <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginBottom: 12 }}>
        すでに入力済みの車輌には反映されません
      </div>

      {FIELDS.map((field) => (
        <div key={field.key} style={{ marginBottom: 18 }}>
          <TimeField label={field.label} value={values[field.key]} onChange={(v) => setValue(field.key, v)} />
          <BusyButton variant="ghost" disabled={!values[field.key]} onClick={() => applyField(field)}>
            {field.label}を一括反映
          </BusyButton>
        </div>
      ))}

      {/* まとめて完了確認は管理者のみ（★2026-09-23） */}
      {isAdmin(auth.role) && (
        <>
          <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginBottom: 8 }}>
            作業終了時刻まで入力済みの車輌だけを対象に、まとめて完了確認します
          </div>
          <BusyButton variant="danger" onClick={() => run(() => bulkConfirmDelivery(auth, scheduleIds), '完了確認')}>
            まとめて完了確認する
          </BusyButton>

          {/* ★2026-11-23：実績・時刻が未入力の便も、先に完了確認する（数字は後から管理者が入力） */}
          <div style={{ fontSize: 13, color: 'var(--c-text-3)', margin: '16px 0 8px', lineHeight: 1.6 }}>
            実績や時刻が未入力の車輌も含めて、まとめて完了確認します。
            実績が無い車輌は、空の積込実績・搬入実績を作ってから確認します（取消・中止・車輌未定は対象外）。
            完了確認した便は、後から管理者だけが入力・修正できます。
          </div>
          <BusyButton
            variant="danger"
            onClick={() => {
              if (!window.confirm('実績や時刻が未入力の便も含めて、この納品先の便をすべて完了確認します。よろしいですか？\n\n完了確認した便は、太協（現場）からは入力・修正できなくなります。')) return;
              return run(() => bulkConfirmDelivery(auth, scheduleIds, true), '完了確認（未入力含む）');
            }}
          >
            未入力の便も含めて完了確認する
          </BusyButton>
        </>
      )}

      {resultMsg && <div style={{ fontSize: 13, color: 'var(--c-ok)', marginTop: 12 }}>✓ {resultMsg}</div>}
      <ErrorMsg message={error} />
    </div>
  );
}
