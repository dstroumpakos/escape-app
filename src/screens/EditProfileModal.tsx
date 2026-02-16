import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Image,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { theme } from '../theme';
import type { Id } from '../../convex/_generated/dataModel';

interface Props {
  visible: boolean;
  onClose: () => void;
  userId: string;
  currentName: string;
  currentAvatar: string;
}

export default function EditProfileModal({ visible, onClose, userId, currentName, currentAvatar }: Props) {
  const [name, setName] = useState(currentName);
  const [avatarUri, setAvatarUri] = useState(currentAvatar);
  const [newImageSelected, setNewImageSelected] = useState(false);
  const [saving, setSaving] = useState(false);

  const updateProfile = useMutation(api.users.updateProfile);
  const generateUploadUrl = useMutation(api.users.generateUploadUrl);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library to change your profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
      setNewImageSelected(true);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow camera access to take a profile photo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
      setNewImageSelected(true);
    }
  };

  const showImageOptions = () => {
    Alert.alert('Profile Photo', 'Choose an option', [
      { text: 'Take Photo', onPress: takePhoto },
      { text: 'Choose from Library', onPress: pickImage },
      ...(avatarUri ? [{ text: 'Remove Photo', style: 'destructive' as const, onPress: () => { setAvatarUri(''); setNewImageSelected(true); } }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Name cannot be empty');
      return;
    }

    setSaving(true);
    try {
      let avatarUrl = currentAvatar;

      // Upload new image if selected
      if (newImageSelected && avatarUri) {
        const uploadUrl = await generateUploadUrl();

        const response = await fetch(avatarUri);
        const blob = await response.blob();

        const uploadResponse = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': blob.type || 'image/jpeg' },
          body: blob,
        });

        const { storageId } = await uploadResponse.json();

        await updateProfile({
          userId: userId as Id<"users">,
          name: name.trim(),
          avatarStorageId: storageId as Id<"_storage">,
        });
      } else {
        await updateProfile({
          userId: userId as Id<"users">,
          name: name.trim(),
          ...(newImageSelected ? { avatar: '' } : {}),
        });
      }

      onClose();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const initials = name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .join('')
    .toUpperCase();

  const hasChanges = name.trim() !== currentName || newImageSelected;

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} disabled={saving}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Edit Profile</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving || !hasChanges}>
              {saving ? (
                <ActivityIndicator size="small" color={theme.colors.redPrimary} />
              ) : (
                <Text style={[styles.saveText, !hasChanges && styles.saveTextDisabled]}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Avatar */}
          <TouchableOpacity style={styles.avatarSection} onPress={showImageOptions} activeOpacity={0.7}>
            <View style={styles.avatarRing}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitials}>{initials || '?'}</Text>
                </View>
              )}
              <View style={styles.cameraIcon}>
                <Ionicons name="camera" size={16} color="#fff" />
              </View>
            </View>
            <Text style={styles.changePhotoText}>Change Photo</Text>
          </TouchableOpacity>

          {/* Name Input */}
          <View style={styles.fieldSection}>
            <Text style={styles.fieldLabel}>Name</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="person-outline" size={18} color={theme.colors.textMuted} />
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor={theme.colors.textMuted}
                autoCapitalize="words"
                returnKeyType="done"
              />
              {name !== currentName && (
                <TouchableOpacity onPress={() => setName(currentName)}>
                  <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
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
    paddingBottom: 40,
    minHeight: 400,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  cancelText: {
    fontSize: 15,
    color: theme.colors.textSecondary,
  },
  saveText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.redPrimary,
  },
  saveTextDisabled: {
    opacity: 0.4,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  avatarRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: theme.colors.redPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  avatarImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  avatarPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: theme.colors.bgCardSolid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 32,
    fontWeight: '800',
    color: theme.colors.redPrimary,
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.colors.redPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.bgSecondary,
  },
  changePhotoText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.redPrimary,
  },
  fieldSection: {
    paddingHorizontal: 20,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    height: 50,
    gap: 10,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
  },
});
