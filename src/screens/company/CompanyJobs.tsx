/**
 * Job ads for the escape room ("we are looking for a game master"). Mirrors the
 * website's /company/jobs page (same Convex functions in convex/jobs.ts).
 * Open ads show on the players' Jobs screen and on the company profile.
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Image, Modal, FlatList, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useCompanyMutation, useCompanyQuery } from '../../companySession';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';
import { errMsg } from './CompanyMerch';
import {
  COUNTRIES, JOB_GENDERS, JOB_ROLES, MAX_JOB_PHOTOS, cityKey, cityLabel, countryName, countryOfCity, findCountry, jobPlace,
} from '../../jobs';

type Form = {
  title: string;
  description: string;
  roles: string[];
  genders: string[];
  country: string;
  city: string;
  /** The city is typed by hand (not in the list). */
  otherCity: boolean;
  contactEmail: string;
  contactPhone: string;
  photos: { id: Id<'_storage'>; url: string }[];
};

/** Country + city for the form: from the saved ad, or guessed from the company's city (Greece when unknown). */
function place(country: string | undefined, city: string) {
  const c = findCountry(country);
  if (c) return { country: c.code, city, otherCity: !!city && !c.cities.some((e) => cityKey(e) === city) };
  const hit = countryOfCity(city);
  if (hit) return { country: hit.country, city: hit.city, otherCity: false };
  return { country: 'GR', city, otherCity: !!city };
}

function Chips({ options, value, onChange, label }: { options: readonly string[]; value: string[]; onChange: (v: string[]) => void; label: (o: string) => string }) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <TouchableOpacity
            key={o}
            style={[styles.chip, on && styles.chipOn]}
            onPress={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
          >
            <Text style={[styles.chipText, on && { color: theme.colors.redLight }]}>{label(o)}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** A full-screen list to pick one value from (country, city). */
function PickerModal({ visible, title, items, onPick, onClose }: {
  visible: boolean;
  title: string;
  items: { key: string; label: string }[];
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modal}>
        <View style={styles.modalHead}>
          <Text style={styles.modalTitle}>{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}><Ionicons name="close" size={24} color={theme.colors.bone} /></TouchableOpacity>
        </View>
        <FlatList
          data={items}
          keyExtractor={(i) => i.key}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.modalRow} onPress={() => { onPick(item.key); onClose(); }}>
              <Text style={styles.modalRowText}>{item.label}</Text>
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  );
}

const OTHER = '__other';

