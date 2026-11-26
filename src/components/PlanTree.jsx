import { StatusBadge, statusAccentColor } from './UI';
import { OrderButton, UNDECIDED_BADGE } from './FormParts';
import {
  ikebaBaseName,
  ikebaRegion,
  kaimenPersonName,
  kaimenLocation,
  deliveryDestName,
  vehicleWithCarrier,
  tantoushaName,
  originIkebaName,
} from '../lib/masterLookup';
import { isTaikyo, isAdmin } from '../lib/roles';
import { num, kgText, isInactiveStatus, representativeId } from '../lib/planUtils';

/**
 * 1つの池場のまとまり（★2026-11-24 親子方式）：池場（池場日誌） → 親（海面業者・浜） → 割当（車輌）
 * ホームと積込予定一覧の両方で使う。
 *
 * node：getPlanTree の「池場」1件 { 池場ID, 池場日誌, 親: [...], ステータス, 予定数量kg }
 */
export default function IkebaCard({
  date,
  node,
  masters,
  role,
  open,
  onToggle,
  planOpen,
  onTogglePlan,
  onOpenPlan,
  onOpenRun,
  onOpenPondLog,
  onOpenBulk,
  onMovePlan,
  onMoveAlloc,
  moving,
}) {
  const taikyo = isTaikyo(role);
  const admin = isAdmin(role);
  const ikebaId = node['池場ID'];
  const plans = node['親'] || [];
  const pond = node['池場日誌'];

  // 台数：取消・中止を除いた運行の数（積み分けの車は1台と数える）
  const runIds = new Set();
  plans.forEach((p) =>
    (p['割当'] || []).forEach((a) => {
      if (!isInactiveStatus(a['ステータス'])) runIds.add(a['運行ID'] || a['積込予定ID']);
    })
  );
  const totalKg = taikyo
    ? num(node['予定数量kg'])
    : plans.reduce((s, p) => s + planVisibleKg(p), 0);

  return (
    <div
      style={{
        background: 'var(--c-bg-2)',
        border: '1px solid var(--c-border)',
        borderRadius: 12,
        marginBottom: 10,
        overflow: 'hidden',
      }}
    >
      <button onClick={onToggle} style={headerBtnStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 17, fontWeight: 700 }}>{ikebaBaseName(masters, ikebaId)}</span>
          {ikebaRegion(masters, ikebaId) && (
            <span style={{ fontSize: 13, color: 'var(--c-text-3)' }}>{ikebaRegion(masters, ikebaId)}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: 15, fontWeight: 700 }}>
            <span>{runIds.size}台</span>
            <span>{kgText(totalKg)}kg</span>
          </div>
          <span style={{ color: 'var(--c-text-3)', fontSize: 15 }}>{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <>
          {/* 池場日誌（その日のその池場で1件） */}
          <div style={{ padding: '0 16px 10px', fontSize: 14, color: 'var(--c-text-2)', lineHeight: 1.7 }}>
            {pond ? (
              <div>
                {[
                  pond['天候'],
                  pond['水温'] !== '' && pond['水温'] != null ? `水温 ${pond['水温']}℃` : '',
                  pond['気温'] !== '' && pond['気温'] != null ? `気温 ${pond['気温']}℃` : '',
                ]
                  .filter(Boolean)
                  .join('／') || '池場日誌：天候・水温は未入力'}
                <br />
                内水面立会者：
                {[pond['内水面立会者ID1'], pond['内水面立会者ID2']]
                  .filter(Boolean)
                  .map((w) => tantoushaName(masters, w))
                  .join('・') || '未定'}
              </div>
            ) : (
              <div style={{ color: 'var(--c-text-3)' }}>池場日誌：未入力（内水面立会者も未定）</div>
            )}
            {taikyo && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                <button style={linkBtnStyle} onClick={() => onOpenPondLog(date, ikebaId)}>
                  池場日誌 ›
                </button>
                {admin && onOpenBulk && (
                  <button style={linkBtnStyle} onClick={() => onOpenBulk(date, ikebaId)}>
                    まとめて修正・完了確認 ›
                  </button>
                )}
              </div>
            )}
          </div>

          {plans.map((p, idx) => (
            <PlanRow
              key={p['搬入予定ID']}
              plan={p}
              idx={idx}
              count={plans.length}
              masters={masters}
              taikyo={taikyo}
              open={planOpen(p['搬入予定ID'])}
              onToggle={() => onTogglePlan(p['搬入予定ID'])}
              onOpenPlan={onOpenPlan}
              onOpenRun={onOpenRun}
              onMovePlan={onMovePlan}
              onMoveAlloc={onMoveAlloc}
              moving={moving}
            />
          ))}
        </>
      )}
    </div>
  );
}

