import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import {
  adminListMaster,
  adminSuggestId,
  adminCreateMaster,
  adminUpdateMaster,
  adminSetDeleted,
  adminCheckUsage,
  adminResetPin,
} from '../lib/api';
import BusyButton from '../components/BusyButton';
import { ErrorMsg } from '../components/UI';
import { isAdmin } from '../lib/roles';

// 画面で扱うマスタと、その入力項目の定義（SCR-100）
// type：text=文字 / num=数値 / date=日付 / ref=他マスタから選ぶ / opt=決まった選択肢
const MASTERS = [
  { name: '車輌', idKey: '車輌ID', nameKey: '車番', sub: ['運送会社ID', '通常ドライバー担当者ID'], parent: '運送会社ID' },
  { name: '担当者', idKey: '担当者ID', nameKey: '氏名', sub: ['区分', '所属先ID', '連絡先'], parent: '所属先ID' },
  { name: '池場', idKey: '池場ID', nameKey: '池場名', sub: ['内水面業者ID', '住所'], parent: '内水面業者ID' },
  { name: '内水面業者', idKey: '内水面業者ID', nameKey: '内水面業者名', sub: ['都道府県', '連絡先'], parent: null },
  { name: '運送会社', idKey: '運送会社ID', nameKey: '運送会社名', sub: ['略称', '連絡先'], parent: null },
  { name: '海面業者', idKey: '海面業者ID', nameKey: '氏名', sub: ['屋号', '所在地', '連絡先'], parent: null },
  { name: '配送先', idKey: '配送先ID', nameKey: '配送先名', sub: ['海面業者ID', '住所'], parent: '海面業者ID' },
  { name: '運賃単価', idKey: '運賃単価ID', nameKey: '運送会社ID', sub: ['地域区分', 'kg単価', '適用開始日'], parent: '運送会社ID' },
  { name: 'ログイン事業者', idKey: 'ログイン事業者ID', nameKey: 'タイル表示名', sub: ['事業者区分', '参照先ID', '有効フラグ'], parent: null },
];

const t = (key) => ({ key, type: 'text' });
const num = (key) => ({ key, type: 'num' });
const date = (key) => ({ key, type: 'date' });
const ref = (key, master) => ({ key, type: 'ref', master });
const opt = (key, options) => ({ key, type: 'opt', options });

const FIELDS = {
  内水面業者: [t('内水面業者名'), t('略称'), t('都道府県'), t('地域表示'), t('連絡先')],
  池場: [ref('内水面業者ID', '内水面業者'), t('池場名'), t('地域表示'), t('住所'), t('地図リンク')],
  運送会社: [t('運送会社名'), t('略称'), t('連絡先')],
  車輌: [
    ref('運送会社ID', '運送会社'),
    t('車番'),
    ref('通常ドライバー担当者ID', '担当者'),
    t('連絡先'),
    num('水槽容量'),
    num('水槽数'),
    num('最大積載数量kg'),
    opt('500kgバケット対応', ['', 'あり', 'なし']),
  ],
  担当者: [t('氏名'), opt('区分', null), t('所属先ID'), t('連絡先')],
  海面業者: [t('氏名'), t('屋号'), t('所在地'), t('連絡先')],
  配送先: [ref('海面業者ID', '海面業者'), t('配送先名'), t('住所'), t('地図リンク')],
  運賃単価: [ref('運送会社ID', '運送会社'), opt('地域区分', null), num('kg単価'), date('適用開始日')],
  ログイン事業者: [
    opt('事業者区分', ['管理者', '太協', '内水面業者', '運送会社', '海面業者']),
    t('参照先ID'),
    t('タイル表示名'),
    num('タイル表示順'),
    opt('有効フラグ', ['有効', '']),
  ],
};

// 他マスタから選ぶときの、選択肢の表示名の作り方
const REF_LABEL = {
  内水面業者: (r) => `${r['内水面業者ID']}：${r['内水面業者名']}`,
  運送会社: (r) => `${r['運送会社ID']}：${r['運送会社名']}`,
  担当者: (r) => `${r['担当者ID']}：${r['氏名']}（${r['区分'] || '-'}）`,
  海面業者: (r) => `${r['海面業者ID']}：${r['氏名']}${r['屋号'] ? `（${r['屋号']}）` : ''}`,
};

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 16,
  background: 'var(--c-bg-2)',
  color: 'var(--c-text)',
  border: '1px solid var(--c-border-2)',
  borderRadius: 8,
  boxSizing: 'border-box',
};

