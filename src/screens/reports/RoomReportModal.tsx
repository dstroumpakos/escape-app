// A player reports a room they played (safety issue or inappropriate
// behaviour). Goes only to the UNLOCKED team; the business never sees who sent it.

import React, { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  Image, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';
import { ROOM_REPORT_MAX_PHOTOS, ROOM_REPORT_MIN_CHARS, ROOM_REPORT_MAX_CHARS } from '../../../convex/reportRules';
import { reportErrorText } from './reportErrors';

type Kind = 'safety' | 'behaviour';

export default function RoomReportModal({
  visible,
  userId,
  booking,
  onClose,
  onSent,
}: {
  visible: boolean;
  userId: string;
  booking: { _id: string; date: string; time: string; room?: { title?: string } | null } | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const { t } = useTranslation();
  const generateUploadUrl = useMutation(api.reports.generateRoomReportUploadUrl);
  const submit = useMutation(api.reports.submitRoomReport);
  const [kind, setKind] = useState<Kind | null>(null);
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const reset = () => {
    setKind(null);
    setText('');
    setPhotos([]);
  };

  const pickPhotos = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('createPost.permissionRequired'), t('createPost.photoLibraryPermission'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: ROOM_REPORT_MAX_PHOTOS - photos.length,
      quality: 0.7,
    });
    if (!result.canceled) {
      setPhotos((p) => [...p, ...result.assets.map((a) => a.uri)].slice(0, ROOM_REPORT_MAX_PHOTOS));
    }
  };

  const send = async () => {
    if (!booking || !kind) return;
    setSending(true);
    try {
      const ids: Id<'_storage'>[] = [];
      for (const uri of photos) {
        const url = await generateUploadUrl({ userId: userId as Id<'users'> });
        const blob = await (await fetch(uri)).blob();
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': blob.type || 'image/jpeg' },
          body: blob,
        });
        if (!res.ok) throw new Error('upload');
        const { storageId } = await res.json();
        ids.push(storageId);
      }
      await submit({
        userId: userId as Id<'users'>,
        bookingId: booking._id as Id<'bookings'>,
        kind,
        description: text,
        photoStorageIds: ids,
      });
      reset();
      onSent();
    } catch (e: any) {
      Alert.alert(t('error'), e?.message === 'upload' ? t('reports.err.upload') : reportErrorText(e, t));
    }
    setSending(false);
  };

  const canSend = !!kind && text.trim().length >= ROOM_REPORT_MIN_CHARS && !sending;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('reports.room.title')}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel={t('reports.close')}>
            <Ionicons name="close" size={22} color={theme.colors.bone} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          {booking && (
            <Text style={styles.sub}>
              {booking.room?.title} · {booking.date} · {booking.time}
            </Text>
          )}

          <Text style={styles.label}>{t('reports.room.kindLabel')}</Text>
          {(['safety', 'behaviour'] as Kind[]).map((k) => (
            <TouchableOpacity
              key={k}
              style={[styles.option, kind === k && styles.optionOn]}
              onPress={() => setKind(k)}
              accessibilityRole="radio"
              accessibilityState={{ selected: kind === k }}
            >
              <Ionicons
                name={kind === k ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={kind === k ? theme.colors.redPrimary : theme.colors.textMuted}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.optionTitle}>{t(k === 'safety' ? 'reports.room.kindSafety' : 'reports.room.kindBehaviour')}</Text>
                <Text style={styles.muted}>{t(k === 'safety' ? 'reports.room.kindSafetyHint' : 'reports.room.kindBehaviourHint')}</Text>
              </View>
            </TouchableOpacity>
          ))}

          <Text style={[styles.label, { marginTop: 16 }]}>{t('reports.room.describe')}</Text>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={(v) => setText(v.slice(0, ROOM_REPORT_MAX_CHARS))}
            placeholder={t('reports.room.describePlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
            multiline
          />
          <Text style={[styles.muted, { textAlign: 'right' }]}>{text.length}/{ROOM_REPORT_MAX_CHARS}</Text>

          <Text style={[styles.label, { marginTop: 12 }]}>{t('reports.room.photos', { max: ROOM_REPORT_MAX_PHOTOS })}</Text>
          <View style={styles.photoRow}>
            {photos.map((uri, i) => (
              <View key={uri} style={styles.photo}>
                <Image source={{ uri }} style={StyleSheet.absoluteFill} />
                <TouchableOpacity
                  style={styles.photoRemove}
                  onPress={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                  accessibilityLabel={t('reports.room.removePhoto')}
                >
                  <Ionicons name="close" size={14} color={theme.colors.bone} />
                </TouchableOpacity>
              </View>
            ))}
            {photos.length < ROOM_REPORT_MAX_PHOTOS && (
              <TouchableOpacity style={[styles.photo, styles.photoAdd]} onPress={pickPhotos} accessibilityLabel={t('reports.room.addPhoto')}>
                <Ionicons name="image-outline" size={24} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.privacy}>
            <Ionicons name="lock-closed-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={[styles.muted, { flex: 1 }]}>{t('reports.room.privacy')}</Text>
          </View>

          <TouchableOpacity style={[styles.submit, !canSend && { opacity: 0.4 }]} disabled={!canSend} onPress={send}>
            {sending ? <ActivityIndicator color={theme.colors.bone} /> : <Text style={styles.submitText}>{t('reports.room.submit')}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 20, paddingHorizontal: 20, paddingBottom: 8,
  },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: theme.fonts.display, color: theme.colors.bone },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.glass,
  },
  sub: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '700', color: theme.colors.bone, marginBottom: 8 },
  muted: { fontSize: 12, color: theme.colors.textMuted },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 8,
    borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.glassBorder,
    backgroundColor: theme.colors.bgCardSolid,
  },
  optionOn: { borderColor: theme.colors.redPrimary },
  optionTitle: { fontSize: 14, fontWeight: '700', color: theme.colors.bone, marginBottom: 2 },
  input: {
    minHeight: 120, padding: 12, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.glass, borderWidth: 1, borderColor: theme.colors.glassBorder,
    color: theme.colors.bone, fontSize: 14, textAlignVertical: 'top',
  },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo: { width: 72, height: 72, borderRadius: theme.radius.md, overflow: 'hidden', backgroundColor: theme.colors.glass },
  photoAdd: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderStyle: 'dashed', borderColor: theme.colors.glassBorder,
  },
  photoRemove: {
    position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center',
  },
  privacy: {
    flexDirection: 'row', gap: 8, marginTop: 16, padding: 12,
    borderRadius: theme.radius.md, backgroundColor: theme.colors.glass,
  },
  submit: {
    marginTop: 20, paddingVertical: 16, borderRadius: theme.radius.full,
    backgroundColor: theme.colors.redPrimary, alignItems: 'center',
  },
  submitText: { fontSize: 16, fontWeight: '700', color: theme.colors.bone },
});
