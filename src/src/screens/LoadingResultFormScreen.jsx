import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { getScheduleDetail, createLoadingResult, updateLoadingResult } from '../lib/api';
import { formatJP } from '../lib/dateUtils';
import { ikebaName, vehicleLabel, kaimenName } from '../lib/masterLookup';
import { ErrorMsg, LoadingMsg, StatusBadge } from '../components/UI';
import BusyButton from '../components/BusyButton';
import TimeField from '../components/TimeField';

const OTHER_TANTOUSHA = '__OTHER__';
const WEATHER_OPTIONS = ['晴れ', '曇り', '雨', '雪'];
const MAX_DETAILS = 6;

export default function LoadingResultFormScreen({ schedule, onClose, onOpenDeliveryResult }) {
  const { auth } = useAuth();
  const { masters } = useMasters();

  const [detail, setDetail] = useState(null); // getScheduleDetailの結果
  const [loadError, setLoadError] = useState('');
  const [result, setResult] = useState(null); // 保存後にその場で更新するためローカルに保持する
  const [details, setDetails] = useState([]);

  useEffect(() => {
    getScheduleDetail(auth, schedule['積込予定ID'])
      .then((d) => {
        setDetail(d);
        setResult(d.result);
        setDetails(d.details);
      })
      .catch((e) => setLoadError(e.message));
  }, [auth, schedule]);

  if (loadError) {
    return (
      <ScreenShell schedule={schedule} masters={masters} onClose={onClose}>
        <ErrorMsg message={`読み込みに失敗しました：${loadError}`} />
      </ScreenShell>
    );
  }
  if (!detail) {
    return (
      <ScreenShell schedule={schedule} masters={masters} onClose={onClose}>
        <LoadingMsg>読み込んでいます…</LoadingMsg>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell schedule={schedule} masters={masters} onClose={onClose}>
      <LoadingResultForm
        auth={auth}
        masters={masters}
        schedule={schedule}
        result={result}
        details={details}
        onLocalSave={(saved) => {
          setResult(saved.header);
          setDetails(saved.details);
        }}
        onOpenDeliveryResult={result ? onOpenDeliveryResult : undefined}
        onClose={onClose}
      />
    </ScreenShell>
  );
}

function ScreenShell({ schedule, masters, onClose, children }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', color: 'var(--c-text)', padding: '20px 16px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>積込実績の入力</h2>
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
        {schedule['ステータス'] && <span style={{ marginLeft: 8 }}><StatusBadge status={schedule['ステータス']} /></span>}
      </div>
      {children}
    </div>
  );
}

