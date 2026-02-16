import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { theme } from '../theme';
import { useTranslation } from '../i18n';
import { useUser } from '../UserContext';
import type { Id } from '../../convex/_generated/dataModel';

type NotifType = 'booking' | 'cancelled' | 'reminder' | 'promo' | 'system' | 'slot_available';

const ICON_MAP: Record<NotifType, { name: keyof typeof Ionicons.glyphMap; color: string }> = {
  booking: { name: 'ticket', color: theme.colors.redPrimary },
  cancelled: { name: 'close-circle', color: '#F44336' },
  promo: { name: 'megaphone', color: '#F59E0B' },
  reminder: { name: 'alarm', color: '#3B82F6' },
  system: { name: 'information-circle', color: '#8B5CF6' },
  slot_available: { name: 'notifications', color: '#4CAF50' },
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function NotificationsScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { userId } = useUser();

  const notifications = useQuery(
    api.notifications.getByUser,
    userId ? { userId: userId as Id<"users"> } : 'skip',
  );
  const markAsReadMut = useMutation(api.notifications.markAsRead);
  const markAllReadMut = useMutation(api.notifications.markAllRead);

  const unreadCount = notifications?.filter(n => !n.read).length ?? 0;

  const handleMarkAllRead = () => {
    if (userId) {
      markAllReadMut({ userId: userId as Id<"users"> });
    }
  };

  const handleMarkAsRead = (id: Id<"notifications">) => {
    markAsReadMut({ id });
  };

  if (!userId || notifications === undefined) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.colors.redPrimary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('notifications.title')}</Text>
        {unreadCount > 0 ? (
          <TouchableOpacity onPress={handleMarkAllRead}>
            <Text style={styles.markAllText}>{t('notifications.markAllRead')}</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 80 }} />
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {notifications.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={48} color={theme.colors.textMuted} />
            <Text style={styles.emptyText}>{t('notifications.empty')}</Text>
          </View>
        ) : (
          notifications.map(notif => {
            const icon = ICON_MAP[notif.type as NotifType] || ICON_MAP.system;
            return (
              <TouchableOpacity
                key={notif._id}
                style={[styles.notifCard, !notif.read && styles.notifUnread]}
                activeOpacity={0.7}
                onPress={() => {
                  if (!notif.read) handleMarkAsRead(notif._id);
                }}
              >
                <View style={[styles.iconWrap, { backgroundColor: icon.color + '20' }]}>
                  <Ionicons name={icon.name as any} size={22} color={icon.color} />
                </View>
                <View style={styles.notifContent}>
                  <View style={styles.notifHeader}>
                    <Text style={styles.notifTitle} numberOfLines={1}>{notif.title}</Text>
                    {!notif.read && <View style={styles.unreadDot} />}
                  </View>
                  <Text style={styles.notifMessage} numberOfLines={2}>{notif.message}</Text>
                  <Text style={styles.notifTime}>{timeAgo(notif.createdAt)}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgPrimary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.glass,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
  },
  markAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.redPrimary,
  },
  scroll: {
    flex: 1,
    paddingHorizontal: 20,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: theme.colors.textMuted,
  },
  notifCard: {
    flexDirection: 'row',
    padding: 16,
    marginBottom: 10,
    borderRadius: 16,
    backgroundColor: theme.colors.glass,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    gap: 14,
  },
  notifUnread: {
    backgroundColor: 'rgba(220, 38, 38, 0.06)',
    borderColor: 'rgba(220, 38, 38, 0.15)',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifContent: {
    flex: 1,
    gap: 4,
  },
  notifHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notifTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.redPrimary,
    marginLeft: 8,
  },
  notifMessage: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  notifTime: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
});
