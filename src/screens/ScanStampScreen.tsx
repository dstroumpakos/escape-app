import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Vibration } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { theme } from '../theme';
import { useTranslation } from '../i18n';
import { useUser } from '../UserContext';
import { StampSeal } from '../components/StampSeal';

const HEX = '0123456789abcdef';

/** The token in an end-of-game QR (https://<site>/stamp/<48 hex>), or null. */
function tokenFrom(data: string): string | null {
  const i = data.indexOf('/stamp/');
  if (i < 0) return null;
  const tok = data.slice(i + 7, i + 7 + 48).toLowerCase();
  if (tok.length !== 48 || ![...tok].every((c) => HEX.includes(c))) return null;
  return tok;
}

/** Scan the QR the escape room shows at the end of the game and take the room's stamp. */
export default function ScanStampScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { sessionToken } = useUser();
  const [permission, requestPermission] = useCameraPermissions();
  const [token, setToken] = useState<string | null>(null);
  const [badScan, setBadScan] = useState(false);
  const info = useQuery(api.passport.preview, token ? { token, sessionToken: sessionToken ?? undefined } : 'skip');
  const claim = useMutation(api.passport.claim);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ total: number; opened: number | null; already: boolean } | null>(null);

  const onScan = ({ data }: { data: string }) => {
    if (token) return;
    const tok = tokenFrom(data);
    if (tok) {
      setBadScan(false);
      setToken(tok);
    } else {
      setBadScan(true);
    }
  };
  const take = async () => {
    if (!token || !sessionToken) return;
    setBusy(true);
    setErr('');
    try {
      const r = await claim({ sessionToken, token });
      setDone(r);
      if (!r.already) Vibration.vibrate(80);
    } catch (e: any) {
      setErr(typeof e?.data === 'string' ? e.data : e?.message || t('error'));
    } finally {
      setBusy(false);
    }
  };

  const Header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()} accessibilityLabel={t('profile.back')}>
        <Ionicons name="close" size={22} color={theme.colors.bone} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{t('pp.scanTitle')}</Text>
    </View>
  );

  // 1. Camera permission
  if (!permission) return <View style={styles.container}>{Header}</View>;
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        {Header}
        <View style={styles.center}>
          <Ionicons name="camera-outline" size={48} color={theme.colors.textMuted} />
          <Text style={styles.text}>{t('pp.cameraNeeded')}</Text>
          <TouchableOpacity style={styles.btn} onPress={requestPermission}><Text style={styles.btnText}>{t('pp.allowCamera')}</Text></TouchableOpacity>
        </View>
      </View>
    );
  }

  // 2. Scanning
  if (!token) {
    return (
      <View style={styles.container}>
        <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={onScan} />
        {Header}
        <View style={styles.frameWrap} pointerEvents="none"><View style={styles.frame} /></View>
        <View style={[styles.hint, { paddingBottom: insets.bottom + 24 }]}>
          <Text style={styles.hintText}>{badScan ? t('pp.notOurQr') : t('pp.scanHint')}</Text>
        </View>
      </View>
    );
  }

  // 3. Take the stamp
  return (
    <View style={styles.container}>
      {Header}
      <View style={styles.center}>
        {info === undefined ? (
          <ActivityIndicator color={theme.colors.redPrimary} />
        ) : info === null ? (
          <Text style={styles.text}>{t('pp.invalid')}</Text>
        ) : (
          <>
            <Text style={styles.kicker}>{info.companyName}</Text>
            <Text style={styles.room}>{info.roomTitle}</Text>
            <View style={{ height: 170, justifyContent: 'center', marginVertical: 12 }}>
              {done && !done.already ? (
                <StampSeal title={info.roomTitle} theme={info.roomTheme} date={new Date().toLocaleDateString()} escaped={info.escaped} tilt={-8} size={150} slam />
              ) : (
                <View style={styles.placeholder}><Ionicons name="ribbon-outline" size={40} color={theme.colors.textMuted} /></View>
              )}
            </View>
            {done ? (
              <>
                <Text style={styles.text}>{done.already ? t('pp.already') : t('pp.gotIt', { n: done.total })}</Text>
                {done.opened ? <Text style={[styles.text, { color: theme.colors.gold }]}>{t('pp.chamberOpened')}</Text> : null}
                <TouchableOpacity style={styles.btn} onPress={() => navigation.replace('Passport')}><Text style={styles.btnText}>{t('pp.openPassport')}</Text></TouchableOpacity>
              </>
            ) : info.alreadyHave ? (
              <Text style={styles.text}>{t('pp.already')}</Text>
            ) : info.expired ? (
              <Text style={styles.text}>{t('pp.expired')}</Text>
            ) : info.full ? (
              <Text style={styles.text}>{t('pp.full')}</Text>
            ) : (
              <TouchableOpacity style={styles.btn} onPress={take} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{t('pp.take')}</Text>}
              </TouchableOpacity>
            )}
            {!!err && <Text style={[styles.text, { color: theme.colors.redLight }]}>{err}</Text>}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 10, zIndex: 2 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  headerTitle: { fontFamily: theme.fonts.display, fontSize: 20, color: theme.colors.bone },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  text: { color: theme.colors.textSecondary, fontSize: 15, textAlign: 'center' },
  kicker: { color: theme.colors.textMuted, fontSize: 13 },
  room: { fontFamily: theme.fonts.display, fontSize: 24, color: theme.colors.bone, textAlign: 'center' },
  placeholder: { width: 150, height: 150, borderRadius: 75, borderWidth: 2, borderStyle: 'dashed', borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  btn: { marginTop: 10, minWidth: 220, height: 50, borderRadius: 12, backgroundColor: theme.colors.redPrimary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  frameWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 250, height: 250, borderRadius: 24, borderWidth: 3, borderColor: theme.colors.gold },
  hint: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: 24 },
  hintText: { color: '#fff', fontSize: 15, textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, overflow: 'hidden' },
});
