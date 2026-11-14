import React from 'react';
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme';
import { Heartbeat } from './motion';

/** Difficulty as skulls, like the website's room cards. */
export function DifficultySkulls({ level, max, size = 13 }: { level: number; max: number; size?: number }) {
  return (
    <View style={styles.skulls}>
      {Array.from({ length: max }).map((_, i) => (
        <Ionicons
          key={i}
          name="skull"
          size={size}
          color={i < level ? theme.colors.redLight : theme.colors.glassBorder}
        />
      ))}
    </View>
  );
}

/** The blood-red call to action. */
export function PrimaryButton({
  label,
  onPress,
  icon,
  disabled,
  loading,
  small,
  pulse,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  /** Beat like a heart to draw the eye. One per screen at most. */
  pulse?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Heartbeat active={!!pulse && !disabled && !loading}>
    <TouchableOpacity
      style={[styles.btn, !small && theme.shadow.red, (disabled || loading) && styles.btnDisabled, style]}
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <LinearGradient colors={theme.buttonGradient} style={[styles.btnGrad, small && styles.btnGradSmall]}>
        {loading ? (
          <ActivityIndicator color={theme.colors.bone} size="small" />
        ) : (
          <>
            <Text style={[styles.btnText, small && styles.btnTextSmall]} numberOfLines={1}>
              {label}
            </Text>
            {icon && <Ionicons name={icon} size={small ? 14 : 18} color={theme.colors.bone} />}
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
    </Heartbeat>
  );
}

/** Small typewriter caption that sits above a section heading. */
export function TypeLabel({ children, color }: { children: React.ReactNode; color?: string }) {
  return <Text style={[styles.typeLabel, color ? { color } : null]}>{children}</Text>;
}

const styles = StyleSheet.create({
  skulls: { flexDirection: 'row', gap: 2 },

  btn: { borderRadius: theme.radius.lg },
  btnDisabled: { opacity: 0.5 },
  btnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    paddingHorizontal: 26,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 42, 54, 0.4)',
  },
  btnGradSmall: { paddingVertical: 9, paddingHorizontal: 14, gap: 5 },
  btnText: { fontSize: 16, fontWeight: '700', color: theme.colors.bone, letterSpacing: 0.4 },
  btnTextSmall: { fontSize: 12 },

  typeLabel: {
    fontFamily: theme.fonts.type,
    fontSize: 11,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
    color: theme.colors.redLight,
  },
});
