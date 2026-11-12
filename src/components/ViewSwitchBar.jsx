import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getViewTargets, switchView, endView } from '../lib/api';
import { isTaikyo } from '../lib/roles';

// 区分の並び（サーバーもこの順で返す）
const ROLE_LABELS = {
  太協: '太協（現場）',
  内水面業者: '内水面業者',
  運送会社: '運送会社',
  海面業者: '海面業者',
};

/**
 * 表示切替バー（★2026-11-13）。画面のいちばん上に出す。
 * ・太協・管理者でログインしているときだけ「表示切替」のプルダウンを出す
 *   （太協 → 内水面業者・運送会社・海面業者、管理者 → それに加えて太協）
 * ・切替中は auth.origin に元のログインを持っておき、黄色い帯から「元のログインに戻る」で戻る
 * ・切替中は閲覧専用（書き込みはサーバー側で拒否される）
 * ・マスターPINで入った確認用ログインのときは、従来どおり黄色い帯だけを出す
 */
export default function ViewSwitchBar() {
  const { auth, setAuth } = useAuth();
  const origin = auth.origin || null; // 表示切替中なら、元のログイン
  const base = origin || auth; // 切替の操作は、必ず元のログインで行う
  const canSwitch = isTaikyo(base.role) && !base.review;

  const [targets, setTargets] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!canSwitch) return;
    getViewTargets(base)
      .then(setTargets)
      .catch((e) => setError(e.message));
    // base.token が変わったときだけ読み直す
  }, [canSwitch, base.token]);

  async function handleSelect(loginId) {
    if (!loginId || busy) return;
    setBusy(true);
    setError('');
    try {
      const next = await switchView(base, loginId);
      if (origin) endView(auth).catch(() => {}); // 前の切替用トークンは片付ける（失敗しても気にしない）
      setAuth({ ...next, origin: base });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  function handleReturn() {
    if (!origin) return;
    endView(auth).catch(() => {});
    setAuth(origin);
  }

  // 太協・管理者以外で、確認用ログインでもなければ何も出さない
  if (!canSwitch && !auth.review) return null;

  // マスターPINで入った確認用ログイン（表示切替ではない）
  if (!canSwitch && auth.review) {
    return (
      <div style={bandStyle}>
        確認用ログイン中です（{auth.tileName}の見え方）。登録・修正はできません。
      </div>
    );
  }

  const groups = {};
  (targets || []).forEach((t) => {
    (groups[t.role] = groups[t.role] || []).push(t);
  });

  const picker = (
    <select
      value=""
      disabled={busy || !targets}
      onChange={(e) => handleSelect(e.target.value)}
      style={selectStyle}
      aria-label="表示切替"
    >
      <option value="">{busy ? '切り替えています…' : targets ? '表示切替 ▾（他の事業者の見え方）' : '表示切替（読み込み中…）'}</option>
      {Object.keys(groups).map((role) => (
        <optgroup key={role} label={ROLE_LABELS[role] || role}>
          {groups[role]
            .filter((t) => t.loginId !== auth.loginId)
            .map((t) => (
              <option key={t.loginId} value={t.loginId}>
                {t.tileName}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );

  if (origin) {
    // 表示切替中
    return (
      <div style={bandStyle}>
        <div style={{ marginBottom: 8 }}>
          表示切替中：<span style={{ fontSize: 16 }}>{auth.tileName}</span> の見え方（閲覧のみ）
          <span style={{ fontWeight: 400, fontSize: 13 }}>　元のログイン：{origin.tileName}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={handleReturn} style={returnBtnStyle}>
            ← 元のログインに戻る
          </button>
          <div style={{ flex: 1, minWidth: 200 }}>{picker}</div>
        </div>
        {error && <div style={errorStyle}>{error}</div>}
      </div>
    );
  }

  // 通常の太協・管理者ログイン：プルダウンだけを控えめに出す
  return (
    <div style={{ padding: '8px 12px 0', display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        {picker}
        {error && <div style={errorStyle}>{error}</div>}
      </div>
    </div>
  );
}

const bandStyle = {
  background: 'var(--c-warn-bg)',
  color: 'var(--c-warn)',
  border: '1px solid var(--c-warn)',
  borderRadius: 10,
  padding: '8px 14px',
  margin: '10px 12px 0',
  fontSize: 14,
  fontWeight: 700,
};

const selectStyle = {
  width: '100%',
  minHeight: 42,
  padding: '8px 10px',
  fontSize: 15,
  borderRadius: 8,
  border: '1px solid var(--c-border-2)',
  background: 'var(--c-bg-2)',
  color: 'var(--c-text)',
  boxSizing: 'border-box',
};

const returnBtnStyle = {
  minHeight: 42,
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid var(--c-warn)',
  background: 'var(--c-warn)',
  color: '#2b1d00',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
};

const errorStyle = { color: 'var(--c-danger)', fontSize: 13, marginTop: 6, fontWeight: 400 };
