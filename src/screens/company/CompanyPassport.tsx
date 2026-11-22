import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import QRCode from 'qrcode';
import { api } from '../../../convex/_generated/api';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';
import { useCompanyMutation, useCompanyQuery } from '../../companySession';
import { defaultStartTime, startTimeToMs, shiftTime, formatPlayed } from '../../playTime';

// The QR opens the stamp page on the site; the UNLOCKED app scans the token itself.
const SITE = 'https://unlocked.gr';

/**
 * End of game: pick the room, players and result, and show the QR. Each
 * player scans it and gets the room's stamp in their passport (convex/passport.ts).
 */
export default function CompanyPassport({ companyId }: { companyId: string }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const rooms = useCompanyQuery(api.companies.getRooms, { companyId: companyId as any });
  const start = useCompanyMutation(api.passport.startSession);
  const bookable = useMemo(() => (rooms || []).filter((r: any) => !r.photosOnly && r.isActive !== false), [rooms]);
  const [roomId, setRoomId] = useState('');
  const [players, setPlayers] = useState(4);
  const [escaped, setEscaped] = useState(true);
  const [minutes, setMinutes] = useState('');
  const [startTime, setStartTime] = useState(() => defaultStartTime());
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!roomId && bookable.length) setRoomId(bookable[0]._id);
  }, [bookable, roomId]);

  const go = async () => {
    if (!roomId) return;
    setBusy(true);
    try {
      const m = minutes.trim() ? Number(minutes.replace(',', '.')) : undefined;
      const r = await start({ roomId: roomId as any, players, escaped, escapeMinutes: escaped ? m : undefined, playedAt: startTimeToMs(startTime) });
      setSessionId(r.sessionId);
    } catch (e: any) {
      const msg: string = typeof e?.data === 'string' ? e.data : e?.message || '';
      const soon = /^A QR for this room was made (\d+) minutes ago\. You can make the next one in (\d+) minutes\./.exec(msg);
      const day = /^This room already had (\d+) QRs/.exec(msg);
      Alert.alert(
        t('error'),
        soon ? t('st.qrTooSoon', { ago: soon[1], mins: soon[2] }) : day ? t('st.qrDayLimit', { n: day[1] }) : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => (sessionId ? setSessionId(null) : navigation.goBack())}>
          <Ionicons name="arrow-back" size={20} color={theme.colors.bone} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('cpp.title')}</Text>
      </View>
      {sessionId ? (
        <LiveQr sessionId={sessionId} onNew={() => setSessionId(null)} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
          <Text style={styles.sub}>{t('cpp.subtitle')}</Text>
          <Text style={styles.label}>{t('cpp.room')}</Text>
          <View style={{ gap: 8 }}>
            {bookable.map((r: any) => (
              <TouchableOpacity key={r._id} style={[styles.option, roomId === r._id && styles.optionOn]} onPress={() => setRoomId(r._id)}>
                <Ionicons name={roomId === r._id ? 'radio-button-on' : 'radio-button-off'} size={18} color={roomId === r._id ? theme.colors.redLight : theme.colors.textMuted} />
                <Text style={styles.optionText} numberOfLines={1}>{r.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.label}>{t('cpp.startTime')}</Text>
          <View style={styles.stepper}>
            <TouchableOpacity style={styles.stepBtn} onPress={() => setStartTime((v) => shiftTime(v, -15))}><Ionicons name="remove" size={20} color={theme.colors.bone} /></TouchableOpacity>
            <Text style={styles.stepVal}>{startTime}</Text>
            <TouchableOpacity style={styles.stepBtn} onPress={() => setStartTime((v) => shiftTime(v, 15))}><Ionicons name="add" size={20} color={theme.colors.bone} /></TouchableOpacity>
          </View>
          <Text style={styles.label}>{t('cpp.players')}</Text>
          <View style={styles.stepper}>
            <TouchableOpacity style={styles.stepBtn} onPress={() => setPlayers((p) => Math.max(1, p - 1))}><Ionicons name="remove" size={20} color={theme.colors.bone} /></TouchableOpacity>
            <Text style={styles.stepVal}>{players}</Text>
            <TouchableOpacity style={styles.stepBtn} onPress={() => setPlayers((p) => Math.min(20, p + 1))}><Ionicons name="add" size={20} color={theme.colors.bone} /></TouchableOpacity>
          </View>
          <Text style={styles.label}>{t('cpp.result')}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={[styles.result, escaped && { borderColor: theme.colors.success, backgroundColor: 'rgba(34,197,94,0.1)' }]} onPress={() => setEscaped(true)}>
              <Ionicons name="trophy-outline" size={16} color={escaped ? theme.colors.success : theme.colors.textMuted} />
              <Text style={styles.optionText}>{t('cpp.escaped')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.result, !escaped && { borderColor: theme.colors.redLight, backgroundColor: 'rgba(200,16,27,0.1)' }]} onPress={() => setEscaped(false)}>
              <Ionicons name="lock-closed-outline" size={16} color={!escaped ? theme.colors.redLight : theme.colors.textMuted} />
              <Text style={styles.optionText}>{t('cpp.trapped')}</Text>
            </TouchableOpacity>
          </View>
          {escaped && (
            <>
              <Text style={styles.label}>{t('cpp.time')}</Text>
              <TextInput value={minutes} onChangeText={setMinutes} keyboardType="decimal-pad" placeholder="52" placeholderTextColor={theme.colors.textMuted} style={styles.input} />
            </>
          )}
          <TouchableOpacity style={styles.btn} onPress={go} disabled={busy || !roomId}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{t('cpp.showQr')}</Text>}
          </TouchableOpacity>
          <Text style={[styles.sub, { marginTop: 12 }]}>{t('cpp.rules')}</Text>
        </ScrollView>
      )}
    </View>
  );
}

