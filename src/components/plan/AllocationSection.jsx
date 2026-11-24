import { useState } from 'react';
import { StatusBadge, ErrorMsg } from '../UI';
import BusyButton from '../BusyButton';
import TimeField from '../TimeField';
import { Field, Section, StopPanel, OrderButton, inputStyle, smallBtnStyle, UNDECIDED_BADGE } from '../FormParts';
import {
  assignVehicle,
  updateAllocation,
  unassignVehicle,
  stopAllocation,
  resumeAllocation,
  reorderAllocations,
  saveAllocationDelivery,
} from '../../lib/api';
import { vehicleWithCarrier, kaimenPersonName, deliveryDestName } from '../../lib/masterLookup';
import { isAdmin, isTaikyo } from '../../lib/roles';
import { num, kgText, isInactiveStatus } from '../../lib/planUtils';

/**
 * 親にぶら下がる車輌（割当）の一覧と操作（★2026-11-24 親子方式）
 * ・車輌を付ける・外す・入れ替える・数量を変える：管理者
 * ・並べ替え、この車だけ中止、車ごとの入力（車輌の水温・時刻の上書き）：太協・管理者
 * ・中止の取り消し：管理者
 */
export default function AllocationSection({ auth, masters, plan, runs, locked, onChanged, onOpenRun }) {
  const admin = isAdmin(auth.role);
  const taikyo = isTaikyo(auth.role);
  const planInactive = isInactiveStatus(plan['予定状態']); // 親が取消・中止
  const allocs = plan['割当'] || [];
  const [error, setError] = useState('');
  const [moving, setMoving] = useState(false);
  const [showAssign, setShowAssign] = useState(false);

  const remain = num(plan['割当残りkg']);

  async function move(i, dir) {
    const t = i + dir;
    if (t < 0 || t >= allocs.length || moving) return;
    const ids = allocs.map((a) => a['積込予定ID']);
    [ids[i], ids[t]] = [ids[t], ids[i]];
    setError('');
    setMoving(true);
    try {
      await reorderAllocations(auth, plan['搬入予定ID'], ids);
      await onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setMoving(false);
    }
  }

  return (
    <Section
      title={`車輌（${allocs.length}台）`}
      right={
        <span style={{ fontSize: 13, color: 'var(--c-text-2)' }}>
          割当 {kgText(plan['割当済kg'])}kg／予定 {kgText(plan['予定数量kg'])}kg
        </span>
      }
    >
      {allocs.length === 0 && !planInactive && (
        <div style={{ fontSize: 14, marginBottom: 12 }}>
          <span style={UNDECIDED_BADGE}>車輌未定</span>
          <span style={{ marginLeft: 8, color: 'var(--c-text-2)' }}>
            {admin ? '下の「＋車輌を割り当てる」から付けてください。' : '車輌は管理者が割り当てます。'}
          </span>
        </div>
      )}
      {allocs.length > 0 && remain > 0 && !planInactive && (
        <div style={{ fontSize: 14, color: 'var(--c-warn)', marginBottom: 10 }}>割当残り {kgText(remain)}kg（車輌未定）</div>
      )}
      {remain < 0 && (
        <div style={{ fontSize: 14, color: 'var(--c-danger)', marginBottom: 10 }}>
          割当の合計が予定数量を {kgText(-remain)}kg 超えています（予定数量か割当数量を直してください）
        </div>
      )}

      <ErrorMsg message={error} />

      {allocs.map((a, i) => (
        <AllocationCard
          key={a['積込予定ID']}
          auth={auth}
          masters={masters}
          plan={plan}
          alloc={a}
          run={runs.find((r) => r['運行ID'] === a['運行ID'])}
          locked={locked}
          planInactive={planInactive}
          onChanged={onChanged}
          onOpenRun={onOpenRun}
          orderButtons={
            taikyo && allocs.length > 1 ? (
              <>
                <OrderButton label="▲" title="上へ" disabled={moving || i === 0} onClick={() => move(i, -1)} />
                <OrderButton label="▼" title="下へ" disabled={moving || i === allocs.length - 1} onClick={() => move(i, 1)} />
              </>
            ) : null
          }
        />
      ))}

      {admin && !planInactive && (
        <div style={{ marginBottom: 12 }}>
          {!showAssign ? (
            <button type="button" style={dashedBtnStyle} onClick={() => setShowAssign(true)}>
              ＋ 車輌を割り当てる
            </button>
          ) : (
            <AssignPanel
              auth={auth}
              masters={masters}
              plan={plan}
              defaultKg={remain > 0 ? remain : ''}
              onDone={async () => {
                setShowAssign(false);
                await onChanged();
              }}
              onCancel={() => setShowAssign(false)}
            />
          )}
        </div>
      )}
    </Section>
  );
}

