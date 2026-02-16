import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { theme } from '../theme';
import { useUser } from '../UserContext';
import { useTranslation } from '../i18n';
import type { Id } from '../../convex/_generated/dataModel';

interface Props {
  visible: boolean;
  onClose: () => void;
}

interface MediaItem {
  uri: string;
  type: 'image' | 'video';
}

export default function CreatePostModal({ visible, onClose }: Props) {
  const { userId } = useUser();
  const [text, setText] = useState('');
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [rating, setRating] = useState(0);
  const [posting, setPosting] = useState(false);

  const createPost = useMutation(api.posts.createPost);
  const generateUploadUrl = useMutation(api.posts.generateUploadUrl);
  const { t } = useTranslation();

  const pickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('createPost.permissionRequired'), t('createPost.photoLibraryPermission'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: 5,
      quality: 0.8,
    });

    if (!result.canceled) {
      const newMedia = result.assets.map((asset) => ({
        uri: asset.uri,
        type: (asset.type === 'video' ? 'video' : 'image') as 'image' | 'video',
      }));
      setMedia((prev) => [...prev, ...newMedia].slice(0, 5));
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('createPost.permissionRequired'), t('createPost.cameraPermission'));
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setMedia((prev) =>
        [...prev, { uri: result.assets[0].uri, type: 'image' as const }].slice(0, 5)
      );
    }
  };

  const removeMedia = (index: number) => {
    setMedia((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePost = async () => {
    if (!text.trim() && media.length === 0) {
      Alert.alert(t('error'), t('createPost.addContent'));
      return;
    }
    if (!userId) return;

    setPosting(true);
    try {
      // Upload all media files
      const mediaStorageIds = await Promise.all(
        media.map(async (m) => {
          const uploadUrl = await generateUploadUrl();
          const response = await fetch(m.uri);
          const blob = await response.blob();
          const uploadResponse = await fetch(uploadUrl, {
            method: 'POST',
            headers: { 'Content-Type': blob.type || 'image/jpeg' },
            body: blob,
          });
          const { storageId } = await uploadResponse.json();
          return { type: m.type, storageId: storageId as Id<'_storage'> };
        })
      );

      await createPost({
        authorType: 'user',
        authorUserId: userId as Id<'users'>,
        text: text.trim(),
        mediaStorageIds,
        rating: rating > 0 ? rating : undefined,
      });

      // Reset form
      setText('');
      setMedia([]);
      setRating(0);
      onClose();
    } catch (err: any) {
      Alert.alert(t('error'), err.message || t('createPost.failed'));
    } finally {
      setPosting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} disabled={posting}>
              <Text style={styles.cancelText}>{t('cancel')}</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('createPost.title')}</Text>
            <TouchableOpacity
              onPress={handlePost}
              disabled={posting || (!text.trim() && media.length === 0)}
            >
              {posting ? (
                <ActivityIndicator size="small" color={theme.colors.redPrimary} />
              ) : (
                <Text
                  style={[
                    styles.postBtnText,
                    !text.trim() && media.length === 0 && styles.postBtnDisabled,
                  ]}
                >
                  {t('createPost.post')}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Text Input */}
            <TextInput
              style={styles.textInput}
              placeholder={t('createPost.placeholder')}
              placeholderTextColor={theme.colors.textMuted}
              multiline
              value={text}
              onChangeText={setText}
              maxLength={500}
            />

            {/* Star Rating */}
            <View style={styles.ratingSection}>
              <Text style={styles.ratingLabel}>{t('createPost.rateExperience')}</Text>
              <View style={styles.stars}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity key={star} onPress={() => setRating(star === rating ? 0 : star)}>
                    <Ionicons
                      name={star <= rating ? 'star' : 'star-outline'}
                      size={28}
                      color={star <= rating ? '#FFD700' : theme.colors.textMuted}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Media preview */}
            {media.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaScroll}>
                {media.map((m, i) => (
                  <View key={i} style={styles.mediaThumb}>
                    <Image source={{ uri: m.uri }} style={styles.mediaImage} />
                    {m.type === 'video' && (
                      <View style={styles.videoOverlay}>
                        <Ionicons name="play-circle" size={28} color="#fff" />
                      </View>
                    )}
                    <TouchableOpacity style={styles.removeMedia} onPress={() => removeMedia(i)}>
                      <Ionicons name="close-circle" size={22} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
          </ScrollView>

          {/* Bottom toolbar */}
          <View style={styles.toolbar}>
            <TouchableOpacity style={styles.toolBtn} onPress={pickImages}>
              <Ionicons name="images-outline" size={22} color={theme.colors.redPrimary} />
              <Text style={styles.toolLabel}>{t('createPost.gallery')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.toolBtn} onPress={takePhoto}>
              <Ionicons name="camera-outline" size={22} color={theme.colors.redPrimary} />
              <Text style={styles.toolLabel}>{t('createPost.camera')}</Text>
            </TouchableOpacity>
            <Text style={styles.charCount}>{text.length}/500</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.bgSecondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    minHeight: 420,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  cancelText: { fontSize: 15, color: theme.colors.textSecondary },
  postBtnText: { fontSize: 15, fontWeight: '700', color: theme.colors.redPrimary },
  postBtnDisabled: { opacity: 0.4 },
  body: { padding: 20 },
  textInput: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 22,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  ratingSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  ratingLabel: { fontSize: 13, color: theme.colors.textMuted },
  stars: { flexDirection: 'row', gap: 4 },
  mediaScroll: { marginTop: 10, marginBottom: 10 },
  mediaThumb: {
    width: 100,
    height: 100,
    borderRadius: 12,
    marginRight: 10,
    overflow: 'hidden',
  },
  mediaImage: { width: '100%', height: '100%' },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeMedia: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: 20,
  },
  toolBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toolLabel: { fontSize: 13, color: theme.colors.textSecondary },
  charCount: { fontSize: 12, color: theme.colors.textMuted, marginLeft: 'auto' },
});
