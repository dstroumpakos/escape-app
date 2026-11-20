import React, { useEffect, useRef } from 'react';
import { Animated, Text, TouchableOpacity, StyleSheet, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/** Ink colour and icon of a room's stamp, by theme (same as escape-web). */
const THEMES: Record<string, { color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  Horror: { color: '#E24B4A', icon: 'skull-outline' },
  Thriller: { color: '#D4537E', icon: 'skull-outline' },
  Mystery: { color: '#7F77DD', icon: 'search' },
  Detective: { color: '#7F77DD', icon: 'search' },
  Puzzle: { color: '#1D9E75', icon: 'extension-puzzle-outline' },
  Adventure: { color: '#EF9F27', icon: 'compass-outline' },
  Historical: { color: '#BA7517', icon: 'library-outline' },
  'Sci-Fi': { color: '#378ADD', icon: 'rocket-outline' },
  Science: { color: '#378ADD', icon: 'flask-outline' },
  Paranormal: { color: '#D4537E', icon: 'sparkles-outline' },
  Medieval: { color: '#BA7517', icon: 'shield-outline' },
  Fantasy: { color: '#EF9F27', icon: 'diamond-outline' },
  Comedy: { color: '#639922', icon: 'happy-outline' },
};
export function stampStyle(theme: string) {
  return THEMES[theme] ?? { color: '#E24B4A', icon: 'key-outline' as const };
}

/** Small stable tilt from an id, so each stamp sits a little crooked like real ink. */
export function tiltFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(h) % 17) - 8;
}

export function StampSeal({
  title, theme, date, escaped, tilt = 0, size = 100, slam = false, onPress,
}: {
  title: string; theme: string; date: string; escaped: boolean; tilt?: number; size?: number; slam?: boolean; onPress?: () => void;
}) {
  const { color, icon } = stampStyle(theme);
  const anim = useRef(new Animated.Value(slam ? 0 : 1)).current;
  useEffect(() => {
    if (!slam) return;
    Animated.timing(anim, { toValue: 1, duration: 550, easing: Easing.out(Easing.back(2)), useNativeDriver: true }).start();
  }, [slam, anim]);
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [2.4, 1] });
  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: [`${tilt - 20}deg`, `${tilt}deg`] });

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} disabled={!onPress}>
      <Animated.View
        style={[
          styles.seal,
          { width: size, height: size, borderRadius: size / 2, borderColor: color, opacity: anim, transform: [{ scale }, { rotate }] },
        ]}
      >
        <Ionicons name={icon} size={18} color={color} />
        <Text style={[styles.title, { color }]} numberOfLines={2}>{title.toUpperCase()}</Text>
        <Text style={[styles.date, { color }]}>{date}</Text>
        <Text style={[styles.result, { color }]}>{escaped ? 'ESCAPED' : 'TRAPPED'}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  seal: { borderWidth: 3, alignItems: 'center', justifyContent: 'center', padding: 8 },
  title: { fontSize: 10, fontWeight: '800', textAlign: 'center', letterSpacing: 0.5, marginTop: 2 },
  date: { fontSize: 9, opacity: 0.85, marginTop: 1 },
  result: { fontSize: 8, fontWeight: '900', letterSpacing: 1.5 },
});