function AllocationCard({ auth, masters, plan, alloc, run, locked, planInactive, onChanged, onOpenRun, orderButtons }) {
  const admin = isAdmin(auth.role);
  const taikyo = isTaikyo(auth.role);
  const [panel, setPanel] = useState(''); // '' | 'car' | 'edit' | 'stop'
  const [error, setError] = useState('');
  const st = alloc['ステータス'];
  const allocStopped = alloc['予定状態'] === '中止' && plan['予定状態'] !== '中止';
  const canWrite = taikyo && !locked && !planInactive;
  const others = (run?.['割当'] || []).filter((x) => x['積込予定ID'] !== alloc['積込予定ID']);

  function toggle(name) {
    setError('');
    setPanel((p) => (p === name ? '' : name));
  }

  async function handleUnassign() {
    setError('');
    if (!window.confirm(`${vehicleWithCarrier(masters, alloc['車輌ID'])} をこの納品先から外しますか？\n\n外した数量は「割当残り（車輌未定）」に戻ります。`)) return;
    try {
      await unassignVehicle(auth, alloc['積込予定ID']);
      await onChanged();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleResume() {
    setError('');
    if (!window.confirm('この車輌の中止を取り消して、通常に戻しますか？\n\n中止理由と待機料は消えます。')) return;
    try {
      await resumeAllocation(auth, alloc['積込予定ID']);
      await onChanged();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div style={{ border: '1px solid var(--c-border-2)', borderRadius: 10, padding: 12, marginBottom: 10, background: 'var(--c-bg)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>
              {vehicleWithCarrier(masters, alloc['車輌ID'])}
              {num(alloc['回目']) > 1 && <span style={{ marginLeft: 6, fontSize: 13, color: 'var(--c-warn)' }}>{alloc['回目']}回目</span>}
            </span>
            <StatusBadge status={st} />
          </div>
          <div style={{ fontSize: 14, marginTop: 4, color: 'var(--c-text-2)', lineHeight: 1.7 }}>
            割当：{kgText(alloc['予定数量kg'])}kg
            {alloc['実績数量kg'] !== '' && alloc['実績数量kg'] != null && `　計量（この納品先の分）：${kgText(alloc['実績数量kg'])}kg`}
            {alloc['行き先未選択'] && <div style={{ color: 'var(--c-warn)' }}>計量の行き先が選ばれていない回があります（割当数量で按分して表示）</div>}
            {others.length > 0 && (
              <div style={{ color: 'var(--c-accent)' }}>
                積み分け：
                {others
                  .map((o) => `${kaimenPersonName(masters, o['海面業者ID'])}（${deliveryDestName(masters, o['配送先ID'])}）${kgText(o['割当数量kg'])}kg`)
                  .join('、')}
              </div>
            )}
            {alloc['車輌水温'] !== '' && alloc['車輌水温'] != null && <div>車輌の水温：{alloc['車輌水温']}℃</div>}
            {['出発時刻上書き', '浜到着時刻上書き', '作業開始時刻上書き', '作業終了時刻上書き'].some((k) => alloc[k]) && (
              <div>
                この車だけの時刻：
                {[
                  ['出発', '出発時刻上書き'],
                  ['浜到着', '浜到着時刻上書き'],
                  ['作業開始', '作業開始時刻上書き'],
                  ['作業終了', '作業終了時刻上書き'],
                ]
                  .filter(([, k]) => alloc[k])
                  .map(([l, k]) => `${l} ${alloc[k]}`)
                  .join('／')}
              </div>
            )}
            {allocStopped && (
              <div style={{ color: '#b39ddb' }}>
                この車だけ中止：{alloc['中止理由']}
                {alloc['中止理由メモ'] ? `／${alloc['中止理由メモ']}` : ''}
              </div>
            )}
          </div>
        </div>
        {orderButtons && <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{orderButtons}</div>}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        {taikyo && alloc['運行ID'] && (
          <button style={{ ...smallBtnStyle, color: 'var(--c-accent)', borderColor: 'var(--c-accent)' }} onClick={() => onOpenRun(alloc['運行ID'])}>
            積込・計量 ›
          </button>
        )}
        {canWrite && !isInactiveStatus(st) && (
          <button style={smallBtnStyle} onClick={() => toggle('car')}>
            車ごとの入力
          </button>
        )}
        {admin && !planInactive && (
          <button style={smallBtnStyle} onClick={() => toggle('edit')}>
            数量・車輌の変更
          </button>
        )}
        {admin && !planInactive && (
          <button style={{ ...smallBtnStyle, color: 'var(--c-danger)' }} onClick={handleUnassign}>
            外す
          </button>
        )}
        {canWrite && !isInactiveStatus(st) && (
          <button style={{ ...smallBtnStyle, color: '#b39ddb' }} onClick={() => toggle('stop')}>
            この車だけ中止
          </button>
        )}
        {admin && allocStopped && (
          <button style={{ ...smallBtnStyle, color: '#b39ddb' }} onClick={handleResume}>
            中止を取り消す
          </button>
        )}
      </div>
      <ErrorMsg message={error} />

      {panel === 'car' && (
        <CarInputPanel
          auth={auth}
          alloc={alloc}
          plan={plan}
          onSaved={async () => {
            setPanel('');
            await onChanged();
          }}
        />
      )}
      {panel === 'edit' && (
        <EditPanel
          auth={auth}
          masters={masters}
          alloc={alloc}
          run={run}
          onSaved={async () => {
            setPanel('');
            await onChanged();
          }}
        />
      )}
      {panel === 'stop' && (
        <StopPanel
          description="天候・海況などで、この車輌だけ実行できなかったときに使います。納品先ごと中止するときは、下の「中止・取消・完了確認」から操作します。"
          onSubmit={async (reason, note) => {
            await stopAllocation(auth, alloc['積込予定ID'], reason, note);
            setPanel('');
            await onChanged();
          }}
        />
      )}
    </div>
  );
}

/** 車ごとの入力：車輌の水温と、納品先とずれた車だけの時刻 */
function CarInputPanel({ auth, alloc, plan, onSaved }) {
  const [f, setF] = useState({
    車輌水温: alloc['車輌水温'] ?? '',
    出発時刻上書き: alloc['出発時刻上書き'] || '',
    浜到着時刻上書き: alloc['浜到着時刻上書き'] || '',
    作業開始時刻上書き: alloc['作業開始時刻上書き'] || '',
    作業終了時刻上書き: alloc['作業終了時刻上書き'] || '',
  });
  const [error, setError] = useState('');
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    setError('');
    try {
      await saveAllocationDelivery(auth, alloc['積込予定ID'], f);
      await onSaved();
    } catch (e) {
      setError(e.message);
    }
  }

  const base = (k) => (plan[k] ? `（納品先：${plan[k]}）` : '（納品先：未入力）');

  return (
    <div style={panelStyle}>
      <Field label="車輌の水温（℃）※搬入時の運搬車輌（水槽）の水温">
        <input
          type="number"
          step="0.1"
          inputMode="decimal"
          value={f.車輌水温}
          onChange={(e) => set('車輌水温', e.target.value)}
          style={{ ...inputStyle, width: 140 }}
        />
      </Field>
      <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginBottom: 10, lineHeight: 1.6 }}>
        時刻は、ほかの車とずれたときだけ入れます。空欄なら納品先の時刻を使います。
      </div>
      <TimeField label={`出発時刻${base('出発時刻')}`} value={f.出発時刻上書き} onChange={(v) => set('出発時刻上書き', v)} />
      <TimeField label={`浜到着時刻${base('浜到着時刻')}`} value={f.浜到着時刻上書き} onChange={(v) => set('浜到着時刻上書き', v)} />
      <TimeField label={`作業開始時刻${base('作業開始時刻')}`} value={f.作業開始時刻上書き} onChange={(v) => set('作業開始時刻上書き', v)} />
      <TimeField label={`作業終了時刻${base('作業終了時刻')}`} value={f.作業終了時刻上書き} onChange={(v) => set('作業終了時刻上書き', v)} />
      <ErrorMsg message={error} />
      <BusyButton onClick={save}>この車の入力を保存</BusyButton>
    </div>
  );
}

/** 数量・車輌・回目の変更（管理者） */
function EditPanel({ auth, masters, alloc, run, onSaved }) {
  const [kg, setKg] = useState(alloc['予定数量kg'] ?? '');
  const [vehicleId, setVehicleId] = useState(alloc['車輌ID'] || '');
  const [runNo, setRunNo] = useState(String(alloc['回目'] || '1'));
  const [error, setError] = useState('');
  const hasLoading = !!run?.['積込開始時刻'] || (run?.['明細'] || []).length > 0;

  async function save() {
    setError('');
    if (!(num(kg) > 0)) {
      setError('割当数量を入力してください');
      return;
    }
    const changes = { kg: String(num(kg)) };
    if (vehicleId !== alloc['車輌ID']) changes.vehicleId = vehicleId;
    if (runNo !== String(alloc['回目'] || '1')) changes.runNo = Number(runNo);
    try {
      await updateAllocation(auth, alloc['積込予定ID'], changes);
      await onSaved();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div style={panelStyle}>
      <Field label="割当数量（kg）">
        <input type="number" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} style={{ ...inputStyle, width: 160 }} />
      </Field>
      <Field label="車輌">
        <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} style={inputStyle} disabled={hasLoading}>
          {(masters?.車輌 || []).map((x) => (
            <option key={x['車輌ID']} value={x['車輌ID']}>
              {vehicleWithCarrier(masters, x['車輌ID'])}
            </option>
          ))}
        </select>
        {hasLoading && (
          <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginTop: 4 }}>
            積込の入力があるため、車輌・回目は変えられません（数量は変えられます）
          </div>
        )}
      </Field>
      <Field label="回目">
        <select value={runNo} onChange={(e) => setRunNo(e.target.value)} style={{ ...inputStyle, width: 140 }} disabled={hasLoading}>
          {['1', '2', '3'].map((n) => (
            <option key={n} value={n}>
              {n}回目
            </option>
          ))}
        </select>
      </Field>
      <ErrorMsg message={error} />
      <BusyButton onClick={save}>変更を保存</BusyButton>
    </div>
  );
}