function LiveQr({ sessionId, onNew }: { sessionId: string; onNew: () => void }) {
  const { t } = useTranslation();
  const s = useCompanyQuery(api.passport.sessionStatus, { sessionId: sessionId as any });
  const [svg, setSvg] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  useEffect(() => {
    if (!s?.token) return;
    QRCode.toString(`${SITE}/stamp/${s.token}`, { type: 'svg', margin: 2 }).then(setSvg).catch(() => {});
  }, [s?.token]);
  if (!s) return <ActivityIndicator color={theme.colors.redPrimary} style={{ marginTop: 40 }} />;
  const left = s.expiresAt - now;
  const expired = left <= 0;
  const full = s.claimed >= s.players;
  const mm = String(Math.max(0, Math.floor(left / 60000))).padStart(2, '0');
  const ss = String(Math.max(0, Math.floor((left % 60000) / 1000))).padStart(2, '0');
  return (
    <View style={{ alignItems: 'center', padding: 20 }}>
      <Text style={styles.sub}>{t('cpp.scanNow')}</Text>
      <Text style={styles.roomTitle}>{s.roomTitle}</Text>
      {s.playedAt ? <Text style={[styles.sub, { textAlign: 'center', marginTop: -6, marginBottom: 10 }]}>{formatPlayed(s.playedAt, Date.now())}</Text> : null}
      <View style={styles.qrBox}>
        {svg && !expired && !full ? <SvgXml xml={svg} width={260} height={260} /> : (
          <Text style={{ color: '#000', fontWeight: '700', textAlign: 'center' }}>{full ? t('cpp.allDone') : t('cpp.expired')}</Text>
        )}
      </View>
      <Text style={styles.count}><Text style={{ color: theme.colors.redLight }}>{s.claimed}</Text>/{s.players}</Text>
      <Text style={styles.sub}>{t('cpp.stamped')}</Text>
      {!expired && !full && <Text style={[styles.sub, { marginTop: 4 }]}>{t('cpp.validFor', { time: `${mm}:${ss}` })}</Text>}
      <TouchableOpacity style={[styles.btn, { backgroundColor: theme.colors.glass, minWidth: 200 }]} onPress={onNew}>
        <Text style={styles.btnText}>{t('cpp.newGame')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 10 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.glass },
  headerTitle: { fontFamily: theme.fonts.display, fontSize: 22, color: theme.colors.bone },
  sub: { color: theme.colors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'left' },
  label: { color: theme.colors.textMuted, fontSize: 13, marginTop: 18, marginBottom: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border },
  optionOn: { borderColor: theme.colors.redPrimary, backgroundColor: 'rgba(200,16,27,0.08)' },
  optionText: { color: theme.colors.bone, fontSize: 15, flexShrink: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  stepBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  stepVal: { fontSize: 28, fontWeight: '800', color: theme.colors.bone, minWidth: 36, textAlign: 'center' },
  result: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border },
  input: { width: 120, height: 46, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, color: theme.colors.bone, paddingHorizontal: 12, fontSize: 16 },
  btn: { marginTop: 22, height: 52, borderRadius: 12, backgroundColor: theme.colors.redPrimary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  roomTitle: { fontFamily: theme.fonts.display, fontSize: 22, color: theme.colors.bone, marginVertical: 12, textAlign: 'center' },
  qrBox: { width: 284, height: 284, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 12 },
  count: { fontSize: 36, fontWeight: '800', color: theme.colors.textSecondary, marginTop: 16 },
});
