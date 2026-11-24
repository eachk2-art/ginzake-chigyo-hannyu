import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { getPlanTree, confirmPlans, bulkEditPlans } from '../lib/api';
import { formatJP } from '../lib/dateUtils';
import { ikebaName, kaimenPersonName, deliveryDestName } from '../lib/masterLookup';
import { ErrorMsg, LoadingMsg, StatusBadge, EmptyMsg } from '../components/UI';
import BusyButton from '../components/BusyButton';
import { Field, ScreenFrame, Section, inputStyle, smallBtnStyle } from '../components/FormParts';
import { kgText } from '../lib/planUtils';

const OPS = [
  { key: 'confirm', label: '完了確認', color: 'var(--c-ok)' },
  { key: 'changeDate', label: '積込日の変更' },
  { key: 'changeIkeba', label: '池場の変更' },
  { key: 'cancel', label: '取消', color: 'var(--c-danger)' },
  { key: 'deleteCancelled', label: '取消予定の削除', color: 'var(--c-danger)' },
];

/**
 * 予定をまとめて修正・完了確認（★2026-11-24 親子方式、管理者のみ）
 * 同じ日・同じ池場の納品先（親）からチェックで選んで、まとめて操作する。
 * ・完了確認：時刻などが未入力でも確認できる（取消・中止・保留・車輌未定・確認済みは飛ばす）
 * ・積込日・池場の変更：入力のある納品先、取消・中止、移した先に同じ浜がある納品先は飛ばす
 */
