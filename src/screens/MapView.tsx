import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { rooms as staticRooms } from '../data';
import { theme } from '../theme';
import { RootStackParamList } from '../types';

const { width: screenW, height: screenH } = Dimensions.get('window');
type Nav = NativeStackNavigationProp<RootStackParamList>;

const pinPositions = [
  { top: 0.25, left: 0.30, roomIdx: 0 },
  { top: 0.35, left: 0.65, roomIdx: 1 },
  { top: 0.50, left: 0.45, roomIdx: 2 },
  { top: 0.40, left: 0.20, roomIdx: 3 },
  { top: 0.60, left: 0.70, roomIdx: 4 },
  { top: 0.55, left: 0.35, roomIdx: 5 },
];

export default function MapView() {
  const navigation = useNavigation<Nav>();
  const convexRooms = useQuery(api.rooms.list);
  const rooms = (convexRooms && convexRooms.length > 0
    ? convexRooms.map((r: any) => ({ ...r, id: r._id }))
    : staticRooms
  );
  const [selectedIdx, setSelectedIdx] = useState(0);
  const selectedRoom = rooms[selectedIdx] || rooms[0];

  return (
    <View style={styles.container}>
      {/* Map Background */}
      <View style={styles.mapBg}>
        <View style={styles.mapGrid} />
        {/* Streets simulation */}
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={`h${i}`} style={[styles.streetH, { top: (15 + i * 12) / 100 * screenH }]} />
        ))}
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={`v${i}`} style={[styles.streetV, { left: (10 + i * 18) / 100 * screenW }]} />
        ))}
      </View>

      {/* Pins */}
      {pinPositions.map((pin, i) => (
        <TouchableOpacity
          key={i}
          style={[styles.pin, { top: pin.top * screenH, left: pin.left * screenW }]}
          onPress={() => setSelectedIdx(pin.roomIdx)}
          activeOpacity={0.8}
        >
          <View style={[styles.pinPrice, selectedIdx === pin.roomIdx && styles.pinPriceActive]}>
            <Text style={[styles.pinPriceText, selectedIdx === pin.roomIdx && styles.pinPriceTextActive]}>
              ${rooms[pin.roomIdx]?.price ?? 0}
            </Text>
          </View>
          <View style={[styles.pinDot, selectedIdx === pin.roomIdx && styles.pinDotActive]} />
        </TouchableOpacity>
      ))}

      {/* Back Button */}
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
        <Ionicons name="arrow-back" size={20} color="#fff" />
      </TouchableOpacity>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.ctrlBtn} activeOpacity={0.7} onPress={() => Alert.alert('Zoom In', 'Map zoom will be available with Apple Maps integration.')}>
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.ctrlBtn} activeOpacity={0.7} onPress={() => Alert.alert('Zoom Out', 'Map zoom will be available with Apple Maps integration.')}>
          <Ionicons name="remove" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.ctrlBtn, styles.locBtn]} activeOpacity={0.7} onPress={() => Alert.alert('My Location', 'Location services will be enabled with Apple Maps integration.')}>
          <Ionicons name="locate" size={20} color={theme.colors.redPrimary} />
        </TouchableOpacity>
      </View>

      {/* Bottom Card */}
      <View style={styles.bottomCard}>
        <Image source={{ uri: selectedRoom.image }} style={styles.cardImg} />
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={1}>{selectedRoom.title}</Text>
          <View style={styles.cardMeta}>
            <View style={styles.cardRating}>
              <Ionicons name="star" size={14} color={theme.colors.gold} />
              <Text style={styles.cardRatingText}>{selectedRoom.rating}</Text>
            </View>
            <Text style={styles.cardPrice}>{selectedRoom.pricePerGroup?.length ? `From $${Math.min(...selectedRoom.pricePerGroup.map((g: any) => g.price))}` : `$${selectedRoom.price}/person`}</Text>
          </View>
          <TouchableOpacity
            style={styles.bookBtn}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('RoomDetails', { id: selectedRoom.id })}
          >
            <Text style={styles.bookBtnText}>Book Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1210' },
  mapBg: {
    ...StyleSheet.absoluteFillObject,
  },
  mapGrid: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.03,
  },
  streetH: {
    position: 'absolute', left: 0, right: 0, height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  streetV: {
    position: 'absolute', top: 0, bottom: 0, width: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },

  pin: {
    position: 'absolute', alignItems: 'center', zIndex: 2,
  },
  pinPrice: {
    paddingVertical: 4, paddingHorizontal: 10,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.redPrimary,
    marginBottom: 4,
    ...theme.shadow.red,
  },
  pinPriceActive: {
    backgroundColor: '#fff',
  },
  pinPriceText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  pinPriceTextActive: { color: theme.colors.redPrimary },
  pinDot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: theme.colors.redPrimary,
    shadowColor: '#FF1E1E', shadowOpacity: 0.6, shadowRadius: 6, elevation: 4,
  },
  pinDotActive: {
    width: 16, height: 16, borderRadius: 8,
  },

  backBtn: {
    position: 'absolute', top: 56, left: 20, zIndex: 5,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  controls: {
    position: 'absolute', top: 56, right: 20, zIndex: 5, gap: 8,
  },
  ctrlBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  locBtn: {},

  bottomCard: {
    position: 'absolute', bottom: 40, left: 20, right: 20, zIndex: 5,
    flexDirection: 'row', gap: 14, padding: 14,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    ...theme.shadow.card,
  },
  cardImg: { width: 90, height: 90, borderRadius: theme.radius.md },
  cardInfo: { flex: 1, justifyContent: 'center', gap: 6 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardRating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardRatingText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  cardPrice: { fontSize: 13, color: theme.colors.textSecondary },
  bookBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: theme.radius.full,
    backgroundColor: theme.colors.redPrimary, ...theme.shadow.red,
  },
  bookBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
