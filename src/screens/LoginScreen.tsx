import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from 'convex/react';
import * as AppleAuthentication from 'expo-apple-authentication';
import { api } from '../../convex/_generated/api';
import { theme } from '../theme';
import { useTranslation } from '../i18n';

interface Props {
  onLogin: (userId: string) => void;
}

export default function LoginScreen({ onLogin }: Props) {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [appleAuthAvailable, setAppleAuthAvailable] = useState(false);
  const { t } = useTranslation();

  const loginMutation = useMutation(api.users.login);
  const registerMutation = useMutation(api.users.register);
  const loginWithAppleMutation = useMutation(api.users.loginWithApple);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAuthAvailable);
  }, []);

  const handleAppleSignIn = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      const fullName = credential.fullName
        ? [credential.fullName.givenName, credential.fullName.familyName]
            .filter(Boolean)
            .join(' ')
        : undefined;

      setLoading(true);
      const userId = await loginWithAppleMutation({
        appleId: credential.user,
        email: credential.email || undefined,
        fullName: fullName || undefined,
      });
      onLogin(userId);
    } catch (err: any) {
      if (err.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert(t('login.appleSignInFailed'), err.message || t('login.somethingWentWrong'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert(t('error'), t('login.fillAllFields'));
      return;
    }

    if (isRegister) {
      if (!name.trim()) {
        Alert.alert(t('error'), t('login.enterName'));
        return;
      }
      if (password.length < 6) {
        Alert.alert(t('error'), t('login.passwordMinLength'));
        return;
      }
      if (password !== confirmPassword) {
        Alert.alert(t('error'), t('login.passwordsNoMatch'));
        return;
      }
    }

    setLoading(true);
    try {
      if (isRegister) {
        const userId = await registerMutation({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
        });
        onLogin(userId);
      } else {
        const userId = await loginMutation({
          email: email.trim().toLowerCase(),
          password,
        });
        onLogin(userId);
      }
    } catch (err: any) {
      Alert.alert(t('error'), err.message || t('login.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#2a0f0f', '#1A0D0D', '#0d0505']} style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo */}
          <View style={styles.logoSection}>
            <View style={styles.iconCircle}>
              <Ionicons name="lock-closed-outline" size={40} color={theme.colors.redPrimary} />
            </View>
            <Text style={styles.appTitle}>{t('login.title')}</Text>
            <Text style={styles.appSubtitle}>
              {isRegister ? t('login.createAccount') : t('login.welcomeBack')}
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {isRegister && (
              <View style={styles.inputWrap}>
                <Ionicons name="person-outline" size={20} color={theme.colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder={t('login.fullName')}
                  placeholderTextColor={theme.colors.textMuted}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </View>
            )}

            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={20} color={theme.colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('login.email')}
                placeholderTextColor={theme.colors.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={20} color={theme.colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder={t('login.password')}
                placeholderTextColor={theme.colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={theme.colors.textMuted}
                />
              </TouchableOpacity>
            </View>

            {isRegister && (
              <View style={styles.inputWrap}>
                <Ionicons name="shield-checkmark-outline" size={20} color={theme.colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder={t('login.confirmPassword')}
                  placeholderTextColor={theme.colors.textMuted}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
              </View>
            )}

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[theme.colors.redPrimary, '#8B0000']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.submitGradient}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={styles.submitText}>
                      {isRegister ? t('login.createAccountBtn') : t('login.signIn')}
                    </Text>
                    <Ionicons name="arrow-forward" size={20} color="#fff" />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Toggle */}
          <View style={styles.toggleSection}>
            <Text style={styles.toggleText}>
              {isRegister ? t('login.alreadyHaveAccount') : t('login.dontHaveAccount')}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setIsRegister(!isRegister);
                setPassword('');
                setConfirmPassword('');
              }}
            >
              <Text style={styles.toggleLink}>
                {isRegister ? t('login.signIn') : t('login.signUp')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Apple Sign In */}
          {appleAuthAvailable && (
            <View style={styles.appleSection}>
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{t('or')}</Text>
                <View style={styles.dividerLine} />
              </View>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={14}
                style={styles.appleButton}
                onPress={handleAppleSignIn}
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 60,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(200, 30, 30, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(200, 30, 30, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  appTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 4,
  },
  appSubtitle: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginTop: 8,
  },
  form: {
    gap: 14,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    height: 54,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
  },
  eyeBtn: {
    padding: 6,
  },
  submitBtn: {
    marginTop: 8,
    borderRadius: 14,
    overflow: 'hidden',
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  toggleSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 28,
    gap: 6,
  },
  toggleText: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
  toggleLink: {
    color: theme.colors.redPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  appleSection: {
    marginTop: 24,
    alignItems: 'center',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    width: '100%',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border,
  },
  dividerText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginHorizontal: 14,
  },
  appleButton: {
    width: '100%',
    height: 54,
  },
});
