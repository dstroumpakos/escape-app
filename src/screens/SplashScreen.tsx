import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';
import { useTranslation } from '../i18n';
import { Flicker, Heartbeat, Typewriter } from '../components/motion';

interface Props {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: Props) {
  const [progress, setProgress] = useState(0);
  const glowAnim = useRef(new Animated.Value(0.3)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const { t } = useTranslation();

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 0.8, duration: 1200, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.3, duration: 1200, useNativeDriver: true }),
      ])
    ).start();

    const timer = setInterval(() => {
      setProgress(p => {
        if (p >= 100) {
          clearInterval(timer);
          setTimeout(onComplete, 300);
          return 100;
        }
        return p + 2;
      });
    }, 40);
    return () => clearInterval(timer);
  }, []);

  return (
    <LinearGradient colors={['#1D1010', '#0D0707', '#050202']} style={styles.container}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <Animated.View style={[styles.iconWrap, { opacity: glowAnim }]}>
          <Heartbeat rest={900}>
            <View style={styles.iconCircle}>
              <Ionicons name="lock-closed-outline" size={48} color={theme.colors.redLight} />
            </View>
          </Heartbeat>
        </Animated.View>

        <Flicker period={2600} delay={300}>
          <Text style={styles.title}>{t('splash.title')}</Text>
        </Flicker>
        <Typewriter text={t('splash.subtitle')} delay={500} speed={50} style={styles.subtitle} />
      </Animated.View>

      <View style={styles.loaderWrap}>
        <View style={styles.loaderTrack}>
          <View style={[styles.loaderBar, { width: `${progress}%` }]} />
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    marginBottom: 16,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(200, 16, 27, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(200, 16, 27, 0.5)',
  },
  title: {
    fontFamily: theme.fonts.displayBlack,
    fontSize: 36,
    color: theme.colors.redLight,
    letterSpacing: 8,
    textShadowColor: 'rgba(255, 30, 40, 0.55)',
    textShadowRadius: 16,
    textShadowOffset: { width: 0, height: 0 },
  },
  subtitle: {
    fontFamily: theme.fonts.type,
    fontSize: 12,
    color: theme.colors.textSecondary,
    letterSpacing: 3,
  },
  loaderWrap: {
    position: 'absolute',
    bottom: 60,
    width: 160,
  },
  loaderTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  loaderBar: {
    height: '100%',
    backgroundColor: theme.colors.redPrimary,
    borderRadius: 2,
  },
});