export default function CompanyJobs({ onBack }: { onBack: () => void }) {
  const { t, language } = useTranslation();
  const data = useCompanyQuery(api.jobs.mine, {});
  const create = useCompanyMutation(api.jobs.create);
  const update = useCompanyMutation(api.jobs.update);
  const setStatus = useCompanyMutation(api.jobs.setStatus);
  const remove = useCompanyMutation(api.jobs.remove);
  const generateUploadUrl = useCompanyMutation(api.companies.generateUploadUrl);
  const [form, setForm] = useState<Form | null>(null);
  const [editing, setEditing] = useState<Id<'jobPosts'> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [picker, setPicker] = useState<'country' | 'city' | null>(null);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const startNew = () => {
    setEditing(null);
    setForm({
      title: '', description: '', roles: [], genders: [],
      ...place(undefined, data?.defaults.city ?? ''),
      contactEmail: data?.defaults.contactEmail ?? '',
      contactPhone: data?.defaults.contactPhone ?? '',
      photos: [],
    });
  };

  const startEdit = (p: NonNullable<typeof data>['posts'][number]) => {
    setEditing(p._id);
    setForm({
      title: p.title,
      description: p.description,
      roles: p.roles,
      genders: p.genders,
      ...place(p.country, p.city),
      contactEmail: p.contactEmail ?? '',
      contactPhone: p.contactPhone ?? '',
      photos: (p.photoIds ?? []).map((id, i) => ({ id, url: p.photos?.[i] ?? '' })),
    });
  };

  const close = () => { setForm(null); setEditing(null); };

  const save = async () => {
    if (!form || busy) return;
    setBusy('save');
    const { otherCity: _o, photos, ...rest } = form;
    const args = { ...rest, photoIds: photos.map((p) => p.id) };
    try {
      if (editing) await update({ postId: editing, ...args });
      else await create(args);
      Alert.alert(editing ? t('cx.jobs.saved') : t('cx.jobs.published'));
      close();
    } catch (e) {
      Alert.alert(t('error'), errMsg(e, t('cx.jobs.failed')));
    } finally {
      setBusy(null);
    }
  };

  const addPhotos = async () => {
    if (!form || form.photos.length >= MAX_JOB_PHOTOS) return;
    const { status: perm } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm !== 'granted') return;
    const room = MAX_JOB_PHOTOS - form.photos.length;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsMultipleSelection: true, selectionLimit: room });
    if (result.canceled) return;
    setUploading(true);
    try {
      for (const asset of result.assets.slice(0, room)) {
        const uploadUrl = await generateUploadUrl({});
        const blob = await (await fetch(asset.uri)).blob();
        const res = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': asset.mimeType || 'image/jpeg' }, body: blob });
        if (!res.ok) throw new Error('upload');
        const { storageId } = (await res.json()) as { storageId: Id<'_storage'> };
        setForm((f) => (f && f.photos.length < MAX_JOB_PHOTOS ? { ...f, photos: [...f.photos, { id: storageId, url: asset.uri }] } : f));
      }
    } catch {
      Alert.alert(t('error'), t('cx.jobs.photo_failed'));
    } finally {
      setUploading(false);
    }
  };

  const toggle = async (id: Id<'jobPosts'>, status: 'open' | 'closed') => {
    setBusy(id);
    try {
      await setStatus({ postId: id, status });
    } catch (e) {
      Alert.alert(t('error'), errMsg(e, t('cx.jobs.failed')));
    } finally {
      setBusy(null);
    }
  };

  const del = (id: Id<'jobPosts'>) => {
    Alert.alert(t('cx.jobs.delete'), t('cx.jobs.delete_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('cx.jobs.delete'),
        style: 'destructive',
        onPress: async () => {
          setBusy(id);
          try {
            await remove({ postId: id });
          } catch (e) {
            Alert.alert(t('error'), errMsg(e, t('cx.jobs.failed')));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  // Countries of the site's languages first (list order), the rest by name
  const countryItems = useMemo(() => {
    const firstOther = COUNTRIES.findIndex((c) => c.code === 'CY');
    const rest = COUNTRIES.slice(firstOther).sort((a, b) => countryName(a.code, language).localeCompare(countryName(b.code, language)));
    return [...COUNTRIES.slice(0, firstOther), ...rest].map((c) => ({ key: c.code, label: countryName(c.code, language) }));
  }, [language]);
  const cityItems = useMemo(() => {
    const c = findCountry(form?.country);
    return [
      ...(c?.cities ?? []).map((e) => ({ key: cityKey(e), label: cityLabel(cityKey(e), c?.code, language) })),
      { key: OTHER, label: t('cx.jobs.f_city_other') },
    ];
  }, [form?.country, language, t]);

  const fmt = (ms: number) => new Date(ms).toLocaleDateString(language === 'el' ? 'el-GR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={form ? close : onBack}>
          <Ionicons name={form ? 'close' : 'arrow-back'} size={20} color={theme.colors.bone} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{form ? (editing ? t('cx.jobs.edit') : t('cx.jobs.new')) : t('cx.jobs.title')}</Text>
        {!form && (
          <TouchableOpacity style={styles.addBtn} onPress={startNew} disabled={data === undefined}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addText}>{t('cx.jobs.new')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
        {form ? (
          <View style={{ gap: 18 }}>
            <View>
              <Text style={styles.label}>{t('cx.jobs.f_title')}</Text>
              <TextInput style={styles.input} value={form.title} maxLength={90} placeholder={t('cx.jobs.f_title_ph')} placeholderTextColor={theme.colors.textMuted} onChangeText={(v) => set('title', v)} />
            </View>

            <View>
              <Text style={styles.label}>{t('cx.jobs.f_roles')}</Text>
              <Chips options={JOB_ROLES} value={form.roles} onChange={(v) => set('roles', v)} label={(o) => t(`jobs.role.${o}`)} />
            </View>

            <View>
              <Text style={styles.label}>{t('cx.jobs.f_genders')}</Text>
              <Text style={styles.hint}>{t('cx.jobs.f_genders_hint')}</Text>
              <Chips options={JOB_GENDERS} value={form.genders} onChange={(v) => set('genders', v)} label={(o) => t(`jobs.gender.${o}`)} />
            </View>

            <View>
              <Text style={styles.label}>{t('cx.jobs.f_desc')}</Text>
              <TextInput
                style={[styles.input, { minHeight: 160, textAlignVertical: 'top' }]}
                value={form.description}
                multiline
                placeholder={t('cx.jobs.f_desc_ph')}
                placeholderTextColor={theme.colors.textMuted}
                onChangeText={(v) => set('description', v)}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{t('cx.jobs.f_country')}</Text>
                <TouchableOpacity style={styles.select} onPress={() => setPicker('country')}>
                  <Text style={styles.selectText} numberOfLines={1}>{countryName(form.country, language)}</Text>
                  <Ionicons name="chevron-down" size={16} color={theme.colors.textMuted} />
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{t('cx.jobs.f_city')}</Text>
                <TouchableOpacity style={styles.select} onPress={() => setPicker('city')}>
                  <Text style={[styles.selectText, !form.city && !form.otherCity && { color: theme.colors.textMuted }]} numberOfLines={1}>
                    {form.otherCity ? t('cx.jobs.f_city_other') : form.city ? cityLabel(form.city, form.country, language) : t('cx.jobs.f_city_pick')}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={theme.colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
            {form.otherCity && (
              <TextInput style={styles.input} value={form.city} maxLength={60} placeholder={t('cx.jobs.f_city_other_ph')} placeholderTextColor={theme.colors.textMuted} onChangeText={(v) => set('city', v)} />
            )}

            <View>
              <Text style={styles.label}>{t('cx.jobs.f_photos')}</Text>
              <Text style={styles.hint}>{t('cx.jobs.f_photos_hint')}</Text>
              <View style={styles.photoRow}>
                {form.photos.map((p) => (
                  <View key={p.id} style={styles.photoWrap}>
                    {!!p.url && <Image source={{ uri: p.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
                    <TouchableOpacity style={styles.photoX} onPress={() => set('photos', form.photos.filter((x) => x.id !== p.id))} hitSlop={6}>
                      <Ionicons name="close" size={14} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
                {form.photos.length < MAX_JOB_PHOTOS && (
                  <TouchableOpacity style={[styles.photoWrap, styles.photoAdd]} onPress={addPhotos} disabled={uploading}>
                    {uploading ? <ActivityIndicator color={theme.colors.redLight} /> : <Ionicons name="image-outline" size={22} color={theme.colors.textMuted} />}
                    {!uploading && <Text style={styles.photoAddText}>{t('cx.jobs.add_photo')}</Text>}
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View>
              <Text style={styles.label}>{t('cx.jobs.f_email')}</Text>
              <TextInput style={styles.input} value={form.contactEmail} maxLength={120} autoCapitalize="none" keyboardType="email-address" onChangeText={(v) => set('contactEmail', v)} />
            </View>
            <View>
              <Text style={styles.label}>{t('cx.jobs.f_phone')}</Text>
              <TextInput style={styles.input} value={form.contactPhone} maxLength={30} keyboardType="phone-pad" onChangeText={(v) => set('contactPhone', v)} />
              <Text style={[styles.hint, { marginTop: 6 }]}>{t('cx.jobs.f_contact_hint')}</Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={close}>
                <Text style={styles.btnGhostText}>{t('cx.jobs.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { flex: 2 }]} onPress={save} disabled={!!busy || uploading}>
                {busy === 'save' ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{editing ? t('cx.jobs.save') : t('cx.jobs.publish')}</Text>}
              </TouchableOpacity>
            </View>

            <PickerModal
              visible={picker === 'country'}
              title={t('cx.jobs.f_country')}
              items={countryItems}
              onPick={(code) => setForm((f) => (f ? { ...f, country: code, city: '', otherCity: false } : f))}
              onClose={() => setPicker(null)}
            />
            <PickerModal
              visible={picker === 'city'}
              title={t('cx.jobs.f_city')}
              items={cityItems}
              onPick={(key) => setForm((f) => (f ? (key === OTHER ? { ...f, city: f.otherCity ? f.city : '', otherCity: true } : { ...f, city: key, otherCity: false }) : f))}
              onClose={() => setPicker(null)}
            />
          </View>
        ) : (
          <>
            <Text style={styles.subtitle}>{t('cx.jobs.subtitle')}</Text>
            {data === undefined ? (
              <ActivityIndicator color={theme.colors.redPrimary} style={{ marginTop: 30 }} />
            ) : data.posts.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="briefcase-outline" size={34} color={theme.colors.textMuted} />
                <Text style={styles.emptyText}>{t('cx.jobs.empty')}</Text>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {data.posts.map((p) => {
                  const open = p.status === 'open';
                  return (
                    <View key={p._id} style={[styles.card, !open && { opacity: 0.7 }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                        <Text style={styles.cardTitle}>{p.title}</Text>
                        <Text style={[styles.pill, { color: open ? theme.colors.success : theme.colors.textMuted, borderColor: open ? theme.colors.success : theme.colors.textMuted }]}>
                          {open ? t('cx.jobs.open') : t('cx.jobs.closed')}
                        </Text>
                      </View>
                      <Text style={styles.cardMeta}>
                        {[p.roles.map((r) => t(`jobs.role.${r}`)).join(', '), jobPlace({ city: p.city, country: p.country ?? '' }, language), fmt(p.createdAt)].filter(Boolean).join(' · ')}
                      </Text>
                      <View style={styles.cardActions}>
                        <TouchableOpacity style={styles.smallBtn} onPress={() => startEdit(p)}>
                          <Ionicons name="pencil" size={14} color={theme.colors.bone} />
                          <Text style={styles.smallBtnText}>{t('cx.jobs.edit_btn')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.smallBtn} onPress={() => toggle(p._id, open ? 'closed' : 'open')} disabled={busy === p._id}>
                          {busy === p._id ? <ActivityIndicator size="small" color={theme.colors.bone} /> : <Ionicons name={open ? 'lock-closed-outline' : 'lock-open-outline'} size={14} color={theme.colors.bone} />}
                          <Text style={styles.smallBtnText}>{open ? t('cx.jobs.close') : t('cx.jobs.reopen')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.smallBtn} onPress={() => del(p._id)} disabled={busy === p._id} accessibilityLabel={t('cx.jobs.delete')}>
                          <Ionicons name="trash-outline" size={14} color={theme.colors.redLight} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 56, paddingHorizontal: 20, paddingBottom: 8 },
  backBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.glass },
  headerTitle: { fontSize: 22, fontFamily: theme.fonts.display, color: theme.colors.bone, flex: 1 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, height: 36, borderRadius: 10, backgroundColor: theme.colors.redPrimary },
  addText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  subtitle: { color: theme.colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 16 },
  label: { color: theme.colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  hint: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 17, marginBottom: 8 },
  input: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: theme.colors.textPrimary, fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border },
  chipOn: { borderColor: theme.colors.redPrimary, backgroundColor: theme.colors.redSubtle },
  chipText: { color: theme.colors.textSecondary, fontSize: 14, fontWeight: '600' },
  select: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, paddingHorizontal: 14, height: 48 },
  selectText: { flex: 1, color: theme.colors.textPrimary, fontSize: 15 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoWrap: { width: 76, height: 76, borderRadius: 10, overflow: 'hidden', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  photoAdd: { alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', gap: 2 },
  photoAddText: { color: theme.colors.textMuted, fontSize: 10, textAlign: 'center' },
  photoX: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  btn: { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.redPrimary },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnGhost: { backgroundColor: theme.colors.glass, borderWidth: 1, borderColor: theme.colors.glassBorder },
  btnGhostText: { color: theme.colors.bone, fontWeight: '600', fontSize: 15 },
  empty: { alignItems: 'center', gap: 10, padding: 28, borderRadius: 14, backgroundColor: theme.colors.bgCard, borderWidth: 1, borderColor: theme.colors.border },
  emptyText: { color: theme.colors.textSecondary, fontSize: 14, textAlign: 'center' },
  card: { padding: 14, gap: 6, borderRadius: 12, backgroundColor: theme.colors.bgCard, borderWidth: 1, borderColor: theme.colors.border },
  cardTitle: { flex: 1, color: theme.colors.bone, fontSize: 16, fontWeight: '700' },
  cardMeta: { color: theme.colors.textMuted, fontSize: 12 },
  pill: { fontSize: 11, fontWeight: '700', borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, height: 34, borderRadius: 9, backgroundColor: theme.colors.glass, borderWidth: 1, borderColor: theme.colors.glassBorder },
  smallBtnText: { color: theme.colors.bone, fontSize: 12, fontWeight: '600' },
  modal: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  modalTitle: { fontFamily: theme.fonts.display, fontSize: 20, color: theme.colors.bone },
  modalRow: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  modalRowText: { color: theme.colors.textPrimary, fontSize: 16 },
});
