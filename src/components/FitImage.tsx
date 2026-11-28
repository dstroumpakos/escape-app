import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

/**
 * The whole photo, never cropped: room posters come in every shape (tall
 * posters, wide banners), so the photo sits inside the box and a blurred,
 * darkened copy of it fills the space around. It fills its parent, so give
 * the parent a size and overflow: 'hidden'. Same idea as the website's
 * src/components/ui/FitImage.tsx.
 */
export function FitImage({ uri, onError }: { uri: string; onError?: () => void }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <Image source={{ uri }} style={[StyleSheet.absoluteFill, { transform: [{ scale: 1.2 }] }]} blurRadius={18} resizeMode="cover" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
      <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" onError={onError} />
    </View>
  );
}
