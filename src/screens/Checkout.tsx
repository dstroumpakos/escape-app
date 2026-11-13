import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator,
  AppState, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { theme } from '../theme';
import { RootStackParamList } from '../types';
import { useTranslation } from '../i18n';
import { useUser } from '../UserContext';
import { openCheckout, buildDeepLink } from '../payments';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function formatDisplayDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
}

/** Website page used as the Stripe return page if Stripe refuses the app's own link. */
const WEB_RETURN_URL = 'https://unlocked.gr/booking/confirmation?booking={BOOKING_ID}&session_id={CHECKOUT_SESSION_ID}';

type Terms = 'full' | 'deposit_20' | 'pay_on_arrival';
type Nav = NativeStackNavigationProp<RootStackParamList>;
type RouteType = RouteProp<RootStackParamList, 'Checkout'>;

/** Readable message from a Convex error (ConvexError keeps it in `data`). */
function errorText(e: any): string {
  if (typeof e?.data === 'string') return e.data;
  const msg: string = e?.message || '';
  const m = msg.match(/(?:Uncaught (?:Convex)?Error: )(.+?)(?:\n|\s+at |$)/);
  const clean = (m ? m[1] : msg).trim();
  return /Server Error|Request ID|Called by client/i.test(clean) ? '' : clean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Checkout() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteType>();
  const { id, date, time, players, total: routeTotal } = route.params;

  const { t } = useTranslation();
  const { userId } = useUser();
  const createBooking = useMutation(api.bookings.create);
  const cancelBooking = useMutation(api.bookings.cancel);
  const startCheckout = useAction(api.companyPayments.startCheckout);
  const confirmReturn = useAction(api.companyPayments.confirmReturn);
  const updateProfile = useMutation(api.users.updateProfile);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);

  // Fetch user to check phone
  const convexUser = useQuery(api.users.getById, userId ? { userId: userId as any } : "skip");
  const userHasPhone = !!(convexUser as any)?.phone;

  const room = useQuery(api.rooms.getById, { id: id as Id<'rooms'> });

  // Terms, prices, deposit % and booking fee come from the server. Online
  // options only appear when the escape room connected its own Stripe or Viva.
  const options = useQuery(api.companyPaymentsData.getCheckoutOptions, {
    roomId: id as Id<'rooms'>,
    players,
  });

  const [promoCode, setPromoCode] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const companyTerms = (room?.termsOfUse || '').trim();
  const mustAcceptTerms = companyTerms.length > 0;

  const availableTerms: Terms[] = (options?.terms as Terms[] | undefined) ?? ['pay_on_arrival'];
  const [selectedTerm, setSelectedTerm] = useState<Terms>('pay_on_arrival');
  useEffect(() => {
    if (options && !availableTerms.includes(selectedTerm)) setSelectedTerm(availableTerms[0]);
  }, [options, availableTerms.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const isPayOnArrival = selectedTerm === 'pay_on_arrival';
  const total = options?.total ?? routeTotal;
  const depositPercent = options?.depositPercent ?? 20;
  const depositAmount = options?.depositAmount ?? 0;
  const bookingFee = options?.bookingFee ?? 0;
  const feeNow = isPayOnArrival ? 0 : bookingFee;
  const partNow = selectedTerm === 'full' ? total : selectedTerm === 'deposit_20' ? depositAmount : 0;
  const payNow = Math.round((partNow + feeNow) * 100) / 100;
  const remaining = Math.max(0, Math.round((total - partNow) * 100) / 100);
  const providerName = options?.provider === 'viva' ? 'Viva' : 'Stripe';

  // ─── Waiting for an online payment ───
  const [pending, setPending] = useState<{ bookingId: string; url: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [notSeen, setNotSeen] = useState(false);
  const paymentState = useQuery(
    api.companyPaymentsData.getPaymentState,
    pending ? { bookingId: pending.bookingId as Id<'bookings'> } : 'skip'
  );
  const isPaid = !!paymentState && (paymentState.paymentStatus === 'paid' || paymentState.paymentStatus === 'deposit');
  const isPaidRef = useRef(false);
  isPaidRef.current = isPaid;
  const checkRun = useRef(0);

  // Paid → go to the confirmation with the real booking.
  useEffect(() => {
    if (!pending || !paymentState || !isPaid || paymentState.status === 'cancelled') return;
    navigation.replace('BookingConfirmation', {
      id,
      date: paymentState.date,
      time: paymentState.time,
      players: paymentState.players,
      total: paymentState.total,
      bookingCode: paymentState.bookingCode,
      bookingId: paymentState.bookingId,
      paymentStatus: paymentState.paymentStatus as string,
    });
  }, [pending, paymentState, isPaid]); // eslint-disable-line react-hooks/exhaustive-deps

  const expired = !!pending && paymentState?.status === 'cancelled';
  const lateCancelled = expired && isPaid;

  /** Ask the server to check with the escape room's Stripe/Viva account, a few times. */
  const checkPayment = useCallback(
    async (manual: boolean) => {
      if (!pending) return;
      const run = ++checkRun.current;
      setChecking(true);
      setNotSeen(false);
      for (let i = 0; i < (manual ? 3 : 5); i++) {
        if (i > 0) await sleep(4000);
        if (run !== checkRun.current || isPaidRef.current) break;
        try {
          const r = await confirmReturn({ bookingId: pending.bookingId as Id<'bookings'> });
          if (r.state === 'paid') break;
        } catch {}
      }
      if (run === checkRun.current) {
        setChecking(false);
        if (!isPaidRef.current) setNotSeen(true);
      }
    },
    [pending, confirmReturn]
  );

  // Coming back from the browser (deep link or app switch) → check the payment.
  useEffect(() => {
    if (!pending) return;
    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') checkPayment(false);
    });
    const linkSub = Linking.addEventListener('url', ({ url }) => {
      if (url.includes('payment-return')) checkPayment(false);
    });
    return () => {
      appSub.remove();
      linkSub.remove();
    };
  }, [pending, checkPayment]);

  const startOnlinePayment = async (terms: 'full' | 'deposit_20') => {
    const base = {
      userId: userId as Id<'users'>,
      roomId: id as Id<'rooms'>,
      date,
      time,
      players,
      paymentTerms: terms,
    };
    // The server fills in {BOOKING_ID}. Viva always returns to the website.
    const appReturn = buildDeepLink('payment-return') + '?booking={BOOKING_ID}';
    try {
      return await startCheckout({ ...base, successUrl: appReturn, cancelUrl: appReturn });
    } catch (e: any) {
      // If Stripe refuses the app link, fall back to the website's return page.
      if (options?.provider === 'stripe' && /url/i.test(errorText(e) || e?.message || '')) {
        return await startCheckout({ ...base, successUrl: WEB_RETURN_URL, cancelUrl: WEB_RETURN_URL });
      }
      throw e;
    }
  };

  const onConfirm = async () => {
    if (!userId) {
      Alert.alert(t('error'), t('checkout.loginRequired'));
      return;
    }
    if (!options) return;
    if (mustAcceptTerms && !termsAccepted) {
      Alert.alert(t('checkout.termsTitle'), t('checkout.termsRequired'));
      return;
    }
    setIsSubmitting(true);
    try {
      if (isPayOnArrival) {
        // Pay at the venue: booking is created without any payment.
        const result = await createBooking({
          userId: userId as Id<'users'>,
          roomId: id as Id<'rooms'>,
          date,
          time,
          players,
          total,
          paymentTerms: 'pay_on_arrival',
          paymentMethod: 'pay_on_arrival',
        });
        navigation.navigate('BookingConfirmation', {
          id,
          date,
          time,
          players,
          total,
          bookingCode: result.bookingCode,
          bookingId: result.id,
          paymentStatus: 'unpaid',
        });
      } else {
        // Pay online into the escape room's own Stripe / Viva account. The
        // booking stays pending until the provider confirms the money arrived.
        const { url, bookingId } = await startOnlinePayment(selectedTerm);
        setPending({ bookingId, url });
        setNotSeen(false);
        await openCheckout(url);
      }
    } catch (e: any) {
      Alert.alert(t('error'), errorText(e) || t('checkout.bookingFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const reopenPayment = async () => {
    if (!pending) return;
    try {
      await openCheckout(pending.url);
    } catch (e: any) {
      Alert.alert(t('error'), errorText(e) || t('checkout.bookingFailed'));
    }
  };

  /** Give up on the online payment and release the slot (unless it was paid after all). */
  const abandonPayment = async () => {
    if (!pending) return;
    if (expired) {
      setPending(null);
      return;
    }
    setChecking(true);
    checkRun.current++;
    try {
      const r = await confirmReturn({ bookingId: pending.bookingId as Id<'bookings'> }).catch(() => null);
      if (r?.state === 'paid' || isPaidRef.current) return; // the effect above navigates
      await cancelBooking({ id: pending.bookingId as Id<'bookings'> });
      setPending(null);
      setNotSeen(false);
    } catch (e: any) {
      Alert.alert(t('error'), errorText(e) || t('checkout.bookingFailed'));
    } finally {
      setChecking(false);
    }
  };

  if (room === undefined || options === undefined) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={theme.colors.redPrimary} />
      </View>
    );
  }
  if (room === null || options === null) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        <Text style={styles.detailText}>{t('checkout.bookingFailed')}</Text>
        <TouchableOpacity style={[styles.promoBtn, { marginTop: 16 }]} onPress={() => navigation.goBack()}>
          <Text style={styles.promoBtnText}>{t('checkout.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Waiting screen while the player pays in the browser ───
  if (pending) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('checkout.title')}</Text>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 60 }}>
          <View style={styles.card}>
            <Ionicons
              name={expired ? 'alert-circle-outline' : 'card-outline'}
              size={40}
              color={expired ? theme.colors.warning : theme.colors.redPrimary}
              style={{ alignSelf: 'center', marginBottom: 12 }}
            />
            <Text style={[styles.cardTitle, { textAlign: 'center' }]}>
              {expired ? t('checkout.paymentClosedTitle') : t('checkout.awaitingTitle')}
            </Text>
            <Text style={[styles.detailText, { textAlign: 'center', lineHeight: 20 }]}>
              {lateCancelled
                ? t('checkout.lateCancelled')
                : expired
                ? t('checkout.paymentExpired')
                : t('checkout.awaitingDesc', { provider: providerName })}
            </Text>
            {!expired && notSeen && !checking && (
              <Text style={[styles.detailText, { textAlign: 'center', marginTop: 12, color: theme.colors.warning }]}>
                {t('checkout.notSeenYet')}
              </Text>
            )}
            {checking && (
              <View style={[styles.detailRow, { justifyContent: 'center', marginTop: 14 }]}>
                <ActivityIndicator size="small" color={theme.colors.redPrimary} />
                <Text style={styles.detailText}>{t('checkout.checking')}</Text>
              </View>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.roomName}>{room.title}</Text>
            <Text style={styles.detailText}>
              {formatDisplayDate(date)} · {time} · {players} {players > 1 ? t('players') : t('player')}
            </Text>
            {paymentState?.amountDueNow != null && (
              <View style={[styles.priceRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>{t('checkout.payNow')}</Text>
                <Text style={styles.totalVal}>€{paymentState.amountDueNow.toFixed(2)}</Text>
              </View>
            )}
          </View>

          {!expired && (
            <>
              <TouchableOpacity
                style={[styles.confirmBtn, checking && { opacity: 0.6 }]}
                disabled={checking}
                onPress={() => checkPayment(true)}
              >
                <Ionicons name="refresh" size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.confirmText}>{t('checkout.checkPayment')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.secondaryBtn, { marginTop: 12 }]} onPress={reopenPayment}>
                <Text style={styles.secondaryText}>{t('checkout.reopenPayment')}</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity
            style={[styles.secondaryBtn, { marginTop: 12 }, checking && { opacity: 0.6 }]}
            disabled={checking}
            onPress={() => {
              if (expired) {
                setPending(null);
                return;
              }
              Alert.alert(t('checkout.cancelPaymentTitle'), t('checkout.cancelPaymentMsg'), [
                { text: t('cancel'), style: 'cancel' },
                { text: t('checkout.cancelPaymentConfirm'), style: 'destructive', onPress: abandonPayment },
              ]);
            }}
          >
            <Text style={[styles.secondaryText, { color: theme.colors.textSecondary }]}>
              {expired ? t('checkout.back') : t('checkout.cancelPayment')}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('checkout.title')}</Text>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
        {/* Booking Summary */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('checkout.bookingSummary')}</Text>
          <Text style={styles.roomName}>{room.title}</Text>
          <View style={styles.detailRow}>
            <Ionicons name="calendar-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={styles.detailText}>{formatDisplayDate(date)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={styles.detailText}>{time}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="people-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={styles.detailText}>{players} {players > 1 ? t('players') : t('player')}</Text>
          </View>
        </View>

        {/* Price Breakdown */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('checkout.priceBreakdown')}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>{t('checkout.tickets', { n: players })}</Text>
            <Text style={styles.priceVal}>€{total.toFixed(2)}</Text>
          </View>
          {feeNow > 0 && (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>{t('checkout.serviceFee')}</Text>
              <Text style={styles.priceVal}>€{feeNow.toFixed(2)}</Text>
            </View>
          )}
          <View style={[styles.priceRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>{t('checkout.total')}</Text>
            <Text style={styles.totalVal}>€{(total + feeNow).toFixed(2)}</Text>
          </View>
          {!isPayOnArrival && (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>{t('checkout.payNow')}</Text>
              <Text style={styles.priceVal}>€{payNow.toFixed(2)}</Text>
            </View>
          )}
          {remaining > 0 && (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>{t('checkout.payAtVenue')}</Text>
              <Text style={styles.priceVal}>€{remaining.toFixed(2)}</Text>
            </View>
          )}
        </View>

        {/* Promo Code */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('checkout.promoCode')}</Text>
          <View style={styles.promoRow}>
            <TextInput
              style={styles.promoInput}
              placeholder={t('checkout.enterPromo')}
              placeholderTextColor={theme.colors.textMuted}
              value={promoCode}
              onChangeText={setPromoCode}
            />
            <TouchableOpacity style={styles.promoBtn} onPress={() => {
              if (promoCode.trim().length === 0) {
                Alert.alert(t('checkout.promoCode'), t('checkout.promoEmpty'));
              } else {
                Alert.alert(t('checkout.invalidCode'), t('checkout.invalidCodeMsg', { code: promoCode }));
                setPromoCode('');
              }
            }}>
              <Text style={styles.promoBtnText}>{t('checkout.apply')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Phone Number (required) */}
        {!userHasPhone && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('checkout.phoneRequired')}</Text>
            <Text style={{ fontSize: 13, color: theme.colors.textSecondary, marginBottom: 12 }}>
              {t('checkout.phoneRequiredDesc')}
            </Text>
            <View style={styles.promoRow}>
              <TextInput
                style={styles.promoInput}
                placeholder={t('checkout.phonePlaceholder')}
                placeholderTextColor={theme.colors.textMuted}
                value={phoneInput}
                onChangeText={setPhoneInput}
                keyboardType="phone-pad"
              />
              <TouchableOpacity
                style={[styles.promoBtn, savingPhone && { opacity: 0.6 }]}
                disabled={savingPhone || !phoneInput.trim()}
                onPress={async () => {
                  if (!phoneInput.trim()) return;
                  setSavingPhone(true);
                  try {
                    await updateProfile({ userId: userId as any, phone: phoneInput.trim() });
                  } catch (e: any) {
                    Alert.alert(t('error'), e.message);
                  } finally {
                    setSavingPhone(false);
                  }
                }}
              >
                {savingPhone ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.promoBtnText}>{t('save')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Payment Term Selection */}
        {availableTerms.length > 1 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('checkout.paymentOption')}</Text>
            {availableTerms.map((term) => {
              const label = term === 'deposit_20'
                ? t('checkout.deposit20', { percent: depositPercent })
                : term === 'pay_on_arrival' ? t('checkout.payOnArrival') : t('checkout.fullPayment');
              const desc = term === 'deposit_20'
                ? t('checkout.deposit20Desc', { percent: depositPercent })
                : term === 'pay_on_arrival' ? t('checkout.payOnArrivalDesc') : t('checkout.fullPaymentDesc');
              const icon = term === 'deposit_20' ? 'card-outline' : term === 'pay_on_arrival' ? 'location-outline' : 'cash-outline';
              const amount = term === 'full' ? total + bookingFee : term === 'deposit_20' ? depositAmount + bookingFee : 0;
              return (
                <TouchableOpacity
                  key={term}
                  style={[styles.payOption, selectedTerm === term && styles.payOptionActive]}
                  onPress={() => setSelectedTerm(term)}
                >
                  <View style={styles.payRow}>
                    <Ionicons name={icon as any} size={22} color="#fff" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.payText}>{label}</Text>
                      <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 }}>{desc}</Text>
                    </View>
                    {amount > 0 && <Text style={styles.priceVal}>€{amount.toFixed(2)}</Text>}
                  </View>
                  <View style={[styles.radio, { marginLeft: 10 }, selectedTerm === term && styles.radioActive]}>
                    {selectedTerm === term && <View style={styles.radioDot} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Payment Method */}
        {isPayOnArrival ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('checkout.payment')}</Text>
            <View style={[styles.payOption, styles.payOptionActive]}>
              <View style={styles.payRow}>
                <Ionicons name="location-outline" size={22} color={theme.colors.redPrimary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.payText}>{t('checkout.payOnArrival')}</Text>
                  <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 }}>
                    {options.online ? t('checkout.payOnArrivalNote') : t('checkout.onlineUnavailable')}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('checkout.paymentMethod')}</Text>
            <View style={[styles.payOption, styles.payOptionActive]}>
              <View style={styles.payRow}>
                <Ionicons name="card-outline" size={22} color="#fff" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.payText}>{t('checkout.creditCard')}</Text>
                  <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 }}>
                    {t('checkout.stripeSecure', { provider: providerName })}
                  </Text>
                </View>
              </View>
              <Ionicons name="shield-checkmark-outline" size={18} color="#4CAF50" />
            </View>
            {options.testMode && (
              <Text style={{ fontSize: 12, color: theme.colors.warning, marginTop: 4 }}>{t('checkout.testMode')}</Text>
            )}
          </View>
        )}

        {/* The escape room's own terms & conditions */}
        {mustAcceptTerms && (
          <View style={styles.card}>
            <Text style={[styles.cardTitle, { marginBottom: 4 }]}>{t('checkout.termsTitle')}</Text>
            {!!room.companyName && (
              <Text style={styles.termsFrom}>{t('checkout.termsFrom', { company: room.companyName })}</Text>
            )}
            <ScrollView style={styles.termsBox} nestedScrollEnabled showsVerticalScrollIndicator>
              <Text style={styles.termsText}>{companyTerms}</Text>
            </ScrollView>
            <TouchableOpacity
              style={styles.termsAcceptRow}
              activeOpacity={0.7}
              onPress={() => setTermsAccepted((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: termsAccepted }}
            >
              <Ionicons
                name={termsAccepted ? 'checkbox' : 'square-outline'}
                size={22}
                color={termsAccepted ? theme.colors.redPrimary : theme.colors.textSecondary}
              />
              <Text style={styles.termsAcceptText}>{t('checkout.termsAccept')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Bottom CTA */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.confirmBtn, (isSubmitting || !userHasPhone) && { opacity: 0.6 }]}
          activeOpacity={0.8}
          disabled={isSubmitting || !userHasPhone}
          onPress={onConfirm}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name={isPayOnArrival ? 'checkmark-circle' : 'lock-closed'} size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.confirmText}>{isPayOnArrival ? t('checkout.confirmReservation') : t('checkout.confirmPay', { amount: payNow.toFixed(2) })}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.colors.glass, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  scroll: { flex: 1, paddingHorizontal: 20 },

  // Cards
  card: {
    padding: 20, borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 14 },
  roomName: { fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 12 },

  // Terms
  termsFrom: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 12 },
  termsBox: {
    maxHeight: 220, borderRadius: theme.radius.md,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  termsText: { fontSize: 13, lineHeight: 19, color: theme.colors.textSecondary },
  termsAcceptRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 14 },
  termsAcceptText: { flex: 1, fontSize: 13, lineHeight: 19, color: '#fff' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  detailText: { fontSize: 14, color: theme.colors.textSecondary },

  // Price
  priceRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8,
  },
  priceLabel: { fontSize: 14, color: theme.colors.textSecondary },
  priceVal: { fontSize: 14, fontWeight: '600', color: '#fff' },
  totalRow: {
    borderTopWidth: 1, borderTopColor: theme.colors.border,
    marginTop: 8, paddingTop: 14,
  },
  totalLabel: { fontSize: 16, fontWeight: '700', color: '#fff' },
  totalVal: { fontSize: 20, fontWeight: '800', color: theme.colors.redPrimary },

  // Promo
  promoRow: { flexDirection: 'row', gap: 10 },
  promoInput: {
    flex: 1, paddingVertical: 12, paddingHorizontal: 16,
    backgroundColor: theme.colors.glass, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    color: '#fff', fontSize: 14,
  },
  promoBtn: {
    paddingVertical: 12, paddingHorizontal: 20,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    justifyContent: 'center',
  },
  promoBtnText: { fontSize: 14, fontWeight: '600', color: theme.colors.redPrimary },

  // Payment
  payOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    marginBottom: 10,
  },
  payOptionActive: { borderColor: theme.colors.redPrimary },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  payText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: theme.colors.textMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  radioActive: { borderColor: theme.colors.redPrimary },
  radioDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: theme.colors.redPrimary,
  },

  // Footer
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36,
    backgroundColor: 'rgba(26,13,13,0.95)',
    borderTopWidth: 1, borderTopColor: theme.colors.border,
  },
  confirmBtn: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    paddingVertical: 16, borderRadius: theme.radius.full,
    backgroundColor: theme.colors.redPrimary,
    ...theme.shadow.red,
  },
  confirmText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  secondaryBtn: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    paddingVertical: 14, borderRadius: theme.radius.full,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    backgroundColor: theme.colors.glass,
  },
  secondaryText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
