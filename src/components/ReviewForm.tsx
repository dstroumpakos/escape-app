import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { theme } from '../theme';
import { useTranslation } from '../i18n';
import { PrimaryButton } from './ui';

/**
 * "Write a review" for a room, shown only to players with a completed booking
 * they have not reviewed yet (the same rule the website uses).
 */
export function ReviewForm({ userId, roomId }: { userId: string | null; roomId: string }) {
  const { t } = useTranslation();
  const eligibility = useQuery(
    api.reviews.canReview,
    userId ? { userId: userId as Id<'users'>, roomId: roomId as Id<'rooms'> } : 'skip',
  );
  const submitReview = useMutation(api.reviews.submit);

  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  if (done) {
    return (
      <View style={styles.success}>
        <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} />
        <Text style={styles.successText}>{t('reviews.success')}</Text>
      </View>
    );
  }
  if (!userId || !eligibility?.canReview || !eligibility.bookingId) return null;

  if (!open) {
    return (
      <TouchableOpacity style={styles.openBtn} onPress={() => setOpen(true)} accessibilityRole="button">
        <Ionicons name="create-outline" size={16} color={theme.colors.redLight} />
        <Text style={styles.openBtnText}>{t('reviews.write_review')}</Text>
      </TouchableOpacity>
    );
  }

  const submit = async () => {
    if (rating === 0 || submitting) return;
    setSubmitting(true);
    setFailed(false);
    try {
      await submitReview({
        userId: userId as Id<'users'>,
        roomId: roomId as Id<'rooms'>,
        bookingId: eligibility.bookingId as Id<'bookings'>,
        rating,
        text: text.trim() || undefined,
      });
      setDone(true);
    } catch {
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.form}>
      <Text style={styles.formTitle}>{t('reviews.write_review')}</Text>
      <Text style={styles.label}>{t('reviews.your_rating')}</Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((s) => (
          <TouchableOpacity
            key={s}
            onPress={() => setRating(s)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`${s}/5`}
            accessibilityState={{ selected: rating === s }}
          >
            <Ionicons
              name={s <= rating ? 'star' : 'star-outline'}
              size={30}
              color={s <= rating ? theme.colors.gold : theme.colors.textMuted}
            />
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder={t('reviews.your_review')}
        placeholderTextColor={theme.colors.textMuted}
        multiline
        maxLength={1000}
        textAlignVertical="top"
      />
      {failed && <Text style={styles.error}>{t('checkout.bookingFailed')}</Text>}
      <PrimaryButton
        label={submitting ? t('reviews.submitting') : t('reviews.submit')}
        onPress={submit}
        disabled={rating === 0}
        loading={submitting}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  openBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, marginBottom: 14,
    borderRadius: theme.radius.lg,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1, borderColor: 'rgba(200, 16, 27, 0.7)',
  },
  openBtnText: { fontSize: 14, fontWeight: '600', color: theme.colors.redLight },

  form: {
    padding: 16, marginBottom: 16, gap: 10,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  formTitle: { fontFamily: theme.fonts.display, fontSize: 18, color: theme.colors.bone },
  label: { fontSize: 13, color: theme.colors.textSecondary },
  stars: { flexDirection: 'row', gap: 8 },
  input: {
    minHeight: 90, padding: 12, fontSize: 14, lineHeight: 20,
    color: theme.colors.textPrimary,
    borderRadius: theme.radius.md,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  error: { fontSize: 13, color: theme.colors.redLight },

  success: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, marginBottom: 14,
    borderRadius: theme.radius.lg,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderWidth: 1, borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  successText: { fontSize: 14, color: theme.colors.success },
});
