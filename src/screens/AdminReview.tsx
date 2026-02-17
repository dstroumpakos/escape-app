import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, TextInput, ActivityIndicator, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { theme } from '../theme';
import { useTranslation } from '../i18n';
import type { Id } from '../../convex/_generated/dataModel';
import { useUser } from '../UserContext';

interface Props {
  onBack: () => void;
}

const STATUS_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  pending_terms: { label: 'Terms Pending', color: '#42A5F5', icon: 'document-text-outline' },
  pending_plan: { label: 'Plan Pending', color: '#42A5F5', icon: 'card-outline' },
  pending_review: { label: 'Awaiting Review', color: '#FFA726', icon: 'hourglass-outline' },
  approved: { label: 'Approved', color: '#4CAF50', icon: 'checkmark-circle' },
  declined: { label: 'Declined', color: '#F44336', icon: 'close-circle' },
};

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter — €29/mo',
  pro: 'Pro — €59/mo',
  enterprise: 'Enterprise — €99/mo',
};

export default function AdminReview({ onBack }: Props) {
  const { t } = useTranslation();
  const { userId } = useUser();
  const companies = useQuery(api.companies.getAllCompanies, userId ? { userId: userId as Id<"users"> } : "skip");
  const approveMut = useMutation(api.companies.approveCompany);
  const declineMut = useMutation(api.companies.declineCompany);

  const [filter, setFilter] = useState<'pending_review' | 'all'>('pending_review');
  const [declineModal, setDeclineModal] = useState<string | null>(null);
  const [declineNotes, setDeclineNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const filtered = (companies || []).filter((c: any) =>
    filter === 'all' ? true : c.onboardingStatus === 'pending_review'
  );

  const handleApprove = (id: string, name: string) => {
    Alert.alert(
      t('admin.approveTitle'),
      t('admin.approveMsg', { name }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('admin.approve'),
          onPress: async () => {
            try {
              setLoading(true);
              await approveMut({ companyId: id as Id<"companies">, userId: userId as Id<"users"> });
            } catch (err: any) {
              Alert.alert(t('error'), err.message || 'Failed to approve company');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleDecline = async () => {
    if (!declineModal || !declineNotes.trim()) {
      Alert.alert(t('error'), t('admin.notesRequired'));
      return;
    }
    try {
      setLoading(true);
      await declineMut({
        companyId: declineModal as Id<"companies">,
        notes: declineNotes.trim(),
        userId: userId as Id<"users">,
      });
      setDeclineModal(null);
      setDeclineNotes('');
    } catch (err: any) {
      Alert.alert(t('error'), err.message || 'Failed to decline company');
    } finally {
      setLoading(false);
    }
  };

  if (!companies) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.colors.redPrimary} />
      </View>
    );
  }

  const pendingCount = companies.filter((c: any) => c.onboardingStatus === 'pending_review').length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('admin.title')}</Text>
        {pendingCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{pendingCount}</Text>
          </View>
        )}
      </View>

      {/* Filter */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterBtn, filter === 'pending_review' && styles.filterBtnActive]}
          onPress={() => setFilter('pending_review')}
        >
          <Text style={[styles.filterText, filter === 'pending_review' && styles.filterTextActive]}>
            {t('admin.pending')} ({pendingCount})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterBtn, filter === 'all' && styles.filterBtnActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            {t('admin.allCompanies')}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 40 }}>
        {filtered.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="checkmark-done-circle-outline" size={56} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>{t('admin.noPending')}</Text>
            <Text style={styles.emptySubtitle}>{t('admin.noPendingSub')}</Text>
          </View>
        ) : (
          filtered.map((c: any) => {
            const st = STATUS_LABELS[c.onboardingStatus || 'approved'] || STATUS_LABELS.approved;
            return (
              <View key={c._id} style={styles.companyCard}>
                {/* Company info */}
                <View style={styles.cardTop}>
                  <View style={styles.cardInfo}>
                    <Text style={styles.companyName}>{c.name}</Text>
                    <Text style={styles.companyDetail}>{c.email}</Text>
                    <Text style={styles.companyDetail}>{c.city}{c.address ? ` · ${c.address}` : ''}</Text>
                    {c.phone && <Text style={styles.companyDetail}>{c.phone}</Text>}
                    {c.vatNumber && <Text style={styles.companyDetail}>ΑΦΜ: {c.vatNumber}</Text>}
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: st.color + '20' }]}>
                    <Ionicons name={st.icon as any} size={14} color={st.color} />
                    <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
                  </View>
                </View>

                {/* Plan & dates */}
                <View style={styles.cardMeta}>
                  {c.platformPlan && (
                    <View style={styles.metaItem}>
                      <Ionicons name="card-outline" size={14} color={theme.colors.textMuted} />
                      <Text style={styles.metaText}>{PLAN_LABELS[c.platformPlan] || c.platformPlan}</Text>
                    </View>
                  )}
                  {c.termsAcceptedAt && (
                    <View style={styles.metaItem}>
                      <Ionicons name="document-text-outline" size={14} color={theme.colors.textMuted} />
                      <Text style={styles.metaText}>
                        {t('admin.termsAccepted')} {new Date(c.termsAcceptedAt).toLocaleDateString()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={14} color={theme.colors.textMuted} />
                    <Text style={styles.metaText}>
                      {t('admin.registered')} {new Date(c.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                </View>

                {c.description ? (
                  <Text style={styles.description} numberOfLines={3}>{c.description}</Text>
                ) : null}

                {c.adminNotes && (
                  <View style={styles.prevNotes}>
                    <Text style={styles.prevNotesLabel}>{t('admin.previousNotes')}</Text>
                    <Text style={styles.prevNotesText}>{c.adminNotes}</Text>
                  </View>
                )}

                {/* Actions */}
                {c.onboardingStatus !== 'approved' && (
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.approveBtn}
                      onPress={() => handleApprove(c._id, c.name)}
                    >
                      <Ionicons name="checkmark-circle" size={18} color="#fff" />
                      <Text style={styles.approveBtnText}>{t('admin.approve')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.declineBtn}
                      onPress={() => {
                        setDeclineModal(c._id);
                        setDeclineNotes('');
                      }}
                    >
                      <Ionicons name="close-circle" size={18} color="#F44336" />
                      <Text style={styles.declineBtnText}>{t('admin.decline')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Decline Modal */}
      <Modal visible={!!declineModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('admin.declineTitle')}</Text>
            <Text style={styles.modalSubtitle}>{t('admin.declineHint')}</Text>
            <TextInput
              style={styles.modalInput}
              value={declineNotes}
              onChangeText={setDeclineNotes}
              placeholder={t('admin.notesPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              multiline
              numberOfLines={4}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setDeclineModal(null)}
              >
                <Text style={styles.modalCancelText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalDecline}
                onPress={handleDecline}
                disabled={loading}
              >
                <Text style={styles.modalDeclineText}>
                  {loading ? t('companyAuth.pleaseWait') : t('admin.sendDecline')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.colors.glass, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff', flex: 1 },
  badge: {
    minWidth: 24, height: 24, borderRadius: 12,
    backgroundColor: theme.colors.redPrimary,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  badgeText: { fontSize: 12, fontWeight: '800', color: '#fff' },

  filterRow: {
    flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginBottom: 12,
  },
  filterBtn: {
    paddingVertical: 8, paddingHorizontal: 18, borderRadius: theme.radius.full,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  filterBtnActive: { backgroundColor: theme.colors.redSubtle, borderColor: theme.colors.redPrimary },
  filterText: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted },
  filterTextActive: { color: theme.colors.redPrimary },

  scroll: { flex: 1, paddingHorizontal: 20 },
  emptyWrap: { alignItems: 'center', marginTop: 80, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  emptySubtitle: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center' },

  companyCard: {
    padding: 18, borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder, marginBottom: 14,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between' },
  cardInfo: { flex: 1, marginRight: 10 },
  companyName: { fontSize: 17, fontWeight: '800', color: '#fff', marginBottom: 4 },
  companyDetail: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 2 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 4, paddingHorizontal: 10, borderRadius: 16,
    alignSelf: 'flex-start',
  },
  statusText: { fontSize: 11, fontWeight: '700' },

  cardMeta: { marginTop: 12, gap: 6 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText: { fontSize: 12, color: theme.colors.textMuted },

  description: {
    fontSize: 13, color: theme.colors.textSecondary,
    marginTop: 10, lineHeight: 18,
  },

  prevNotes: {
    marginTop: 10, padding: 12, borderRadius: theme.radius.md,
    backgroundColor: 'rgba(244,67,54,0.08)',
    borderWidth: 1, borderColor: 'rgba(244,67,54,0.2)',
  },
  prevNotesLabel: { fontSize: 11, fontWeight: '700', color: '#F44336', marginBottom: 4 },
  prevNotesText: { fontSize: 13, color: theme.colors.textSecondary },

  actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  approveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: theme.radius.full,
    backgroundColor: '#4CAF50',
  },
  approveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  declineBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: theme.radius.full,
    backgroundColor: 'rgba(244,67,54,0.1)',
    borderWidth: 1, borderColor: 'rgba(244,67,54,0.3)',
  },
  declineBtnText: { fontSize: 14, fontWeight: '700', color: '#F44336' },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center', padding: 30,
  },
  modalCard: {
    width: '100%', padding: 24, borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 6 },
  modalSubtitle: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 16 },
  modalInput: {
    minHeight: 100, padding: 14, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    color: '#fff', fontSize: 14, textAlignVertical: 'top',
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalCancel: {
    flex: 1, paddingVertical: 12, borderRadius: theme.radius.full,
    backgroundColor: theme.colors.glass, alignItems: 'center',
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  modalCancelText: { fontSize: 14, fontWeight: '600', color: theme.colors.textMuted },
  modalDecline: {
    flex: 1, paddingVertical: 12, borderRadius: theme.radius.full,
    backgroundColor: '#F44336', alignItems: 'center',
  },
  modalDeclineText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
