import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useMutation, useQuery } from 'convex/react';
import MapView, { Marker, MapPressEvent } from 'react-native-maps';
import * as ExpoLocation from 'expo-location';
import { api } from '../../../convex/_generated/api';
import { theme } from '../../theme';
import { RootStackParamList } from '../../types';
import type { Id } from '../../../convex/_generated/dataModel';
import { useTranslation } from '../../i18n';

type RouteType = RouteProp<RootStackParamList, 'CompanyRoomEditor'>;

const THEMES = ['Horror', 'Sci-Fi', 'Mystery', 'Historical', 'Fantasy', 'Adventure'];
const TAG_OPTIONS = [
  'Horror Theme', 'Sci-Fi Theme', 'Mystery Theme', 'Historical Theme',
  'Live Actor', 'Physical Puzzles', 'Multi-room', 'High-Tech Puzzles',
  'Neon Atmosphere', 'Team Challenge', 'Atmospheric', 'Beginner Friendly',
  'Enchanted', 'Story-Driven', 'Zero-G Simulation', 'Immersive Sound',
  'Dark Theme', 'Family Friendly', 'VR Enhanced', 'Time Pressure',
];

const THEME_KEYS: Record<string, string> = {
  Horror: 'theme.horror',
  'Sci-Fi': 'theme.sciFi',
  Mystery: 'theme.mystery',
  Historical: 'theme.historical',
  Fantasy: 'theme.fantasy',
  Adventure: 'theme.adventure',
};

const TAG_KEYS: Record<string, string> = {
  'Horror Theme': 'tag.horrorTheme',
  'Sci-Fi Theme': 'tag.sciFiTheme',
  'Mystery Theme': 'tag.mysteryTheme',
  'Historical Theme': 'tag.historicalTheme',
  'Live Actor': 'tag.liveActor',
  'Physical Puzzles': 'tag.physicalPuzzles',
  'Multi-room': 'tag.multiRoom',
  'High-Tech Puzzles': 'tag.highTechPuzzles',
  'Neon Atmosphere': 'tag.neonAtmosphere',
  'Team Challenge': 'tag.teamChallenge',
  Atmospheric: 'tag.atmospheric',
  'Beginner Friendly': 'tag.beginnerFriendly',
  Enchanted: 'tag.enchanted',
  'Story-Driven': 'tag.storyDriven',
  'Zero-G Simulation': 'tag.zeroGSimulation',
  'Immersive Sound': 'tag.immersiveSound',
  'Dark Theme': 'tag.darkTheme',
  'Family Friendly': 'tag.familyFriendly',
  'VR Enhanced': 'tag.vrEnhanced',
  'Time Pressure': 'tag.timePressure',
};

interface Props {
  companyId: string;
}

