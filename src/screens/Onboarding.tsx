import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { theme } from '../theme';
import type { Id } from '../../convex/_generated/dataModel';
import { useTranslation } from '../i18n';

const { width } = Dimensions.get('window');

interface Props {
  onComplete: () => void;
  userId: string | null;
}

export default function Onboarding({ onComplete, userId }: Props) {
  const [step, setStep] = useState(0);
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied'>('idle');
  const [cityName, setCityName] = useState('');
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const { t } = useTranslation();

  const updateLocation = useMutation(api.users.updateLocation);

  const TOTAL_STEPS = 4;

  const animateStep = (nextStep: number) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      if (nextStep >= TOTAL_STEPS) { onComplete(); return; }
      setStep(nextStep);
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    });
  };

  const handleLocationRequest = async () => {
    setLocationStatus('requesting');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const { latitude, longitude } = loc.coords;

        // Reverse geocode to get city name
        let city = '';
        try {
          const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
          if (place) {
            city = [place.city, place.region].filter(Boolean).join(', ');
          }
        } catch {}

        setCityName(city || t('onboarding.locationFound'));
        setLocationStatus('granted');

        // Save to user record
        if (userId) {
          try {
            await updateLocation({
              userId: userId as Id<'users'>,
              latitude,
              longitude,
              city: city || undefined,
            });
          } catch {}
        }
      } else {
        setLocationStatus('denied');
      }
    } catch {
      setLocationStatus('denied');
    }
  };

  const toggleTheme = (themeName: string) => {
    setSelectedThemes(prev => prev.includes(themeName) ? prev.filter(x => x !== themeName) : [...prev, themeName]);
  };

  const themeOptions = [
    { name: t('theme.horror'), icon: '👻' },
    { name: t('theme.mystery'), icon: '🔍' },
    { name: t('theme.sciFi'), icon: '🚀' },
    { name: t('theme.historical'), icon: '🏛️' },
  ];

  return (
    <LinearGradient colors={['#2a0f0f', '#1A0D0D']} style={styles.container}>
      {/* Dots */}
      <View style={styles.dots}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
        ))}
      </View>

      <Animated.View style={[styles.slideWrap, { opacity: fadeAnim }]}>
        {step === 0 && (
          <View style={styles.slide}>
            <View style={styles.heroIcons}>
              <Ionicons name="skull-outline" size={32} color={theme.colors.redPrimary} />
              <Ionicons name="search-outline" size={32} color={theme.colors.redPrimary} />
              <Ionicons name="flask-outline" size={32} color={theme.colors.redPrimary} />
              <Ionicons name="business-outline" size={32} color={theme.colors.redPrimary} />
            </View>
            <Text style={styles.title}>{t('onboarding.discoverTitle')}</Text>
            <Text style={styles.desc}>{t('onboarding.discoverDesc')}</Text>
          </View>
        )}

        {step === 1 && (
          <View style={styles.slide}>
            <View style={styles.locationIconWrap}>
              <View style={styles.locationIconCircle}>
                <Ionicons name="location" size={48} color={theme.colors.redPrimary} />
              </View>
              <View style={styles.locationPulse} />
            </View>
            <Text style={styles.title}>{t('onboarding.locationTitle')}</Text>
            <Text style={styles.desc}>
              {t('onboarding.locationDesc')}
            </Text>

            {locationStatus === 'idle' ? (
              <TouchableOpacity
                style={styles.locationBtn}
                onPress={handleLocationRequest}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={[theme.colors.redPrimary, '#8B0000']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.locationBtnGrad}
                >
                  <Ionicons name="navigate" size={18} color="#fff" />
                  <Text style={styles.locationBtnText}>{t('onboarding.enableLocation')}</Text>
                </LinearGradient>
              </TouchableOpacity>
            ) : locationStatus === 'requesting' ? (
              <View style={styles.locationState}>
                <ActivityIndicator size="large" color={theme.colors.redPrimary} />
                <Text style={styles.locationStateText}>{t('onboarding.findingLocation')}</Text>
              </View>
            ) : locationStatus === 'granted' ? (
              <View style={styles.locationState}>
                <View style={styles.locationSuccessCircle}>
                  <Ionicons name="checkmark" size={28} color="#fff" />
                </View>
                <Text style={styles.locationSuccessText}>{cityName}</Text>
                <Text style={styles.locationStateText}>{t('onboarding.locationHint')}</Text>
              </View>
            ) : (
              <View style={styles.locationState}>
                <Ionicons name="location-outline" size={32} color={theme.colors.textMuted} />
                <Text style={styles.locationStateText}>
                  {t('onboarding.locationDenied')}
                </Text>
                <Text style={styles.locationHint}>
                  {t('onboarding.locationDeniedHint')}
                </Text>
              </View>
            )}
          </View>
        )}

        {step === 2 && (
          <View style={styles.slide}>
            <Text style={styles.title}>{t('onboarding.filterTitle')}</Text>
            <Text style={styles.desc}>{t('onboarding.filterDesc')}</Text>
            <View style={styles.themeGrid}>
              {themeOptions.map(opt => (
                <TouchableOpacity
                  key={opt.name}
                  style={[styles.themeCard, selectedThemes.includes(opt.name) && styles.themeCardActive]}
                  onPress={() => toggleTheme(opt.name)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.themeEmoji}>{opt.icon}</Text>
                  <Text style={styles.themeName}>{opt.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

          </View>
        )}

        {step === 3 && (
          <View style={styles.slide}>
            <Text style={styles.title}>{t('onboarding.bookTitle')}</Text>
            <Text style={styles.desc}>{t('onboarding.bookDesc')}</Text>
            <View style={styles.mockCard}>
              <View style={styles.mockHeader}>
                <Ionicons name="flash" size={16} color={theme.colors.redPrimary} />
                <Text style={styles.mockHeaderText}>{t('onboarding.mockHeader')}</Text>
              </View>
              <View style={styles.mockBody}>
                <View style={styles.mockImg} />
                <View style={styles.mockInfo}>
                  <Text style={styles.mockTitle}>{t('onboarding.mockTitle')}</Text>
                  <Text style={styles.mockDate}>{t('onboarding.mockDate')}</Text>
                  <Text style={styles.mockStatus}>{t('onboarding.mockStatus')}</Text>
                </View>
              </View>
            </View>
          </View>
        )}
      </Animated.View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.ctaBtn} onPress={() => animateStep(step + 1)} activeOpacity={0.8}>
          <Text style={styles.ctaText}>
            {step === TOTAL_STEPS - 1 ? t('onboarding.getStarted') : step === 1 ? (locationStatus === 'idle' ? t('onboarding.skipForNow') : t('onboarding.continue')) : t('onboarding.next')}
          </Text>
          <Ionicons name="chevron-forward" size={18} color="#fff" />
        </TouchableOpacity>
        {step < TOTAL_STEPS - 1 && (
          <TouchableOpacity onPress={onComplete}>
            <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 70,
  },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dotActive: {
    width: 24, backgroundColor: theme.colors.redPrimary,
  },
  slideWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  slide: {},
  heroIcons: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 40,
    opacity: 0.8,
  },
  title: {
    fontSize: 32, fontWeight: '800', color: '#fff',
    lineHeight: 40, marginBottom: 12,
  },
  desc: {
    fontSize: 15, color: theme.colors.textSecondary,
    lineHeight: 22, marginBottom: 24,
  },
  themeGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24,
  },
  themeCard: {
    width: (width - 60) / 2,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 20,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.glass,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
  },
  themeCardActive: {
    backgroundColor: theme.colors.redSubtle,
    borderColor: theme.colors.redPrimary,
  },
  themeEmoji: { fontSize: 28 },
  themeName: { fontSize: 14, fontWeight: '600', color: '#fff' },

  mockCard: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    overflow: 'hidden',
  },
  mockHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, paddingHorizontal: 16,
    backgroundColor: 'rgba(255,30,30,0.08)',
  },
  mockHeaderText: {
    fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary,
  },
  mockBody: {
    flexDirection: 'row', gap: 14, padding: 16,
  },
  mockImg: {
    width: 64, height: 64, borderRadius: theme.radius.md,
    backgroundColor: '#3a1a1a',
  },
  mockInfo: { justifyContent: 'center', gap: 2 },
  mockTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  mockDate: { fontSize: 13, color: theme.colors.textSecondary },
  mockStatus: { fontSize: 13, fontWeight: '600', color: theme.colors.success, marginTop: 2 },
  footer: {
    paddingHorizontal: 24, paddingBottom: 50,
    alignItems: 'center', gap: 16,
  },
  ctaBtn: {
    width: '100%', paddingVertical: 16,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.redPrimary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    ...theme.shadow.red,
  },
  ctaText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  skipText: { fontSize: 14, color: theme.colors.textMuted },

  // Location step
  locationIconWrap: {
    alignItems: 'center',
    marginBottom: 32,
  },
  locationIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 30, 30, 0.1)',
    borderWidth: 2,
    borderColor: 'rgba(255, 30, 30, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  locationPulse: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 30, 30, 0.05)',
    top: -20,
  },
  locationBtn: {
    marginTop: 24,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  locationBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  locationBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  locationState: {
    alignItems: 'center',
    marginTop: 24,
    gap: 12,
  },
  locationStateText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  locationSuccessCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationSuccessText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  locationHint: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
});
