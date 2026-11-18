import { Platform, View } from 'react-native';
import Constants from 'expo-constants';
import MapView, { Circle, Marker } from 'react-native-maps';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';
import { first, timeOf } from '../lib/format';
import { Avatar, Badge, Card, Empty, Loading, Row, Screen, T } from '../components/ui';
import { C } from '../lib/theme';

/** Manager: field team on the map (only people punched in who consented). */
export default function TeamMap() {
  const { t } = useAuth();
  const { data, loading, reload } = useApi<any>('/location/live');
  const people: any[] = data?.people ?? [];
  const fences: any[] = data?.geofences ?? [];
  const c = people[0] ?? fences[0];
  // Android maps need a Google Maps API key (app.json → android.config.googleMaps.apiKey); without it show the list only.
  const mapsReady = Platform.OS !== 'android' || !!(Constants.expoConfig?.android as any)?.config?.googleMaps?.apiKey;

  return (
    <Screen back title={t('team_location')} refreshing={loading} onRefresh={reload}>
      {!data ? <Loading /> : (
        <>
          {c && mapsReady && (
            <View style={{ height: 300, borderRadius: 18, overflow: 'hidden', marginBottom: 14 }}>
              <MapView style={{ flex: 1 }} initialRegion={{ latitude: +c.lat, longitude: +c.lng, latitudeDelta: 0.12, longitudeDelta: 0.12 }}>
                {fences.map((g) => <Circle key={`g${g.id}`} center={{ latitude: +g.lat, longitude: +g.lng }} radius={+g.radius_m} strokeColor={C.gold} fillColor="rgba(168,114,44,0.12)" />)}
                {people.map((p) => (
                  <Marker key={p.user_id} coordinate={{ latitude: +p.lat, longitude: +p.lng }} title={p.name} description={p.place_label ?? ''}
                    pinColor={p.state === 'inside' ? 'green' : p.state === 'travelling' ? 'orange' : '#A8722C'} />
                ))}
              </MapView>
            </View>
          )}
          {people.length ? people.map((p) => (
            <Card key={p.user_id} style={{ marginBottom: 8 }}>
              <Row>
                <Avatar initials={p.initials} size={34} />
                <View style={{ flex: 1 }}>
                  <T b>{first(p.name)}{p.place_label ? ` — ${p.place_label}` : ''}</T>
                  <T muted>{p.state === 'inside' ? `${p.inside_geofence} geofence` : `${t('field')} · ${p.km_from_office ?? '?'} km · ${timeOf(p.recorded_at)}`}</T>
                </View>
                <Badge s={p.state} label={p.state === 'inside' ? 'Inside' : p.state === 'travelling' ? 'Moving' : 'Visit'} />
              </Row>
            </Card>
          )) : <Empty text={t('nothing_here')} />}
          <T muted style={{ textAlign: 'center', marginTop: 8 }}>Tracked only during working hours, with consent.</T>
        </>
      )}
    </Screen>
  );
}
