import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, Alert, Linking, Share, Image, ActivityIndicator,
  Platform, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp, CommonActions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation } from 'convex/react';
import QRCode from 'react-native-qrcode-svg';
import { api } from '../../convex/_generated/api';
import { theme } from '../theme';
import { RootStackParamList } from '../types';
import { useTranslation } from '../i18n';
import { useUser } from '../UserContext';
import type { Id } from '../../convex/_generated/dataModel';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function formatDisplayDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
}

type Nav = NativeStackNavigationProp<RootStackParamList>;
type RouteType = RouteProp<RootStackParamList, 'BookingConfirmation'>;

export default function BookingConfirmation() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteType>();
  const insets = useSafeAreaInsets();
  const { id, date, time, players, total, bookingCode, bookingId, paymentStatus } = route.params;
  const { t } = useTranslation();
  const { userId } = useUser();
  const [inviting, setInviting] = useState<string | null>(null);

  const convexRooms = useQuery(api.rooms.list);
  const allRooms = (convexRooms ?? []).map((r: any) => ({ ...r, id: r._id }));
  const room = allRooms.find((r: any) => r.id === id) || allRooms[0];

  // Friend invite system
  const friends = useQuery(
    api.friends.listFriends,
    userId ? { userId: userId as Id<'users'> } : 'skip',
  );
  const sentInvites = useQuery(
    api.friends.getBookingInvitesByBooking,
    bookingId ? { bookingId: bookingId as Id<'bookings'> } : 'skip',
  );
  const inviteToBooking = useMutation(api.friends.inviteToBooking);

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 1, friction: 5, tension: 50, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const paymentLabel = paymentStatus === 'paid'
    ? t('confirmation.paid')
    : paymentStatus === 'deposit'
    ? t('confirmation.depositPaid')
    : t('confirmation.payOnArrival');
  const paymentColor = paymentStatus === 'paid'
    ? theme.colors.success
    : paymentStatus === 'deposit'
    ? theme.colors.warning
    : '#42A5F5';

  const qrValue = bookingCode || bookingId || 'UNLOCKED';

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Success Icon */}
        <Animated.View style={[styles.iconWrap, { transform: [{ scale: scaleAnim }] }]}>
          <View style={styles.iconGlowOuter} />
          <View style={styles.iconGlow} />
          <View style={styles.iconCircle}>
            <Ionicons name="key" size={40} color={theme.colors.redPrimary} />
          </View>
        </Animated.View>

        <Animated.View style={{ opacity: fadeAnim, alignItems: 'center', transform: [{ translateY: slideAnim }] }}>
          <Text style={styles.title}>{t('confirmation.title')}</Text>
          <Text style={styles.subtitle}>{t('confirmation.subtitle')}</Text>

          {/* Booking Card */}
          <View style={styles.card}>
            {/* Room Header */}
            <Text style={styles.roomName}>{room.title}</Text>
            <Text style={styles.roomLocation}>{room.location}</Text>

            <View style={styles.divider} />

            {/* Details Grid */}
            <View style={styles.infoGrid}>
              <View style={styles.infoItem}>
                <View style={styles.infoIconRow}>
                  <Ionicons name="calendar-outline" size={15} color={theme.colors.redPrimary} />
                </View>
                <Text style={styles.infoLabel}>{t('confirmation.date')}</Text>
                <Text style={styles.infoVal}>{formatDisplayDate(date)}</Text>
              </View>
              <View style={styles.infoItem}>
                <View style={styles.infoIconRow}>
                  <Ionicons name="time-outline" size={15} color={theme.colors.redPrimary} />
                </View>
                <Text style={styles.infoLabel}>{t('confirmation.time')}</Text>
                <Text style={styles.infoVal}>{time}</Text>
              </View>
            </View>

            <View style={styles.infoGrid}>
              <View style={styles.infoItem}>
                <View style={styles.infoIconRow}>
                  <Ionicons name="people-outline" size={15} color={theme.colors.redPrimary} />
                </View>
                <Text style={styles.infoLabel}>{t('confirmation.players')}</Text>
                <Text style={styles.infoVal}>{players}</Text>
              </View>
              <View style={styles.infoItem}>
                <View style={styles.infoIconRow}>
                  <Ionicons name="pricetag-outline" size={15} color={theme.colors.redPrimary} />
                </View>
                <Text style={styles.infoLabel}>{t('confirmation.total')}</Text>
                <Text style={styles.infoVal}>€{total.toFixed(2)}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            {/* Payment Status */}
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>{t('confirmation.paymentStatus')}</Text>
              <View style={[styles.paymentBadge, { backgroundColor: paymentColor + '20' }]}>
                <View style={[styles.paymentDot, { backgroundColor: paymentColor }]} />
                <Text style={[styles.paymentText, { color: paymentColor }]}>{paymentLabel}</Text>
              </View>
            </View>

            {/* QR Code */}
            <View style={styles.qrWrap}>
              <View style={styles.qrBox}>
                <QRCode
                  value={qrValue}
                  size={120}
                  backgroundColor="transparent"
                  color={theme.colors.textSecondary}
                />
              </View>
              <Text style={styles.bookingId}>{t('confirmation.bookingId', { id: bookingCode })}</Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7} onPress={() => {
              Alert.alert(t('confirmation.calendarTitle'), t('confirmation.calendarMessage', { title: room.title, date: formatDisplayDate(date), time }));
            }}>
              <View style={styles.actionIconWrap}>
                <Ionicons name="calendar" size={20} color={theme.colors.redPrimary} />
              </View>
              <Text style={styles.actionText} numberOfLines={2}>{t('confirmation.addCalendar')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7} onPress={async () => {
              try {
                await Share.share({
                  message: `${t('confirmation.receiptTitle')}\n\n${room.title}\n${t('confirmation.date')}: ${formatDisplayDate(date)}\n${t('confirmation.time')}: ${time}\n${t('confirmation.players')}: ${players}\n${t('confirmation.total')}: €${total.toFixed(2)}\n${t('confirmation.bookingId', { id: bookingCode })}\n\n${room.location}`,
                  title: t('confirmation.receiptTitle'),
                });
              } catch {
                Alert.alert(t('confirmation.receiptTitle'), t('confirmation.receiptSaved'));
              }
            }}>
              <View style={styles.actionIconWrap}>
                <Ionicons name="share-outline" size={20} color={theme.colors.redPrimary} />
              </View>
              <Text style={styles.actionText} numberOfLines={2}>{t('confirmation.shareReceipt')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7} onPress={() => {
              const query = encodeURIComponent(room.location);
              const mapsUrl = Platform.OS === 'ios'
                ? `https://maps.apple.com/?q=${query}`
                : `https://www.google.com/maps/search/?api=1&query=${query}`;
              Linking.openURL(mapsUrl).catch(() => {
                Alert.alert(t('confirmation.directionsTitle'), t('confirmation.directionsMessage', { location: room.location }));
              });
            }}>
              <View style={styles.actionIconWrap}>
                <Ionicons name="navigate" size={20} color={theme.colors.redPrimary} />
              </View>
              <Text style={styles.actionText} numberOfLines={2}>{t('confirmation.getDirections')}</Text>
            </TouchableOpacity>
          </View>

          {/* Invite Friends Section */}
          {userId && friends && friends.length > 0 && bookingId && (
            <View style={styles.inviteSection}>
              <View style={styles.inviteHeader}>
                <View style={styles.inviteIconWrap}>
                  <Ionicons name="people" size={18} color={theme.colors.redPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inviteSectionTitle}>{t('friends.inviteFriends')}</Text>
                  <Text style={styles.inviteSectionDesc}>{t('friends.inviteDesc')}</Text>
                </View>
              </View>
              {friends.map((friend: any, index: number) => {
                const alreadyInvited = sentInvites?.find((i: any) => i.invitee?._id === friend._id);
                const isLast = index === friends.length - 1;
                return (
                  <View key={friend._id} style={[styles.inviteCard, isLast && { borderBottomWidth: 0 }]}>
                    {friend.avatar ? (
                      <Image source={{ uri: friend.avatar }} style={styles.inviteAvatar} />
                    ) : (
                      <View style={[styles.inviteAvatar, styles.inviteAvatarPlaceholder]}>
                        <Text style={styles.inviteAvatarInitial}>
                          {friend.name?.charAt(0)?.toUpperCase() ?? '?'}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.inviteName} numberOfLines={1}>{friend.name}</Text>
                    {alreadyInvited ? (
                      <View style={styles.invitedBadge}>
                        <Ionicons name="checkmark-circle" size={14} color={
                          alreadyInvited.status === 'accepted' ? theme.colors.success :
                          alreadyInvited.status === 'declined' ? '#F44336' : theme.colors.warning
                        } />
                        <Text style={[styles.invitedText, {
                          color: alreadyInvited.status === 'accepted' ? theme.colors.success :
                          alreadyInvited.status === 'declined' ? '#F44336' : theme.colors.warning
                        }]}>
                          {alreadyInvited.status === 'accepted' ? t('friends.accepted') :
                           alreadyInvited.status === 'declined' ? t('friends.declined') :
                           t('friends.invited')}
                        </Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.inviteBtn}
                        disabled={inviting === friend._id}
                        onPress={async () => {
                          setInviting(friend._id);
                          try {
                            await inviteToBooking({
                              bookingId: bookingId as Id<'bookings'>,
                              inviterId: userId as Id<'users'>,
                              inviteeId: friend._id as Id<'users'>,
                            });
                          } catch (e: any) {
                            Alert.alert(t('error'), e.message);
                          } finally {
                            setInviting(null);
                          }
                        }}
                      >
                        {inviting === friend._id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="paper-plane" size={13} color="#fff" />
                            <Text style={styles.inviteBtnText}>{t('friends.invite')}</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}

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
            <Ionicons name="home-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.homeBtnText}>{t('confirmation.backHome')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const CARD_WIDTH = Math.min(SCREEN_WIDTH - 40, 400);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  scroll: {
    paddingHorizontal: 20,
    alignItems: 'center',
  },

  // Icon
  iconWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 20, width: 100, height: 100 },
  iconGlowOuter: {
    position: 'absolute', width: 100, height: 100, borderRadius: 50,
    backgroundColor: theme.colors.redPrimary, opacity: 0.08,
  },
  iconGlow: {
    position: 'absolute', width: 80, height: 80, borderRadius: 40,
    backgroundColor: theme.colors.redPrimary, opacity: 0.15,
  },
  iconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 2.5, borderColor: theme.colors.redPrimary,
    alignItems: 'center', justifyContent: 'center',
    ...theme.shadow.red,
  },

  title: {
    fontSize: 26, fontWeight: '800', color: '#fff', marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14, color: theme.colors.textSecondary, marginBottom: 28,
    textAlign: 'center', lineHeight: 20,
  },

  // Card
  card: {
    width: '100%', maxWidth: CARD_WIDTH, padding: 22, borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    marginBottom: 28,
    ...theme.shadow.card,
  },
  roomName: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 4 },
  roomLocation: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 18 },
  divider: {
    height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border, marginVertical: 16,
  },

  // Info grid
  infoGrid: {
    flexDirection: 'row', marginBottom: 12,
  },
  infoItem: { flex: 1, gap: 3 },
  infoIconRow: {
    marginBottom: 2,
  },
  infoLabel: {
    fontSize: 10, color: theme.colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1, fontWeight: '600',
  },
  infoVal: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Payment
  paymentRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 20,
  },
  paymentLabel: {
    fontSize: 10, color: theme.colors.textMuted, textTransform: 'uppercase',
    letterSpacing: 1, fontWeight: '600',
  },
  paymentBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
  },
  paymentDot: { width: 6, height: 6, borderRadius: 3 },
  paymentText: { fontSize: 12, fontWeight: '700' },

  // QR
  qrWrap: { alignItems: 'center' },
  qrBox: {
    width: 150, height: 150, borderRadius: theme.radius.lg,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    marginBottom: 10,
  },
  bookingId: { fontSize: 12, color: theme.colors.textMuted, letterSpacing: 1.2, fontWeight: '500' },

  // Actions
  actions: {
    width: '100%', maxWidth: CARD_WIDTH,
    flexDirection: 'row', justifyContent: 'space-between',
    marginBottom: 28, paddingHorizontal: 8,
  },
  actionBtn: { alignItems: 'center', width: (CARD_WIDTH - 48) / 3 },
  actionIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: theme.colors.redSubtle,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  actionText: {
    fontSize: 11, color: theme.colors.textSecondary,
    textAlign: 'center', lineHeight: 14,
  },

  // Home button
  homeBtn: {
    width: '100%', maxWidth: CARD_WIDTH, paddingVertical: 16,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.redPrimary,
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row',
    ...theme.shadow.red,
  },
  homeBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // Invite friends
  inviteSection: {
    width: '100%', maxWidth: CARD_WIDTH, padding: 20, marginBottom: 24,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    ...theme.shadow.card,
  },
  inviteHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16,
  },
  inviteIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: theme.colors.redSubtle,
    alignItems: 'center', justifyContent: 'center',
  },
  inviteSectionTitle: { fontSize: 16, fontWeight: '800', color: '#fff', marginBottom: 2 },
  inviteSectionDesc: { fontSize: 12, color: theme.colors.textMuted },
  inviteCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  inviteAvatar: { width: 38, height: 38, borderRadius: 19 },
  inviteAvatarPlaceholder: {
    backgroundColor: theme.colors.redSubtle,
    alignItems: 'center', justifyContent: 'center',
  },
  inviteAvatarInitial: { fontSize: 14, fontWeight: '800', color: theme.colors.redPrimary },
  inviteName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#fff' },
  inviteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 18, backgroundColor: theme.colors.redPrimary,
  },
  inviteBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  invitedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  invitedText: { fontSize: 11, fontWeight: '600' },
});
