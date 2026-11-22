/**
 * Add or edit one merch item (business side). Same fields and rules as the
 * website's product editor; the server (merch.saveProduct) checks everything.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Image, Switch, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useMutation } from 'convex/react';
import { useCompanyMutation, useCompanyQuery } from '../../companySession';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';
import { styles, errMsg } from './CompanyMerch';

const CATEGORIES = ['apparel', 'accessories', 'games', 'collectibles', 'other'] as const;
type Category = (typeof CATEGORIES)[number];
type Status = 'draft' | 'active' | 'archived';

interface Props {
  companyId: string;
  productId?: string;
  onBack: () => void;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}
function toText(ts?: number) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** "2026-12-01 18:00" in the phone's time zone → timestamp. */
function fromText(s: string): number | undefined | null {
  const v = s.trim();
  if (!v) return undefined;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  return isNaN(d.getTime()) ? null : d.getTime();
}
function cents(s: string) {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export default function CompanyMerchEditor({ companyId, productId, onBack }: Props) {
  const { t } = useTranslation();
  const cId = companyId as Id<'companies'>;
  const products = useCompanyQuery(api.merch.companyProducts, { companyId: cId });
  const rooms = useCompanyQuery(api.companies.getRooms, { companyId: cId });
  const save = useCompanyMutation(api.merch.saveProduct);
  const generateUploadUrl = useCompanyMutation(api.companies.generateUploadUrl);
  const getUrl = useCompanyMutation(api.companies.getUrlMutation);
  const existing = productId ? products?.find((p) => p._id === productId) : undefined;

  const [loaded, setLoaded] = useState(!productId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('apparel');
  const [images, setImages] = useState<string[]>([]);
  const [price, setPrice] = useState('');
  const [variants, setVariants] = useState<{ id: string; label: string; stock: string }[]>([
    { id: '', label: t('cmerch.oneSize'), stock: '' },
  ]);
  const [pickup, setPickup] = useState(true);
  const [shipping, setShipping] = useState(false);
  const [shippingPrice, setShippingPrice] = useState('');
  const [roomIds, setRoomIds] = useState<string[]>([]);
  const [premiumOnly, setPremiumOnly] = useState(false);
  const [release, setRelease] = useState('');
  const [unlockRoomId, setUnlockRoomId] = useState('');
  const [unlockRule, setUnlockRule] = useState<'played' | 'escaped'>('played');
  const [status, setStatus] = useState<Status>('active');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loaded || !existing) return;
    setTitle(existing.title);
    setDescription(existing.description);
    setCategory(existing.category);
    setImages(existing.images);
    setPrice(String(existing.priceCents / 100));
    setVariants(existing.variants.map((v) => ({ id: v.id, label: v.label, stock: v.stock === undefined ? '' : String(v.stock) })));
    setPickup(existing.pickup);
    setShipping(existing.shipping);
    setShippingPrice(existing.shippingCents ? String(existing.shippingCents / 100) : '');
    setRoomIds((existing.roomIds ?? []) as string[]);
    setPremiumOnly(!!existing.premiumOnly);
    setRelease(toText(existing.releaseAt));
    setUnlockRoomId((existing.unlockRoomId as string) ?? '');
    setUnlockRule(existing.unlockRule ?? 'played');
    setStatus(existing.status);
    setLoaded(true);
  }, [existing, loaded]);

  const addPhotos = async () => {
    if (images.length >= 6) return;
    const { status: perm } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: 6 - images.length,
    });
    if (result.canceled) return;
    setUploading(true);
    try {
      for (const asset of result.assets.slice(0, 6 - images.length)) {
        const uploadUrl = await generateUploadUrl({});
        const blob = await (await fetch(asset.uri)).blob();
        const res = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': asset.mimeType || 'image/jpeg' }, body: blob });
        const { storageId } = await res.json();
        const url = await getUrl({ storageId });
        if (url) setImages((cur) => [...cur, url].slice(0, 6));
      }
    } catch {
      Alert.alert(t('error'), t('cmerch.photoFailed'));
    } finally {
      setUploading(false);
    }
  };

  const move = (i: number, d: -1 | 1) =>
    setImages((cur) => {
      const j = i + d;
      if (j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const submit = async () => {
    const priceCents = cents(price);
    const shippingCents = shipping ? cents(shippingPrice || '0') : 0;
    if (!Number.isFinite(priceCents) || !Number.isFinite(shippingCents)) return Alert.alert(t('error'), t('cmerch.badPrice'));
    const releaseAt = fromText(release);
    if (releaseAt === null) return Alert.alert(t('error'), t('cmerch.badDate'));
    setSaving(true);
    try {
      await save({
        companyId: cId,
        productId: productId as Id<'merchProducts'> | undefined,
        title,
        description,
        category,
        images,
        priceCents,
        variants: variants.map((v) => {
          const n = v.stock.trim() === '' ? undefined : Number(v.stock);
          return { id: v.id, label: v.label, stock: n !== undefined && Number.isFinite(n) ? n : undefined };
        }),
        pickup,
        shipping,
        shippingCents,
        roomIds: roomIds as Id<'rooms'>[],
        premiumOnly,
        releaseAt,
        unlockRoomId: unlockRoomId ? (unlockRoomId as Id<'rooms'>) : undefined,
        unlockRule: unlockRoomId ? unlockRule : undefined,
        status,
      });
      onBack();
    } catch (e) {
      Alert.alert(t('error'), errMsg(e, t('cmerch.failed')));
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={theme.colors.redPrimary} />
      </View>
    );
  }

  const roomList = (rooms ?? []) as { _id: string; title: string }[];
  const Chip = ({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) => (
    <TouchableOpacity onPress={onPress} style={[styles.chip, on && styles.chipActive]}>
      <Text style={[styles.chipText, on && { color: '#fff' }]}>{label}</Text>
    </TouchableOpacity>
  );
  const Toggle = ({ value, onChange, label, hint }: { value: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={styles.text}>{label}</Text>
        {hint ? <Text style={styles.muted}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: theme.colors.glass, true: theme.colors.redPrimary }} thumbColor="#fff" />
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Ionicons name="close" size={20} color={theme.colors.bone} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{productId ? t('cmerch.editTitle') : t('cmerch.newTitle')}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={submit} disabled={saving || uploading}>
          {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.addText}>{t('save')}</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
        {/* Photos */}
        <View style={styles.card}>
          <Text style={styles.label}>{t('cmerch.photos')}</Text>
          <View style={styles.rowWrap}>
            {images.map((u, i) => (
              <View key={u + i} style={{ width: 92 }}>
                <Image source={{ uri: u }} style={{ width: 92, height: 92, borderRadius: theme.radius.md }} />
                {i === 0 && <Text style={[styles.tag, { position: 'absolute', top: 4, left: 4 }]}>{t('cmerch.cover')}</Text>}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                  <TouchableOpacity onPress={() => move(i, -1)} hitSlop={6}>
                    <Ionicons name="chevron-back" size={18} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setImages((c) => c.filter((_, j) => j !== i))} hitSlop={6}>
                    <Ionicons name="trash-outline" size={17} color="#FF8A80" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => move(i, 1)} hitSlop={6}>
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            {images.length < 6 && (
              <TouchableOpacity
                onPress={addPhotos}
                disabled={uploading}
                style={{ width: 92, height: 92, borderRadius: theme.radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.colors.glassBorder, alignItems: 'center', justifyContent: 'center', gap: 4 }}
              >
                {uploading ? <ActivityIndicator color={theme.colors.redLight} /> : <Ionicons name="image-outline" size={22} color={theme.colors.textSecondary} />}
                <Text style={styles.muted}>{t('cmerch.addPhoto')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Basics */}
        <View style={styles.card}>
          <Text style={styles.label}>{t('cmerch.name')}</Text>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} maxLength={80} placeholderTextColor={theme.colors.textMuted} />
          <Text style={[styles.label, { marginTop: 12 }]}>{t('cmerch.description')}</Text>
          <TextInput style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]} value={description} onChangeText={setDescription} maxLength={2000} multiline />
          <Text style={[styles.label, { marginTop: 12 }]}>{t('cmerch.category')}</Text>
          <View style={styles.rowWrap}>
            {CATEGORIES.map((c) => (
              <Chip key={c} on={category === c} label={t(`cmerch.cat_${c}`)} onPress={() => setCategory(c)} />
            ))}
          </View>
          <Text style={[styles.label, { marginTop: 12 }]}>{t('cmerch.price')}</Text>
          <TextInput style={[styles.input, { width: 140 }]} value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="25" placeholderTextColor={theme.colors.textMuted} />
        </View>

        {/* Variants */}
        <View style={styles.card}>
          <Text style={styles.label}>{t('cmerch.variants')}</Text>
          <Text style={[styles.hint, { marginTop: 0, marginBottom: 8 }]}>{t('cmerch.variantsHint')}</Text>
          {variants.map((v, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={v.label}
                onChangeText={(x) => setVariants((c) => c.map((y, j) => (j === i ? { ...y, label: x } : y)))}
                placeholder={t('cmerch.variantPlaceholder')}
                placeholderTextColor={theme.colors.textMuted}
                maxLength={40}
              />
              <TextInput
                style={[styles.input, { width: 96 }]}
                value={v.stock}
                onChangeText={(x) => setVariants((c) => c.map((y, j) => (j === i ? { ...y, stock: x.replace(/[^0-9]/g, '') } : y)))}
                placeholder={t('cmerch.stockUnlimitedShort')}
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="number-pad"
              />
              <TouchableOpacity
                disabled={variants.length <= 1}
                onPress={() => setVariants((c) => c.filter((_, j) => j !== i))}
                style={[styles.stepBtn, variants.length <= 1 && { opacity: 0.3 }]}
              >
                <Ionicons name="trash-outline" size={16} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
          ))}
          {variants.length < 20 && (
            <TouchableOpacity onPress={() => setVariants((c) => [...c, { id: '', label: '', stock: '' }])}>
              <Text style={styles.link}>+ {t('cmerch.addVariant')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Delivery */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('cmerch.delivery')}</Text>
          <Toggle value={pickup} onChange={setPickup} label={t('cmerch.pickup')} hint={t('cmerch.pickupHint')} />
          <Toggle value={shipping} onChange={setShipping} label={t('cmerch.shipping')} />
          {shipping && (
            <>
              <Text style={[styles.label, { marginTop: 10 }]}>{t('cmerch.shippingPrice')}</Text>
              <TextInput style={[styles.input, { width: 140 }]} value={shippingPrice} onChangeText={setShippingPrice} keyboardType="decimal-pad" placeholder="4.50" placeholderTextColor={theme.colors.textMuted} />
            </>
          )}
        </View>

        {/* Rooms */}
        {roomList.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.label}>{t('cmerch.rooms')}</Text>
            <Text style={[styles.hint, { marginTop: 0, marginBottom: 8 }]}>{t('cmerch.roomsHint')}</Text>
            <View style={styles.rowWrap}>
              {roomList.map((r) => {
                const on = roomIds.includes(r._id);
                return <Chip key={r._id} on={on} label={r.title} onPress={() => setRoomIds((c) => (on ? c.filter((x) => x !== r._id) : [...c, r._id]))} />;
              })}
            </View>
          </View>
        )}

        {/* Special */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('cmerch.special')}</Text>
          <Toggle value={premiumOnly} onChange={setPremiumOnly} label={t('cmerch.premiumOnly')} hint={t('cmerch.premiumOnlyHint')} />
          <Text style={[styles.label, { marginTop: 14 }]}>{t('cmerch.release')}</Text>
          <TextInput
            style={styles.input}
            value={release}
            onChangeText={setRelease}
            placeholder="2026-12-01 18:00"
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="none"
          />
          <Text style={styles.hint}>{t('cmerch.releaseHint')}</Text>
          {roomList.length > 0 && (
            <>
              <Text style={[styles.label, { marginTop: 14 }]}>{t('cmerch.unlockRoom')}</Text>
              <View style={styles.rowWrap}>
                <Chip on={!unlockRoomId} label={t('cmerch.unlockNone')} onPress={() => setUnlockRoomId('')} />
                {roomList.map((r) => (
                  <Chip key={r._id} on={unlockRoomId === r._id} label={r.title} onPress={() => setUnlockRoomId(r._id)} />
                ))}
              </View>
              {!!unlockRoomId && (
                <View style={[styles.rowWrap, { marginTop: 10 }]}>
                  <Chip on={unlockRule === 'played'} label={t('cmerch.unlockPlayed')} onPress={() => setUnlockRule('played')} />
                  <Chip on={unlockRule === 'escaped'} label={t('cmerch.unlockEscaped')} onPress={() => setUnlockRule('escaped')} />
                </View>
              )}
              <Text style={styles.hint}>{t('cmerch.unlockHint')}</Text>
            </>
          )}
        </View>

        {/* Status */}
        <View style={styles.card}>
          <Text style={styles.label}>{t('cmerch.statusLabel')}</Text>
          <View style={styles.rowWrap}>
            {(['active', 'draft', 'archived'] as const).map((s) => (
              <Chip key={s} on={status === s} label={t(`cmerch.status_${s}`)} onPress={() => setStatus(s)} />
            ))}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
