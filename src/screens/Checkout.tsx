import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { rooms as staticRooms } from '../data';
import { theme } from '../theme';
import { RootStackParamList } from '../types';
import { useTranslation } from '../i18n';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type RouteType = RouteProp<RootStackParamList, 'Checkout'>;

export default function Checkout() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteType>();
  const { id, date, time, players, total } = route.params;

  const { t } = useTranslation();

  const convexRooms = useQuery(api.rooms.list);
  const allRooms = convexRooms && convexRooms.length > 0
    ? convexRooms.map((r: any) => ({ ...r, id: r._id }))
    : staticRooms;
  const room = allRooms.find((r: any) => r.id === id) || allRooms[0];

  const [paymentMethod, setPaymentMethod] = useState<'apple' | 'credit'>('apple');
  const [promoCode, setPromoCode] = useState('');

  // Resolve available payment terms (array or legacy single value)
  const rawTerms = room.paymentTerms;
  const availableTerms: string[] = Array.isArray(rawTerms)
    ? rawTerms
    : rawTerms ? [rawTerms] : ['full'];
  const [selectedTerm, setSelectedTerm] = useState<string>(availableTerms[0]);
  const isPayOnArrival = selectedTerm === 'pay_on_arrival';

  const serviceFee = 3.99;
  const finalTotal = total + serviceFee;

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
            <Text style={styles.detailText}>{date}</Text>
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
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>{t('checkout.serviceFee')}</Text>
            <Text style={styles.priceVal}>€{serviceFee.toFixed(2)}</Text>
          </View>
          <View style={[styles.priceRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>{t('checkout.total')}</Text>
            <Text style={styles.totalVal}>€{finalTotal.toFixed(2)}</Text>
          </View>
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

        {/* Payment Term Selection */}
        {availableTerms.length > 1 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('checkout.paymentOption')}</Text>
            {availableTerms.map((term) => {
              const label = term === 'deposit_20' ? t('checkout.deposit20') : term === 'pay_on_arrival' ? t('checkout.payOnArrival') : t('checkout.fullPayment');
              const desc = term === 'deposit_20' ? t('checkout.deposit20Desc') : term === 'pay_on_arrival' ? t('checkout.payOnArrivalDesc') : t('checkout.fullPaymentDesc');
              const icon = term === 'deposit_20' ? 'card-outline' : term === 'pay_on_arrival' ? 'location-outline' : 'cash-outline';
              return (
                <TouchableOpacity
                  key={term}
                  style={[styles.payOption, selectedTerm === term && styles.payOptionActive]}
                  onPress={() => setSelectedTerm(term)}
                >
                  <View style={styles.payRow}>
                    <Ionicons name={icon as any} size={22} color="#fff" />
                    <View>
                      <Text style={styles.payText}>{label}</Text>
                      <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 }}>{desc}</Text>
                    </View>
                  </View>
                  <View style={[styles.radio, selectedTerm === term && styles.radioActive]}>
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
                <View>
                  <Text style={styles.payText}>{t('checkout.payOnArrival')}</Text>
                  <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 }}>
                    {t('checkout.payOnArrivalNote')}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('checkout.paymentMethod')}</Text>
            <TouchableOpacity
              style={[styles.payOption, paymentMethod === 'apple' && styles.payOptionActive]}
              onPress={() => setPaymentMethod('apple')}
            >
              <View style={styles.payRow}>
                <Ionicons name="logo-apple" size={22} color="#fff" />
                <Text style={styles.payText}>{t('checkout.applePay')}</Text>
              </View>
              <View style={[styles.radio, paymentMethod === 'apple' && styles.radioActive]}>
                {paymentMethod === 'apple' && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.payOption, paymentMethod === 'credit' && styles.payOptionActive]}
              onPress={() => setPaymentMethod('credit')}
            >
              <View style={styles.payRow}>
                <Ionicons name="card-outline" size={22} color="#fff" />
                <Text style={styles.payText}>{t('checkout.creditCard')}</Text>
              </View>
              <View style={[styles.radio, paymentMethod === 'credit' && styles.radioActive]}>
                {paymentMethod === 'credit' && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Bottom CTA */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.confirmBtn}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('BookingConfirmation', {
            id: room.id, date, time, players, total: finalTotal,
          })}
        >
          <Ionicons name={isPayOnArrival ? 'checkmark-circle' : 'lock-closed'} size={18} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.confirmText}>{isPayOnArrival ? t('checkout.confirmReservation') : t('checkout.confirmPay', { amount: finalTotal.toFixed(2) })}</Text>
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
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
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
});
