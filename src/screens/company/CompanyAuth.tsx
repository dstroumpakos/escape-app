import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { theme } from '../../theme';

interface Props {
  onLogin: (companyId: string) => void;
  onBack: () => void;
}

// PHASE 1 FIX: CompanyAuth login was broken — it passed the raw email
// string as companyId instead of verifying credentials against the DB.
// Now uses the loginCompany mutation for proper credential verification.
export default function CompanyAuth({ onLogin, onBack }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const loginMutation = useMutation(api.companies.loginCompany);
  const registerMutation = useMutation(api.companies.register);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter email and password.');
      return;
    }
    setLoading(true);
    try {
      const result = await loginMutation({
        email: email.trim().toLowerCase(),
        password: password.trim(),
      });
      if (result?._id) {
        onLogin(result._id);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Login failed. Please try again.');
    }
    setLoading(false);
  };

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password.trim() || !phone.trim() || !city.trim()) {
      Alert.alert('Error', 'Please fill in all required fields.');
      return;
    }
    setLoading(true);
    try {
      const result = await registerMutation({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        address: address.trim(),
        city: city.trim(),
        description: description.trim(),
        password: password.trim(),
      });
      if (result && 'error' in result) {
        Alert.alert('Error', result.error);
      } else if (result && 'id' in result) {
        Alert.alert('Success', 'Account created! You can now manage your rooms.', [
          { text: 'OK', onPress: () => onLogin(result.id) },
        ]);
      }
    } catch {
      Alert.alert('Error', 'Registration failed. Please try again.');
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Back */}
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Ionicons name="business" size={36} color={theme.colors.redPrimary} />
          </View>
          <Text style={styles.title}>Business Portal</Text>
          <Text style={styles.subtitle}>Manage your escape rooms</Text>
        </View>

        {/* Toggle */}
        <View style={styles.toggle}>
          <TouchableOpacity
            style={[styles.toggleBtn, mode === 'login' && styles.toggleBtnActive]}
            onPress={() => setMode('login')}
          >
            <Text style={[styles.toggleText, mode === 'login' && styles.toggleTextActive]}>Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, mode === 'register' && styles.toggleBtnActive]}
            onPress={() => setMode('register')}
          >
            <Text style={[styles.toggleText, mode === 'register' && styles.toggleTextActive]}>Register</Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        {mode === 'register' && (
          <>
            <Text style={styles.label}>Company Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Your escape room business name"
              placeholderTextColor={theme.colors.textMuted}
            />

            <Text style={styles.label}>Phone *</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="+1 (555) 000-0000"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="phone-pad"
            />

            <Text style={styles.label}>City *</Text>
            <TextInput
              style={styles.input}
              value={city}
              onChangeText={setCity}
              placeholder="San Francisco, CA"
              placeholderTextColor={theme.colors.textMuted}
            />

            <Text style={styles.label}>Address</Text>
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              placeholder="123 Main St"
              placeholderTextColor={theme.colors.textMuted}
            />

            <Text style={styles.label}>About Your Business</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Tell players about your escape room business..."
              placeholderTextColor={theme.colors.textMuted}
              multiline
              numberOfLines={3}
            />
          </>
        )}

        <Text style={styles.label}>Email *</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="business@example.com"
          placeholderTextColor={theme.colors.textMuted}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Password *</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Enter your password"
          placeholderTextColor={theme.colors.textMuted}
          secureTextEntry
        />

        <TouchableOpacity
          style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
          disabled={loading}
          activeOpacity={0.8}
          onPress={mode === 'login' ? handleLogin : handleRegister}
        >
          <Text style={styles.submitText}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  scroll: { paddingHorizontal: 20, paddingBottom: 60 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, marginTop: 56,
    backgroundColor: theme.colors.glass, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  header: { alignItems: 'center', marginTop: 24, marginBottom: 32 },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 2, borderColor: theme.colors.redPrimary,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', marginBottom: 6 },
  subtitle: { fontSize: 14, color: theme.colors.textSecondary },
  toggle: {
    flexDirection: 'row', borderRadius: theme.radius.md, overflow: 'hidden',
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    marginBottom: 28,
  },
  toggleBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: theme.colors.redPrimary },
  toggleText: { fontSize: 14, fontWeight: '600', color: theme.colors.textMuted },
  toggleTextActive: { color: '#fff' },
  label: {
    fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary,
    marginBottom: 6, marginTop: 14,
  },
  input: {
    paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    color: '#fff', fontSize: 15,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  submitBtn: {
    marginTop: 28, paddingVertical: 16, borderRadius: theme.radius.full,
    backgroundColor: theme.colors.redPrimary, alignItems: 'center',
    ...theme.shadow.red,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
