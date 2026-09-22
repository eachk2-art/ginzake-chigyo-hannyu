import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { getMasters } from '../lib/api';

const MasterContext = createContext(null);

export function MasterProvider({ children }) {
  const { auth } = useAuth();
  const [masters, setMasters] = useState(null);
  const [error, setError] = useState('');

  const reload = useCallback(() => {
    if (!auth) return;
    setMasters(null);
    setError('');
    getMasters(auth)
      .then(setMasters)
      .catch((e) => setError(e.message));
  }, [auth]);

  useEffect(() => {
    reload();
  }, [reload]);

  return <MasterContext.Provider value={{ masters, error, reload }}>{children}</MasterContext.Provider>;
}

export function useMasters() {
  const ctx = useContext(MasterContext);
  if (!ctx) throw new Error('useMasters は MasterProvider の内側でのみ使用できます');
  return ctx;
}