export default function CompanyRoomEditor({ companyId }: Props) {
  const navigation = useNavigation();
  const route = useRoute<RouteType>();
  const roomId = route.params?.roomId;
  const isEditing = !!roomId;

  const existingRoom = useQuery(
    api.rooms.getById,
    roomId ? { id: roomId as Id<"rooms"> } : "skip"
  );

  const createRoom = useMutation(api.companies.createRoom);
  const updateRoom = useMutation(api.companies.updateRoom);
  const { t } = useTranslation();

  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [image, setImage] = useState('');
  const [duration, setDuration] = useState('60');
  const [difficulty, setDifficulty] = useState(3);
  const [playersMin, setPlayersMin] = useState('2');
  const [playersMax, setPlayersMax] = useState('6');
  const [price, setPrice] = useState('');
  const [pricePerGroup, setPricePerGroup] = useState<Record<number, string>>({});
  const [selectedTheme, setSelectedTheme] = useState('Horror');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [story, setStory] = useState('');
  const [paymentTerms, setPaymentTerms] = useState<Array<'full' | 'deposit_20' | 'pay_on_arrival'>>(['full']);
  const [termsOfUse, setTermsOfUse] = useState('');
  const [isSubOnly, setIsSubOnly] = useState(false);
  const [bookingMode, setBookingMode] = useState<'unlocked_primary' | 'external_primary'>('unlocked_primary');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [operatingDays, setOperatingDays] = useState<number[]>([1, 2, 3, 4, 5, 6]); // Mon-Sat
  const [defaultTimeSlots, setDefaultTimeSlots] = useState<{ time: string; price: string }[]>([
    { time: '10:00 AM', price: '35' },
    { time: '11:30 AM', price: '35' },
    { time: '1:00 PM', price: '35' },
    { time: '2:30 PM', price: '35' },
    { time: '4:00 PM', price: '38' },
    { time: '5:30 PM', price: '38' },
    { time: '7:00 PM', price: '42' },
    { time: '8:30 PM', price: '42' },
  ]);
  const [newSlotTime, setNewSlotTime] = useState('');
  const [overflowEnabled, setOverflowEnabled] = useState(false);
  const [overflowTime, setOverflowTime] = useState('10:00 PM');
  const [overflowPrice, setOverflowPrice] = useState('45');
  const [overflowPricePerGroup, setOverflowPricePerGroup] = useState<Record<number, string>>({});
  const [overflowDays, setOverflowDays] = useState<number[]>([1, 2, 3, 4, 5, 6]); // Mon-Sat default
  const [loading, setLoading] = useState(false);
  const mapRef = useRef<MapView>(null);

  // Get user's current location as default map center
  useEffect(() => {
    if (!latitude && !longitude && !isEditing) {
      ExpoLocation.requestForegroundPermissionsAsync().then(({ status }) => {
        if (status === 'granted') {
          ExpoLocation.getCurrentPositionAsync({}).then((loc) => {
            setLatitude(loc.coords.latitude);
            setLongitude(loc.coords.longitude);
          });
        }
      });
    }
  }, []);

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const results = await ExpoLocation.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (results.length > 0) {
        const r = results[0];
        const parts = [r.name, r.street, r.city, r.region].filter(Boolean);
        const addr = parts.join(', ');
        if (addr) setLocation(addr);
      }
    } catch {}
  };

  const handleMapPress = (e: MapPressEvent) => {
    const { latitude: lat, longitude: lng } = e.nativeEvent.coordinate;
    setLatitude(lat);
    setLongitude(lng);
    reverseGeocode(lat, lng);
  };

  useEffect(() => {
    if (existingRoom) {
      setTitle(existingRoom.title);
      setLocation(existingRoom.location);
      setImage(existingRoom.image);
      setDuration(String(existingRoom.duration));
      setDifficulty(existingRoom.difficulty);
      setPlayersMin(String(existingRoom.playersMin));
      setPlayersMax(String(existingRoom.playersMax));
      setPrice(String(existingRoom.price));
      // Load per-group pricing
      const ppg = (existingRoom as any).pricePerGroup;
      if (ppg && Array.isArray(ppg)) {
        const map: Record<number, string> = {};
        ppg.forEach((entry: { players: number; price: number }) => {
          map[entry.players] = String(entry.price);
        });
        setPricePerGroup(map);
      }
      setSelectedTheme(existingRoom.theme);
      setSelectedTags(existingRoom.tags);
      setDescription(existingRoom.description);
      setStory(existingRoom.story);
      const existing = existingRoom.paymentTerms;
      setPaymentTerms(
        Array.isArray(existing) ? existing : existing ? [existing] : ['full']
      );
      setTermsOfUse(existingRoom.termsOfUse || '');
      setIsSubOnly(existingRoom.isSubscriptionOnly || false);
      setBookingMode((existingRoom as any).bookingMode || 'unlocked_primary');
      if ((existingRoom as any).latitude) setLatitude((existingRoom as any).latitude);
      if ((existingRoom as any).longitude) setLongitude((existingRoom as any).longitude);
      // Load availability
      if ((existingRoom as any).operatingDays) setOperatingDays((existingRoom as any).operatingDays);
      if ((existingRoom as any).defaultTimeSlots) {
        setDefaultTimeSlots(
          (existingRoom as any).defaultTimeSlots.map((s: any) => ({
            time: s.time,
            price: String(s.price),
          }))
        );
      }
      // Load overflow slot
      if ((existingRoom as any).overflowSlot) {
        setOverflowEnabled(true);
        setOverflowTime((existingRoom as any).overflowSlot.time);
        setOverflowPrice(String((existingRoom as any).overflowSlot.price));
        if ((existingRoom as any).overflowSlot.pricePerGroup) {
          const map: Record<number, string> = {};
          (existingRoom as any).overflowSlot.pricePerGroup.forEach((entry: { players: number; price: number }) => {
            map[entry.players] = String(entry.price);
          });
          setOverflowPricePerGroup(map);
        }
        if ((existingRoom as any).overflowSlot.days) setOverflowDays((existingRoom as any).overflowSlot.days);
      }
    }
  }, [existingRoom]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((tg) => tg !== tag) : [...prev, tag]
    );
  };

  const handleSave = async () => {
    if (!title.trim() || !location.trim() || !price.trim()) {
      Alert.alert(t('error'), t('roomEditor.requiredFields'));
      return;
    }
    if (paymentTerms.length === 0) {
      Alert.alert(t('error'), t('roomEditor.paymentRequired'));
      return;
    }
    setLoading(true);
    try {
      const pMin = parseInt(playersMin) || 2;
      const pMax = parseInt(playersMax) || 6;
      const groupPricing = Object.entries(pricePerGroup)
        .filter(([_, v]) => v && v.trim() !== '')
        .map(([k, v]) => ({ players: parseInt(k), price: parseFloat(v) || 0 }))
        .sort((a, b) => a.players - b.players);
      const timeSlotData = defaultTimeSlots
        .filter((s) => s.time.trim() !== '')
        .map((s) => ({ time: s.time.trim(), price: parseFloat(s.price) || 0 }));
      const overflowGroupPricing = Object.entries(overflowPricePerGroup)
        .filter(([_, v]) => v && v.trim() !== '')
        .map(([k, v]) => ({ players: parseInt(k), price: parseFloat(v) || 0 }))
        .sort((a, b) => a.players - b.players);
      const overflowData = overflowEnabled
        ? { overflowSlot: {
            time: overflowTime.trim(),
            price: parseFloat(overflowPrice) || 0,
            ...(overflowGroupPricing.length > 0 ? { pricePerGroup: overflowGroupPricing } : {}),
            days: overflowDays,
          } }
        : {};
      if (isEditing && roomId) {
        await updateRoom({
          roomId: roomId as Id<"rooms">,
          title: title.trim(),
          location: location.trim(),
          image: image.trim() || 'https://images.unsplash.com/photo-1509248961085-879c6c3c7b05?w=600&q=80',
          duration: parseInt(duration) || 60,
          difficulty,
          players: `${pMin}-${pMax}`,
          playersMin: pMin,
          playersMax: pMax,
          price: parseFloat(price) || 0,
          theme: selectedTheme,
          tags: selectedTags,
          description: description.trim(),
          story: story.trim(),
          paymentTerms,
          termsOfUse: termsOfUse.trim(),
          isSubscriptionOnly: isSubOnly,
          bookingMode,
          ...(latitude != null && longitude != null ? { latitude, longitude } : {}),
          ...(groupPricing.length > 0 ? { pricePerGroup: groupPricing } : {}),
          operatingDays,
          ...(timeSlotData.length > 0 ? { defaultTimeSlots: timeSlotData } : {}),
          ...overflowData,
        });
        Alert.alert(t('success'), t('roomEditor.roomUpdated'), [
          { text: t('ok'), onPress: () => navigation.goBack() },
        ]);
      } else {
        await createRoom({
          companyId: companyId as Id<"companies">,
          title: title.trim(),
          location: location.trim(),
          image: image.trim() || 'https://images.unsplash.com/photo-1509248961085-879c6c3c7b05?w=600&q=80',
          duration: parseInt(duration) || 60,
          difficulty,
          maxDifficulty: 5,
          players: `${pMin}-${pMax}`,
          playersMin: pMin,
          playersMax: pMax,
          price: parseFloat(price) || 0,
          theme: selectedTheme,
          tags: selectedTags,
          description: description.trim(),
          story: story.trim(),
          paymentTerms,
          termsOfUse: termsOfUse.trim(),
          isSubscriptionOnly: isSubOnly,
          bookingMode,
          ...(latitude != null && longitude != null ? { latitude, longitude } : {}),
          ...(groupPricing.length > 0 ? { pricePerGroup: groupPricing } : {}),
          operatingDays,
          ...(timeSlotData.length > 0 ? { defaultTimeSlots: timeSlotData } : {}),
          ...overflowData,
        });
        Alert.alert(t('success'), t('roomEditor.roomCreated'), [
          { text: t('ok'), onPress: () => navigation.goBack() },
        ]);
      }
    } catch {
      Alert.alert(t('error'), t('roomEditor.saveFailed'));
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEditing ? t('roomEditor.editTitle') : t('roomEditor.addTitle')}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Basic Info */}
        <Text style={styles.sectionTitle}>{t('roomEditor.basicInfo')}</Text>
        <View style={styles.card}>
          <Text style={styles.label}>{t('roomEditor.roomName')}</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder={t('roomEditor.roomNamePlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
          />

          <Text style={styles.label}>{t('roomEditor.location')}</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder={t('roomEditor.locationPlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
          />

          {/* Map Pin Picker */}
          <Text style={[styles.label, { marginTop: 14 }]}>{t('roomEditor.pinLocation')}</Text>
          <View style={styles.mapContainer}>
            <MapView
              ref={mapRef}
              style={styles.map}
              initialRegion={{
                latitude: latitude || 37.7749,
                longitude: longitude || -122.4194,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              }}
              region={latitude && longitude ? {
                latitude,
                longitude,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              } : undefined}
              onPress={handleMapPress}
              customMapStyle={darkMapStyle}
            >
              {latitude && longitude && (
                <Marker
                  coordinate={{ latitude, longitude }}
                  draggable
                  onDragEnd={(e) => {
                    const { latitude: lat, longitude: lng } = e.nativeEvent.coordinate;
                    setLatitude(lat);
                    setLongitude(lng);
                    reverseGeocode(lat, lng);
                  }}
                />
              )}
            </MapView>
            {!latitude && (
              <View style={styles.mapOverlay}>
                <Ionicons name="location-outline" size={24} color={theme.colors.textMuted} />
                <Text style={styles.mapOverlayText}>{t('roomEditor.tapMap')}</Text>
              </View>
            )}
          </View>
          {latitude && longitude && (
            <Text style={styles.coordsText}>
              {latitude.toFixed(5)}, {longitude.toFixed(5)}
            </Text>
          )}

          <Text style={styles.label}>{t('roomEditor.coverImage')}</Text>
          <TextInput
            style={styles.input}
            value={image}
            onChangeText={setImage}
            placeholder={t('roomEditor.coverPlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="none"
          />

          <Text style={styles.label}>{t('roomEditor.description')}</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder={t('roomEditor.descPlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
            multiline
          />

          <Text style={styles.label}>{t('roomEditor.story')}</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={story}
            onChangeText={setStory}
            placeholder={t('roomEditor.storyPlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
            multiline
          />
        </View>

        {/* Room Details */}
        <Text style={styles.sectionTitle}>{t('roomEditor.roomDetails')}</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{t('roomEditor.duration')}</Text>
              <TextInput
                style={styles.input}
                value={duration}
                onChangeText={setDuration}
                keyboardType="numeric"
                placeholder="60"
                placeholderTextColor={theme.colors.textMuted}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{t('roomEditor.basePrice')}</Text>
              <TextInput
                style={styles.input}
                value={price}
                onChangeText={(val) => {
                  setPrice(val);
                  // Auto-fill empty group prices with base price
                  const pMin = parseInt(playersMin) || 2;
                  const pMax = parseInt(playersMax) || 6;
                  const updated = { ...pricePerGroup };
                  for (let p = pMin; p <= pMax; p++) {
                    if (!updated[p]) updated[p] = val;
                  }
                  setPricePerGroup(updated);
                }}
                keyboardType="decimal-pad"
                placeholder="35"
                placeholderTextColor={theme.colors.textMuted}
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{t('roomEditor.minPlayers')}</Text>
              <TextInput
                style={styles.input}
                value={playersMin}
                onChangeText={setPlayersMin}
                keyboardType="numeric"
                placeholderTextColor={theme.colors.textMuted}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{t('roomEditor.maxPlayers')}</Text>
              <TextInput
                style={styles.input}
                value={playersMax}
                onChangeText={setPlayersMax}
                keyboardType="numeric"
                placeholderTextColor={theme.colors.textMuted}
              />
            </View>
          </View>

          {/* Per-Player Pricing Grid */}
          {(() => {
            const pMin = parseInt(playersMin) || 2;
            const pMax = parseInt(playersMax) || 6;
            if (pMax >= pMin && pMax - pMin < 20) {
              const counts = [];
              for (let p = pMin; p <= pMax; p++) counts.push(p);
              return (
                <>
                  <Text style={[styles.label, { marginTop: 16 }]}>{t('roomEditor.groupPrice')}</Text>
                  <View style={styles.pricingGrid}>
                    {counts.map((p) => (
                      <View key={p} style={styles.pricingRow}>
                        <View style={styles.pricingLabel}>
                          <Ionicons name="people" size={14} color={theme.colors.textMuted} />
                          <Text style={styles.pricingPlayers}>{p}</Text>
                        </View>
                        <TextInput
                          style={styles.pricingInput}
                          value={pricePerGroup[p] || ''}
                          onChangeText={(val) => setPricePerGroup((prev) => ({ ...prev, [p]: val }))}
                          keyboardType="decimal-pad"
                          placeholder={price || '0'}
                          placeholderTextColor={theme.colors.textMuted}
                        />
                        <Text style={styles.pricingCurrency}>€</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.pricingHint}>{t('roomEditor.groupPriceHint')}</Text>
                </>
              );
            }
            return null;
          })()}

          <Text style={styles.label}>{t('roomEditor.difficulty', { n: difficulty })}</Text>
          <View style={styles.difficultyRow}>
            {[1, 2, 3, 4, 5].map((d) => (
              <TouchableOpacity
                key={d}
                style={[styles.diffDot, d <= difficulty && styles.diffDotFilled]}
                onPress={() => setDifficulty(d)}
              >
                <Text style={styles.diffText}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Theme */}
        <Text style={styles.sectionTitle}>{t('roomEditor.themeSection')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20, marginHorizontal: 20 }}>
          {THEMES.map((th) => (
            <TouchableOpacity
              key={th}
              style={[styles.chip, selectedTheme === th && styles.chipActive]}
              onPress={() => setSelectedTheme(th)}
            >
              <Text style={[styles.chipText, selectedTheme === th && styles.chipTextActive]}>{t(THEME_KEYS[th])}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Tags */}
        <Text style={styles.sectionTitle}>{t('roomEditor.tagsSection')}</Text>
        <View style={styles.tagsGrid}>
          {TAG_OPTIONS.map((tag) => (
            <TouchableOpacity
              key={tag}
              style={[styles.tagChip, selectedTags.includes(tag) && styles.tagChipActive]}
              onPress={() => toggleTag(tag)}
            >
              <Text style={[styles.tagText, selectedTags.includes(tag) && styles.tagTextActive]}>{t(TAG_KEYS[tag])}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ─── Availability ─── */}
        <Text style={styles.sectionTitle}>{t('roomEditor.operatingDays')}</Text>
        <View style={styles.card}>
          <Text style={styles.availHint}>{t('roomEditor.operatingDaysHint')}</Text>
          <View style={styles.daysRow}>
            {(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const).map((day, idx) => {
              const isOn = operatingDays.includes(idx);
              return (
                <TouchableOpacity
                  key={day}
                  style={[styles.dayChip, isOn && styles.dayChipActive]}
                  onPress={() => {
                    setOperatingDays((prev) =>
                      isOn ? prev.filter((d) => d !== idx) : [...prev, idx].sort()
                    );
                  }}
                >
                  <Text style={[styles.dayChipText, isOn && styles.dayChipTextActive]}>{t(`day.${day.toLowerCase()}`)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t('roomEditor.defaultSlots')}</Text>
        <View style={styles.card}>
          <Text style={styles.availHint}>{t('roomEditor.slotsHint')}</Text>
          {defaultTimeSlots.map((slot, idx) => (
            <View key={idx} style={styles.slotRow}>
              <View style={styles.slotTimeWrap}>
                <Ionicons name="time-outline" size={16} color={theme.colors.textSecondary} />
                <Text style={styles.slotTime}>{slot.time}</Text>
              </View>
              <View style={styles.slotPriceWrap}>
                <Text style={styles.slotCurrency}>€</Text>
                <TextInput
                  style={styles.slotPriceInput}
                  value={slot.price}
                  onChangeText={(val) => {
                    setDefaultTimeSlots((prev) => {
                      const copy = [...prev];
                      copy[idx] = { ...copy[idx], price: val };
                      return copy;
                    });
                  }}
                  keyboardType="decimal-pad"
                  placeholderTextColor={theme.colors.textMuted}
                />
              </View>
              <TouchableOpacity
                style={styles.slotRemoveBtn}
                onPress={() => {
                  setDefaultTimeSlots((prev) => prev.filter((_, i) => i !== idx));
                }}
              >
                <Ionicons name="close-circle" size={22} color="#F44336" />
              </TouchableOpacity>
            </View>
          ))}

          {/* Add new slot */}
          <View style={styles.addSlotRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={newSlotTime}
              onChangeText={setNewSlotTime}
              placeholder={t('roomEditor.slotPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
            />
            <TouchableOpacity
              style={styles.addSlotBtn}
              onPress={() => {
                if (!newSlotTime.trim()) {
                  Alert.alert(t('error'), t('roomEditor.slotError'));
                  return;
                }
                setDefaultTimeSlots((prev) => [
                  ...prev,
                  { time: newSlotTime.trim(), price: price || '35' },
                ]);
                setNewSlotTime('');
              }}
            >
              <Ionicons name="add-circle" size={22} color={theme.colors.redPrimary} />
              <Text style={styles.addSlotText}>{t('roomEditor.add')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Overflow / Bonus Slot */}
        <Text style={styles.sectionTitle}>{t('roomEditor.overflowSlot')}</Text>
        <View style={styles.card}>
          <Text style={styles.availHint}>
            {t('roomEditor.overflowHint')}
          </Text>
          <TouchableOpacity
            style={styles.overflowToggleRow}
            onPress={() => setOverflowEnabled((v) => !v)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={overflowEnabled ? 'toggle' : 'toggle-outline'}
              size={36}
              color={overflowEnabled ? theme.colors.redPrimary : theme.colors.textMuted}
            />
            <Text style={[styles.overflowToggleLabel, overflowEnabled && { color: '#fff' }]}>
              {overflowEnabled ? t('roomEditor.enabled') : t('roomEditor.disabled')}
            </Text>
          </TouchableOpacity>

          {overflowEnabled && (
            <View style={styles.overflowFields}>
              {/* Days picker */}
              <Text style={styles.overflowFieldLabel}>{t('roomEditor.activeDays')}</Text>
              <View style={styles.daysRow}>
                {(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const).map((day, idx) => {
                  const isOn = overflowDays.includes(idx);
                  return (
                    <TouchableOpacity
                      key={day}
                      style={[styles.dayChip, isOn && styles.dayChipActive]}
                      onPress={() => {
                        setOverflowDays((prev) =>
                          isOn ? prev.filter((d) => d !== idx) : [...prev, idx].sort()
                        );
                      }}
                    >
                      <Text style={[styles.dayChipText, isOn && styles.dayChipTextActive]}>{t(`day.${day.toLowerCase()}`)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.overflowFieldRow}>
                <Text style={styles.overflowFieldLabel}>{t('roomEditor.time')}</Text>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={overflowTime}
                  onChangeText={setOverflowTime}
                  placeholder={t('roomEditor.timePlaceholder')}
                  placeholderTextColor={theme.colors.textMuted}
                />
              </View>
              <View style={styles.overflowFieldRow}>
                <Text style={styles.overflowFieldLabel}>{t('roomEditor.overflowBasePrice')}</Text>
                <View style={styles.slotPriceWrap}>
                  <Text style={styles.slotCurrency}>€</Text>
                  <TextInput
                    style={styles.slotPriceInput}
                    value={overflowPrice}
                    onChangeText={setOverflowPrice}
                    keyboardType="decimal-pad"
                    placeholderTextColor={theme.colors.textMuted}
                  />
                </View>
              </View>

              {/* Per-Player Overflow Pricing */}
              {(() => {
                const pMin = parseInt(playersMin) || 2;
                const pMax = parseInt(playersMax) || 6;
                if (pMax >= pMin && pMax - pMin < 20) {
                  const counts = [];
                  for (let p = pMin; p <= pMax; p++) counts.push(p);
                  return (
                    <>
                      <Text style={[styles.overflowFieldLabel, { marginTop: 12 }]}>{t('roomEditor.overflowGroupPrice')}</Text>
                      <View style={styles.pricingGrid}>
                        {counts.map((p) => (
                          <View key={p} style={styles.pricingRow}>
                            <View style={styles.pricingLabel}>
                              <Ionicons name="people" size={14} color={theme.colors.textMuted} />
                              <Text style={styles.pricingPlayers}>{p}</Text>
                            </View>
                            <TextInput
                              style={styles.pricingInput}
                              value={overflowPricePerGroup[p] || ''}
                              onChangeText={(val) => setOverflowPricePerGroup((prev) => ({ ...prev, [p]: val }))}
                              keyboardType="decimal-pad"
                              placeholder={overflowPrice || '0'}
                              placeholderTextColor={theme.colors.textMuted}
                            />
                            <Text style={styles.pricingCurrency}>€</Text>
                          </View>
                        ))}
                      </View>
                      <Text style={styles.pricingHint}>{t('roomEditor.overflowGroupHint')}</Text>
                    </>
                  );
                }
                return null;
              })()}
            </View>
          )}
        </View>

        {/* Payment Terms */}
        <Text style={styles.sectionTitle}>{t('roomEditor.paymentTerms')}</Text>
        <View style={styles.card}>
          {([
            { key: 'full' as const, icon: 'cash-outline' as const, title: t('roomEditor.fullPaymentTitle'), desc: t('roomEditor.fullPaymentDesc') },
            { key: 'deposit_20' as const, icon: 'card-outline' as const, title: t('roomEditor.depositTitle'), desc: t('roomEditor.depositDesc') },
            { key: 'pay_on_arrival' as const, icon: 'location-outline' as const, title: t('roomEditor.payOnArrivalTitle'), desc: t('roomEditor.payOnArrivalDesc') },
          ]).map((opt) => {
            const selected = paymentTerms.includes(opt.key);
            // Incompatible pairs: deposit_20 <-> pay_on_arrival
            const incompatible: Record<string, string[]> = {
              full: [],
              deposit_20: ['pay_on_arrival'],
              pay_on_arrival: ['deposit_20'],
            };
            const blocked = !selected && paymentTerms.some((pt) => incompatible[opt.key]?.includes(pt));
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.payOption, selected && styles.payOptionActive, blocked && { opacity: 0.35 }]}
                disabled={blocked}
                onPress={() => {
                  setPaymentTerms((prev) => {
                    if (selected) {
                      return prev.filter((pt) => pt !== opt.key);
                    }
                    if (prev.length >= 2) {
                      return [...prev.slice(1), opt.key];
                    }
                    return [...prev, opt.key];
                  });
                }}
              >
                <View style={styles.payLeft}>
                  <Ionicons name={opt.icon} size={20} color="#fff" />
                  <View>
                    <Text style={styles.payTitle}>{opt.title}</Text>
                    <Text style={styles.payDesc}>{opt.desc}</Text>
                  </View>
                </View>
                <View style={[styles.radio, selected && styles.radioActive]}>
                  {selected && <View style={styles.radioDot} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Terms of Use */}
        <Text style={styles.sectionTitle}>{t('roomEditor.termsOfUse')}</Text>
        <View style={styles.card}>
          <TextInput
            style={[styles.input, styles.textArea, { minHeight: 100 }]}
            value={termsOfUse}
            onChangeText={setTermsOfUse}
            placeholder={t('roomEditor.termsPlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
            multiline
          />
        </View>

        {/* Booking Mode */}
        <Text style={styles.sectionTitle}>{t('roomEditor.bookingMode')}</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={[styles.payOption, bookingMode === 'unlocked_primary' && styles.payOptionActive]}
            onPress={() => setBookingMode('unlocked_primary')}
          >
            <View style={styles.payLeft}>
              <Ionicons name="lock-open-outline" size={20} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={styles.payTitle}>{t('roomEditor.unlockedPrimary')}</Text>
                <Text style={styles.payDesc}>{t('roomEditor.unlockedPrimaryDesc')}</Text>
              </View>
            </View>
            <View style={[styles.radio, bookingMode === 'unlocked_primary' && styles.radioActive]}>
              {bookingMode === 'unlocked_primary' && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.payOption, bookingMode === 'external_primary' && styles.payOptionActive]}
            onPress={() => setBookingMode('external_primary')}
          >
            <View style={styles.payLeft}>
              <Ionicons name="swap-horizontal-outline" size={20} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={styles.payTitle}>{t('roomEditor.externalPrimary')}</Text>
                <Text style={styles.payDesc}>{t('roomEditor.externalPrimaryDesc')}</Text>
              </View>
            </View>
            <View style={[styles.radio, bookingMode === 'external_primary' && styles.radioActive]}>
              {bookingMode === 'external_primary' && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>
        </View>

        {/* Subscription Toggle */}
        <Text style={styles.sectionTitle}>{t('roomEditor.subscriptionAccess')}</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.toggleRow}
            onPress={() => setIsSubOnly(!isSubOnly)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.payTitle}>{t('roomEditor.subOnly')}</Text>
              <Text style={styles.payDesc}>
                {t('roomEditor.subOnlyDesc')}
              </Text>
            </View>
            <View style={[styles.switch, isSubOnly && styles.switchOn]}>
              <View style={[styles.switchThumb, isSubOnly && styles.switchThumbOn]} />
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Save Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveBtn, loading && { opacity: 0.6 }]}
          disabled={loading}
          activeOpacity={0.8}
          onPress={handleSave}
        >
          <Text style={styles.saveBtnText}>
            {loading ? t('saving') : isEditing ? t('roomEditor.updateRoom') : t('roomEditor.createRoom')}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.colors.glass, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  scroll: { flex: 1 },

  sectionTitle: {
    fontSize: 16, fontWeight: '700', color: '#fff',
    paddingHorizontal: 20, marginBottom: 10, marginTop: 8,
  },
  card: {
    marginHorizontal: 20, padding: 16, marginBottom: 16,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  label: {
    fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary,
    marginBottom: 6, marginTop: 10,
  },
  input: {
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    color: '#fff', fontSize: 14,
  },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 12 },

  difficultyRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  diffDot: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  diffDotFilled: {
    backgroundColor: theme.colors.redPrimary,
    borderColor: theme.colors.redPrimary,
  },
  diffText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  chip: {
    paddingVertical: 10, paddingHorizontal: 18, marginRight: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  chipActive: { backgroundColor: theme.colors.redSubtle, borderColor: theme.colors.redPrimary },
  chipText: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary },
  chipTextActive: { color: theme.colors.redPrimary },

  tagsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 20, marginBottom: 20,
  },
  tagChip: {
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: theme.radius.full,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  tagChipActive: { backgroundColor: theme.colors.redSubtle, borderColor: theme.colors.redPrimary },
  tagText: { fontSize: 12, fontWeight: '500', color: theme.colors.textSecondary },
  tagTextActive: { color: theme.colors.redPrimary },

  payOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    marginBottom: 8,
  },
  payOptionActive: { borderColor: theme.colors.redPrimary },
  payLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  payTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },
  payDesc: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: theme.colors.textMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  radioActive: { borderColor: theme.colors.redPrimary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.redPrimary },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  switch: {
    width: 50, height: 28, borderRadius: 14,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    justifyContent: 'center', paddingHorizontal: 2,
  },
  switchOn: { backgroundColor: theme.colors.redPrimary, borderColor: theme.colors.redPrimary },
  switchThumb: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff',
  },
  switchThumbOn: { alignSelf: 'flex-end' },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36,
    backgroundColor: 'rgba(26,13,13,0.95)',
    borderTopWidth: 1, borderTopColor: theme.colors.border,
  },
  saveBtn: {
    paddingVertical: 16, borderRadius: theme.radius.full,
    backgroundColor: theme.colors.redPrimary,
    alignItems: 'center',
    ...theme.shadow.red,
  },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // Map
  mapContainer: {
    height: 200, borderRadius: theme.radius.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: theme.colors.glassBorder, marginTop: 4,
  },
  map: { flex: 1 },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  mapOverlayText: { fontSize: 13, color: theme.colors.textMuted, marginTop: 6 },
  coordsText: {
    fontSize: 11, color: theme.colors.textMuted, marginTop: 6, textAlign: 'center',
  },

  // Pricing grid
  pricingGrid: {
    gap: 8, marginTop: 4,
  },
  pricingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  pricingLabel: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    width: 50,
  },
  pricingPlayers: {
    fontSize: 14, fontWeight: '600', color: '#fff',
  },
  pricingInput: {
    flex: 1, height: 42, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    color: '#fff', fontSize: 14, paddingHorizontal: 14,
  },
  pricingCurrency: {
    fontSize: 14, fontWeight: '600', color: theme.colors.textMuted,
  },
  pricingHint: {
    fontSize: 11, color: theme.colors.textMuted, marginTop: 4, marginBottom: 8,
  },

  // Availability
  availHint: {
    fontSize: 12, color: theme.colors.textMuted, marginBottom: 12,
  },
  daysRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
  },
  dayChip: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  dayChipActive: {
    backgroundColor: theme.colors.redPrimary,
    borderColor: theme.colors.redPrimary,
  },
  dayChipText: {
    fontSize: 12, fontWeight: '700', color: theme.colors.textMuted,
  },
  dayChipTextActive: {
    color: '#fff',
  },
  slotRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: theme.colors.glassBorder,
  },
  slotTimeWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1,
  },
  slotTime: {
    fontSize: 14, fontWeight: '600', color: '#fff',
  },
  slotPriceWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  slotCurrency: {
    fontSize: 14, fontWeight: '600', color: theme.colors.textMuted,
  },
  slotPriceInput: {
    width: 60, height: 36, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    color: '#fff', fontSize: 14, paddingHorizontal: 8, textAlign: 'center',
  },
  slotRemoveBtn: {
    padding: 4,
  },
  slotGroupGrid: {
    paddingLeft: 22, paddingVertical: 8, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: theme.colors.glassBorder,
  },
  slotGroupHint: {
    fontSize: 11, color: theme.colors.textMuted, marginBottom: 6,
  },
  addSlotRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12,
  },
  addSlotBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  addSlotText: {
    fontSize: 13, fontWeight: '600', color: theme.colors.redPrimary,
  },
  overflowToggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8,
  },
  overflowToggleLabel: {
    fontSize: 14, fontWeight: '600', color: theme.colors.textMuted,
  },
  overflowFields: {
    marginTop: 14, gap: 10,
  },
  overflowFieldRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  overflowFieldLabel: {
    fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary, width: 50,
  },
});

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1d1d1d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8e8e8e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1d1d1d' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#3a3a3a' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e0e0e' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#262626' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#262626' }] },
];
