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
import { useMutation, useAction } from 'convex/react';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GOOGLE_SIGNIN_AVAILABLE, googleIdToken } from '../googleSignIn';
import { api } from '../../convex/_generated/api';
import { theme } from '../theme';
import { ForgotPasswordModal } from '../components/PasswordModals';
import { EyeKeyhole } from '../components/EyeKeyhole';
import { useTranslation } from '../i18n';

interface Props {
  onLogin: (userId: string, sessionToken: string) => void;
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
  const { t, language } = useTranslation();

  const loginMutation = useAction(api.users.login);
  const startRegister = useMutation(api.users.startRegister);
  const confirmRegister = useMutation(api.users.confirmRegister);
  const resendCode = useMutation(api.signupCodes.resend);
  // Step 2 of sign-up: the 6-digit code we emailed (convex/signupCodes.ts)
  const [codeStep, setCodeStep] = useState(false);
  const [forgotVisible, setForgotVisible] = useState(false);
  const [code, setCode] = useState('');
  const loginWithAppleMutation = useAction(api.users.loginWithApple);
  const loginWithGoogleAction = useAction(api.users.loginWithGoogle);

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

      if (!credential.identityToken) {
        throw new Error(t('login.somethingWentWrong'));
      }

      setLoading(true);
      const { userId, sessionToken } = await loginWithAppleMutation({
        identityToken: credential.identityToken,
        fullName: fullName || undefined,
        lang: language,
        client: 'app',
      });
      onLogin(userId, sessionToken);
    } catch (err: any) {
      if (err.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert(t('login.appleSignInFailed'), err.message || t('login.somethingWentWrong'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const idToken = await googleIdToken();
      if (!idToken) return; // closed the picker
      setLoading(true);
      const { userId, sessionToken } = await loginWithGoogleAction({ idToken, lang: language, client: 'app' });
      onLogin(userId, sessionToken);
    } catch (err: any) {
      const code = typeof err?.data === 'string' ? err.data : '';
      Alert.alert(
        t('login.googleSignInFailed'),
        code === 'GOOGLE_EMAIL_UNVERIFIED' ? t('login.googleEmailUnverified') : t('login.somethingWentWrong')
      );
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
        await startRegister({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          lang: language,
        });
        // Code emailed: ask for it. The account is created after that.
        setCode('');
        setCodeStep(true);
      } else {
        const { userId, sessionToken } = await loginMutation({
          email: email.trim().toLowerCase(),
          password,
          client: 'app',
        });
        onLogin(userId, sessionToken);
      }
    } catch (err: any) {
      const loginError = !isRegister && typeof err?.data === 'string' ? LOGIN_ERRORS[err.data] : undefined;
      Alert.alert(t('error'), loginError ? t(loginError) : signupErrorText(err) || friendlyMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Sign-in failures come back as codes; without this the player saw the
  // raw "[Request ID: …] Server Error" text for a wrong password.
  const LOGIN_ERRORS: Record<string, string> = {
    INVALID_CREDENTIALS: 'login.invalidCredentials',
    TOO_MANY_ATTEMPTS: 'login.tooManyLogins',
  };
  // Never show Convex's internal error text to players.
  const friendlyMessage = (err: any): string => {
    const msg = typeof err?.message === 'string' ? err.message : '';
    return !msg || msg.includes('Server Error') || msg.includes('[CONVEX') ? t('login.somethingWentWrong') : msg;
  };

  const SIGNUP_ERRORS: Record<string, string> = {
    CODE_INVALID: 'login.codeInvalid',
    CODE_EXPIRED: 'login.codeExpired',
    TOO_MANY_ATTEMPTS: 'login.codeTooMany',
    EMAIL_EXISTS: 'login.emailExists',
    NAME_RESERVED: 'login.nameReserved',
    NAME_TOO_LONG: 'login.nameTooLong',
  };
  const signupErrorText = (err: any): string =>
    typeof err?.data === 'string' && SIGNUP_ERRORS[err.data] ? t(SIGNUP_ERRORS[err.data]) : '';

  const handleConfirmCode = async () => {
    setLoading(true);
    try {
      const r = await confirmRegister({ email: email.trim().toLowerCase(), code, client: 'app' });
      if ('error' in r) {
        Alert.alert(t('error'), t(SIGNUP_ERRORS[r.error] ?? 'login.somethingWentWrong'));
        return;
      }
      onLogin(r.userId, r.sessionToken);
    } catch (err: any) {
      Alert.alert(t('error'), err.message || t('login.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    try {
      await resendCode({ kind: 'player', email: email.trim().toLowerCase() });
      setCode('');
      Alert.alert(t('login.codeResent'));
    } catch (err: any) {
      Alert.alert(t('error'), signupErrorText(err) || t('login.somethingWentWrong'));
    }
  };

  return (
    <LinearGradient colors={['#1D1010', '#0D0707', '#050202']} style={styles.container}>
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
              <EyeKeyhole size={52} />
            </View>
            <Text style={styles.appTitle}>{t('login.title')}</Text>
            <Text style={styles.appSubtitle}>
              {isRegister ? t('login.createAccount') : t('login.welcomeBack')}
            </Text>
          </View>

          {/* Form */}
          {codeStep ? (
          <View style={styles.form}>
            <Text style={styles.appSubtitle}>{t('login.codeTitle')}</Text>
            <Text style={styles.legalNotice}>{t('login.codeSent', { email: email.trim().toLowerCase() })}</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="keypad-outline" size={20} color={theme.colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { letterSpacing: 8, fontSize: 22 }]}
                placeholder="000000"
                placeholderTextColor={theme.colors.textMuted}
                value={code}
                onChangeText={(v) => setCode(v.replace(/[^0-9]/g, '').slice(0, 6))}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
              />
            </View>
            <TouchableOpacity
              style={[styles.submitBtn, (loading || code.length !== 6) && styles.submitBtnDisabled]}
              onPress={handleConfirmCode}
              disabled={loading || code.length !== 6}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[theme.colors.redPrimary, '#8B0000']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.submitGradient}
              >
                {loading ? (
                  <ActivityIndicator color={theme.colors.bone} />
                ) : (
                  <Text style={styles.submitText}>{t('login.codeConfirm')}</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
            <View style={styles.toggleSection}>
              <TouchableOpacity onPress={() => setCodeStep(false)}>
                <Text style={styles.toggleText}>{t('login.codeBack')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleResendCode}>
                <Text style={styles.toggleLink}>{t('login.codeResend')}</Text>
              </TouchableOpacity>
            </View>
          </View>
          ) : (
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

            {!isRegister && (
              <TouchableOpacity onPress={() => setForgotVisible(true)} style={{ alignSelf: 'flex-end' }}>
                <Text style={styles.toggleLink}>{t('password.forgot')}</Text>
              </TouchableOpacity>
            )}

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

            {/* Legal consent notice (Apple Guideline 5.1.1) */}
            {isRegister && (
              <Text style={styles.legalNotice}>
                {t('login.legalConsent')}
              </Text>
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
                  <ActivityIndicator color={theme.colors.bone} />
                ) : (
                  <>
                    <Text style={styles.submitText}>
                      {isRegister ? t('login.createAccountBtn') : t('login.signIn')}
                    </Text>
                    <Ionicons name="arrow-forward" size={20} color={theme.colors.bone} />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
          )}

          {/* Toggle */}
          <View style={styles.toggleSection}>
            <Text style={styles.toggleText}>
              {isRegister ? t('login.alreadyHaveAccount') : t('login.dontHaveAccount')}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setIsRegister(!isRegister);
                setCodeStep(false);
                setPassword('');
                setConfirmPassword('');
              }}
            >
              <Text style={styles.toggleLink}>
                {isRegister ? t('login.signIn') : t('login.signUp')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Apple / Google Sign In */}
          {(appleAuthAvailable || GOOGLE_SIGNIN_AVAILABLE) && (
            <View style={styles.appleSection}>
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{t('or')}</Text>
                <View style={styles.dividerLine} />
              </View>
              {appleAuthAvailable && (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                  cornerRadius={14}
                  style={styles.appleButton}
                  onPress={handleAppleSignIn}
                />
              )}
              {GOOGLE_SIGNIN_AVAILABLE && (
                <TouchableOpacity
                  style={[styles.googleButton, appleAuthAvailable && { marginTop: 12 }]}
                  onPress={handleGoogleSignIn}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel={t('login.continueWithGoogle')}
                >
                  <Ionicons name="logo-google" size={18} color="#1f1f1f" />
                  <Text style={styles.googleText}>{t('login.continueWithGoogle')}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          <ForgotPasswordModal visible={forgotVisible} kind="player" onClose={() => setForgotVisible(false)} />
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
    fontFamily: theme.fonts.display,
    color: theme.colors.bone,
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
    borderRadius: theme.radius.lg,
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
    color: theme.colors.bone,
    fontSize: 15,
  },
  eyeBtn: {
    padding: 6,
  },
  submitBtn: {
    marginTop: 8,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  legalNotice: {
    fontSize: 11,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 8,
    marginTop: -4,
    paddingHorizontal: 10,
  },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  submitText: {
    color: theme.colors.bone,
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
  googleButton: {
    width: '100%',
    height: 54,
    borderRadius: 14,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleText: {
    color: '#1f1f1f',
    fontSize: 17,
    fontWeight: '600',
  },
});
