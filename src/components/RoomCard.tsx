import React, { useState } from 'react';
import { Image, StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme';
import { useTranslation } from '../i18n';
import { ROOM_THEME_KEYS } from '../roomThemes';
import { DifficultySkulls } from './ui';

/** Tag colour per stored theme value; anything else gets the neutral tag. */
const THEME_COLORS: Record<string, string> = {
  Horror: '#F87171',
  Thriller: '#FB7185',
  Mystery: '#C084FC',
  Detective: '#60A5FA',
  Puzzle: '#34D399',
  Adventure: '#FBBF24',
  Historical: '#FACC15',
  History: '#FACC15',
  'Sci-Fi': '#22D3EE',
  Science: '#4ADE80',
  Paranormal: '#818CF8',
  Medieval: '#FB923C',
  Fantasy: '#E879F9',
  Comedy: '#FDE047',
};

/** "from €X" for per-group pricing, otherwise the per-person price. */
export function useRoomPrice(room: any): { price: string; perPerson: boolean } {
  const { t } = useTranslation();
  if (room.pricePerGroup?.length) {
    const lowest = Math.min(...room.pricePerGroup.map((g: any) => g.price));
    return { price: t('fromPrice', { amount: lowest }), perPerson: false };
  }
  return { price: `€${room.price}`, perPerson: true };
}

function RoomImage({ uri, iconSize }: { uri?: string; iconSize: number }) {
  // A dead image URL falls back to the lock placeholder instead of a blank box
  const [failed, setFailed] = useState(false);
  if (!uri || failed) {
    return (
      <View style={styles.placeholder}>
        <Ionicons name="lock-closed-outline" size={iconSize} color={theme.colors.glassBorder} />
      </View>
    );
  }
  return (
    <>
      <Image source={{ uri }} style={styles.fill} onError={() => setFailed(true)} />
      {/* Darken and stain the photo so every room sits in the same gloom */}
      <View style={[styles.fill, styles.imgTint]} />
    </>
  );
}

function ThemeTag({ value }: { value?: string }) {
  const { t } = useTranslation();
  if (!value) return null;
  const color = THEME_COLORS[value];
  const key = ROOM_THEME_KEYS[value];
  return (
    <View style={[styles.themeTag, color ? { borderColor: `${color}66` } : null]}>
      <Text style={[styles.themeTagText, color ? { color } : null]}>{key ? t(key) : value}</Text>
    </View>
  );
}

/** The one room card, used on Home and wherever rooms are listed. */
export function RoomCard({
  room,
  onPress,
  style,
  earlyLabel,
}: {
  room: any;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  /** Gold badge text for premium early-access rooms. */
  earlyLabel?: string;
}) {
  const { t } = useTranslation();
  const { price, perPerson } = useRoomPrice(room);
  const hasReviews = (room.reviews ?? 0) > 0;

  return (
    <TouchableOpacity
      style={[styles.card, earlyLabel ? styles.cardEarly : null, style]}
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={room.title}
    >
      <View style={styles.imgWrap}>
        <RoomImage uri={room.image} iconSize={44} />
        <LinearGradient
          colors={['rgba(17,9,9,0)', 'rgba(17,9,9,0.35)', theme.colors.bgCardSolid]}
          locations={[0.3, 0.7, 1]}
          style={styles.fill}
        />

        <View style={styles.badges}>
          {earlyLabel ? (
            <View style={[styles.badge, styles.badgeEarly]}>
              <Ionicons name="diamond" size={10} color={theme.colors.gold} />
              <Text style={[styles.badgeText, { color: theme.colors.gold }]}>{earlyLabel}</Text>
            </View>
          ) : room.isNew ? (
            <View style={[styles.badge, styles.badgeNew]}>
              <Ionicons name="flash" size={10} color={theme.colors.bone} />
              <Text style={styles.badgeText}>{t('home.newArrival')}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.priceTag}>
          <Text style={styles.priceText}>
            {price}
            {perPerson && <Text style={styles.priceSub}>{t('perPerson')}</Text>}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        <ThemeTag value={room.theme} />
        <Text style={styles.title} numberOfLines={2}>
          {room.title}
        </Text>

        {!!room.location && (
          <View style={styles.row}>
            <Ionicons name="location-outline" size={13} color={theme.colors.textMuted} />
            <Text style={styles.location} numberOfLines={1}>
              {room.location}
            </Text>
          </View>
        )}

        <View style={[styles.row, { marginTop: 6 }]}>
          <Ionicons
            name={hasReviews ? 'star' : 'star-outline'}
            size={13}
            color={hasReviews ? theme.colors.gold : theme.colors.textMuted}
          />
          {hasReviews && <Text style={styles.rating}>{room.rating}</Text>}
          <Text style={styles.reviews}>{t('roomDetails.reviews', { count: room.reviews ?? 0 })}</Text>
        </View>

        <View style={styles.meta}>
          <View style={styles.row}>
            <Ionicons name="time-outline" size={14} color={theme.colors.textSecondary} />
            <Text style={styles.metaText}>
              {room.duration}
              {t('min')}
            </Text>
          </View>
          <View style={styles.row}>
            <Ionicons name="people-outline" size={14} color={theme.colors.textSecondary} />
            <Text style={styles.metaText}>{room.players}</Text>
          </View>
          <DifficultySkulls level={room.difficulty ?? 3} max={room.maxDifficulty ?? 5} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

/** Compact one-line version for short lists (Near You, map strips). */
export function RoomRow({
  room,
  onPress,
  style,
  distanceKm,
  earlyLabel,
}: {
  room: any;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  distanceKm?: number;
  earlyLabel?: string;
}) {
  const { t } = useTranslation();
  const { price } = useRoomPrice(room);
  const hasReviews = (room.reviews ?? 0) > 0;
  const where = [distanceKm != null ? `${distanceKm.toFixed(1)} km` : null, room.location]
    .filter(Boolean)
    .join(' · ');

  return (
    <TouchableOpacity
      style={[styles.rowCard, earlyLabel ? styles.cardEarly : null, style]}
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={room.title}
    >
      <View style={styles.rowImg}>
        <RoomImage uri={room.image} iconSize={26} />
      </View>
      <View style={styles.rowBody}>
        {earlyLabel ? (
          <View style={styles.row}>
            <Ionicons name="diamond" size={10} color={theme.colors.gold} />
            <Text style={[styles.badgeText, { color: theme.colors.gold }]}>{earlyLabel}</Text>
          </View>
        ) : null}
        <Text style={styles.rowTitle} numberOfLines={1}>
          {room.title}
        </Text>
        {!!where && (
          <Text style={styles.location} numberOfLines={1}>
            {where}
          </Text>
        )}
        <View style={styles.rowFoot}>
          <View style={styles.row}>
            <Ionicons
              name={hasReviews ? 'star' : 'star-outline'}
              size={12}
              color={hasReviews ? theme.colors.gold : theme.colors.textMuted}
            />
            <Text style={styles.rating}>{hasReviews ? room.rating : t('discover.new')}</Text>
          </View>
          <Text style={styles.rowPrice}>{price}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },

  card: {
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
  },
  cardEarly: { borderColor: 'rgba(201, 154, 46, 0.5)' },
  imgWrap: { aspectRatio: 16 / 10, backgroundColor: '#0A0505', overflow: 'hidden' },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#150A0A',
  },
  imgTint: { backgroundColor: 'rgba(40, 0, 4, 0.28)' },

  badges: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', gap: 6 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: theme.radius.sm,
  },
  badgeNew: { backgroundColor: theme.colors.redPrimary },
  badgeEarly: { backgroundColor: 'rgba(0,0,0,0.8)', borderWidth: 1, borderColor: 'rgba(201, 154, 46, 0.6)' },
  badgeText: { fontSize: 11, fontWeight: '700', color: theme.colors.bone },

  priceTag: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(200, 16, 27, 0.4)',
  },
  priceText: { fontSize: 13, fontWeight: '700', color: theme.colors.bone },
  priceSub: { fontSize: 11, fontWeight: '400', color: theme.colors.textSecondary },

  body: { padding: 14, paddingTop: 10 },
  themeTag: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    marginBottom: 8,
  },
  themeTagText: {
    fontFamily: theme.fonts.type,
    fontSize: 10,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: theme.colors.textSecondary,
  },
  title: { fontFamily: theme.fonts.display, fontSize: 19, lineHeight: 24, color: theme.colors.bone, marginBottom: 6 },
  location: { flexShrink: 1, fontSize: 12, color: theme.colors.textMuted },
  rating: { fontSize: 13, fontWeight: '600', color: theme.colors.textPrimary },
  reviews: { fontSize: 12, color: theme.colors.textMuted },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: 14,
    rowGap: 4,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  metaText: { fontSize: 12, color: theme.colors.textSecondary },

  rowCard: {
    flexDirection: 'row',
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
  },
  rowImg: { width: 92, minHeight: 92, backgroundColor: '#0A0505' },
  rowBody: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, justifyContent: 'center', gap: 3 },
  rowTitle: { fontFamily: theme.fonts.display, fontSize: 15, color: theme.colors.bone },
  rowFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 },
  rowPrice: { fontSize: 13, fontWeight: '700', color: theme.colors.redLight },
});
