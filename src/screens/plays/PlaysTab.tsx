import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Alert, Share, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';
import { useUser } from '../../UserContext';
import { LEVELS, SITE, type Level, errorText, formatDay, formatEscape, uploadUri } from './shared';

export function LevelChip({ level }: { level: Level }) {
  const { t } = useTranslation();
  const s = LEVELS[level] ?? LEVELS.declared;
  return (
    <View style={[styles.chip, { backgroundColor: s.bg, borderColor: s.color + '55' }]}>
      <Ionicons name={s.icon as any} size={11} color={s.color} />
      <Text style={[styles.chipText, { color: s.color }]}>{t(`pl.level.${level}`)}</Text>
    </View>
  );
}

/** Pick a proof photo (camera or library) or a receipt screenshot, upload it, attach it. */
export function useProofPicker() {
  const { t } = useTranslation();
  const { sessionToken } = useUser();
  const genUrl = useMutation(api.users.generateUploadUrl);
  const attach = useMutation(api.plays.attachProof);
  const [busy, setBusy] = useState(false);

  const send = async (logId: string, kind: 'photo' | 'receipt', uri: string) => {
    setBusy(true);
    try {
      const url = await genUrl({ sessionToken: sessionToken ?? undefined });
      const storageId = await uploadUri(url, uri);
      await attach({ sessionToken: sessionToken!, logId: logId as any, storageId: storageId as any, kind });
      Alert.alert(t('pl.proof.sentTitle'), t('pl.proof.sent'));
    } catch (e) {
      Alert.alert(t('error'), errorText(e, t('pl.genericError')));
    } finally {
      setBusy(false);
    }
  };

  // No editing and full quality, so the photo keeps its date and place (EXIF) where the phone allows it.
  const fromLibrary = async (logId: string, kind: 'photo' | 'receipt') => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return Alert.alert(t('editProfile.permissionRequired'), t('editProfile.libraryPermission'));
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1, exif: true });
    if (!r.canceled && r.assets[0]) await send(logId, kind, r.assets[0].uri);
  };
  const fromCamera = async (logId: string) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return Alert.alert(t('editProfile.permissionRequired'), t('editProfile.cameraPermission'));
    const r = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.9, exif: true });
    if (!r.canceled && r.assets[0]) await send(logId, 'photo', r.assets[0].uri);
  };

  const choose = (logId: string) =>
    Alert.alert(t('pl.proof.title'), t('pl.proof.intro'), [
      { text: t('pl.proof.camera'), onPress: () => fromCamera(logId) },
      { text: t('pl.proof.photo'), onPress: () => fromLibrary(logId, 'photo') },
      { text: t('pl.proof.receipt'), onPress: () => fromLibrary(logId, 'receipt') },
      { text: t('cancel'), style: 'cancel' },
    ]);

  return { choose, busy };
}

/** Passport tab "Rooms played" (convex/plays.ts). */
export default function PlaysTab({ data, stampCount }: { data: any; stampCount: number }) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  if (!data) return <ActivityIndicator color={theme.colors.redPrimary} style={{ marginTop: 30 }} />;
  const waiting = data.plays.filter((p: any) => !p.counted && p.status !== 'rejected').length;

  return (
    <View style={{ gap: 12 }}>
      <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('AddPlay')}>
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={styles.addText}>{t('pl.add.button')}</Text>
      </TouchableOpacity>
      <View style={styles.legend}>
        {(['confirmed', 'verified', 'vouched', 'declared'] as Level[]).map((l) => <LevelChip key={l} level={l} />)}
      </View>
      <Text style={styles.hint}>{t('pl.levels_hint')}</Text>

      {data.requests.length > 0 && <VouchRequests requests={data.requests} />}

      <View style={styles.stats}>
        {[[stampCount, t('pl.count.confirmed')], [data.counted, t('pl.count.verified')], [waiting, t('pl.count.waiting')]].map(([v, l]) => (
          <View key={String(l)} style={styles.stat}>
            <Text style={styles.statNum}>{v}</Text>
            <Text style={styles.statLabel}>{l}</Text>
          </View>
        ))}
      </View>

      {data.plays.length === 0 ? (
        <View style={styles.emptyBox}><Text style={styles.hint}>{t('pl.empty')}</Text></View>
      ) : (
        data.plays.map((p: any) => <PlayRow key={p._id} p={p} />)
      )}

      {data.inboundEmail ? (
        <View style={styles.emailBox}>
          <Ionicons name="mail-outline" size={16} color={theme.colors.gold} />
          <Text style={[styles.hint, { flex: 1 }]} selectable>{t('pl.email_hint', { email: data.inboundEmail })}</Text>
        </View>
      ) : null}
    </View>
  );
}

