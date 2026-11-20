import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Image, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';
import { useUser } from '../../UserContext';
import { errorText, todayKey } from './shared';
import { useProofPicker } from './PlaysTab';

type Picked = { kind: 'room' | 'community' | 'new'; id?: string; title: string; company: string; city: string };
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Add a room I played: find it (or add a new one), the result, teammates, then a proof (convex/plays.ts). */
export default function AddPlayScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { sessionToken } = useUser();
  const [step, setStep] = useState<'find' | 'new' | 'details' | 'proof'>('find');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);
  const results = useQuery(api.plays.searchPlaces, debounced.length >= 2 ? { q: debounced, sessionToken: sessionToken ?? undefined } : 'skip');
  const friends = useQuery(api.friends.listFriends, sessionToken ? { sessionToken } : 'skip');

  const [picked, setPicked] = useState<Picked | null>(null);
  const [nr, setNr] = useState({ name: '', companyName: '', city: '', country: '', website: '' });
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [playedOn, setPlayedOn] = useState(todayKey());
  const [escaped, setEscaped] = useState(true);
  const [minutes, setMinutes] = useState('');
  const [hints, setHints] = useState('');
  const [team, setTeam] = useState<string[]>([]);
  const [logId, setLogId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const addPlay = useMutation(api.plays.addPlay);
  const { choose, busy: uploading } = useProofPicker();

  const back = () => {
    if (step === 'new' || step === 'details') setStep('find');
    else navigation.goBack();
  };

  const useMyLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const p = await Location.getCurrentPositionAsync({});
    setPin({ lat: p.coords.latitude, lng: p.coords.longitude });
  };

  const save = async () => {
    if (!picked || !sessionToken) return;
    if (!DAY_RE.test(playedOn)) return Alert.alert(t('error'), t('pl.details.date_bad'));
    setBusy(true);
    try {
      const m = escaped && minutes.trim() ? Number(minutes.replace(',', '.')) : undefined;
      const h = hints.trim() ? Number(hints) : undefined;
      const base = { sessionToken, playedOn, escaped, escapeMinutes: m, hintsUsed: h, teammateIds: team as any };
      const r =
        picked.kind === 'room'
          ? await addPlay({ ...base, roomId: picked.id as any })
          : picked.kind === 'community'
            ? await addPlay({ ...base, communityRoomId: picked.id as any })
            : await addPlay({
                ...base,
                community: { ...nr, website: nr.website || undefined, latitude: pin?.lat, longitude: pin?.lng },
              });
      setLogId(r.logId);
      setStep('proof');
    } catch (e) {
      Alert.alert(t('error'), errorText(e, t('pl.genericError')));
    } finally {
      setBusy(false);
    }
  };

  const newOk = nr.name.trim().length >= 2 && nr.city.trim().length >= 2 && nr.country.trim().length >= 2;
  const yesterday = todayKey(new Date(Date.now() - 86400000));

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={back} accessibilityLabel={t('pl.back')}>
          <Ionicons name="arrow-back" size={20} color={theme.colors.bone} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{step === 'proof' ? t('pl.proof.title') : t('pl.add.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60, gap: 12 }} keyboardShouldPersistTaps="handled">
        {step === 'find' && (
          <>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={16} color={theme.colors.textMuted} />
              <TextInput autoFocus value={q} onChangeText={setQ} placeholder={t('pl.add.search')} placeholderTextColor={theme.colors.textMuted} style={styles.searchInput} />
            </View>
            {debounced.length >= 2 && results === undefined ? <ActivityIndicator color={theme.colors.redPrimary} /> : null}
            {(results ?? []).map((r) => (
              <TouchableOpacity
                key={`${r.kind}${r.id}`}
                style={styles.result}
                onPress={() => {
                  setPicked({ kind: r.kind, id: r.id, title: r.title, company: r.company, city: r.city });
                  setStep('details');
                }}
              >
                {r.image ? <Image source={{ uri: r.image }} style={styles.resultImg} /> : <View style={[styles.resultImg, styles.center]}><Ionicons name="location-outline" size={18} color={theme.colors.textMuted} /></View>}
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultTitle} numberOfLines={1}>{r.title}</Text>
                  <Text style={styles.small} numberOfLines={1}>{[r.company, r.city].filter(Boolean).join(' · ')}</Text>
                </View>
                {r.kind === 'community' ? <Text style={styles.tag}>{t('pl.add.community')}</Text> : null}
              </TouchableOpacity>
            ))}
            {results && results.length === 0 ? <Text style={[styles.small, { textAlign: 'center' }]}>{t('pl.add.none')}</Text> : null}
            <TouchableOpacity
              style={styles.dashed}
              onPress={() => {
                setNr((s) => ({ ...s, name: s.name || q.trim() }));
                setStep('new');
              }}
            >
              <Ionicons name="add" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.small}>{t('pl.add.not_found')}</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'new' && (
          <>
            <Text style={styles.small}>{t('pl.new.hint')}</Text>
            {([
              ['name', 'pl.new.name', true],
              ['companyName', 'pl.new.company', false],
              ['city', 'pl.new.city', true],
              ['country', 'pl.new.country', true],
              ['website', 'pl.new.website', false],
            ] as const).map(([k, label, req]) => (
              <View key={k}>
                <Text style={styles.label}>{t(label)}{req ? ' *' : ''}</Text>
                <TextInput
                  value={nr[k]}
                  onChangeText={(v) => setNr({ ...nr, [k]: v })}
                  style={styles.input}
                  autoCapitalize={k === 'website' ? 'none' : 'words'}
                  keyboardType={k === 'website' ? 'url' : 'default'}
                  placeholder={k === 'website' ? 'https://' : undefined}
                  placeholderTextColor={theme.colors.textMuted}
                  maxLength={k === 'website' ? 300 : 80}
                />
              </View>
            ))}
            <TouchableOpacity style={styles.linkRow} onPress={useMyLocation}>
              <Ionicons name={pin ? 'checkmark-circle' : 'navigate-outline'} size={16} color={pin ? '#34d399' : theme.colors.redLight} />
              <Text style={[styles.small, { color: pin ? '#34d399' : theme.colors.redLight }]}>{pin ? t('pl.new.pin_set') : t('pl.new.use_location')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={!newOk}
              style={[styles.primary, !newOk && { opacity: 0.5 }]}
              onPress={() => {
                setPicked({ kind: 'new', title: nr.name.trim(), company: nr.companyName.trim(), city: nr.city.trim() });
                setStep('details');
              }}
            >
              <Text style={styles.primaryText}>{t('pl.next')}</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'details' && picked && (
          <>
            <View style={styles.pickedBox}>
              <Text style={styles.resultTitle}>{picked.title}</Text>
              <Text style={styles.small}>{[picked.company, picked.city].filter(Boolean).join(' · ')}</Text>
            </View>
            <Text style={styles.label}>{t('pl.details.date')}</Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              {[[todayKey(), t('pl.details.today')], [yesterday, t('pl.details.yesterday')]].map(([d, l]) => (
                <TouchableOpacity key={d} style={[styles.pill, playedOn === d && styles.pillOn]} onPress={() => setPlayedOn(d)}>
                  <Text style={[styles.pillText, playedOn === d && { color: '#fff' }]}>{l}</Text>
                </TouchableOpacity>
              ))}
              <TextInput value={playedOn} onChangeText={setPlayedOn} placeholder="YYYY-MM-DD" placeholderTextColor={theme.colors.textMuted} style={[styles.input, { flex: 1 }]} maxLength={10} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[styles.result2, escaped && { borderColor: '#34d39988', backgroundColor: 'rgba(52,211,153,0.1)' }]} onPress={() => setEscaped(true)}>
                <Ionicons name="trophy-outline" size={16} color={escaped ? '#6ee7b7' : theme.colors.textSecondary} />
                <Text style={[styles.pillText, escaped && { color: '#6ee7b7' }]}>{t('pl.details.escaped')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.result2, !escaped && { borderColor: '#f8717188', backgroundColor: 'rgba(248,113,113,0.1)' }]} onPress={() => setEscaped(false)}>
                <Ionicons name="lock-closed-outline" size={16} color={!escaped ? '#fca5a5' : theme.colors.textSecondary} />
                <Text style={[styles.pillText, !escaped && { color: '#fca5a5' }]}>{t('pl.details.trapped')}</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {escaped ? (
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{t('pl.details.minutes')}</Text>
                  <TextInput value={minutes} onChangeText={setMinutes} keyboardType="decimal-pad" placeholder="52" placeholderTextColor={theme.colors.textMuted} style={styles.input} />
                </View>
              ) : null}
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{t('pl.details.hints')}</Text>
                <TextInput value={hints} onChangeText={(v) => setHints(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="0" placeholderTextColor={theme.colors.textMuted} style={styles.input} />
              </View>
            </View>
            {friends && friends.length > 0 ? (
              <>
                <Text style={styles.label}>{t('pl.details.team')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {friends.map((f: any) => {
                    const on = team.includes(f._id);
                    return (
                      <TouchableOpacity key={f._id} style={[styles.pill, on && styles.pillOn]} onPress={() => setTeam((s) => (on ? s.filter((x) => x !== f._id) : [...s, f._id]))}>
                        <Text style={[styles.pillText, on && { color: '#fff' }]}>{f.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.small}>{t('pl.details.team_hint')}</Text>
              </>
            ) : null}
            <TouchableOpacity style={[styles.primary, busy && { opacity: 0.6 }]} disabled={busy} onPress={save}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{t('pl.details.save')}</Text>}
            </TouchableOpacity>
          </>
        )}

        {step === 'proof' && logId && (
          <>
            <Ionicons name="checkmark-circle" size={48} color="#34d399" style={{ alignSelf: 'center' }} />
            <Text style={[styles.resultTitle, { textAlign: 'center' }]}>{t('pl.added')}</Text>
            <Text style={[styles.small, { textAlign: 'center' }]}>{t('pl.proof.intro')}</Text>
            <TouchableOpacity style={[styles.primary, uploading && { opacity: 0.6 }]} disabled={uploading} onPress={() => choose(logId)}>
              {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{t('pl.add_proof')}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.ghost} onPress={() => navigation.goBack()}>
              <Text style={styles.small}>{t('pl.proof.later')}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 10 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.glass },
  headerTitle: { flex: 1, fontFamily: theme.fonts.display, fontSize: 20, color: theme.colors.bone },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: theme.colors.bgSecondary, paddingHorizontal: 12 },
  searchInput: { flex: 1, color: theme.colors.textPrimary, paddingVertical: 12, fontSize: 15 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.35)' },
  resultImg: { width: 42, height: 42, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)' },
  resultTitle: { color: theme.colors.bone, fontWeight: '700', fontSize: 15 },
  small: { color: theme.colors.textSecondary, fontSize: 12, lineHeight: 17 },
  tag: { fontSize: 10, color: theme.colors.textMuted, textTransform: 'uppercase' },
  dashed: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.2)' },
  label: { color: theme.colors.textSecondary, fontSize: 13, marginBottom: 6 },
  input: { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: theme.colors.bgSecondary, color: theme.colors.textPrimary, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  primary: { height: 48, borderRadius: 12, backgroundColor: theme.colors.redPrimary, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  ghost: { alignItems: 'center', paddingVertical: 12 },
  pickedBox: { padding: 12, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.35)' },
  pill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  pillOn: { backgroundColor: 'rgba(212,20,31,0.25)', borderColor: theme.colors.redPrimary },
  pillText: { color: theme.colors.textSecondary, fontSize: 13, fontWeight: '600' },
  result2: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
});
