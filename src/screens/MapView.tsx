import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { theme } from '../theme';
import { RootStackParamList } from '../types';
import { useTranslation } from '../i18n';
import RNMapView, { Marker, Circle, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const RADIUS_KM = 10;
const RADIUS_M = RADIUS_KM * 1000;

/** Haversine distance in km */
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function MapView() {
  const navigation = useNavigation<Nav>();
  const { t } = useTranslation();
  const mapRef = useRef<RNMapView>(null);

  // ── Location ──
  const [userLoc, setUserLoc] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locLoading, setLocLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLoc({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      }
      setLocLoading(false);
    })();
  }, []);

  // ── Rooms ──
  const convexRooms = useQuery(api.rooms.list);
  const allRooms = useMemo(
    () =>
      (convexRooms ?? []).map((r: any) => ({ ...r, id: r._id })),
    [convexRooms],
  );

  // Filter rooms within 10 km of user
  const nearbyRooms = useMemo(() => {
    if (!userLoc) return allRooms.filter((r: any) => r.latitude && r.longitude);
    return allRooms.filter((r: any) => {
      if (!r.latitude || !r.longitude) return false;
      return distanceKm(userLoc.latitude, userLoc.longitude, r.latitude, r.longitude) <= RADIUS_KM;
    });
  }, [allRooms, userLoc]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedRoom = nearbyRooms.find((r: any) => r.id === selectedId) || nearbyRooms[0];

  // Default region: user location or first room
  const defaultRegion = useMemo(() => {
    if (userLoc) return { ...userLoc, latitudeDelta: 0.12, longitudeDelta: 0.12 };
    const first = nearbyRooms[0];
    if (first?.latitude) return { latitude: first.latitude, longitude: first.longitude, latitudeDelta: 0.12, longitudeDelta: 0.12 };
    // Fallback: Athens, Greece
    return { latitude: 37.9838, longitude: 23.7275, latitudeDelta: 0.12, longitudeDelta: 0.12 };
  }, [userLoc, nearbyRooms]);

  const recenterMap = () => {
    if (mapRef.current && userLoc) {
      mapRef.current.animateToRegion({ ...userLoc, latitudeDelta: 0.12, longitudeDelta: 0.12 }, 600);
    }
  };

  if (locLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.colors.redPrimary} />
        <Text style={{ color: '#fff', marginTop: 12, fontSize: 14 }}>{t('map.loadingLocation')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Real Map */}
      <RNMapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_DEFAULT}
        initialRegion={defaultRegion}
        showsUserLocation
        showsMyLocationButton={false}
        userInterfaceStyle="dark"
        mapType="standard"
      >
        {/* 10 km radius circle */}
        {userLoc && (
          <Circle
            center={userLoc}
            radius={RADIUS_M}
            strokeColor="rgba(255,30,30,0.4)"
            fillColor="rgba(255,30,30,0.06)"
            strokeWidth={1.5}
          />
        )}

        {/* Room markers */}
        {nearbyRooms.map((room: any) => {
          if (!room.latitude || !room.longitude) return null;
          const isSelected = room.id === selectedRoom?.id;
          const dist = userLoc
            ? distanceKm(userLoc.latitude, userLoc.longitude, room.latitude, room.longitude).toFixed(1)
            : null;
          return (
            <Marker
              key={room.id}
              coordinate={{ latitude: room.latitude, longitude: room.longitude }}
              onPress={() => setSelectedId(room.id)}
            >
              <View style={styles.markerWrap}>
                <View style={[styles.markerBubble, isSelected && styles.markerBubbleActive]}>
                  <Text style={[styles.markerPrice, isSelected && styles.markerPriceActive]}>
                    €{room.pricePerGroup?.length ? Math.min(...room.pricePerGroup.map((g: any) => g.price)) : room.price}
                  </Text>
                </View>
                <View style={[styles.markerDot, isSelected && styles.markerDotActive]} />
              </View>
            </Marker>
          );
        })}
      </RNMapView>

      {/* Back Button */}
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
        <Ionicons name="arrow-back" size={20} color="#fff" />
      </TouchableOpacity>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={[styles.ctrlBtn, styles.locBtn]} activeOpacity={0.7} onPress={recenterMap}>
          <Ionicons name="locate" size={20} color={theme.colors.redPrimary} />
        </TouchableOpacity>
      </View>

      {/* Nearby badge */}
      <View style={styles.badge}>
        <Ionicons name="navigate-circle" size={16} color={theme.colors.redPrimary} />
        <Text style={styles.badgeText}>
          {nearbyRooms.length} {t('map.nearbyRooms')} ({RADIUS_KM} km)
        </Text>
      </View>

      {/* Bottom Card */}
      {selectedRoom && (
        <View style={styles.bottomCard}>
          <Image source={{ uri: selectedRoom.image }} style={styles.cardImg} />
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle} numberOfLines={1}>{selectedRoom.title}</Text>
            <View style={styles.cardMeta}>
              <View style={styles.cardRating}>
                <Ionicons name="star" size={14} color={theme.colors.gold} />
                <Text style={styles.cardRatingText}>{selectedRoom.rating}</Text>
              </View>
              <Text style={styles.cardPrice}>
                {selectedRoom.pricePerGroup?.length
                  ? `From €${Math.min(...selectedRoom.pricePerGroup.map((g: any) => g.price))}`
                  : `€${selectedRoom.price}${t('perPerson')}`}
              </Text>
            </View>
            {userLoc && selectedRoom.latitude && (
              <View style={styles.distRow}>
                <Ionicons name="location-outline" size={13} color={theme.colors.textSecondary} />
                <Text style={styles.distText}>
                  {distanceKm(userLoc.latitude, userLoc.longitude, selectedRoom.latitude, selectedRoom.longitude).toFixed(1)} km {t('map.away')}
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.bookBtn}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('RoomDetails', { id: selectedRoom.id })}
            >
              <Text style={styles.bookBtnText}>{t('map.bookNow')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Empty state */}
      {nearbyRooms.length === 0 && (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyCard}>
            <Ionicons name="location-outline" size={40} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>{t('map.noNearby')}</Text>
            <Text style={styles.emptyDesc}>{t('map.noNearbyDesc')}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1210' },

  // Markers
  markerWrap: { alignItems: 'center' },
  markerBubble: {
    paddingVertical: 4, paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: theme.colors.redPrimary,
    marginBottom: 4,
    shadowColor: '#FF1E1E', shadowOpacity: 0.5, shadowRadius: 6,
    elevation: 4,
  },
  markerBubbleActive: { backgroundColor: '#fff' },
  markerPrice: { fontSize: 12, fontWeight: '700', color: '#fff' },
  markerPriceActive: { color: theme.colors.redPrimary },
  markerDot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: theme.colors.redPrimary,
    shadowColor: '#FF1E1E', shadowOpacity: 0.6, shadowRadius: 6, elevation: 4,
  },
  markerDotActive: { width: 16, height: 16, borderRadius: 8 },

  // Controls
  backBtn: {
    position: 'absolute', top: 56, left: 20, zIndex: 5,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  controls: {
    position: 'absolute', top: 56, right: 20, zIndex: 5, gap: 8,
  },
  ctrlBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  locBtn: {},

  // Nearby badge
  badge: {
    position: 'absolute', top: 56, left: 72, zIndex: 5,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  badgeText: { fontSize: 13, fontWeight: '600', color: '#fff' },

  // Bottom card
  bottomCard: {
    position: 'absolute', bottom: 40, left: 20, right: 20, zIndex: 5,
    flexDirection: 'row', gap: 14, padding: 14,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    ...theme.shadow.card,
  },
  cardImg: { width: 90, height: 90, borderRadius: theme.radius.md },
  cardInfo: { flex: 1, justifyContent: 'center', gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardRating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardRatingText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  cardPrice: { fontSize: 13, color: theme.colors.textSecondary },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  distText: { fontSize: 12, color: theme.colors.textSecondary },
  bookBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: theme.radius.full,
    backgroundColor: theme.colors.redPrimary, ...theme.shadow.red,
  },
  bookBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // Empty state
  emptyWrap: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center', zIndex: 3,
    pointerEvents: 'box-none',
  },
  emptyCard: {
    alignItems: 'center', gap: 10,
    padding: 28, borderRadius: theme.radius.xl,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    maxWidth: 280,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#fff', textAlign: 'center' },
  emptyDesc: { fontSize: 13, color: theme.colors.textSecondary, textAlign: 'center' },
});
