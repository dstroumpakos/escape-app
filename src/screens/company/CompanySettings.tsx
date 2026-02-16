import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { theme } from '../../theme';
import type { Id } from '../../../convex/_generated/dataModel';

interface Props {
  companyId: string;
  onLogout: () => void;
  onSwitchToPlayer?: () => void;
}

export default function CompanySettings({ companyId, onLogout, onSwitchToPlayer }: Props) {
  const company = useQuery(api.companies.getById, { id: companyId as Id<"companies"> });
  const updateProfile = useMutation(api.companies.updateProfile);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (company) {
      setName(company.name);
      setPhone(company.phone);
      setAddress(company.address);
      setCity(company.city);
      setDescription(company.description);
    }
  }, [company]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({
        id: companyId as Id<"companies">,
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        city: city.trim(),
        description: description.trim(),
      });
      Alert.alert('Saved', 'Company profile updated.');
    } catch {
      Alert.alert('Error', 'Failed to update profile.');
    }
    setSaving(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Company Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Ionicons name="business" size={32} color={theme.colors.redPrimary} />
            </View>
          </View>
          <Text style={styles.companyEmail}>{company?.email ?? ''}</Text>
          <View style={styles.verifiedBadge}>
            <Ionicons
              name={company?.verified ? 'shield-checkmark' : 'shield-outline'}
              size={14}
              color={company?.verified ? theme.colors.success : theme.colors.textMuted}
            />
            <Text style={[styles.verifiedText, company?.verified && { color: theme.colors.success }]}>
              {company?.verified ? 'Verified Business' : 'Verification Pending'}
            </Text>
          </View>
        </View>

        {/* Profile Fields */}
        <Text style={styles.sectionTitle}>Company Information</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Company Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholderTextColor={theme.colors.textMuted}
          />

          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholderTextColor={theme.colors.textMuted}
          />

          <Text style={styles.label}>City</Text>
          <TextInput
            style={styles.input}
            value={city}
            onChangeText={setCity}
            placeholderTextColor={theme.colors.textMuted}
          />

          <Text style={styles.label}>Address</Text>
          <TextInput
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            placeholderTextColor={theme.colors.textMuted}
          />

          <Text style={styles.label}>About</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            multiline
            placeholderTextColor={theme.colors.textMuted}
          />
        </View>

        {/* Save Profile */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          disabled={saving}
          onPress={handleSave}
          activeOpacity={0.8}
        >
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
        </TouchableOpacity>

        {/* Menu */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          {[
            { icon: 'notifications-outline' as const, label: 'Notification Preferences', action: () => Alert.alert('Coming Soon', 'Notification settings will be available soon.') },
            { icon: 'card-outline' as const, label: 'Payout Settings', action: () => Alert.alert('Coming Soon', 'Payout configuration will be available soon.') },
            { icon: 'document-text-outline' as const, label: 'Legal & Compliance', action: () => Alert.alert('Coming Soon', 'Legal documents and compliance info.') },
            { icon: 'help-circle-outline' as const, label: 'Help & Support', action: () => Alert.alert('Support', 'Contact us at business@unlocked.app') },
          ].map((item, i) => (
            <TouchableOpacity key={i} style={styles.menuItem} onPress={item.action}>
              <View style={styles.menuLeft}>
                <Ionicons name={item.icon} size={20} color={theme.colors.textSecondary} />
                <Text style={styles.menuLabel}>{item.label}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Switch to Player App */}
        {onSwitchToPlayer && (
          <TouchableOpacity
            style={styles.switchBtn}
            onPress={onSwitchToPlayer}
          >
            <Ionicons name="phone-portrait-outline" size={20} color={theme.colors.redPrimary} />
            <Text style={styles.switchBtnText}>Switch to Player App</Text>
          </TouchableOpacity>
        )}

        {/* Logout */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={() => Alert.alert('Sign Out', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign Out', style: 'destructive', onPress: onLogout },
          ])}
        >
          <Ionicons name="log-out-outline" size={20} color="#F44336" />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },

  avatarSection: { alignItems: 'center', marginBottom: 24 },
  avatarRing: {
    width: 88, height: 88, borderRadius: 44,
    borderWidth: 2, borderColor: theme.colors.redPrimary,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  avatar: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: theme.colors.bgCardSolid,
    alignItems: 'center', justifyContent: 'center',
  },
  companyEmail: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 8 },
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 5, paddingHorizontal: 12, borderRadius: 20,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  verifiedText: { fontSize: 11, fontWeight: '600', color: theme.colors.textMuted },

  sectionTitle: {
    fontSize: 16, fontWeight: '700', color: '#fff',
    paddingHorizontal: 20, marginBottom: 10, marginTop: 8,
  },
  card: {
    marginHorizontal: 20, padding: 16, marginBottom: 16,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  label: {
    fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary,
    marginBottom: 6, marginTop: 12,
  },
  input: {
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    color: '#fff', fontSize: 14,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },

  saveBtn: {
    marginHorizontal: 20, marginBottom: 24,
    paddingVertical: 14, borderRadius: theme.radius.full,
    backgroundColor: theme.colors.redPrimary,
    alignItems: 'center',
    ...theme.shadow.red,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  menuItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  menuLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuLabel: { fontSize: 15, fontWeight: '500', color: '#fff' },

  switchBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 20, marginTop: 8, marginBottom: 12,
    paddingVertical: 14, borderRadius: theme.radius.full,
    backgroundColor: theme.colors.redSubtle,
    borderWidth: 1, borderColor: theme.colors.redPrimary,
  },
  switchBtnText: { fontSize: 15, fontWeight: '600', color: theme.colors.redPrimary },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 20, marginTop: 0, marginBottom: 40,
    paddingVertical: 14, borderRadius: theme.radius.full,
    borderWidth: 1, borderColor: '#F44336',
  },
  logoutText: { fontSize: 15, fontWeight: '600', color: '#F44336' },
});
