import React from 'react';
import { View, Text, Image } from 'react-native';
import { theme } from '../theme';

/** A company logo, or its first letter when it has none. */
export function CompanyLogo({ name, logo, size }: { name: string; logo: string; size: number }) {
  const ok = !!logo && /^https?:\/\//.test(logo);
  return (
    <View
      style={{
        width: size, height: size, borderRadius: size * 0.22, overflow: 'hidden',
        backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: theme.colors.border,
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      {ok ? (
        // The whole logo, never cropped (logos are often wide)
        <Image source={{ uri: logo }} style={{ width: '86%', height: '86%' }} resizeMode="contain" />
      ) : (
        <Text style={{ fontFamily: theme.fonts.display, fontSize: size * 0.42, color: theme.colors.redLight }}>
          {(name || '?').charAt(0).toUpperCase()}
        </Text>
      )}
    </View>
  );
}
