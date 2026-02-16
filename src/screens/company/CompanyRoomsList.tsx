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

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Props {
  companyId: string;
}

export default function CompanyRoomsList({ companyId }: Props) {
  const navigation = useNavigation<Nav>();
  const rooms = useQuery(api.companies.getRooms, {
    companyId: companyId as Id<"companies">,
  });
  const deleteRoom = useMutation(api.companies.deleteRoom);
  const updateRoom = useMutation(api.companies.updateRoom);

  const handleDelete = (roomId: string, title: string) => {
    Alert.alert('Delete Room', `Are you sure you want to delete "${title}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
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
        <Text style={styles.headerTitle}>My Rooms</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate('CompanyRoomEditor', {})}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {!rooms || rooms.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="cube-outline" size={56} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>No Rooms Yet</Text>
            <Text style={styles.emptyText}>Tap + to add your first escape room</Text>
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
                          <Text style={styles.subBadgeText}>Sub Only</Text>
                        </View>
                      )}
                      <View style={[styles.statusDot, { backgroundColor: isActive ? theme.colors.success : theme.colors.textMuted }]} />
                    </View>
                  </View>

                  <Text style={styles.roomLocation}>{room.location}</Text>
                  <View style={styles.roomMeta}>
                    <Text style={styles.roomMetaText}>{room.theme}</Text>
                    <Text style={styles.roomMetaText}>{room.duration}min</Text>
                    <Text style={styles.roomMetaText}>{room.pricePerGroup?.length ? `$${Math.min(...room.pricePerGroup.map((g: any) => g.price))}-$${Math.max(...room.pricePerGroup.map((g: any) => g.price))}` : `$${room.price}/person`}</Text>
                    <Text style={styles.roomMetaText}>
                      {room.paymentTerms === 'deposit_20' ? '20% deposit' : 'Full payment'}
                    </Text>
                    {room.operatingDays && (
                      <Text style={styles.roomMetaText}>
                        {room.operatingDays.map((d: number) => ['Su','Mo','Tu','We','Th','Fr','Sa'][d]).join(',')}
                      </Text>
                    )}
                    {room.defaultTimeSlots && (
                      <Text style={styles.roomMetaText}>
                        {room.defaultTimeSlots.length} slots
                      </Text>
                    )}
                  </View>

                  <View style={styles.roomActions}>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => navigation.navigate('CompanyRoomEditor', { roomId: room._id })}
                    >
                      <Ionicons name="create-outline" size={16} color={theme.colors.redPrimary} />
                      <Text style={styles.actionText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => navigation.navigate('CompanyAvailability', { roomId: room._id, roomTitle: room.title })}
                    >
                      <Ionicons name="calendar-outline" size={16} color="#42A5F5" />
                      <Text style={styles.actionText}>Slots</Text>
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
                      <Text style={styles.actionText}>{isActive ? 'Pause' : 'Activate'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => handleDelete(room._id, room.title)}
                    >
                      <Ionicons name="trash-outline" size={16} color="#F44336" />
                      <Text style={[styles.actionText, { color: '#F44336' }]}>Delete</Text>
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