/** 運送会社など、見えている割当だけの数量 */
function planVisibleKg(p) {
  return (p['割当'] || [])
    .filter((a) => !isInactiveStatus(a['ステータス']))
    .reduce((s, a) => s + num(a['予定数量kg']), 0);
}

function PlanRow({ plan, idx, count, masters, taikyo, open, onToggle, onOpenPlan, onOpenRun, onMovePlan, onMoveAlloc, moving }) {
  const st = plan['ステータス'];
  const inactive = isInactiveStatus(st);
  const allocs = plan['割当'] || [];
  const activeAllocs = allocs.filter((a) => !isInactiveStatus(a['ステータス']));
  const kg = taikyo ? (inactive ? 0 : num(plan['予定数量kg'])) : planVisibleKg(plan);
  const remain = num(plan['割当残りkg']);
  const origin = originIkebaName(masters, plan);
  const seaWitness = [plan['予定海面立会者ID1'], plan['予定海面立会者ID2']]
    .filter(Boolean)
    .map((w) => tantoushaName(masters, w))
    .join('・');

  return (
    <div style={{ borderTop: '1px solid var(--c-border)' }}>
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <button
          onClick={onToggle}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '10px 16px 10px 12px',
            background: 'var(--c-ok-bg)',
            border: 'none',
            borderLeft: `5px solid ${statusAccentColor(st)}`,
            color: 'var(--c-ok)',
            cursor: 'pointer',
            minHeight: 42,
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{kaimenPersonName(masters, plan['海面業者ID'])}</span>
              <span style={{ fontSize: 13, opacity: 0.9 }}>
                {kaimenLocation(masters, plan['海面業者ID'])}
                {kaimenLocation(masters, plan['海面業者ID']) ? '　' : ''}浜：{deliveryDestName(masters, plan['配送先ID'])}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: 14, fontWeight: 700 }}>
              <span>{activeAllocs.length}台</span>
              <span>{kgText(kg)}kg</span>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <StatusBadge status={st} />
              {taikyo && !inactive && plan['車輌未定'] && <span style={UNDECIDED_BADGE}>車輌未定</span>}
              {taikyo && !inactive && !plan['車輌未定'] && remain > 0 && (
                <span style={{ ...UNDECIDED_BADGE, background: 'var(--c-warn)', color: '#2b1d00' }}>
                  割当残り {kgText(remain)}kg
                </span>
              )}
            </div>
            <span style={{ opacity: 0.8, fontSize: 14 }}>{open ? '▲' : '▼'}</span>
          </div>
        </button>
        {onMovePlan && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 4, background: 'var(--c-ok-bg)' }}>
            <OrderButton label="▲" title="この納品先を上へ" disabled={moving || idx === 0} onClick={() => onMovePlan(idx, -1)} />
            <OrderButton label="▼" title="この納品先を下へ" disabled={moving || idx === count - 1} onClick={() => onMovePlan(idx, 1)} />
          </div>
        )}
      </div>

      {open && (
        <div style={{ background: 'var(--c-bg)' }}>
          <div style={{ padding: '8px 16px 4px 28px', fontSize: 14, color: 'var(--c-text-2)', lineHeight: 1.7 }}>
            {taikyo && <div>予定数量：{kgText(plan['予定数量kg'])}kg（入れ目 {plan['予定入れ目率'] || 0}%）</div>}
            {plan['到着予定時刻'] && <div>到着予定：{plan['到着予定時刻']}</div>}
            {origin && <div>元の池：{origin}</div>}
            {seaWitness && <div>海面立会者（予定）：{seaWitness}</div>}
            {st === '中止' && plan['中止理由'] && (
              <div style={{ color: '#b39ddb' }}>
                中止理由：{plan['中止理由']}
                {plan['中止理由メモ'] ? `／${plan['中止理由メモ']}` : ''}
              </div>
            )}
          </div>

          {allocs.map((a, i) => (
            <div
              key={a['積込予定ID']}
              onClick={taikyo && a['運行ID'] ? () => onOpenRun(a['運行ID'], plan['搬入予定ID']) : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px 10px 28px',
                borderTop: '1px solid var(--c-border)',
                background: 'var(--c-warn-bg)',
                cursor: taikyo && a['運行ID'] ? 'pointer' : 'default',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--c-text)' }}>
                    {vehicleWithCarrier(masters, a['車輌ID'])}
                    {num(a['回目']) > 1 && (
                      <span style={{ marginLeft: 6, fontSize: 13, color: 'var(--c-warn)' }}>{a['回目']}回目</span>
                    )}
                    {taikyo && allocs.length > 1 && representativeId(plan) === a['積込予定ID'] && (
                      <span style={{ marginLeft: 6, padding: '1px 8px', borderRadius: 999, border: '1px solid var(--c-accent)', color: 'var(--c-accent)', fontSize: 12 }}>代表</span>
                    )}
                  </span>
                  <StatusBadge status={a['ステータス']} />
                </div>
                <div style={{ fontSize: 14, color: 'var(--c-text)', marginTop: 4 }}>
                  割当：{kgText(a['予定数量kg'])}kg
                  {a['実績数量kg'] !== '' && a['実績数量kg'] != null && `　計量：${kgText(a['実績数量kg'])}kg`}
                  {a['行き先未選択'] && <span style={{ color: 'var(--c-warn)' }}>　行き先未選択</span>}
                </div>
                {a['ステータス'] === '中止' && st !== '中止' && a['中止理由'] && (
                  <div style={{ fontSize: 13, color: '#b39ddb', marginTop: 2 }}>
                    この車だけ中止：{a['中止理由']}
                    {a['中止理由メモ'] ? `／${a['中止理由メモ']}` : ''}
                  </div>
                )}
                {taikyo && a['運行ID'] && (
                  <div style={{ fontSize: 13, color: 'var(--c-accent)', marginTop: 4, textAlign: 'right' }}>積込・計量 ›</div>
                )}
              </div>
              {onMoveAlloc && allocs.length > 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <OrderButton label="▲" title="この車輌を上へ" disabled={moving || i === 0} onClick={() => onMoveAlloc(plan, i, -1)} />
                  <OrderButton
                    label="▼"
                    title="この車輌を下へ"
                    disabled={moving || i === allocs.length - 1}
                    onClick={() => onMoveAlloc(plan, i, 1)}
                  />
                </div>
              )}
            </div>
          ))}

          {taikyo && !inactive && plan['車輌未定'] && (
            <div style={{ padding: '10px 16px 10px 28px', borderTop: '1px solid var(--c-border)', fontSize: 14 }}>
              <span style={UNDECIDED_BADGE}>車輌未定</span>
              <span style={{ marginLeft: 8, color: 'var(--c-text-2)' }}>車輌はまだ割り当てられていません</span>
            </div>
          )}

          {taikyo && (
            <div style={{ padding: '10px 16px 12px 28px', borderTop: '1px solid var(--c-border)', textAlign: 'right' }}>
              <button style={openPlanBtnStyle} onClick={() => onOpenPlan(plan['搬入予定ID'])}>
                この納品先を開く（車輌・現場・中止） ›
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const headerBtnStyle = {
  width: '100%',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  padding: '12px 16px',
  background: 'transparent',
  border: 'none',
  color: 'var(--c-text)',
  cursor: 'pointer',
  minHeight: 42,
  textAlign: 'left',
};

const linkBtnStyle = {
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

const openPlanBtnStyle = {
  minHeight: 42,
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid var(--c-accent)',
  background: 'var(--c-bg-2)',
  color: 'var(--c-accent)',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
};
