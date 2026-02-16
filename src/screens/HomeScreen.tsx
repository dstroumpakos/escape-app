import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Dimensions, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { NavigationProp } from '@react-navigation/native';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import * as Location from 'expo-location';
import { theme } from '../theme';
import { RootStackParamList, MainTabParamList } from '../types';
import { useTranslation } from '../i18n';

/** Haversine distance in km */
function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const { width } = Dimensions.get('window');
type Nav = NativeStackNavigationProp<RootStackParamList>;
type TabNav = NavigationProp<MainTabParamList>;

function DifficultyDots({ filled, total }: { filled: number; total: number }) {
  return (
    <View style={styles.diffDots}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[styles.diffDot, i < filled && styles.diffDotFilled]} />
      ))}
    </View>
  );
}

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const tabNavigation = useNavigation<TabNav>();
  const { t } = useTranslation();

  // Server queries
  const featuredRooms = useQuery(api.rooms.featured);
  const allRooms = useQuery(api.rooms.list);

  // Device location state
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    })();
  }, []);

  const featured = (featuredRooms ?? []).map((r: any) => ({ ...r, id: r._id }));

  // Trending Now: top-rated rooms sorted by star rating (then review count)
  const trending = React.useMemo(() => {
    if (!allRooms) return [];
    return [...allRooms]
      .map((r: any) => ({ ...r, id: r._id }))
      .sort((a, b) => b.rating - a.rating || b.reviews - a.reviews)
      .slice(0, 5);
  }, [allRooms]);

  // Near You: rooms that have coordinates, sorted by distance from user
  const nearYou = React.useMemo(() => {
    if (!allRooms) return [];
    const withCoords = allRooms
      .filter((r: any) => r.latitude != null && r.longitude != null)
      .map((r: any) => ({ ...r, id: r._id }));

    if (!userLocation) return withCoords.slice(0, 4);

    return [...withCoords]
      .map((r) => ({
        ...r,
        _dist: getDistanceKm(userLocation.latitude, userLocation.longitude, r.latitude, r.longitude),
      }))
      .sort((a, b) => a._dist - b._dist)
      .slice(0, 4);
  }, [allRooms, userLocation]);

  if (featuredRooms === undefined || allRooms === undefined) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.colors.redPrimary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => Alert.alert(t('home.menuTitle'), t('home.menuMessage'))}>
          <Ionicons name="menu" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>{t('home.title')}</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={() => Alert.alert(t('home.notifTitle'), t('home.notifMessage'))}>
          <Ionicons name="notifications-outline" size={22} color="#fff" />
          <View style={styles.notifDot} />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <TouchableOpacity style={styles.searchBar} activeOpacity={0.7} onPress={() => tabNavigation.navigate('Discover')}>
        <Ionicons name="search" size={18} color={theme.colors.textMuted} />
        <Text style={styles.searchText}>{t('home.searchPlaceholder')}</Text>
      </TouchableOpacity>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Featured */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('home.featured')}</Text>
          <TouchableOpacity style={styles.seeAll} onPress={() => tabNavigation.navigate('Discover')}>
            <Text style={styles.seeAllText}>{t('seeAll')}</Text>
            <Ionicons name="chevron-forward" size={14} color={theme.colors.redPrimary} />
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredScroll}>
          {featured.map(room => (
            <TouchableOpacity
              key={room.id}
              style={styles.featuredCard}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('RoomDetails', { id: room.id })}
            >
              <View style={styles.featuredImgWrap}>
                <Image source={{ uri: room.image }} style={styles.featuredImg} />
                <View style={styles.featuredOverlay} />
                {room.isNew && (
                  <View style={styles.newTag}>
                    <Text style={styles.newTagText}>{t('home.newArrival')}</Text>
                  </View>
                )}
                <View style={styles.ratingBadge}>
                  <Ionicons name="star" size={12} color={theme.colors.gold} />
                  <Text style={styles.ratingText}>{room.rating}</Text>
                </View>
              </View>
              <View style={styles.featuredInfo}>
                <Text style={styles.featuredTitle} numberOfLines={1}>{room.title}</Text>
                <View style={styles.featuredMeta}>
                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={12} color={theme.colors.textSecondary} />
                    <Text style={styles.metaText}>{room.duration}{t('min')}</Text>
                  </View>
                  <DifficultyDots filled={room.difficulty} total={room.maxDifficulty} />
                  <View style={styles.metaItem}>
                    <Ionicons name="people-outline" size={12} color={theme.colors.textSecondary} />
                    <Text style={styles.metaText}>{room.players}</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Near You */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('home.nearYou')}</Text>
          <TouchableOpacity style={styles.seeAll} onPress={() => navigation.navigate('MapView')}>
            <Text style={styles.seeAllText}>{t('seeAll')}</Text>
            <Ionicons name="chevron-forward" size={14} color={theme.colors.redPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.nearGrid}>
          {nearYou.map(room => (
            <TouchableOpacity
              key={room.id}
              style={styles.nearCard}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('RoomDetails', { id: room.id })}
            >
              <View style={styles.nearImgWrap}>
                <Image source={{ uri: room.image }} style={styles.nearImg} />
                <View style={styles.nearOverlay} />
                <View style={styles.nearRating}>
                  <Ionicons name="star" size={10} color={theme.colors.gold} />
                  <Text style={styles.nearRatingText}>{room.rating}</Text>
                </View>
              </View>
              <Text style={styles.nearTitle} numberOfLines={1}>{room.title}</Text>
              <Text style={styles.nearLoc} numberOfLines={1}>
                {room._dist != null ? `${room._dist.toFixed(1)} km · ` : ''}{room.location}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Trending */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('home.trending')}</Text>
          <TouchableOpacity style={styles.seeAll} onPress={() => tabNavigation.navigate('Discover')}>
            <Text style={styles.seeAllText}>{t('seeAll')}</Text>
            <Ionicons name="chevron-forward" size={14} color={theme.colors.redPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.trendingList}>
          {trending.map(room => (
            <TouchableOpacity
              key={room.id}
              style={styles.trendingCard}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('RoomDetails', { id: room.id })}
            >
              <Image source={{ uri: room.image }} style={styles.trendingImg} />
              <View style={styles.trendingInfo}>
                <Text style={styles.trendingTitle} numberOfLines={1}>{room.title}</Text>
                <Text style={styles.trendingDesc} numberOfLines={2}>{room.description}</Text>
                <View style={styles.trendingMeta}>
                  <View style={styles.metaItem}>
                    <Ionicons name="star" size={12} color={theme.colors.gold} />
                    <Text style={styles.metaTextBold}>{room.rating}</Text>
                  </View>
                  <DifficultyDots filled={room.difficulty} total={room.maxDifficulty} />
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const CARD_W = 260;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.glass, borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  topTitle: {
    fontSize: 22, fontWeight: '800', color: theme.colors.redPrimary,
  },
  notifDot: {
    position: 'absolute', top: 8, right: 8, width: 8, height: 8,
    borderRadius: 4, backgroundColor: theme.colors.redPrimary,
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 20, marginBottom: 16, padding: 14, paddingHorizontal: 16,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  searchText: { fontSize: 14, color: theme.colors.textMuted },
  scroll: { flex: 1 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, marginBottom: 14,
  },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  seeAllText: { fontSize: 13, color: theme.colors.redPrimary, fontWeight: '600' },

  // Featured
  featuredScroll: { paddingHorizontal: 20, gap: 14, marginBottom: 28 },
  featuredCard: {
    width: CARD_W, borderRadius: theme.radius.lg, overflow: 'hidden',
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  featuredImgWrap: { height: 150, overflow: 'hidden' },
  featuredImg: { width: '100%', height: '100%' },
  featuredOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  newTag: {
    position: 'absolute', top: 10, left: 10,
    paddingVertical: 4, paddingHorizontal: 10,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.redPrimary,
  },
  newTagText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  ratingBadge: {
    position: 'absolute', top: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 4, paddingHorizontal: 8, borderRadius: theme.radius.full,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  ratingText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  featuredInfo: { padding: 14 },
  featuredTitle: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 8 },
  featuredMeta: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: theme.colors.textSecondary },
  metaTextBold: { fontSize: 12, fontWeight: '600', color: '#fff' },

  // Difficulty dots
  diffDots: { flexDirection: 'row', gap: 3 },
  diffDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.15)' },
  diffDotFilled: { backgroundColor: theme.colors.redPrimary },

  // Near You
  nearGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
    paddingHorizontal: 20, marginBottom: 28,
  },
  nearCard: {
    width: (width - 52) / 2, borderRadius: theme.radius.lg, overflow: 'hidden',
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  nearImgWrap: { height: 110, overflow: 'hidden' },
  nearImg: { width: '100%', height: '100%' },
  nearOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  nearRating: {
    position: 'absolute', bottom: 8, right: 8,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingVertical: 3, paddingHorizontal: 7, borderRadius: theme.radius.full,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  nearRatingText: { fontSize: 11, fontWeight: '600', color: '#fff' },
  nearTitle: { fontSize: 13, fontWeight: '700', color: '#fff', paddingHorizontal: 10, paddingTop: 10 },
  nearLoc: { fontSize: 11, color: theme.colors.textSecondary, paddingHorizontal: 10, paddingBottom: 12 },

  // Trending
  trendingList: { paddingHorizontal: 20, gap: 12, marginBottom: 28 },
  trendingCard: {
    flexDirection: 'row', gap: 14, padding: 12, borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  trendingImg: { width: 80, height: 80, borderRadius: theme.radius.md },
  trendingInfo: { flex: 1, justifyContent: 'center' },
  trendingTitle: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 4 },
  trendingDesc: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 8, lineHeight: 17 },
  trendingMeta: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
