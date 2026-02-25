import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from 'convex/react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../../../convex/_generated/api';
import { theme } from '../../theme';
import { RootStackParamList } from '../../types';
import type { Id } from '../../../convex/_generated/dataModel';
import { useTranslation } from '../../i18n';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Props {
  companyId: string;
}

const PLAN_LABELS: Record<string, string> = { starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise' };

export default function CompanyRoomsList({ companyId }: Props) {
  const navigation = useNavigation<Nav>();
  const rooms = useQuery(api.companies.getRooms, {
    companyId: companyId as Id<"companies">,
  });
  const dashStats = useQuery(api.companies.getDashboardStats, {
    companyId: companyId as Id<"companies">,
  });
  const deleteRoom = useMutation(api.companies.deleteRoom);
  const updateRoom = useMutation(api.companies.updateRoom);
  const { t } = useTranslation();

  const roomCount = dashStats?.totalRooms ?? 0;
  const roomLimit = dashStats?.roomLimit ?? 1;
  const plan = dashStats?.plan ?? 'starter';
  const atLimit = roomLimit !== Infinity && roomCount >= roomLimit;
  const limitPct = roomLimit === Infinity ? 0 : Math.min((roomCount / roomLimit) * 100, 100);
  const limitColor = limitPct >= 100 ? '#F44336' : limitPct >= 75 ? '#FFA726' : theme.colors.success;

  const handleDelete = (roomId: string, title: string) => {
    Alert.alert(t('roomsList.deleteTitle'), t('roomsList.deleteMessage', { title }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'), style: 'destructive',
        onPress: async () => {
          await deleteRoom({ roomId: roomId as Id<"rooms"> });
        },
      },
    ]);
  };

  const toggleActive = async (roomId: string, currentlyActive: boolean) => {
    await updateRoom({
      roomId: roomId as Id<"rooms">,
      isActive: !currentlyActive,
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('roomsList.title')}</Text>
        {atLimit ? (
          <View style={[styles.addBtn, { backgroundColor: theme.colors.glass, borderWidth: 1, borderColor: theme.colors.glassBorder }]}>
            <Ionicons name="lock-closed" size={18} color={theme.colors.textMuted} />
          </View>
        ) : (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => navigation.navigate('CompanyRoomEditor', {})}
          >
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Room Limit Bar */}
      <View style={styles.limitBar}>
        <View style={styles.limitHeader}>
          <Text style={styles.limitLabel}>
            {roomCount} / {roomLimit === Infinity ? '∞' : roomLimit} Rooms
          </Text>
          <View style={[styles.planBadge, { backgroundColor: plan === 'enterprise' ? 'rgba(156,39,176,0.2)' : plan === 'pro' ? 'rgba(244,67,54,0.15)' : 'rgba(76,175,80,0.15)' }]}>
            <Ionicons
              name={plan === 'enterprise' ? 'trophy' : plan === 'pro' ? 'diamond' : 'rocket'}
              size={10}
              color={plan === 'enterprise' ? '#CE93D8' : plan === 'pro' ? '#F44336' : '#4CAF50'}
            />
            <Text style={[styles.planBadgeText, { color: plan === 'enterprise' ? '#CE93D8' : plan === 'pro' ? '#F44336' : '#4CAF50' }]}>
              {PLAN_LABELS[plan] || 'Starter'}
            </Text>
          </View>
        </View>
        {roomLimit !== Infinity && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${limitPct}%`, backgroundColor: limitColor }]} />
          </View>
        )}
        {atLimit && (
          <Text style={styles.limitWarning}>Room limit reached — upgrade your plan to add more</Text>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {!rooms || rooms.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="cube-outline" size={56} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>{t('roomsList.noRooms')}</Text>
            <Text style={styles.emptyText}>{t('roomsList.noRoomsHint')}</Text>
          </View>
        ) : (
          rooms.map((room: any) => {
            const isActive = room.isActive !== false;
            return (
              <View key={room._id} style={[styles.roomCard, !isActive && styles.roomCardInactive]}>
                <Image source={{ uri: room.image }} style={styles.roomImg} />
                <View style={styles.roomInfo}>
                  <View style={styles.roomTop}>
                    <Text style={styles.roomTitle} numberOfLines={1}>{room.title}</Text>
                    <View style={styles.statusRow}>
                      {room.isSubscriptionOnly && (
                        <View style={styles.subBadge}>
                          <Ionicons name="star" size={10} color="#FFD700" />
                          <Text style={styles.subBadgeText}>{t('roomsList.subOnly')}</Text>
                        </View>
                      )}
                      <View style={[styles.statusDot, { backgroundColor: isActive ? theme.colors.success : theme.colors.textMuted }]} />
                    </View>
                  </View>

                  <Text style={styles.roomLocation}>{room.location}</Text>
                  <View style={styles.roomMeta}>
                    <Text style={styles.roomMetaText}>{room.theme}</Text>
                    <Text style={styles.roomMetaText}>{room.duration}min</Text>
                    <Text style={styles.roomMetaText}>{room.pricePerGroup?.length ? `€${Math.min(...room.pricePerGroup.map((g: any) => g.price))}-€${Math.max(...room.pricePerGroup.map((g: any) => g.price))}` : `€${room.price}${t('perPerson')}`}</Text>
                    <Text style={styles.roomMetaText}>
                      {(Array.isArray(room.paymentTerms) ? room.paymentTerms : [room.paymentTerms || 'full']).map((pt: string) => pt === 'deposit_20' ? t('roomsList.deposit') : pt === 'pay_on_arrival' ? t('roomsList.payOnArrival') : t('roomsList.fullPayment')).join(' / ')}
                    </Text>
                    {room.operatingDays && (
                      <Text style={styles.roomMetaText}>
                        {room.operatingDays.map((d: number) => ['Su','Mo','Tu','We','Th','Fr','Sa'][d]).join(',')}
                      </Text>
                    )}
                    {room.defaultTimeSlots && (
                      <Text style={styles.roomMetaText}>
                        {t('roomsList.slots', { n: room.defaultTimeSlots.length })}
                      </Text>
                    )}
                  </View>

                  <View style={styles.roomActions}>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => navigation.navigate('CompanyRoomEditor', { roomId: room._id })}
                    >
                      <Ionicons name="create-outline" size={16} color={theme.colors.redPrimary} />
                      <Text style={styles.actionText}>{t('roomsList.edit')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => navigation.navigate('CompanyAvailability', { roomId: room._id, roomTitle: room.title })}
                    >
                      <Ionicons name="calendar-outline" size={16} color="#42A5F5" />
                      <Text style={styles.actionText}>{t('roomsList.slotsBtn')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => toggleActive(room._id, isActive)}
                    >
                      <Ionicons
                        name={isActive ? 'pause-circle-outline' : 'play-circle-outline'}
                        size={16}
                        color={isActive ? '#FFA726' : theme.colors.success}
                      />
                      <Text style={styles.actionText}>{isActive ? t('roomsList.pause') : t('roomsList.activate')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => handleDelete(room._id, room.title)}
                    >
                      <Ionicons name="trash-outline" size={16} color="#F44336" />
                      <Text style={[styles.actionText, { color: '#F44336' }]}>{t('delete')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },
  addBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: theme.colors.redPrimary,
    alignItems: 'center', justifyContent: 'center',
    ...theme.shadow.red,
  },

  limitBar: {
    marginHorizontal: 20, marginBottom: 16, padding: 14,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  limitHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 8,
  },
  limitLabel: { fontSize: 13, fontWeight: '700', color: '#fff' },
  planBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 3, paddingHorizontal: 10, borderRadius: 10,
  },
  planBadgeText: { fontSize: 10, fontWeight: '700' },
  progressTrack: {
    height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden' as const,
  },
  progressFill: { height: '100%' as any, borderRadius: 3 },
  limitWarning: {
    fontSize: 11, color: '#FFA726', marginTop: 8, fontWeight: '600',
  },

  empty: { alignItems: 'center', paddingTop: 100, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  emptyText: { fontSize: 14, color: theme.colors.textMuted },

  roomCard: {
    marginHorizontal: 20, marginBottom: 14,
    borderRadius: theme.radius.lg, overflow: 'hidden',
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  roomCardInactive: { opacity: 0.55 },
  roomImg: { width: '100%', height: 140 },
  roomInfo: { padding: 14 },
  roomTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 4,
  },
  roomTitle: { fontSize: 17, fontWeight: '700', color: '#fff', flex: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  subBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingVertical: 2, paddingHorizontal: 8, borderRadius: 10,
    backgroundColor: 'rgba(255,215,0,0.15)',
  },
  subBadgeText: { fontSize: 9, fontWeight: '700', color: '#FFD700' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  roomLocation: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 8 },
  roomMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  roomMetaText: {
    fontSize: 11, fontWeight: '600', color: theme.colors.textSecondary,
    paddingVertical: 3, paddingHorizontal: 10, borderRadius: 10,
    backgroundColor: theme.colors.glass, overflow: 'hidden',
  },
  roomActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 8, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  actionText: { fontSize: 11, fontWeight: '600', color: theme.colors.textSecondary },
});
