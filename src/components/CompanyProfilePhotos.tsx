import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Modal, FlatList, useWindowDimensions, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { useTranslation } from '../i18n';
import { sharePhoto } from '../sharePhoto';

type TeamPhoto = { url: string; teamName: string; escaped: boolean | null; escapeTime: string; roomTitle: string };
type Shot = { url: string; label?: string; video?: boolean };
/** The company the photos belong to (for the share button) */
type ShareAs = { name: string; companyId: string };

/** Photos full screen: swipe between them, X closes. */
function Viewer({ shots, start, onClose, share }: { shots: Shot[]; start: number; onClose: () => void; share?: ShareAs }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [i, setI] = useState(start);
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.viewer}>
        <FlatList
          data={shots}
          horizontal
          pagingEnabled
          initialScrollIndex={start}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          keyExtractor={(s, index) => s.url + index}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setI(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => (
            <View style={{ width, height, justifyContent: 'center' }}>
              <Image source={{ uri: item.url }} style={{ width, height: height * 0.8 }} resizeMode="contain" />
            </View>
          )}
        />
        {share && (
          <TouchableOpacity
            style={[styles.close, { top: insets.top + 10, right: 68 }]}
            onPress={() => sharePhoto({ title: [shots[i]?.label, share.name].filter(Boolean).join(' · '), path: `/companies/${share.companyId}` })}
            accessibilityLabel={t('sh.title')}
          >
            <Ionicons name="share-social-outline" size={22} color="#fff" />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.close, { top: insets.top + 10 }]} onPress={onClose} accessibilityLabel={t('co.close')}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={[styles.counter, { bottom: insets.bottom + 20 }]}>
          {!!shots[i]?.label && <Text style={styles.counterText} numberOfLines={1}>{shots[i].label}</Text>}
          {shots.length > 1 && <Text style={styles.counterText}>{i + 1} / {shots.length}</Text>}
        </View>
      </View>
    </Modal>
  );
}

/**
 * A sideways row of photos and videos. A photo opens the photos full screen;
 * a video opens in the phone's own player (the app has no video player).
 */
function Strip({ shots, captions, share }: { shots: Shot[]; captions?: boolean; share?: ShareAs }) {
  const [viewing, setViewing] = useState<number | null>(null);
  const photos = shots.filter((s) => !s.video);
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {shots.map((s, i) => (
          <TouchableOpacity
            key={s.url + i}
            activeOpacity={0.85}
            onPress={() => (s.video ? Linking.openURL(s.url).catch(() => {}) : setViewing(photos.indexOf(s)))}
            style={styles.thumb}
          >
            {s.video ? (
              <View style={styles.videoTile}>
                <Ionicons name="play-circle" size={48} color="rgba(255,255,255,0.9)" />
              </View>
            ) : (
              <Image source={{ uri: s.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            )}
            {captions && !!s.label && (
              <View style={styles.caption}>
                <Text style={styles.captionText} numberOfLines={1}>{s.label}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
      {viewing !== null && <Viewer shots={photos} start={viewing} onClose={() => setViewing(null)} share={share} />}
    </>
  );
}

/** The company's own photos and videos (its rooms, space, team). */
export function CompanyPromoPhotos({ items, share }: { items: { url: string; type?: 'image' | 'video' }[]; share?: ShareAs }) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return (
    <>
      <Text style={styles.section}>{t('co.photos')}</Text>
      <Strip shots={items.map((m) => ({ url: m.url, video: m.type === 'video' }))} share={share} />
    </>
  );
}

/** Every team photo the company shows, with a filter by room. */
export function CompanyTeamPhotos({ photos, share }: { photos: TeamPhoto[]; share?: ShareAs }) {
  const { t } = useTranslation();
  const [room, setRoom] = useState<string | null>(null);
  if (photos.length === 0) return null;
  const counts = new Map<string, number>();
  for (const p of photos) counts.set(p.roomTitle, (counts.get(p.roomTitle) ?? 0) + 1);
  const rooms = [...counts.entries()].sort((a, b) => (a[0] ? 0 : 1) - (b[0] ? 0 : 1) || b[1] - a[1]);
  const shown = room === null ? photos : photos.filter((p) => p.roomTitle === room);
  const label = (p: TeamPhoto) =>
    [p.teamName, p.escaped ? [t('co.escaped'), p.escapeTime].filter(Boolean).join(' ') : ''].filter(Boolean).join(' · ');
  const Chip = ({ active, text, onPress }: { active: boolean; text: string; onPress: () => void }) => (
    <TouchableOpacity onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && { color: '#fff' }]}>{text}</Text>
    </TouchableOpacity>
  );
  return (
    <>
      <Text style={styles.section}>{t('co.teamPhotos')}</Text>
      {rooms.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>
          <Chip active={room === null} text={`${t('co.allRooms')} ${photos.length}`} onPress={() => setRoom(null)} />
          {rooms.map(([title, n]) => (
            <Chip key={title || '_'} active={room === title} text={`${title || t('co.otherPhotos')} ${n}`} onPress={() => setRoom(title)} />
          ))}
        </ScrollView>
      )}
      <Strip key={room ?? '*'} shots={shown.map((p) => ({ url: p.url, label: [p.roomTitle, label(p)].filter(Boolean).join(' · ') }))} captions share={share} />
    </>
  );
}

const styles = StyleSheet.create({
  section: { fontFamily: theme.fonts.display, fontSize: 18, color: theme.colors.bone, marginTop: 22, marginBottom: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.glassBorder },
  chipActive: { backgroundColor: theme.colors.redPrimary, borderColor: theme.colors.redPrimary },
  chipText: { color: theme.colors.textSecondary, fontSize: 13 },
  room: { fontSize: 12, color: theme.colors.textSecondary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, fontWeight: '600' },
  videoTile: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a0d0d' },
  thumb: { width: 200, height: 150, borderRadius: 12, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.4)' },
  caption: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: 'rgba(0,0,0,0.6)' },
  captionText: { color: '#fff', fontSize: 11 },
  viewer: { flex: 1, backgroundColor: '#000' },
  close: { position: 'absolute', right: 14, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  counter: { position: 'absolute', left: 16, right: 16, alignItems: 'center', gap: 4 },
  counterText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' },
});
