import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { getLocales } from 'expo-localization';
import { api, loadToken, saveToken, setUnauthorizedHandler } from './api';
import { translate, type TKey } from './i18n';
import { registerPush } from './push';

export type Me = {
  id: number; name: string; role: 'owner' | 'manager' | 'employee'; mobile: string; designation?: string;
  company_name: string; company_code: string; department_name?: string; language: string; initials: string;
  notify_app: boolean; notify_whatsapp: boolean; location_consent: boolean; has_pin: boolean; gcal_enabled: boolean;
};

type Ctx = {
  me: Me | null;
  ready: boolean;
  lang: string;
  isManager: boolean;
  t: (k: TKey | string) => string;
  setLang: (l: string) => Promise<void>;
  signIn: (token: string, me: Me) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  setMe: (m: Me) => void;
};

const AuthCtx = createContext<Ctx>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [lang, setLangState] = useState('en');

  const signOut = useCallback(async () => {
    await saveToken(null);
    setMe(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => signOut());
    (async () => {
      const saved = await SecureStore.getItemAsync('wt_lang');
      const device = getLocales()[0]?.languageCode ?? 'en';
      setLangState(saved ?? device);
      if (await loadToken()) {
        try {
          const u = await api<Me>('/me');
          setMe(u);
          if (!saved && u.language) setLangState(u.language);
          registerPush().catch(() => {});
        } catch {
          /* offline or expired: stay on login */
        }
      }
      setReady(true);
    })();
  }, [signOut]);

  const setLang = async (l: string) => {
    setLangState(l);
    await SecureStore.setItemAsync('wt_lang', l);
    if (me) api('/me', { method: 'PATCH', body: { language: l } }).catch(() => {});
  };

  const value: Ctx = {
    me, ready, lang,
    isManager: me?.role === 'manager' || me?.role === 'owner',
    t: (k) => translate(lang, k),
    setLang,
    signIn: async (token, u) => {
      await saveToken(token);
      setMe(u);
      registerPush().catch(() => {});
    },
    signOut,
    refresh: async () => setMe(await api<Me>('/me')),
    setMe,
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
