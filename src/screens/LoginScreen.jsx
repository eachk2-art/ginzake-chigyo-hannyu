import { useEffect, useState } from 'react';
import { getLoginTiles, login } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { ErrorMsg, LoadingMsg } from '../components/UI';
import BusyButton from '../components/BusyButton';
import PinPad from '../components/PinPad';

export default function LoginScreen() {
  const { setAuth } = useAuth();
  const [tiles, setTiles] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState('');
  const [loginError, setLoginError] = useState('');
  const [entryKey] = useState(() => new URLSearchParams(window.location.search).get('e') || '');

  // ★2026-09-26：URLの ?e=キー で、その事業者だけのログイン画面にする。
  // 太協・管理者のキーのときだけ、これまでどおり全事業者のタイルが並ぶ。
  useEffect(() => {
    getLoginTiles(entryKey)
      .then((list) => {
        setTiles(list);
        // 1事業者だけの入口なら、タイルを選ぶ手間を省いてPIN入力から始める
        if (list.length === 1) setSelected(list[0]);
      })
      .catch((e) => setLoadError(e.message));
  }, [entryKey]);

  function selectTile(tile) {
    setSelected(tile);
    setPin('');
    setLoginError('');
  }

  function backToTiles() {
    setSelected(null);
    setPin('');
    setLoginError('');
  }

  async function handleLogin() {
    // 通常は6桁。太協・管理者の入口では、確認用の8桁マスターPINも使える
    if (pin.length !== 6 && pin.length !== 8) {
      setLoginError('6桁の数字を入力してください');
      return;
    }
    try {
      const result = await login(selected.loginId, pin, entryKey);
      setAuth(result);
    } catch (e) {
      setLoginError(e.message);
      setPin('');
    }
  }

  if (loadError) {
    return (
      <CenterScreen>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>稚魚搬入管理</div>
        <ErrorMsg message={loadError} />
      </CenterScreen>
    );
  }

  if (!tiles) {
    return (
      <CenterScreen>
        <LoadingMsg>事業者一覧を読み込んでいます…</LoadingMsg>
      </CenterScreen>
    );
  }

  if (selected) {
    return (
      <CenterScreen>
        <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>
          {selected.tileName} のPINを入力
        </div>
        {/* 太協・管理者の入口では、確認用の8桁マスターPINも入力できるようにする */}
        <PinPad value={pin} onChange={setPin} maxLength={tiles.length > 1 ? 8 : 6} />
        <ErrorMsg message={loginError} />
        <div style={{ display: 'flex', gap: 12, marginTop: 24, width: '100%', maxWidth: 300 }}>
          {/* 1事業者だけの入口では「戻る」先が無いので出さない */}
          {tiles.length > 1 && (
            <BusyButton variant="ghost" onClick={backToTiles} style={{ flex: 1 }}>
              戻る
            </BusyButton>
          )}
          <BusyButton variant="primary" onClick={handleLogin} style={{ flex: 1 }}>
            ログイン
          </BusyButton>
        </div>
      </CenterScreen>
    );
  }

  // 3列×7段の固定21枠（将来の海面業者ログイン追加を見込んだ枠数）。
  // 登録数が21未満の場合は空枠として表示する
  const slots = Array.from(
    { length: 21 },
    (_, i) => tiles.find((t) => Number(t.order) === i + 1) || null
  );

  return (
    <CenterScreen>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>稚魚搬入管理</div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
          width: '100%',
          maxWidth: 420,
        }}
      >
        {slots.map((tile, i) => (
          <button
            key={i}
            type="button"
            disabled={!tile}
            onClick={() => tile && selectTile(tile)}
            style={{
              minHeight: 56,
              borderRadius: 12,
              border: tile ? '1px solid var(--c-border-2)' : '1px dashed var(--c-border)',
              background: tile ? 'var(--c-bg-2)' : 'transparent',
              color: tile ? 'var(--c-text)' : 'var(--c-text-3)',
              fontSize: 15,
              fontWeight: 600,
              cursor: tile ? 'pointer' : 'default',
            }}
          >
            {tile ? tile.tileName : ''}
          </button>
        ))}
      </div>
    </CenterScreen>
  );
}

function CenterScreen({ children }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: 32,
        paddingLeft: 24,
        paddingRight: 24,
        paddingBottom: 24,
        background: 'var(--c-bg)',
        color: 'var(--c-text)',
      }}
    >
      {children}
    </div>
  );
}
