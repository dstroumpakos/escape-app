import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { theme } from '../theme';
import { RootStackParamList } from '../types';
import { useTranslation } from '../i18n';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'RoomDetails'>;

export default function RoomDetails() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const roomId = route.params.id;

  const { t } = useTranslation();

  const convexRooms = useQuery(api.rooms.list);
  const allRooms = (convexRooms ?? []).map((r: any) => ({ ...r, id: r._id }));
  const room = allRooms.find((r: any) => r.id === roomId) || allRooms[0];

  const [liked, setLiked] = useState(false);

  if (!room) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.colors.redPrimary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Header Image */}
        <View style={styles.headerImg}>
          <Image source={{ uri: room.image }} style={styles.heroImage} />
          <View style={styles.headerOverlay} />

          <TouchableOpacity style={[styles.circleBtn, styles.backBtn]} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.circleBtn, styles.heartBtn]} onPress={() => setLiked(!liked)}>
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? theme.colors.redPrimary : '#fff'} />
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
        <View style={styles.content}>
          <Text style={styles.title}>{room.title}</Text>
          <View style={styles.locationRow}>
            <Ionicons name="location" size={14} color={theme.colors.redPrimary} />
            <Text style={styles.locationText}>{room.location}</Text>
          </View>

          <View style={styles.ratingRow}>
            <Ionicons name="star" size={16} color={theme.colors.gold} />
            <Text style={styles.ratingVal}>{room.rating}</Text>
            <Text style={styles.reviewsText}>{t('roomDetails.reviews', { count: room.reviews })}</Text>
          </View>

          {/* Info Cards */}
          <View style={styles.infoCards}>
            <View style={styles.infoCard}>
              <View style={styles.diffDotsLg}>
                {Array.from({ length: room.maxDifficulty }).map((_, i) => (
                  <View key={i} style={[styles.diffDotLg, i < room.difficulty && styles.diffDotLgFilled]} />
                ))}
              </View>
              <Text style={styles.infoLabel}>{t('roomDetails.difficulty')}</Text>
              <Text style={styles.infoValue}>{room.difficulty}/{room.maxDifficulty}</Text>
            </View>
            <View style={styles.infoCard}>
              <Ionicons name="time-outline" size={22} color={theme.colors.redPrimary} />
              <Text style={styles.infoLabel}>{t('roomDetails.duration')}</Text>
              <Text style={styles.infoValue}>{room.duration} {t('min')}</Text>
            </View>
            <View style={styles.infoCard}>
              <Ionicons name="people-outline" size={22} color={theme.colors.redPrimary} />
              <Text style={styles.infoLabel}>{t('roomDetails.players')}</Text>
              <Text style={styles.infoValue}>{room.players}</Text>
            </View>
          </View>

          {/* Story */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('roomDetails.theStory')}</Text>
            <Text style={styles.storyText}>{room.story}</Text>
          </View>

          {/* Experience Tags */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('roomDetails.experienceTags')}</Text>
            <View style={styles.expTags}>
              {room.tags.map((tag: string) => (
                <View key={tag} style={styles.expTag}>
                  <Text style={styles.expTagText}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Review Preview */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('roomDetails.reviewsSection')}</Text>
              <TouchableOpacity onPress={() => Alert.alert(t('roomDetails.reviewsSection'), t('roomDetails.allReviews', { count: room.reviews }))}>
                <Text style={styles.seeAll}>{t('roomDetails.viewAll')}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.reviewCard}>
              <View style={styles.reviewer}>
                <View style={styles.reviewerAvatar}>
                  <Text style={styles.reviewerInitial}>M</Text>
                </View>
                <View>
                  <Text style={styles.reviewerName}>Maria S.</Text>
                  <View style={styles.reviewStars}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Ionicons key={i} name="star" size={10} color={theme.colors.gold} />
                    ))}
                  </View>
                </View>
              </View>
              <Text style={styles.reviewText}>
                "Absolutely incredible experience! The puzzles were challenging but fair, and the atmosphere was unbelievably immersive."
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Sticky CTA */}
      <View style={styles.ctaBar}>
        <View>
          <Text style={styles.ctaPriceVal}>{room.pricePerGroup?.length ? `From €${Math.min(...room.pricePerGroup.map((g: any) => g.price))}` : `€${room.price}`}</Text>
          {!room.pricePerGroup?.length && <Text style={styles.ctaPriceLabel}>{t('perPerson')}</Text>}
        </View>
        <TouchableOpacity
          style={styles.ctaBtn}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('DateTimeSelect', { id: room.id })}
        >
          <Text style={styles.ctaBtnText}>{t('roomDetails.unlockNow')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  scroll: { flex: 1 },

  headerImg: { height: 300, overflow: 'hidden' },
  heroImage: { width: '100%', height: '100%' },
  headerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  circleBtn: {
    position: 'absolute', top: 56, width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  backBtn: { left: 20 },
  heartBtn: { right: 20 },
  headerTags: {
    position: 'absolute', bottom: 20, left: 20, flexDirection: 'row', gap: 8,
  },
  tag: {
    paddingVertical: 4, paddingHorizontal: 12, borderRadius: theme.radius.full,
  },
  tagFeatured: { backgroundColor: theme.colors.redPrimary },
  tagNew: { backgroundColor: 'rgba(255,255,255,0.15)' },
  tagText: { fontSize: 11, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },

  content: { padding: 20 },
  title: { fontSize: 26, fontWeight: '800', color: '#fff', marginBottom: 8 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  locationText: { fontSize: 14, color: theme.colors.textSecondary },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 },
  ratingVal: { fontSize: 16, fontWeight: '700', color: '#fff' },
  reviewsText: { fontSize: 13, color: theme.colors.textSecondary },

  infoCards: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  infoCard: {
    flex: 1, alignItems: 'center', gap: 8,
    paddingVertical: 16, paddingHorizontal: 10,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  infoLabel: {
    fontSize: 10, color: theme.colors.textSecondary,
    letterSpacing: 0.5, fontWeight: '600',
  },
  infoValue: { fontSize: 15, fontWeight: '700', color: '#fff' },
  diffDotsLg: { flexDirection: 'row', gap: 4 },
  diffDotLg: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)' },
  diffDotLgFilled: { backgroundColor: theme.colors.redPrimary },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  seeAll: { fontSize: 13, color: theme.colors.redPrimary, fontWeight: '600' },
  storyText: { fontSize: 14, lineHeight: 24, color: theme.colors.textSecondary },

  expTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  expTag: {
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: theme.radius.full,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  expTagText: { fontSize: 13, fontWeight: '500', color: theme.colors.textSecondary },

  reviewCard: {
    padding: 16, borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  reviewer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  reviewerAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: theme.colors.redSubtle,
    alignItems: 'center', justifyContent: 'center',
  },
  reviewerInitial: { fontSize: 14, fontWeight: '700', color: theme.colors.redPrimary },
  reviewerName: { fontSize: 14, fontWeight: '600', color: '#fff', marginBottom: 2 },
  reviewStars: { flexDirection: 'row', gap: 2 },
  reviewText: { fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary },

  ctaBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36,
    backgroundColor: 'rgba(26,13,13,0.95)',
    borderTopWidth: 1, borderTopColor: theme.colors.border,
  },
  ctaPriceVal: { fontSize: 22, fontWeight: '800', color: '#fff' },
  ctaPriceLabel: { fontSize: 13, color: theme.colors.textSecondary },
  ctaBtn: {
    paddingVertical: 16, paddingHorizontal: 36,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.redPrimary,
    ...theme.shadow.red,
  },
  ctaBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
