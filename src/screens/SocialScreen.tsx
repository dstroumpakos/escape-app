import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  TextInput,
  Alert,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  ScrollView,
  ActionSheetIOS,
  Platform,
  Share,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { theme } from '../theme';
import { useUser } from '../UserContext';
import { useTranslation } from '../i18n';
import CreatePostModal from './CreatePostModal';
import { FOLLOW_ENABLED } from '../features';
import type { Id } from '../../convex/_generated/dataModel';

const { width } = Dimensions.get('window');

function timeAgo(timestamp: number, t: (key: string, params?: Record<string, any>) => string): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return t('social.justNow');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('social.mAgo', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('social.hAgo', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t('social.dAgo', { n: days });
  const weeks = Math.floor(days / 7);
  return t('social.wAgo', { n: weeks });
}

function StarRating({ rating }: { rating: number }) {
  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Ionicons
          key={star}
          name={star <= rating ? 'star' : 'star-outline'}
          size={14}
          color={star <= rating ? theme.colors.gold : theme.colors.textMuted}
        />
      ))}
    </View>
  );
}

interface PostCardProps {
  post: any;
  isLiked: boolean;
  userId: string | null;
  onToggleLike: (postId: Id<'posts'>) => void;
  onComment: (postId: Id<'posts'>) => void;
  onReport: (postId: Id<'posts'>) => void;
  onBlockUser: (authorUserId: string | undefined) => void;
  onDelete: (postId: Id<'posts'>) => void;
}

