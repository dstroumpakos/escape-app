import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Dimensions } from 'react-native';
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
import { euro, useCart } from '../../merchCart';
import { CartButton, PriceText, ScreenHeader, lockText, shopStyles } from '../../components/shop';
import { PrimaryButton } from '../../components/ui';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'Product'>;
const W = Dimensions.get('window').width;

export default function ProductScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { t, language } = useTranslation();
  const { sessionToken } = useUser();
  const { add, count } = useCart();
  const data = useQuery(api.merch.getProduct, {
    productId: route.params.id as Id<'merchProducts'>,
    sessionToken: sessionToken || undefined,
  });
  const [variantId, setVariantId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const p = data?.product;

  useEffect(() => {
    if (p && !variantId) setVariantId((p.variants.find((v) => !v.soldOut) ?? p.variants[0])?.id ?? null);
  }, [p, variantId]);

  if (data === undefined) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={theme.colors.redPrimary} />
      </View>
    );
  }
  if (!data || !p) {
    return (
      <View style={styles.container}>
        <ScreenHeader title={t('shop.title')} onBack={() => navigation.goBack()} />
        <Text style={[shopStyles.muted, { textAlign: 'center', marginTop: 40 }]}>{t('shop.notFound')}</Text>
      </View>
    );
  }

  const variant = p.variants.find((v) => v.id === variantId);
  const canAdd = p.canBuy && !!variant && !variant.soldOut;
  const locale = language === 'el' ? 'el-GR' : 'en-GB';
  const lock = lockText(p, t, locale);

  const addToCart = async (go: boolean) => {
    if (!canAdd || !variant) return;
    await add({
      productId: p._id,
      variantId: variant.id,
      quantity: qty,
      title: p.title,
      variantLabel: variant.label,
      image: p.images[0],
      unitPriceCents: p.yourPriceCents,
      sellerKey: p.seller === 'platform' ? 'platform' : String(p.companyId),
      sellerName: p.sellerName,
    });
    if (go) navigation.navigate('Cart');
    else {
      setAdded(true);
      setTimeout(() => setAdded(false), 1800);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={p.sellerName} onBack={() => navigation.goBack()} right={<CartButton count={count} onPress={() => navigation.navigate('Cart')} />} />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
          {(p.images.length ? p.images : ['']).map((u, i) =>
            u ? (
              <Image key={i} source={{ uri: u }} style={{ width: W, height: W }} />
            ) : (
              <View key={i} style={{ width: W, height: W * 0.6, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="cube-outline" size={50} color={theme.colors.textMuted} />
              </View>
            )
          )}
        </ScrollView>

        <View style={{ padding: 20, gap: 16 }}>
          <View>
            <Text style={styles.title}>{p.title}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {p.release === 'early_access' && <Text style={[styles.tag, { backgroundColor: theme.colors.gold, color: '#000' }]}>{t('shop.badgeEarly')}</Text>}
              {p.premiumOnly && <Text style={[styles.tag, { borderColor: theme.colors.gold, color: theme.colors.gold }]}>{t('shop.badgeMembers')}</Text>}
              {p.unlockRule && (
                <Text style={[styles.tag, { borderColor: '#CE93D8', color: '#CE93D8' }]}>
                  {p.unlockRule === 'escaped' ? t('shop.badgeEscaped') : t('shop.badgePlayed')}
                </Text>
              )}
            </View>
          </View>
          <PriceText p={p} large />

          {p.variants.length > 1 && (
            <View>
              <Text style={[shopStyles.muted, { marginBottom: 8 }]}>{t('shop.chooseOption')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {p.variants.map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    disabled={v.soldOut}
                    onPress={() => setVariantId(v.id)}
                    style={[shopStyles.chip, variantId === v.id && shopStyles.chipActive, v.soldOut && { opacity: 0.35 }]}
                  >
                    <Text style={[shopStyles.chipText, variantId === v.id && shopStyles.chipTextActive]}>{v.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          {variant?.stockLeft != null && !variant.soldOut && (
            <Text style={{ color: theme.colors.warning, fontSize: 12 }}>{t('shop.onlyLeft', { count: variant.stockLeft })}</Text>
          )}

          {lock ? (
            <View style={shopStyles.card}>
              <Text style={shopStyles.muted}>{lock}</Text>
              {p.locked === 'premium_only' && (
                <PrimaryButton small label={t('shop.seePremium')} onPress={() => navigation.navigate('Premium')} style={{ marginTop: 12 }} />
              )}
              {(p.locked === 'unlock_played' || p.locked === 'unlock_escaped') && p.unlockRoomId && (
                <PrimaryButton small label={t('shop.bookRoom')} onPress={() => navigation.navigate('RoomDetails', { id: p.unlockRoomId! })} style={{ marginTop: 12 }} />
              )}
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={styles.qty}>
                  <TouchableOpacity onPress={() => setQty((q) => Math.max(1, q - 1))} style={{ padding: 10 }}>
                    <Ionicons name="remove" size={18} color={theme.colors.bone} />
                  </TouchableOpacity>
                  <Text style={{ color: theme.colors.bone, width: 24, textAlign: 'center' }}>{qty}</Text>
                  <TouchableOpacity onPress={() => setQty((q) => Math.min(10, q + 1))} style={{ padding: 10 }}>
                    <Ionicons name="add" size={18} color={theme.colors.bone} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={[styles.outlineBtn, !canAdd && { opacity: 0.4 }]} disabled={!canAdd} onPress={() => addToCart(false)}>
                  <Ionicons name={added ? 'checkmark' : 'bag-add-outline'} size={18} color={theme.colors.redLight} />
                  <Text style={styles.outlineText}>{added ? t('shop.added') : t('shop.addToCart')}</Text>
                </TouchableOpacity>
              </View>
              <PrimaryButton label={p.soldOut ? t('shop.soldOut') : t('shop.buyNow')} disabled={!canAdd} onPress={() => addToCart(true)} />
            </View>
          )}

          <View style={[shopStyles.card, { gap: 8 }]}>
            {p.pickup && (
              <Text style={shopStyles.muted}>
                <Ionicons name="storefront-outline" size={13} /> {t('shop.pickupLine', { shop: p.sellerName })}
              </Text>
            )}
            {p.shipping && (
              <Text style={shopStyles.muted}>
                <Ionicons name="cube-outline" size={13} />{' '}
                {p.seller === 'platform'
                  ? data.perks.isPremium
                    ? t('shop.shipOfficialFree')
                    : t('shop.shipOfficial')
                  : p.shippingCents
                  ? t('shop.shipFlat', { price: euro(p.shippingCents) })
                  : t('shop.shipFree')}
              </Text>
            )}
          </View>

          {!!p.description && <Text style={[shopStyles.muted, { fontSize: 14, lineHeight: 21 }]}>{p.description}</Text>}

          {p.seller === 'company' && p.companyId && (
            <TouchableOpacity onPress={() => navigation.navigate('Shop', { companyId: String(p.companyId) })}>
              <Text style={{ color: theme.colors.redLight, fontSize: 14 }}>{t('shop.moreFrom', { shop: p.sellerName })} →</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  title: { fontSize: 26, fontFamily: theme.fonts.displayBlack, color: theme.colors.bone },
  tag: {
    fontSize: 10,
    fontFamily: theme.fonts.type,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  qty: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md },
  outlineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.redPrimary,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
  },
  outlineText: { color: theme.colors.redLight, fontWeight: '600' },
});