export default function MasterAdminScreen() {
  const { auth } = useAuth();
  const { masters, reload: reloadMasters } = useMasters();
  const [masterName, setMasterName] = useState('車輌');
  const [rows, setRows] = useState(null);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState(null); // { mode: 'new' | 'edit', data }
  const [error, setError] = useState('');

  const meta = MASTERS.find((m) => m.name === masterName);

  const load = useCallback(
    async (name = masterName) => {
      setRows(null);
      setError('');
      try {
        const res = await adminListMaster(auth, name, true);
        setRows(res.rows);
      } catch (e) {
        setError(e.message);
        setRows([]);
      }
    },
    [auth, masterName]
  );

  useEffect(() => {
    load(masterName);
    setEditing(null);
    setKeyword('');
  }, [masterName, load]);

  const visibleRows = useMemo(() => {
    if (!rows) return [];
    const kw = keyword.trim();
    return rows.filter((r) => {
      if (!includeDeleted && r['削除フラグ']) return false;
      if (!kw) return true;
      return Object.values(r).some((v) => typeof v === 'string' && v.indexOf(kw) >= 0);
    });
  }, [rows, includeDeleted, keyword]);

  async function afterSave() {
    setEditing(null);
    await load();
    reloadMasters(); // 他の画面のプルダウン等にもすぐ反映する
  }

  if (!isAdmin(auth.role)) return null;

  if (editing) {
    return (
      <MasterForm
        auth={auth}
        masters={masters}
        meta={meta}
        rows={rows || []}
        mode={editing.mode}
        initial={editing.data}
        onSaved={afterSave}
        onClose={() => setEditing(null)}
      />
    );
  }

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ fontSize: 20, margin: '4px 0 14px' }}>マスタ管理</h2>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {MASTERS.map((m) => (
          <button
            key={m.name}
            onClick={() => setMasterName(m.name)}
            style={{
              padding: '8px 14px',
              minHeight: 42,
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              border: '1px solid var(--c-border-2)',
              background: masterName === m.name ? 'var(--c-accent)' : 'transparent',
              color: masterName === m.name ? '#03202e' : 'var(--c-text)',
              cursor: 'pointer',
            }}
          >
            {m.name}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="絞り込み（名前・ID など）"
          style={{ ...inputStyle, width: 240 }}
        />
        <label style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={includeDeleted} onChange={(e) => setIncludeDeleted(e.target.checked)} />
          削除済みも表示
        </label>
        <BusyButton onClick={() => setEditing({ mode: 'new', data: {} })}>＋ 新規追加</BusyButton>
      </div>

      <ErrorMsg message={error} />

      {rows === null && <div style={{ color: 'var(--c-text-3)' }}>読み込み中…</div>}

      {rows !== null && (
        <>
          <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginBottom: 8 }}>
            {visibleRows.length}件を表示中（全{rows.length}件）
          </div>
          {visibleRows.map((r) => (
            <MasterRow
              key={r[meta.idKey]}
              auth={auth}
              meta={meta}
              row={r}
              onEdit={() => setEditing({ mode: 'edit', data: r })}
              onChanged={afterSave}
              onError={setError}
            />
          ))}
        </>
      )}
    </div>
  );
}

function MasterRow({ auth, meta, row, onEdit, onChanged, onError }) {
  const deleted = !!row['削除フラグ'];

  async function toggleDeleted() {
    onError('');
    try {
      if (!deleted) {
        const usage = await adminCheckUsage(auth, meta.name, row[meta.idKey]);
        const extra = usage.count > 0 ? `\n\n※今日以降の予定で${usage.count}件使われています。` : '';
        if (!window.confirm(`「${row[meta.nameKey] || row[meta.idKey]}」を削除しますか？${extra}\n（後から復元できます）`)) return;
      } else if (!window.confirm(`「${row[meta.nameKey] || row[meta.idKey]}」を復元しますか？`)) {
        return;
      }
      await adminSetDeleted(auth, meta.name, row[meta.idKey], !deleted);
      await onChanged();
    } catch (e) {
      onError(e.message);
    }
  }

  return (
    <div
      style={{
        background: 'var(--c-bg-2)',
        border: '1px solid var(--c-border)',
        borderRadius: 10,
        padding: '10px 12px',
        marginBottom: 8,
        opacity: deleted ? 0.6 : 1,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13, color: 'var(--c-text-3)', minWidth: 70 }}>{row[meta.idKey]}</span>
        <span style={{ fontSize: 16, fontWeight: 700 }}>{row[meta.nameKey] || '（名称なし）'}</span>
        {deleted && (
          <span style={{ fontSize: 12, color: 'var(--c-danger)', border: '1px solid var(--c-danger)', borderRadius: 12, padding: '1px 8px' }}>
            削除済み
          </span>
        )}
        <span style={{ flex: 1 }} />
        <BusyButton variant="ghost" onClick={onEdit}>
          編集
        </BusyButton>
        <BusyButton variant="ghost" onClick={toggleDeleted}>
          {deleted ? '復元' : '削除'}
        </BusyButton>
      </div>
      <div style={{ fontSize: 13, color: 'var(--c-text-2)', marginTop: 4 }}>
        {meta.sub.map((k) => (row[k] ? `${k}：${row[k]}` : null)).filter(Boolean).join('　')}
      </div>
    </div>
  );
}

