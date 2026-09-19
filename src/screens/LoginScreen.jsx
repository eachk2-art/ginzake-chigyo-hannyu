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

  useEffect(() => {
    getLoginTiles()
      .then(setTiles)
      .catch((e) => setLoadError(e.message));
  }, []);

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
    if (pin.length !== 6) {
      setLoginError('6桁の数字を入力してください');
      return;
    }
    try {
      const result = await login(selected.loginId, pin);
      setAuth(result);
    } catch (e) {
      setLoginError(e.message);
      setPin('');
    }
  }

  if (loadError) {
    return (
      <CenterScreen>
        <ErrorMsg message={`事業者一覧の取得に失敗しました：${loadError}`} />
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
        <PinPad value={pin} onChange={setPin} />
        <ErrorMsg message={loginError} />
        <div style={{ display: 'flex', gap: 12, marginTop: 24, width: '100%', maxWidth: 300 }}>
          <BusyButton variant="ghost" onClick={backToTiles} fullWidth>
            戻る
          </BusyButton>
          <BusyButton variant="primary" onClick={handleLogin} fullWidth>
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
        justifyContent: 'center',
        padding: 24,
        background: 'var(--c-bg)',
        color: 'var(--c-text)',
      }}
    >
      {children}
    </div>
  );
}
