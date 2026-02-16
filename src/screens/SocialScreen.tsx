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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { theme } from '../theme';
import { useUser } from '../UserContext';
import CreatePostModal from './CreatePostModal';
import type { Id } from '../../convex/_generated/dataModel';

const { width } = Dimensions.get('window');

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Ionicons
          key={star}
          name={star <= rating ? 'star' : 'star-outline'}
          size={14}
          color={star <= rating ? '#FFD700' : theme.colors.textMuted}
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
}

function PostCard({ post, isLiked, userId, onToggleLike, onComment }: PostCardProps) {
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
        <View style={styles.authorRow}>
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
                  <Text style={styles.companyBadgeText}>Business</Text>
                </View>
              )}
            </View>
            <Text style={styles.timeText}>{timeAgo(post.createdAt)}</Text>
          </View>
        </View>
      </View>

      {/* Room tag */}
      {post.roomTitle ? (
        <View style={styles.roomTag}>
          <Ionicons name="key-outline" size={13} color={theme.colors.redPrimary} />
          <Text style={styles.roomTagText}>{post.roomTitle}</Text>
        </View>
      ) : null}

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

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => onToggleLike(post._id)}
        >
          <Ionicons
            name={isLiked ? 'heart' : 'heart-outline'}
            size={22}
            color={isLiked ? theme.colors.redPrimary : theme.colors.textSecondary}
          />
          <Text style={[styles.actionCount, isLiked && { color: theme.colors.redPrimary }]}>
            {post.likes || 0}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => onComment(post._id)}
        >
          <Ionicons name="chatbubble-outline" size={20} color={theme.colors.textSecondary} />
          <Text style={styles.actionCount}>{post.commentCount || 0}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn}>
          <Ionicons name="share-outline" size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ── Comment Sheet ── */
function CommentSection({
  postId,
  userId,
  onClose,
}: {
  postId: Id<'posts'>;
  userId: string;
  onClose: () => void;
}) {
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
        userId: userId as Id<'users'>,
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
        <Text style={styles.commentTitle}>Comments</Text>
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="close" size={22} color="#fff" />
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
                <Text style={styles.commentTime}>{timeAgo(item.createdAt)}</Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyComments}>
            <Text style={styles.emptyText}>No comments yet. Be the first!</Text>
          </View>
        }
      />

      <View style={styles.commentInputRow}>
        <TextInput
          style={styles.commentInput}
          placeholder="Add a comment..."
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
  const { userId } = useUser();
  const feed = useQuery(api.posts.getFeed);
  const userLikes = useQuery(
    api.posts.getUserLikes,
    userId ? { userId: userId as Id<'users'> } : 'skip'
  );
  const toggleLike = useMutation(api.posts.toggleLike);

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [commentPostId, setCommentPostId] = useState<Id<'posts'> | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const likedPostIds = new Set(userLikes || []);

  const handleToggleLike = async (postId: Id<'posts'>) => {
    if (!userId) return;
    try {
      await toggleLike({ postId, userId: userId as Id<'users'> });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // Convex queries auto-refresh; just show the spinner briefly
    setTimeout(() => setRefreshing(false), 800);
  }, []);

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
        <Text style={styles.screenTitle}>Social</Text>
        <TouchableOpacity
          style={styles.newPostBtn}
          onPress={() => setCreateModalVisible(true)}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Feed */}
      <FlatList
        data={feed}
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
        renderItem={({ item }) => (
          <PostCard
            post={item}
            isLiked={likedPostIds.has(item._id)}
            userId={userId}
            onToggleLike={handleToggleLike}
            onComment={(id) => setCommentPostId(id)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyFeed}>
            <Ionicons name="people-outline" size={56} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>No posts yet</Text>
            <Text style={styles.emptySubtitle}>
              Be the first to share your escape room experience!
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
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.emptyBtnText}>Create Post</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Comment overlay */}
      {commentPostId && userId && (
        <View style={styles.commentOverlay}>
          <TouchableOpacity
            style={styles.commentBackdrop}
            activeOpacity={1}
            onPress={() => setCommentPostId(null)}
          />
          <CommentSection
            postId={commentPostId}
            userId={userId}
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
  screenTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },
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
  authorName: { fontSize: 14, fontWeight: '700', color: '#fff' },
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
    backgroundColor: 'rgba(255, 30, 30, 0.08)',
    borderRadius: 8,
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
    color: '#fff',
    paddingHorizontal: 14,
    marginBottom: 10,
  },

  /* Media */
  mediaContainer: { marginBottom: 4 },
  mediaItem: {
    width: width - 80,
    height: 220,
    marginHorizontal: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  mediaImage: { width: '100%', height: '100%' },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
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
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  emptySubtitle: { fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', paddingHorizontal: 40 },
  emptyBtn: { marginTop: 16, borderRadius: 14, overflow: 'hidden' },
  emptyBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 22,
  },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  /* Comment overlay */
  commentOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  commentBackdrop: {
    ...StyleSheet.absoluteFillObject,
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
  commentTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
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
  commentUser: { fontSize: 13, fontWeight: '700', color: '#fff' },
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
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    color: '#fff',
    fontSize: 14,
    maxHeight: 80,
  },
  sendBtn: { padding: 4 },
});