function PlayRow({ p }: { p: any }) {
  const { t, language } = useTranslation();
  const navigation = useNavigation<any>();
  const { sessionToken } = useUser();
  const remove = useMutation(api.plays.removePlay);
  const { choose, busy } = useProofPicker();
  const [asking, setAsking] = useState(false);

  const onRemove = () =>
    Alert.alert(t('pl.remove'), t('pl.remove_confirm', { room: p.title }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('pl.remove'),
        style: 'destructive',
        onPress: async () => {
          try {
            await remove({ sessionToken: sessionToken!, logId: p._id });
          } catch (e) {
            Alert.alert(t('error'), errorText(e, t('pl.genericError')));
          }
        },
      },
    ]);

  const shareClaim = () =>
    Share.share({ message: t('pl.invite_message', { room: p.title, link: `${SITE}/played/${p.communityRoomId}` }) }).catch(() => {});

  return (
    <View style={styles.row}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            <Text
              style={styles.rowTitle}
              onPress={
                p.roomId
                  ? () => navigation.navigate('RoomDetails', { id: p.roomId })
                  : p.communityRoomId
                    ? () => navigation.navigate('PlayedRoom', { id: p.communityRoomId })
                    : undefined
              }
            >
              {p.title}
            </Text>
            <LevelChip level={p.status} />
          </View>
          <Text style={styles.rowMeta}>
            {[p.company, p.city, formatDay(p.playedOn, language)].filter(Boolean).join(' · ')}
            {' · '}
            {p.escaped ? t('pl.escaped_in', { time: formatEscape(p.escapeSeconds) }) : t('pl.trapped')}
          </Text>
          {p.status === 'vouched' && p.vouchedByName ? <Text style={[styles.note, { color: LEVELS.vouched.color }]}>{t('pl.vouched_by', { name: p.vouchedByName })}</Text> : null}
          {p.status === 'pending' ? <Text style={[styles.note, { color: LEVELS.pending.color }]}>{p.roomId ? t('pl.pending_company') : t('pl.pending_team')}</Text> : null}
          {p.status === 'rejected' && p.reviewNote ? <Text style={[styles.note, { color: LEVELS.rejected.color }]}>{p.reviewNote}</Text> : null}
          {p.communityStatus === 'pending' ? <Text style={styles.note}>{t('pl.community_pending')}</Text> : null}
        </View>
        {p.proofUrl ? <Image source={{ uri: p.proofUrl }} style={styles.proofImg} /> : null}
      </View>

      {!p.counted && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.action} onPress={() => choose(p._id)} disabled={busy}>
            {busy ? <ActivityIndicator size="small" color={theme.colors.bone} /> : <Ionicons name="cloud-upload-outline" size={14} color={theme.colors.bone} />}
            <Text style={styles.actionText}>{p.proofUrl || p.hasEmailProof ? t('pl.change_proof') : t('pl.add_proof')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.action} onPress={() => setAsking(true)}>
            <Ionicons name="person-add-outline" size={14} color={theme.colors.bone} />
            <Text style={styles.actionText}>{t('pl.ask_vouch')}</Text>
          </TouchableOpacity>
          {p.communityRoomId ? (
            <TouchableOpacity style={styles.action} onPress={shareClaim}>
              <Ionicons name="share-outline" size={14} color={theme.colors.bone} />
              <Text style={styles.actionText}>{t('pl.invite_room')}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={[styles.action, { backgroundColor: 'transparent' }]} onPress={onRemove}>
            <Ionicons name="trash-outline" size={14} color={theme.colors.textMuted} />
            <Text style={[styles.actionText, { color: theme.colors.textMuted }]}>{t('pl.remove')}</Text>
          </TouchableOpacity>
        </View>
      )}
      <AskVouchModal visible={asking} logId={p._id} onClose={() => setAsking(false)} />
    </View>
  );
}