/** 車輌を割り当てる（管理者） */
function AssignPanel({ auth, masters, plan, defaultKg, onDone, onCancel }) {
  const [vehicleId, setVehicleId] = useState('');
  const [kg, setKg] = useState(defaultKg === '' ? '' : String(defaultKg));
  const [runNo, setRunNo] = useState('1');
  const [error, setError] = useState('');
  const used = new Set((plan['割当'] || []).map((a) => `${a['車輌ID']}|${a['回目'] || '1'}`));
  const vehicle = (masters?.車輌 || []).find((x) => x['車輌ID'] === vehicleId);
  const maxKg = num(vehicle?.['最大積載数量kg']);

  async function save() {
    setError('');
    if (!vehicleId) {
      setError('車輌を選んでください');
      return;
    }
    if (!(num(kg) > 0)) {
      setError('割当数量を入力してください');
      return;
    }
    try {
      await assignVehicle(auth, plan['搬入予定ID'], vehicleId, String(num(kg)), Number(runNo));
      await onDone();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div style={panelStyle}>
      <Field label="車輌">
        <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} style={inputStyle}>
          <option value="">選択してください</option>
          {(masters?.車輌 || []).map((x) => (
            <option key={x['車輌ID']} value={x['車輌ID']}>
              {vehicleWithCarrier(masters, x['車輌ID'])}
              {x['最大積載数量kg'] ? `　最大${x['最大積載数量kg']}kg` : ''}
            </option>
          ))}
        </select>
      </Field>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Field label="割当数量（kg）" style={{ flex: 1, minWidth: 140 }}>
          <input type="number" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="回目（同じ日に2回走るとき2）" style={{ width: 160 }}>
          <select value={runNo} onChange={(e) => setRunNo(e.target.value)} style={inputStyle}>
            {['1', '2', '3'].map((n) => (
              <option key={n} value={n}>
                {n}回目
              </option>
            ))}
          </select>
        </Field>
      </div>
      {vehicleId && used.has(`${vehicleId}|${runNo}`) && (
        <div style={{ fontSize: 13, color: 'var(--c-danger)', marginBottom: 8 }}>この車輌・回目は、すでにこの納品先に付いています</div>
      )}
      {maxKg > 0 && num(kg) > maxKg && (
        <div style={{ fontSize: 13, color: 'var(--c-warn)', marginBottom: 8 }}>最大積載数量（{kgText(maxKg)}kg）を超えています</div>
      )}
      <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginBottom: 10, lineHeight: 1.6 }}>
        同じ日・同じ車輌・同じ回目が、ほかの納品先にもすでに付いていれば「積み分け」になります（運賃は1車分）。
      </div>
      <ErrorMsg message={error} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <BusyButton onClick={save}>割り当てる</BusyButton>
        <BusyButton variant="ghost" onClick={onCancel}>
          やめる
        </BusyButton>
      </div>
    </div>
  );
}

const panelStyle = {
  marginTop: 10,
  padding: 12,
  border: '1px solid var(--c-border-2)',
  borderRadius: 10,
  background: 'var(--c-bg-2)',
};

const dashedBtnStyle = {
  minHeight: 42,
  padding: '8px 16px',
  borderRadius: 8,
  border: '1px dashed var(--c-border-2)',
  background: 'transparent',
  color: 'var(--c-text-2)',
  cursor: 'pointer',
};
