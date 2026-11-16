import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';
import { useTranslation } from '../i18n';
import { euro } from '../merchCart';
import type { ProductView } from '../../convex/merch';

export function PriceText({ p, large }: { p: ProductView; large?: boolean }) {
  const { t } = useTranslation();
  const size = large ? 26 : 16;
  if (p.yourDiscountPercent > 0) {
    return (
      <View style={styles.priceRow}>
        <Text style={[styles.price, { fontSize: size, color: theme.colors.gold }]}>{euro(p.yourPriceCents)}</Text>
        <Text style={styles.strike}>{euro(p.priceCents)}</Text>
      </View>
    );
  }
  return (
    <View style={styles.priceRow}>
      <Text style={[styles.price, { fontSize: size }]}>{euro(p.priceCents)}</Text>
      {p.premiumPriceCents !== null && (
        <Text style={styles.premiumFrom}>{t('shop.premiumFrom', { price: euro(p.premiumPriceCents) })}</Text>
      )}
    </View>
  );
}

export function lockText(p: ProductView, t: (k: string, o?: any) => string, locale: string) {
  if (!p.locked) return null;
  if (p.locked === 'premium_only') return t('shop.lockPremium');
  if (p.locked === 'unlock_escaped') return t('shop.lockEscaped', { room: p.unlockRoomTitle ?? '' });
  if (p.locked === 'unlock_played') return t('shop.lockPlayed', { room: p.unlockRoomTitle ?? '' });
  const when = p.releaseAt
    ? new Date(p.releaseAt).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';
  return t('shop.lockUpcoming', { date: when });
}

export function ProductTile({ p, onPress, showSeller = true }: { p: ProductView; onPress: () => void; showSeller?: boolean }) {
  const { t } = useTranslation();
  const badge =
    p.release === 'early_access'
      ? { text: t('shop.badgeEarly'), bg: theme.colors.gold, fg: '#000' }
      : p.premiumOnly
      ? { text: t('shop.badgeMembers'), bg: 'rgba(0,0,0,0.75)', fg: theme.colors.gold }
      : p.unlockRule
      ? { text: p.unlockRule === 'escaped' ? t('shop.badgeEscaped') : t('shop.badgePlayed'), bg: 'rgba(0,0,0,0.75)', fg: '#CE93D8' }
      : p.soldOut
      ? { text: t('shop.soldOut'), bg: 'rgba(0,0,0,0.8)', fg: theme.colors.textSecondary }
      : null;
  return (
    <TouchableOpacity style={styles.tile} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.imgWrap}>
        {p.images[0] ? (
          <Image source={{ uri: p.images[0] }} style={[styles.img, (p.locked || p.soldOut) && { opacity: 0.6 }]} />
        ) : (
          <View style={[styles.img, styles.imgEmpty]}>
            <Ionicons name="cube-outline" size={30} color={theme.colors.textMuted} />
          </View>
        )}
        {badge && (
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.badgeText, { color: badge.fg }]} numberOfLines={1}>
              {badge.text}
            </Text>
          </View>
        )}
        {p.locked && (
          <View style={styles.lock}>
            <Ionicons name="lock-closed" size={12} color={theme.colors.gold} />
          </View>
        )}
      </View>
      <View style={{ padding: 10, gap: 4 }}>
        {showSeller && (
          <Text style={styles.seller} numberOfLines={1}>
            {p.sellerName}
          </Text>
        )}
        <Text style={styles.title} numberOfLines={2}>
          {p.title}
        </Text>
        <PriceText p={p} />
      </View>
    </TouchableOpacity>
  );
}

export function ScreenHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack} accessibilityRole="button">
        <Ionicons name="arrow-back" size={20} color={theme.colors.bone} />
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={{ marginLeft: 'auto' }}>{right}</View>
    </View>
  );
}

export function CartButton({ count, onPress }: { count: number; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.backBtn} onPress={onPress} accessibilityRole="button" accessibilityLabel="Cart">
      <Ionicons name="bag-handle-outline" size={20} color={theme.colors.bone} />
      {count > 0 && (
        <View style={styles.cartCount}>
          <Text style={styles.cartCountText}>{count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export const STATUS_COLORS: Record<string, string> = {
  pending_payment: '#42A5F5',
  reserved: theme.colors.warning,
  paid: theme.colors.success,
  ready: '#CE93D8',
  shipped: '#4FC3F7',
  collected: theme.colors.textSecondary,
  cancelled: theme.colors.textMuted,
  refunded: theme.colors.textMuted,
};

export const shopStyles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
  },
  sectionTitle: { fontSize: 18, fontFamily: theme.fonts.display, color: theme.colors.bone, marginBottom: 12 },
  muted: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 19 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipActive: { backgroundColor: theme.colors.redPrimary, borderColor: theme.colors.redLight },
  chipText: { fontSize: 13, color: theme.colors.textSecondary },
  chipTextActive: { color: theme.colors.bone, fontWeight: '600' },
  input: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.colors.textPrimary,
    fontSize: 15,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});

const styles = StyleSheet.create({
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' },
  price: { fontFamily: theme.fonts.displayBlack, color: theme.colors.bone },
  strike: { fontSize: 12, color: theme.colors.textMuted, textDecorationLine: 'line-through' },
  premiumFrom: { fontSize: 11, color: theme.colors.gold },
  tile: {
    flex: 1,
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  imgWrap: { aspectRatio: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  img: { width: '100%', height: '100%' },
  imgEmpty: { alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 8, left: 8, right: 36, alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 3 },
  badgeText: { fontSize: 9, fontFamily: theme.fonts.type, letterSpacing: 0.8 },
  lock: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seller: { fontSize: 10, fontFamily: theme.fonts.type, color: theme.colors.textMuted, textTransform: 'uppercase' },
  title: { fontSize: 14, color: theme.colors.bone, fontWeight: '600' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.glass,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
  },
  headerTitle: { fontSize: 20, fontFamily: theme.fonts.display, color: theme.colors.bone, flexShrink: 1 },
  cartCount: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.redPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  cartCountText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
