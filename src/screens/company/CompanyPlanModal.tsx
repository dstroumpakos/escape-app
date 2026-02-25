import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, ActivityIndicator, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';
import type { Id } from '../../../convex/_generated/dataModel';

interface Props {
  visible: boolean;
  onClose: () => void;
  companyId: string;
  currentPlan: string;
}

const PLANS = [
  {
    id: 'starter' as const,
    icon: 'rocket-outline' as const,
    color: '#4CAF50',
    priceMonth: '€29',
    priceYear: '€290',
    features: ['onboarding.plan1f1', 'onboarding.plan1f2', 'onboarding.plan1f3'],
  },
  {
    id: 'pro' as const,
    icon: 'diamond-outline' as const,
    color: theme.colors.redPrimary,
    priceMonth: '€49',
    priceYear: '€490',
    popular: true,
    features: ['onboarding.plan2f1', 'onboarding.plan2f2', 'onboarding.plan2f3', 'onboarding.plan2f4'],
  },
  {
    id: 'enterprise' as const,
    icon: 'business-outline' as const,
    color: '#7C4DFF',
    priceMonth: '€99',
    priceYear: '€990',
    features: ['onboarding.plan3f1', 'onboarding.plan3f2', 'onboarding.plan3f3', 'onboarding.plan3f4'],
  },
];

export default function CompanyPlanModal({ visible, onClose, companyId, currentPlan }: Props) {
  const { t } = useTranslation();
  const selectPlan = useMutation(api.companies.selectPlan);
  const [loading, setLoading] = useState(false);

  const handleSelectPlan = async (planId: 'starter' | 'pro' | 'enterprise') => {
    if (planId === currentPlan) {
      onClose();
      return;
    }

    setLoading(true);
    try {
      await selectPlan({
        companyId: companyId as Id<"companies">,
        plan: planId,
      });
      Alert.alert(t('success'), t('settings.planUpdated'));
      onClose();
    } catch (error) {
      Alert.alert(t('error'), t('settings.updateFailed'));
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

          {PLANS.map((plan) => {
            const isCurrent = plan.id === currentPlan;
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
                  <View style={[styles.iconBox, { backgroundColor: `${plan.color}20` }]}>
                    <Ionicons name={plan.icon} size={24} color={plan.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.planName}>{t(`onboarding.plan${plan.id.charAt(0).toUpperCase() + plan.id.slice(1)}`)}</Text>
                    <Text style={styles.planPrice}>
                      {plan.priceMonth}<Text style={styles.planPeriod}>/mo</Text>
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
                      <Ionicons name="checkmark-circle" size={18} color={plan.color} />
                      <Text style={styles.featureText}>{t(feat as any)}</Text>
                    </View>
                  ))}
                </View>

                {!isCurrent && (
                  <View style={[styles.selectBtn, { backgroundColor: plan.color }]}>
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