import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useAction } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';
import type { Id } from '../../../convex/_generated/dataModel';

const PLAN_PRICES: Record<string, { monthly: number; yearly: number }> = {
  starter: { monthly: 29, yearly: 290 },
  pro: { monthly: 49, yearly: 490 },
  enterprise: { monthly: 99, yearly: 990 },
};

const PLAN_COLORS: Record<string, { bg: string; text: string; icon: keyof typeof Ionicons.glyphMap }> = {
  starter: { bg: 'rgba(76,175,80,0.15)', text: '#4CAF50', icon: 'rocket-outline' },
  pro: { bg: 'rgba(244,67,54,0.15)', text: '#F44336', icon: 'diamond-outline' },
  enterprise: { bg: 'rgba(156,39,176,0.2)', text: '#CE93D8', icon: 'trophy-outline' },
};

interface Props {
  companyId: string;
  onBack: () => void;
}

export default function CompanyBilling({ companyId, onBack }: Props) {
  const { t } = useTranslation();
  const cId = companyId as Id<'companies'>;

  const companyData = useQuery(api.companies.getById, { id: cId });
  const createPortalSession = useAction(api.stripe.createPortalSession);
  const getSubscriptionDetails = useAction(api.stripe.getSubscriptionDetails);

  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function fetchSubscription() {
      try {
        setLoading(true);
        const details = await getSubscriptionDetails({ companyId: cId });
        if (!cancelled) setSubscription(details);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load subscription details');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchSubscription();
    return () => { cancelled = true; };
  }, [companyId]);

  const handleManageSubscription = async () => {
    try {
      setPortalLoading(true);
      const url = await createPortalSession({
        companyId: cId,
        returnUrl: 'unlocked://company/billing',
      });
      await Linking.openURL(url);
    } catch (err: any) {
      Alert.alert(t('error'), err.message || t('billing.portalError'));
    } finally {
      setPortalLoading(false);
    }
  };

  const plan = companyData?.platformPlan || 'starter';
  const period = (companyData as any)?.billingPeriod || 'monthly';
  const paymentStatus = (companyData as any)?.stripePaymentStatus || 'pending';
  const subscribedAt = (companyData as any)?.platformSubscribedAt;
  const hasStripeCustomer = !!(companyData as any)?.stripeCustomerId;

  const planStyle = PLAN_COLORS[plan] || PLAN_COLORS.starter;
  const price = PLAN_PRICES[plan]?.[period as 'monthly' | 'yearly'] ?? 0;

  const formatDate = (ts: number) =>
    new Date(ts * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const formatDateMs = (ts: number) =>
    new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'active':
        return { label: t('billing.statusActive'), color: '#4CAF50', bg: 'rgba(76,175,80,0.15)', icon: 'checkmark-circle' as const };
      case 'cancelled':
        return { label: t('billing.statusCancelled'), color: '#F44336', bg: 'rgba(244,67,54,0.15)', icon: 'close-circle' as const };
      case 'past_due':
        return { label: t('billing.statusPastDue'), color: '#FFA726', bg: 'rgba(255,167,38,0.15)', icon: 'warning' as const };
      default:
        return { label: t('billing.statusPending'), color: '#42A5F5', bg: 'rgba(66,165,245,0.15)', icon: 'time' as const };
    }
  };

  const statusConfig = getStatusConfig(paymentStatus);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.redPrimary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('billing.title')}</Text>
        <Ionicons name="receipt-outline" size={22} color={theme.colors.redPrimary} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {error ? (
          <View style={styles.errorCard}>
            <Ionicons name="warning-outline" size={18} color="#F44336" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Plan Overview Card */}
        <View style={styles.card}>
          <View style={styles.planRow}>
            <View>
              <Text style={styles.cardLabel}>{t('billing.currentPlan')}</Text>
              <View style={[styles.planBadge, { backgroundColor: planStyle.bg }]}>
                <Ionicons name={planStyle.icon} size={14} color={planStyle.text} />
                <Text style={[styles.planBadgeText, { color: planStyle.text }]}>
                  {plan.charAt(0).toUpperCase() + plan.slice(1)}
                </Text>
              </View>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
              <Ionicons name={statusConfig.icon} size={14} color={statusConfig.color} />
              <Text style={[styles.statusText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
            </View>
          </View>

          {/* Stats Grid */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <View style={styles.statIconRow}>
                <Ionicons name="cash-outline" size={14} color={theme.colors.textSecondary} />
                <Text style={styles.statLabel}>{t('billing.amount')}</Text>
              </View>
              <Text style={styles.statValue}>
                €{subscription?.amount ?? price}
                <Text style={styles.statPeriod}>
                  /{period === 'yearly' ? t('billing.year') : t('billing.month')}
                </Text>
              </Text>
            </View>

            <View style={styles.statBox}>
              <View style={styles.statIconRow}>
                <Ionicons name="calendar-outline" size={14} color={theme.colors.textSecondary} />
                <Text style={styles.statLabel}>{t('billing.billingPeriod')}</Text>
              </View>
              <Text style={styles.statValue}>
                {period === 'yearly' ? t('billing.yearly') : t('billing.monthly')}
              </Text>
              {period === 'yearly' && (
                <Text style={styles.saveBadge}>{t('billing.save17')}</Text>
              )}
            </View>

            <View style={styles.statBox}>
              <View style={styles.statIconRow}>
                <Ionicons name="time-outline" size={14} color={theme.colors.textSecondary} />
                <Text style={styles.statLabel}>{t('billing.memberSince')}</Text>
              </View>
              <Text style={styles.statValue}>
                {subscribedAt ? formatDateMs(subscribedAt) : '—'}
              </Text>
            </View>
          </View>
        </View>

        {/* Subscription Details */}
        {subscription && (
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="card-outline" size={18} color={theme.colors.redPrimary} />
              <Text style={styles.cardTitle}>{t('billing.subscriptionDetails')}</Text>
            </View>

            <DetailRow
              label={subscription.cancelAtPeriodEnd ? t('billing.expiresOn') : t('billing.nextPayment')}
              value={subscription.currentPeriodEnd ? formatDate(subscription.currentPeriodEnd) : '—'}
            />
            <DetailRow
              label={t('billing.periodStart')}
              value={subscription.currentPeriodStart ? formatDate(subscription.currentPeriodStart) : '—'}
            />
            <DetailRow
              label={t('billing.subscriptionId')}
              value={subscription.id}
              mono
            />
            {subscription.defaultPaymentMethod && (
              <DetailRow
                label={t('billing.paymentMethod')}
                value={`${subscription.defaultPaymentMethod.brand} •••• ${subscription.defaultPaymentMethod.last4}`}
                icon="card-outline"
              />
            )}

            {subscription.cancelAtPeriodEnd && (
              <View style={styles.warningCard}>
                <Ionicons name="warning-outline" size={18} color="#FFA726" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.warningTitle}>{t('billing.cancelNoticeTitle')}</Text>
                  <Text style={styles.warningText}>
                    {t('billing.cancelNoticeBody')}
                    {subscription.currentPeriodEnd ? ` ${formatDate(subscription.currentPeriodEnd)}.` : '.'}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Actions */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="shield-checkmark-outline" size={18} color={theme.colors.redPrimary} />
            <Text style={styles.cardTitle}>{t('billing.manageTitle')}</Text>
          </View>
          <Text style={styles.manageDesc}>{t('billing.manageDescription')}</Text>

          <TouchableOpacity
            style={[styles.portalBtn, (!hasStripeCustomer || portalLoading) && { opacity: 0.5 }]}
            onPress={handleManageSubscription}
            disabled={portalLoading || !hasStripeCustomer}
            activeOpacity={0.8}
          >
            {portalLoading ? (
              <ActivityIndicator size={18} color="#fff" />
            ) : (
              <Ionicons name="open-outline" size={18} color="#fff" />
            )}
            <Text style={styles.portalBtnText}>{t('billing.manageSubscription')}</Text>
          </TouchableOpacity>

          {!hasStripeCustomer && (
            <View style={styles.noCustomerRow}>
              <Ionicons name="warning-outline" size={14} color={theme.colors.textMuted} />
              <Text style={styles.noCustomerText}>{t('billing.noStripeCustomer')}</Text>
            </View>
          )}

          <View style={styles.stripePoweredRow}>
            <Ionicons name="shield-outline" size={12} color={theme.colors.textMuted} />
            <Text style={styles.stripePoweredText}>{t('billing.stripePowered')}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function DetailRow({ label, value, mono, icon }: { label: string; value: string; mono?: boolean; icon?: string }) {
  return (
    <View style={detailStyles.row}>
      <Text style={detailStyles.label}>{label}</Text>
      <View style={detailStyles.valueRow}>
        {icon && <Ionicons name={icon as any} size={14} color={theme.colors.textSecondary} />}
        <Text style={[detailStyles.value, mono && detailStyles.mono]}>{value}</Text>
      </View>
    </View>
  );
}

const detailStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.glassBorder,
  },
  label: { fontSize: 13, color: theme.colors.textSecondary },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  value: { fontSize: 13, fontWeight: '600', color: '#fff' },
  mono: { fontFamily: 'monospace', fontSize: 11, color: theme.colors.textSecondary },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  loadingContainer: { flex: 1, backgroundColor: theme.colors.bgPrimary, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff', flex: 1 },

  errorCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 20, marginBottom: 16, padding: 14,
    borderRadius: theme.radius.lg, backgroundColor: 'rgba(244,67,54,0.1)',
    borderWidth: 1, borderColor: 'rgba(244,67,54,0.2)',
  },
  errorText: { fontSize: 13, color: '#F44336', flex: 1 },

  card: {
    marginHorizontal: 20, marginBottom: 16, padding: 20,
    borderRadius: theme.radius.lg, backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },

  planRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 20,
  },
  cardLabel: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 8 },
  planBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 6, paddingHorizontal: 14, borderRadius: 12,
  },
  planBadgeText: { fontSize: 16, fontWeight: '800' },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 5, paddingHorizontal: 10, borderRadius: 10,
  },
  statusText: { fontSize: 12, fontWeight: '600' },

  statsRow: { gap: 12 },
  statBox: {
    backgroundColor: theme.colors.glass, borderRadius: theme.radius.md, padding: 14,
  },
  statIconRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  statLabel: { fontSize: 10, fontWeight: '600', color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  statValue: { fontSize: 20, fontWeight: '700', color: '#fff' },
  statPeriod: { fontSize: 13, fontWeight: '400', color: theme.colors.textSecondary },
  saveBadge: { fontSize: 11, color: '#4CAF50', fontWeight: '600', marginTop: 4 },

  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },

  warningCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    marginTop: 16, padding: 14, borderRadius: theme.radius.md,
    backgroundColor: 'rgba(255,167,38,0.1)', borderWidth: 1, borderColor: 'rgba(255,167,38,0.2)',
  },
  warningTitle: { fontSize: 13, fontWeight: '600', color: '#FFA726' },
  warningText: { fontSize: 11, color: 'rgba(255,167,38,0.7)', marginTop: 2 },

  manageDesc: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 16, lineHeight: 20 },

  portalBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: theme.colors.redPrimary, paddingVertical: 14,
    borderRadius: theme.radius.full, ...theme.shadow.red,
  },
  portalBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  noCustomerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12,
  },
  noCustomerText: { fontSize: 11, color: theme.colors.textMuted },

  stripePoweredRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.glassBorder,
  },
  stripePoweredText: { fontSize: 11, color: theme.colors.textMuted },
});
