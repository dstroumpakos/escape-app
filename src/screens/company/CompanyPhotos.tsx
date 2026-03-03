import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Alert, ActivityIndicator, FlatList, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';
import type { Id } from '../../../convex/_generated/dataModel';

interface Props {
  companyId: string;
}

export default function CompanyPhotos({ companyId }: Props) {
  const { t } = useTranslation();
  const cId = companyId as Id<'companies'>;

  const completedBookings = useQuery(api.bookingPhotos.getCompletedBookings, { companyId: cId });
  const photoPreset = useQuery(api.bookingPhotos.getPreset, { companyId: cId });

  const generateUploadUrl = useMutation(api.companies.generateUploadUrl);
  const getUrlMutation = useMutation(api.companies.getUrlMutation);
  const addPhoto = useMutation(api.bookingPhotos.addPhoto);
  const deletePhoto = useMutation(api.bookingPhotos.deletePhoto);
  const markPhotoProcessed = useMutation(api.bookingPhotos.markPhotoProcessed);
  const checkAndNotify = useMutation(api.bookingPhotos.checkAndNotifyBooking);

  const [expandedBooking, setExpandedBooking] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);
  const [processing, setProcessing] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Fetch photos for expanded booking
  const bookingPhotos = useQuery(
    api.bookingPhotos.getByBooking,
    expandedBooking ? { bookingId: expandedBooking as Id<'bookings'> } : 'skip'
  );

  const handlePickAndUpload = useCallback(async (bookingId: string) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('error'), t('photos.permissionDenied'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.85,
    });

    if (result.canceled || result.assets.length === 0) return;

    setUploading(true);
    setUploadProgress(0);
    setUploadTotal(result.assets.length);

    try {
      const existingPhotos = bookingPhotos || [];
      let order = existingPhotos.length;

      for (let i = 0; i < result.assets.length; i++) {
        const asset = result.assets[i];

        // Upload to Convex storage
        const uploadUrl = await generateUploadUrl();
        const mime = asset.mimeType || 'image/jpeg';
        const resp = await fetch(asset.uri);
        const blob = await resp.blob();

        const uploadResp = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': mime },
          body: blob,
        });
        const { storageId } = await uploadResp.json();
        const url = await getUrlMutation({ storageId });

        if (url) {
          await addPhoto({
            bookingId: bookingId as Id<'bookings'>,
            companyId: cId,
            storageId,
            url,
            order: order + i,
          });
        }

        setUploadProgress(i + 1);
      }

      setExpandedBooking(bookingId);
    } catch (err) {
      console.error('Upload failed:', err);
      Alert.alert(t('error'), t('photos.uploadFailed'));
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadTotal(0);
    }
  }, [bookingPhotos, cId, generateUploadUrl, getUrlMutation, addPhoto, t]);

  const handleProcessAll = useCallback(async (bookingId: string) => {
    if (!bookingPhotos) return;
    setProcessing(bookingId);
    try {
      // On mobile we can't do canvas compositing — we just mark as processed
      // (backend processes with Convex action or they stay as originals)
      const pending = bookingPhotos.filter((p: any) => p.status === 'pending');
      for (const photo of pending) {
        await markPhotoProcessed({
          photoId: photo._id,
          companyId: cId,
          processedStorageId: photo.originalStorageId,
          processedUrl: photo.originalUrl,
        });
      }

      await checkAndNotify({
        bookingId: bookingId as Id<'bookings'>,
        companyId: cId,
      });

      Alert.alert(t('photos.processed'), t('photos.processedDesc'));
    } catch (err) {
      console.error('Processing failed:', err);
      Alert.alert(t('error'), t('photos.processFailed'));
    } finally {
      setProcessing(null);
    }
  }, [bookingPhotos, cId, markPhotoProcessed, checkAndNotify, t]);

  const handleDelete = useCallback(async (photoId: string) => {
    Alert.alert(t('photos.deleteTitle'), t('photos.deleteMessage'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('photos.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePhoto({
              photoId: photoId as Id<'bookingPhotos'>,
              companyId: cId,
            });
          } catch {
            Alert.alert(t('error'), t('photos.deleteFailed'));
          }
        },
      },
    ]);
  }, [cId, deletePhoto, t]);

  const statusIcon = (status: string) => {
    switch (status) {
      case 'ready':
        return <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />;
      case 'processing':
        return <ActivityIndicator size={14} color="#FFA726" />;
      case 'pending':
        return <Ionicons name="time-outline" size={16} color={theme.colors.textMuted} />;
      case 'failed':
        return <Ionicons name="alert-circle" size={16} color="#F44336" />;
      default:
        return null;
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="camera" size={24} color={theme.colors.redPrimary} />
          <Text style={styles.headerTitle}>{t('photos.title')}</Text>
        </View>
      </View>

      {!completedBookings ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.redPrimary} />
          <Text style={styles.loadingText}>{t('loading')}</Text>
        </View>
      ) : completedBookings.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="camera-outline" size={64} color={theme.colors.textMuted} />
          <Text style={styles.emptyTitle}>{t('photos.noBookings')}</Text>
          <Text style={styles.emptyText}>{t('photos.noBookingsDesc')}</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
          <Text style={styles.subtitle}>{t('photos.subtitle')}</Text>

          {completedBookings.map((booking: any) => {
            const isExpanded = expandedBooking === booking._id;

            return (
              <View key={booking._id} style={styles.bookingCard}>
                {/* Booking Header */}
                <TouchableOpacity
                  style={styles.bookingHeader}
                  activeOpacity={0.7}
                  onPress={() => setExpandedBooking(isExpanded ? null : booking._id)}
                >
                  <View style={styles.bookingInfo}>
                    <View style={styles.bookingTitleRow}>
                      <Text style={styles.bookingRoom} numberOfLines={1}>
                        {booking.room?.title || 'Room'}
                      </Text>
                      {booking.photoCount > 0 && (
                        <View style={styles.photoBadge}>
                          <Text style={styles.photoBadgeText}>
                            {t('photos.count', { count: String(booking.photoCount) })}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.bookingMeta}>
                      <Ionicons name="calendar-outline" size={12} color={theme.colors.textMuted} />
                      <Text style={styles.metaText}>{formatDate(booking.date)}</Text>
                      <Ionicons name="time-outline" size={12} color={theme.colors.textMuted} />
                      <Text style={styles.metaText}>{booking.time}</Text>
                      <Ionicons name="person-outline" size={12} color={theme.colors.textMuted} />
                      <Text style={styles.metaText}>{booking.playerName || t('photos.unknownPlayer')}</Text>
                    </View>
                  </View>

                  <View style={styles.headerActions}>
                    <TouchableOpacity
                      style={styles.uploadBtn}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        handlePickAndUpload(booking._id);
                      }}
                      disabled={uploading}
                    >
                      <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
                      <Text style={styles.uploadBtnText}>{t('photos.upload')}</Text>
                    </TouchableOpacity>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={20}
                      color={theme.colors.textMuted}
                    />
                  </View>
                </TouchableOpacity>

                {/* Expanded Photo Grid */}
                {isExpanded && (
                  <View style={styles.photosSection}>
                    {bookingPhotos && bookingPhotos.length > 0 ? (
                      <>
                        <View style={styles.photoGrid}>
                          {bookingPhotos.map((photo: any) => (
                            <View key={photo._id} style={styles.photoItem}>
                              <TouchableOpacity
                                activeOpacity={0.8}
                                onPress={() => setPreviewUrl(photo.processedUrl || photo.originalUrl)}
                              >
                                <Image
                                  source={{ uri: photo.processedUrl || photo.originalUrl }}
                                  style={styles.photoImage}
                                  resizeMode="cover"
                                />
                              </TouchableOpacity>
                              <View style={styles.photoStatus}>
                                {statusIcon(photo.status)}
                              </View>
                              <TouchableOpacity
                                style={styles.deleteBtn}
                                onPress={() => handleDelete(photo._id)}
                              >
                                <Ionicons name="trash-outline" size={14} color="#F44336" />
                              </TouchableOpacity>
                            </View>
                          ))}
                        </View>

                        {/* Process All button */}
                        {bookingPhotos.some((p: any) => p.status === 'pending') && (
                          <TouchableOpacity
                            style={styles.processBtn}
                            onPress={() => handleProcessAll(booking._id)}
                            disabled={processing === booking._id}
                          >
                            {processing === booking._id ? (
                              <ActivityIndicator size={16} color="#fff" />
                            ) : (
                              <Ionicons name="images-outline" size={16} color="#fff" />
                            )}
                            <Text style={styles.processBtnText}>{t('photos.processAll')}</Text>
                          </TouchableOpacity>
                        )}

                        {/* All ready indicator */}
                        {bookingPhotos.every((p: any) => p.status === 'ready') && (
                          <View style={styles.allReadyRow}>
                            <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                            <Text style={styles.allReadyText}>{t('photos.allReady')}</Text>
                          </View>
                        )}
                      </>
                    ) : (
                      <View style={styles.noPhotos}>
                        <Ionicons name="image-outline" size={40} color={theme.colors.textMuted} style={{ opacity: 0.4 }} />
                        <Text style={styles.noPhotosText}>{t('photos.noPhotosYet')}</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Upload Progress Overlay */}
      {uploading && (
        <View style={styles.uploadOverlay}>
          <View style={styles.uploadModal}>
            <ActivityIndicator size="large" color={theme.colors.redPrimary} />
            <Text style={styles.uploadModalText}>
              {t('photos.uploading', { current: String(uploadProgress), total: String(uploadTotal) })}
            </Text>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${(uploadProgress / Math.max(uploadTotal, 1)) * 100}%` },
                ]}
              />
            </View>
          </View>
        </View>
      )}

      {/* Full-screen Preview Modal */}
      <Modal visible={!!previewUrl} transparent animationType="fade">
        <TouchableOpacity
          style={styles.previewOverlay}
          activeOpacity={1}
          onPress={() => setPreviewUrl(null)}
        >
          <TouchableOpacity
            style={styles.previewClose}
            onPress={() => setPreviewUrl(null)}
          >
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          {previewUrl && (
            <Image
              source={{ uri: previewUrl }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          )}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },
  subtitle: {
    fontSize: 13, color: theme.colors.textSecondary,
    paddingHorizontal: 20, marginBottom: 16,
  },

  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: theme.colors.textMuted },

  emptyContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 12,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  emptyText: { fontSize: 13, color: theme.colors.textMuted, textAlign: 'center' },

  bookingCard: {
    marginHorizontal: 20, marginBottom: 12,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    overflow: 'hidden',
  },
  bookingHeader: {
    flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12,
  },
  bookingInfo: { flex: 1 },
  bookingTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  bookingRoom: { fontSize: 15, fontWeight: '700', color: '#fff', flexShrink: 1 },
  photoBadge: {
    backgroundColor: 'rgba(244,67,54,0.2)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
  },
  photoBadgeText: { fontSize: 10, fontWeight: '700', color: theme.colors.redPrimary },
  bookingMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  metaText: { fontSize: 11, color: theme.colors.textMuted, marginRight: 4 },

  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: theme.colors.redPrimary, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: theme.radius.md,
  },
  uploadBtnText: { fontSize: 12, fontWeight: '600', color: '#fff' },

  photosSection: {
    borderTopWidth: 1, borderTopColor: theme.colors.glassBorder, padding: 16,
  },
  photoGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12,
  },
  photoItem: {
    width: '31%' as any, aspectRatio: 1, borderRadius: theme.radius.md,
    overflow: 'hidden', backgroundColor: theme.colors.bgPrimary,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  photoImage: { width: '100%', height: '100%' },
  photoStatus: { position: 'absolute', top: 6, left: 6 },
  deleteBtn: {
    position: 'absolute', top: 4, right: 4,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },

  processBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: theme.colors.redPrimary, paddingVertical: 12,
    borderRadius: theme.radius.md, marginBottom: 8,
  },
  processBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },

  allReadyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center',
  },
  allReadyText: { fontSize: 13, color: '#4CAF50', fontWeight: '600' },

  noPhotos: { alignItems: 'center', paddingVertical: 30, gap: 8 },
  noPhotosText: { fontSize: 13, color: theme.colors.textMuted },

  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 50,
  },
  uploadModal: {
    backgroundColor: theme.colors.bgCardSolid, borderRadius: theme.radius.lg,
    padding: 32, alignItems: 'center', width: '80%',
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  uploadModalText: { fontSize: 16, fontWeight: '600', color: '#fff', marginTop: 16 },
  progressBar: {
    width: '100%', height: 6, borderRadius: 3,
    backgroundColor: theme.colors.glass, marginTop: 16, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', borderRadius: 3, backgroundColor: theme.colors.redPrimary,
  },

  previewOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center', justifyContent: 'center',
  },
  previewClose: {
    position: 'absolute', top: 50, right: 20, zIndex: 10,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  previewImage: { width: '95%', height: '80%' },
});