function LoadingResultForm({ auth, masters, schedule, result, details, onLocalSave, onOpenDeliveryResult, onClose }) {
  const isEdit = !!result;

  const taikyoTantousha = useMemo(
    () => (masters?.担当者 || []).filter((t) => t['区分'] === '太協担当'),
    [masters]
  );

  const initialTantoushaId = result?.['実際の内水面立会者ID'] || schedule['内水面立会者ID'] || '';
  const initialIsOther = initialTantoushaId && !taikyoTantousha.some((t) => t['担当者ID'] === initialTantoushaId);

  const [header, setHeader] = useState({
    実積込日: result?.['実積込日'] || schedule['積込日'] || '',
    天候: result?.['天候'] || '',
    気温: result?.['気温'] ?? '',
    水温: result?.['水温'] ?? '',
    溶存酸素: result?.['溶存酸素'] ?? '',
    ワクチン本数: result?.['ワクチン本数'] ?? '',
    積込開始時刻: result?.['積込開始時刻'] || '',
    積込終了時刻: result?.['積込終了時刻'] || '',
    出発時刻: result?.['出発時刻'] || '',
    備考: result?.['備考'] || '',
  });
  const [tantoushaSel, setTantoushaSel] = useState(initialIsOther ? OTHER_TANTOUSHA : initialTantoushaId);
  const [tantoushaFree, setTantoushaFree] = useState(initialIsOther ? initialTantoushaId : '');

  const [rows, setRows] = useState(() => {
    if (details && details.length > 0) {
      return details
        .slice()
        .sort((a, b) => Number(a['積込回次']) - Number(b['積込回次']))
        .map((d) => ({
          id: d['積込実績明細ID'],
          池場ID: d['池場ID'] || schedule['池場ID'],
          実績数量kg: d['実績数量kg'] ?? '',
        }));
    }
    return []; // 初期表示では1回目を自動で用意せず、「＋計量明細を追加」から入力してもらう
  });

  const [error, setError] = useState('');

  function setH(key, val) {
    setHeader((h) => ({ ...h, [key]: val }));
  }
  function setRow(i, key, val) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));
  }
  function addRow() {
    if (rows.length >= MAX_DETAILS) return;
    setRows((rs) => [...rs, { id: null, 池場ID: schedule['池場ID'], 実績数量kg: '' }]);
  }
  function removeRow(i) {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
  }

  const totalKg = rows.reduce((sum, r) => sum + (Number(r['実績数量kg']) || 0), 0);

  // 目標は「予定数量kg × (1 + 予定入れ目率/100)」を毎回その場で計算する。
  // 保存済みの「予定計量数量kg」に頼らないのは、一括登録などで
  // この列が保存されていない予定があり得るため（ズレ・空欄の原因になる）。
  const baseSuryoKg = Number(schedule['予定数量kg']) || 0;
  const iremeRate = Number(schedule['予定入れ目率']) || 0;
  const targetKg = Math.round(baseSuryoKg * (1 + iremeRate / 100));

  // 車輌ごとの水槽容量はマスタ_車輌から参照する。
  const vehicle = (masters?.車輌 || []).find((v) => v['車輌ID'] === schedule['車輌ID']);
  const tankUnitKg = Number(vehicle?.['水槽容量']) || 250;
  const SMALL_UNIT_KG = 250; // 500kg水槽でも250kgバケットで2回に分けて計量することがあるため、常に選択肢として出す

  const remainingKg = targetKg - totalKg;

  // 計量明細の残り枠は「1つの水槽を複数回に分けて計量する場合がある」ため、
  // 水槽数ではなく従来通りMAX_DETAILSを上限とする。
  const availableSlots = Math.max(MAX_DETAILS - rows.length, 0);

  // 指定した単位（250kg or 500kgなど）で計量した場合の提案を1件作る。
  function buildSuggestion(unitKg) {
    if (remainingKg <= 0 || availableSlots <= 0) return null;
    const idealCount = Math.ceil(remainingKg / unitKg);
    const count = Math.min(idealCount, availableSlots);
    const perBucket = Math.round(remainingKg / count);
    return { unitKg, idealCount, count, perBucket, slotShort: idealCount > availableSlots };
  }

  // 500kg水槽の車輌は「500kg×1回」案と「250kg×2回」案の両方を、
  // 250kg水槽の車輌は250kg基準の案のみを提示する。
  // ただし、枠不足で単位に関わらず同じ答え（残り枠数で均等割り）に丸められる場合は、
  // 単位違いの同じ内容が重複表示されてしまうため、枠内に収まる提案だけを個別表示し、
  // どちらも収まらない場合は単位に関係ない共通の1行にまとめる。
  const rawSuggestions = (tankUnitKg > SMALL_UNIT_KG
    ? [buildSuggestion(tankUnitKg), buildSuggestion(SMALL_UNIT_KG)]
    : [buildSuggestion(SMALL_UNIT_KG)]
  ).filter(Boolean);
  const feasibleSuggestions = rawSuggestions.filter((s) => !s.slotShort);
  const genericPerBucket =
    availableSlots > 0 && remainingKg > 0 ? Math.round(remainingKg / availableSlots) : 0;

  function buildTantoushaId() {
    return tantoushaSel === OTHER_TANTOUSHA ? tantoushaFree.trim() : tantoushaSel;
  }

  function validate() {
    if (!header.実積込日) return '実積込日を入力してください';
    if (tantoushaSel === OTHER_TANTOUSHA && !tantoushaFree.trim()) {
      return '内水面立会者の氏名を入力してください（その他を選んだ場合）';
    }
    if (rows.length === 0) return '計量明細を1件以上入力してください';
    return '';
  }

  async function handleSave() {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError('');
    const headerData = {
      ...header,
      実際の内水面立会者ID: buildTantoushaId(),
    };
    const detailData = rows.map((r) => {
      const d = { 池場ID: r['池場ID'], 実績数量kg: r['実績数量kg'] };
      if (r.id) d['積込実績明細ID'] = r.id;
      return d;
    });

    try {
      let saved;
      if (isEdit) {
        saved = await updateLoadingResult(auth, result['積込実績ID'], headerData, detailData);
      } else {
        saved = await createLoadingResult(auth, schedule['積込予定ID'], headerData, detailData);
      }
      // 保存後もこの画面に留まる仕様のため、明細行のローカル状態を実際に採番されたIDで
      // 再同期しておく（そうしないと、次にもう一度保存したときに同じ行が二重登録されてしまう）。
      // 想定外の形（古いGASデプロイ等）が返ってきても、ここでエラー表示に落とす。
      const savedDetails = saved && saved.details;
      if (!savedDetails) {
        throw new Error(
          '保存はできましたが、想定外の形式で応答が返ってきました。GASが最新版か確認してください。'
        );
      }
      setRows(
        savedDetails
          .slice()
          .sort((a, b) => Number(a['積込回次']) - Number(b['積込回次']))
          .map((d) => ({
            id: d['積込実績明細ID'],
            池場ID: d['池場ID'],
            実績数量kg: d['実績数量kg'] ?? '',
          }))
      );
      onLocalSave(saved); // 画面遷移はせず、その場で編集モードに切り替える（続けて搬入実績に進めるように）
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div>
      <Field label="実積込日">
        <input
          type="date"
          value={header.実積込日}
          onChange={(e) => setH('実積込日', e.target.value)}
          style={inputStyle}
        />
      </Field>

      <Field label="内水面立会者">
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

      <Field label="天候">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {WEATHER_OPTIONS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setH('天候', header.天候 === w ? '' : w)}
              style={{
                minHeight: 42,
                padding: '8px 18px',
                borderRadius: 8,
                fontSize: 15,
                border: '1px solid var(--c-border-2)',
                background: header.天候 === w ? 'var(--c-accent)' : 'transparent',
                color: header.天候 === w ? '#03202e' : 'var(--c-text)',
                cursor: 'pointer',
              }}
            >
              {w}
            </button>
          ))}
        </div>
      </Field>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Field label="気温（℃）" style={{ flex: 1, minWidth: 120 }}>
          <input type="number" value={header.気温} onChange={(e) => setH('気温', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="水温（℃）" style={{ flex: 1, minWidth: 120 }}>
          <input type="number" value={header.水温} onChange={(e) => setH('水温', e.target.value)} style={inputStyle} />
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Field label="溶存酸素（mg/L）" style={{ flex: 1, minWidth: 120 }}>
          <input
            type="number"
            step="0.1"
            value={header.溶存酸素}
            onChange={(e) => setH('溶存酸素', e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="ワクチン本数" style={{ flex: 1, minWidth: 120 }}>
          <input
            type="number"
            value={header.ワクチン本数}
            onChange={(e) => setH('ワクチン本数', e.target.value)}
            style={inputStyle}
          />
        </Field>
      </div>

      <TimeField label="積込開始時刻" value={header.積込開始時刻} onChange={(v) => setH('積込開始時刻', v)} />
      <TimeField label="積込終了時刻" value={header.積込終了時刻} onChange={(v) => setH('積込終了時刻', v)} />
      <TimeField label="出発時刻" value={header.出発時刻} onChange={(v) => setH('出発時刻', v)} />

      <Field label="備考">
        <textarea
          value={header.備考}
          onChange={(e) => setH('備考', e.target.value)}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </Field>

      <div style={{ margin: '24px 0 10px', fontSize: 16, fontWeight: 700 }}>
        計量明細（合計 {totalKg.toLocaleString()}kg・{rows.length}回）
      </div>

      {targetKg > 0 && (
        <div
          style={{
            border: '1px solid var(--c-border-2)',
            borderRadius: 10,
            padding: '12px 14px',
            marginBottom: 14,
            background: 'var(--c-bg-2)',
            fontSize: 14,
          }}
        >
          <div style={{ color: 'var(--c-text-2)' }}>
            目標（予定数量{baseSuryoKg.toLocaleString()}kg × 入れ目{iremeRate}%）：{targetKg.toLocaleString()}kg
          </div>
          {remainingKg > 0 ? (
            <>
              <div style={{ marginTop: 4, fontSize: 16, fontWeight: 700, color: 'var(--c-warn)' }}>
                あと {remainingKg.toLocaleString()}kg
              </div>
              {feasibleSuggestions.length > 0 ? (
                feasibleSuggestions.map((s) => (
                  <div key={s.unitKg} style={{ marginTop: 2, color: 'var(--c-text-2)' }}>
                    {`${s.unitKg}kg基準：残り${s.count}回・1回あたり約${s.perBucket.toLocaleString()}kgで目標に到達`}
                  </div>
                ))
              ) : availableSlots > 0 ? (
                <div style={{ marginTop: 2, color: 'var(--c-text-2)' }}>
                  {`残り${availableSlots}回で目標に到達するには、1回あたり約${genericPerBucket.toLocaleString()}kgが必要です（250kg・500kgいずれの基準でも枠が足りません）`}
                </div>
              ) : (
                <div style={{ marginTop: 2, color: 'var(--c-danger)' }}>
                  計量明細の残り枠がありません（最大{MAX_DETAILS}回）。既存の明細を見直してください
                </div>
              )}
            </>
          ) : remainingKg < 0 ? (
            <div style={{ marginTop: 4, fontSize: 16, fontWeight: 700, color: 'var(--c-danger)' }}>
              目標を {Math.abs(remainingKg).toLocaleString()}kg 超過しています
            </div>
          ) : (
            <div style={{ marginTop: 4, fontSize: 16, fontWeight: 700, color: 'var(--c-ok)' }}>
              目標に到達しました
            </div>
          )}
        </div>
      )}

      {rows.map((r, i) => (
        <div
          key={i}
          style={{
            border: '1px solid var(--c-border-2)',
            borderRadius: 10,
            padding: 14,
            marginBottom: 10,
            background: 'var(--c-bg-2)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{i + 1}回目</span>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(i)}
                style={{ fontSize: 13, color: 'var(--c-danger)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                この明細を削除
              </button>
            )}
          </div>
          <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginBottom: 10 }}>
            池場：{ikebaName(masters, r['池場ID'])}
          </div>
          <Field label="実績数量（kg）">
            <input
              type="number"
              value={r['実績数量kg']}
              onChange={(e) => setRow(i, '実績数量kg', e.target.value)}
              style={inputStyle}
            />
          </Field>
        </div>
      ))}

      {rows.length < MAX_DETAILS && (
        <button
          type="button"
          onClick={addRow}
          style={{
            minHeight: 42,
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px dashed var(--c-border-2)',
            background: 'transparent',
            color: 'var(--c-text-2)',
            cursor: 'pointer',
            marginBottom: 16,
          }}
        >
          ＋ 計量明細を追加（{rows.length}/{MAX_DETAILS}）
        </button>
      )}

      <ErrorMsg message={error} />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
        <BusyButton onClick={handleSave}>保存</BusyButton>
        <BusyButton variant="ghost" onClick={onClose}>
          閉じる
        </BusyButton>
        {isEdit && (
          <BusyButton variant="ghost" onClick={onOpenDeliveryResult}>
            搬入実績を入力する
          </BusyButton>
        )}
      </div>
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
