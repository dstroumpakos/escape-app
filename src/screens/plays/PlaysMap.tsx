import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import RNMapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';
import { LEVELS, type Level } from './shared';
import { LevelChip } from './PlaysTab';

type Pin = { id: string; title: string; company: string; lat: number; lng: number; level: string; roomId: string | null };

/** Every room I played that has a position: QR stamps and Rooms Played entries (plays.mine().pins). */
export default function PlaysMap({ pins }: { pins: Pin[] }) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const region = useMemo(() => {
    if (!pins.length) return undefined;
    const lats = pins.map((p) => p.lat);
    const lngs = pins.map((p) => p.lng);
    const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(0.05, (maxLat - minLat) * 1.6),
      longitudeDelta: Math.max(0.05, (maxLng - minLng) * 1.6),
    };
  }, [pins]);

  if (!pins.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{t('pl.map_empty')}</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.mapWrap}>
        <RNMapView style={StyleSheet.absoluteFill} provider={PROVIDER_DEFAULT} initialRegion={region} userInterfaceStyle="dark">
          {pins.map((p) => {
            const color = (LEVELS[p.level as Level] ?? LEVELS.declared).color;
            return (
              <Marker
                key={p.id}
                coordinate={{ latitude: p.lat, longitude: p.lng }}
                title={p.title}
                description={p.company}
                onCalloutPress={p.roomId ? () => navigation.navigate('RoomDetails', { id: p.roomId }) : undefined}
              >
                <View style={[styles.dot, { backgroundColor: color, shadowColor: color }]} />
              </Marker>
            );
          })}
        </RNMapView>
      </View>
      <View style={styles.legend}>
        {(['confirmed', 'verified', 'vouched', 'pending', 'declared'] as Level[]).map((l) => <LevelChip key={l} level={l} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrap: { height: 380, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: '#120a08', shadowOpacity: 0.8, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderColor: theme.colors.border, borderRadius: 12, padding: 18, alignItems: 'center' },
  emptyText: { color: theme.colors.textSecondary, fontSize: 13 },
});