function PostCard({ post, isLiked, userId, onToggleLike, onComment, onReport, onBlockUser, onDelete }: PostCardProps) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const openAuthor = () => {
    if (post.authorType === 'user' && post.authorUserId) navigation.navigate('PlayerProfile', { userId: post.authorUserId });
  };
  const share = () => {
    Share.share({ message: `https://unlocked.gr/post/${post._id}` }).catch(() => {});
  };
  const initials = post.authorName
    .split(' ')
    .map((n: string) => n[0])
    .filter(Boolean)
    .join('')
    .toUpperCase();

  return (
    <View style={styles.card}>
      {/* Author header */}
      <View style={styles.cardHeader}>
        <TouchableOpacity style={styles.authorRow} onPress={openAuthor} activeOpacity={0.7}>
          {post.authorAvatar ? (
            <Image source={{ uri: post.authorAvatar }} style={styles.authorAvatar} />
          ) : (
            <View style={styles.authorAvatarFallback}>
              <Text style={styles.authorInitials}>{initials}</Text>
            </View>
          )}
          <View style={styles.authorInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.authorName}>{post.authorName}</Text>
              {post.authorVerified && (
                <Ionicons name="checkmark-circle" size={14} color={theme.colors.redPrimary} />
              )}
              {post.authorType === 'company' && (
                <View style={styles.companyBadge}>
                  <Text style={styles.companyBadgeText}>{t('social.business')}</Text>
                </View>
              )}
            </View>
            {post.roomTitle ? (
              <Text style={styles.timeText} numberOfLines={1}>
                {t('social.at')}{' '}
                <Text style={{ color: theme.colors.bone, fontWeight: '600' }} onPress={() => post.roomId && navigation.navigate('RoomDetails', { id: post.roomId })}>
                  {post.roomTitle}
                </Text>
              </Text>
            ) : null}
            <Text style={styles.timeText}>{timeAgo(post.createdAt, t)}</Text>
          </View>
        </TouchableOpacity>

        {/* Own post: delete */}
        {userId && post.authorUserId === userId && (
          <TouchableOpacity
            style={styles.moreBtn}
            onPress={() =>
              Alert.alert(t('social.deletePostTitle'), undefined, [
                { text: t('cancel'), style: 'cancel' },
                { text: t('social.deletePost'), style: 'destructive', onPress: () => onDelete(post._id) },
              ])
            }
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={theme.colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* Report / Block menu (Apple Guideline 1.2) */}
        {userId && post.authorUserId !== userId && (
          <TouchableOpacity
            style={styles.moreBtn}
            onPress={() => {
              if (Platform.OS === 'ios') {
                ActionSheetIOS.showActionSheetWithOptions(
                  {
                    options: [t('cancel'), t('social.reportPost'), t('social.blockUser')],
                    destructiveButtonIndex: 2,
                    cancelButtonIndex: 0,
                  },
                  (buttonIndex) => {
                    if (buttonIndex === 1) onReport(post._id);
                    if (buttonIndex === 2) onBlockUser(post.authorUserId);
                  }
                );
              } else {
                Alert.alert(
                  t('social.postOptions'),
                  undefined,
                  [
                    { text: t('cancel'), style: 'cancel' },
                    { text: t('social.reportPost'), onPress: () => onReport(post._id) },
                    { text: t('social.blockUser'), style: 'destructive', onPress: () => onBlockUser(post.authorUserId) },
                  ]
                );
              }
            }}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={theme.colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>


      {/* Rating */}
      {post.rating ? (
        <View style={styles.ratingRow}>
          <StarRating rating={post.rating} />
        </View>
      ) : null}

      {/* Text */}
      {post.text ? <Text style={styles.postText}>{post.text}</Text> : null}

      {/* Media */}
      {post.media && post.media.length > 0 && (
        <ScrollView
          horizontal
          pagingEnabled={post.media.length > 1}
          showsHorizontalScrollIndicator={false}
          style={styles.mediaContainer}
        >
          {post.media.map((m: any, i: number) => (
            <View key={i} style={[styles.mediaItem, post.media.length === 1 && { width: width - 56 }]}>
              <Image source={{ uri: m.url }} style={styles.mediaImage} resizeMode="cover" />
              {m.type === 'video' && (
                <View style={styles.playOverlay}>
                  <Ionicons name="play-circle" size={44} color="rgba(255,255,255,0.9)" />
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Counts */}
      {(post.likes > 0 || post.commentCount > 0) && (
        <View style={styles.countsRow}>
          <Text style={styles.countsText}>{post.likes > 0 ? `❤️ ${post.likes}` : ''}</Text>
          {post.commentCount > 0 && (
            <Text style={styles.countsText} onPress={() => onComment(post._id)}>{t('social.commentsCount', { n: post.commentCount })}</Text>
          )}
        </View>
      )}

      {/* Actions (Facebook) */}
      <View style={styles.fbActions}>
        <TouchableOpacity style={styles.fbAction} onPress={() => onToggleLike(post._id)}>
          <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={20} color={isLiked ? theme.colors.redPrimary : theme.colors.textSecondary} />
          <Text style={[styles.fbActionText, isLiked && { color: theme.colors.redPrimary }]}>{t('social.like')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.fbAction} onPress={() => onComment(post._id)}>
          <Ionicons name="chatbubble-outline" size={19} color={theme.colors.textSecondary} />
          <Text style={styles.fbActionText}>{t('social.comment')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.fbAction} onPress={share}>
          <Ionicons name="share-social-outline" size={19} color={theme.colors.textSecondary} />
          <Text style={styles.fbActionText}>{t('social.share')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ── Comment Sheet ── */
function CommentSection({
  postId,
  sessionToken,
  onClose,
}: {
  postId: Id<'posts'>;
  sessionToken: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const comments = useQuery(api.posts.getComments, { postId });
  const addComment = useMutation(api.posts.addComment);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSend = async () => {
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      await addComment({
        postId,
        sessionToken,
        text: newComment.trim(),
      });
      setNewComment('');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.commentSheet}>
      <View style={styles.commentHeader}>
        <Text style={styles.commentTitle}>{t('social.comments')}</Text>
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="close" size={22} color={theme.colors.bone} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={comments || []}
        keyExtractor={(item) => item._id}
        style={styles.commentList}
        renderItem={({ item }) => {
          const ci = item.userName
            .split(' ')
            .map((n: string) => n[0])
            .filter(Boolean)
            .join('')
            .toUpperCase();
          return (
            <View style={styles.commentItem}>
              {item.userAvatar ? (
                <Image source={{ uri: item.userAvatar }} style={styles.commentAvatar} />
              ) : (
                <View style={styles.commentAvatarFallback}>
                  <Text style={styles.commentInitials}>{ci}</Text>
                </View>
              )}
              <View style={styles.commentContent}>
                <Text style={styles.commentUser}>{item.userName}</Text>
                <Text style={styles.commentText}>{item.text}</Text>
                <Text style={styles.commentTime}>{timeAgo(item.createdAt, t)}</Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyComments}>
            <Text style={styles.emptyText}>{t('social.noComments')}</Text>
          </View>
        }
      />

      <View style={styles.commentInputRow}>
        <TextInput
          style={styles.commentInput}
          placeholder={t('social.addComment')}
          placeholderTextColor={theme.colors.textMuted}
          value={newComment}
          onChangeText={setNewComment}
          multiline
          maxLength={300}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={submitting || !newComment.trim()}
          style={styles.sendBtn}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={theme.colors.redPrimary} />
          ) : (
            <Ionicons
              name="send"
              size={20}
              color={newComment.trim() ? theme.colors.redPrimary : theme.colors.textMuted}
            />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ── Main Screen ── */
export default function SocialScreen() {
  const { userId, sessionToken } = useUser();
  const navigation = useNavigation<any>();
  const [mode, setMode] = useState<'all' | 'following'>('all');
  // Community feed (convex/community.ts), mapped to the fields PostCard reads.
  const rawFeed = useQuery(api.community.feed, { sessionToken: sessionToken ?? undefined, mode });
  const feed = rawFeed?.map((p: any) => ({
    ...p,
    authorName: p.author.name,
    authorAvatar: p.author.avatar,
    authorVerified: p.author.verified,
    authorType: p.author.kind,
    authorUserId: p.author.id,
    roomTitle: p.room?.title ?? '',
    roomId: p.room?.id ?? null,
  }));
  const me = useQuery(api.users.getById, sessionToken ? { sessionToken } : 'skip') as any;
  const suggestions = useQuery(api.community.suggestions, { sessionToken: sessionToken ?? undefined });
  const followMutation = useMutation(api.social.follow);
  const deletePostMutation = useMutation(api.posts.deletePost);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const blockedUserIds = useQuery(
    api.moderation.getBlockedUserIds,
    sessionToken ? { sessionToken } : 'skip'
  );
  const toggleLike = useMutation(api.posts.toggleLike);
  const reportPostMutation = useMutation(api.moderation.reportPost);
  const blockUserMutation = useMutation(api.moderation.blockUser);
  const { t } = useTranslation();

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [commentPostId, setCommentPostId] = useState<Id<'posts'> | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const likedPostIds = new Set((feed || []).filter((p: any) => p.likedByMe).map((p: any) => p._id));
  const blockedSet = new Set(blockedUserIds || []);

  // Filter out posts from blocked users
  const filteredFeed = (feed || []).filter(
    (post: any) => !post.authorUserId || !blockedSet.has(post.authorUserId)
  );

  const handleToggleLike = async (postId: Id<'posts'>) => {
    if (!userId) return;
    try {
      await toggleLike({ postId, sessionToken: sessionToken as string });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // Convex queries auto-refresh; just show the spinner briefly
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  const handleReportPost = (postId: Id<'posts'>) => {
    if (!userId) return;
    const reasons: Array<{ label: string; value: 'spam' | 'harassment' | 'hate_speech' | 'inappropriate' | 'other' }> = [
      { label: t('social.reportSpam'), value: 'spam' },
      { label: t('social.reportHarassment'), value: 'harassment' },
      { label: t('social.reportHateSpeech'), value: 'hate_speech' },
      { label: t('social.reportInappropriate'), value: 'inappropriate' },
      { label: t('social.reportOther'), value: 'other' },
    ];

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: t('social.reportReasonTitle'),
          options: [t('cancel'), ...reasons.map(r => r.label)],
          cancelButtonIndex: 0,
        },
        async (buttonIndex) => {
          if (buttonIndex > 0) {
            try {
              await reportPostMutation({
                postId,
                sessionToken: sessionToken as string,
                reason: reasons[buttonIndex - 1].value,
              });
              Alert.alert(t('social.reportSubmitted'), t('social.reportSubmittedMessage'));
            } catch (e: any) {
              Alert.alert(t('error'), e.message);
            }
          }
        }
      );
    } else {
      Alert.alert(
        t('social.reportReasonTitle'),
        undefined,
        [
          { text: t('cancel'), style: 'cancel' },
          ...reasons.map(r => ({
            text: r.label,
            onPress: async () => {
              try {
                await reportPostMutation({
                  postId,
                  sessionToken: sessionToken as string,
                  reason: r.value,
                });
                Alert.alert(t('social.reportSubmitted'), t('social.reportSubmittedMessage'));
              } catch (e: any) {
                Alert.alert(t('error'), e.message);
              }
            },
          })),
        ]
      );
    }
  };

  const handleDelete = async (postId: Id<'posts'>) => {
    try {
      await deletePostMutation({ postId, sessionToken: sessionToken as string });
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    }
  };

  const handleBlockUser = (authorUserId: string | undefined) => {
    if (!userId || !authorUserId) return;
    Alert.alert(
      t('social.blockUserTitle'),
      t('social.blockUserMessage'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('social.blockConfirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              await blockUserMutation({
                sessionToken: sessionToken as string,
                blockedUserId: authorUserId as Id<'users'>,
              });
              Alert.alert(t('social.userBlocked'), t('social.userBlockedMessage'));
            } catch (e: any) {
              Alert.alert(t('error'), e.message);
            }
          },
        },
      ]
    );
  };

  if (feed === undefined) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.colors.redPrimary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>{t('social.title')}</Text>
        <TouchableOpacity
          style={styles.newPostBtn}
          onPress={() => setCreateModalVisible(true)}
        >
          <Ionicons name="add" size={22} color={theme.colors.bone} />
        </TouchableOpacity>
      </View>

      {/* Feed */}
      <FlatList
        data={filteredFeed}
        keyExtractor={(item) => item._id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.redPrimary}
          />
        }
        ListHeaderComponent={
          <View>
            {/* Composer */}
            {userId && (
              <View style={styles.composer}>
                <TouchableOpacity onPress={() => navigation.navigate('PlayerProfile', { userId })}>
                  {me?.avatar ? (
                    <Image source={{ uri: me.avatar }} style={styles.authorAvatar} />
                  ) : (
                    <View style={styles.authorAvatarFallback}><Text style={styles.authorInitials}>{(me?.name || '?').charAt(0).toUpperCase()}</Text></View>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.composerInput} onPress={() => setCreateModalVisible(true)}>
                  <Text style={styles.composerText} numberOfLines={1}>{t('social.whatsNew', { name: (me?.name || '').split(' ')[0] })}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setCreateModalVisible(true)}>
                  <Ionicons name="images-outline" size={24} color={theme.colors.success} />
                </TouchableOpacity>
              </View>
            )}

            {/* For you / Following */}
            {FOLLOW_ENABLED && userId && (
              <View style={styles.modeRow}>
                {(['all', 'following'] as const).map((m) => (
                  <TouchableOpacity key={m} style={[styles.modeBtn, mode === m && styles.modeBtnOn]} onPress={() => setMode(m)}>
                    <Text style={[styles.modeText, mode === m && { color: '#fff' }]}>{m === 'all' ? t('social.forYou') : t('social.followingTab')}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Players to follow */}
            {FOLLOW_ENABLED && userId && suggestions && suggestions.length > 0 && (
              <View style={{ marginBottom: 14 }}>
                <Text style={styles.suggestTitle}>{t('social.suggested')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  {suggestions.map((u: any) => (
                    <View key={u._id} style={styles.suggestCard}>
                      <TouchableOpacity onPress={() => navigation.navigate('PlayerProfile', { userId: u._id })} style={{ alignItems: 'center' }}>
                        {u.avatar ? (
                          <Image source={{ uri: u.avatar }} style={styles.suggestAvatar} />
                        ) : (
                          <View style={[styles.suggestAvatar, styles.authorAvatarFallback]}><Text style={styles.authorInitials}>{u.name.charAt(0).toUpperCase()}</Text></View>
                        )}
                        <Text style={styles.suggestName} numberOfLines={1}>{u.name}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.suggestBtn, followed.has(u._id) && { backgroundColor: theme.colors.glass }]}
                        disabled={followed.has(u._id)}
                        onPress={async () => {
                          try {
                            await followMutation({ sessionToken: sessionToken as string, userId: u._id });
                            setFollowed((f) => new Set([...f, u._id]));
                          } catch {}
                        }}
                      >
                        <Text style={styles.suggestBtnText}>{followed.has(u._id) ? t('pf.followingBtn') : t('pf.follow')}</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <PostCard
            post={item}
            isLiked={likedPostIds.has(item._id)}
            userId={userId}
            onToggleLike={handleToggleLike}
            onComment={(id) => setCommentPostId(id)}
            onReport={handleReportPost}
            onBlockUser={handleBlockUser}
            onDelete={handleDelete}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyFeed}>
            <Ionicons name="people-outline" size={56} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>{t('social.noPosts')}</Text>
            <Text style={styles.emptySubtitle}>
              {t('social.beFirst')}
            </Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => setCreateModalVisible(true)}
            >
              <LinearGradient
                colors={[theme.colors.redPrimary, '#8B0000']}
                style={styles.emptyBtnGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Ionicons name="add" size={18} color={theme.colors.bone} />
                <Text style={styles.emptyBtnText}>{t('social.createPost')}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Comment overlay */}
      {commentPostId && sessionToken && (
        <View style={styles.commentOverlay}>
          <TouchableOpacity
            style={styles.commentBackdrop}
            activeOpacity={1}
            onPress={() => setCommentPostId(null)}
          />
          <CommentSection
            postId={commentPostId}
            sessionToken={sessionToken}
            onClose={() => setCommentPostId(null)}
          />
        </View>
      )}

      {/* Create Post Modal */}
      <CreatePostModal
        visible={createModalVisible}
        onClose={() => setCreateModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  countsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10 },
  countsText: { fontSize: 12, color: theme.colors.textMuted },
  fbActions: { flexDirection: 'row', marginTop: 8, paddingTop: 4, borderTopWidth: 1, borderTopColor: theme.colors.border },
  fbAction: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9 },
  fbActionText: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary },
  composer: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginBottom: 12, borderRadius: theme.radius.lg,
    backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: theme.colors.border,
  },
  composerInput: { flex: 1, height: 40, borderRadius: 20, justifyContent: 'center', paddingHorizontal: 14, backgroundColor: theme.colors.glass },
  composerText: { color: theme.colors.textMuted, fontSize: 14 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  modeBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18, backgroundColor: theme.colors.glass },
  modeBtnOn: { backgroundColor: theme.colors.redPrimary },
  modeText: { color: theme.colors.textSecondary, fontWeight: '600', fontSize: 13 },
  suggestTitle: { color: theme.colors.textSecondary, fontWeight: '600', fontSize: 13, marginBottom: 8 },
  suggestCard: { width: 120, padding: 10, borderRadius: 14, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: theme.colors.border },
  suggestAvatar: { width: 56, height: 56, borderRadius: 28 },
  suggestName: { color: theme.colors.bone, fontWeight: '600', fontSize: 13, marginTop: 6, maxWidth: 100 },
  suggestBtn: { marginTop: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.colors.redPrimary },
  suggestBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },

  /* Header */
  screenHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 14,
  },
  screenTitle: { fontSize: 24, fontFamily: theme.fonts.display, color: theme.colors.bone },
  newPostBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.colors.redPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Post card */
  card: {
    backgroundColor: theme.colors.bgCardSolid,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    marginBottom: 16,
    overflow: 'hidden',
  },
  cardHeader: { padding: 14, paddingBottom: 8 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  moreBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 'auto',
  },
  authorAvatar: { width: 40, height: 40, borderRadius: 20 },
  authorAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.glass,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
  },
  authorInitials: { fontSize: 14, fontWeight: '800', color: theme.colors.redPrimary },
  authorInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  authorName: { fontSize: 14, fontWeight: '700', color: theme.colors.bone },
  companyBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(200, 30, 30, 0.15)',
  },
  companyBadgeText: { fontSize: 10, fontWeight: '700', color: theme.colors.redPrimary },
  timeText: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },

  /* Room tag */
  roomTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginHorizontal: 14,
    marginBottom: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(200, 16, 27, 0.08)',
    borderRadius: theme.radius.md,
    alignSelf: 'flex-start',
  },
  roomTagText: { fontSize: 12, fontWeight: '600', color: theme.colors.redPrimary },

  /* Rating */
  ratingRow: { paddingHorizontal: 14, marginBottom: 6 },
  starsRow: { flexDirection: 'row', gap: 2 },

  /* Post text */
  postText: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.bone,
    paddingHorizontal: 14,
    marginBottom: 10,
  },

  /* Media */
  mediaContainer: { marginBottom: 4 },
  mediaItem: {
    width: width - 80,
    height: 220,
    marginHorizontal: 4,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
  },
  mediaImage: { width: '100%', height: '100%' },
  playOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Actions */
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: 20,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionCount: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '600' },

  /* Empty feed */
  emptyFeed: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 10,
  },
  emptyTitle: { fontSize: 18, fontFamily: theme.fonts.display, color: theme.colors.bone },
  emptySubtitle: { fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', paddingHorizontal: 40 },
  emptyBtn: { marginTop: 16, borderRadius: theme.radius.lg, overflow: 'hidden' },
  emptyBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 22,
  },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: theme.colors.bone },

  /* Comment overlay */
  commentOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
  },
  commentBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  commentSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '65%',
    backgroundColor: theme.colors.bgSecondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  commentTitle: { fontSize: 17, fontWeight: '700', color: theme.colors.bone },
  commentList: { paddingHorizontal: 16 },
  commentItem: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  commentAvatar: { width: 32, height: 32, borderRadius: 16 },
  commentAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.glass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentInitials: { fontSize: 11, fontWeight: '800', color: theme.colors.redPrimary },
  commentContent: { flex: 1 },
  commentUser: { fontSize: 13, fontWeight: '700', color: theme.colors.bone },
  commentText: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2, lineHeight: 18 },
  commentTime: { fontSize: 11, color: theme.colors.textMuted, marginTop: 4 },
  emptyComments: { paddingVertical: 30, alignItems: 'center' },
  emptyText: { fontSize: 13, color: theme.colors.textMuted },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  commentInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: theme.radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 8,
    color: theme.colors.bone,
    fontSize: 14,
    maxHeight: 80,
  },
  sendBtn: { padding: 4 },
});