export default function PlanBulkScreen({ date, ikebaId, onClose }) {
  const { auth } = useAuth();
  const { masters } = useMasters();
  const [plans, setPlans] = useState(null);
  const [error, setError] = useState('');
  const [checked, setChecked] = useState(() => new Set());
  const [op, setOp] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newIkeba, setNewIkeba] = useState('');
  const [reason, setReason] = useState('');
  const [opError, setOpError] = useState('');
  const [result, setResult] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const tree = await getPlanTree(auth, { dateFrom: date, dateTo: date });
      const day = (tree || []).find((d) => d['日付'] === date);
      const node = day ? day['池場'].find((x) => x['池場ID'] === ikebaId) : null;
      setPlans(node ? node['親'] : []);
    } catch (e) {
      setError(e.message);
    }
  }, [auth, date, ikebaId]);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(id) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const label = (id) => {
    const p = (plans || []).find((x) => x['搬入予定ID'] === id);
    return p ? `${kaimenPersonName(masters, p['海面業者ID'])}（${deliveryDestName(masters, p['配送先ID'])}）` : id;
  };

  async function execute() {
    setOpError('');
    setResult(null);
    const ids = Array.from(checked);
    if (ids.length === 0) {
      setOpError('対象の納品先を選んでください');
      return;
    }
    let msg = '';
    if (op === 'confirm') msg = `${ids.length}件を完了確認します（未入力の項目があっても「納品完了」になります）。よろしいですか？`;
    if (op === 'changeDate') {
      if (!newDate) return setOpError('新しい積込日を入れてください');
      msg = `${ids.length}件の積込日を ${formatJP(newDate)} に変えます。よろしいですか？`;
    }
    if (op === 'changeIkeba') {
      if (!newIkeba) return setOpError('新しい池場を選んでください');
      msg = `${ids.length}件の池場を ${ikebaName(masters, newIkeba)} に変えます。よろしいですか？`;
    }
    if (op === 'cancel') msg = `${ids.length}件を取消にします（付いている車輌も取消）。よろしいですか？`;
    if (op === 'deleteCancelled') msg = `取消の${ids.length}件を一覧から削除します。よろしいですか？`;
    if (!window.confirm(msg)) return;

    try {
      let res;
      if (op === 'confirm') {
        const r = await confirmPlans(auth, ids);
        res = { done: r.confirmed || [], skipped: r.skipped || [] };
      } else {
        const extra = op === 'changeDate' ? { date: newDate } : op === 'changeIkeba' ? { ikebaId: newIkeba } : op === 'cancel' ? { reason } : {};
        res = await bulkEditPlans(auth, ids, op, extra);
      }
      // 移した・消した納品先はこの一覧から無くなるので、名前は実行前に控えておく
      const names = {};
      ids.forEach((id) => {
        names[id] = label(id);
      });
      setResult({ ...res, names });
      setChecked(new Set());
      await load();
    } catch (e) {
      setOpError(e.message);
    }
  }

  return (
    <ScreenFrame title="まとめて修正・完了確認" sub={`${formatJP(date)}　${ikebaName(masters, ikebaId)}`} onClose={onClose}>
      {error && <ErrorMsg message={`読み込みに失敗しました：${error}`} onRetry={load} />}
      {!error && plans === null && <LoadingMsg>読み込んでいます…</LoadingMsg>}
      {plans && plans.length === 0 && <EmptyMsg>この日・この池場の予定はありません</EmptyMsg>}

      {plans && plans.length > 0 && (
        <>
          <Section
            title={`納品先を選ぶ（${checked.size}/${plans.length}）`}
            right={
              <button
                style={smallBtnStyle}
                onClick={() => setChecked(checked.size === plans.length ? new Set() : new Set(plans.map((p) => p['搬入予定ID'])))}
              >
                {checked.size === plans.length ? '全部外す' : '全部選ぶ'}
              </button>
            }
          >
            {plans.map((p) => {
              const id = p['搬入予定ID'];
              return (
                <label
                  key={id}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--c-border)', cursor: 'pointer' }}
                >
                  <input type="checkbox" checked={checked.has(id)} onChange={() => toggle(id)} style={{ width: 24, height: 24 }} />
                  <span style={{ flex: 1, fontSize: 14, lineHeight: 1.5 }}>
                    <b>{kaimenPersonName(masters, p['海面業者ID'])}</b>（{deliveryDestName(masters, p['配送先ID'])}）
                    <br />
                    <span style={{ color: 'var(--c-text-2)' }}>
                      {kgText(p['予定数量kg'])}kg・{(p['割当'] || []).length}台{p['車輌未定'] ? '（車輌未定）' : ''}
                    </span>
                  </span>
                  <StatusBadge status={p['ステータス']} />
                </label>
              );
            })}
          </Section>

          <Section title="操作">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              {OPS.map((o) => (
                <button
                  key={o.key}
                  onClick={() => {
                    setOp(o.key);
                    setOpError('');
                    setResult(null);
                  }}
                  style={{
                    ...smallBtnStyle,
                    color: op === o.key ? '#03202e' : o.color || 'var(--c-text)',
                    background: op === o.key ? o.color || 'var(--c-accent)' : 'transparent',
                    borderColor: o.color || 'var(--c-border-2)',
                    fontWeight: 700,
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>

            {op === 'confirm' && (
              <div style={hintStyle}>
                時刻・実績が未入力でも完了確認できます。搬入日が空なら積込日、海面立会者が空なら予定の立会者が入ります。
                取消・中止・保留・車輌未定・確認済みの納品先は飛ばします。
              </div>
            )}
            {op === 'changeDate' && (
              <>
                <div style={hintStyle}>移した納品先は、移した先の並びの最後に入ります。車輌は新しい日の同じ車輌・同じ回目に付け替えます。</div>
                <Field label="新しい積込日">
                  <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} style={{ ...inputStyle, width: 200 }} />
                </Field>
              </>
            )}
            {op === 'changeIkeba' && (
              <>
                <div style={hintStyle}>元の池が新しい池場と合わなくなった納品先は、元の池を空欄にします。</div>
                <Field label="新しい池場">
                  <select value={newIkeba} onChange={(e) => setNewIkeba(e.target.value)} style={inputStyle}>
                    <option value="">選択してください</option>
                    {(masters?.池場 || [])
                      .filter((p) => p['池場ID'] !== ikebaId)
                      .map((p) => (
                        <option key={p['池場ID']} value={p['池場ID']}>
                          {p['池場名']}
                        </option>
                      ))}
                  </select>
                </Field>
              </>
            )}
            {op === 'cancel' && (
              <Field label="取消の理由（備考に入ります。任意）">
                <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} style={inputStyle} />
              </Field>
            )}
            {op === 'deleteCancelled' && <div style={hintStyle}>取消の納品先で、計量が残っていないものだけ削除します（データはDBに残ります）。</div>}

            <ErrorMsg message={opError} />
            {op && (
              <div style={{ marginBottom: 10 }}>
                <BusyButton variant={op === 'cancel' || op === 'deleteCancelled' ? 'danger' : 'primary'} onClick={execute}>
                  選んだ {checked.size}件に実行する
                </BusyButton>
              </div>
            )}

            {result && (
              <div style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 12 }}>
                <div style={{ color: 'var(--c-ok)', fontWeight: 700 }}>実行しました：{(result.done || []).length}件</div>
                {(result.skipped || []).length > 0 && (
                  <div style={{ color: 'var(--c-warn)' }}>
                    飛ばした納品先：
                    {(result.skipped || []).map((s) => (
                      <div key={s['搬入予定ID']}>
                        ・{result.names?.[s['搬入予定ID']] || label(s['搬入予定ID'])}：{s['理由']}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Section>
        </>
      )}
    </ScreenFrame>
  );
}

const hintStyle = { fontSize: 13, color: 'var(--c-text-3)', marginBottom: 12, lineHeight: 1.6 };
