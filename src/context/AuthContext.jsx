import { createContext, useContext, useState, useCallback } from 'react';

// タブを閉じるまでログイン状態を保持する（決定②：sessionStorage採用）。
// ブラウザ・タブを完全に閉じると消え、再度ログインが必要になる。
const STORAGE_KEY = 'chigyo_hannyu_auth';

const AuthContext = createContext(null);

function loadStoredAuth() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [auth, setAuthState] = useState(loadStoredAuth);

  const setAuth = useCallback((value) => {
    setAuthState(value);
    try {
      if (value) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // sessionStorageが使えない環境でも、ログイン自体は継続できるようにする
    }
  }, []);

  const logout = useCallback(() => setAuth(null), [setAuth]);

  return (
    <AuthContext.Provider value={{ auth, setAuth, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth は AuthProvider の内側でのみ使用できます');
  return ctx;
}
