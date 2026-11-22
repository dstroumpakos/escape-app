import React, { useState } from 'react';
import { Image, StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';
import { useTranslation } from '../i18n';

export type Offer = {
  roomId: string;
  title: string;
  image: string;
  location: string;
  players: string;
  duration: number;
  price: number;
  companyName: string;
  date: string;
  time: string;
  percent: number;
};

/** Greek "today" (times before 06:00 still count as the previous day). */
function athensToday(): string {
  const d = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function OfferCard({ offer, onPress, style }: { offer: Offer; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const day = offer.date === athensToday() ? t('offers.today') : t('offers.tomorrow');
  const perPerson = Math.round(offer.price * (100 - offer.percent)) / 100;
  return (
    <TouchableOpacity style={[styles.card, style]} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.imageBox}>
        {offer.image && !failed ? (
          <Image source={{ uri: offer.image }} style={StyleSheet.absoluteFill} onError={() => setFailed(true)} />
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="key-outline" size={36} color={theme.colors.textMuted} />
          </View>
        )}
        <View style={styles.percent}>
          <Ionicons name="flame" size={14} color="#fff" />
          <Text style={styles.percentText}>-{offer.percent}%</Text>
        </View>
        <View style={styles.when}>
          <Text style={styles.whenText}>{day} · {offer.time}</Text>
        </View>
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>{offer.title}</Text>
        <Text style={styles.company} numberOfLines={1}>{offer.companyName}</Text>
        <Text style={styles.price}>
          <Text style={styles.oldPrice}>€{offer.price}  </Text>
          €{perPerson}
          <Text style={styles.perPerson}> {t('offers.perPerson')}</Text>
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.lg, overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: 'rgba(200, 16, 27, 0.35)',
  },
  imageBox: { height: 140, backgroundColor: theme.colors.bgCardSolid },
  placeholder: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  percent: {
    position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: theme.colors.redPrimary, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6,
  },
  percentText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  when: {
    position: 'absolute', bottom: 10, left: 10, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.75)', borderWidth: 1, borderColor: 'rgba(201, 154, 46, 0.5)',
  },
  whenText: { color: theme.colors.gold, fontWeight: '700', fontSize: 13 },
  body: { padding: 12 },
  title: { fontFamily: theme.fonts.display, fontSize: 16, color: theme.colors.bone },
  company: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2, marginBottom: 8 },
  price: { fontSize: 15, fontWeight: '700', color: theme.colors.bone },
  oldPrice: { textDecorationLine: 'line-through', color: theme.colors.textMuted, fontWeight: '400' },
  perPerson: { fontSize: 12, fontWeight: '400', color: theme.colors.textMuted },
});
