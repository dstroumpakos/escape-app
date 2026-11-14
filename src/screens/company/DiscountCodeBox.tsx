/**
 * "Have a discount code?" on the plan step. A valid code is free months of
 * Unlimited: we open Stripe Checkout with the code and the server sets the trial.
 * Same flow as the website onboarding.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { useCompanyAction } from '../../companySession';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';
import { openCheckout, buildDeepLink, isPaymentEnabled } from '../../payments';

export default function DiscountCodeBox({ companyId, disabled }: { companyId: string; disabled?: boolean }) {
  const { t } = useTranslation();
  const createCheckoutSession = useCompanyAction(api.stripe.createCheckoutSession);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const trimmed = code.trim();
  const validation = useQuery(api.companies.validateDiscountCode, trimmed.length >= 3 ? { code: trimmed } : 'skip');

  const errorFor = (key?: string) => {
    const k = `onboarding.discount_${key}`;
    const tr = t(k);
    return tr !== k ? tr : t('onboarding.discount_invalid_code');
  };

  const apply = async () => {
    setError('');
    if (!validation) return;
    if (!validation.valid) {
      setError(errorFor(validation.error));
      return;
    }
    if (!isPaymentEnabled()) {
      setError(t('plans.checkoutUnavailable'));
      return;
    }
    setBusy(true);
    try {
      const url = await createCheckoutSession({
        companyId: companyId as Id<'companies'>,
        plan: 'unlimited',
        period: (validation.period as 'monthly' | 'yearly') || 'monthly',
        successUrl: buildDeepLink('subscription-success'),
        cancelUrl: buildDeepLink('subscription-cancel'),
        discountCode: trimmed,
      });
      await openCheckout(url);
    } catch (e: any) {
      const data = e?.data;
      setError(typeof data === 'string' && data ? data : t('onboarding.discount_invalid_code'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.inputWrap}>
          <Ionicons name="pricetag-outline" size={16} color={theme.colors.textSecondary} />
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={(v) => {
              setCode(v.toUpperCase());
              setError('');
            }}
            placeholder={t('onboarding.discount_placeholder')}
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
          />
        </View>
        <TouchableOpacity
          style={[styles.btn, (!trimmed || busy || disabled) && { opacity: 0.5 }]}
          disabled={!trimmed || busy || disabled}
          onPress={apply}
        >
          {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.btnText}>{t('onboarding.apply_code')}</Text>}
        </TouchableOpacity>
      </View>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : validation?.valid ? (
        <Text style={styles.ok}>
          {t('onboarding.discount_valid_hint', { plan: t('plan.unlimited'), months: validation.durationMonths || 12 })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 20, marginBottom: 18 },
  row: { flexDirection: 'row', gap: 8 },
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12,
    borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.glassBorder, backgroundColor: theme.colors.bgCardSolid,
  },
  input: { flex: 1, paddingVertical: 11, color: theme.colors.bone, fontSize: 14 },
  btn: {
    paddingHorizontal: 18, borderRadius: theme.radius.md, backgroundColor: theme.colors.redPrimary,
    alignItems: 'center', justifyContent: 'center', minWidth: 84,
  },
  btnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  error: { fontSize: 12, color: '#FF8A80', marginTop: 6 },
  ok: { fontSize: 12, color: '#6EE7B7', marginTop: 6 },
});
