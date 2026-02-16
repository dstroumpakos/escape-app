import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { theme } from '../../theme';
import type { Id } from '../../../convex/_generated/dataModel';

interface Props {
  companyId: string;
}

export default function CompanySubscription({ companyId }: Props) {
  const company = useQuery(api.companies.getById, { id: companyId as Id<"companies"> });
  const subscribers = useQuery(api.companies.getSubscribers, { companyId: companyId as Id<"companies"> });
  const updateSub = useMutation(api.companies.updateSubscription);

  const [enabled, setEnabled] = useState(false);
  const [monthly, setMonthly] = useState('');
  const [yearly, setYearly] = useState('');
  const [perks, setPerks] = useState<string[]>([]);
  const [newPerk, setNewPerk] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (company) {
      setEnabled(company.subscriptionEnabled);
      setMonthly(String(company.subscriptionMonthlyPrice ?? ''));
      setYearly(String(company.subscriptionYearlyPrice ?? ''));
      setPerks(company.subscriptionPerks ?? []);
    }
  }, [company]);

  const addPerk = () => {
    if (newPerk.trim()) {
      setPerks((prev) => [...prev, newPerk.trim()]);
      setNewPerk('');
    }
  };

  const removePerk = (idx: number) => {
    setPerks((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSub({
        companyId: companyId as Id<"companies">,
        subscriptionEnabled: enabled,
        subscriptionMonthlyPrice: parseFloat(monthly) || undefined,
        subscriptionYearlyPrice: parseFloat(yearly) || undefined,
        subscriptionPerks: perks.length > 0 ? perks : undefined,
      });
      Alert.alert('Saved', 'Subscription settings updated.');
    } catch {
      Alert.alert('Error', 'Failed to save settings.');
    }
    setSaving(false);
  };

  const activeCount = subscribers?.filter((s: any) => s.isActive).length ?? 0;
  const totalRevenue = subscribers?.reduce((sum: number, s: any) => sum + (s.isActive ? s.price : 0), 0) ?? 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Subscriptions</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons name="people" size={22} color="#CE93D8" />
            <Text style={styles.statVal}>{activeCount}</Text>
            <Text style={styles.statLabel}>Active Subs</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="cash" size={22} color={theme.colors.success} />
            <Text style={styles.statVal}>€{totalRevenue}/mo</Text>
            <Text style={styles.statLabel}>Monthly Rev</Text>
          </View>
        </View>

        {/* Enable Toggle */}
        <View style={styles.card}>
          <TouchableOpacity style={styles.toggleRow} onPress={() => setEnabled(!enabled)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Enable Subscription Program</Text>
              <Text style={styles.cardDesc}>
                Let players subscribe monthly or yearly to access exclusive rooms, early booking, and special perks.
              </Text>
            </View>
            <View style={[styles.switch, enabled && styles.switchOn]}>
              <View style={[styles.switchThumb, enabled && styles.switchThumbOn]} />
            </View>
          </TouchableOpacity>
        </View>

        {enabled && (
          <>
            {/* Pricing */}
            <Text style={styles.sectionTitle}>Pricing</Text>
            <View style={styles.card}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Monthly Price (€)</Text>
                  <TextInput
                    style={styles.input}
                    value={monthly}
                    onChangeText={setMonthly}
                    keyboardType="decimal-pad"
                    placeholder="9.99"
                    placeholderTextColor={theme.colors.textMuted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Yearly Price (€)</Text>
                  <TextInput
                    style={styles.input}
                    value={yearly}
                    onChangeText={setYearly}
                    keyboardType="decimal-pad"
                    placeholder="89.99"
                    placeholderTextColor={theme.colors.textMuted}
                  />
                </View>
              </View>
              {monthly && yearly && (
                <Text style={styles.savings}>
                  Yearly saves players €{(parseFloat(monthly) * 12 - parseFloat(yearly)).toFixed(2)}/year
                </Text>
              )}
            </View>

            {/* Perks */}
            <Text style={styles.sectionTitle}>Subscriber Perks</Text>
            <View style={styles.card}>
              {perks.map((perk, i) => (
                <View key={i} style={styles.perkRow}>
                  <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} />
                  <Text style={styles.perkText}>{perk}</Text>
                  <TouchableOpacity onPress={() => removePerk(i)}>
                    <Ionicons name="close" size={18} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}
              <View style={styles.addPerkRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={newPerk}
                  onChangeText={setNewPerk}
                  placeholder="e.g. Early access to new rooms"
                  placeholderTextColor={theme.colors.textMuted}
                  onSubmitEditing={addPerk}
                />
                <TouchableOpacity style={styles.addPerkBtn} onPress={addPerk}>
                  <Ionicons name="add" size={20} color={theme.colors.redPrimary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* What subscribers get */}
            <Text style={styles.sectionTitle}>Default Benefits</Text>
            <View style={styles.card}>
              {[
                'Access to subscription-only rooms',
                'Priority booking on all rooms',
                'Early access to new experiences',
                '10% discount on regular rooms',
                'Exclusive seasonal events',
              ].map((benefit, i) => (
                <View key={i} style={styles.benefitRow}>
                  <Ionicons name="star" size={14} color="#FFD700" />
                  <Text style={styles.benefitText}>{benefit}</Text>
                </View>
              ))}
            </View>

            {/* Subscribers List */}
            <Text style={styles.sectionTitle}>Current Subscribers</Text>
            {!subscribers || subscribers.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="people-outline" size={32} color={theme.colors.textMuted} />
                <Text style={styles.emptyText}>No subscribers yet</Text>
              </View>
            ) : (
              <View style={styles.card}>
                {subscribers.map((sub: any, i: number) => (
                  <View key={i} style={styles.subRow}>
                    <View style={styles.subAvatar}>
                      <Text style={styles.subInitial}>{sub.userName[0]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.subName}>{sub.userName}</Text>
                      <Text style={styles.subPlan}>
                        {sub.plan === 'monthly' ? 'Monthly' : 'Yearly'} — €{sub.price}/
                        {sub.plan === 'monthly' ? 'mo' : 'yr'}
                      </Text>
                    </View>
                    <View style={[styles.subStatus, sub.isActive ? styles.subActive : styles.subInactive]}>
                      <Text style={styles.subStatusText}>{sub.isActive ? 'Active' : 'Expired'}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Save */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          disabled={saving}
          onPress={handleSave}
          activeOpacity={0.8}
        >
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Settings'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },

  statsRow: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 20, marginBottom: 20,
  },
  statCard: {
    flex: 1, alignItems: 'center', gap: 6,
    padding: 16, borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  statVal: { fontSize: 22, fontWeight: '800', color: '#fff' },
  statLabel: { fontSize: 10, color: theme.colors.textMuted },

  card: {
    marginHorizontal: 20, padding: 16, marginBottom: 16,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 4 },
  cardDesc: { fontSize: 12, color: theme.colors.textMuted, lineHeight: 18 },

  sectionTitle: {
    fontSize: 16, fontWeight: '700', color: '#fff',
    paddingHorizontal: 20, marginBottom: 10, marginTop: 4,
  },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  switch: {
    width: 50, height: 28, borderRadius: 14,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    justifyContent: 'center', paddingHorizontal: 2,
  },
  switchOn: { backgroundColor: theme.colors.redPrimary, borderColor: theme.colors.redPrimary },
  switchThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  switchThumbOn: { alignSelf: 'flex-end' },

  row: { flexDirection: 'row', gap: 12 },
  label: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: 6 },
  input: {
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    color: '#fff', fontSize: 14,
  },
  savings: {
    fontSize: 12, fontWeight: '600', color: theme.colors.success,
    marginTop: 10, textAlign: 'center',
  },

  perkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  perkText: { flex: 1, fontSize: 14, color: '#fff' },
  addPerkRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  addPerkBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: theme.colors.glass, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },

  benefitRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 6,
  },
  benefitText: { fontSize: 13, color: theme.colors.textSecondary },

  emptyCard: {
    marginHorizontal: 20, alignItems: 'center', paddingVertical: 30,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    gap: 8,
  },
  emptyText: { fontSize: 14, color: theme.colors.textMuted },

  subRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  subAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: theme.colors.redSubtle,
    alignItems: 'center', justifyContent: 'center',
  },
  subInitial: { fontSize: 14, fontWeight: '700', color: theme.colors.redPrimary },
  subName: { fontSize: 14, fontWeight: '600', color: '#fff' },
  subPlan: { fontSize: 11, color: theme.colors.textMuted },
  subStatus: {
    paddingVertical: 3, paddingHorizontal: 10, borderRadius: 10,
  },
  subActive: { backgroundColor: 'rgba(76,175,80,0.15)' },
  subInactive: { backgroundColor: 'rgba(244,67,54,0.15)' },
  subStatusText: { fontSize: 10, fontWeight: '700', color: theme.colors.success },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36,
    backgroundColor: 'rgba(26,13,13,0.95)',
    borderTopWidth: 1, borderTopColor: theme.colors.border,
  },
  saveBtn: {
    paddingVertical: 16, borderRadius: theme.radius.full,
    backgroundColor: theme.colors.redPrimary, alignItems: 'center',
    ...theme.shadow.red,
  },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
