import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';
import { useUser } from '../../UserContext';
import { RootStackParamList } from '../../types';
import { previewText, useChatDevice } from '../../chat/useChat';
import { Avatar, FriendPicker, Sheet, chatStyles, errText, formatTime } from './chatUi';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * End-to-end encrypted messages (convex/messages.ts), like the website's
 * /messages: direct chats with friends and groups. `to` opens (or starts)
 * the direct chat with that friend.
 */
export default function MessagesScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'Messages'>>();
  const insets = useSafeAreaInsets();
  const { t, language } = useTranslation();
  const { userId, sessionToken } = useUser();
  const { device, error } = useChatDevice();
  const startDirect = useMutation(api.messages.startDirect);
  const [newMode, setNewMode] = useState<'direct' | 'group' | null>(null);
  const [startErr, setStartErr] = useState('');
  const startedFor = useRef('');

  const list = useQuery(
    api.messages.listConversations,
    sessionToken && device ? { sessionToken, deviceId: device.deviceId } : 'skip'
  );

  // Opened from a profile's "Message" button.
  const to = route.params?.to;
  useEffect(() => {
    if (!to || !sessionToken || startedFor.current === to) return;
    startedFor.current = to;
    startDirect({ sessionToken, userId: to as any })
      .then((id) => navigation.replace('Chat', { conversationId: id }))
      .catch((e) => setStartErr(errText(e, t('msg.send_failed'))));
  }, [to, sessionToken, startDirect, navigation, t]);

  const previews = useMemo(() => {
    const out: Record<string, string> = {};
    if (!list || !device || !userId) return out;
    for (const c of list) {
      const text = previewText(device, userId, c as any);
      if (text !== null) out[c._id] = (c.lastMessage?.senderId === userId ? `${t('msg.you')}: ` : '') + text.replace(/\s+/g, ' ');
    }
    return out;
  }, [list, device, userId, t]);

  const open = (id: string) => navigation.navigate('Chat', { conversationId: id });

  let body: React.ReactNode;
  if (error) {
    body = <Text style={styles.center}>{t('msg.unsupported')}</Text>;
  } else if (!device || (to && !startErr)) {
    body = (
      <View style={styles.centerBox}>
        <Ionicons name="lock-closed" size={24} color={theme.colors.success} />
        <Text style={styles.muted}>{t('msg.securing')}</Text>
      </View>
    );
  } else if (list === undefined) {
    body = <ActivityIndicator color={theme.colors.redPrimary} style={{ marginTop: 40 }} />;
  } else if (list.length === 0) {
    body = (
      <View style={styles.centerBox}>
        <Ionicons name="chatbubbles-outline" size={40} color={theme.colors.redLight} />
        <Text style={styles.muted}>{startErr || t('msg.empty_list')}</Text>
        <TouchableOpacity style={chatStyles.btn} onPress={() => setNewMode('direct')}>
          <Text style={chatStyles.btnText}>{t('msg.new_chat')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={chatStyles.btnGhost} onPress={() => setNewMode('group')}>
          <Text style={chatStyles.btnGhostText}>{t('msg.new_group')}</Text>
        </TouchableOpacity>
      </View>
    );
  } else {
    body = (
      <FlatList
        data={list}
        keyExtractor={(c) => c._id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        ListHeaderComponent={
          <>
            {!!startErr && <Text style={[styles.muted, { padding: 12 }]}>{startErr}</Text>}
            <View style={styles.e2e}>
              <Ionicons name="lock-closed" size={12} color={theme.colors.success} />
              <Text style={styles.e2eText}>{t('msg.e2e_long')}</Text>
            </View>
          </>
        }
        renderItem={({ item: c }) => {
          const preview = previews[c._id] ?? (c.lastMessage?.kind === 'text' ? t('msg.preview_encrypted') : '');
          return (
            <TouchableOpacity style={styles.row} onPress={() => open(c._id)} accessibilityRole="button">
              <Avatar src={c.avatar} name={c.name} size={48} group={c.kind === 'group'} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.rowTop}>
                  <Text style={[styles.rowName, c.unread > 0 && styles.bold]} numberOfLines={1}>{c.name || t('msg.deleted_user')}</Text>
                  <Text style={styles.time}>{formatTime(c.lastMessageAt, language)}</Text>
                </View>
                <View style={styles.rowTop}>
                  <Text style={[styles.preview, c.unread > 0 && { color: theme.colors.textPrimary }]} numberOfLines={1}>{preview}</Text>
                  {c.unread > 0 && (
                    <View style={styles.badge}><Text style={styles.badgeText}>{c.unread > 99 ? '99+' : c.unread}</Text></View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel={t('profile.back')}>
          <Ionicons name="arrow-back" size={20} color={theme.colors.bone} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('msg.title')}</Text>
        {device && (
          <>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setNewMode('group')} accessibilityRole="button" accessibilityLabel={t('msg.new_group')}>
              <Ionicons name="people-outline" size={20} color={theme.colors.bone} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setNewMode('direct')} accessibilityRole="button" accessibilityLabel={t('msg.new_chat')}>
              <Ionicons name="create-outline" size={20} color={theme.colors.bone} />
            </TouchableOpacity>
          </>
        )}
      </View>
      {body}
      {newMode && (
        <NewChatSheet
          mode={newMode}
          onClose={() => setNewMode(null)}
          onOpen={(id) => {
            setNewMode(null);
            open(id);
          }}
        />
      )}
    </View>
  );
}

/** "New message" (pick one friend) or "New group" (name + several friends). */
function NewChatSheet({ mode, onClose, onOpen }: { mode: 'direct' | 'group'; onClose: () => void; onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const { sessionToken } = useUser();
  const startDirect = useMutation(api.messages.startDirect);
  const createGroup = useMutation(api.messages.createGroup);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!sessionToken) return null;

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setErr('');
    try {
      onOpen(await fn());
    } catch (e) {
      setErr(errText(e, t('msg.send_failed')));
      setBusy(false);
    }
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <Sheet
      title={mode === 'direct' ? t('msg.new_chat') : t('msg.new_group')}
      onClose={onClose}
      footer={
        <>
          {!!err && <Text style={styles.err}>{err}</Text>}
          {mode === 'group' && (
            <View style={styles.footer}>
              <Text style={[styles.muted, { flex: 1, textAlign: 'left' }]}>{t('msg.selected', { n: selected.size })}</Text>
              <TouchableOpacity
                style={[chatStyles.btn, (busy || !name.trim() || selected.size === 0) && { opacity: 0.5 }]}
                disabled={busy || !name.trim() || selected.size === 0}
                onPress={() => run(() => createGroup({ sessionToken, name, memberIds: [...selected] as any }))}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={chatStyles.btnText}>{t('msg.create_group')}</Text>}
              </TouchableOpacity>
            </View>
          )}
          {mode === 'direct' && busy && <ActivityIndicator color={theme.colors.redPrimary} style={{ margin: 12 }} />}
        </>
      }
    >
      {mode === 'group' && (
        <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>
          <Text style={styles.label}>{t('msg.group_name')}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            maxLength={60}
            placeholder={t('msg.group_name_placeholder')}
            placeholderTextColor={theme.colors.textMuted}
            style={chatStyles.input}
          />
        </View>
      )}
      <FriendPicker
        selected={mode === 'group' ? selected : undefined}
        onToggle={mode === 'group' ? toggle : undefined}
        onPick={mode === 'direct' ? (f) => !busy && run(() => startDirect({ sessionToken, userId: f._id as any })) : undefined}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  title: { flex: 1, fontFamily: theme.fonts.display, fontSize: 22, color: theme.colors.bone, marginLeft: 4 },
  center: { color: theme.colors.textSecondary, textAlign: 'center', padding: 30, fontSize: 14 },
  centerBox: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 30, marginTop: 40 },
  muted: { color: theme.colors.textSecondary, fontSize: 14, textAlign: 'center' },
  e2e: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 10 },
  e2eText: { color: theme.colors.success, fontSize: 11, opacity: 0.85, textAlign: 'center', flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowName: { flex: 1, color: theme.colors.textPrimary, fontSize: 15, fontWeight: '500' },
  bold: { fontWeight: '700', color: theme.colors.bone },
  time: { color: theme.colors.textMuted, fontSize: 11 },
  preview: { flex: 1, color: theme.colors.textMuted, fontSize: 13, marginTop: 2 },
  badge: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: theme.colors.redPrimary, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  label: { color: theme.colors.textMuted, fontSize: 13, marginBottom: 6 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: 1, borderTopColor: theme.colors.border },
  err: { color: theme.colors.redLight, fontSize: 13, paddingHorizontal: 16, paddingBottom: 8 },
});
