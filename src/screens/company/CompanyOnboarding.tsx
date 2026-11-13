import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCompanyAction, useCompanyMutation, useCompanyQuery } from '../../companySession';
import { api } from '../../../convex/_generated/api';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';
import type { Id } from '../../../convex/_generated/dataModel';
import { openCheckout, buildDeepLink, isPaymentEnabled } from '../../payments';
import { PLAN_OPTIONS, PLAN_STYLE, UNLIMITED_PRICE, asPlanId, planPrice, type PlanId } from './platformPlans';

interface Props {
  companyId: string;
  onComplete: () => void;
  onLogout: () => void;
}

export default function CompanyOnboarding({ companyId, onComplete, onLogout }: Props) {
  const { t } = useTranslation();
  const company = useCompanyQuery(api.companies.getById, { id: companyId as Id<"companies"> });
  const acceptTerms = useCompanyMutation(api.companies.acceptTerms);
  const selectPlan = useCompanyMutation(api.companies.selectPlan);
  const createCheckoutSession = useCompanyAction(api.stripe.createCheckoutSession);
  const resubmit = useCompanyMutation(api.companies.resubmitForReview);

  const [loading, setLoading] = useState(false);
  const [termsScrolledToEnd, setTermsScrolledToEnd] = useState(false);

  const status = company?.onboardingStatus;

  // If approved, let them through
  useEffect(() => {
    if (status === 'approved') {
      onComplete();
    }
  }, [status]);

  if (!company) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.redPrimary} />
      </View>
    );
  }

  // ─── Step indicator ───
  const stepIndex = status === 'pending_terms' ? 0
    : status === 'pending_plan' ? 1
    : 2; // pending_review or declined

  const renderSteps = () => (
    <View style={styles.stepsRow}>
      {[t('onboarding.stepTerms'), t('onboarding.stepPlan'), t('onboarding.stepReview')].map((label, i) => (
        <View key={i} style={styles.stepItem}>
          <View style={[styles.stepCircle, i <= stepIndex && styles.stepCircleActive,
            i < stepIndex && styles.stepCircleDone]}>
            {i < stepIndex ? (
              <Ionicons name="checkmark" size={14} color="#fff" />
            ) : (
              <Text style={[styles.stepNum, i <= stepIndex && styles.stepNumActive]}>{i + 1}</Text>
            )}
          </View>
          <Text style={[styles.stepLabel, i <= stepIndex && styles.stepLabelActive]}>{label}</Text>
          {i < 2 && <View style={[styles.stepLine, i < stepIndex && styles.stepLineDone]} />}
        </View>
      ))}
    </View>
  );

  // ─── STEP 1: Accept Terms ───
  if (status === 'pending_terms') {
    return (
      <View style={styles.container}>
        <Header title={t('onboarding.termsTitle')} onLogout={onLogout} />
        {renderSteps()}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: 120 }}
          onScroll={({ nativeEvent }) => {
            const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
            if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 40) {
              setTermsScrolledToEnd(true);
            }
          }}
          scrollEventThrottle={200}
        >
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('onboarding.platformTermsTitle')}</Text>

            <Text style={styles.termsSection}>{t('onboarding.terms1Title')}</Text>
            <Text style={styles.termsText}>{t('onboarding.terms1Body')}</Text>

            <Text style={styles.termsSection}>{t('onboarding.terms2Title')}</Text>
            <Text style={styles.termsText}>{t('onboarding.terms2Body')}</Text>

            <Text style={styles.termsSection}>{t('onboarding.terms3Title')}</Text>
            <Text style={styles.termsText}>{t('onboarding.terms3Body')}</Text>

            <Text style={styles.termsSection}>{t('onboarding.terms4Title')}</Text>
            <Text style={styles.termsText}>{t('onboarding.terms4Body')}</Text>

            <Text style={styles.termsSection}>{t('onboarding.terms5Title')}</Text>
            <Text style={styles.termsText}>{t('onboarding.terms5Body')}</Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          {!termsScrolledToEnd && (
            <Text style={styles.scrollHint}>{t('onboarding.scrollToAccept')}</Text>
          )}
          <TouchableOpacity
            style={[styles.primaryBtn, !termsScrolledToEnd && styles.btnDisabled]}
            disabled={!termsScrolledToEnd || loading}
            onPress={async () => {
              setLoading(true);
              await acceptTerms({ companyId: companyId as Id<"companies"> });
              setLoading(false);
            }}
          >
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={styles.primaryBtnText}>
              {loading ? t('companyAuth.pleaseWait') : t('onboarding.acceptTerms')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── STEP 2: Select Plan ───
  if (status === 'pending_plan') {
    return (
      <View style={styles.container}>
        <Header title={t('onboarding.planTitle')} onLogout={onLogout} />
        {renderSteps()}
        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 40 }}>
          <Text style={styles.planSubtitle}>{t('onboarding.planSubtitle')}</Text>

          {PLAN_OPTIONS.map((plan) => {
            const style = PLAN_STYLE[plan.id];
            const choose = async (id: PlanId) => {
              setLoading(true);
              try {
                if (id === 'payg') {
                  await selectPlan({ companyId: companyId as Id<"companies">, plan: 'payg' });
                } else if (isPaymentEnabled()) {
                  // The webhook moves the company to review once Stripe confirms payment.
                  const url = await createCheckoutSession({
                    companyId: companyId as Id<"companies">,
                    plan: 'unlimited',
                    period: 'monthly',
                    successUrl: buildDeepLink('subscription-success'),
                    cancelUrl: buildDeepLink('subscription-cancel'),
                  });
                  await openCheckout(url);
                } else {
                  Alert.alert(t('error'), t('plans.checkoutUnavailable'));
                }
              } catch (e: any) {
                Alert.alert(t('error'), e?.message || t('settings.updateFailed'));
              } finally {
                setLoading(false);
              }
            };
            return (
            <TouchableOpacity
              key={plan.id}
              style={[styles.planCard, plan.popular && styles.planCardPopular]}
              activeOpacity={0.8}
              disabled={loading}
              onPress={() => {
                Alert.alert(
                  t('onboarding.confirmPlanTitle'),
                  plan.id === 'payg'
                    ? t('plans.confirmPayg')
                    : t('onboarding.confirmPlanMsg', { plan: t('plan.unlimited'), price: `€${UNLIMITED_PRICE.monthly}` }),
                  [
                    { text: t('cancel'), style: 'cancel' },
                    {
                      text: plan.id === 'payg' ? t('plans.startPayg') : t('onboarding.subscribe'),
                      onPress: () => choose(plan.id),
                    },
                  ]
                );
              }}
            >
              {plan.popular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularText}>{t('onboarding.popular')}</Text>
                </View>
              )}
              <View style={[styles.planIconWrap, { backgroundColor: style.bg }]}>
                <Ionicons name={style.icon} size={28} color={style.text} />
              </View>
              <Text style={styles.planName}>{t(`plan.${plan.id}`)}</Text>
              <Text style={styles.planPrice}>
                {planPrice(plan.id)}
                <Text style={styles.planPricePer}>
                  /{plan.id === 'payg' ? t('plans.perBooking') : t('onboarding.month')}
                </Text>
              </Text>
              <Text style={styles.planYearly}>
                {plan.id === 'payg' ? t('plans.paygCap') : `€${UNLIMITED_PRICE.yearly}/${t('onboarding.year')}`}
              </Text>
              <View style={styles.planDivider} />
              {plan.features.map((fKey, i) => (
                <View key={i} style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={16} color={style.text} />
                  <Text style={styles.featureText}>{t(fKey)}</Text>
                </View>
              ))}
            </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  // ─── STEP 3: Pending Review / Declined ───
  return (
    <View style={styles.container}>
      <Header title={t('onboarding.reviewTitle')} onLogout={onLogout} />
      {renderSteps()}
      <View style={styles.centerContent}>
        {status === 'declined' ? (
          <View style={styles.statusCard}>
            <View style={[styles.statusIcon, { backgroundColor: 'rgba(244,67,54,0.15)' }]}>
              <Ionicons name="close-circle" size={56} color="#F44336" />
            </View>
            <Text style={styles.statusTitle}>{t('onboarding.declinedTitle')}</Text>
            <Text style={styles.statusSubtitle}>{t('onboarding.declinedSubtitle')}</Text>
            {company.adminNotes && (
              <View style={styles.notesCard}>
                <Text style={styles.notesLabel}>{t('onboarding.adminNotes')}</Text>
                <Text style={styles.notesText}>{company.adminNotes}</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={async () => {
                setLoading(true);
                await resubmit({ companyId: companyId as Id<"companies"> });
                setLoading(false);
              }}
            >
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>
                {loading ? t('companyAuth.pleaseWait') : t('onboarding.resubmit')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.statusCard}>
            <View style={[styles.statusIcon, { backgroundColor: 'rgba(255,167,38,0.15)' }]}>
              <Ionicons name="hourglass-outline" size={56} color="#FFA726" />
            </View>
            <Text style={styles.statusTitle}>{t('onboarding.pendingTitle')}</Text>
            <Text style={styles.statusSubtitle}>{t('onboarding.pendingSubtitle')}</Text>
            <View style={styles.pendingChecks}>
              <View style={styles.checkRow}>
                <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
                <Text style={styles.checkText}>{t('onboarding.checkTerms')}</Text>
              </View>
              <View style={styles.checkRow}>
                <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
                <Text style={styles.checkText}>{t('onboarding.checkPlan', { plan: t(`plan.${asPlanId(company.platformPlan)}`) })}</Text>
              </View>
              <View style={styles.checkRow}>
                <Ionicons name="time-outline" size={18} color="#FFA726" />
                <Text style={styles.checkText}>{t('onboarding.checkReview')}</Text>
              </View>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

function Header({ title, onLogout }: { title: string; onLogout: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
        <Ionicons name="log-out-outline" size={18} color={theme.colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  centerContainer: {
    flex: 1, backgroundColor: theme.colors.bgPrimary,
    alignItems: 'center', justifyContent: 'center',
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 12,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  logoutBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: theme.colors.glass, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  scroll: { flex: 1, paddingHorizontal: 20 },

  // Steps
  stepsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 20, paddingVertical: 16, gap: 0,
  },
  stepItem: { flexDirection: 'row', alignItems: 'center' },
  stepCircle: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 2,
    borderColor: theme.colors.glassBorder, alignItems: 'center', justifyContent: 'center',
  },
  stepCircleActive: { borderColor: theme.colors.redPrimary },
  stepCircleDone: { backgroundColor: theme.colors.redPrimary, borderColor: theme.colors.redPrimary },
  stepNum: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted },
  stepNumActive: { color: theme.colors.redPrimary },
  stepLabel: { fontSize: 11, fontWeight: '600', color: theme.colors.textMuted, marginLeft: 6 },
  stepLabelActive: { color: '#fff' },
  stepLine: {
    width: 30, height: 2, backgroundColor: theme.colors.glassBorder,
    marginHorizontal: 8,
  },
  stepLineDone: { backgroundColor: theme.colors.redPrimary },

  // Terms card
  card: {
    padding: 20, borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder, marginTop: 8,
  },
  cardTitle: { fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 16 },
  termsSection: {
    fontSize: 15, fontWeight: '700', color: theme.colors.redPrimary,
    marginTop: 16, marginBottom: 6,
  },
  termsText: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 20 },

  // Footer
  footer: { paddingHorizontal: 20, paddingBottom: 34, paddingTop: 12 },
  scrollHint: {
    fontSize: 12, color: theme.colors.textMuted, textAlign: 'center', marginBottom: 8,
  },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 16, borderRadius: theme.radius.full,
    backgroundColor: theme.colors.redPrimary,
    ...theme.shadow.red,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  btnDisabled: { opacity: 0.4 },

  // Plans
  planSubtitle: {
    fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center',
    marginBottom: 20, marginTop: 8,
  },
  planCard: {
    padding: 24, borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    marginBottom: 16, alignItems: 'center',
  },
  planCardPopular: { borderColor: theme.colors.redPrimary, borderWidth: 2 },
  popularBadge: {
    position: 'absolute', top: -12,
    paddingVertical: 4, paddingHorizontal: 16, borderRadius: 20,
    backgroundColor: theme.colors.redPrimary,
  },
  popularText: { fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  planIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12, marginTop: 4,
  },
  planName: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 4 },
  planPrice: { fontSize: 28, fontWeight: '800', color: '#fff' },
  planPricePer: { fontSize: 14, fontWeight: '500', color: theme.colors.textMuted },
  planYearly: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 4 },
  planDivider: {
    width: '80%', height: 1, backgroundColor: theme.colors.border,
    marginVertical: 16,
  },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, width: '100%' },
  featureText: { fontSize: 13, color: theme.colors.textSecondary, flex: 1 },

  // Status (pending / declined)
  centerContent: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20,
  },
  statusCard: {
    width: '100%', alignItems: 'center', padding: 32,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  statusIcon: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  statusTitle: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 8, textAlign: 'center' },
  statusSubtitle: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: 20 },
  notesCard: {
    width: '100%', padding: 16, borderRadius: theme.radius.lg,
    backgroundColor: 'rgba(244,67,54,0.08)',
    borderWidth: 1, borderColor: 'rgba(244,67,54,0.25)', marginBottom: 20,
  },
  notesLabel: { fontSize: 12, fontWeight: '700', color: '#F44336', marginBottom: 6 },
  notesText: { fontSize: 14, color: theme.colors.textSecondary, lineHeight: 20 },
  pendingChecks: { width: '100%', gap: 12 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkText: { fontSize: 14, color: theme.colors.textSecondary },
});
