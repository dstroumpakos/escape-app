import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { theme } from '../theme';
import { RootStackParamList } from '../types';
import { useTranslation } from '../i18n';
import { useUser } from '../UserContext';
import type { Id } from '../../convex/_generated/dataModel';
import { ROOM_THEME_KEYS } from '../roomThemes';
import { DifficultySkulls, PrimaryButton, TypeLabel } from '../components/ui';
import { FadeUp } from '../components/motion';
import { ReviewForm } from '../components/ReviewForm';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'RoomDetails'>;

const REVIEWS_SHOWN = 3;

export default function RoomDetails() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const roomId = route.params.id;

  const { t, language } = useTranslation();

  const convexRooms = useQuery(api.rooms.list);
  const allRooms = (convexRooms ?? []).map((r: any) => ({ ...r, id: r._id }));
  const room = allRooms.find((r: any) => r.id === roomId) || allRooms[0];
  const reviews = useQuery(api.reviews.getByRoom, room ? { roomId: room.id } : 'skip');

  // The heart saves the room to the player's wishlist (shown on Profile)
  const { userId } = useUser();
  const user = useQuery(api.users.getById, userId ? { userId: userId as Id<'users'> } : 'skip');
  const toggleWishlist = useMutation(api.users.toggleWishlist);
  const liked = !!room && !!(user as any)?.wishlist?.includes(room.id);
  const [showAllReviews, setShowAllReviews] = useState(false);

  // Compute release countdown
  const releaseCountdown = (() => {
    if (!room) return null;
    const rd = (room as any).releaseDate;
    if (!rd) return null;
    const releaseDate = new Date(rd + 'T00:00:00');
    const now = new Date();
    const diffMs = releaseDate.getTime() - now.getTime();
    if (diffMs <= 0) return null;
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return {
      days,
      releaseDateStr: releaseDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    };
  })();

  if (!room) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.colors.redPrimary} />
      </View>
    );
  }

  const hasReviews = (room.reviews ?? 0) > 0;
  const themeKey = ROOM_THEME_KEYS[room.theme];
  const tags: string[] = room.tags ?? [];

  const timeAgo = (createdAt: number) => {
    const diff = Date.now() - createdAt;
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor(diff / 60000);
    if (days > 0) return t('reviews.ago_days', { count: days });
    if (hours > 0) return t('reviews.ago_hours', { count: hours });
    if (mins > 0) return t('reviews.ago_minutes', { count: mins });
    return t('reviews.just_now');
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        {/* Header Image */}
        <View style={styles.headerImg}>
          {!!room.image && <Image source={{ uri: room.image }} style={styles.heroImage} />}
          <View style={styles.headerTint} />
          <LinearGradient
            colors={['rgba(8,5,5,0.55)', 'rgba(8,5,5,0)', 'rgba(8,5,5,0.5)', theme.colors.bgPrimary]}
            locations={[0, 0.3, 0.72, 1]}
            style={StyleSheet.absoluteFillObject}
          />

          <TouchableOpacity
            style={[styles.squareBtn, { top: insets.top + 8, left: 20 }]}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={t('checkout.back')}
          >
            <Ionicons name="arrow-back" size={20} color={theme.colors.bone} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.squareBtn, { top: insets.top + 8, right: 20 }]}
            onPress={() => {
              if (userId) toggleWishlist({ userId: userId as Id<'users'>, roomId: room.id }).catch(() => {});
            }}
            accessibilityRole="button"
            accessibilityLabel={t('profile.wishlist')}
            accessibilityState={{ selected: liked }}
          >
            <Ionicons
              name={liked ? 'heart' : 'heart-outline'}
              size={20}
              color={liked ? theme.colors.redLight : theme.colors.bone}
            />
          </TouchableOpacity>

          <View style={styles.headerTags}>
            {room.isFeatured && (
              <View style={[styles.tag, styles.tagFeatured]}>
                <Text style={styles.tagText}>{t('roomDetails.featured')}</Text>
              </View>
            )}
            {room.isNew && (
              <View style={[styles.tag, styles.tagNew]}>
                <Text style={styles.tagText}>{t('roomDetails.new')}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Content */}
        <FadeUp style={styles.content} delay={120}>
          {!!room.theme && <TypeLabel>{themeKey ? t(themeKey) : room.theme}</TypeLabel>}
          <Text style={styles.title}>{room.title}</Text>
          {!!room.location && (
            <View style={styles.locationRow}>
              <Ionicons name="location" size={14} color={theme.colors.redLight} />
              <Text style={styles.locationText}>{room.location}</Text>
            </View>
          )}

          <View style={styles.ratingRow}>
            <Ionicons
              name={hasReviews ? 'star' : 'star-outline'}
              size={16}
              color={hasReviews ? theme.colors.gold : theme.colors.textMuted}
            />
            {hasReviews && <Text style={styles.ratingVal}>{room.rating}</Text>}
            <Text style={styles.reviewsText}>{t('roomDetails.reviews', { count: room.reviews ?? 0 })}</Text>
          </View>

          {/* Release Countdown */}
          {releaseCountdown && (
            <View style={styles.countdown}>
              <View style={styles.countdownIcon}>
                <Ionicons name="calendar-outline" size={22} color={theme.colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <Ionicons name="diamond-outline" size={13} color={theme.colors.gold} />
                  <Text style={styles.countdownLabel}>{t('home.earlyAccess')}</Text>
                </View>
                <Text style={styles.countdownText}>
                  Launches <Text style={styles.countdownDate}>{releaseCountdown.releaseDateStr}</Text>
                </Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.countdownDays}>{releaseCountdown.days}</Text>
                <Text style={styles.countdownDaysLabel}>days left</Text>
              </View>
            </View>
          )}

          {/* Info Cards */}
          <View style={styles.infoCards}>
            <View style={styles.infoCard}>
              <DifficultySkulls level={room.difficulty ?? 3} max={room.maxDifficulty ?? 5} size={14} />
              <Text style={styles.infoValue}>{room.difficulty}/{room.maxDifficulty}</Text>
              <Text style={styles.infoLabel}>{t('roomDetails.difficulty')}</Text>
            </View>
            <View style={styles.infoCard}>
              <Ionicons name="time-outline" size={20} color={theme.colors.redLight} />
              <Text style={styles.infoValue}>{room.duration} {t('min')}</Text>
              <Text style={styles.infoLabel}>{t('roomDetails.duration')}</Text>
            </View>
            <View style={styles.infoCard}>
              <Ionicons name="people-outline" size={20} color={theme.colors.redLight} />
              <Text style={styles.infoValue}>{room.players}</Text>
              <Text style={styles.infoLabel}>{t('roomDetails.players')}</Text>
            </View>
          </View>

          {/* Story */}
          {!!room.story && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('roomDetails.theStory')}</Text>
              <Text style={styles.storyText}>{room.storyTranslations?.[language] || room.story}</Text>
            </View>
          )}

          {/* Experience Tags */}
          {tags.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('roomDetails.experienceTags')}</Text>
              <View style={styles.expTags}>
                {tags.map((tag) => (
                  <View key={tag} style={styles.expTag}>
                    <Text style={styles.expTagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Reviews */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t('roomDetails.reviewsSection')}
              {reviews && reviews.length > 0 ? <Text style={styles.reviewCount}>  ({reviews.length})</Text> : null}
            </Text>

            <ReviewForm userId={userId} roomId={room.id} />

            {!reviews ? (
              <ActivityIndicator color={theme.colors.redPrimary} style={{ paddingVertical: 20 }} />
            ) : reviews.length === 0 ? (
              <View style={styles.noReviews}>
                <Ionicons name="chatbox-outline" size={26} color={theme.colors.glassBorder} />
                <Text style={styles.noReviewsText}>{t('reviews.no_reviews')}</Text>
              </View>
            ) : (
              <>
                <View style={styles.reviewList}>
                  {(showAllReviews ? reviews : reviews.slice(0, REVIEWS_SHOWN)).map((review: any) => (
                    <View key={review._id} style={styles.review}>
                      <View style={styles.reviewer}>
                        {review.user?.avatar ? (
                          <Image source={{ uri: review.user.avatar }} style={styles.reviewerAvatar} />
                        ) : (
                          <View style={[styles.reviewerAvatar, styles.reviewerAvatarEmpty]}>
                            <Text style={styles.reviewerInitial}>{review.user?.name?.charAt(0) || '?'}</Text>
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.reviewerName} numberOfLines={1}>{review.user?.name}</Text>
                          <View style={styles.reviewMeta}>
                            <View style={styles.reviewStars}>
                              {[1, 2, 3, 4, 5].map((s) => (
                                <Ionicons
                                  key={s}
                                  name="star"
                                  size={11}
                                  color={s <= review.rating ? theme.colors.gold : theme.colors.glassBorder}
                                />
                              ))}
                            </View>
                            <Text style={styles.reviewTime}>{timeAgo(review.createdAt)}</Text>
                          </View>
                        </View>
                      </View>
                      {!!review.text && <Text style={styles.reviewText}>{review.text}</Text>}
                    </View>
                  ))}
                </View>
                {reviews.length > REVIEWS_SHOWN && (
                  <TouchableOpacity onPress={() => setShowAllReviews(!showAllReviews)} style={styles.showMore} hitSlop={8}>
                    <Text style={styles.showMoreText}>
                      {showAllReviews ? t('reviews.show_less') : t('reviews.show_more', { count: reviews.length })}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </FadeUp>
      </ScrollView>

      {/* Sticky CTA */}
      <View style={[styles.ctaBar, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <View>
          <Text style={styles.ctaPriceVal}>{room.pricePerGroup?.length ? t('fromPrice', { amount: Math.min(...room.pricePerGroup.map((g: any) => g.price)) }) : `€${room.price}`}</Text>
          {!room.pricePerGroup?.length && <Text style={styles.ctaPriceLabel}>{t('perPerson')}</Text>}
        </View>
        <PrimaryButton
          label={t('roomDetails.unlockNow')}
          icon="key"
          pulse
          onPress={() => navigation.navigate('DateTimeSelect', { id: room.id })}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  scroll: { flex: 1 },

  headerImg: { height: 320, overflow: 'hidden', backgroundColor: '#150A0A' },
  heroImage: { width: '100%', height: '100%' },
  headerTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(40, 0, 4, 0.25)' },
  squareBtn: {
    position: 'absolute', width: 40, height: 40, borderRadius: theme.radius.lg,
    backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  headerTags: {
    position: 'absolute', bottom: 20, left: 20, flexDirection: 'row', gap: 8,
  },
  tag: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: theme.radius.sm },
  tagFeatured: { backgroundColor: theme.colors.redPrimary },
  tagNew: { backgroundColor: 'rgba(0,0,0,0.8)', borderWidth: 1, borderColor: 'rgba(200, 16, 27, 0.5)' },
  tagText: { fontSize: 11, fontWeight: '700', color: theme.colors.bone, letterSpacing: 0.8 },

  content: { paddingHorizontal: 20, paddingTop: 4 },
  title: {
    fontFamily: theme.fonts.displayBlack, fontSize: 30, lineHeight: 36,
    color: theme.colors.bone, marginTop: 6, marginBottom: 10,
  },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  locationText: { flex: 1, fontSize: 14, color: theme.colors.textSecondary },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 },
  ratingVal: { fontSize: 16, fontWeight: '700', color: theme.colors.bone },
  reviewsText: { fontSize: 13, color: theme.colors.textMuted },

  countdown: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginBottom: 20, padding: 14,
    borderRadius: theme.radius.lg,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1, borderColor: 'rgba(201, 154, 46, 0.45)',
  },
  countdownIcon: {
    width: 44, height: 44, borderRadius: theme.radius.lg,
    backgroundColor: 'rgba(201, 154, 46, 0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  countdownLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.gold },
  countdownText: { fontSize: 12, lineHeight: 17, color: theme.colors.textSecondary },
  countdownDate: { fontWeight: '700', color: theme.colors.bone },
  countdownDays: { fontFamily: theme.fonts.display, fontSize: 24, color: theme.colors.bone },
  countdownDaysLabel: { fontSize: 10, fontWeight: '600', color: theme.colors.gold },

  infoCards: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  infoCard: {
    flex: 1, alignItems: 'center', gap: 6,
    paddingVertical: 16, paddingHorizontal: 8,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  infoLabel: {
    fontFamily: theme.fonts.type, fontSize: 10, letterSpacing: 1.4,
    color: theme.colors.textMuted,
  },
  infoValue: { fontFamily: theme.fonts.display, fontSize: 17, color: theme.colors.bone },

  section: { marginBottom: 28 },
  sectionTitle: { fontFamily: theme.fonts.display, fontSize: 22, color: theme.colors.bone, marginBottom: 12 },
  reviewCount: { fontFamily: undefined, fontSize: 15, color: theme.colors.textMuted },
  storyText: { fontSize: 15, lineHeight: 25, color: theme.colors.textSecondary },

  expTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  expTag: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  expTagText: { fontSize: 13, fontWeight: '500', color: theme.colors.textSecondary },

  noReviews: {
    alignItems: 'center', gap: 10, paddingVertical: 28, paddingHorizontal: 16,
    borderRadius: theme.radius.lg,
    borderWidth: 1, borderStyle: 'dashed', borderColor: theme.colors.glassBorder,
  },
  noReviewsText: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center' },
  reviewList: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  review: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  reviewer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reviewerAvatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: theme.colors.glassBorder },
  reviewerAvatarEmpty: {
    backgroundColor: theme.colors.redSubtle, borderColor: 'rgba(200, 16, 27, 0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  reviewerInitial: { fontFamily: theme.fonts.display, fontSize: 15, color: theme.colors.redLight },
  reviewerName: { fontSize: 14, fontWeight: '600', color: theme.colors.bone, marginBottom: 3 },
  reviewMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewStars: { flexDirection: 'row', gap: 2 },
  reviewTime: { fontSize: 12, color: theme.colors.textMuted },
  reviewText: { fontSize: 14, lineHeight: 21, color: theme.colors.textPrimary, marginTop: 10 },
  showMore: { alignSelf: 'center', paddingTop: 14 },
  showMoreText: { fontSize: 13, fontWeight: '600', color: theme.colors.redLight },

  ctaBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 14,
    backgroundColor: theme.colors.bgBar,
    borderTopWidth: 1, borderTopColor: theme.colors.glassBorder,
  },
  ctaPriceVal: { fontFamily: theme.fonts.display, fontSize: 24, color: theme.colors.bone },
  ctaPriceLabel: { fontSize: 13, color: theme.colors.textSecondary },
});
