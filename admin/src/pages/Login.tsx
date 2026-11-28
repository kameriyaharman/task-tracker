import { useState } from 'react';
import { api } from '../api';
import { useAuth, type Me } from '../auth';
import { Brand, ErrorBox, Field, PasswordInput } from '../ui';

export default function Login() {
  const { login } = useAuth();
  const [f, setF] = useState({ login: '', password: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ token: string; user: Me }>('/auth/admin-login', { body: f });
      login(r.token, r.user);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-banner">
        <img src={`${import.meta.env.BASE_URL}brand-banner.jpg`} alt="Keshav Home Solution — Construction Solution · Hardware · Paint · Electrical" />
      </div>
      <form className="login" onSubmit={submit}>
        <Brand big light={false} />
        <p className="muted" style={{ textAlign: 'center', margin: '4px auto 20px' }}>Team & task management · Admin login</p>
        <ErrorBox msg={err} />
        <Field label="Mobile or email"><input autoFocus value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} required /></Field>
        <Field label="Password"><PasswordInput value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></Field>
        <button className="btn" style={{ justifyContent: 'center' }} disabled={busy}>{busy ? 'Signing in…' : 'Login'}</button>
      </form>
    </div>
  );
}