function AskVouchModal({ visible, logId, onClose }: { visible: boolean; logId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { sessionToken } = useUser();
  const friends = useQuery(api.friends.listFriends, visible && sessionToken ? { sessionToken } : 'skip');
  const ask = useMutation(api.plays.askVouch);
  const [team, setTeam] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      await ask({ sessionToken: sessionToken!, logId: logId as any, teammateIds: team as any });
      setTeam([]);
      onClose();
      Alert.alert(t('pl.asked'));
    } catch (e) {
      Alert.alert(t('error'), errorText(e, t('pl.genericError')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetBack}>
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{t('pl.ask_vouch')}</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel={t('pl.close')}><Ionicons name="close" size={22} color={theme.colors.textSecondary} /></TouchableOpacity>
          </View>
          <Text style={styles.hint}>{t('pl.ask_vouch_hint')}</Text>
          <ScrollView style={{ maxHeight: 300, marginTop: 12 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {friends === undefined ? <ActivityIndicator color={theme.colors.redPrimary} /> : null}
            {friends && friends.length === 0 ? <Text style={styles.hint}>{t('pl.no_mutual')}</Text> : null}
            {(friends ?? []).map((f: any) => {
              const on = team.includes(f._id);
              return (
                <TouchableOpacity key={f._id} onPress={() => setTeam((s) => (on ? s.filter((x) => x !== f._id) : [...s, f._id]))} style={[styles.friend, on && styles.friendOn]}>
                  <Text style={[styles.friendText, on && { color: '#fff' }]}>{f.name}</Text>
                  {on ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity style={[styles.addBtn, { marginTop: 16, opacity: busy || !team.length ? 0.5 : 1 }]} disabled={busy || !team.length} onPress={send}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.addText}>{t('pl.send_request')}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function VouchRequests({ requests }: { requests: any[] }) {
  const { t, language } = useTranslation();
  const { sessionToken } = useUser();
  const answer = useMutation(api.plays.answerVouch);
  const go = async (logId: string, accept: boolean) => {
    try {
      await answer({ sessionToken: sessionToken!, logId: logId as any, accept });
    } catch (e) {
      Alert.alert(t('error'), errorText(e, t('pl.genericError')));
    }
  };
  return (
    <View style={styles.requests}>
      <Text style={[styles.rowTitle, { color: '#ddd6fe' }]}>{t('pl.requests')}</Text>
      {requests.map((r) => (
        <View key={r.logId} style={{ gap: 8, marginTop: 8 }}>
          <Text style={styles.hint}>{t('pl.request_line', { name: r.ownerName, room: r.title, date: formatDay(r.playedOn, language) })}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={[styles.action, { backgroundColor: 'rgba(52,211,153,0.15)' }]} onPress={() => go(r.logId, true)}>
              <Ionicons name="checkmark" size={14} color="#6ee7b7" />
              <Text style={[styles.actionText, { color: '#6ee7b7' }]}>{t('pl.request_yes')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.action} onPress={() => go(r.logId, false)}>
              <Ionicons name="close" size={14} color={theme.colors.textSecondary} />
              <Text style={[styles.actionText, { color: theme.colors.textSecondary }]}>{t('pl.request_no')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 11, fontWeight: '700' },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 12, backgroundColor: theme.colors.redPrimary },
  addText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  hint: { color: theme.colors.textSecondary, fontSize: 12, lineHeight: 17 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.4)' },
  statNum: { fontSize: 20, fontWeight: '800', color: theme.colors.bone },
  statLabel: { fontSize: 11, color: theme.colors.textMuted },
  emptyBox: { borderWidth: 1, borderStyle: 'dashed', borderColor: theme.colors.border, borderRadius: 12, padding: 18, alignItems: 'center' },
  emailBox: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  row: { backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', padding: 12 },
  rowTitle: { color: theme.colors.bone, fontWeight: '700', fontSize: 15 },
  rowMeta: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 3 },
  note: { color: theme.colors.textMuted, fontSize: 12, marginTop: 4 },
  proofImg: { width: 48, height: 48, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)' },
  actionText: { color: theme.colors.bone, fontSize: 12, fontWeight: '600' },
  requests: { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(167,139,250,0.35)', backgroundColor: 'rgba(167,139,250,0.06)', padding: 12 },
  sheetBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 34 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { color: theme.colors.bone, fontSize: 18, fontWeight: '800' },
  friend: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  friendOn: { backgroundColor: 'rgba(212,20,31,0.25)', borderColor: theme.colors.redPrimary },
  friendText: { color: theme.colors.textSecondary, fontSize: 13 },
});
