import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Topbar } from '../Layout';
import { useApi } from '../hooks';
import { ErrorBox, Field, Loading } from '../ui';

const LANGS: [string, string][] = [['en', 'English'], ['hi', 'हिन्दी'], ['mr', 'मराठी'], ['gu', 'ગુજરાતી'], ['ta', 'தமிழ்'], ['te', 'తెలుగు'], ['bn', 'বাংলা'], ['kn', 'ಕನ್ನಡ'], ['ar', 'العربية']];

export default function Settings() {
  const { me } = useAuth();
  const owner = me?.role === 'owner';
  const { data, error, setData } = useApi<any>('/settings');
  const geo = useApi<any[]>('/geofences');
  const [f, setF] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [g, setG] = useState({ name: '', lat: '', lng: '', radius_m: 150 });

  useEffect(() => { if (data) setF({ ...data }); }, [data]);
  const set = (k: string, v: unknown) => setF((s: any) => ({ ...s, [k]: v }));

  const save = async () => {
    setErr(null);
    try {
      setData(await api('/settings', { method: 'PATCH', body: {
        name: f.name, shift_start: f.shift_start, shift_end: f.shift_end, late_grace_min: +f.late_grace_min, languages: f.languages,
        score_weights: f.score_weights, whatsapp_enabled: f.whatsapp_enabled, whatsapp_number: f.whatsapp_number, gcal_enabled: f.gcal_enabled,
      } }));
      setMsg('Saved');
      setTimeout(() => setMsg(null), 2000);
    } catch (e) { setErr((e as Error).message); }
  };

  const hereGeo = () => navigator.geolocation.getCurrentPosition((p) => setG({ ...g, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) }));

  return (
    <>
      <Topbar title="Settings & integrations" action={owner && <button className="btn" onClick={save}>{msg ?? 'Save changes'}</button>} />
      <ErrorBox msg={error || err} />
      {!f ? <Loading /> : (
        <fieldset disabled={!owner} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="grid g3">
            <div className="card">
              <h3>WhatsApp</h3>
              <p className="muted">Task alerts, reminders and replies (1 = Started, 2 = Done) on WhatsApp</p>
              <label className="check"><input type="checkbox" checked={!!+f.whatsapp_enabled} onChange={(e) => set('whatsapp_enabled', e.target.checked)} /> Enabled</label>
              <Field label="Business number"><input value={f.whatsapp_number ?? ''} onChange={(e) => set('whatsapp_number', e.target.value)} placeholder="+91 XXXXX XXXXX" /></Field>
              <p className="muted">Provider: <b>{f.whatsapp_provider}</b>{f.whatsapp_provider === 'log' && ' (dev mode — set Meta Cloud API keys in config.php)'}</p>
            </div>
            <div className="card">
              <h3>Google Calendar</h3>
              <p className="muted">Sync deadlines and meetings both ways</p>
              <label className="check"><input type="checkbox" checked={!!+f.gcal_enabled} onChange={(e) => set('gcal_enabled', e.target.checked)} /> Connected</label>
            </div>
            <div className="card">
              <h3>Languages</h3>
              <p className="muted">{f.languages.length} languages on in the app</p>
              <div className="tools">
                {LANGS.map(([c, l]) => <label key={c} className={f.languages.includes(c) ? 'on' : ''} onClick={() => owner && set('languages', f.languages.includes(c) ? f.languages.filter((x: string) => x !== c) : [...f.languages, c])}>{l}</label>)}
              </div>
            </div>
            <div className="card">
              <h3>Company & shift</h3>
              <Field label="Company name"><input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
              <div className="grid g2" style={{ gap: 8 }}>
                <Field label="Shift start"><input type="time" value={f.shift_start.slice(0, 5)} onChange={(e) => set('shift_start', e.target.value)} /></Field>
                <Field label="Shift end"><input type="time" value={f.shift_end.slice(0, 5)} onChange={(e) => set('shift_end', e.target.value)} /></Field>
              </div>
              <Field label="Late after (grace minutes)"><input type="number" value={f.late_grace_min} onChange={(e) => set('late_grace_min', e.target.value)} /></Field>
              <p className="muted">Company code for app login: <b>{f.code}</b></p>
            </div>
            <div className="card">
              <h3>Geofencing</h3>
              <p className="muted">Office & plant boundaries for punch-in</p>
              {geo.data?.map((x) => (
                <div key={x.id} className="list-item between"><span>{x.name} <span className="muted">· {x.radius_m} m</span></span>
                  {owner && <button type="button" className="link" onClick={() => api(`/geofences/${x.id}`, { method: 'DELETE' }).then(geo.reload)}>Remove</button>}</div>
              ))}
              {owner && (
                <div style={{ marginTop: 10 }}>
                  <input className="input" style={{ marginBottom: 6 }} placeholder="Name (Head office)" value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} />
                  <div className="grid g3" style={{ gap: 6, marginBottom: 6 }}>
                    <input className="input" placeholder="Lat" value={g.lat} onChange={(e) => setG({ ...g, lat: e.target.value })} />
                    <input className="input" placeholder="Lng" value={g.lng} onChange={(e) => setG({ ...g, lng: e.target.value })} />
                    <input className="input" type="number" placeholder="Radius m" value={g.radius_m} onChange={(e) => setG({ ...g, radius_m: +e.target.value })} />
                  </div>
                  <div className="row">
                    <button type="button" className="btn ghost sm" onClick={hereGeo}>Use my location</button>
                    <button type="button" className="btn sm" disabled={!g.name || !g.lat} onClick={() => api('/geofences', { body: g }).then(() => { setG({ name: '', lat: '', lng: '', radius_m: 150 }); geo.reload(); })}>Add</button>
                  </div>
                </div>
              )}
            </div>
            <div className="card">
              <h3>Roles & permissions</h3>
              <p className="muted">Owner — everything · Manager — their team, approvals, admin panel · Employee — mobile app, own tasks</p>
              {f.roles.map((r: any) => <div key={r.role} className="list-item between"><span style={{ textTransform: 'capitalize' }}>{r.role}</span><b>{r.n}</b></div>)}
            </div>
            <div className="card">
              <h3>Performance score weights</h3>
              {Object.entries(f.score_weights).map(([k, v]) => (
                <div key={k} className="between" style={{ marginBottom: 6 }}><span style={{ textTransform: 'capitalize' }}>{k === 'ontime' ? 'On-time' : k}</span>
                  <input className="input" type="number" style={{ width: 80 }} value={v as number} onChange={(e) => set('score_weights', { ...f.score_weights, [k]: +e.target.value })} /></div>
              ))}
              <p className="muted">Must add up to 100 (now {Object.values(f.score_weights).reduce((a: number, b) => a + Number(b), 0)})</p>
            </div>
            <div className="card">
              <h3>Security</h3>
              <p className="muted">Encrypted connections (SSL), OTP login, PIN / biometric in the app, private file storage. Set up daily database backups in your hosting panel (cPanel → Backup).</p>
              <p className="muted">SMS (OTP) provider: <b>{f.sms_provider}</b></p>
            </div>
          </div>
        </fieldset>
      )}
    </>
  );
}
