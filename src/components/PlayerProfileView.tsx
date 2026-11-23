import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Image, TouchableOpacity, Modal, TextInput, ActivityIndicator,
  Alert, useWindowDimensions, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { theme } from '../theme';
import { useTranslation } from '../i18n';
import { useUser } from '../UserContext';
import CreatePostModal from '../screens/CreatePostModal';
import { FOLLOW_ENABLED } from '../features';

/**
 * A player's profile, Instagram + Facebook style (convex/social.ts): cover and
 * avatar, counters, follow, and tabs for the posts grid, about and rooms.
 * Used on the player's own Profile tab and on other players' profiles.
 */

const RANKS: Record<string, string> = {
  'Escape Rookie': 'rank_rookie',
  'Escape Explorer': 'rank_explorer',
  'Escape Adventurer': 'rank_adventurer',
  'Escape Veteran': 'rank_veteran',
  'Escape Expert': 'rank_expert',
  'Escape Master': 'rank_master',
  'Escape Legend': 'rank_legend',
};

type Tab = 'posts' | 'about' | 'rooms';

const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const EL_MONTHS = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαΐ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];

export function PlayerProfileView({ userId, onEditBasics }: { userId: string; onEditBasics?: () => void }) {
  const { t, language } = useTranslation();
  const navigation = useNavigation<any>();
  const { sessionToken } = useUser();
  const { width } = useWindowDimensions();
  const profile = useQuery(api.social.profile, { userId: userId as any, sessionToken: sessionToken ?? undefined });
  const posts = useQuery(api.social.userPosts, { userId: userId as any, sessionToken: sessionToken ?? undefined });
  const rooms = useQuery(api.social.userRooms, { userId: userId as any, sessionToken: sessionToken ?? undefined });
  const follow = useMutation(api.social.follow);
  const unfollow = useMutation(api.social.unfollow);
  const [tab, setTab] = useState<Tab>('posts');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [composing, setComposing] = useState(false);
  const [openPost, setOpenPost] = useState<any>(null);
  const [followList, setFollowList] = useState<'followers' | 'following' | null>(null);

  if (profile === undefined) return <ActivityIndicator color={theme.colors.redPrimary} style={{ marginTop: 60 }} />;
  if (profile === null) return <Text style={styles.muted}>{t('pf.notFound')}</Text>;

  const tr = (key: string, fallback: string) => {
    const v = t(key);
    return v === key ? fallback : v;
  };
  const rank = profile.title ? (RANKS[profile.title] ? tr(RANKS[profile.title], profile.title) : profile.title) : '';
  // memberSince is stored as "Member since Nov 2026"; Greek month names by hand (Hermes may lack el dates).
  const sinceEn = (profile.memberSince || '').replace('Member since', '').trim();
  const mi = EN_MONTHS.indexOf(sinceEn.slice(0, 3));
  const since = language === 'el' && mi >= 0 ? sinceEn.replace(/^[A-Z][a-z]{2}/, EL_MONTHS[mi]) : sinceEn;
  const tile = (width - 4) / 3;

  const toggleFollow = async () => {
    if (!sessionToken) return;
    setBusy(true);
    try {
      if (profile.viewer.isFollowing) await unfollow({ sessionToken, userId: profile._id });
      else await follow({ sessionToken, userId: profile._id });
    } catch (e: any) {
      Alert.alert(t('error'), e?.data || e?.message || '');
    } finally {
      setBusy(false);
    }
  };

  const Count = ({ n, label, onPress }: { n: number; label: string; onPress?: () => void }) => (
    <TouchableOpacity style={styles.count} onPress={onPress} disabled={!onPress}>
      <Text style={styles.countNum}>{n}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View>
      {/* Cover (Facebook) */}
      <View style={styles.cover}>
        {profile.cover ? (
          <Image source={{ uri: profile.cover }} style={StyleSheet.absoluteFill} />
        ) : (
          <LinearGradient colors={['rgba(200,16,27,0.45)', '#0b0b0b']} style={StyleSheet.absoluteFill} />
        )}
      </View>

      <View style={styles.head}>
        <View style={styles.avatarRow}>
          <View style={styles.avatarRing}>
            {profile.avatar ? (
              <Image source={{ uri: profile.avatar }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarLetter}>{profile.name.charAt(0).toUpperCase()}</Text>
            )}
          </View>
          <View style={styles.actions}>
            {profile.viewer.isMe ? (
              <>
                <TouchableOpacity style={styles.btnGhost} onPress={() => setEditing(true)}>
                  <Ionicons name="pencil" size={15} color={theme.colors.bone} />
                  <Text style={styles.btnGhostText}>{t('pf.edit')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnRed} onPress={() => setComposing(true)}>
                  <Ionicons name="add" size={18} color="#fff" />
                </TouchableOpacity>
              </>
            ) : profile.viewer.loggedIn ? (
              <>
                {/* The same two buttons on every profile: follow, and message (if they
                    don't follow you, the message arrives as a message request) */}
                {FOLLOW_ENABLED && (
                  <TouchableOpacity style={profile.viewer.isFollowing ? styles.btnGhost : styles.btnRedWide} onPress={toggleFollow} disabled={busy}>
                    {busy ? <ActivityIndicator size="small" color="#fff" /> : (
                      <>
                        <Ionicons name={profile.viewer.isFollowing ? 'checkmark' : 'footsteps'} size={15} color={theme.colors.bone} />
                        <Text style={styles.btnGhostText}>{profile.viewer.isFollowing ? t('pf.followingBtn') : t('pf.follow')}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.btnGhost} onPress={() => navigation.navigate('Messages', { to: profile._id })}>
                  <Ionicons name="chatbubble-ellipses" size={15} color={theme.colors.bone} />
                  <Text style={styles.btnGhostText}>{t('pf.message')}</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>

        <Text style={styles.name}>
          {profile.name} {profile.isPremium ? <Ionicons name="diamond" size={16} color={theme.colors.gold} /> : null}
        </Text>
        {!!rank && <Text style={styles.rank}>{rank}</Text>}

        {/* Counters (Instagram) */}
        <View style={styles.counts}>
          <Count n={profile.stats.posts} label={t('pf.posts')} />
          {FOLLOW_ENABLED && <Count n={profile.stats.followers} label={profile.stats.followers === 1 ? t('pf.followerOne') : t('pf.followers')} onPress={() => setFollowList('followers')} />}
          {FOLLOW_ENABLED && <Count n={profile.stats.following} label={t('pf.following')} onPress={() => setFollowList('following')} />}
          <Count n={profile.stats.played} label={t('pf.rooms')} />
        </View>

        {!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}
        <View style={styles.metaRow}>
          {!!profile.city && <Text style={styles.meta}><Ionicons name="location-outline" size={12} /> {profile.city}</Text>}
          {!!since && <Text style={styles.meta}><Ionicons name="calendar-outline" size={12} /> {t('pf.memberSince', { date: since })}</Text>}
          {profile.viewer.isFriend && <Text style={[styles.meta, { color: theme.colors.gold }]}>{t('people.mutual_badge')}</Text>}
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {([
          ['posts', 'grid-outline', t('pf.tabPosts')],
          ['about', 'information-circle-outline', t('pf.tabAbout')],
          ['rooms', 'key-outline', t('pf.tabRooms')],
        ] as const).map(([k, icon, label]) => (
          <TouchableOpacity key={k} style={[styles.tab, tab === k && styles.tabOn]} onPress={() => setTab(k)}>
            <Ionicons name={icon} size={16} color={tab === k ? theme.colors.bone : theme.colors.textMuted} />
            <Text style={[styles.tabText, tab === k && { color: theme.colors.bone }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'posts' && (
        posts === undefined ? <ActivityIndicator color={theme.colors.redPrimary} style={{ marginTop: 30 }} /> :
        posts.length === 0 ? (
          <Text style={styles.muted}>{profile.viewer.isMe ? t('pf.noPostsMe') : t('pf.noPosts')}</Text>
        ) : (
          <View style={styles.grid}>
            {posts.map((p) => {
              const img = p.media.find((m: any) => m.type === 'image')?.url;
              return (
                <TouchableOpacity key={p._id} activeOpacity={0.85} onPress={() => setOpenPost(p)} style={{ width: tile, height: tile, backgroundColor: theme.colors.bgCardSolid }}>
                  {img ? (
                    <Image source={{ uri: img }} style={StyleSheet.absoluteFill} />
                  ) : (
                    <LinearGradient colors={['rgba(200,16,27,0.3)', '#000']} style={[StyleSheet.absoluteFill, styles.textTile]}>
                      <Text style={styles.textTileText} numberOfLines={5}>{p.text}</Text>
                    </LinearGradient>
                  )}
                  <View style={styles.tileStats}>
                    <Ionicons name="heart" size={11} color="#fff" />
                    <Text style={styles.tileStatText}>{p.likes}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )
      )}

      {tab === 'about' && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('pf.intro')}</Text>
          <Text style={styles.cardText}>{profile.bio || t('pf.noBio')}</Text>
          <View style={styles.statsRow}>
            <View style={styles.statBox}><Ionicons name="game-controller" size={18} color={theme.colors.redLight} /><Text style={styles.statNum}>{profile.stats.played}</Text><Text style={styles.countLabel}>{t('profile.roomsPlayed')}</Text></View>
            <View style={styles.statBox}><Ionicons name="key" size={18} color={theme.colors.success} /><Text style={styles.statNum}>{profile.stats.escaped}</Text><Text style={styles.countLabel}>{t('profile.roomsEscaped')}</Text></View>
          </View>
          {profile.badges.length > 0 && (
            <View style={styles.badges}>
              {profile.badges.map((b: any) => (
                <Text key={b.key} style={styles.badge}>{b.icon ? `${b.icon} ` : ''}{b.title}</Text>
              ))}
            </View>
          )}
        </View>
      )}

      {tab === 'rooms' && (
        rooms === undefined ? <ActivityIndicator color={theme.colors.redPrimary} style={{ marginTop: 30 }} /> :
        rooms.length === 0 ? <Text style={styles.muted}>{t('pf.noRooms')}</Text> : (
          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            {rooms.map((r) => (
              <TouchableOpacity key={r.roomId} style={styles.roomRow} onPress={() => navigation.navigate('RoomDetails', { id: r.roomId })}>
                {r.image ? <Image source={{ uri: r.image }} style={styles.roomImg} /> : <View style={styles.roomImg} />}
                <View style={{ flex: 1 }}>
                  <Text style={styles.roomTitle} numberOfLines={1}>{r.title}</Text>
                  <Text style={styles.countLabel}>{r.theme}</Text>
                  {!!r.rating && <Text style={{ color: theme.colors.gold, marginTop: 2 }}>{'★'.repeat(r.rating)}</Text>}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )
      )}

      {composing && <CreatePostModal visible onClose={() => setComposing(false)} />}

      {openPost && <PostSheet post={openPost} authorName={profile.name} onClose={() => setOpenPost(null)} />}

      {followList && <FollowListSheet userId={profile._id} which={followList} onClose={() => setFollowList(null)} />}

      {editing && sessionToken && (
        <EditBioCover
          token={sessionToken}
          bio={profile.bio}
          hasCover={!!profile.cover}
          onClose={() => setEditing(false)}
          onEditBasics={onEditBasics ? () => { setEditing(false); onEditBasics(); } : undefined}
        />
      )}
    </View>
  );
}

/** Followers / following (convex/social.ts followList). */
function FollowListSheet({ userId, which, onClose }: { userId: string; which: 'followers' | 'following'; onClose: () => void }) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const people = useQuery(api.social.followList, { userId: userId as any, which });
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetWrap}>
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{which === 'followers' ? t('pf.followers') : t('pf.following')}</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={theme.colors.bone} /></TouchableOpacity>
          </View>
          <ScrollView>
            {people === undefined ? (
              <ActivityIndicator color={theme.colors.redPrimary} style={{ margin: 24 }} />
            ) : people.length === 0 ? (
              <Text style={styles.muted}>{t('pf.nobody')}</Text>
            ) : (
              people.map((u: any) => (
                <TouchableOpacity
                  key={u._id}
                  style={styles.sheetRow}
                  onPress={() => {
                    onClose();
                    navigation.push('PlayerProfile', { userId: u._id });
                  }}
                >
                  <View style={styles.smallAvatar}>
                    {u.avatar ? <Image source={{ uri: u.avatar }} style={{ width: 36, height: 36 }} /> : <Text style={styles.smallLetter}>{u.name.charAt(0).toUpperCase()}</Text>}
                  </View>
                  <Text style={styles.sheetRowText}>{u.name}</Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** One post from the grid with its likes and comments (website: ProfileView PostModal). */
function PostSheet({ post, authorName, onClose }: { post: any; authorName: string; onClose: () => void }) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { sessionToken } = useUser();
  const { width } = useWindowDimensions();
  const comments = useQuery(api.posts.getComments, { postId: post._id });
  const likes = useQuery(api.posts.getUserLikes, sessionToken ? { sessionToken } : 'skip');
  const toggleLike = useMutation(api.posts.toggleLike);
  const addComment = useMutation(api.posts.addComment);
  const [text, setText] = useState('');
  const [likeCount, setLikeCount] = useState<number>(post.likes);
  const [sending, setSending] = useState(false);
  const liked = (likes ?? []).includes(post._id);
  const img = post.media?.find((m: any) => m.type === 'image')?.url;

  const like = async () => {
    if (!sessionToken) return;
    try {
      const now = await toggleLike({ postId: post._id, sessionToken });
      setLikeCount((c) => c + (now ? 1 : -1));
    } catch (e: any) {
      Alert.alert(t('error'), e?.data || e?.message || '');
    }
  };
  const send = async () => {
    if (!sessionToken || !text.trim()) return;
    setSending(true);
    try {
      await addComment({ postId: post._id, sessionToken, text: text.trim() });
      setText('');
    } catch (e: any) {
      Alert.alert(t('error'), e?.data || e?.message || '');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
        <View style={[styles.sheet, { maxHeight: '92%' }]}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle} numberOfLines={1}>{authorName}</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={theme.colors.bone} /></TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            {img && <Image source={{ uri: img }} style={{ width: width - 36, height: width - 36, backgroundColor: '#000', borderRadius: 8 }} resizeMode="contain" />}
            <View style={{ paddingVertical: 14, gap: 10 }}>
              {!!post.roomTitle && !!post.roomId && (
                <TouchableOpacity onPress={() => { onClose(); navigation.navigate('RoomDetails', { id: post.roomId }); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="location" size={13} color={theme.colors.redLight} />
                  <Text style={{ color: theme.colors.redLight, fontSize: 13 }}>{post.roomTitle}</Text>
                </TouchableOpacity>
              )}
              {!!post.text && <Text style={styles.cardText}>{post.text}</Text>}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
                <TouchableOpacity onPress={like} disabled={!sessionToken} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name={liked ? 'heart' : 'heart-outline'} size={22} color={liked ? theme.colors.redLight : theme.colors.bone} />
                  <Text style={{ color: theme.colors.bone }}>{likeCount}</Text>
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="chatbubble-outline" size={20} color={theme.colors.textMuted} />
                  <Text style={{ color: theme.colors.textMuted }}>{(comments ?? []).length}</Text>
                </View>
              </View>
              {(comments ?? []).map((c: any) => (
                <Text key={c._id} style={styles.cardText}>
                  <Text style={{ fontWeight: '700', color: theme.colors.bone }} onPress={() => { onClose(); navigation.push('PlayerProfile', { userId: c.userId }); }}>{c.userName}</Text>
                  {'  '}{c.text}
                </Text>
              ))}
            </View>
          </ScrollView>
          {!!sessionToken && (
            <View style={styles.commentRow}>
              <TextInput
                value={text}
                onChangeText={setText}
                maxLength={2000}
                placeholder={t('pf.addComment')}
                placeholderTextColor={theme.colors.textMuted}
                style={styles.commentInput}
              />
              <TouchableOpacity onPress={send} disabled={sending || !text.trim()}>
                {sending ? <ActivityIndicator color={theme.colors.redLight} /> : <Text style={{ color: theme.colors.redLight, fontWeight: '700', opacity: text.trim() ? 1 : 0.4 }}>{t('pf.postComment')}</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function EditBioCover({ token, bio, hasCover, onClose, onEditBasics }: { token: string; bio: string; hasCover: boolean; onClose: () => void; onEditBasics?: () => void }) {
  const { t } = useTranslation();
  const update = useMutation(api.social.updateProfileInfo);
  const uploadUrl = useMutation(api.posts.generateUploadUrl);
  const [text, setText] = useState(bio);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await update({ sessionToken: token, bio: text });
      onClose();
    } catch (e: any) {
      Alert.alert(t('error'), e?.data || e?.message || '');
    } finally {
      setSaving(false);
    }
  };
  const pickCover = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [16, 9] });
    if (res.canceled) return;
    setSaving(true);
    try {
      const url = await uploadUrl({ sessionToken: token });
      const blob = await (await fetch(res.assets[0].uri)).blob();
      const up = await fetch(url, { method: 'POST', headers: { 'Content-Type': blob.type || 'image/jpeg' }, body: blob });
      const { storageId } = await up.json();
      await update({ sessionToken: token, coverStorageId: storageId });
    } catch (e: any) {
      Alert.alert(t('error'), e?.data || e?.message || '');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{t('pf.edit')}</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={theme.colors.bone} /></TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            {onEditBasics && (
              <TouchableOpacity style={styles.sheetRow} onPress={onEditBasics}>
                <Ionicons name="person-circle-outline" size={20} color={theme.colors.bone} />
                <Text style={styles.sheetRowText}>{t('pf.nameAndPhoto')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.sheetRow} onPress={pickCover} disabled={saving}>
              <Ionicons name="image-outline" size={20} color={theme.colors.bone} />
              <Text style={styles.sheetRowText}>{hasCover ? t('pf.changeCover') : t('pf.addCover')}</Text>
            </TouchableOpacity>
            {hasCover && (
              <TouchableOpacity style={styles.sheetRow} onPress={() => update({ sessionToken: token, coverStorageId: null })} disabled={saving}>
                <Ionicons name="trash-outline" size={20} color={theme.colors.redLight} />
                <Text style={[styles.sheetRowText, { color: theme.colors.redLight }]}>{t('pf.removeCover')}</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.label}>{t('pf.bio')}</Text>
            <TextInput
              value={text}
              onChangeText={setText}
              maxLength={300}
              multiline
              placeholder={t('pf.bioPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
            />
            <Text style={styles.charCount}>{text.length}/300</Text>
            <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{t('pf.save')}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  muted: { color: theme.colors.textMuted, textAlign: 'center', marginTop: 30, paddingHorizontal: 30 },
  cover: { height: 150, backgroundColor: theme.colors.bgCardSolid, overflow: 'hidden' },
  head: { paddingHorizontal: 16, marginTop: -44 },
  avatarRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  avatarRing: {
    width: 92, height: 92, borderRadius: 46, borderWidth: 4, borderColor: theme.colors.bgPrimary,
    backgroundColor: theme.colors.bgCardSolid, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarLetter: { fontSize: 34, fontWeight: '800', color: theme.colors.redLight },
  actions: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  btnGhost: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: 10,
    backgroundColor: theme.colors.glass, borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  btnGhostText: { color: theme.colors.bone, fontWeight: '600', fontSize: 13 },
  btnRed: { width: 36, height: 36, borderRadius: 10, backgroundColor: theme.colors.redPrimary, alignItems: 'center', justifyContent: 'center' },
  btnRedWide: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 36, borderRadius: 10, backgroundColor: theme.colors.redPrimary },
  name: { fontFamily: theme.fonts.display, fontSize: 24, color: theme.colors.bone, marginTop: 8 },
  rank: { color: theme.colors.redLight, fontSize: 13, marginTop: 2 },
  counts: {
    flexDirection: 'row', justifyContent: 'space-around', marginTop: 14, paddingVertical: 10,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.border,
  },
  count: { alignItems: 'center', minWidth: 60 },
  countNum: { fontSize: 18, fontWeight: '800', color: theme.colors.bone },
  countLabel: { fontSize: 11, color: theme.colors.textMuted },
  bio: { color: theme.colors.textPrimary, fontSize: 14, lineHeight: 20, marginTop: 10 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 },
  meta: { color: theme.colors.textMuted, fontSize: 12 },
  tabs: { flexDirection: 'row', marginTop: 16, borderBottomWidth: 1, borderColor: theme.colors.border },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderBottomWidth: 2, borderColor: 'transparent' },
  tabOn: { borderColor: theme.colors.redPrimary },
  tabText: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, marginTop: 2 },
  textTile: { padding: 8, alignItems: 'center', justifyContent: 'center' },
  textTileText: { color: theme.colors.bone, fontSize: 11, textAlign: 'center' },
  tileStats: { position: 'absolute', bottom: 4, left: 6, flexDirection: 'row', alignItems: 'center', gap: 3 },
  tileStatText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  card: { margin: 16, padding: 16, borderRadius: theme.radius.lg, backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: theme.colors.border },
  cardTitle: { fontFamily: theme.fonts.display, fontSize: 17, color: theme.colors.bone, marginBottom: 6 },
  cardText: { color: theme.colors.textSecondary, fontSize: 14, lineHeight: 20 },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  statBox: { flex: 1, alignItems: 'center', padding: 10, borderRadius: 10, backgroundColor: theme.colors.glass },
  statNum: { fontSize: 20, fontWeight: '800', color: theme.colors.bone },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  badge: { color: theme.colors.gold, fontSize: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(201,154,46,0.4)' },
  roomRow: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 10, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: theme.colors.border },
  roomImg: { width: 56, height: 56, borderRadius: 8, backgroundColor: theme.colors.bgCardSolid },
  roomTitle: { color: theme.colors.bone, fontWeight: '700' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: { maxHeight: '85%', backgroundColor: theme.colors.bgSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 34 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sheetTitle: { fontFamily: theme.fonts.display, fontSize: 19, color: theme.colors.bone },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  sheetRowText: { color: theme.colors.bone, fontSize: 15 },
  label: { color: theme.colors.textMuted, fontSize: 13, marginTop: 10, marginBottom: 6 },
  input: {
    minHeight: 90, color: theme.colors.bone, fontSize: 15, padding: 12, borderRadius: 12, textAlignVertical: 'top',
    backgroundColor: theme.colors.bgPrimary, borderWidth: 1, borderColor: theme.colors.border,
  },
  charCount: { color: theme.colors.textMuted, fontSize: 11, textAlign: 'right', marginTop: 4 },
  saveBtn: { marginTop: 14, height: 48, borderRadius: 12, backgroundColor: theme.colors.redPrimary, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  smallAvatar: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden', backgroundColor: theme.colors.bgPrimary, alignItems: 'center', justifyContent: 'center' },
  smallLetter: { color: theme.colors.redLight, fontWeight: '700' },
  commentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 12 },
  commentInput: { flex: 1, color: theme.colors.textPrimary, fontSize: 15, paddingVertical: 8 },
});
