import React, { useMemo, useState } from 'react';
import { View, Text, Image, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';
import { useUser } from '../../UserContext';

/** Round avatar: photo, else the first letter (or a group icon). */
export function Avatar({ src, name, size = 40, group = false }: { src?: string | null; name: string; size?: number; group?: boolean }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      {src ? (
        <Image source={{ uri: src }} style={{ width: size, height: size }} />
      ) : group ? (
        <Ionicons name="people" size={size * 0.45} color={theme.colors.redLight} />
      ) : (
        <Text style={{ color: theme.colors.redLight, fontWeight: '700', fontSize: size * 0.4 }}>{(name || '?').charAt(0).toUpperCase()}</Text>
      )}
    </View>
  );
}

export const localeOf = (lang: string) => (lang === 'el' ? 'el-GR' : 'en-GB');

export function formatTime(ts: number, lang: string): string {
  const d = new Date(ts);
  const now = new Date();
  const locale = localeOf(lang);
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const days = (now.getTime() - ts) / 86_400_000;
  if (days < 6) return d.toLocaleDateString(locale, { weekday: 'short' });
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

/** Server error text (ConvexError data), else a generic one. */
export function errText(e: unknown, fallback: string): string {
  const d = (e as any)?.data;
  if (typeof d === 'string' && d && d !== 'KEY_CHANGED' && d !== 'DEVICES_CHANGED') return d;
  return fallback;
}

/** Bottom sheet with a title and a close button. */
export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} accessibilityLabel={t('msg.close')} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom }]}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={t('msg.close')}>
              <Ionicons name="close" size={24} color={theme.colors.bone} />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }}>{children}</ScrollView>
          {footer}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type Friend = { _id: string; name: string; avatar?: string };

/**
 * Players you follow each other with, with a search box. With `anyone` (a
 * new 1:1 chat) the search also finds every player; a message to someone who
 * doesn't follow you lands in their message requests. One tap picks a friend (`onPick`),
 * or with `selected` it is a multi-select.
 */
export function FriendPicker({
  exclude = [],
  selected,
  onToggle,
  onPick,
  anyone = false,
}: {
  anyone?: boolean;
  exclude?: string[];
  selected?: Set<string>;
  onToggle?: (id: string) => void;
  onPick?: (f: Friend) => void;
}) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { sessionToken } = useUser();
  const friends = useQuery(api.friends.listFriends, sessionToken ? { sessionToken } : 'skip');
  const [q, setQ] = useState('');
  const term = q.trim();
  const found = useQuery(
    api.friends.searchUsers,
    anyone && sessionToken && term.length >= 3 ? { sessionToken, searchTerm: term } : 'skip'
  ) as Friend[] | undefined;

  const list = useMemo(() => {
    const ex = new Set(exclude);
    const all = ((friends ?? []).filter(Boolean) as Friend[]).filter((f) => !ex.has(f._id));
    const needle = q.trim().toLowerCase();
    const mine = (needle ? all.filter((f) => f.name.toLowerCase().includes(needle)) : all).sort((a, b) => a.name.localeCompare(b.name));
    const seen = new Set(mine.map((f) => f._id));
    const others = (found ?? []).filter((f) => !seen.has(f._id) && !ex.has(f._id)).map((f) => ({ ...f, avatar: f.avatar ?? '' }));
    return [...mine, ...others];
  }, [friends, exclude, q, found]);

  if (friends === undefined) return <ActivityIndicator color={theme.colors.redPrimary} style={{ margin: 24 }} />;

  if (friends.filter(Boolean).length === 0 && !anyone) {
    return (
      <View style={{ padding: 24, alignItems: 'center', gap: 14 }}>
        <Text style={styles.muted}>{t('msg.no_mutual')}</Text>
        <TouchableOpacity style={styles.btn} onPress={() => navigation.navigate('Friends')}>
          <Text style={styles.btnText}>{t('people.find')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.search}>
        <Ionicons name="search" size={16} color={theme.colors.textMuted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={anyone ? t('msg.search_players') : t('msg.search_friends')}
          placeholderTextColor={theme.colors.textMuted}
          style={styles.searchInput}
          autoCorrect={false}
        />
      </View>
      {list.length === 0 ? (
        <Text style={[styles.muted, { padding: 20 }]}>{exclude.length ? t('msg.everyone_added') : anyone && term.length < 3 ? t('msg.search_players_hint') : '—'}</Text>
      ) : (
        list.map((f) => {
          const on = selected?.has(f._id);
          return (
            <TouchableOpacity
              key={f._id}
              style={styles.row}
              onPress={() => (onToggle ? onToggle(f._id) : onPick?.(f))}
              accessibilityRole={onToggle ? 'checkbox' : 'button'}
              accessibilityState={onToggle ? { checked: !!on } : undefined}
            >
              <Avatar src={f.avatar} name={f.name} />
              <Text style={styles.rowName} numberOfLines={1}>{f.name}</Text>
              {onToggle && (
                <View style={[styles.check, on && styles.checkOn]}>
                  {on && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
              )}
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );
}

export const chatStyles = StyleSheet.create({
  btn: { backgroundColor: theme.colors.redPrimary, borderRadius: theme.radius.lg, paddingHorizontal: 20, height: 44, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnGhost: { borderWidth: 1, borderColor: theme.colors.glassBorder, borderRadius: theme.radius.lg, paddingHorizontal: 20, height: 44, alignItems: 'center', justifyContent: 'center' },
  btnGhostText: { color: theme.colors.bone, fontWeight: '600', fontSize: 14 },
  input: {
    backgroundColor: theme.colors.bgPrimary, borderWidth: 1, borderColor: theme.colors.glassBorder, borderRadius: theme.radius.lg,
    color: theme.colors.textPrimary, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
  },
});

const styles = StyleSheet.create({
  ...chatStyles,
  avatar: { backgroundColor: theme.colors.bgPrimary, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sheetWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: { maxHeight: '88%', backgroundColor: theme.colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderWidth: 1, borderColor: theme.colors.border },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  sheetTitle: { color: theme.colors.bone, fontSize: 17, fontWeight: '700' },
  muted: { color: theme.colors.textSecondary, fontSize: 14, textAlign: 'center' },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, paddingHorizontal: 12, height: 42,
    backgroundColor: theme.colors.bgPrimary, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  searchInput: { flex: 1, color: theme.colors.textPrimary, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  rowName: { flex: 1, color: theme.colors.textPrimary, fontSize: 15, fontWeight: '500' },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: theme.colors.textMuted, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: theme.colors.redPrimary, borderColor: theme.colors.redPrimary },
});
