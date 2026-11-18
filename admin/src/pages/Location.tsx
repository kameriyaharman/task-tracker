import { useCallback, useState } from 'react';
import { Circle, MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { Topbar } from '../Layout';
import { useApi, useInterval } from '../hooks';
import { timeOf } from '../format';
import { Badge, Empty, ErrorBox, Loading, Person } from '../ui';

const pin = (label: string, color: string) =>
  L.divIcon({
    className: '',
    html: `<div style="background:${color};color:#fff;font:600 11px Poppins,sans-serif;padding:4px 8px;border-radius:14px;box-shadow:0 2px 6px rgba(0,0,0,.25);white-space:nowrap;transform:translate(-50%,-100%)">${label}</div>`,
  });

export default function Location() {
  const live = useApi<any>('/location/live');
  const [sel, setSel] = useState<number | null>(null);
  const tl = useApi<any>(sel ? `/location/timeline/${sel}` : null);
  const reload = useCallback(() => live.reload(), [live.reload]);
  useInterval(reload, 60000);

  const people: any[] = live.data?.people ?? [];
  const fences: any[] = live.data?.geofences ?? [];
  const center: [number, number] = people[0] ? [+people[0].lat, +people[0].lng] : fences[0] ? [+fences[0].lat, +fences[0].lng] : [28.6139, 77.209];

  return (
    <>
      <Topbar title="Live location" />
      <ErrorBox msg={live.error} />
      {!live.data ? <Loading /> : (
        <div className="grid g12">
          <div className="stack">
            <div className="card">
              <h3>Field team</h3>
              {people.length ? people.map((p) => (
                <div key={p.user_id} className="list-item between" style={{ cursor: 'pointer' }} onClick={() => setSel(p.user_id)}>
                  <Person name={p.name} initials={p.initials}
                    sub={p.state === 'inside' ? `${p.inside_geofence} geofence` : `${p.place_label ?? (p.state === 'travelling' ? 'Moving' : 'On visit')} · ${timeOf(p.recorded_at)}${p.km_from_office != null ? ` · ${p.km_from_office} km` : ''}`} />
                  <Badge s={p.state}>{p.state === 'inside' ? 'Inside' : p.state === 'travelling' ? 'Travelling' : 'Visit'}</Badge>
                </div>
              )) : <Empty>No one is sharing location right now</Empty>}
            </div>
            {sel && (
              <div className="card">
                <h3>{people.find((p) => p.user_id === sel)?.name.split(' ')[0]} · today</h3>
                {!tl.data ? <Loading /> : (
                  <>
                    {tl.data.visits.map((v: any, i: number) => <div key={i} className="list-item between"><span>{v.place_label ?? 'Stop'}</span><span className="muted">{timeOf(v.recorded_at)}</span></div>)}
                    {tl.data.completed_tasks.map((t: any, i: number) => <div key={`t${i}`} className="list-item between"><span>{t.completion_place ?? ''} — {t.title} ✓</span><span className="muted">{timeOf(t.completed_at)}</span></div>)}
                    {!tl.data.visits.length && !tl.data.completed_tasks.length && <Empty>No visits yet</Empty>}
                  </>
                )}
              </div>
            )}
            <p className="muted">Location is tracked only during working hours (between punch-in and punch-out), with employee consent.</p>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <MapContainer center={center} zoom={12} className="map" scrollWheelZoom>
              <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {fences.map((g) => (
                <Circle key={g.id} center={[+g.lat, +g.lng]} radius={+g.radius_m} pathOptions={{ color: '#5b5bd6', fillOpacity: 0.12 }}>
                  <Tooltip>{g.name}</Tooltip>
                </Circle>
              ))}
              {people.map((p) => (
                <Marker key={p.user_id} position={[+p.lat, +p.lng]} icon={pin(p.name.split(' ')[0], p.state === 'inside' ? '#16a34a' : p.state === 'travelling' ? '#d97706' : '#5b5bd6')}
                  eventHandlers={{ click: () => setSel(p.user_id) }} />
              ))}
              {tl.data?.path?.length > 1 && <Polyline positions={tl.data.path.map((x: any) => [+x.lat, +x.lng])} pathOptions={{ color: '#1c1a4a', dashArray: '6 6' }} />}
            </MapContainer>
          </div>
        </div>
      )}
    </>
  );
}
