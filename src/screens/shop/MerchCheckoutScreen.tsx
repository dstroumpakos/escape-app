import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Modal, FlatList, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAction, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { SHIP_COUNTRIES, platformShippingCents } from '../../../convex/merchRules';
import { theme } from '../../theme';
import { RootStackParamList } from '../../types';
import { useUser } from '../../UserContext';
import { useTranslation } from '../../i18n';
import { PREMIUM_ENABLED } from '../../features';
import { euro, useCart } from '../../merchCart';
import { openCheckout, buildDeepLink } from '../../payments';
import { ScreenHeader, shopStyles } from '../../components/shop';
import { PrimaryButton } from '../../components/ui';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'MerchCheckout'>;
const WEB = 'https://unlocked.gr';

function countryName(code: string, lang: string) {
  try {
    const dn = new (Intl as any).DisplayNames([lang], { type: 'region' });
    return dn.of(code) || code;
  } catch {
    return code;
  }
}

function errorText(e: any): string {
  const data = e?.data;
  if (typeof data === 'string') return data;
  const m = String(e?.message || '').match(/Uncaught (?:Error|ConvexError):\s*([\s\S]*?)(?:\n|$)/);
  return m ? m[1] : '';
}

export default function MerchCheckoutScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const sellerKey = route.params.sellerKey;
  const { t, language } = useTranslation();
  const { userId, sessionToken } = useUser();
  const { lines, clearSeller, pickupBooking } = useCart();
  const shop = useQuery(api.merch.listShop, { sessionToken: sessionToken || undefined });
  const me = useQuery(api.users.getById, sessionToken ? { sessionToken } : 'skip');
  const checkout = useAction(api.merchPayments.checkout);

  const myLines = lines.filter((l) => l.sellerKey === sellerKey);
  const items = useMemo(() => {
    const map = new Map((shop?.products ?? []).map((p) => [String(p._id), p]));
    return myLines.map((line) => ({ line, product: map.get(line.productId) }));
  }, [shop, myLines]);
  const isPlatform = sellerKey === 'platform';
  const canPickup = !isPlatform && items.length > 0 && items.every((x) => x.product?.pickup);
  const canShip = items.length > 0 && items.every((x) => x.product?.shipping);
  const online = items[0]?.product?.onlinePayment ?? false;
  const blocked = items.some((x) => !x.product?.canBuy);
  const bookings = useQuery(api.merch.pickupBookings, sessionToken && canPickup ? { sessionToken, companyId: sellerKey as Id<'companies'> } : 'skip');

  const [delivery, setDelivery] = useState<'pickup' | 'shipping'>('pickup');
  const [payment, setPayment] = useState<'online' | 'at_pickup'>('online');
  const [bookingId, setBookingId] = useState<string>(pickupBooking[sellerKey] ?? '');
  const [addr, setAddr] = useState({ name: '', line1: '', line2: '', city: '', postalCode: '', country: 'GR', phone: '' });
  const [countryOpen, setCountryOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!canPickup && canShip) setDelivery('shipping');
    if (canPickup && !canShip) setDelivery('pickup');
  }, [canPickup, canShip]);
  useEffect(() => {
    if (delivery === 'shipping') setPayment('online');
    else if (!online) setPayment('at_pickup');
  }, [delivery, online]);
  useEffect(() => {
    if (me && !addr.name) setAddr((a) => ({ ...a, name: (me as any).name || '', phone: (me as any).phone || '' }));
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!userId) {
    return (
      <View style={styles.container}>
        <ScreenHeader title={t('shop.checkout')} onBack={() => navigation.goBack()} />
        <Text style={[shopStyles.muted, { textAlign: 'center', marginTop: 40 }]}>{t('shop.loginToOrder')}</Text>
      </View>
    );
  }
  if (shop === undefined) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={theme.colors.redPrimary} />
      </View>
    );
  }

  const isPremium = !!shop.perks.isPremium;
  const subtotal = items.reduce((s, x) => s + (x.product?.priceCents ?? x.line.unitPriceCents) * x.line.quantity, 0);
  const payable = items.reduce((s, x) => s + (x.product?.yourPriceCents ?? x.line.unitPriceCents) * x.line.quantity, 0);
  const shipping =
    delivery === 'pickup' ? 0 : isPlatform ? platformShippingCents(addr.country, isPremium) : Math.max(0, ...items.map((x) => x.product?.shippingCents ?? 0));
  const total = payable + shipping;
  const gift = isPlatform && shop.perks.welcomeGiftAvailable;

  const place = async () => {
    setBusy(true);
    const base = {
      sessionToken: sessionToken as string,
      items: myLines.map((l) => ({ productId: l.productId as Id<'merchProducts'>, variantId: l.variantId, quantity: l.quantity })),
      delivery,
      payment: delivery === 'shipping' ? ('online' as const) : payment,
      bookingId: delivery === 'pickup' && bookingId ? (bookingId as Id<'bookings'>) : undefined,
      shippingAddress:
        delivery === 'shipping'
          ? { name: addr.name, line1: addr.line1, line2: addr.line2 || undefined, city: addr.city, postalCode: addr.postalCode, country: addr.country, phone: addr.phone || undefined }
          : undefined,
    };
    try {
      let res;
      try {
        const appReturn = buildDeepLink('merch-return') + '?order={ORDER_ID}';
        res = await checkout({ ...base, successUrl: appReturn, cancelUrl: appReturn });
      } catch (e: any) {
        // Stripe may refuse the app link: fall back to the website's order page.
        if (!/url/i.test(errorText(e) || e?.message || '')) throw e;
        res = await checkout({ ...base, successUrl: `${WEB}/shop/orders/{ORDER_ID}?paid=1`, cancelUrl: `${WEB}/shop/orders/{ORDER_ID}?cancelled=1` });
      }
      await clearSeller(sellerKey);
      navigation.replace('MerchOrder', { id: res.orderId, fresh: true });
      if (res.url) await openCheckout(res.url);
    } catch (e: any) {
      Alert.alert(t('error'), errorText(e) || t('shop.orderFailed'));
    } finally {
      setBusy(false);
    }
  };

  const Choice = ({ active, disabled, onPress, icon, title, desc }: { active: boolean; disabled?: boolean; onPress: () => void; icon: any; title: string; desc: string }) => (
    <TouchableOpacity disabled={disabled} onPress={onPress} style={[styles.choice, active && styles.choiceActive, disabled && { opacity: 0.4 }]}>
      <Ionicons name={icon} size={20} color={theme.colors.redLight} />
      <View style={{ flex: 1 }}>
        <Text style={styles.choiceTitle}>{title}</Text>
        <Text style={shopStyles.muted}>{desc}</Text>
      </View>
      {active && <Ionicons name="checkmark-circle" size={20} color={theme.colors.redLight} />}
    </TouchableOpacity>
  );

  const field = (key: keyof typeof addr, placeholder: string, extra?: object) => (
    <TextInput
      style={shopStyles.input}
      value={addr[key]}
      onChangeText={(v) => setAddr((a) => ({ ...a, [key]: v }))}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.textMuted}
      {...extra}
    />
  );

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('shop.checkout')} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Text style={shopStyles.muted}>{myLines[0]?.sellerName}</Text>

        <View style={[shopStyles.card, { gap: 10 }]}>
          <Text style={shopStyles.sectionTitle}>{t('shop.delivery')}</Text>
          <Choice
            active={delivery === 'pickup'}
            disabled={!canPickup}
            onPress={() => setDelivery('pickup')}
            icon="storefront-outline"
            title={t('shop.pickup')}
            desc={isPlatform ? t('shop.pickupOfficialNo') : t('shop.pickupDesc', { shop: myLines[0]?.sellerName ?? '' })}
          />
          <Choice
            active={delivery === 'shipping'}
            disabled={!canShip}
            onPress={() => setDelivery('shipping')}
            icon="cube-outline"
            title={t('shop.shipping')}
            desc={canShip ? t('shop.shippingDesc') : t('shop.shippingNo')}
          />
          {delivery === 'pickup' && (bookings?.length ?? 0) > 0 && (
            <View style={{ gap: 6 }}>
              <Text style={shopStyles.muted}>{t('shop.pickupWhen')}</Text>
              {[{ _id: '', label: t('shop.pickupAny') }, ...(bookings ?? []).map((b) => ({ _id: String(b._id), label: `${b.roomTitle} · ${b.date} ${b.time}` }))].map((b) => (
                <TouchableOpacity key={b._id || 'any'} onPress={() => setBookingId(b._id)} style={[shopStyles.chip, bookingId === b._id && shopStyles.chipActive]}>
                  <Text style={[shopStyles.chipText, bookingId === b._id && shopStyles.chipTextActive]}>{b.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {delivery === 'shipping' && (
            <View style={{ gap: 8 }}>
              {field('name', t('shop.addrName'), { autoComplete: 'name' })}
              {field('line1', t('shop.addrLine1'), { autoComplete: 'street-address' })}
              {field('line2', t('shop.addrLine2'))}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>{field('postalCode', t('shop.addrPostal'), { autoComplete: 'postal-code' })}</View>
                <View style={{ flex: 1 }}>{field('city', t('shop.addrCity'))}</View>
              </View>
              <TouchableOpacity style={[shopStyles.input, shopStyles.row]} onPress={() => setCountryOpen(true)}>
                <Text style={{ color: theme.colors.textPrimary }}>{countryName(addr.country, language)}</Text>
                <Ionicons name="chevron-down" size={16} color={theme.colors.textMuted} />
              </TouchableOpacity>
              {field('phone', t('shop.addrPhone'), { keyboardType: 'phone-pad' })}
            </View>
          )}
        </View>

        <View style={[shopStyles.card, { gap: 10 }]}>
          <Text style={shopStyles.sectionTitle}>{t('shop.payment')}</Text>
          <Choice
            active={payment === 'online' || delivery === 'shipping'}
            disabled={!online}
            onPress={() => setPayment('online')}
            icon="card-outline"
            title={t('shop.payOnline')}
            desc={online ? t('shop.payOnlineDesc') : t('shop.payOnlineNo')}
          />
          <Choice
            active={delivery === 'pickup' && payment === 'at_pickup'}
            disabled={delivery !== 'pickup'}
            onPress={() => setPayment('at_pickup')}
            icon="wallet-outline"
            title={t('shop.payPickup')}
            desc={t('shop.payPickupDesc')}
          />
        </View>

        <View style={[shopStyles.card, { gap: 8 }]}>
          {items.map(({ line, product }) => (
            <View key={line.productId + line.variantId} style={shopStyles.row}>
              <Text style={[shopStyles.muted, { flex: 1 }]}>
                {line.quantity}× {line.title} ({line.variantLabel})
                {!product?.canBuy ? `\n${t('shop.unavailable')}` : ''}
              </Text>
              <Text style={{ color: theme.colors.bone }}>{euro((product?.priceCents ?? line.unitPriceCents) * line.quantity)}</Text>
            </View>
          ))}
          {gift && (
            <View style={shopStyles.row}>
              <Text style={[shopStyles.muted, { color: theme.colors.gold }]}>🎁 {t('shop.gift')}</Text>
              <Text style={{ color: theme.colors.gold }}>€0</Text>
            </View>
          )}
          {subtotal > payable && (
            <View style={shopStyles.row}>
              <Text style={[shopStyles.muted, { color: theme.colors.gold }]}>{t('shop.premiumDiscount')}</Text>
              <Text style={{ color: theme.colors.gold }}>−{euro(subtotal - payable)}</Text>
            </View>
          )}
          {delivery === 'shipping' && (
            <View style={shopStyles.row}>
              <Text style={shopStyles.muted}>{t('shop.shippingCost')}</Text>
              <Text style={{ color: theme.colors.bone }}>{shipping ? euro(shipping) : t('shop.free')}</Text>
            </View>
          )}
          <View style={[shopStyles.row, { marginTop: 6 }]}>
            <Text style={shopStyles.muted}>{t('shop.total')}</Text>
            <Text style={styles.total}>{euro(total)}</Text>
          </View>
          {PREMIUM_ENABLED && isPlatform && !isPremium && <Text style={[shopStyles.muted, { color: theme.colors.gold, fontSize: 12 }]}>{t('shop.premiumWouldSave')}</Text>}
        </View>

        <PrimaryButton
          label={delivery === 'pickup' && payment === 'at_pickup' ? t('shop.reserve') : t('shop.pay', { amount: euro(total) })}
          onPress={place}
          loading={busy}
          disabled={blocked || myLines.length === 0}
        />
        <Text style={[shopStyles.muted, { fontSize: 11 }]}>
          {isPlatform ? t('shop.termsOfficial') : t('shop.termsCompany', { shop: myLines[0]?.sellerName ?? '' })}
        </Text>
      </ScrollView>

      <Modal visible={countryOpen} animationType="slide" transparent onRequestClose={() => setCountryOpen(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modal}>
            <FlatList
              data={SHIP_COUNTRIES}
              keyExtractor={(c) => c}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.countryRow}
                  onPress={() => {
                    setAddr((a) => ({ ...a, country: item }));
                    setCountryOpen(false);
                  }}
                >
                  <Text style={{ color: item === addr.country ? theme.colors.redLight : theme.colors.bone }}>{countryName(item, language)}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  choice: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
  },
  choiceActive: { borderColor: theme.colors.redLight, backgroundColor: theme.colors.redSubtle },
  choiceTitle: { color: theme.colors.bone, fontSize: 15, fontWeight: '600' },
  total: { fontSize: 26, fontFamily: theme.fonts.displayBlack, color: theme.colors.bone },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modal: { maxHeight: '70%', backgroundColor: theme.colors.bgSecondary, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingVertical: 8 },
  countryRow: { paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
});
