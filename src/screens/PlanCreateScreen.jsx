import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { createPlans } from '../lib/api';
import { ErrorMsg } from '../components/UI';
import BusyButton from '../components/BusyButton';
import TimeField from '../components/TimeField';
import { Field, ScreenFrame, Section, WitnessSelect, inputStyle, smallBtnStyle } from '../components/FormParts';
import { isAdmin } from '../lib/roles';
import { kaimenName, pondNameOnly, vehicleWithCarrier, deliveryDestName } from '../lib/masterLookup';
import { num, kgText, pointsOfKaimen, originOptions, witnessOptions, weighTarget } from '../lib/planUtils';

let seq = 1;
const newKey = () => `k${seq++}`;
const emptyVehicle = () => ({ key: newKey(), 車輌ID: '', 割当数量kg: '', 回目: '1' });
const emptyRow = () => ({
  key: newKey(),
  海面業者ID: '',
  配送先ID: '',
  予定数量kg: '',
  到着予定時刻: '',
  予定海面立会者ID1: '',
  予定海面立会者ID2: '',
  備考: '',
  vehicles: [],
});

/**
 * 予定の登録（★2026-11-24 親子方式）：搬入予定（親）を作る。
 * ・積込日・池場は共通。納品先（海面業者×浜）ごとに1件の親になる。何件でもまとめて登録できる
 * ・車輌はここで付けてもよいし、空のまま（車輌未定）登録して後から管理者が割り当ててもよい
 * ・予定の海面立会者は管理者だけが入れられる（サーバーでも同じ）
 */
