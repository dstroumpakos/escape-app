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
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { RoomCard, RoomRow } from '../components/RoomCard';
import { DifficultySkulls, PrimaryButton } from '../components/ui';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { theme } from '../theme';
import { RootStackParamList } from '../types';
import { useUser } from '../UserContext';
import type { Id } from '../../convex/_generated/dataModel';
import { useTranslation } from '../i18n';
import { ROOM_THEMES, ROOM_THEME_VALUES } from '../roomThemes';

const { width, height } = Dimensions.get('window');
type Nav = NativeStackNavigationProp<RootStackParamList>;

// Before we know where the player or the rooms are: the whole world.
const DEFAULT_REGION: Region = {
  latitude: 25,
  longitude: 10,
  latitudeDelta: 110,
  longitudeDelta: 110,
};

const filters = ['All', ...ROOM_THEME_VALUES];

// Custom dark map style – only applies on Android (Google Maps provider).
// On iOS Apple Maps uses userInterfaceStyle="dark" instead.
const darkMapStyle = Platform.OS === 'android' ? [
  { elementType: 'geometry', stylers: [{ color: '#1d1214' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a7070' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#080505' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#3a2020' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#251515' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#6a4545' }] },
  { featureType: 'poi.park', elementType: 'geometry.fill', stylers: [{ color: '#1a2e1a' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a1515' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#080505' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a1a1a' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#2a1010' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#251515' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d1a2a' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3a5070' }] },
] : undefined;

export default function DiscoverScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { userId } = useUser();
  const { t } = useTranslation();
  const user = useQuery(
    api.users.getById,
    userId ? { userId: userId as Id<'users'> } : 'skip'
  );

  const convexRooms = useQuery(
    api.premium.getVisibleRooms,
    userId ? { userId: userId as Id<'users'> } : {}
  );
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
  // No saved or device location: frame the rooms themselves instead of a fixed city
  const [locationUnavailable, setLocationUnavailable] = useState(false);

  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<'rating' | 'price' | 'duration'>('rating');
  const [listMode, setListMode] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);

  // Same search and sort as the website's Discover page
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const lowest = (r: any) =>
      r.pricePerGroup?.length ? Math.min(...r.pricePerGroup.map((g: any) => g.price)) : r.price ?? 0;
    return rooms
      .filter((r) => activeFilter === 'All' || r.theme === activeFilter)
      .filter(
        (r) =>
          !q ||
          r.title?.toLowerCase().includes(q) ||
          r.location?.toLowerCase().includes(q) ||
          r.theme?.toLowerCase().includes(q) ||
          r.companyName?.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        if (sortBy === 'price') return lowest(a) - lowest(b);
        if (sortBy === 'duration') return (a.duration ?? 0) - (b.duration ?? 0);
        return (b.rating ?? 0) - (a.rating ?? 0) || (b.reviews ?? 0) - (a.reviews ?? 0);
      });
  }, [convexRooms, activeFilter, query, sortBy]);

  const filterLabels: Record<string, string> = {
    All: t('discover.all'),
    ...Object.fromEntries(ROOM_THEMES.map((th) => [th.value, t(th.key)])),
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
      } else {
        setLocationUnavailable(true);
      }
    })().catch(() => setLocationUnavailable(true));
  }, []);

  /** Zoom out (or in) until every listed room with coordinates is on screen. */
  const fitToRooms = (list: any[]) => {
    const coords = list
      .filter((r) => r.latitude && r.longitude)
      .map((r) => ({ latitude: r.latitude, longitude: r.longitude }));
    if (!mapRef.current) return;
    if (coords.length === 0) {
      mapRef.current.animateToRegion(DEFAULT_REGION, 500);
    } else if (coords.length === 1) {
      mapRef.current.animateToRegion({ ...coords[0], latitudeDelta: 0.25, longitudeDelta: 0.25 }, 500);
    } else {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 230, right: 60, bottom: 220, left: 60 },
        animated: true,
      });
    }
  };

  useEffect(() => {
    if (!locationUnavailable || initialRegionSet || !mapReady || rooms.length === 0) return;
    fitToRooms(rooms);
    setCityLabel(t('discover.yourArea'));
    setInitialRegionSet(true);
  }, [locationUnavailable, initialRegionSet, mapReady, rooms.length]);

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
    fitToRooms(filtered);
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
                  <View style={[styles.markerBubble, isSelected && styles.markerBubbleActive, room.isEarlyAccess && styles.markerBubbleEarlyAccess]}>
                    {room.isEarlyAccess && <Ionicons name="diamond" size={10} color={isSelected ? theme.colors.blood : theme.colors.gold} style={{ marginRight: 3 }} />}
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
      <View
        style={[styles.header, { paddingTop: insets.top + 8 }]}
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      >
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>{t('discover.title')}</Text>
            <View style={styles.locationRow}>
              <Ionicons name="location" size={12} color={theme.colors.redLight} />
              <Text style={styles.locationText}>{cityLabel}</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => {
                setListMode(!listMode);
                setSelectedRoom(null);
              }}
              accessibilityRole="button"
              accessibilityLabel={listMode ? t('discover.mapView') : t('discover.listView')}
            >
              <Ionicons name={listMode ? 'map-outline' : 'list-outline'} size={18} color={theme.colors.bone} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={theme.colors.redLight} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={(v) => {
              setQuery(v);
              setSelectedRoom(null);
            }}
            placeholder={t('discover.searchPlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('cancel')}>
              <Ionicons name="close-circle" size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>
          )}
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
          <Ionicons name="key-outline" size={12} color={theme.colors.redLight} />
          <Text style={styles.countText}>
            {filtered.length === 1
              ? t('discover.roomNearby')
              : t('discover.roomsNearby', { n: filtered.length })}
          </Text>
        </View>
      </View>

      {/* List view: the same rooms as cards, with sorting */}
      {listMode && (
        <View style={[styles.listView, { top: headerHeight }]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
          >
            <View style={styles.sortRow}>
              {(['rating', 'price', 'duration'] as const).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, sortBy === s && styles.chipActive]}
                  onPress={() => setSortBy(s)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, sortBy === s && styles.chipTextActive]}>{t('discover.sort_' + s)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {filtered.length === 0 ? (
              <View style={styles.listEmpty}>
                <Ionicons name="search-outline" size={30} color={theme.colors.glassBorder} />
                <Text style={styles.listEmptyText}>{t('discover.noResults')}</Text>
              </View>
            ) : (
              filtered.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  earlyLabel={room.isEarlyAccess ? t('home.earlyAccess') : undefined}
                  onPress={() => navigation.navigate('RoomDetails', { id: room.id })}
                />
              ))
            )}
          </ScrollView>
        </View>
      )}

      {/* Map controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.ctrlBtn} onPress={handleMyLocation}>
          <Ionicons name="locate" size={20} color={theme.colors.redLight} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.ctrlBtn} onPress={handleRecenter}>
          <Ionicons name="scan-outline" size={20} color={theme.colors.bone} />
        </TouchableOpacity>
      </View>

      {/* Selected room card */}
      <Animated.View
        style={[styles.bottomCard, { transform: [{ translateY: cardTranslateY }] }]}
        pointerEvents={selectedRoom ? 'auto' : 'none'}
      >
        {selectedRoom ? (
          <SelectedRoomCard room={selectedRoom} navigation={navigation} />
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
              <RoomRow
                key={room.id}
                room={room}
                style={styles.peekCard}
                earlyLabel={
                  room.isEarlyAccess
                    ? room.daysUntilRelease != null
                      ? t('home.earlyDays', { n: room.daysUntilRelease })
                      : t('home.earlyAccess')
                    : undefined
                }
                onPress={() => handleMarkerPress(room)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function SelectedRoomCard({ room, navigation }: { room: any; navigation: Nav }) {
  const { t } = useTranslation();

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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {room.isEarlyAccess && (
                <View style={styles.earlyAccessCardBadge}>
                  <Ionicons name="diamond" size={10} color={theme.colors.gold} />
                  <Text style={styles.earlyAccessCardText}>{t('home.earlyAccess')}</Text>
                </View>
              )}
              <View style={styles.cardRatingBadge}>
                <Ionicons name="star" size={12} color={theme.colors.gold} />
                <Text style={styles.cardRatingText}>{room.rating > 0 ? room.rating : t('discover.new')}</Text>
              </View>
            </View>
          </View>

          <View style={styles.cardLocation}>
            <Ionicons name="location-outline" size={12} color={theme.colors.textMuted} />
            <Text style={styles.cardLocationText}>{room.location}</Text>
          </View>

          <View style={styles.cardDetails}>
            <View style={styles.cardDetail}>
              <Ionicons name="time-outline" size={13} color={theme.colors.textSecondary} />
              <Text style={styles.cardDetailText}>{room.duration}{t('min')}</Text>
            </View>
            <View style={styles.cardDetail}>
              <Ionicons name="people-outline" size={13} color={theme.colors.textSecondary} />
              <Text style={styles.cardDetailText}>{room.players}</Text>
            </View>
            <DifficultySkulls level={room.difficulty ?? 3} max={room.maxDifficulty ?? 5} size={12} />
          </View>

          <View style={styles.cardBottom}>
            <Text style={styles.cardPrice}>
              {room.pricePerGroup?.length ? t('fromPrice', { amount: Math.min(...room.pricePerGroup.map((g: any) => g.price)) }) : `€${room.price}`}
              {!room.pricePerGroup?.length && <Text style={styles.cardPriceSub}>{t('perPerson')}</Text>}
            </Text>
            <PrimaryButton
              small
              label={t('discover.bookNow')}
              icon="arrow-forward"
              onPress={() => navigation.navigate('DateTimeSelect', { id: room.id })}
            />
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
    paddingTop: 12, // actual top padding set dynamically via insets
    paddingBottom: 12,
    backgroundColor: 'rgba(8, 5, 5, 0.88)',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.glassBorder,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  headerTitle: { fontFamily: theme.fonts.displayBlack, fontSize: 26, lineHeight: 32, color: theme.colors.bone },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  locationText: { fontSize: 11, color: theme.colors.textSecondary },
  headerActions: { flexDirection: 'row', gap: 8 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 20, marginBottom: 10, paddingHorizontal: 12, height: 40,
    borderRadius: theme.radius.lg,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1, borderColor: 'rgba(200, 16, 27, 0.4)',
  },
  searchInput: { flex: 1, fontSize: 14, color: theme.colors.bone, paddingVertical: 0 },
  listView: {
    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 11,
    backgroundColor: theme.colors.bgPrimary,
  },
  listContent: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 40, gap: 14 },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  listEmpty: { alignItems: 'center', gap: 10, paddingVertical: 50 },
  listEmptyText: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center' },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.glass,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },

  filterRow: { paddingHorizontal: 20, gap: 8, paddingBottom: 4 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: theme.radius.sm,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
  },
  chipActive: { backgroundColor: theme.colors.redPrimary, borderColor: theme.colors.redPrimary },
  chipText: { fontFamily: theme.fonts.type, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: theme.colors.textSecondary },
  chipTextActive: { color: theme.colors.bone },

  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginLeft: 20,
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.redSubtle,
  },
  countText: { fontSize: 11, fontWeight: '600', color: theme.colors.textSecondary },

  markerWrap: { alignItems: 'center' },
  markerBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.redPrimary,
    shadowColor: theme.colors.redLight,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 5,
  },
  markerBubbleActive: { backgroundColor: theme.colors.bone, shadowColor: '#fff', shadowOpacity: 0.3 },
  markerPrice: { fontSize: 12, fontWeight: '800', color: theme.colors.bone },
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
  markerArrowActive: { borderTopColor: theme.colors.bone },
  markerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.redPrimary,
    marginTop: 2,
    shadowColor: theme.colors.redLight,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 3,
  },
  markerDotActive: { width: 12, height: 12, borderRadius: 6, backgroundColor: theme.colors.bone, shadowColor: '#fff' },

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
    borderRadius: theme.radius.lg,
    backgroundColor: 'rgba(8, 5, 5, 0.88)',
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
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(200, 16, 27, 0.45)',
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 16 },
      android: { elevation: 10 },
    }),
  },
  cardImg: { width: 110, height: '100%', minHeight: 150, resizeMode: 'cover' },
  cardContent: { flex: 1, padding: 14, justifyContent: 'space-between', gap: 4 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  cardTitle: { fontFamily: theme.fonts.display, fontSize: 16, color: theme.colors.bone, flex: 1 },
  cardRatingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: theme.radius.sm,
    backgroundColor: 'rgba(201, 154, 46, 0.14)',
  },
  cardRatingText: { fontSize: 12, fontWeight: '700', color: theme.colors.bone },
  cardLocation: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  cardLocationText: { fontSize: 11, color: theme.colors.textMuted },
  cardDetails: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  cardDetail: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  cardDetailText: { fontSize: 11, color: theme.colors.textSecondary },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  cardPrice: { fontSize: 18, fontFamily: theme.fonts.display, color: theme.colors.bone },
  cardPriceSub: { fontSize: 11, fontWeight: '500', color: theme.colors.textMuted },

  listPeek: { position: 'absolute', bottom: 100, left: 0, right: 0, zIndex: 10 },
  listPeekScroll: { paddingHorizontal: 16, gap: 12 },
  peekCard: { width: width * 0.72, ...theme.shadow.card },

  // Early access styles
  markerBubbleEarlyAccess: { borderColor: theme.colors.gold, borderWidth: 1.5 },
  earlyAccessCardBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingVertical: 3, paddingHorizontal: 8,
    borderRadius: theme.radius.sm, backgroundColor: 'rgba(0,0,0,0.8)',
    borderWidth: 1, borderColor: 'rgba(201, 154, 46, 0.6)',
  },
  earlyAccessCardText: { fontSize: 10, fontWeight: '700', color: theme.colors.gold },
});
