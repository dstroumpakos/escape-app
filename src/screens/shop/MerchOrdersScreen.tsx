import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, AppState, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAction, useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { theme } from '../../theme';
import { RootStackParamList } from '../../types';
import { useUser } from '../../UserContext';
import { useTranslation } from '../../i18n';
import { euro } from '../../merchCart';
import { openCheckout, buildDeepLink } from '../../payments';
import { STATUS_COLORS, ScreenHeader, shopStyles } from '../../components/shop';
import { PrimaryButton } from '../../components/ui';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function StatusPill({ status }: { status: string }) {
  const { t } = useTranslation();
  const c = STATUS_COLORS[status] ?? theme.colors.textSecondary;
  return (
    <Text style={[styles.pill, { color: c, borderColor: c }]}>{t(`shop.status_${status}`)}</Text>
  );
}

/** List of the player's merch orders. */
export function MerchOrdersScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useTranslation();
  const { sessionToken } = useUser();
  const orders = useQuery(api.merch.myOrders, sessionToken ? { sessionToken } : 'skip');
  const visible = (orders ?? []).filter((o) => o.status !== 'pending_payment' || Date.now() - o.createdAt < 3600_000);

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('shop.myOrders')} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60, gap: 10 }}>
        {orders === undefined ? (
          <ActivityIndicator color={theme.colors.redPrimary} style={{ marginTop: 40 }} />
        ) : visible.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 60, gap: 14 }}>
            <Ionicons name="receipt-outline" size={44} color={theme.colors.textMuted} />
            <Text style={shopStyles.muted}>{t('shop.noOrders')}</Text>
            <PrimaryButton small label={t('shop.browse')} onPress={() => navigation.navigate('Shop', {})} />
          </View>
        ) : (
          visible.map((o) => (
            <TouchableOpacity key={o._id} style={[shopStyles.card, styles.orderRow]} onPress={() => navigation.navigate('MerchOrder', { id: o._id })}>
              {o.items[0]?.image ? <Image source={{ uri: o.items[0].image }} style={styles.thumb} /> : <View style={styles.thumb} />}
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={styles.code}>{o.orderCode}</Text>
                  <StatusPill status={o.status} />
                </View>
                <Text style={shopStyles.muted} numberOfLines={1}>
                  {o.sellerName} · {o.items.map((i) => `${i.quantity}× ${i.title}`).join(', ')}
                </Text>
              </View>
              <Text style={styles.code}>{euro(o.totalCents)}</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

type OrderRoute = RouteProp<RootStackParamList, 'MerchOrder'>;

/** One order. Also where the player lands after paying, so it checks the payment. */
export function MerchOrderScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<OrderRoute>();
  const { t, language } = useTranslation();
  const { sessionToken } = useUser();
  const id = route.params.id as Id<'merchOrders'>;
  const order = useQuery(api.merch.getMyOrder, sessionToken ? { sessionToken, orderId: id } : 'skip');
  const confirmReturn = useAction(api.merchPayments.confirmReturn);
  const retry = useAction(api.merchPayments.retryCheckout);
  const cancel = useMutation(api.merch.cancelMyOrder);
  const [checking, setChecking] = useState(false);
  const pendingRef = useRef(false);
  pendingRef.current = order?.status === 'pending_payment';

  const check = useCallback(async () => {
    if (!pendingRef.current) return;
    setChecking(true);
    for (let i = 0; i < 4 && pendingRef.current; i++) {
      try {
        const r = await confirmReturn({ orderId: id });
        if (r.state === 'paid') break;
      } catch {}
      await sleep(3500);
    }
    setChecking(false);
  }, [confirmReturn, id]);

  // Coming back from the payment page (deep link or app switch) → check.
  useEffect(() => {
    const a = AppState.addEventListener('change', (s) => s === 'active' && check());
    const l = Linking.addEventListener('url', ({ url }) => url.includes('merch-return') && check());
    return () => {
      a.remove();
      l.remove();
    };
  }, [check]);

  if (order === undefined) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={theme.colors.redPrimary} />
      </View>
    );
  }
  if (!order) {
    return (
      <View style={styles.container}>
        <ScreenHeader title={t('shop.myOrders')} onBack={() => navigation.goBack()} />
        <Text style={[shopStyles.muted, { textAlign: 'center', marginTop: 40 }]}>{t('shop.notFound')}</Text>
      </View>
    );
  }

  const fmt = (ts: number) =>
    new Date(ts).toLocaleString(language === 'el' ? 'el-GR' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const waiting = order.status === 'pending_payment';

  const payAgain = async () => {
    try {
      const ret = buildDeepLink('merch-return') + '?order={ORDER_ID}';
      const { url } = await retry({ sessionToken: sessionToken as string, orderId: id, successUrl: ret, cancelUrl: ret });
      await openCheckout(url);
    } catch (e: any) {
      Alert.alert(t('error'), e?.data || t('shop.orderFailed'));
    }
  };
  const cancelOrder = () =>
    Alert.alert(t('shop.cancelOrder'), t('shop.confirmCancel'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('shop.cancelOrder'),
        style: 'destructive',
        onPress: () => cancel({ sessionToken: sessionToken as string, orderId: id }).catch((e: any) => Alert.alert(t('error'), e?.data || '')),
      },
    ]);

  return (
    <View style={styles.container}>
      <ScreenHeader title={order.orderCode} onBack={() => (route.params.fresh ? navigation.navigate('MerchOrders') : navigation.goBack())} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60, gap: 14 }}>
        <View style={[shopStyles.card, { alignItems: 'center', gap: 8 }]}>
          {waiting ? (
            checking ? <ActivityIndicator color={theme.colors.redLight} /> : <Ionicons name="time-outline" size={36} color={theme.colors.warning} />
          ) : order.status === 'cancelled' || order.status === 'refunded' ? (
            <Ionicons name="close-circle-outline" size={36} color={theme.colors.textMuted} />
          ) : (
            <Ionicons name="checkmark-circle" size={36} color={theme.colors.success} />
          )}
          <Text style={styles.headline}>
            {waiting ? (checking ? t('shop.checking') : t('shop.waitingPayment')) : order.status === 'cancelled' ? t('shop.orderCancelled') : t('shop.thanks')}
          </Text>
          <StatusPill status={order.status} />
          {order.testMode && <Text style={{ color: theme.colors.warning, fontSize: 12 }}>{t('shop.testMode')}</Text>}
          {waiting && !checking && (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
              <PrimaryButton small label={t('shop.payNow')} onPress={payAgain} />
              <TouchableOpacity onPress={cancelOrder} style={{ justifyContent: 'center', paddingHorizontal: 10 }}>
                <Text style={shopStyles.muted}>{t('shop.cancelOrder')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={[shopStyles.card, { gap: 6 }]}>
          {order.delivery === 'pickup' ? (
            <>
              <Text style={styles.strong}>
                {order.status === 'ready' ? t('shop.readyAt', { shop: order.sellerName }) : t('shop.pickupAt', { shop: order.sellerName })}
              </Text>
              {(order.companyAddress || order.companyCity) && (
                <Text style={shopStyles.muted}>{[order.companyAddress, order.companyCity].filter(Boolean).join(', ')}</Text>
              )}
              {order.booking && (
                <Text style={shopStyles.muted}>
                  {t('shop.atYourGame', { room: order.booking.roomTitle, date: order.booking.date, time: order.booking.time })}
                </Text>
              )}
              {order.pickupNote && <Text style={shopStyles.muted}>{order.pickupNote}</Text>}
              {!order.paidAt && order.payment === 'at_pickup' && (
                <Text style={[shopStyles.muted, { color: theme.colors.warning }]}>{t('shop.payAtPickupAmount', { amount: euro(order.totalCents) })}</Text>
              )}
              {order.status === 'reserved' && (
                <TouchableOpacity onPress={cancelOrder}>
                  <Text style={[shopStyles.muted, { textDecorationLine: 'underline' }]}>{t('shop.cancelOrder')}</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              <Text style={styles.strong}>
                {order.status === 'shipped' ? t('shop.shippedBy', { shop: order.sellerName }) : t('shop.shipsFrom', { shop: order.sellerName })}
              </Text>
              {order.shippingAddress && (
                <Text style={shopStyles.muted}>
                  {[order.shippingAddress.name, order.shippingAddress.line1, order.shippingAddress.line2, `${order.shippingAddress.postalCode} ${order.shippingAddress.city}`, order.shippingAddress.country]
                    .filter(Boolean)
                    .join('\n')}
                </Text>
              )}
              {order.trackingCode && (
                <TouchableOpacity disabled={!order.trackingUrl} onPress={() => order.trackingUrl && Linking.openURL(order.trackingUrl)}>
                  <Text style={[shopStyles.muted, order.trackingUrl ? { color: theme.colors.redLight } : null]}>
                    {t('shop.tracking')}: {order.trackingCode}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
          {order.paidAt && <Text style={shopStyles.muted}>{t('shop.paidOn', { date: fmt(order.paidAt) })}</Text>}
          {order.sellerNote && <Text style={[shopStyles.muted, { fontStyle: 'italic' }]}>“{order.sellerNote}”</Text>}
        </View>

        <View style={[shopStyles.card, { gap: 8 }]}>
          {order.items.map((i, k) => (
            <View key={k} style={shopStyles.row}>
              <Text style={[shopStyles.muted, { flex: 1 }]}>
                {i.quantity}× {i.title} ({i.variantLabel})
              </Text>
              <Text style={{ color: theme.colors.bone }}>{i.unitPriceCents ? euro(i.unitPriceCents * i.quantity) : '€0'}</Text>
            </View>
          ))}
          {order.discountCents > 0 && (
            <View style={shopStyles.row}>
              <Text style={[shopStyles.muted, { color: theme.colors.gold }]}>{t('shop.premiumDiscount')}</Text>
              <Text style={{ color: theme.colors.gold }}>−{euro(order.discountCents)}</Text>
            </View>
          )}
          {order.delivery === 'shipping' && (
            <View style={shopStyles.row}>
              <Text style={shopStyles.muted}>{t('shop.shippingCost')}</Text>
              <Text style={{ color: theme.colors.bone }}>{order.shippingCents ? euro(order.shippingCents) : t('shop.free')}</Text>
            </View>
          )}
          <View style={shopStyles.row}>
            <Text style={styles.strong}>{t('shop.total')}</Text>
            <Text style={styles.strong}>{euro(order.totalCents)}</Text>
          </View>
        </View>
        <Text style={[shopStyles.muted, { fontSize: 11 }]}>{t('shop.returnsNote', { shop: order.sellerName })}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  pill: { fontSize: 11, fontWeight: '700', borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  thumb: { width: 48, height: 48, borderRadius: theme.radius.md, backgroundColor: 'rgba(0,0,0,0.4)' },
  code: { color: theme.colors.bone, fontWeight: '700', fontSize: 14 },
  headline: { fontSize: 20, fontFamily: theme.fonts.display, color: theme.colors.bone, textAlign: 'center' },
  strong: { color: theme.colors.bone, fontSize: 15, fontWeight: '600' },
});
