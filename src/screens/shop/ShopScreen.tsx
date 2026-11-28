import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { theme } from '../../theme';
import { RootStackParamList } from '../../types';
import { useUser } from '../../UserContext';
import { useTranslation } from '../../i18n';
import { PREMIUM_ENABLED } from '../../features';
import { useCart } from '../../merchCart';
import { CartButton, ProductTile, ScreenHeader, shopStyles } from '../../components/shop';
import type { ProductView } from '../../../convex/merch';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'Shop'>;

function Grid({ items, onOpen, showSeller }: { items: ProductView[]; onOpen: (id: string) => void; showSeller?: boolean }) {
  const rows: ProductView[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View style={{ gap: 12 }}>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
          {r.map((p) => (
            <ProductTile key={p._id} p={p} onPress={() => onOpen(p._id)} showSeller={showSeller} />
          ))}
          {r.length === 1 && <View style={{ flex: 1 }} />}
        </View>
      ))}
    </View>
  );
}

export default function ShopScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const companyId = route.params?.companyId;
  const { t } = useTranslation();
  const { userId, sessionToken } = useUser();
  const { count } = useCart();
  const st = sessionToken || undefined;
  const all = useQuery(api.merch.listShop, companyId ? 'skip' : { sessionToken: st });
  const store = useQuery(api.merch.companyStore, companyId ? { companyId: companyId as Id<'companies'>, sessionToken: st } : 'skip');
  const [seller, setSeller] = useState<'all' | 'platform' | 'company'>('all');
  const [q, setQ] = useState('');

  const products = (companyId ? store?.products : all?.products) ?? [];
  const perks = companyId ? store?.perks : all?.perks;
  const loading = companyId ? store === undefined : all === undefined;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products.filter(
      (p) =>
        (PREMIUM_ENABLED || !p.premiumOnly) &&
        (seller === 'all' || p.seller === seller) &&
        (!needle || p.title.toLowerCase().includes(needle) || p.sellerName.toLowerCase().includes(needle))
    );
  }, [products, seller, q]);
  const official = filtered.filter((p) => p.seller === 'platform');
  const rooms = filtered.filter((p) => p.seller === 'company');
  const open = (id: string) => navigation.navigate('Product', { id });

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={companyId ? store?.company.name ?? t('shop.title') : t('shop.title')}
        onBack={() => navigation.goBack()}
        right={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {userId && (
              <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('MerchOrders')}>
                <Ionicons name="receipt-outline" size={20} color={theme.colors.bone} />
              </TouchableOpacity>
            )}
            <CartButton count={count} onPress={() => navigation.navigate('Cart')} />
          </View>
        }
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60, gap: 18 }} showsVerticalScrollIndicator={false}>
        {companyId && store?.company && (
          <View style={shopStyles.card}>
            {(store.company.address || store.company.city) && (
              <Text style={shopStyles.muted}>
                <Ionicons name="location-outline" size={13} /> {[store.company.address, store.company.city].filter(Boolean).join(', ')}
              </Text>
            )}
            {PREMIUM_ENABLED && store.company.premiumDiscountPercent > 0 && (
              <Text style={[shopStyles.muted, { color: theme.colors.gold, marginTop: 6 }]}>
                {t('shop.storeDiscount', { pct: store.company.premiumDiscountPercent })}
              </Text>
            )}
            {store.company.pickupNote && <Text style={[shopStyles.muted, { marginTop: 6 }]}>{store.company.pickupNote}</Text>}
          </View>
        )}

        {PREMIUM_ENABLED && perks && (
          <TouchableOpacity style={[shopStyles.card, styles.perks]} onPress={() => navigation.navigate('Premium')} activeOpacity={0.85}>
            <Ionicons name="diamond" size={22} color={theme.colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={styles.perksTitle}>{perks.isPremium ? t('shop.perksTitleMember') : t('shop.perksTitle')}</Text>
              <Text style={shopStyles.muted}>
                {t('shop.perksLine', { pct: perks.platformDiscountPercent, hours: perks.earlyAccessHours })}
              </Text>
              {perks.welcomeGiftAvailable && <Text style={[shopStyles.muted, { color: theme.colors.gold }]}>{t('shop.giftWaiting')}</Text>}
            </View>
          </TouchableOpacity>
        )}

        {!companyId && (
          <>
            <TextInput
              style={shopStyles.input}
              value={q}
              onChangeText={setQ}
              placeholder={t('shop.search')}
              placeholderTextColor={theme.colors.textMuted}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {(['all', 'platform', 'company'] as const).map((s) => (
                <TouchableOpacity key={s} onPress={() => setSeller(s)} style={[shopStyles.chip, seller === s && shopStyles.chipActive]}>
                  <Text style={[shopStyles.chipText, seller === s && shopStyles.chipTextActive]}>{t(`shop.filter_${s}`)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {loading ? (
          <ActivityIndicator color={theme.colors.redPrimary} style={{ marginTop: 40 }} />
        ) : filtered.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 50 }}>
            <Ionicons name="cube-outline" size={44} color={theme.colors.textMuted} />
            <Text style={[shopStyles.muted, { marginTop: 10 }]}>{t('shop.empty')}</Text>
          </View>
        ) : companyId ? (
          <Grid items={filtered} onOpen={open} showSeller={false} />
        ) : (
          <>
            {official.length > 0 && (
              <View>
                <Text style={shopStyles.sectionTitle}>UNLOCKED Official</Text>
                <Grid items={official} onOpen={open} showSeller={false} />
              </View>
            )}
            {rooms.length > 0 && (
              <View>
                <Text style={shopStyles.sectionTitle}>{t('shop.fromRooms')}</Text>
                <Grid items={rooms} onOpen={open} />
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.glass,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
  },
  perks: { flexDirection: 'row', gap: 12, borderColor: 'rgba(201,154,46,0.35)' },
  perksTitle: { fontSize: 15, fontFamily: theme.fonts.display, color: theme.colors.bone, marginBottom: 4 },
});
