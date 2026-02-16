import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  ScrollView,
  Platform,
  Animated,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { theme } from '../theme';
import { RootStackParamList } from '../types';
import { useUser } from '../UserContext';
import type { Id } from '../../convex/_generated/dataModel';
import { useTranslation } from '../i18n';

const { width, height } = Dimensions.get('window');
type Nav = NativeStackNavigationProp<RootStackParamList>;

const DEFAULT_REGION: Region = {
  latitude: 37.9838,
  longitude: 23.7275,
  latitudeDelta: 0.45,
  longitudeDelta: 0.45,
};

const filters = ['All', 'Horror', 'Sci-Fi', 'Mystery', 'Historical'];

function getDiffLabel(d: number) {
  if (d <= 2) return 'discover.easy';
  if (d <= 3) return 'discover.medium';
  if (d <= 4) return 'discover.hard';
  return 'discover.expert';
}

function getDiffColor(d: number) {
  if (d <= 2) return { bg: 'rgba(76,175,80,0.15)', text: '#4CAF50' };
  if (d <= 3) return { bg: 'rgba(255,167,38,0.15)', text: '#FFA726' };
  if (d <= 4) return { bg: 'rgba(255,30,30,0.15)', text: '#FF1E1E' };
  return { bg: 'rgba(156,39,176,0.15)', text: '#CE93D8' };
}

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1d1214' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a7070' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a0d0d' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#3a2020' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#251515' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#6a4545' }] },
  { featureType: 'poi.park', elementType: 'geometry.fill', stylers: [{ color: '#1a2e1a' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a1515' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1a0d0d' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a1a1a' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#2a1010' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#251515' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d1a2a' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3a5070' }] },
];

export default function DiscoverScreen() {
  const navigation = useNavigation<Nav>();
  const { userId } = useUser();
  const { t } = useTranslation();
  const user = useQuery(
    api.users.getById,
    userId ? { userId: userId as Id<'users'> } : 'skip'
  );

  const convexRooms = useQuery(api.rooms.list);
  const rooms = (convexRooms ?? []).map((r: any) => ({ ...r, id: r._id }));

  const mapRef = useRef<MapView>(null);
  const cardAnim = useRef(new Animated.Value(0)).current;
  const geocodeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [activeFilter, setActiveFilter] = useState('All');
  const [selectedRoom, setSelectedRoom] = useState<(typeof rooms)[0] | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [initialRegionSet, setInitialRegionSet] = useState(false);
  const [cityLabel, setCityLabel] = useState(t('discover.locating'));

  const filtered = activeFilter === 'All' ? rooms : rooms.filter((r) => r.theme === activeFilter);

  const filterLabels: Record<string, string> = {
    All: t('discover.all'),
    Horror: t('theme.horror'),
    'Sci-Fi': t('theme.sciFi'),
    Mystery: t('theme.mystery'),
    Historical: t('theme.historical'),
  };

  // Use saved user location as initial region, fall back to device location
  useEffect(() => {
    if (user && user.latitude && user.longitude && !initialRegionSet) {
      const savedLoc = { latitude: user.latitude, longitude: user.longitude };
      setUserLocation(savedLoc);
      setCityLabel(user.city || t('discover.yourArea'));
      if (mapRef.current) {
        mapRef.current.animateToRegion(
          { ...savedLoc, latitudeDelta: 0.25, longitudeDelta: 0.25 },
          600
        );
      }
      setInitialRegionSet(true);
    }
  }, [user, initialRegionSet]);

  // Fallback: use device location if no saved location
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const deviceLoc = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setUserLocation(deviceLoc);

        // Only use device location if user has no saved location
        if (!initialRegionSet && !(user?.latitude)) {
          if (mapRef.current) {
            mapRef.current.animateToRegion(
              { ...deviceLoc, latitudeDelta: 0.25, longitudeDelta: 0.25 },
              600
            );
          }
          // Try to get city name
          try {
            const [place] = await Location.reverseGeocodeAsync(deviceLoc);
            if (place?.city) {
              setCityLabel([place.city, place.region].filter(Boolean).join(', '));
            }
          } catch {}
          setInitialRegionSet(true);
        }
      }
    })();
  }, []);

  useEffect(() => {
    Animated.spring(cardAnim, {
      toValue: selectedRoom ? 1 : 0,
      useNativeDriver: true,
      friction: 8,
      tension: 65,
    }).start();
  }, [selectedRoom]);

  const handleRegionChange = (region: Region) => {
    // Debounce reverse geocoding so it doesn't fire on every frame
    if (geocodeTimeout.current) clearTimeout(geocodeTimeout.current);
    geocodeTimeout.current = setTimeout(async () => {
      try {
        const [place] = await Location.reverseGeocodeAsync({
          latitude: region.latitude,
          longitude: region.longitude,
        });
        if (place) {
          const label = [place.city, place.region].filter(Boolean).join(', ');
          if (label) setCityLabel(label);
        }
      } catch {}
    }, 500);
  };

  const handleMarkerPress = (room: (typeof rooms)[0]) => {
    setSelectedRoom(room);
    const coords = room.latitude && room.longitude
      ? { latitude: room.latitude, longitude: room.longitude }
      : null;
    if (coords && mapRef.current) {
      mapRef.current.animateToRegion(
        { ...coords, latitudeDelta: 0.05, longitudeDelta: 0.05 },
        400
      );
    }
  };

  const handleRecenter = () => {
    if (mapRef.current) {
      mapRef.current.animateToRegion(DEFAULT_REGION, 500);
    }
    setSelectedRoom(null);
  };

  const handleMyLocation = () => {
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion(
        { ...userLocation, latitudeDelta: 0.08, longitudeDelta: 0.08 },
        500
      );
    }
  };

  const cardTranslateY = cardAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [250, 0],
  });

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={DEFAULT_REGION}
        customMapStyle={darkMapStyle}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        onMapReady={() => setMapReady(true)}
        onPress={() => setSelectedRoom(null)}
        onRegionChangeComplete={handleRegionChange}
        userInterfaceStyle="dark"
      >
        {mapReady &&
          filtered.map((room: any) => {
            const coords = room.latitude && room.longitude
              ? { latitude: room.latitude, longitude: room.longitude }
              : null;
            if (!coords) return null;
            const isSelected = selectedRoom?.id === room.id;
            return (
              <Marker
                key={room.id}
                coordinate={coords}
                onPress={() => handleMarkerPress(room)}
                tracksViewChanges={false}
              >
                <View style={styles.markerWrap}>
                  <View style={[styles.markerBubble, isSelected && styles.markerBubbleActive]}>
                    <Text style={[styles.markerPrice, isSelected && styles.markerPriceActive]}>
                      €{room.pricePerGroup?.length ? Math.min(...room.pricePerGroup.map((g: any) => g.price)) : room.price}
                    </Text>
                  </View>
                  <View style={[styles.markerArrow, isSelected && styles.markerArrowActive]} />
                  <View style={[styles.markerDot, isSelected && styles.markerDotActive]} />
                </View>
              </Marker>
            );
          })}
      </MapView>

      {/* Header overlay */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>{t('discover.title')}</Text>
            <View style={styles.locationRow}>
              <Ionicons name="location" size={12} color={theme.colors.redPrimary} />
              <Text style={styles.locationText}>{cityLabel}</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerBtn} onPress={handleRecenter}>
              <Ionicons name="map-outline" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {filters.map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.chip, activeFilter === f && styles.chipActive]}
              onPress={() => {
                setActiveFilter(f);
                setSelectedRoom(null);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, activeFilter === f && styles.chipTextActive]}>
                {filterLabels[f]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.countBadge}>
          <Ionicons name="key-outline" size={12} color={theme.colors.redPrimary} />
          <Text style={styles.countText}>
            {t('discover.roomsNearby', { n: filtered.length })}
          </Text>
        </View>
      </View>

      {/* Map controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.ctrlBtn} onPress={handleMyLocation}>
          <Ionicons name="locate" size={20} color={theme.colors.redPrimary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.ctrlBtn} onPress={handleRecenter}>
          <Ionicons name="scan-outline" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Selected room card */}
      <Animated.View
        style={[styles.bottomCard, { transform: [{ translateY: cardTranslateY }] }]}
        pointerEvents={selectedRoom ? 'auto' : 'none'}
      >
        {selectedRoom ? (
          <RoomCard room={selectedRoom} navigation={navigation} />
        ) : null}
      </Animated.View>

      {/* Room list peek (horizontal scroll when no room selected) */}
      {!selectedRoom ? (
        <View style={styles.listPeek}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.listPeekScroll}
            snapToInterval={width * 0.72 + 12}
            decelerationRate="fast"
          >
            {filtered.map((room) => (
              <TouchableOpacity
                key={room.id}
                style={styles.peekCard}
                activeOpacity={0.85}
                onPress={() => handleMarkerPress(room)}
              >
                <Image source={{ uri: room.image }} style={styles.peekImg} />
                <View style={styles.peekInfo}>
                  <Text style={styles.peekTitle} numberOfLines={1}>
                    {room.title}
                  </Text>
                  <View style={styles.peekMeta}>
                    <Ionicons name="star" size={11} color={theme.colors.gold} />
                    <Text style={styles.peekRating}>{room.rating}</Text>
                    <Text style={styles.peekPrice}>{room.pricePerGroup?.length ? `From €${Math.min(...room.pricePerGroup.map((g: any) => g.price))}` : `€${room.price}`}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function RoomCard({ room, navigation }: { room: any; navigation: Nav }) {
  const { t } = useTranslation();
  const dc = getDiffColor(room.difficulty);

  return (
    <TouchableOpacity
      activeOpacity={0.95}
      onPress={() => navigation.navigate('RoomDetails', { id: room.id })}
    >
      <View style={styles.cardInner}>
        <Image source={{ uri: room.image }} style={styles.cardImg} />
        <View style={styles.cardContent}>
          <View style={styles.cardTop}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {room.title}
            </Text>
            <View style={styles.cardRatingBadge}>
              <Ionicons name="star" size={12} color={theme.colors.gold} />
              <Text style={styles.cardRatingText}>{room.rating}</Text>
            </View>
          </View>

          <View style={styles.cardLocation}>
            <Ionicons name="location-outline" size={12} color={theme.colors.textMuted} />
            <Text style={styles.cardLocationText}>{room.location}</Text>
          </View>

          <View style={styles.cardDetails}>
            <View style={styles.cardDetail}>
              <Ionicons name="time-outline" size={13} color={theme.colors.textSecondary} />
              <Text style={styles.cardDetailText}>{room.duration}min</Text>
            </View>
            <View style={styles.cardDetail}>
              <Ionicons name="people-outline" size={13} color={theme.colors.textSecondary} />
              <Text style={styles.cardDetailText}>{room.players}</Text>
            </View>
            <View style={[styles.diffBadge, { backgroundColor: dc.bg }]}>
              <Text style={[styles.diffText, { color: dc.text }]}>
                {t(getDiffLabel(room.difficulty))}
              </Text>
            </View>
          </View>

          <View style={styles.cardBottom}>
            <Text style={styles.cardPrice}>
              {room.pricePerGroup?.length ? `From €${Math.min(...room.pricePerGroup.map((g: any) => g.price))}` : `€${room.price}`}
              {!room.pricePerGroup?.length && <Text style={styles.cardPriceSub}>{t('perPerson')}</Text>}
            </Text>
            <TouchableOpacity
              style={styles.bookBtn}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('DateTimeSelect', { id: room.id })}
            >
              <LinearGradient
                colors={[theme.colors.redPrimary, '#8B0000']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.bookBtnGrad}
              >
                <Text style={styles.bookBtnText}>{t('discover.bookNow')}</Text>
                <Ionicons name="arrow-forward" size={14} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },

  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingTop: 54,
    paddingBottom: 12,
    backgroundColor: 'rgba(26, 13, 13, 0.85)',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  locationText: { fontSize: 11, color: theme.colors.textSecondary },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },

  filterRow: { paddingHorizontal: 20, gap: 8, paddingBottom: 4 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
  },
  chipActive: { backgroundColor: theme.colors.redPrimary, borderColor: theme.colors.redPrimary },
  chipText: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },
  chipTextActive: { color: '#fff', fontWeight: '700' },

  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginLeft: 20,
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 30, 30, 0.08)',
  },
  countText: { fontSize: 11, fontWeight: '600', color: theme.colors.textSecondary },

  markerWrap: { alignItems: 'center' },
  markerBubble: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: theme.colors.redPrimary,
    shadowColor: '#FF1E1E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 5,
  },
  markerBubbleActive: { backgroundColor: '#fff', shadowColor: '#fff', shadowOpacity: 0.3 },
  markerPrice: { fontSize: 12, fontWeight: '800', color: '#fff' },
  markerPriceActive: { color: theme.colors.redPrimary },
  markerArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: theme.colors.redPrimary,
  },
  markerArrowActive: { borderTopColor: '#fff' },
  markerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.redPrimary,
    marginTop: 2,
    shadowColor: '#FF1E1E',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 3,
  },
  markerDotActive: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#fff', shadowColor: '#fff' },

  controls: {
    position: 'absolute',
    right: 16,
    top: height * 0.32,
    zIndex: 10,
    gap: 8,
  },
  ctrlBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(26, 13, 13, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
  },

  bottomCard: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    zIndex: 10,
  },
  cardInner: {
    flexDirection: 'row',
    backgroundColor: theme.colors.bgCardSolid,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 16 },
      android: { elevation: 10 },
    }),
  },
  cardImg: { width: 110, height: '100%', minHeight: 150 },
  cardContent: { flex: 1, padding: 14, justifyContent: 'space-between', gap: 4 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#fff', flex: 1 },
  cardRatingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 215, 0, 0.12)',
  },
  cardRatingText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  cardLocation: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  cardLocationText: { fontSize: 11, color: theme.colors.textMuted },
  cardDetails: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  cardDetail: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  cardDetailText: { fontSize: 11, color: theme.colors.textSecondary },
  diffBadge: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 6 },
  diffText: { fontSize: 10, fontWeight: '700' },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  cardPrice: { fontSize: 18, fontWeight: '800', color: '#fff' },
  cardPriceSub: { fontSize: 11, fontWeight: '500', color: theme.colors.textMuted },
  bookBtn: { borderRadius: 12, overflow: 'hidden' },
  bookBtnGrad: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 14 },
  bookBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  listPeek: { position: 'absolute', bottom: 100, left: 0, right: 0, zIndex: 10 },
  listPeekScroll: { paddingHorizontal: 16, gap: 12 },
  peekCard: {
    width: width * 0.72,
    flexDirection: 'row',
    backgroundColor: 'rgba(42, 18, 18, 0.92)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 },
      android: { elevation: 6 },
    }),
  },
  peekImg: { width: 80, height: 80 },
  peekInfo: { flex: 1, padding: 10, justifyContent: 'center', gap: 4 },
  peekTitle: { fontSize: 13, fontWeight: '700', color: '#fff' },
  peekMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  peekRating: { fontSize: 12, fontWeight: '600', color: '#fff' },
  peekPrice: { fontSize: 12, fontWeight: '700', color: theme.colors.redPrimary, marginLeft: 6 },
});
