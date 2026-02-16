import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Alert, Linking, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp, CommonActions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { rooms as staticRooms } from '../data';
import { theme } from '../theme';
import { RootStackParamList } from '../types';
import { useTranslation } from '../i18n';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type RouteType = RouteProp<RootStackParamList, 'BookingConfirmation'>;

export default function BookingConfirmation() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteType>();
  const { id, date, time, players, total } = route.params;
  const { t } = useTranslation();

  const convexRooms = useQuery(api.rooms.list);
  const allRooms = convexRooms && convexRooms.length > 0
    ? convexRooms.map((r: any) => ({ ...r, id: r._id }))
    : staticRooms;
  const room = allRooms.find((r: any) => r.id === id) || allRooms[0];

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 1, friction: 4, tension: 60, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  const bookingId = `UNL-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Success Icon */}
        <Animated.View style={[styles.iconWrap, { transform: [{ scale: scaleAnim }] }]}>
          <View style={styles.iconGlow} />
          <View style={styles.iconCircle}>
            <Ionicons name="key" size={44} color={theme.colors.redPrimary} />
          </View>
        </Animated.View>

        <Animated.View style={{ opacity: fadeAnim, alignItems: 'center' }}>
          <Text style={styles.title}>{t('confirmation.title')}</Text>
          <Text style={styles.subtitle}>{t('confirmation.subtitle')}</Text>

          {/* Booking Card */}
          <View style={styles.card}>
            <Text style={styles.roomName}>{room.title}</Text>
            <Text style={styles.roomLocation}>{room.location}</Text>

            <View style={styles.divider} />

            <View style={styles.infoRow}>
              <View style={styles.infoItem}>
                <Ionicons name="calendar-outline" size={16} color={theme.colors.textMuted} />
                <Text style={styles.infoLabel}>{t('confirmation.date')}</Text>
                <Text style={styles.infoVal}>{date}</Text>
              </View>
              <View style={styles.infoItem}>
                <Ionicons name="time-outline" size={16} color={theme.colors.textMuted} />
                <Text style={styles.infoLabel}>{t('confirmation.time')}</Text>
                <Text style={styles.infoVal}>{time}</Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <View style={styles.infoItem}>
                <Ionicons name="people-outline" size={16} color={theme.colors.textMuted} />
                <Text style={styles.infoLabel}>{t('confirmation.players')}</Text>
                <Text style={styles.infoVal}>{players}</Text>
              </View>
              <View style={styles.infoItem}>
                <Ionicons name="pricetag-outline" size={16} color={theme.colors.textMuted} />
                <Text style={styles.infoLabel}>{t('confirmation.total')}</Text>
                <Text style={styles.infoVal}>€{total.toFixed(2)}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            {/* QR Placeholder */}
            <View style={styles.qrWrap}>
              <View style={styles.qrBox}>
                <Ionicons name="qr-code-outline" size={80} color={theme.colors.textMuted} />
              </View>
              <Text style={styles.bookingId}>{t('confirmation.bookingId', { id: bookingId })}</Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7} onPress={() => {
              Alert.alert(t('confirmation.calendarTitle'), t('confirmation.calendarMessage', { title: room.title, date, time }));
            }}>
              <Ionicons name="calendar" size={20} color={theme.colors.redPrimary} />
              <Text style={styles.actionText}>{t('confirmation.addCalendar')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7} onPress={async () => {
              try {
                await Share.share({
                  message: `${t('confirmation.receiptTitle')}\n\n${t('confirmation.date')}: ${room.title}\n${t('confirmation.date')}: ${date}\n${t('confirmation.time')}: ${time}\n${t('confirmation.players')}: ${players}\n${t('confirmation.total')}: €${total.toFixed(2)}\n${t('confirmation.bookingId', { id: bookingId })}\n\n${room.location}`,
                  title: t('confirmation.receiptTitle'),
                });
              } catch {
                Alert.alert(t('confirmation.receiptTitle'), t('confirmation.receiptSaved'));
              }
            }}>
              <Ionicons name="download-outline" size={20} color={theme.colors.redPrimary} />
              <Text style={styles.actionText}>{t('confirmation.shareReceipt')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7} onPress={() => {
              const query = encodeURIComponent(room.location);
              Linking.openURL(`https://maps.apple.com/?q=${query}`).catch(() => {
                Alert.alert(t('confirmation.directionsTitle'), t('confirmation.directionsMessage', { location: room.location }));
              });
            }}>
              <Ionicons name="navigate-outline" size={20} color={theme.colors.redPrimary} />
              <Text style={styles.actionText}>{t('confirmation.getDirections')}</Text>
            </TouchableOpacity>
          </View>

          {/* Back to Home */}
          <TouchableOpacity
            style={styles.homeBtn}
            activeOpacity={0.8}
            onPress={() => {
              navigation.dispatch(
                CommonActions.reset({ index: 0, routes: [{ name: 'MainTabs' }] })
              );
            }}
          >
            <Text style={styles.homeBtnText}>{t('confirmation.backHome')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  scroll: {
    paddingTop: 80, paddingHorizontal: 20, paddingBottom: 60,
    alignItems: 'center',
  },

  // Icon
  iconWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  iconGlow: {
    position: 'absolute', width: 120, height: 120, borderRadius: 60,
    backgroundColor: theme.colors.redPrimary, opacity: 0.15,
  },
  iconCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 2, borderColor: theme.colors.redPrimary,
    alignItems: 'center', justifyContent: 'center',
  },

  title: { fontSize: 28, fontWeight: '800', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 32 },

  // Card
  card: {
    width: '100%', padding: 24, borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    marginBottom: 24,
  },
  roomName: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 4 },
  roomLocation: { fontSize: 13, color: theme.colors.textSecondary },
  divider: {
    height: 1, backgroundColor: theme.colors.border, marginVertical: 18,
  },
  infoRow: {
    flexDirection: 'row', marginBottom: 16,
  },
  infoItem: { flex: 1, gap: 4 },
  infoLabel: { fontSize: 11, color: theme.colors.textMuted, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.8 },
  infoVal: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // QR
  qrWrap: { alignItems: 'center' },
  qrBox: {
    width: 140, height: 140, borderRadius: theme.radius.lg,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    marginBottom: 12,
  },
  bookingId: { fontSize: 12, color: theme.colors.textMuted, letterSpacing: 1 },

  // Actions
  actions: {
    width: '100%',
    flexDirection: 'row', justifyContent: 'space-around',
    marginBottom: 32,
  },
  actionBtn: { alignItems: 'center', gap: 6 },
  actionText: { fontSize: 11, color: theme.colors.textSecondary, textAlign: 'center' },

  // Home button
  homeBtn: {
    width: '100%', paddingVertical: 16,
    borderRadius: theme.radius.full,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    alignItems: 'center',
  },
  homeBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