export default function PlanCreateScreen({ initial, onDone, onClose }) {
  const { auth } = useAuth();
  const { masters } = useMasters();
  const admin = isAdmin(auth.role);
  const witnesses = witnessOptions(masters);

  const [head, setHead] = useState({
    積込日: initial?.date || '',
    池場ID: initial?.ikebaId || '',
    由来池場ID: '',
    予定入れ目率: '5',
  });
  const [rows, setRows] = useState(() => [emptyRow()]);
  const [error, setError] = useState('');

  const origins = originOptions(masters, head.池場ID);
  const vehicles = masters?.車輌 || [];

  function setH(key, val) {
    setHead((h) => {
      const next = { ...h, [key]: val };
      // 出荷池を変えて、元の池が選択肢から外れたら空にする
      if (key === '池場ID' && next.由来池場ID && !originOptions(masters, val).some((p) => p['池場ID'] === next.由来池場ID)) {
        next.由来池場ID = '';
      }
      return next;
    });
  }

  function setRow(i, key, val) {
    setRows((rs) =>
      rs.map((r, idx) => {
        if (idx !== i) return r;
        const next = { ...r, [key]: val };
        if (key === '海面業者ID') {
          const pts = (masters?.配送先 || []).filter((d) => d['海面業者ID'] === val);
          next.配送先ID = pts.length === 1 ? pts[0]['配送先ID'] : '';
        }
        return next;
      })
    );
  }

  function setVehicle(i, j, key, val) {
    setRows((rs) =>
      rs.map((r, idx) =>
        idx === i ? { ...r, vehicles: r.vehicles.map((v, k) => (k === j ? { ...v, [key]: val } : v)) } : r
      )
    );
  }

  function addVehicle(i) {
    setRows((rs) =>
      rs.map((r, idx) => {
        if (idx !== i) return r;
        const used = r.vehicles.reduce((s, v) => s + num(v.割当数量kg), 0);
        const remain = Math.max(num(r.予定数量kg) - used, 0);
        return { ...r, vehicles: [...r.vehicles, { ...emptyVehicle(), 割当数量kg: remain > 0 ? String(remain) : '' }] };
      })
    );
  }

  function removeVehicle(i, j) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, vehicles: r.vehicles.filter((_, k) => k !== j) } : r)));
  }

  // 同じ車輌・同じ回目を、この画面の中で何kg積むことになるか（最大積載数量の確認用）
  const loadByVehicle = {};
  rows.forEach((r) =>
    r.vehicles.forEach((v) => {
      if (!v.車輌ID) return;
      const k = `${v.車輌ID}|${v.回目 || '1'}`;
      loadByVehicle[k] = (loadByVehicle[k] || 0) + num(v.割当数量kg);
    })
  );
  const overloads = Object.entries(loadByVehicle)
    .map(([k, kg]) => {
      const [vid, no] = k.split('|');
      const max = num(vehicles.find((v) => v['車輌ID'] === vid)?.['最大積載数量kg']);
      return max > 0 && kg > max ? `${vehicleWithCarrier(masters, vid)}（${no}回目）：${kgText(kg)}kg ／ 上限 ${kgText(max)}kg` : '';
    })
    .filter(Boolean);

  function validate() {
    if (!head.積込日) return '積込日を入力してください';
    if (!head.池場ID) return '池場を選んでください';
    const seen = new Set();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const no = rows.length > 1 ? `（${i + 1}件目）` : '';
      if (!r.海面業者ID) return `海面業者を選んでください${no}`;
      if (!r.配送先ID) return `浜を選んでください${no}`;
      if (!(num(r.予定数量kg) > 0)) return `予定数量を入力してください${no}`;
      const k = `${r.海面業者ID}|${r.配送先ID}`;
      if (seen.has(k)) return `同じ海面業者・同じ浜が2件あります。1件にまとめてください${no}`;
      seen.add(k);
      const vk = new Set();
      let sum = 0;
      for (const v of r.vehicles) {
        if (!v.車輌ID) return `車輌を選んでください。付けない場合は「この車輌を外す」を押してください${no}`;
        if (!(num(v.割当数量kg) > 0)) return `車輌の割当数量を入力してください${no}`;
        const key = `${v.車輌ID}|${v.回目}`;
        if (vk.has(key)) return `同じ車輌・同じ回目が2行あります${no}`;
        vk.add(key);
        sum += num(v.割当数量kg);
      }
      if (sum > num(r.予定数量kg) + 0.05) return `車輌の割当数量の合計（${kgText(sum)}kg）が予定数量を超えています${no}`;
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
    const origin = head.由来池場ID && head.由来池場ID !== head.池場ID ? head.由来池場ID : '';
    const dataList = rows.map((r) => {
      const d = {
        積込日: head.積込日,
        池場ID: head.池場ID,
        由来池場ID: origin,
        海面業者ID: r.海面業者ID,
        配送先ID: r.配送先ID,
        予定数量kg: String(num(r.予定数量kg)),
        予定入れ目率: String(num(head.予定入れ目率)),
        到着予定時刻: r.到着予定時刻,
        備考: r.備考,
        車輌: r.vehicles.map((x) => ({ 車輌ID: x.車輌ID, 割当数量kg: String(num(x.割当数量kg)), 回目: Number(x.回目) || 1 })),
      };
      if (admin) {
        d.予定海面立会者ID1 = r.予定海面立会者ID1;
        d.予定海面立会者ID2 = r.予定海面立会者ID2;
      }
      return d;
    });
    try {
      await createPlans(auth, dataList);
      onDone({ date: head.積込日, ikebaId: head.池場ID });
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <ScreenFrame
      title="予定の登録（搬入予定）"
      sub="納品先（海面業者・浜）ごとに1件の予定になります。車輌は空のまま登録して、後から割り当てることもできます。"
      onClose={onClose}
    >
      <Section title="積込日・池場（共通）">
        <Field label="積込日">
          <input type="date" value={head.積込日} onChange={(e) => setH('積込日', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="池場">
          <select value={head.池場ID} onChange={(e) => setH('池場ID', e.target.value)} style={inputStyle}>
            <option value="">選択してください</option>
            {(masters?.池場 || []).map((p) => (
              <option key={p['池場ID']} value={p['池場ID']}>
                {p['池場名']}
              </option>
            ))}
          </select>
        </Field>
        <Field label="元の池（由来）※同じ業者の別の池から移してきた稚魚のときだけ">
          <select
            value={head.由来池場ID}
            onChange={(e) => setH('由来池場ID', e.target.value)}
            style={inputStyle}
            disabled={!head.池場ID}
          >
            <option value="">{head.池場ID ? 'なし（この池で育った稚魚）' : '先に池場を選んでください'}</option>
            {origins.map((p) => (
              <option key={p['池場ID']} value={p['池場ID']}>
                {pondNameOnly(p['池場名'])}
              </option>
            ))}
          </select>
        </Field>
        <Field label="予定入れ目率（％）">
          <input
            type="number"
            inputMode="decimal"
            value={head.予定入れ目率}
            onChange={(e) => setH('予定入れ目率', e.target.value)}
            style={{ ...inputStyle, width: 140 }}
          />
        </Field>
      </Section>

      {rows.map((r, i) => {
        const points = r.海面業者ID ? pointsOfKaimen(masters, r.海面業者ID) : [];
        const allocated = r.vehicles.reduce((s, v) => s + num(v.割当数量kg), 0);
        const remain = num(r.予定数量kg) - allocated;
        return (
          <Section
            key={r.key}
            title={`納品先 ${i + 1}`}
            accent="var(--c-ok)"
            right={
              rows.length > 1 && (
                <button style={{ ...smallBtnStyle, color: 'var(--c-danger)' }} onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}>
                  この納品先を外す
                </button>
              )
            }
          >
            <Field label="海面業者">
              <select value={r.海面業者ID} onChange={(e) => setRow(i, '海面業者ID', e.target.value)} style={inputStyle}>
                <option value="">選択してください</option>
                {(masters?.海面業者 || []).map((k) => (
                  <option key={k['海面業者ID']} value={k['海面業者ID']}>
                    {kaimenName(masters, k['海面業者ID'])}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="浜（必須）">
              <select
                value={r.配送先ID}
                onChange={(e) => setRow(i, '配送先ID', e.target.value)}
                style={inputStyle}
                disabled={!r.海面業者ID}
              >
                <option value="">{r.海面業者ID ? '選択してください' : '先に海面業者を選んでください'}</option>
                {points.map((d) => (
                  <option key={d['配送先ID']} value={d['配送先ID']}>
                    {d['配送先名']}
                  </option>
                ))}
              </select>
            </Field>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Field label="予定数量（kg）" style={{ flex: 1, minWidth: 140 }}>
                <input
                  type="number"
                  inputMode="decimal"
                  value={r.予定数量kg}
                  onChange={(e) => setRow(i, '予定数量kg', e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="計量の目安（入れ目込み）" style={{ flex: 1, minWidth: 140 }}>
                <div style={{ padding: '10px 0', fontSize: 16, fontWeight: 700 }}>
                  {num(r.予定数量kg) > 0 ? `${weighTarget(r.予定数量kg, head.予定入れ目率).toLocaleString()}kg` : '—'}
                </div>
              </Field>
            </div>
            <TimeField label="到着予定時刻" value={r.到着予定時刻} onChange={(v) => setRow(i, '到着予定時刻', v)} />
            {admin && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <WitnessSelect
                    label="海面立会者（予定）1"
                    value={r.予定海面立会者ID1}
                    onChange={(v) => setRow(i, '予定海面立会者ID1', v)}
                    options={witnesses}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <WitnessSelect
                    label="海面立会者（予定）2"
                    value={r.予定海面立会者ID2}
                    onChange={(v) => setRow(i, '予定海面立会者ID2', v)}
                    options={witnesses}
                  />
                </div>
              </div>
            )}
            <Field label="備考">
              <textarea
                value={r.備考}
                onChange={(e) => setRow(i, '備考', e.target.value)}
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </Field>

            <div style={{ fontSize: 14, fontWeight: 700, margin: '4px 0 8px' }}>
              車輌{' '}
              <span style={{ fontWeight: 400, color: 'var(--c-text-3)' }}>
                {r.vehicles.length === 0
                  ? '（付けなければ「車輌未定」で登録します）'
                  : `割当 ${kgText(allocated)}kg${remain > 0 ? `・残り ${kgText(remain)}kg は未定` : ''}`}
              </span>
            </div>
            {r.vehicles.map((v, j) => (
              <div
                key={v.key}
                style={{ border: '1px solid var(--c-border-2)', borderRadius: 10, padding: 12, marginBottom: 10, background: 'var(--c-bg)' }}
              >
                <Field label="車輌">
                  <select value={v.車輌ID} onChange={(e) => setVehicle(i, j, '車輌ID', e.target.value)} style={inputStyle}>
                    <option value="">選択してください</option>
                    {vehicles.map((x) => (
                      <option key={x['車輌ID']} value={x['車輌ID']}>
                        {vehicleWithCarrier(masters, x['車輌ID'])}
                        {x['最大積載数量kg'] ? `　最大${x['最大積載数量kg']}kg` : ''}
                      </option>
                    ))}
                  </select>
                </Field>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <Field label="割当数量（kg）" style={{ flex: 1, minWidth: 130 }}>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={v.割当数量kg}
                      onChange={(e) => setVehicle(i, j, '割当数量kg', e.target.value)}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="回目（同じ日に2回走るとき2）" style={{ width: 150 }}>
                    <select value={v.回目} onChange={(e) => setVehicle(i, j, '回目', e.target.value)} style={inputStyle}>
                      {['1', '2', '3'].map((n) => (
                        <option key={n} value={n}>
                          {n}回目
                        </option>
                      ))}
                    </select>
                  </Field>
                  <button style={{ ...smallBtnStyle, marginBottom: 16, color: 'var(--c-danger)' }} onClick={() => removeVehicle(i, j)}>
                    この車輌を外す
                  </button>
                </div>
              </div>
            ))}
            <button type="button" onClick={() => addVehicle(i)} style={{ ...dashedBtnStyle, marginBottom: 12 }}>
              ＋ 車輌を付ける
            </button>
          </Section>
        );
      })}

      <button type="button" onClick={() => setRows((rs) => [...rs, emptyRow()])} style={{ ...dashedBtnStyle, marginBottom: 16 }}>
        ＋ 納品先を追加（同じ日・同じ池場）
      </button>

      {overloads.length > 0 && (
        <div style={{ ...warnBoxStyle }}>
          最大積載数量を超えている車輌があります（この画面で入れた分だけで計算）
          {overloads.map((t) => (
            <div key={t}>・{t}</div>
          ))}
        </div>
      )}

      {rows.length > 0 && head.積込日 && head.池場ID && (
        <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginBottom: 8 }}>
          登録する予定：
          {rows
            .filter((r) => r.海面業者ID)
            .map((r) => `${kaimenName(masters, r.海面業者ID)}／${deliveryDestName(masters, r.配送先ID) || '浜未選択'}`)
            .join('、') || '—'}
        </div>
      )}

      <ErrorMsg message={error} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
        <BusyButton onClick={handleSave}>登録する</BusyButton>
        <BusyButton variant="ghost" onClick={onClose}>
          やめる
        </BusyButton>
      </div>
    </ScreenFrame>
  );
}

const dashedBtnStyle = {
  minHeight: 42,
  padding: '8px 16px',
  borderRadius: 8,
  border: '1px dashed var(--c-border-2)',
  background: 'transparent',
  color: 'var(--c-text-2)',
  cursor: 'pointer',
};

const warnBoxStyle = {
  border: '1px solid var(--c-warn)',
  background: 'var(--c-warn-bg)',
  color: 'var(--c-warn)',
  borderRadius: 10,
  padding: '10px 14px',
  fontSize: 14,
  marginBottom: 12,
  lineHeight: 1.6,
};
