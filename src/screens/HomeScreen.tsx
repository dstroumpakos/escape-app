import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import * as Location from 'expo-location';
import { theme } from '../theme';
import { RootStackParamList, MainTabParamList } from '../types';
import { useTranslation } from '../i18n';
import { useUser } from '../UserContext';
import type { Id } from '../../convex/_generated/dataModel';
import { RoomCard, RoomRow } from '../components/RoomCard';
import { TypeLabel } from '../components/ui';
import { EyeKeyhole } from '../components/EyeKeyhole';
import { BloodDrips, FadeUp, Flicker, WatchingEyes } from '../components/motion';

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

type Nav = NativeStackNavigationProp<RootStackParamList>;
type TabNav = NavigationProp<MainTabParamList>;

function SectionHeader({
  tag,
  title,
  onSeeAll,
  gold,
}: {
  tag?: string;
  title: string;
  onSeeAll?: () => void;
  gold?: boolean;
}) {
  const { t } = useTranslation();
  const accent = gold ? theme.colors.gold : theme.colors.redLight;
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1 }}>
        {!!tag && <TypeLabel color={accent}>{tag}</TypeLabel>}
        <Text style={[styles.sectionTitle, gold && { color: theme.colors.gold }]}>{title}</Text>
      </View>
      {onSeeAll && (
        <TouchableOpacity style={styles.seeAll} onPress={onSeeAll} hitSlop={10}>
          <Text style={[styles.seeAllText, { color: accent }]}>{t('seeAll')}</Text>
          <Ionicons name="chevron-forward" size={14} color={accent} />
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const tabNavigation = useNavigation<TabNav>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { userId } = useUser();
  const unreadCount = useQuery(
    api.notifications.unreadCount,
    userId ? { userId: userId as Id<"users"> } : 'skip',
  ) ?? 0;

  // Server queries
  const featuredRooms = useQuery(api.rooms.featured);
  const allRooms = useQuery(api.rooms.list);
  const premiumStatus = useQuery(
    api.premium.getStatus,
    userId ? { userId: userId as Id<"users"> } : 'skip',
  );
  const earlyAccessRooms = useQuery(
    api.premium.getEarlyAccessRooms,
    userId && premiumStatus?.isPremium ? { userId: userId as Id<"users"> } : 'skip',
  );

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

  const openRoom = (id: string) => navigation.navigate('RoomDetails', { id });

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>
        {/* Hero: the wall, lit from above */}
        <LinearGradient
          colors={['#1D1010', '#0D0707', theme.colors.bgPrimary]}
          style={[styles.hero, { paddingTop: insets.top + 8 }]}
        >
          {/* Eyes in the dark */}
          <WatchingEyes
            pairs={[
              // Kept to the empty strips (top bar gap, below the search) so they never sit behind text
              { x: 56, y: 15, size: 13, delay: 1800, tilt: 8 },
              { x: 8, y: 93, size: 12, delay: 3200, tilt: -6 },
              { x: 70, y: 94, size: 10, delay: 4600 },
            ]}
          />
          <View style={styles.topBar}>
            <View style={styles.brand}>
              <EyeKeyhole size={30} />
              <Flicker period={7000} delay={1500}>
                <Text style={styles.wordmark}>UNLOCKED</Text>
              </Flicker>
            </View>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => navigation.navigate('Notifications')}
              accessibilityRole="button"
              accessibilityLabel={t('home.notifTitle')}
            >
              <Ionicons
                name={unreadCount > 0 ? 'notifications' : 'notifications-outline'}
                size={20}
                color={theme.colors.bone}
              />
              {unreadCount > 0 && <View style={styles.notifDot} />}
            </TouchableOpacity>
          </View>

          <FadeUp delay={100}>
            <Text style={styles.heroTitle}>{t('home.heroTitle1')}</Text>
          </FadeUp>
          <FadeUp delay={300}>
            <Text style={[styles.heroTitle, styles.heroTitleRed]}>{t('home.heroTitle2')}</Text>
            <BloodDrips count={7} seed={2} maxLength={30} style={styles.heroDrips} />
          </FadeUp>
          <FadeUp delay={500}>
            <Text style={styles.heroSubtitle}>{t('home.heroSubtitle')}</Text>
          </FadeUp>

          <FadeUp delay={650}>
          <TouchableOpacity
            style={styles.searchBar}
            activeOpacity={0.8}
            onPress={() => tabNavigation.navigate('Discover')}
            accessibilityRole="search"
            accessibilityLabel={t('home.searchPlaceholder')}
          >
            <Ionicons name="search" size={18} color={theme.colors.redLight} />
            <Text style={styles.searchText} numberOfLines={1}>
              {t('home.searchPlaceholder')}
            </Text>
            <LinearGradient colors={theme.buttonGradient} style={styles.searchGo}>
              <Ionicons name="arrow-forward" size={18} color={theme.colors.bone} />
            </LinearGradient>
          </TouchableOpacity>
          </FadeUp>
        </LinearGradient>

        <FadeUp delay={800}>

        {/* Early Access Rooms (Premium only) */}
        {premiumStatus?.isPremium && earlyAccessRooms && earlyAccessRooms.length > 0 && (
          <>
            <SectionHeader gold title={t('home.earlyAccess')} onSeeAll={() => navigation.navigate('Premium')} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
              {earlyAccessRooms.map((room: any) => (
                <RoomCard
                  key={room._id}
                  room={room}
                  style={styles.carouselCard}
                  earlyLabel={
                    room.daysUntilRelease != null
                      ? t('home.earlyDays', { n: room.daysUntilRelease })
                      : t('home.earlyAccess')
                  }
                  onPress={() => openRoom(room._id)}
                />
              ))}
            </ScrollView>
          </>
        )}

        {/* Featured */}
        {featured.length > 0 && (
          <>
            <SectionHeader
              tag={t('home.featuredTag')}
              title={t('home.featured')}
              onSeeAll={() => tabNavigation.navigate('Discover')}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
              {featured.map((room) => (
                <RoomCard key={room.id} room={room} style={styles.carouselCard} onPress={() => openRoom(room.id)} />
              ))}
            </ScrollView>
          </>
        )}

        {/* Near You */}
        {nearYou.length > 0 && (
          <>
            <SectionHeader
              tag={t('home.nearYouTag')}
              title={t('home.nearYou')}
              onSeeAll={() => navigation.navigate('MapView')}
            />
            <View style={styles.nearList}>
              {nearYou.map((room) => (
                <RoomRow key={room.id} room={room} distanceKm={room._dist} onPress={() => openRoom(room.id)} />
              ))}
            </View>
          </>
        )}

        {/* Premium Upsell */}
        {premiumStatus && !premiumStatus.isPremium && (
          <TouchableOpacity
            style={styles.premiumUpsell}
            onPress={() => navigation.navigate('Premium')}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Ionicons name="diamond" size={22} color={theme.colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={styles.premiumTitle}>{t('premium.headerTitle')}</Text>
              <Text style={styles.premiumDesc}>{t('home.premiumDesc')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.gold} />
          </TouchableOpacity>
        )}
        </FadeUp>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },

  hero: { paddingHorizontal: 20, paddingBottom: 44, marginBottom: 0 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 28,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wordmark: {
    fontFamily: theme.fonts.displayBlack, fontSize: 20, letterSpacing: 4,
    color: theme.colors.redLight,
    textShadowColor: 'rgba(255, 30, 40, 0.55)', textShadowRadius: 12, textShadowOffset: { width: 0, height: 0 },
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: theme.radius.lg, alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.glass, borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  notifDot: {
    position: 'absolute', top: 8, right: 8, width: 8, height: 8,
    borderRadius: 4, backgroundColor: theme.colors.redLight,
  },
  heroTitle: {
    fontFamily: theme.fonts.displayBlack, fontSize: 31, lineHeight: 37,
    color: theme.colors.bone,
  },
  heroTitleRed: {
    color: theme.colors.redLight,
    textShadowColor: 'rgba(255, 20, 30, 0.5)', textShadowRadius: 16, textShadowOffset: { width: 0, height: 0 },
  },
  // Hangs from the baseline of the red line, over the gap before the subtitle
  heroDrips: { top: '92%', left: '4%', right: '30%' },
  heroSubtitle: {
    fontSize: 15, lineHeight: 22, color: theme.colors.textSecondary,
    marginTop: 16, marginBottom: 22,
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingLeft: 14, height: 52,
    borderRadius: theme.radius.lg, overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.9)',
    borderWidth: 1, borderColor: 'rgba(200, 16, 27, 0.45)',
  },
  searchText: { flex: 1, fontSize: 14, color: theme.colors.textSecondary },
  searchGo: { width: 54, height: '100%', alignItems: 'center', justifyContent: 'center' },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingHorizontal: 20, marginTop: 18, marginBottom: 14, gap: 12,
  },
  sectionTitle: {
    fontFamily: theme.fonts.display, fontSize: 24, lineHeight: 30,
    color: theme.colors.bone, marginTop: 2,
  },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingBottom: 5 },
  seeAllText: { fontSize: 13, fontWeight: '600' },

  carousel: { paddingHorizontal: 20, gap: 14, paddingBottom: 10 },
  carouselCard: { width: 280 },

  nearList: { paddingHorizontal: 20, gap: 10 },

  premiumUpsell: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 20, marginTop: 26, padding: 16,
    borderRadius: theme.radius.lg,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1, borderColor: 'rgba(201, 154, 46, 0.45)',
  },
  premiumTitle: { fontFamily: theme.fonts.display, fontSize: 15, color: theme.colors.gold },
  premiumDesc: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
});
