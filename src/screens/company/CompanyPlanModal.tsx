import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, ActivityIndicator, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCompanyAction, useCompanyMutation } from '../../companySession';
import { api } from '../../../convex/_generated/api';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';
import { openCheckout, buildDeepLink, isPaymentEnabled } from '../../payments';
import type { Id } from '../../../convex/_generated/dataModel';
import { PLAN_OPTIONS, PLAN_STYLE, asPlanId, planPrice, type PlanId } from './platformPlans';

interface Props {
  visible: boolean;
  onClose: () => void;
  companyId: string;
  currentPlan: string;
}

export default function CompanyPlanModal({ visible, onClose, companyId, currentPlan }: Props) {
  const { t } = useTranslation();
  const selectPlan = useCompanyMutation(api.companies.selectPlan);
  const createCheckoutSession = useCompanyAction(api.stripe.createCheckoutSession);
  const [loading, setLoading] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

  const current = asPlanId(currentPlan);

  const handleSelectPlan = async (planId: PlanId) => {
    if (planId === current) {
      onClose();
      return;
    }

    setLoading(true);
    try {
      if (planId === 'payg') {
        // From Unlimited the server refuses and explains: cancel the subscription instead.
        await selectPlan({
          companyId: companyId as Id<"companies">,
          plan: 'payg',
        });
        Alert.alert(t('success'), t('settings.planUpdated'));
        onClose();
      } else if (isPaymentEnabled()) {
        // Unlimited is a Stripe subscription; the webhook switches the plan once paid.
        const successUrl = buildDeepLink('subscription-success');
        const cancelUrl = buildDeepLink('subscription-cancel');

        const url = await createCheckoutSession({
          companyId: companyId as Id<"companies">,
          plan: 'unlimited',
          period: billingPeriod,
          successUrl,
          cancelUrl,
        });

        await openCheckout(url);
        onClose();
      } else {
        Alert.alert(t('error'), t('plans.checkoutUnavailable'));
      }
    } catch (error: any) {
      Alert.alert(t('error'), error.message || t('settings.updateFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('settings.subscriptionPlan')}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.subtitle}>{t('onboarding.planSubtitle')}</Text>

          {/* Billing Period Toggle */}
          <View style={styles.periodToggle}>
            <TouchableOpacity
              style={[styles.periodBtn, billingPeriod === 'monthly' && styles.periodBtnActive]}
              onPress={() => setBillingPeriod('monthly')}
            >
              <Text style={[styles.periodText, billingPeriod === 'monthly' && styles.periodTextActive]}>
                {t('onboarding.monthly') || 'Monthly'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.periodBtn, billingPeriod === 'yearly' && styles.periodBtnActive]}
              onPress={() => setBillingPeriod('yearly')}
            >
              <Text style={[styles.periodText, billingPeriod === 'yearly' && styles.periodTextActive]}>
                {t('onboarding.yearly') || 'Yearly'}
              </Text>
            </TouchableOpacity>
          </View>

          {PLAN_OPTIONS.map((plan) => {
            const isCurrent = plan.id === current;
            const style = PLAN_STYLE[plan.id];
            return (
              <TouchableOpacity
                key={plan.id}
                style={[
                  styles.planCard,
                  isCurrent && styles.planCardActive,
                  plan.popular && styles.planCardPopular,
                ]}
                onPress={() => handleSelectPlan(plan.id)}
                disabled={loading}
                activeOpacity={0.8}
              >
                {plan.popular && (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularText}>{t('onboarding.popular')}</Text>
                  </View>
                )}
                <View style={styles.planHeader}>
                  <View style={[styles.iconBox, { backgroundColor: style.bg }]}>
                    <Ionicons name={style.icon} size={24} color={style.text} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.planName}>{t(`plan.${plan.id}`)}</Text>
                    <Text style={styles.planPrice}>
                      {planPrice(plan.id, billingPeriod)}
                      <Text style={styles.planPeriod}>
                        {plan.id === 'payg'
                          ? `/${t('plans.perBooking')}`
                          : billingPeriod === 'monthly' ? '/mo' : '/yr'}
                      </Text>
                    </Text>
                  </View>
                  {isCurrent && (
                    <View style={styles.currentBadge}>
                      <Text style={styles.currentText}>{t('settings.currentPlan')}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.featuresList}>
                  {plan.features.map((feat, i) => (
                    <View key={i} style={styles.featureRow}>
                      <Ionicons name="checkmark-circle" size={18} color={style.text} />
                      <Text style={styles.featureText}>{t(feat as any)}</Text>
                    </View>
                  ))}
                </View>

                {!isCurrent && (
                  <View style={[styles.selectBtn, { backgroundColor: style.text }]}>
                    <Text style={styles.selectBtnText}>{t('onboarding.selectPlan')}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={theme.colors.redPrimary} />
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 20, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: theme.colors.glassBorder,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  closeBtn: { padding: 4 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  subtitle: { fontSize: 16, color: theme.colors.textSecondary, marginBottom: 24, textAlign: 'center' },

  periodToggle: {
    flexDirection: 'row', alignSelf: 'center', marginBottom: 24,
    backgroundColor: theme.colors.glass, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    padding: 3,
  },
  periodBtn: {
    paddingVertical: 10, paddingHorizontal: 24, borderRadius: theme.radius.md - 2,
  },
  periodBtnActive: {
    backgroundColor: theme.colors.redPrimary,
  },
  periodText: { fontSize: 14, fontWeight: '600', color: theme.colors.textMuted },
  periodTextActive: { color: '#fff' },

  planCard: {
    backgroundColor: theme.colors.bgCardSolid,
    borderRadius: theme.radius.lg,
    padding: 20, marginBottom: 16,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    position: 'relative',
  },
  planCardActive: {
    borderColor: theme.colors.success,
    backgroundColor: 'rgba(76,175,80,0.05)',
  },
  planCardPopular: {
    borderColor: theme.colors.redPrimary,
  },
  popularBadge: {
    position: 'absolute', top: -12, right: 20,
    backgroundColor: theme.colors.redPrimary,
    paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 12, zIndex: 10,
  },
  popularText: { color: '#fff', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  currentBadge: {
    backgroundColor: theme.colors.success,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8,
  },
  currentText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  planHeader: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
  iconBox: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  planName: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 4 },
  planPrice: { fontSize: 24, fontWeight: '800', color: '#fff' },
  planPeriod: { fontSize: 14, fontWeight: '500', color: theme.colors.textSecondary },

  featuresList: { gap: 12 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureText: { fontSize: 14, color: theme.colors.textSecondary, flex: 1 },

  selectBtn: {
    marginTop: 20, paddingVertical: 12, borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  selectBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
});