function MasterForm({ auth, masters, meta, rows, mode, initial, onSaved, onClose }) {
  const isNew = mode === 'new';
  const fields = FIELDS[meta.name];
  const [form, setForm] = useState(() => {
    const f = {};
    fields.forEach((fd) => {
      f[fd.key] = initial?.[fd.key] ?? '';
    });
    return f;
  });
  const [id, setId] = useState(isNew ? '' : initial[meta.idKey]);
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const setF = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  // 「区分」「地域区分」のように、既存データから選択肢を作る項目
  function optionsOf(fd) {
    if (fd.options) return fd.options;
    const values = Array.from(new Set(rows.map((r) => r[fd.key]).filter(Boolean)));
    return ['', ...values];
  }

  function refRows(masterName) {
    return (masters?.[masterName] || []).filter((r) => !r['削除フラグ']);
  }

  async function suggestId() {
    setError('');
    try {
      const parentId = meta.parent ? form[meta.parent] || '' : '';
      const res = await adminSuggestId(auth, meta.name, parentId);
      setId(res.id);
    } catch (e) {
      setError(e.message);
    }
  }

  async function save() {
    setError('');
    try {
      if (isNew) {
        await adminCreateMaster(auth, meta.name, { ...form, [meta.idKey]: id }, meta.name === 'ログイン事業者' ? pin : null);
      } else {
        await adminUpdateMaster(auth, meta.name, id, form);
      }
      await onSaved();
    } catch (e) {
      setError(e.message);
    }
  }

  async function resetPin() {
    setError('');
    setMessage('');
    try {
      if (!window.confirm(`「${form['タイル表示名'] || id}」のPINを ${newPin} に変更しますか？`)) return;
      await adminResetPin(auth, id, newPin);
      setMessage('PINを変更しました');
      setNewPin('');
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 700, margin: '0 auto' }}>
      <h2 style={{ fontSize: 20, margin: '4px 0 14px' }}>
        {meta.name}マスタ：{isNew ? '新規追加' : '編集'}
      </h2>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 14, color: 'var(--c-text-2)', display: 'block', marginBottom: 4 }}>{meta.idKey}</label>
        {isNew ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="空欄のまま「候補を入れる」でもOK"
              style={inputStyle}
            />
            <BusyButton variant="ghost" onClick={suggestId}>
              候補を入れる
            </BusyButton>
          </div>
        ) : (
          <div style={{ ...inputStyle, background: 'var(--c-bg-3)', color: 'var(--c-text-3)' }}>{id}（変更できません）</div>
        )}
      </div>

      {fields.map((fd) => (
        <div key={fd.key} style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 14, color: 'var(--c-text-2)', display: 'block', marginBottom: 4 }}>{fd.key}</label>
          {fd.type === 'ref' && (
            <select value={form[fd.key]} onChange={(e) => setF(fd.key, e.target.value)} style={inputStyle}>
              <option value="">選択してください</option>
              {refRows(fd.master).map((r) => {
                const label = REF_LABEL[fd.master] ? REF_LABEL[fd.master](r) : Object.values(r)[0];
                const value = Object.values(r)[0];
                return (
                  <option key={value} value={value}>
                    {label}
                  </option>
                );
              })}
            </select>
          )}
          {fd.type === 'opt' && (
            <select value={form[fd.key]} onChange={(e) => setF(fd.key, e.target.value)} style={inputStyle}>
              {optionsOf(fd).map((o) => (
                <option key={o} value={o}>
                  {o === '' ? '（なし）' : o}
                </option>
              ))}
            </select>
          )}
          {fd.type === 'date' && (
            <input type="date" value={form[fd.key]} onChange={(e) => setF(fd.key, e.target.value)} style={inputStyle} />
          )}
          {fd.type === 'num' && (
            <input
              type="number"
              inputMode="decimal"
              value={form[fd.key]}
              onChange={(e) => setF(fd.key, e.target.value)}
              style={inputStyle}
            />
          )}
          {fd.type === 'text' && (
            <input value={form[fd.key]} onChange={(e) => setF(fd.key, e.target.value)} style={inputStyle} />
          )}
        </div>
      ))}

      {meta.name === 'ログイン事業者' && isNew && (
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 14, color: 'var(--c-text-2)', display: 'block', marginBottom: 4 }}>PIN（6桁の数字）</label>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
            inputMode="numeric"
            style={inputStyle}
          />
        </div>
      )}

      <ErrorMsg message={error} />
      {message && <div style={{ color: 'var(--c-ok)', fontSize: 14, marginBottom: 10 }}>{message}</div>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
        <BusyButton onClick={save}>保存</BusyButton>
        <BusyButton variant="ghost" onClick={onClose}>
          閉じる
        </BusyButton>
      </div>

      {meta.name === 'ログイン事業者' && !isNew && (
        <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--c-border)' }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>PIN再設定</div>
          <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginBottom: 8 }}>
            新しい6桁の数字を入れて「PINを変更する」を押します。変更すると、間違えてロックされている状態も解除されます。
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              inputMode="numeric"
              placeholder="例：123456"
              style={{ ...inputStyle, width: 180 }}
            />
            <BusyButton onClick={resetPin} disabled={newPin.length !== 6}>
              PINを変更する
            </BusyButton>
          </div>
        </div>
      )}
    </div>
  );
}
