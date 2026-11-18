import { useState } from 'react';
import { api } from '../api';
import { useAuth, type Me } from '../auth';
import { ErrorBox, Field, Logo } from '../ui';

export default function Login() {
  const { login } = useAuth();
  const [f, setF] = useState({ company_code: localStorage.getItem('wt_company') ?? '', login: '', password: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ token: string; user: Me }>('/auth/admin-login', { body: f });
      localStorage.setItem('wt_company', f.company_code);
      login(r.token, r.user);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login" onSubmit={submit}>
        <Logo size={30} />
        <h2 style={{ textAlign: 'center', fontSize: 20 }}>WorkTrack Admin</h2>
        <p className="muted" style={{ textAlign: 'center', marginBottom: 20 }}>For owners and managers</p>
        <ErrorBox msg={err} />
        <Field label="Company code"><input value={f.company_code} onChange={(e) => setF({ ...f, company_code: e.target.value.toUpperCase() })} placeholder="ACME2026" required /></Field>
        <Field label="Mobile or email"><input value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} required /></Field>
        <Field label="Password"><input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></Field>
        <button className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>{busy ? 'Signing in…' : 'Login'}</button>
      </form>
    </div>
  );
}
