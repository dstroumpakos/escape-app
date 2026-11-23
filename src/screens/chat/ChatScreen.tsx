import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform, AppState, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';
import { useUser } from '../../UserContext';
import { RootStackParamList } from '../../types';
import { useChatDevice, useConversationKeys } from '../../chat/useChat';
import { securityCode } from '../../chat/crypto';
import { Avatar, FriendPicker, Sheet, chatStyles, errText, localeOf } from './chatUi';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const MAX_TEXT = 2000;

type Msg = {
  _id: string;
  senderId: string;
  kind: 'text' | 'event';
  keyVersion: number | null;
  iv: string | null;
  ciphertext: string | null;
  event: { type: string; userIds?: string[] } | null;
  createdAt: number;
};

/** One encrypted chat (escape-web components/chat/ConversationView.tsx). */
export default function ChatScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'Chat'>>();
  const conversationId = route.params.conversationId;
  const insets = useSafeAreaInsets();
  const { t, language } = useTranslation();
  const { userId, sessionToken: token } = useUser();
  const { device, error } = useChatDevice();

  const conv = useQuery(api.messages.getConversation, token ? { sessionToken: token, conversationId: conversationId as any } : 'skip');
  const { results, status, loadMore } = usePaginatedQuery(
    api.messages.listMessages,
    token ? { sessionToken: token, conversationId: conversationId as any } : 'skip',
    { initialNumItems: 40 }
  );
  const keys = useConversationKeys(conversationId, device);
  const markRead = useMutation(api.messages.markRead);
  const acceptRequest = useMutation(api.messages.acceptMessageRequest);
  const declineRequest = useMutation(api.messages.declineMessageRequest);
  const [answering, setAnswering] = useState(false);

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [showInfo, setShowInfo] = useState(false);

  // Newest first: the list is inverted, so the newest sits at the bottom.
  const messages = results as Msg[];
  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of conv?.members ?? []) m.set(p._id, p.name);
    return m;
  }, [conv?.members]);

  // Decrypt what we can (again when a new key arrives).
  const { decrypt, keysTick } = keys;
  const plain = useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const m of messages) if (m.kind === 'text') out[m._id] = decrypt(m);
    return out;
  }, [messages, decrypt, keysTick]);

  // Mark read when new messages arrive while the chat is open.
  const newest = messages.length ? messages[0].createdAt : 0;
  useEffect(() => {
    if (token && newest && AppState.currentState === 'active') {
      markRead({ sessionToken: token, conversationId: conversationId as any }).catch(() => {});
    }
  }, [newest, token, conversationId, markRead]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setErr('');
    try {
      await keys.send(body);
      setText('');
    } catch (e) {
      setErr(errText(e, t('msg.send_failed')));
    } finally {
      setSending(false);
    }
  };

  const nameOf = (id: string) => (id === userId ? t('msg.you') : names.get(id) || t('msg.deleted_user'));

  const eventText = (m: Msg) => {
    const type = m.event?.type;
    if (!type || !['created', 'added', 'removed', 'left', 'renamed'].includes(type)) return '';
    const who = (m.event?.userIds ?? []).map(nameOf).join(', ');
    return t(`msg.ev_${type}${m.senderId === userId ? '_me' : ''}`, { name: nameOf(m.senderId), who });
  };

  const locale = localeOf(language);
  const dayOf = (ts: number) => new Date(ts).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });

  const isGroup = conv?.kind === 'group';
  const blocked = !!conv?.blocked;
  // A message request: someone I don't follow wrote first. Accept to reply, or delete.
  const isRequest = (conv as any)?.request === 'pending';
  const awaiting = !!(conv as any)?.awaiting;
  const answer = async (accept: boolean) => {
    if (!token) return;
    setAnswering(true);
    setErr('');
    try {
      if (accept) await acceptRequest({ sessionToken: token, conversationId: conversationId as any });
      else {
        await declineRequest({ sessionToken: token, conversationId: conversationId as any });
        navigation.goBack();
      }
    } catch (e) {
      setErr(errText(e, t('msg.send_failed')));
    }
    setAnswering(false);
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel={t('profile.back')}>
        <Ionicons name="arrow-back" size={20} color={theme.colors.bone} />
      </TouchableOpacity>
      {conv ? (
        <>
          <TouchableOpacity
            style={styles.headMain}
            disabled={!conv.otherUserId}
            onPress={() => conv.otherUserId && navigation.navigate('PlayerProfile', { userId: conv.otherUserId })}
          >
            <Avatar src={conv.avatar} name={conv.name} group={isGroup} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.headName} numberOfLines={1}>{conv.name || t('msg.deleted_user')}</Text>
              <View style={styles.e2eRow}>
                <Ionicons name="lock-closed" size={10} color={theme.colors.success} />
                <Text style={styles.e2eText} numberOfLines={1}>
                  {isGroup ? `${t('msg.members', { n: conv.members.length })} · ` : ''}{t('msg.e2e')}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setShowInfo(true)} accessibilityRole="button" accessibilityLabel={t('msg.info')}>
            <Ionicons name="information-circle-outline" size={22} color={theme.colors.bone} />
          </TouchableOpacity>
        </>
      ) : (
        <View style={{ flex: 1 }} />
      )}
    </View>
  );

  if (conv === null) {
    return (
      <View style={styles.container}>
        {header}
        <Text style={styles.center}>{t('msg.not_found')}</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.container}>
        {header}
        <Text style={styles.center}>{t('msg.unsupported')}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {header}
      <FlatList
        inverted
        data={messages}
        keyExtractor={(m) => m._id}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12 }}
        onEndReached={() => status === 'CanLoadMore' && loadMore(40)}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          status === 'LoadingFirstPage' ? (
            <ActivityIndicator color={theme.colors.textMuted} style={{ marginTop: 30 }} />
          ) : (
            <Text style={[styles.center, { transform: [{ scaleY: -1 }] }]}>{t('msg.no_messages')}</Text>
          )
        }
        ListFooterComponent={status === 'LoadingMore' ? <ActivityIndicator color={theme.colors.textMuted} style={{ margin: 10 }} /> : undefined}
        renderItem={({ item: m, index }) => {
          const older = messages[index + 1];
          const newDay = !older || new Date(older.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
          const dayLabel = newDay ? <Text style={styles.day}>{dayOf(m.createdAt)}</Text> : null;
          if (m.kind === 'event') {
            return (
              <View>
                {dayLabel}
                <Text style={styles.event}>{eventText(m)}</Text>
              </View>
            );
          }
          const mine = m.senderId === userId;
          const firstOfRun = !older || older.senderId !== m.senderId || older.kind !== 'text' || newDay;
          const body = plain[m._id];
          const time = new Date(m.createdAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
          return (
            <View>
              {dayLabel}
              <View style={[styles.bubbleRow, mine ? styles.right : styles.left, firstOfRun && { marginTop: 6 }]}>
                {isGroup && !mine && firstOfRun && <Text style={styles.sender}>{nameOf(m.senderId)}</Text>}
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  {body === null || body === undefined ? (
                    <View style={styles.noKey}>
                      <Ionicons name="lock-closed" size={12} color={mine ? '#fff' : theme.colors.textMuted} />
                      <Text style={[styles.noKeyText, mine && { color: 'rgba(255,255,255,0.8)' }]}>{t('msg.no_key')}</Text>
                    </View>
                  ) : (
                    <Text style={[styles.bubbleText, mine && { color: '#fff' }]} selectable>{body}</Text>
                  )}
                  <Text style={[styles.bubbleTime, mine && { color: 'rgba(255,255,255,0.7)' }]}>{time}</Text>
                </View>
              </View>
            </View>
          );
        }}
      />

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        {blocked ? (
          <Text style={styles.center}>{t('msg.blocked')}</Text>
        ) : isRequest ? (
          <View style={{ alignItems: 'center', gap: 6, paddingBottom: 4 }}>
            <Text style={[chatStyles.btnGhostText, { fontWeight: '700', textAlign: 'center' }]}>{t('msg.request_title', { name: conv?.name || '' })}</Text>
            <Text style={styles.center}>{t('msg.request_desc')}</Text>
            {!!err && <Text style={styles.err}>{err}</Text>}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <TouchableOpacity style={chatStyles.btnGhost} onPress={() => answer(false)} disabled={answering} accessibilityRole="button">
                <Text style={chatStyles.btnGhostText}>{t('msg.request_delete')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={chatStyles.btn} onPress={() => answer(true)} disabled={answering} accessibilityRole="button">
                {answering ? <ActivityIndicator size="small" color="#fff" /> : <Text style={chatStyles.btnText}>{t('msg.request_accept')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {awaiting && <Text style={[styles.center, { marginBottom: 6 }]}>{t('msg.awaiting_desc')}</Text>}
            {!!err && <Text style={styles.err}>{err}</Text>}
            <View style={styles.inputRow}>
              <TextInput
                value={text}
                onChangeText={(v) => setText(v.slice(0, MAX_TEXT))}
                placeholder={keys.ready ? t('msg.placeholder') : t('msg.securing')}
                placeholderTextColor={theme.colors.textMuted}
                editable={keys.ready}
                multiline
                style={styles.input}
                accessibilityLabel={t('msg.placeholder')}
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!keys.ready || sending || !text.trim()) && { opacity: 0.4 }]}
                onPress={send}
                disabled={!keys.ready || sending || !text.trim()}
                accessibilityRole="button"
                accessibilityLabel={t('msg.send')}
              >
                {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {showInfo && conv && (
        <ChatInfo
          conversation={conv as any}
          devices={keys.devices}
          onClose={() => setShowInfo(false)}
          onLeft={() => {
            setShowInfo(false);
            navigation.goBack();
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
}

type Member = { _id: string; name: string; avatar: string; role: 'admin' | 'member'; isMe: boolean; deleted: boolean };

/** Members, security codes, and (for group admins) rename / add / remove. Everyone can leave a group. */
function ChatInfo({
  conversation,
  devices,
  onClose,
  onLeft,
}: {
  conversation: { _id: string; kind: 'direct' | 'group'; name: string; myRole: 'admin' | 'member'; members: Member[] };
  devices: { userId: string; publicKey: string }[];
  onClose: () => void;
  onLeft: () => void;
}) {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const { sessionToken } = useUser();
  const token = sessionToken ?? '';
  const rename = useMutation(api.messages.renameGroup);
  const addMembers = useMutation(api.messages.addMembers);
  const removeMember = useMutation(api.messages.removeMember);
  const leave = useMutation(api.messages.leaveGroup);

  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(conversation.name);
  const [adding, setAdding] = useState(false);
  const [toAdd, setToAdd] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const isGroup = conversation.kind === 'group';
  const isAdmin = isGroup && conversation.myRole === 'admin';
  const cid = conversation._id as any;

  const codes = useMemo(() => {
    const by = new Map<string, string[]>();
    for (const d of devices) by.set(d.userId, [...(by.get(d.userId) ?? []), d.publicKey]);
    const out: Record<string, string> = {};
    for (const [uid, k] of by) out[uid] = securityCode(k);
    return out;
  }, [devices]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr('');
    try {
      await fn();
      return true;
    } catch (e) {
      setErr(errText(e, t('msg.send_failed')));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const confirm = (message: string, label: string, action: () => void) =>
    Alert.alert('', message, [
      { text: t('msg.cancel'), style: 'cancel' },
      { text: label, style: 'destructive', onPress: action },
    ]);

  return (
    <Sheet
      title={t('msg.info')}
      onClose={onClose}
      footer={
        adding ? (
          <View style={styles.sheetFooter}>
            <TouchableOpacity style={chatStyles.btnGhost} onPress={() => setAdding(false)}>
              <Text style={chatStyles.btnGhostText}>{t('msg.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[chatStyles.btn, (busy || toAdd.size === 0) && { opacity: 0.5 }]}
              disabled={busy || toAdd.size === 0}
              onPress={async () => {
                if (await run(() => addMembers({ sessionToken: token, conversationId: cid, userIds: [...toAdd] as any }))) {
                  setAdding(false);
                  setToAdd(new Set());
                }
              }}
            >
              <Text style={chatStyles.btnText}>{t('msg.add')}</Text>
            </TouchableOpacity>
          </View>
        ) : undefined
      }
    >
      {adding ? (
        <FriendPicker
          exclude={conversation.members.map((m) => m._id)}
          selected={toAdd}
          onToggle={(id) =>
            setToAdd((s) => {
              const n = new Set(s);
              if (n.has(id)) n.delete(id);
              else n.add(id);
              return n;
            })
          }
        />
      ) : (
        <View style={{ padding: 16, gap: 16 }}>
          <View style={styles.notice}>
            <Ionicons name="shield-checkmark" size={16} color={theme.colors.success} />
            <Text style={styles.noticeText}>{t('msg.e2e_long')}</Text>
          </View>

          {isGroup &&
            (editingName ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput value={name} onChangeText={setName} maxLength={60} style={[chatStyles.input, { flex: 1 }]} accessibilityLabel={t('msg.group_name')} />
                <TouchableOpacity
                  style={[chatStyles.btn, (busy || !name.trim()) && { opacity: 0.5 }]}
                  disabled={busy || !name.trim()}
                  onPress={async () => (await run(() => rename({ sessionToken: token, conversationId: cid, name }))) && setEditingName(false)}
                >
                  <Text style={chatStyles.btnText}>{t('msg.save')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={styles.groupName} numberOfLines={1}>{conversation.name}</Text>
                {isAdmin && (
                  <TouchableOpacity style={styles.linkBtn} onPress={() => setEditingName(true)}>
                    <Ionicons name="pencil" size={14} color={theme.colors.textMuted} />
                    <Text style={styles.linkText}>{t('msg.rename')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Text style={[styles.sectionTitle, { flex: 1 }]}>{t('msg.members', { n: conversation.members.length })}</Text>
              {isAdmin && (
                <TouchableOpacity style={styles.linkBtn} onPress={() => setAdding(true)}>
                  <Ionicons name="person-add" size={14} color={theme.colors.redLight} />
                  <Text style={[styles.linkText, { color: theme.colors.redLight }]}>{t('msg.add_members')}</Text>
                </TouchableOpacity>
              )}
            </View>
            {conversation.members.map((m) => (
              <View key={m._id} style={styles.member}>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}
                  disabled={m.deleted}
                  onPress={() => {
                    onClose();
                    navigation.navigate('PlayerProfile', { userId: m._id });
                  }}
                >
                  <Avatar src={m.avatar} name={m.name} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.memberName} numberOfLines={1}>
                        {m.deleted ? t('msg.deleted_user') : m.isMe ? `${m.name} (${t('msg.you')})` : m.name}
                      </Text>
                      {isGroup && m.role === 'admin' && <Text style={styles.adminTag}>{t('msg.admin')}</Text>}
                    </View>
                    {!!codes[m._id] && <Text style={styles.code}>{codes[m._id]}</Text>}
                  </View>
                </TouchableOpacity>
                {isAdmin && !m.isMe && (
                  <TouchableOpacity
                    disabled={busy}
                    style={{ padding: 6 }}
                    accessibilityLabel={`${t('msg.remove')} ${m.name}`}
                    onPress={() =>
                      confirm(t('msg.remove_confirm', { name: m.name }), t('msg.remove'), () =>
                        run(() => removeMember({ sessionToken: token, conversationId: cid, userId: m._id as any }))
                      )
                    }
                  >
                    <Ionicons name="person-remove-outline" size={18} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>

          <View>
            <Text style={styles.sectionTitle}>{t('msg.security_code')}</Text>
            <Text style={styles.help}>{t('msg.security_help')}</Text>
          </View>

          {!!err && <Text style={styles.err}>{err}</Text>}

          {isGroup && (
            <TouchableOpacity
              style={styles.leave}
              disabled={busy}
              onPress={() =>
                confirm(t('msg.leave_confirm'), t('msg.leave_group'), async () => {
                  if (await run(() => leave({ sessionToken: token, conversationId: cid }))) onLeft();
                })
              }
            >
              {busy ? <ActivityIndicator color={theme.colors.redLight} /> : <Ionicons name="log-out-outline" size={18} color={theme.colors.redLight} />}
              <Text style={{ color: theme.colors.redLight, fontWeight: '600' }}>{t('msg.leave_group')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  headMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  headName: { color: theme.colors.bone, fontSize: 16, fontWeight: '700' },
  iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  e2eRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  e2eText: { color: theme.colors.success, fontSize: 11, flexShrink: 1 },
  center: { color: theme.colors.textMuted, textAlign: 'center', padding: 24, fontSize: 14 },
  day: { color: theme.colors.textMuted, fontSize: 11, textAlign: 'center', paddingVertical: 8, textTransform: 'capitalize' },
  event: { color: theme.colors.textMuted, fontSize: 12, textAlign: 'center', paddingVertical: 4 },
  bubbleRow: { maxWidth: '82%', marginTop: 2 },
  left: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  right: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  sender: { color: theme.colors.redLight, fontSize: 11, marginBottom: 2, paddingHorizontal: 8 },
  bubble: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18 },
  bubbleMine: { backgroundColor: theme.colors.redPrimary, borderBottomRightRadius: 5 },
  bubbleTheirs: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderBottomLeftRadius: 5 },
  bubbleText: { color: theme.colors.textPrimary, fontSize: 15, lineHeight: 20 },
  bubbleTime: { color: theme.colors.textMuted, fontSize: 10, marginTop: 2, textAlign: 'right' },
  noKey: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noKeyText: { color: theme.colors.textMuted, fontSize: 13, fontStyle: 'italic', flexShrink: 1 },
  composer: { borderTopWidth: 1, borderTopColor: theme.colors.border, paddingHorizontal: 10, paddingTop: 10, backgroundColor: theme.colors.bgPrimary },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1, maxHeight: 130, minHeight: 42, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.glassBorder,
    borderRadius: 21, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, color: theme.colors.textPrimary, fontSize: 15,
  },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: theme.colors.redPrimary, alignItems: 'center', justifyContent: 'center' },
  err: { color: theme.colors.redLight, fontSize: 13, marginBottom: 6 },
  notice: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.bgPrimary },
  noticeText: { flex: 1, color: theme.colors.textSecondary, fontSize: 12 },
  groupName: { flex: 1, fontFamily: theme.fonts.display, fontSize: 19, color: theme.colors.bone },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 4 },
  linkText: { color: theme.colors.textMuted, fontSize: 13 },
  sectionTitle: { color: theme.colors.textMuted, fontSize: 13, fontWeight: '600', marginBottom: 4 },
  member: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  memberName: { color: theme.colors.textPrimary, fontSize: 15, fontWeight: '500', flexShrink: 1 },
  adminTag: {
    color: theme.colors.gold, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', borderWidth: 1, borderColor: 'rgba(201,154,46,0.4)',
    borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden',
  },
  code: { color: theme.colors.textMuted, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', letterSpacing: 1, marginTop: 2 },
  help: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 17 },
  leave: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(212,20,31,0.35)', borderRadius: theme.radius.lg, height: 46 },
  sheetFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: theme.colors.border },
});
