import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, setToken } from './api';

export type Me = {
  id: number; name: string; role: 'owner' | 'manager' | 'employee'; company_name: string; company_code: string;
  initials: string; department_name?: string; designation?: string;
};

type Ctx = { me: Me | null; ready: boolean; login: (token: string, me: Me) => void; logout: () => void };
const AuthCtx = createContext<Ctx>({ me: null, ready: false, login: () => {}, logout: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) return setReady(true);
    api<Me>('/me').then(setMe).catch(() => setToken(null)).finally(() => setReady(true));
  }, []);

  return (
    <AuthCtx.Provider
      value={{
        me, ready,
        login: (t, u) => { setToken(t); setMe(u); },
        logout: () => { setToken(null); setMe(null); },
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
