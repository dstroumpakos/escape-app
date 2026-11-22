import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Linking, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { theme } from '../theme';
import { useTranslation } from '../i18n';

/**
 * The company's latest Instagram posts (convex/instagram.ts), like the
 * website's room page. Renders nothing until the company has switched the feed
 * on and the first sync has run.
 */
export function InstagramStrip({ companyId, sidePadding = 20 }: { companyId?: string; sidePadding?: number }) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const feed = useQuery(api.instagram.forCompany, companyId ? { companyId: companyId as any } : 'skip');
  if (!feed || feed.posts.length === 0) return null;

  const gap = 4;
  const tile = (width - sidePadding * 2 - gap * 2) / 3;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Ionicons name="logo-instagram" size={18} color={theme.colors.redLight} />
        <Text style={styles.title}>{t('room.instagram_title')}</Text>
        <TouchableOpacity style={styles.follow} onPress={() => Linking.openURL(feed.profileUrl).catch(() => {})} accessibilityRole="link">
          <Text style={styles.followText} numberOfLines={1}>@{feed.username} · {t('room.instagram_follow')}</Text>
          <Ionicons name="open-outline" size={13} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>
      <View style={[styles.grid, { gap }]}>
        {feed.posts.map((post: any) => (
          <TouchableOpacity
            key={post.id}
            activeOpacity={0.85}
            onPress={() => Linking.openURL(post.permalink).catch(() => {})}
            style={{ width: tile, height: tile, borderRadius: 4, overflow: 'hidden', backgroundColor: theme.colors.bgCardSolid }}
            accessibilityRole="link"
            accessibilityLabel={post.caption || 'Instagram'}
          >
            <Image source={{ uri: post.imageUrl }} style={StyleSheet.absoluteFill} />
            {post.type === 'carousel' && <Ionicons name="copy" size={14} color="#fff" style={styles.carousel} />}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 28 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  title: { fontFamily: theme.fonts.display, fontSize: 19, color: theme.colors.bone, flex: 1 },
  follow: {
    flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '55%', borderWidth: 1, borderColor: theme.colors.glassBorder,
    borderRadius: theme.radius.md, paddingHorizontal: 8, paddingVertical: 5,
  },
  followText: { color: theme.colors.textSecondary, fontSize: 12, flexShrink: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  carousel: { position: 'absolute', top: 5, right: 5, textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 3 },
});
