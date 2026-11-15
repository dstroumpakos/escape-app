import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { theme } from '../theme';
import { RootStackParamList } from '../types';
import { useUser } from '../UserContext';
import { useTranslation } from '../i18n';
import { useCart } from '../merchCart';
import { ProductTile } from './shop';
import { PrimaryButton } from './ui';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** "Merch from this room" on the room page. */
export function RoomMerchStrip({ roomId }: { roomId: string }) {
  const navigation = useNavigation<Nav>();
  const { t } = useTranslation();
  const { userId } = useUser();
  const items = useQuery(api.merch.roomMerch, { roomId: roomId as Id<'rooms'>, userId: (userId as Id<'users'>) || undefined });
  if (!items || items.length === 0) return null;
  const companyId = items[0].companyId;
  return (
    <View style={styles.section}>
      <View style={styles.headRow}>
        <Text style={styles.title}>{t('shop.roomTitle')}</Text>
        {companyId && (
          <TouchableOpacity onPress={() => navigation.navigate('Shop', { companyId: String(companyId) })}>
            <Text style={styles.link}>{t('shop.seeAll')}</Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
        {items.slice(0, 6).map((p) => (
          <View key={p._id} style={{ width: 160 }}>
            <ProductTile p={p} showSeller={false} onPress={() => navigation.navigate('Product', { id: p._id })} />
          </View>
        ))}
      </ScrollView>
      {items.some((p) => p.pickup) && <Text style={styles.hint}>{t('shop.roomPickupHint')}</Text>}
    </View>
  );
}

/** After booking: add merch to collect at the game. */
export function MerchAddOnCard({ roomId, bookingId }: { roomId: string; bookingId?: string }) {
  const navigation = useNavigation<Nav>();
  const { t } = useTranslation();
  const { userId } = useUser();
  const { setPickupBooking } = useCart();
  const items = useQuery(api.merch.roomMerch, roomId ? { roomId: roomId as Id<'rooms'>, userId: (userId as Id<'users'>) || undefined } : 'skip');
  const pickup = (items ?? []).filter((p) => p.pickup && p.canBuy);
  if (pickup.length === 0) return null;
  const companyId = String(pickup[0].companyId);
  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="storefront-outline" size={20} color={theme.colors.redLight} />
        <Text style={styles.title}>{t('shop.addonTitle')}</Text>
      </View>
      <Text style={styles.hint}>{t('shop.addonDesc')}</Text>
      <PrimaryButton
        small
        icon="bag-handle-outline"
        label={t('shop.addonCta', { count: pickup.length })}
        onPress={async () => {
          if (bookingId) await setPickupBooking(companyId, bookingId);
          navigation.navigate('Shop', { companyId });
        }}
        style={{ marginTop: 12 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 24 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 18, fontFamily: theme.fonts.display, color: theme.colors.bone },
  link: { color: theme.colors.redLight, fontSize: 13 },
  hint: { fontSize: 12, color: theme.colors.textMuted, marginTop: 8, lineHeight: 18 },
  card: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    marginTop: 16,
  },
});
