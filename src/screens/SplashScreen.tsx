import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';

interface Props {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: Props) {
  const [progress, setProgress] = useState(0);
  const glowAnim = useRef(new Animated.Value(0.3)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

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
    <LinearGradient colors={['#2a0f0f', '#1A0D0D', '#0d0505']} style={styles.container}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <Animated.View style={[styles.iconWrap, { opacity: glowAnim }]}>
          <View style={styles.iconCircle}>
            <Ionicons name="lock-closed-outline" size={48} color={theme.colors.redPrimary} />
          </View>
        </Animated.View>

        <Text style={styles.title}>UNLOCKED</Text>
        <Text style={styles.subtitle}>ESCAPE ROOM DISCOVERY</Text>
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
    backgroundColor: 'rgba(255, 30, 30, 0.1)',
    borderWidth: 2,
    borderColor: 'rgba(255, 30, 30, 0.3)',
  },
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: theme.colors.textPrimary,
    letterSpacing: 8,
  },
  subtitle: {
    fontSize: 13,
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
