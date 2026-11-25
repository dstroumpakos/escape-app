import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Image, ActivityIndicator, Platform, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import Share, { Social } from 'react-native-share';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { useTranslation } from '../i18n';

const SITE = (process.env.EXPO_PUBLIC_SITE_URL || 'https://unlocked.gr').replace(/\/+$/, '');

/**
 * Facebook App ID (public, not a secret), set in app.json under
 * expo.extra.facebookAppId. Instagram and Facebook only open Stories directly
 * for an app that sends one; without it those circles fall back to the
 * phone's share menu.
 */
const FB_APP_ID: string = (Constants.expoConfig?.extra as any)?.facebookAppId || '';

export type ShareItem = {
  /** The photo to put on the card */
  imageUrl: string;
  title: string;
  subtitle?: string;
  /** Page on the website the card links to, e.g. /companies/abc */
  path: string;
};

type Target = 'instagram' | 'facebook' | 'whatsapp' | 'more';

/**
 * Share a photo like Spotify does: a 9:16 card (blurred photo behind, the photo
 * framed, the room / company name, UNLOCKED) and one circle per app.
 * Instagram and Facebook open straight into a new Story with the card.
 */
export function ShareSheet({ item, onClose }: { item: ShareItem; onClose: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const card = useRef<React.ComponentRef<typeof View>>(null);
  const [loaded, setLoaded] = useState(0); // the card has two images
  const [busy, setBusy] = useState<Target | null>(null);
  const [failed, setFailed] = useState(false);
  const link = SITE + item.path;
  const ready = loaded >= 2;

  const makeCard = () => captureRef(card, { format: 'jpg', quality: 0.92, result: 'tmpfile' });

  const shareTo = async (target: Target) => {
    if (!ready || busy) return;
    setBusy(target);
    setFailed(false);
    let file = '';
    try {
      file = await makeCard();
      const fileUrl = file.startsWith('file://') ? file : `file://${file}`;
      if ((target === 'instagram' || target === 'facebook') && FB_APP_ID) {
        try {
          await Share.shareSingle({
            social: target === 'instagram' ? Social.InstagramStories : Social.FacebookStories,
            appId: FB_APP_ID,
            backgroundImage: fileUrl,
            attributionURL: link,
          });
          return;
        } catch {
          // App not installed or Stories not available: use the share menu below
        }
      }
      if (target === 'whatsapp') {
        try {
          await Share.shareSingle({ social: Social.Whatsapp, url: fileUrl, type: 'image/jpeg', message: `${item.title}\n${link}` });
          return;
        } catch {
          // No WhatsApp: share menu below
        }
      }
      await Share.open({ url: fileUrl, type: 'image/jpeg', message: Platform.OS === 'android' ? link : undefined, failOnCancel: false });
    } catch (e: any) {
      // Closing the share menu is not an error
      if (!/cancel|dismiss/i.test(String(e?.message || e))) setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  const Circle = ({ target, label, icon, colors }: { target: Target; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; colors: readonly [string, string, ...string[]] }) => (
    <TouchableOpacity style={styles.item} onPress={() => shareTo(target)} disabled={!ready || !!busy} accessibilityLabel={label}>
      <LinearGradient colors={colors} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={[styles.circle, (!ready || (busy && busy !== target)) && { opacity: 0.45 }]}>
        {busy === target ? <ActivityIndicator color="#fff" /> : <Ionicons name={icon} size={26} color="#fff" />}
      </LinearGradient>
      <Text style={styles.itemText} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('co.close')} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
          <View style={styles.head}>
            <Text style={styles.title}>{t('sh.title')}</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel={t('co.close')}>
              <Ionicons name="close" size={24} color={theme.colors.bone} />
            </TouchableOpacity>
          </View>

          {/* The story card (also what gets shared) */}
          <View style={styles.cardWrap}>
            <View ref={card} collapsable={false} style={styles.card}>
              <Image source={{ uri: item.imageUrl }} style={StyleSheet.absoluteFill} blurRadius={24} onLoadEnd={() => setLoaded((n) => n + 1)} />
              <LinearGradient colors={['rgba(8,5,5,0.55)', 'rgba(120,8,14,0.45)', 'rgba(8,5,5,0.85)']} style={StyleSheet.absoluteFill} />
              <Text style={styles.wordmark}>
                <Text style={{ color: theme.colors.bone }}>UN</Text>LOCKED
              </Text>
              <Image source={{ uri: item.imageUrl }} style={styles.photo} resizeMode="cover" onLoadEnd={() => setLoaded((n) => n + 1)} />
              <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
              {!!item.subtitle && <Text style={styles.cardSub} numberOfLines={2}>{item.subtitle}</Text>}
              <Text style={styles.site}>unlocked.gr</Text>
            </View>
            {!ready && (
              <View style={[StyleSheet.absoluteFill, styles.loading]}>
                <ActivityIndicator color={theme.colors.bone} />
              </View>
            )}
          </View>

          <View style={styles.row}>
            <Circle target="instagram" label="Instagram" icon="logo-instagram" colors={['#f9ce34', '#ee2a7b', '#6228d7']} />
            <Circle target="facebook" label="Facebook" icon="logo-facebook" colors={['#1877F2', '#1877F2']} />
            <Circle target="whatsapp" label="WhatsApp" icon="logo-whatsapp" colors={['#25D366', '#1ebe5b']} />
            <Circle target="more" label={t('sh.more')} icon="share-outline" colors={['#3a2a28', '#2a1c1a']} />
          </View>

          <TouchableOpacity style={styles.linkRow} onPress={() => Linking.openURL(link)}>
            <Ionicons name="link-outline" size={16} color={theme.colors.textSecondary ?? '#a8998a'} />
            <Text style={styles.linkText} numberOfLines={1}>{link.replace(/^https?:\/\//, '')}</Text>
          </TouchableOpacity>
          {failed && <Text style={styles.error}>{t('sh.failed')}</Text>}
        </View>
      </View>
    </Modal>
  );
}

const CARD_W = 210;
const CARD_H = (CARD_W * 16) / 9;

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#140b0a', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 14, borderTopWidth: 1, borderColor: 'rgba(232,220,200,0.1)' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { color: theme.colors.bone, fontSize: 18, fontFamily: theme.fonts.display },
  cardWrap: { alignSelf: 'center', width: CARD_W, height: CARD_H, borderRadius: 16, overflow: 'hidden' },
  card: { width: CARD_W, height: CARD_H, backgroundColor: '#080505', alignItems: 'center', paddingTop: 26, paddingHorizontal: 16 },
  wordmark: { color: '#ff2a36', fontFamily: theme.fonts.displayBlack, fontSize: 17, letterSpacing: 2 },
  photo: { width: CARD_W - 40, height: CARD_W - 40, borderRadius: 12, marginTop: 26, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  cardTitle: { color: theme.colors.bone, fontFamily: theme.fonts.display, fontSize: 17, textAlign: 'center', marginTop: 18 },
  cardSub: { color: 'rgba(232,220,200,0.75)', fontSize: 11, textAlign: 'center', marginTop: 5 },
  site: { position: 'absolute', bottom: 16, color: 'rgba(232,220,200,0.7)', fontSize: 10, letterSpacing: 1.5 },
  loading: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,5,5,0.6)' },
  row: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 20 },
  item: { alignItems: 'center', width: 76 },
  circle: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  itemText: { color: theme.colors.bone, fontSize: 12, marginTop: 7 },
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 18 },
  linkText: { color: '#a8998a', fontSize: 13 },
  error: { color: '#ff6b6b', fontSize: 13, textAlign: 'center', marginTop: 10 },
});
