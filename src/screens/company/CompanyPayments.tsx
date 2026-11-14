/**
 * Player payments into the company's own Stripe or Viva account, plus the
 * default deposit % and optional booking fee. Mirrors the website's
 * /company/payments page (same Convex functions, same password checks).
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, ActivityIndicator, Switch, Clipboard, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCompanyAction, useCompanyMutation, useCompanyQuery } from '../../companySession';
import { api } from '../../../convex/_generated/api';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';
import type { Id } from '../../../convex/_generated/dataModel';

type Provider = 'stripe' | 'viva';

/** Players are always sent back to the main site after a Viva payment. */
const VIVA_RETURN_URL = 'https://unlocked.gr/booking/viva-return';

interface Props {
  companyId: string;
  onBack: () => void;
}

function errMsg(err: unknown, fallback: string) {
  const data = (err as any)?.data;
  if (typeof data === 'string' && data) return data;
  const msg = err instanceof Error ? err.message : '';
  const clean = msg.replace(/^\[CONVEX[^\]]*\]\s*/, '').replace(/^.*Uncaught (Convex)?Error:\s*/, '').split('\n')[0];
  return clean || fallback;
}

function Field({
  label, hint, value, onChangeText, secure, placeholder, numeric,
}: {
  label: string; hint?: string; value: string; onChangeText: (v: string) => void;
  secure?: boolean; placeholder?: string; numeric?: boolean;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={numeric ? 'number-pad' : 'default'}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export default function CompanyPayments({ companyId, onBack }: Props) {
  const { t } = useTranslation();
  const cId = companyId as Id<'companies'>;

  const settings = useCompanyQuery(api.companyPaymentsData.getCompanySettings, { companyId: cId });
  const connectStripe = useCompanyAction(api.companyPayments.connectStripe);
  const connectViva = useCompanyAction(api.companyPayments.connectViva);
  const disconnect = useCompanyAction(api.companyPayments.disconnect);
  const updateSettings = useCompanyMutation(api.companyPaymentsData.updateSettings);

  const [editing, setEditing] = useState(false);
  const [provider, setProvider] = useState<Provider>('stripe');
  const [stripeKey, setStripeKey] = useState('');
  const [viva, setViva] = useState({
    mode: 'live' as 'live' | 'test',
    clientId: '', clientSecret: '', sourceCode: '', merchantId: '', apiKey: '',
  });
  const [connectPw, setConnectPw] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectErr, setConnectErr] = useState('');

  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnectPw, setDisconnectPw] = useState('');
  const [disconnecting, setDisconnecting] = useState(false);

  const [deposit, setDeposit] = useState('20');
  const [feeOn, setFeeOn] = useState(false);
  const [fee, setFee] = useState('');
  const [settingsPw, setSettingsPw] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (settings && !loaded) {
      setDeposit(String(settings.depositPercent));
      setFeeOn(settings.bookingFeeEnabled);
      setFee(settings.bookingFeeAmount ? String(settings.bookingFeeAmount) : '');
      if (settings.provider) setProvider(settings.provider);
      setLoaded(true);
    }
  }, [settings, loaded]);

  if (settings === undefined || settings === null) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.redPrimary} />
      </View>
    );
  }

  const connected = !!settings.provider;
  const showForm = !connected || editing;

  const handleConnect = async () => {
    setConnecting(true);
    setConnectErr('');
    try {
      if (provider === 'stripe') {
        await connectStripe({ companyId: cId, password: connectPw, secretKey: stripeKey.trim() });
      } else {
        await connectViva({
          companyId: cId, password: connectPw, mode: viva.mode,
          clientId: viva.clientId.trim(), clientSecret: viva.clientSecret.trim(),
          sourceCode: viva.sourceCode.trim(), merchantId: viva.merchantId.trim(), apiKey: viva.apiKey.trim(),
        });
      }
      Alert.alert(t('success'), t('pay.connectedToast'));
      setStripeKey('');
      setViva((v) => ({ ...v, clientSecret: '', apiKey: '' }));
      setConnectPw('');
      setEditing(false);
    } catch (err) {
      setConnectErr(errMsg(err, t('pay.genericError')));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnect({ companyId: cId, password: disconnectPw });
      Alert.alert(t('success'), t('pay.disconnectedToast'));
      setConfirmDisconnect(false);
      setDisconnectPw('');
    } catch (err) {
      Alert.alert(t('error'), errMsg(err, t('pay.genericError')));
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSaveSettings = async () => {
    const pct = Number(deposit);
    if (!Number.isInteger(pct) || pct < 1 || pct > 99) {
      Alert.alert(t('error'), t('roomEditor.depositPercentInvalid'));
      return;
    }
    setSavingSettings(true);
    try {
      await updateSettings({
        companyId: cId,
        password: settingsPw,
        depositPercent: pct,
        bookingFeeEnabled: feeOn,
        bookingFeeAmount: feeOn ? Number(fee.replace(',', '.') || 0) : 0,
      });
      Alert.alert(t('success'), t('pay.settingsSaved'));
      setSettingsPw('');
    } catch (err) {
      Alert.alert(t('error'), errMsg(err, t('pay.genericError')));
    } finally {
      setSavingSettings(false);
    }
  };

  const canConnect =
    !!connectPw &&
    settings.serverReady &&
    (provider === 'stripe'
      ? !!stripeKey.trim()
      : !!(viva.clientId && viva.clientSecret && viva.merchantId && viva.apiKey && viva.sourceCode));

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.bone} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('pay.title')}</Text>
        <Ionicons name="wallet-outline" size={22} color={theme.colors.redPrimary} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 120 }}>
        <Text style={styles.subtitle}>{t('pay.subtitle')}</Text>

        {!settings.serverReady && (
          <View style={styles.warnCard}>
            <Ionicons name="alert-circle-outline" size={18} color={theme.colors.warning} />
            <Text style={styles.warnText}>{t('pay.serverNotReady')}</Text>
          </View>
        )}

        {/* ── Account ── */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="wallet-outline" size={18} color={theme.colors.redLight} />
            <Text style={styles.cardTitle}>{t('pay.accountTitle')}</Text>
          </View>

          {connected && (
            <View style={styles.connectedBox}>
              <View style={styles.rowWrap}>
                <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} />
                <Text style={styles.connectedText}>
                  {settings.provider === 'stripe' ? 'Stripe' : 'Viva'} {t('pay.isConnected')}
                </Text>
                <View style={[styles.modePill, settings.mode === 'live' ? styles.modeLive : styles.modeTest]}>
                  <Text style={[styles.modePillText, { color: settings.mode === 'live' ? theme.colors.success : theme.colors.warning }]}>
                    {settings.mode === 'live' ? t('pay.modeLive') : t('pay.modeTest')}
                  </Text>
                </View>
              </View>
              {settings.accountLabel ? <Text style={styles.hint}>{settings.accountLabel}</Text> : null}
              {settings.mode === 'test' && <Text style={[styles.hint, { color: theme.colors.warning }]}>{t('pay.testModeNote')}</Text>}
              {settings.provider === 'viva' && (
                <Text style={styles.hint}>{t('pay.vivaReturnReminder')} {VIVA_RETURN_URL}</Text>
              )}

              {!editing && !confirmDisconnect && (
                <View style={[styles.rowWrap, { marginTop: 14 }]}>
                  <TouchableOpacity style={styles.ghostBtn} onPress={() => setEditing(true)}>
                    <Text style={styles.ghostBtnText}>{t('pay.replaceKeys')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.ghostBtn, styles.dangerBtn]} onPress={() => setConfirmDisconnect(true)}>
                    <Ionicons name="unlink-outline" size={14} color="#FF8A8A" />
                    <Text style={[styles.ghostBtnText, { color: '#FF8A8A' }]}>{t('pay.disconnect')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {confirmDisconnect && (
                <View style={{ marginTop: 14 }}>
                  <Text style={[styles.hint, { color: '#FFB4B4', marginBottom: 10 }]}>{t('pay.disconnectWarning')}</Text>
                  <Field label={t('pay.yourPassword')} value={disconnectPw} onChangeText={setDisconnectPw} secure />
                  <View style={styles.rowWrap}>
                    <TouchableOpacity
                      style={[styles.primaryBtn, { backgroundColor: '#B3121C' }, (!disconnectPw || disconnecting) && styles.disabled]}
                      disabled={!disconnectPw || disconnecting}
                      onPress={handleDisconnect}
                    >
                      {disconnecting && <ActivityIndicator size="small" color="#fff" />}
                      <Text style={styles.primaryBtnText}>{t('pay.disconnectConfirm')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.ghostBtn} onPress={() => setConfirmDisconnect(false)}>
                      <Text style={styles.ghostBtnText}>{t('cancel')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}

          {!connected && <Text style={[styles.hint, { marginBottom: 14 }]}>{t('pay.notConnected')}</Text>}

          {showForm && (
            <View>
              <View style={styles.segment}>
                {(['stripe', 'viva'] as Provider[]).map((pv) => (
                  <TouchableOpacity
                    key={pv}
                    style={[styles.segmentItem, provider === pv && styles.segmentActive]}
                    onPress={() => setProvider(pv)}
                  >
                    <Text style={[styles.segmentText, provider === pv && { color: '#fff' }]}>
                      {pv === 'stripe' ? 'Stripe' : 'Viva'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {provider === 'stripe' ? (
                <>
                  {[t('pay.stripeStep1'), t('pay.stripeStep2'), t('pay.stripeStep3')].map((s, i) => (
                    <Text key={i} style={styles.step}>{i + 1}. {s}</Text>
                  ))}
                  <View style={{ height: 10 }} />
                  <Field label={t('pay.stripeSecret')} value={stripeKey} onChangeText={setStripeKey} secure placeholder="sk_live_…" />
                </>
              ) : (
                <>
                  {[t('pay.vivaStep1'), t('pay.vivaStep2'), t('pay.vivaStep3')].map((s, i) => (
                    <Text key={i} style={styles.step}>{i + 1}. {s}</Text>
                  ))}
                  <View style={styles.returnBox}>
                    <Text style={[styles.hint, { marginTop: 0, marginBottom: 6 }]}>{t('pay.vivaReturnTitle')}</Text>
                    <View style={styles.rowWrap}>
                      <Text style={styles.code} selectable>{VIVA_RETURN_URL}</Text>
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => {
                          Clipboard.setString(VIVA_RETURN_URL);
                          Alert.alert(t('pay.copied'));
                        }}
                      >
                        <Ionicons name="copy-outline" size={16} color={theme.colors.bone} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text style={styles.label}>{t('pay.vivaEnv')}</Text>
                  <View style={[styles.segment, { marginBottom: 14 }]}>
                    {(['live', 'test'] as const).map((m) => (
                      <TouchableOpacity
                        key={m}
                        style={[styles.segmentItem, viva.mode === m && styles.segmentActive]}
                        onPress={() => setViva({ ...viva, mode: m })}
                      >
                        <Text style={[styles.segmentText, viva.mode === m && { color: '#fff' }]}>
                          {m === 'live' ? t('pay.vivaEnvLive') : t('pay.vivaEnvDemo')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Field label="Smart Checkout Client ID" value={viva.clientId} onChangeText={(v) => setViva({ ...viva, clientId: v })} />
                  <Field label="Smart Checkout Client Secret" value={viva.clientSecret} onChangeText={(v) => setViva({ ...viva, clientSecret: v })} secure />
                  <Field label="Merchant ID" value={viva.merchantId} onChangeText={(v) => setViva({ ...viva, merchantId: v })} />
                  <Field label="API Key" value={viva.apiKey} onChangeText={(v) => setViva({ ...viva, apiKey: v })} secure />
                  <Field
                    label={t('pay.vivaSource')}
                    hint={t('pay.vivaSourceHint')}
                    value={viva.sourceCode}
                    onChangeText={(v) => setViva({ ...viva, sourceCode: v })}
                    placeholder="1234"
                    numeric
                  />
                </>
              )}

              <Field label={t('pay.yourPassword')} hint={t('pay.passwordWhy')} value={connectPw} onChangeText={setConnectPw} secure />

              {connectErr ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{connectErr}</Text>
                </View>
              ) : null}

              <View style={styles.rowWrap}>
                <TouchableOpacity
                  style={[styles.primaryBtn, (!canConnect || connecting) && styles.disabled]}
                  disabled={!canConnect || connecting}
                  onPress={handleConnect}
                >
                  {connecting
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Ionicons name="lock-closed" size={15} color="#fff" />}
                  <Text style={styles.primaryBtnText}>{connecting ? t('pay.checking') : t('pay.connect')}</Text>
                </TouchableOpacity>
                {editing && (
                  <TouchableOpacity onPress={() => setEditing(false)} style={{ padding: 10 }}>
                    <Text style={styles.ghostBtnText}>{t('cancel')}</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={[styles.rowWrap, { marginTop: 12, alignItems: 'flex-start' }]}>
                <Ionicons name="shield-checkmark-outline" size={15} color={theme.colors.textSecondary} />
                <Text style={[styles.hint, { flex: 1, marginTop: 0 }]}>{t('pay.securityNote')}</Text>
              </View>
            </View>
          )}
        </View>

        {/* ── Deposit & fee ── */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="pie-chart-outline" size={18} color={theme.colors.redLight} />
            <Text style={styles.cardTitle}>{t('pay.settingsTitle')}</Text>
          </View>
          <Text style={[styles.hint, { marginTop: 0, marginBottom: 14 }]}>{t('pay.settingsDesc')}</Text>

          <Text style={styles.label}>{t('pay.defaultDeposit')}</Text>
          <View style={styles.rowWrap}>
            <TextInput
              style={[styles.input, { width: 90 }]}
              value={deposit}
              onChangeText={setDeposit}
              keyboardType="number-pad"
              maxLength={2}
            />
            <Text style={styles.unit}>%</Text>
          </View>
          <Text style={[styles.hint, { marginBottom: 14 }]}>{t('pay.defaultDepositHint')}</Text>

          <View style={styles.feeBox}>
            <View style={styles.feeRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.feeTitle}>{t('pay.feeToggle')}</Text>
                <Text style={styles.hint}>{t('pay.feeHint')}</Text>
              </View>
              <Switch
                value={feeOn}
                onValueChange={setFeeOn}
                trackColor={{ false: theme.colors.glassBorder, true: theme.colors.redPrimary }}
                thumbColor={theme.colors.bone}
              />
            </View>
            {feeOn && (
              <View style={[styles.rowWrap, { marginTop: 12 }]}>
                <Text style={styles.unit}>€</Text>
                <TextInput
                  style={[styles.input, { width: 110 }]}
                  value={fee}
                  onChangeText={setFee}
                  keyboardType="decimal-pad"
                  placeholder="3.99"
                  placeholderTextColor={theme.colors.textMuted}
                />
              </View>
            )}
          </View>

          <View style={{ height: 14 }} />
          <Field label={t('pay.yourPassword')} value={settingsPw} onChangeText={setSettingsPw} secure />

          <TouchableOpacity
            style={[styles.primaryBtn, (!settingsPw || savingSettings) && styles.disabled]}
            disabled={!settingsPw || savingSettings}
            onPress={handleSaveSettings}
          >
            {savingSettings
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="save-outline" size={15} color="#fff" />}
            <Text style={styles.primaryBtnText}>{t('pay.save')}</Text>
          </TouchableOpacity>
        </View>

        {/* ── How it works ── */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="card-outline" size={18} color={theme.colors.redLight} />
            <Text style={styles.cardTitle}>{t('pay.howTitle')}</Text>
          </View>
          {[t('pay.how1'), t('pay.how2'), t('pay.how3'), t('pay.how4')].map((s, i) => (
            <Text key={i} style={styles.step}>• {s}</Text>
          ))}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  loadingContainer: { flex: 1, backgroundColor: theme.colors.bgPrimary, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 56, paddingHorizontal: 20, paddingBottom: 8 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 22, fontFamily: theme.fonts.display, color: theme.colors.bone, flex: 1 },
  subtitle: { fontSize: 13, lineHeight: 19, color: theme.colors.textSecondary, marginHorizontal: 20, marginBottom: 16 },

  warnCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginHorizontal: 20, marginBottom: 16, padding: 14,
    borderRadius: theme.radius.lg, backgroundColor: 'rgba(255,167,38,0.1)', borderWidth: 1, borderColor: 'rgba(255,167,38,0.25)',
  },
  warnText: { fontSize: 13, lineHeight: 18, color: '#FFD59A', flex: 1 },

  card: {
    marginHorizontal: 20, marginBottom: 16, padding: 18, borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid, borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: theme.colors.bone },

  connectedBox: {
    padding: 14, borderRadius: theme.radius.md, marginBottom: 14,
    backgroundColor: 'rgba(76,175,80,0.06)', borderWidth: 1, borderColor: 'rgba(76,175,80,0.25)',
  },
  connectedText: { fontSize: 15, fontWeight: '700', color: theme.colors.bone },
  modePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: theme.radius.full },
  modeLive: { backgroundColor: 'rgba(76,175,80,0.18)' },
  modeTest: { backgroundColor: 'rgba(255,167,38,0.18)' },
  modePillText: { fontSize: 11, fontWeight: '700' },

  rowWrap: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  label: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 6 },
  hint: { fontSize: 12, lineHeight: 17, color: theme.colors.textSecondary, marginTop: 6 },
  input: {
    backgroundColor: theme.colors.bgPrimary, borderWidth: 1, borderColor: theme.colors.glassBorder,
    borderRadius: theme.radius.md, paddingHorizontal: 14, paddingVertical: 12, color: theme.colors.bone, fontSize: 15,
  },
  unit: { fontSize: 15, color: theme.colors.textSecondary },
  step: { fontSize: 13, lineHeight: 19, color: theme.colors.textSecondary, marginBottom: 6 },

  segment: {
    flexDirection: 'row', backgroundColor: theme.colors.bgPrimary, borderRadius: theme.radius.md,
    padding: 4, gap: 4, marginBottom: 14,
  },
  segmentItem: { flex: 1, paddingVertical: 10, borderRadius: theme.radius.sm, alignItems: 'center' },
  segmentActive: { backgroundColor: theme.colors.redPrimary },
  segmentText: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary, textAlign: 'center' },

  returnBox: {
    padding: 12, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.glassBorder,
    backgroundColor: theme.colors.bgPrimary, marginVertical: 12,
  },
  code: { flex: 1, fontSize: 12, color: theme.colors.bone, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  iconBtn: { padding: 8, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.glassBorder },

  errorBox: { padding: 12, borderRadius: theme.radius.md, backgroundColor: 'rgba(244,67,54,0.1)', marginBottom: 12 },
  errorText: { fontSize: 13, color: '#FF8A80' },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: theme.colors.redPrimary, paddingVertical: 13, paddingHorizontal: 20, borderRadius: theme.radius.full,
  },
  primaryBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  disabled: { opacity: 0.5 },
  ghostBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 14,
    borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  dangerBtn: { borderColor: 'rgba(244,67,54,0.35)' },
  ghostBtnText: { fontSize: 13, fontWeight: '600', color: theme.colors.bone },

  feeBox: { padding: 14, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.glassBorder },
  feeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  feeTitle: { fontSize: 14, fontWeight: '600', color: theme.colors.bone },
});
