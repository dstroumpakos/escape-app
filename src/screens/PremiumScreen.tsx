import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { theme } from '../theme';
import { useUser } from '../UserContext';
import { useTranslation } from '../i18n';
import type { Id } from '../../convex/_generated/dataModel';
import type { ProductSubscription, Purchase } from 'react-native-iap';
import {
  initIAP,
  disconnectIAP,
  fetchSubscriptionProducts,
  purchaseSubscription,
  restorePurchases,
  acknowledgePurchase,
  extractReceiptData,
  onPurchaseUpdated,
  onPurchaseError,
  IAP_PRODUCT_IDS,
} from '../iap';

export default function PremiumScreen() {
  const { t } = useTranslation();

  const PLAN_BENEFITS = [
    { icon: 'rocket-outline' as const, title: t('premium.benefitEarlyAccess'), desc: t('premium.benefitEarlyAccessDesc'), color: '#FF1E1E' },
    { icon: 'diamond-outline' as const, title: t('premium.benefitBadge'), desc: t('premium.benefitBadgeDesc'), color: '#CE93D8' },
    { icon: 'notifications-outline' as const, title: t('premium.benefitNotifications'), desc: t('premium.benefitNotificationsDesc'), color: '#42A5F5' },
    { icon: 'headset-outline' as const, title: t('premium.benefitSupport'), desc: t('premium.benefitSupportDesc'), color: '#4CAF50' },
    { icon: 'star-outline' as const, title: t('premium.benefitPartners'), desc: t('premium.benefitPartnersDesc'), color: '#FFD700' },
    { icon: 'shield-checkmark-outline' as const, title: t('premium.benefitCommunity'), desc: t('premium.benefitCommunityDesc'), color: '#FFA726' },
  ];
  const navigation = useNavigation();
  const { userId } = useUser();
  const [selectedPlan, setSelectedPlan] = useState<'yearly' | 'monthly'>('yearly');
  const [subscribing, setSubscribing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [products, setProducts] = useState<ProductSubscription[]>([]);

  const premiumStatus = useQuery(
    api.premium.getStatus,
    userId ? { userId: userId as Id<"users"> } : 'skip'
  );
  const subscribeWithIAP = useMutation(api.premium.subscribeWithIAP);
  const restoreWithIAP = useMutation(api.premium.restoreWithIAP);
  const cancelPremium = useMutation(api.premium.cancel);

  const isPremium = premiumStatus?.isPremium ?? false;

  // Keep a ref to userId so purchase listener always has the latest value
  const userIdRef = useRef(userId);
  useEffect(() => { userIdRef.current = userId; }, [userId]);

  // ─── Initialize IAP & purchase listeners ───
  useEffect(() => {
    let purchaseSub: { remove: () => void } | null = null;
    let errorSub: { remove: () => void } | null = null;

    const setup = async () => {
      await initIAP();
      const subs = await fetchSubscriptionProducts();
      setProducts(subs);

      // Listen for successful purchases
      purchaseSub = onPurchaseUpdated(async (purchase) => {
        const currentUserId = userIdRef.current;
        if (!currentUserId) return;

        const receipt = extractReceiptData(purchase);
        const plan = purchase.productId === IAP_PRODUCT_IDS.yearly ? 'yearly' : 'monthly';

        try {
          await subscribeWithIAP({
            userId: currentUserId as Id<"users">,
            plan,
            productId: receipt.productId,
            transactionId: receipt.transactionId,
            transactionReceipt: receipt.transactionReceipt,
            platform: receipt.platform,
            purchaseToken: receipt.purchaseToken,
          });

          // Acknowledge the purchase with the store
          await acknowledgePurchase(purchase);

          Alert.alert(
            t('premium.welcomeTitle'),
            t('premium.welcomeMessage'),
            [{ text: t('premium.welcomeBtn'), onPress: () => navigation.goBack() }]
          );
        } catch (e: any) {
          Alert.alert(t('premium.error'), e.message || t('premium.errorMessage'));
        }
        setSubscribing(false);
      });

      // Listen for purchase errors
      errorSub = onPurchaseError((error) => {
        if (error.code !== 'user-cancelled') {
          Alert.alert(t('premium.error'), error.message || t('premium.errorMessage'));
        }
        setSubscribing(false);
      });
    };

    setup();

    return () => {
      purchaseSub?.remove();
      errorSub?.remove();
      disconnectIAP();
    };
  }, []);

  // ─── Handle subscribe via native IAP ───
  const handleSubscribe = async () => {
    if (!userId) return;
    setSubscribing(true);
    try {
      await purchaseSubscription(selectedPlan);
      // The purchaseUpdatedListener will handle the rest
    } catch (e: any) {
      // User cancelled or store error — listener already handles errors
      setSubscribing(false);
    }
  };

  // ─── Handle restore purchases ───
  const handleRestore = async () => {
    if (!userId) return;
    setRestoring(true);
    try {
      const purchases = await restorePurchases();

      // Find the most recent premium subscription purchase
      const premiumPurchase = purchases.find(
        (p) => p.productId === IAP_PRODUCT_IDS.monthly || p.productId === IAP_PRODUCT_IDS.yearly
      );

      if (!premiumPurchase) {
        Alert.alert(t('premium.restoreTitle'), t('premium.restoreNoneFound'));
        setRestoring(false);
        return;
      }

      const receipt = extractReceiptData(premiumPurchase);
      await restoreWithIAP({
        userId: userId as Id<"users">,
        productId: receipt.productId,
        transactionId: receipt.transactionId,
        platform: receipt.platform,
        purchaseToken: receipt.purchaseToken,
      });

      Alert.alert(t('premium.restoreTitle'), t('premium.restoreSuccess'));
    } catch (e: any) {
      Alert.alert(t('premium.error'), e.message || t('premium.restoreError'));
    }
    setRestoring(false);
  };

  const handleCancel = () => {
    Alert.alert(
      t('premium.cancelTitle'),
      t('premium.cancelMessage'),
      [
        { text: t('premium.keepPremium'), style: 'cancel' },
        {
          text: t('premium.cancel'), style: 'destructive',
          onPress: async () => {
            try {
              const result = await cancelPremium({ userId: userId as Id<"users"> });
              Alert.alert(t('premium.cancelled'), t('premium.cancelledMessage'));
            } catch (e: any) {
              Alert.alert(t('premium.error'), e.message || t('premium.cancelledMessage'));
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('premium.headerTitle')}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
        {/* Hero */}
        <LinearGradient
          colors={['rgba(255,30,30,0.15)', 'rgba(255,30,30,0.03)', 'transparent']}
          style={styles.heroBg}
        >
          <View style={styles.heroIcon}>
            <Ionicons name="diamond" size={48} color={theme.colors.redPrimary} />
          </View>
          <Text style={styles.heroTitle}>{t('premium.heroTitle')}</Text>
          <Text style={styles.heroSubtitle}>
            {t('premium.heroSubtitle')}
          </Text>
        </LinearGradient>

        {/* Active status */}
        {isPremium && (
          <View style={styles.activeCard}>
            <View style={styles.activeCardInner}>
              <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
              <View style={{ flex: 1 }}>
                <Text style={styles.activeTitle}>{t('premium.activeTitle')}</Text>
                <Text style={styles.activeDesc}>
                  {t('premium.activeDesc')}
                </Text>
                {premiumStatus?.premiumExpiresAt && (
                  <Text style={styles.activeExpiry}>
                    {t('premium.renews')} {new Date(premiumStatus.premiumExpiresAt).toLocaleDateString()}
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}

        {/* How It Works */}
        <Text style={styles.sectionTitle}>{t('premium.howItWorks')}</Text>
        <View style={styles.stepsCard}>
          {[
            { step: '1', icon: 'add-circle-outline' as const, text: t('premium.step1') },
            { step: '2', icon: 'eye-outline' as const, text: t('premium.step2') },
            { step: '3', icon: 'calendar-outline' as const, text: t('premium.step3') },
          ].map((item, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={styles.stepCircle}>
                <Text style={styles.stepNum}>{item.step}</Text>
              </View>
              <View style={styles.stepLine} />
              <Ionicons name={item.icon} size={20} color={theme.colors.redPrimary} style={{ marginRight: 10 }} />
              <Text style={styles.stepText}>{item.text}</Text>
            </View>
          ))}
        </View>

        {/* Benefits */}
        <Text style={styles.sectionTitle}>{t('premium.whatYouGet')}</Text>
        {PLAN_BENEFITS.map((perk, i) => (
          <View key={i} style={styles.perkCard}>
            <View style={[styles.perkIcon, { backgroundColor: `${perk.color}15` }]}>
              <Ionicons name={perk.icon} size={22} color={perk.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.perkTitle}>{perk.title}</Text>
              <Text style={styles.perkDesc}>{perk.desc}</Text>
            </View>
          </View>
        ))}

        {/* Plan Selection */}
        {!isPremium && (
          <>
            <Text style={styles.sectionTitle}>{t('premium.choosePlan')}</Text>
            <View style={styles.planRow}>
              {/* Yearly */}
              <TouchableOpacity
                style={[styles.planCard, selectedPlan === 'yearly' && styles.planCardActive]}
                onPress={() => setSelectedPlan('yearly')}
              >
                <View style={styles.saveBadge}>
                  <Text style={styles.saveText}>{t('premium.save50')}</Text>
                </View>
                <Text style={[styles.planPrice, selectedPlan === 'yearly' && styles.planPriceActive]}>
                  {products.find(p => p.productId === IAP_PRODUCT_IDS.yearly)?.localizedPrice ?? '€29.99'}
                </Text>
                <Text style={styles.planPeriod}>{t('premium.perYear')}</Text>
                <Text style={styles.planPerMonth}>{t('premium.monthlyRate')}</Text>
                <View style={[styles.planRadio, selectedPlan === 'yearly' && styles.planRadioActive]}>
                  {selectedPlan === 'yearly' && <View style={styles.planRadioDot} />}
                </View>
              </TouchableOpacity>

              {/* Monthly */}
              <TouchableOpacity
                style={[styles.planCard, selectedPlan === 'monthly' && styles.planCardActive]}
                onPress={() => setSelectedPlan('monthly')}
              >
                <Text style={[styles.planPrice, selectedPlan === 'monthly' && styles.planPriceActive]}>
                  {products.find(p => p.productId === IAP_PRODUCT_IDS.monthly)?.localizedPrice ?? '€4.99'}
                </Text>
                <Text style={styles.planPeriod}>{t('premium.perMonth')}</Text>
                <Text style={styles.planPerMonth}>{t('premium.billedMonthly')}</Text>
                <View style={[styles.planRadio, selectedPlan === 'monthly' && styles.planRadioActive]}>
                  {selectedPlan === 'monthly' && <View style={styles.planRadioDot} />}
                </View>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Cancel option for active premium */}
        {isPremium && (
          <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
            <Ionicons name="close-circle-outline" size={16} color={theme.colors.textMuted} />
            <Text style={styles.cancelText}>{t('premium.cancelSubscription')}</Text>
          </TouchableOpacity>
        )}

        {/* Restore Purchases (Apple requirement) */}
        {!isPremium && (
          <TouchableOpacity
            style={styles.restoreBtn}
            disabled={restoring}
            onPress={handleRestore}
          >
            {restoring ? (
              <ActivityIndicator size="small" color={theme.colors.textSecondary} />
            ) : (
              <Text style={styles.restoreText}>{t('premium.restore')}</Text>
            )}
          </TouchableOpacity>
        )}

        {/* Subscription Terms (Apple Guideline 3.1.2(c)) */}
        <View style={styles.legalSection}>
          <Text style={styles.legalText}>
            {t('premium.autoRenewNotice')}
          </Text>
          <View style={styles.legalLinks}>
            <TouchableOpacity onPress={() => navigation.navigate('TermsOfService' as any)}>
              <Text style={styles.legalLink}>{t('premium.termsOfService')}</Text>
            </TouchableOpacity>
            <Text style={styles.legalDivider}>•</Text>
            <TouchableOpacity onPress={() => navigation.navigate('PrivacyPolicy' as any)}>
              <Text style={styles.legalLink}>{t('premium.privacyPolicy')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Subscribe Button */}
      {!isPremium && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.subscribeBtn, subscribing && { opacity: 0.6 }]}
            disabled={subscribing}
            onPress={handleSubscribe}
          >
            <LinearGradient
              colors={[theme.colors.redPrimary, '#CC1818']}
              style={styles.subscribeBtnGrad}
            >
              {subscribing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="diamond" size={20} color="#fff" />
                  <Text style={styles.subscribeBtnText}>
                    {selectedPlan === 'yearly' ? t('premium.subscribeYearly') : t('premium.subscribeMonthly')}
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.footerNote}>{t('premium.footerNote')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.colors.glass, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },

  // Hero
  heroBg: { paddingTop: 20, paddingBottom: 30, alignItems: 'center' },
  heroIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,30,30,0.12)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(255,30,30,0.2)',
  },
  heroTitle: { fontSize: 28, fontWeight: '900', color: '#fff', marginBottom: 8 },
  heroSubtitle: {
    fontSize: 15, color: theme.colors.textSecondary, textAlign: 'center',
    paddingHorizontal: 40, lineHeight: 22,
  },

  // Active
  activeCard: {
    marginHorizontal: 20, marginBottom: 24, padding: 16,
    borderRadius: theme.radius.lg,
    backgroundColor: 'rgba(76,175,80,0.08)',
    borderWidth: 1, borderColor: 'rgba(76,175,80,0.2)',
  },
  activeCardInner: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  activeTitle: { fontSize: 16, fontWeight: '700', color: '#4CAF50' },
  activeDesc: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },
  activeExpiry: { fontSize: 11, color: theme.colors.textMuted, marginTop: 4 },

  // Sections
  sectionTitle: {
    fontSize: 18, fontWeight: '700', color: '#fff',
    paddingHorizontal: 20, marginBottom: 14, marginTop: 8,
  },

  // Steps
  stepsCard: {
    marginHorizontal: 20, marginBottom: 24, padding: 16,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  stepRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 14,
  },
  stepCircle: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: theme.colors.redSubtle,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,30,30,0.3)',
    marginRight: 10,
  },
  stepNum: { fontSize: 12, fontWeight: '800', color: theme.colors.redPrimary },
  stepLine: {
    width: 0, height: 0,
  },
  stepText: { flex: 1, fontSize: 13, color: theme.colors.textSecondary, lineHeight: 18 },

  // Perks
  perkCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginHorizontal: 20, marginBottom: 10, padding: 14,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  perkIcon: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  perkTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },
  perkDesc: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },

  // Plans
  planRow: {
    flexDirection: 'row', gap: 12,
    paddingHorizontal: 20, marginBottom: 24,
  },
  planCard: {
    flex: 1, alignItems: 'center', padding: 20,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 2, borderColor: theme.colors.glassBorder,
  },
  planCardActive: {
    borderColor: theme.colors.redPrimary,
    backgroundColor: 'rgba(255,30,30,0.05)',
  },
  saveBadge: {
    position: 'absolute', top: -10,
    paddingVertical: 3, paddingHorizontal: 10,
    borderRadius: 10, backgroundColor: '#4CAF50',
  },
  saveText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  planPrice: { fontSize: 28, fontWeight: '900', color: theme.colors.textSecondary, marginTop: 8 },
  planPriceActive: { color: '#fff' },
  planPeriod: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  planPerMonth: { fontSize: 11, color: theme.colors.textMuted, marginTop: 6 },
  planRadio: {
    width: 22, height: 22, borderRadius: 11, marginTop: 12,
    borderWidth: 2, borderColor: theme.colors.glassBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  planRadioActive: { borderColor: theme.colors.redPrimary },
  planRadioDot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: theme.colors.redPrimary,
  },

  // Cancel
  cancelBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginHorizontal: 20, marginTop: 16, paddingVertical: 14,
  },
  cancelText: { fontSize: 14, color: theme.colors.textMuted },

  // Restore Purchases
  restoreBtn: {
    alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 20, marginTop: 8, paddingVertical: 12,
  },
  restoreText: { fontSize: 14, color: theme.colors.textSecondary, textDecorationLine: 'underline' },

  // Legal / Subscription Terms
  legalSection: {
    marginHorizontal: 20, marginTop: 16, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: theme.colors.border,
  },
  legalText: {
    fontSize: 11, color: theme.colors.textMuted, lineHeight: 17, textAlign: 'center',
  },
  legalLinks: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: 10, gap: 8,
  },
  legalLink: { fontSize: 12, color: theme.colors.redPrimary, textDecorationLine: 'underline' },
  legalDivider: { fontSize: 12, color: theme.colors.textMuted },

  // Footer
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36,
    backgroundColor: 'rgba(26,13,13,0.97)',
    borderTopWidth: 1, borderTopColor: theme.colors.border,
    alignItems: 'center',
  },
  subscribeBtn: { width: '100%' },
  subscribeBtnGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 18, borderRadius: theme.radius.full,
  },
  subscribeBtnText: { fontSize: 17, fontWeight: '800', color: '#fff' },
  footerNote: { fontSize: 11, color: theme.colors.textMuted, marginTop: 8 },
});
