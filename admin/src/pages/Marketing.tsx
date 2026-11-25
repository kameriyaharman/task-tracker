import { useState } from 'react';
import { api } from '../api';
import { Topbar } from '../Layout';
import { useApi } from '../hooks';
import { Drawer, Empty, ErrorBox, Field, Loading } from '../ui';
import { Select, rs, useMeta } from '../erp/common';

const Stars = ({ n }: { n: number | null }) => (n === null ? <span className="muted">—</span> : <span style={{ color: '#f59e0b', letterSpacing: 1 }}>{'★'.repeat(n)}<span style={{ color: '#ddd' }}>{'★'.repeat(3 - n)}</span></span>);
const pct = (p: number | null) => (p === null ? '—' : `${p}%`);

/** Marketing / field sales: monthly targets vs achievement, 30-day plan calendar, visits & evening reports. */
export default function Marketing() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const team = useApi<any>('/marketing/team', { month });
  const [person, setPerson] = useState<number | null>(null);
  const [target, setTarget] = useState<any>(null);
  return (
    <>
      <Topbar title="Marketing & field sales" action={<div className="row">
        <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <button className="btn" onClick={() => setTarget({ user_id: '', month, amount_target: '', km_target: '', visits_target: '', category_targets: [] })}>🎯 Set target</button>
      </div>} />
      <div className="goal-help">Each field person has a <b>monthly target</b> (sales ₹, km, visits, category-wise). Every evening before going home they fill the <b>day report</b> in the app: places & people visited (photo + location), km run, orders, billed, and a self-rating. Stars: ★★★ on or above target pace · ★★ 75% · ★ 50%.</div>
      {!team.data ? <Loading /> : team.data.people.length ? (
        <div className="card" style={{ padding: 6 }}>
          <table className="t">
            <thead><tr><th>Person</th><th className="r">Target</th><th className="r">Sales</th><th className="r">Done</th><th>On pace</th><th className="r">km</th><th className="r">Visits</th><th className="r">Reports</th><th>Self rating</th><th /></tr></thead>
            <tbody>{team.data.people.map((p: any) => (
              <tr key={p.user_id} className="click" onClick={() => setPerson(p.user_id)}>
                <td><b>{p.name}</b><div className="muted">today: {rs(p.today.sales)} · {p.today.km} km · {p.today.visits} visits {p.today.report_done ? '✓ report' : '· no report yet'}</div></td>
                <td className="r">{rs(p.target.amount)}</td><td className="r">{rs(p.achieved.amount)}</td><td className="r">{pct(p.pct.amount)}</td>
                <td><Stars n={p.stars} /> <span className="muted">{pct(p.pct.on_pace)}</span></td>
                <td className="r">{p.achieved.km}{p.target.km ? <span className="muted"> / {p.target.km}</span> : null}</td>
                <td className="r">{p.achieved.visits}{p.target.visits ? <span className="muted"> / {p.target.visits}</span> : null}</td>
                <td className="r">{p.reports_filled}/{p.day}</td><td>{p.avg_self_rating ?? '—'} ★</td>
                <td><button className="link" onClick={(e) => { e.stopPropagation(); setTarget({ user_id: p.user_id, month, amount_target: p.target.amount, km_target: p.target.km, visits_target: p.target.visits, category_targets: p.target.categories }); }}>Target</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <Empty>No field person has a target or report this month yet — set a target to start.</Empty>}
      {person && <PersonDrawer uid={person} month={month} onClose={() => setPerson(null)} />}
      {target && <TargetForm t={target} onClose={() => setTarget(null)} onSaved={() => { setTarget(null); team.reload(); }} />}
    </>
  );
}

function TargetForm({ t, onClose, onSaved }: { t: any; onClose: () => void; onSaved: () => void }) {
  const { meta } = useMeta();
  const [f, setF] = useState<any>({ ...t, category_targets: t.category_targets?.length ? t.category_targets : [] });
  const [err, setErr] = useState<string | null>(null);
  return (
    <Drawer title="Monthly target" onClose={onClose} modal>
      <ErrorBox msg={err} />
      <div className="grid g2">
        <Field label="Person"><Select value={f.user_id} onChange={(v) => setF({ ...f, user_id: v })} options={meta?.users ?? []} /></Field>
        <Field label="Month"><input type="month" value={f.month} onChange={(e) => setF({ ...f, month: e.target.value })} /></Field>
        <Field label="Sales target (₹)"><input type="number" value={f.amount_target} onChange={(e) => setF({ ...f, amount_target: e.target.value })} /></Field>
        <Field label="km to run"><input type="number" value={f.km_target} onChange={(e) => setF({ ...f, km_target: e.target.value })} /></Field>
        <Field label="Visits (people / sites)"><input type="number" value={f.visits_target} onChange={(e) => setF({ ...f, visits_target: e.target.value })} /></Field>
      </div>
      <div className="field"><span>Category-wise target (cement, plumbing…)</span>
        {f.category_targets.map((c: any, i: number) => (
          <div key={i} className="row" style={{ marginBottom: 6 }}>
            <div style={{ flex: 1 }}><Select value={c.category_id} onChange={(v) => setF({ ...f, category_targets: f.category_targets.map((x: any, j: number) => (j === i ? { ...x, category_id: v } : x)) })} options={meta?.categories ?? []} /></div>
            <input className="input" type="number" style={{ width: 120 }} value={c.amount} placeholder="₹" onChange={(e) => setF({ ...f, category_targets: f.category_targets.map((x: any, j: number) => (j === i ? { ...x, amount: e.target.value } : x)) })} />
            <button className="link" onClick={() => setF({ ...f, category_targets: f.category_targets.filter((_: any, j: number) => j !== i) })}>✕</button>
          </div>
        ))}
        <button className="btn ghost sm" onClick={() => setF({ ...f, category_targets: [...f.category_targets, { category_id: '', amount: '' }] })}>＋ Category target</button>
      </div>
      <button className="btn" disabled={!f.user_id} onClick={async () => { try { await api('/marketing/targets', { body: f }); onSaved(); } catch (e) { setErr((e as Error).message); } }}>Save target</button>
    </Drawer>
  );
}

function PersonDrawer({ uid, month, onClose }: { uid: number; month: string; onClose: () => void }) {
  const s = useApi<any>('/marketing/summary', { user_id: uid, month });
  const plan = useApi<any>('/marketing/plan', { user_id: uid, month });
  const [day, setDay] = useState<string | null>(null);
  const visits = useApi<any[]>(day ? '/marketing/visits' : null, { user_id: uid, date: day });
  const [np, setNp] = useState({ plan_date: '', area: '', who_to_meet: '' });
  const [err, setErr] = useState<string | null>(null);
  if (!s.data || !plan.data) return <Drawer title="…" onClose={onClose}><Loading /></Drawer>;
  const d = s.data;
  const first = new Date(`${month}-01T00:00:00`);
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const ds = (n: number) => `${month}-${String(n).padStart(2, '0')}`;
  return (
    <Drawer title={`${d.name} · ${month}`} onClose={onClose} wide>
      <ErrorBox msg={err} />
      <div className="grid g4" style={{ marginBottom: 10 }}>
        <div className="card"><small className="muted">Sales</small><br /><b>{rs(d.achieved.amount)}</b> <span className="muted">/ {rs(d.target.amount)} · {pct(d.pct.amount)}</span></div>
        <div className="card"><small className="muted">On pace</small><br /><Stars n={d.stars} /> <span className="muted">{pct(d.pct.on_pace)}</span></div>
        <div className="card"><small className="muted">km</small><br /><b>{d.achieved.km}</b> <span className="muted">/ {d.target.km}</span></div>
        <div className="card"><small className="muted">Visits</small><br /><b>{d.achieved.visits}</b> <span className="muted">/ {d.target.visits}</span></div>
      </div>
      {d.target.categories.length > 0 && <div className="card" style={{ marginBottom: 10 }}><h3>Category targets</h3>{d.target.categories.map((c: any) => <div key={c.category_id} className="list-item between"><span>{c.name}</span><span>{rs(c.achieved)} / {rs(c.amount)} · <b>{pct(c.pct)}</b></span></div>)}</div>}
      <h3>30-day plan & what happened</h3>
      <div className="cal">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => <div key={w} className="cal-h">{w}</div>)}
        {Array.from({ length: lead }, (_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const dt = ds(i + 1);
          const pl = plan.data.plans.filter((p: any) => p.plan_date === dt);
          const v = plan.data.visits.find((x: any) => x.visit_date === dt);
          const r = plan.data.daily.find((x: any) => x.report_date === dt);
          return (
            <div key={dt} className={`cal-d ${day === dt ? 'sel' : ''}`} onClick={() => setDay(dt)}>
              <b>{i + 1}</b>
              {pl.map((p: any) => <div key={p.id} className="cal-plan" title={p.who_to_meet ?? ''}>{p.area}</div>)}
              {v && <div className="cal-v">📍 {v.n} visits</div>}
              {r && <div className="cal-r">✓ {Number(r.km_run ?? r.gps_km ?? 0)} km · {rs(r.billed_amount)} · {r.self_rating}★</div>}
            </div>
          );
        })}
      </div>
      <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
        <input className="input" type="date" value={np.plan_date} onChange={(e) => setNp({ ...np, plan_date: e.target.value })} />
        <input className="input" style={{ flex: 1 }} value={np.area} onChange={(e) => setNp({ ...np, area: e.target.value })} placeholder="Area / place (Sector 32 sites)" />
        <input className="input" style={{ flex: 1 }} value={np.who_to_meet} onChange={(e) => setNp({ ...np, who_to_meet: e.target.value })} placeholder="Whom to meet" />
        <button className="btn sm" disabled={!np.plan_date || !np.area} onClick={async () => { try { await api('/marketing/plan', { body: { ...np, user_id: uid } }); setNp({ plan_date: '', area: '', who_to_meet: '' }); plan.reload(); } catch (e) { setErr((e as Error).message); } }}>Add to plan</button>
      </div>
      {day && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3>{day} — visits</h3>
          {(visits.data ?? []).map((v) => (
            <div key={v.id} className="list-item between">
              <span>{v.photo_id && <img src={`/api/files/${v.photo_id}?token=${localStorage.getItem('wt_token')}`} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, verticalAlign: 'middle', marginRight: 8 }} />}
                <b>{v.party_name}</b> <span className="muted">· {v.kind.replace('_', ' ')} · {v.person ?? ''} {v.phone ?? ''} · {v.outcome.replace('_', ' ')} · {v.visited_at.slice(11, 16)}</span></span>
              <span>{v.expected_amount ? rs(v.expected_amount) : ''} {v.lat && <a className="link" href={`https://maps.google.com/?q=${v.lat},${v.lng}`} target="_blank" rel="noreferrer">map</a>}</span>
            </div>
          ))}
          {visits.data && !visits.data.length && <div className="muted">No visits</div>}
        </div>
      )}
    </Drawer>
  );
}
