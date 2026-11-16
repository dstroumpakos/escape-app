/**
 * Merch for the escape room: orders to hand over or ship, the items for sale,
 * and the Premium discount / pickup note. Mirrors the website's /company/merch
 * page (same Convex functions in convex/merch.ts).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Image, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCompanyMutation, useCompanyQuery } from '../../companySession';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { SellerOrderView } from '../../../convex/merch';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';
import { euro } from '../../merchCart';
import { STATUS_COLORS } from '../../components/shop';

type Tab = 'orders' | 'items' | 'settings';
type Filter = 'open' | 'pickup' | 'shipping' | 'all';

interface Props {
  companyId: string;
  onBack: () => void;
  onEditItem: (productId?: string) => void;
  onNavigatePayments: () => void;
}

export function errMsg(err: unknown, fallback: string) {
  const data = (err as any)?.data;
  if (typeof data === 'string' && data) return data;
  const msg = err instanceof Error ? err.message : '';
  const clean = msg.replace(/^\[CONVEX[^\]]*\]\s*/, '').replace(/^.*Uncaught (Convex)?Error:\s*/, '').split('\n')[0];
  return clean || fallback;
}

function StatusPill({ status }: { status: string }) {
  const { t } = useTranslation();
  const c = STATUS_COLORS[status] ?? theme.colors.textSecondary;
  return <Text style={[styles.pill, { color: c, borderColor: c }]}>{t(`shop.status_${status}`)}</Text>;
}

function OrderCard({ o, companyId }: { o: SellerOrderView; companyId: Id<'companies'> }) {
  const { t, language } = useTranslation();
  const update = useCompanyMutation(api.merch.companyUpdateOrder);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [tracking, setTracking] = useState(o.trackingCode ?? '');
  const [trackingUrl, setTrackingUrl] = useState(o.trackingUrl ?? '');
  const [note, setNote] = useState(o.sellerNote ?? '');
  const units = o.items.reduce((s, i) => s + i.quantity, 0);
  const when = (ts: number) =>
    new Date(ts).toLocaleString(language === 'el' ? 'el-GR' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const run = async (status: SellerOrderView['status']) => {
    setBusy(status);
    try {
      await update({ companyId, orderId: o._id as Id<'merchOrders'>, status, trackingCode: tracking, trackingUrl, sellerNote: note });
    } catch (e) {
      Alert.alert(t('error'), errMsg(e, t('cmerch.failed')));
    } finally {
      setBusy(null);
    }
  };
  const act = (status: SellerOrderView['status']) => {
    if (status === 'cancelled' || status === 'refunded') {
      Alert.alert(t(`cmerch.action_${status}`), t(`cmerch.confirm_${status}`), [
        { text: t('cancel'), style: 'cancel' },
        { text: t(`cmerch.action_${status}`), style: 'destructive', onPress: () => run(status) },
      ]);
    } else run(status);
  };

  return (
    <View style={styles.card}>
      <TouchableOpacity onPress={() => setOpen((x) => !x)} style={{ flexDirection: 'row', gap: 12 }} activeOpacity={0.8}>
        <View style={styles.orderIcon}>
          <Ionicons name={o.delivery === 'pickup' ? 'storefront-outline' : 'cube-outline'} size={20} color={theme.colors.redLight} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={styles.rowWrap}>
            <Text style={styles.code}>{o.orderCode}</Text>
            <StatusPill status={o.status} />
          </View>
          <Text style={styles.muted} numberOfLines={1}>
            {o.buyer.name} · {t('cmerch.items', { count: units })} · {euro(o.totalCents)}
          </Text>
          {o.booking && (
            <Text style={styles.muted}>
              {t('cmerch.atGame', { date: o.booking.date, time: o.booking.time, room: o.booking.roomTitle })}
              {o.booking.status === 'cancelled' ? ` · ${t('cmerch.gameCancelled')}` : ''}
            </Text>
          )}
          {o.payment === 'at_pickup' && !o.paidAt && (
            <Text style={[styles.muted, { color: theme.colors.warning }]}>{t('cmerch.collect', { amount: euro(o.totalCents) })}</Text>
          )}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textMuted} />
      </TouchableOpacity>

      {open && (
        <View style={{ marginTop: 14, gap: 10 }}>
          {o.items.map((i, k) => (
            <View key={k} style={styles.itemRow}>
              {i.image ? <Image source={{ uri: i.image }} style={styles.thumb} /> : <View style={styles.thumb} />}
              <View style={{ flex: 1 }}>
                <Text style={styles.text}>
                  {i.quantity}× {i.title}
                </Text>
                <Text style={styles.muted}>{i.variantLabel}</Text>
              </View>
              <Text style={styles.text}>{i.unitPriceCents ? euro(i.unitPriceCents * i.quantity) : '€0'}</Text>
            </View>
          ))}
          {o.discountCents > 0 && <Text style={styles.muted}>{t('shop.premiumDiscount')}: −{euro(o.discountCents)}</Text>}
          {o.delivery === 'shipping' && <Text style={styles.muted}>{t('shop.shippingCost')}: {o.shippingCents ? euro(o.shippingCents) : t('shop.free')}</Text>}
          <Text style={styles.text}>
            {t('shop.total')}: {euro(o.totalCents)}
          </Text>
          <Text style={styles.muted}>
            {o.paidAt ? t('cmerch.paidOn', { date: when(o.paidAt) }) : o.payment === 'at_pickup' ? t('cmerch.paysAtPickup') : t('cmerch.notPaid')}
          </Text>

          <View style={styles.box}>
            <Text style={styles.text}>{o.buyer.name}</Text>
            {!!o.buyer.email && (
              <Text style={styles.link} onPress={() => Linking.openURL(`mailto:${o.buyer.email}`)}>
                {o.buyer.email}
              </Text>
            )}
            {!!o.buyer.phone && (
              <Text style={styles.link} onPress={() => Linking.openURL(`tel:${o.buyer.phone}`)}>
                {o.buyer.phone}
              </Text>
            )}
            {!!o.buyerNote && <Text style={[styles.muted, { fontStyle: 'italic' }]}>“{o.buyerNote}”</Text>}
          </View>
          {o.shippingAddress && (
            <View style={styles.box}>
              <Text style={styles.text}>{t('cmerch.shipTo')}</Text>
              <Text style={styles.muted}>
                {[o.shippingAddress.name, o.shippingAddress.line1, o.shippingAddress.line2, `${o.shippingAddress.postalCode} ${o.shippingAddress.city}`, o.shippingAddress.country, o.shippingAddress.phone]
                  .filter(Boolean)
                  .join('\n')}
              </Text>
            </View>
          )}

          {o.delivery === 'shipping' && (o.status === 'paid' || o.status === 'shipped') && (
            <>
              <TextInput style={styles.input} value={tracking} onChangeText={setTracking} placeholder={t('cmerch.trackingCode')} placeholderTextColor={theme.colors.textMuted} />
              <TextInput
                style={styles.input}
                value={trackingUrl}
                onChangeText={setTrackingUrl}
                placeholder={t('cmerch.trackingUrl')}
                placeholderTextColor={theme.colors.textMuted}
                autoCapitalize="none"
                keyboardType="url"
              />
            </>
          )}
          <TextInput
            style={[styles.input, { minHeight: 60 }]}
            value={note}
            onChangeText={setNote}
            placeholder={t('cmerch.notePlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
            multiline
          />
          <View style={styles.rowWrap}>
            {o.nextStatuses.map((s) => {
              const danger = s === 'cancelled' || s === 'refunded';
              return (
                <TouchableOpacity key={s} disabled={!!busy} onPress={() => act(s)} style={[styles.actionBtn, danger ? styles.actionDanger : styles.actionPrimary]}>
                  {busy === s ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.actionText, danger && { color: '#FF8A80' }]}>{t(`cmerch.action_${s}`)}</Text>}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity disabled={!!busy} onPress={() => run(o.status)} style={[styles.actionBtn, styles.actionGhost]}>
              {busy === o.status ? <ActivityIndicator size="small" color={theme.colors.bone} /> : <Text style={styles.actionText}>{t('save')}</Text>}
            </TouchableOpacity>
          </View>
          {o.payment === 'online' && (o.status === 'paid' || o.status === 'shipped' || o.status === 'collected') && (
            <Text style={styles.hint}>{t('cmerch.refundHint')}</Text>
          )}
        </View>
      )}
    </View>
  );
}

export default function CompanyMerch({ companyId, onBack, onEditItem, onNavigatePayments }: Props) {
  const { t } = useTranslation();
  const cId = companyId as Id<'companies'>;
  const summary = useCompanyQuery(api.merch.companyMerchSummary, { companyId: cId });
  const orders = useCompanyQuery(api.merch.companyOrders, { companyId: cId });
  const products = useCompanyQuery(api.merch.companyProducts, { companyId: cId });
  const settings = useCompanyQuery(api.merch.companyMerchSettings, { companyId: cId });
  const rooms = useCompanyQuery(api.companies.getRooms, { companyId: cId });
  const setStatus = useCompanyMutation(api.merch.setProductStatus);
  const deleteProduct = useCompanyMutation(api.merch.deleteProduct);
  const saveSettings = useCompanyMutation(api.merch.saveCompanyMerchSettings);

  const [tab, setTab] = useState<Tab>('orders');
  const [filter, setFilter] = useState<Filter>('open');
  const [discount, setDiscount] = useState(0);
  const [pickupNote, setPickupNote] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings && !loaded) {
      setDiscount(settings.premiumDiscountPercent);
      setPickupNote(settings.pickupNote);
      setLoaded(true);
    }
  }, [settings, loaded]);

  const list = useMemo(() => {
    const all = orders ?? [];
    const isOpen = (o: SellerOrderView) => o.status === 'reserved' || o.status === 'paid' || o.status === 'ready';
    if (filter === 'open') return all.filter(isOpen);
    if (filter === 'pickup') return all.filter((o) => isOpen(o) && o.delivery === 'pickup');
    if (filter === 'shipping') return all.filter((o) => isOpen(o) && o.delivery === 'shipping');
    return all;
  }, [orders, filter]);

  const roomTitle = (id?: string) => (rooms ?? []).find((r: any) => r._id === id)?.title ?? '';

  const confirmDelete = (productId: Id<'merchProducts'>) =>
    Alert.alert(t('cmerch.delete'), t('cmerch.confirmDelete'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('cmerch.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            const r = await deleteProduct({ companyId: cId, productId });
            Alert.alert(r.archived ? t('cmerch.archived') : t('cmerch.deleted'));
          } catch (e) {
            Alert.alert(t('error'), errMsg(e, t('cmerch.failed')));
          }
        },
      },
    ]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Ionicons name="arrow-back" size={20} color={theme.colors.bone} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('cmerch.title')}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => onEditItem()}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addText}>{t('cmerch.add')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.subtitle}>{t('cmerch.subtitle')}</Text>

        <View style={styles.statsRow}>
          {[
            { label: t('cmerch.openOrders'), value: summary?.openOrders },
            { label: t('cmerch.pickupsToday'), value: summary?.pickupsToday },
            { label: t('cmerch.monthSales'), value: summary ? euro(summary.monthSalesCents) : undefined },
          ].map((s) => (
            <View key={s.label} style={styles.stat}>
              <Text style={styles.statValue}>{s.value ?? '…'}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {settings && !settings.onlinePayment && (
          <TouchableOpacity style={styles.warnCard} onPress={onNavigatePayments}>
            <Ionicons name="wallet-outline" size={18} color="#FFD59A" />
            <Text style={styles.warnText}>{t('cmerch.noOnline')}</Text>
          </TouchableOpacity>
        )}

        <View style={styles.segment}>
          {(['orders', 'items', 'settings'] as const).map((x) => (
            <TouchableOpacity key={x} style={[styles.segmentItem, tab === x && styles.segmentActive]} onPress={() => setTab(x)}>
              <Text style={[styles.segmentText, tab === x && { color: '#fff' }]}>
                {t(`cmerch.tab_${x}`)}
                {x === 'orders' && summary?.openOrders ? ` (${summary.openOrders})` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'orders' && (
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, marginBottom: 12 }}>
              {(['open', 'pickup', 'shipping', 'all'] as const).map((f) => (
                <TouchableOpacity key={f} onPress={() => setFilter(f)} style={[styles.chip, filter === f && styles.chipActive]}>
                  <Text style={[styles.chipText, filter === f && { color: '#fff' }]}>{t(`cmerch.filter_${f}`)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {orders === undefined ? (
              <ActivityIndicator color={theme.colors.redPrimary} style={{ marginTop: 30 }} />
            ) : list.length === 0 ? (
              <Text style={[styles.muted, { textAlign: 'center', marginTop: 30 }]}>{t('cmerch.noOrders')}</Text>
            ) : (
              list.map((o) => <OrderCard key={o._id} o={o} companyId={cId} />)
            )}
          </View>
        )}

        {tab === 'items' &&
          (products === undefined ? (
            <ActivityIndicator color={theme.colors.redPrimary} style={{ marginTop: 30 }} />
          ) : products.length === 0 ? (
            <View style={[styles.card, { alignItems: 'center', gap: 10 }]}>
              <Ionicons name="shirt-outline" size={40} color={theme.colors.textMuted} />
              <Text style={styles.cardTitle}>{t('cmerch.emptyTitle')}</Text>
              <Text style={[styles.muted, { textAlign: 'center' }]}>{t('cmerch.emptyDesc')}</Text>
              <TouchableOpacity style={[styles.addBtn, { marginTop: 6 }]} onPress={() => onEditItem()}>
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.addText}>{t('cmerch.add')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            products.map((p) => {
              const stock = p.variants.some((x) => x.stock === undefined) ? null : p.variants.reduce((s, x) => s + (x.stock ?? 0), 0);
              return (
                <View key={p._id} style={[styles.card, { flexDirection: 'row', gap: 12 }]}>
                  {p.images[0] ? <Image source={{ uri: p.images[0] }} style={styles.productImg} /> : <View style={styles.productImg} />}
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <Text style={[styles.text, { flex: 1, fontWeight: '700' }]} numberOfLines={1}>
                        {p.title}
                      </Text>
                      <Text style={styles.text}>{euro(p.priceCents)}</Text>
                    </View>
                    <View style={styles.rowWrap}>
                      <Text style={[styles.tag, p.status === 'active' ? styles.tagLive : null]}>{t(`cmerch.status_${p.status}`)}</Text>
                      {p.hiddenByAdmin && <Text style={[styles.tag, { color: '#FF8A80' }]}>{t('cmerch.hiddenByAdmin')}</Text>}
                      {p.premiumOnly && <Text style={[styles.tag, { color: theme.colors.gold }]}>{t('shop.badgeMembers')}</Text>}
                      {p.unlockRoomId && <Text style={[styles.tag, { color: '#CE93D8' }]}>{t('cmerch.unlockFor', { room: roomTitle(p.unlockRoomId) })}</Text>}
                    </View>
                    <Text style={styles.muted}>
                      {t('cmerch.sold', { count: p.sold })} · {stock === null ? t('cmerch.stockUnlimited') : t('cmerch.stockLeft', { count: stock })}
                    </Text>
                    {p.hiddenByAdmin && !!p.adminNote && <Text style={[styles.muted, { color: '#FF8A80' }]}>{p.adminNote}</Text>}
                    <View style={[styles.rowWrap, { marginTop: 4 }]}>
                      <TouchableOpacity style={styles.smallBtn} onPress={() => onEditItem(p._id)}>
                        <Ionicons name="create-outline" size={15} color={theme.colors.bone} />
                        <Text style={styles.smallText}>{t('cmerch.edit')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.smallBtn}
                        onPress={() =>
                          setStatus({ companyId: cId, productId: p._id, status: p.status === 'active' ? 'draft' : 'active' }).catch((e) =>
                            Alert.alert(t('error'), errMsg(e, t('cmerch.failed')))
                          )
                        }
                      >
                        <Text style={styles.smallText}>{p.status === 'active' ? t('cmerch.unpublish') : t('cmerch.publish')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.smallBtn, { marginLeft: 'auto' }]} onPress={() => confirmDelete(p._id)}>
                        <Ionicons name="trash-outline" size={15} color="#FF8A80" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          ))}

        {tab === 'settings' && settings && (
          <>
            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <Ionicons name="diamond-outline" size={18} color={theme.colors.gold} />
                <Text style={styles.cardTitle}>{t('cmerch.premiumDiscount')}</Text>
              </View>
              <Text style={styles.hint}>{t('cmerch.premiumDiscountHint')}</Text>
              <View style={[styles.rowWrap, { marginTop: 12, gap: 16 }]}>
                <TouchableOpacity style={styles.stepBtn} onPress={() => setDiscount((d) => Math.max(0, d - 1))}>
                  <Ionicons name="remove" size={18} color={theme.colors.bone} />
                </TouchableOpacity>
                <Text style={styles.statValue}>{discount}%</Text>
                <TouchableOpacity style={styles.stepBtn} onPress={() => setDiscount((d) => Math.min(30, d + 1))}>
                  <Ionicons name="add" size={18} color={theme.colors.bone} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.label, { marginTop: 18 }]}>{t('cmerch.pickupNote')}</Text>
              <TextInput
                style={styles.input}
                value={pickupNote}
                onChangeText={setPickupNote}
                maxLength={200}
                placeholder={t('cmerch.pickupNotePlaceholder')}
                placeholderTextColor={theme.colors.textMuted}
              />
              <Text style={styles.hint}>{t('cmerch.pickupNoteHint')}</Text>

              <TouchableOpacity
                style={[styles.addBtn, { alignSelf: 'flex-start', marginTop: 16 }]}
                disabled={saving}
                onPress={async () => {
                  setSaving(true);
                  try {
                    await saveSettings({ companyId: cId, premiumDiscountPercent: discount, pickupNote });
                    Alert.alert(t('cmerch.saved'));
                  } catch (e) {
                    Alert.alert(t('error'), errMsg(e, t('cmerch.failed')));
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.addText}>{t('save')}</Text>}
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('cmerch.feesTitle')}</Text>
              <Text style={[styles.hint, { marginTop: 8 }]}>{settings.plan === 'unlimited' ? t('cmerch.feesUnlimited') : t('cmerch.feesPayg')}</Text>
              {settings.plan !== 'unlimited' && summary && (
                <Text style={styles.hint}>{t('cmerch.feesMonth', { fee: euro(summary.monthFeeCents), sales: euro(summary.monthSalesCents) })}</Text>
              )}
              <Text style={styles.hint}>{t('cmerch.sellerDuties')}</Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 56, paddingHorizontal: 20, paddingBottom: 8 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 22, fontFamily: theme.fonts.display, color: theme.colors.bone, flex: 1 },
  subtitle: { fontSize: 13, lineHeight: 19, color: theme.colors.textSecondary, marginHorizontal: 20, marginBottom: 16 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.colors.redPrimary,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: theme.radius.md,
  },
  addText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  statsRow: { flexDirection: 'row', gap: 10, marginHorizontal: 20, marginBottom: 16 },
  stat: {
    flex: 1, padding: 12, borderRadius: theme.radius.lg, backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  statValue: { fontSize: 20, fontWeight: '800', color: theme.colors.bone },
  statLabel: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },
  warnCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginHorizontal: 20, marginBottom: 16, padding: 14,
    borderRadius: theme.radius.lg, backgroundColor: 'rgba(255,167,38,0.1)', borderWidth: 1, borderColor: 'rgba(255,167,38,0.25)',
  },
  warnText: { fontSize: 13, lineHeight: 18, color: '#FFD59A', flex: 1 },
  segment: {
    flexDirection: 'row', backgroundColor: theme.colors.bgCardSolid, borderRadius: theme.radius.md,
    padding: 4, gap: 4, marginHorizontal: 20, marginBottom: 14,
  },
  segmentItem: { flex: 1, paddingVertical: 10, borderRadius: theme.radius.sm, alignItems: 'center' },
  segmentActive: { backgroundColor: theme.colors.redPrimary },
  segmentText: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: theme.radius.full, backgroundColor: theme.colors.glass, borderWidth: 1, borderColor: theme.colors.glassBorder },
  chipActive: { backgroundColor: theme.colors.redPrimary, borderColor: theme.colors.redLight },
  chipText: { fontSize: 13, color: theme.colors.textSecondary },
  card: {
    marginHorizontal: 20, marginBottom: 12, padding: 16, borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid, borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: theme.colors.bone },
  rowWrap: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  orderIcon: { width: 40, height: 40, borderRadius: theme.radius.md, backgroundColor: theme.colors.glass, alignItems: 'center', justifyContent: 'center' },
  code: { fontSize: 14, fontWeight: '700', color: theme.colors.bone },
  pill: { fontSize: 11, fontWeight: '700', borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  text: { fontSize: 14, color: theme.colors.bone },
  muted: { fontSize: 12, lineHeight: 17, color: theme.colors.textSecondary },
  link: { fontSize: 13, color: theme.colors.redLight },
  hint: { fontSize: 12, lineHeight: 17, color: theme.colors.textSecondary, marginTop: 6 },
  label: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 6 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 40, height: 40, borderRadius: theme.radius.sm, backgroundColor: theme.colors.glass },
  box: { padding: 12, borderRadius: theme.radius.md, backgroundColor: theme.colors.glass, gap: 3 },
  input: {
    backgroundColor: theme.colors.bgPrimary, borderWidth: 1, borderColor: theme.colors.glassBorder,
    borderRadius: theme.radius.md, paddingHorizontal: 14, paddingVertical: 11, color: theme.colors.bone, fontSize: 15,
  },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: theme.radius.md, minWidth: 70, alignItems: 'center' },
  actionPrimary: { backgroundColor: theme.colors.redPrimary },
  actionDanger: { borderWidth: 1, borderColor: 'rgba(255,82,82,0.4)' },
  actionGhost: { borderWidth: 1, borderColor: theme.colors.glassBorder },
  actionText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  productImg: { width: 72, height: 72, borderRadius: theme.radius.md, backgroundColor: theme.colors.glass },
  tag: { fontSize: 11, color: theme.colors.textSecondary, backgroundColor: theme.colors.glass, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
  tagLive: { color: theme.colors.success },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: theme.radius.sm, backgroundColor: theme.colors.glass },
  smallText: { fontSize: 12, color: theme.colors.bone },
  stepBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.glassBorder, alignItems: 'center', justifyContent: 'center' },
});

/** Dashboard card: shown once the company has merch orders to act on. */
export function MerchDashboardCard({ companyId, onOpen }: { companyId: string; onOpen: () => void }) {
  const { t } = useTranslation();
  const s = useCompanyQuery(api.merch.companyMerchSummary, { companyId: companyId as Id<'companies'> });
  if (!s || (s.openOrders === 0 && s.pickupsToday === 0)) return null;
  return (
    <TouchableOpacity style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]} onPress={onOpen} activeOpacity={0.85}>
      <View style={styles.orderIcon}>
        <Ionicons name="bag-handle-outline" size={20} color={theme.colors.redLight} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{t('cmerch.title')}</Text>
        <Text style={styles.muted}>
          {t('cmerch.dashLine', { open: s.openOrders, pickups: s.pickupsToday })}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </TouchableOpacity>
  );
}

/** Booking details: merch the player ordered to collect at this game. */
export function BookingMerchCard({ companyId, bookingId }: { companyId: string; bookingId: string }) {
  const { t } = useTranslation();
  const orders = useCompanyQuery(api.merch.bookingMerch, {
    companyId: companyId as Id<'companies'>,
    bookingId: bookingId as Id<'bookings'>,
  });
  if (!orders || orders.length === 0) return null;
  return (
    <View style={[styles.card, { borderColor: theme.colors.redPrimary }]}>
      <Text style={styles.cardTitle}>{t('cmerch.handOver')}</Text>
      {orders.map((o) => (
        <View key={o._id} style={{ marginTop: 8 }}>
          <Text style={styles.muted}>
            {o.orderCode} · {t(`shop.status_${o.status}`)} · {o.paid ? t('cmerch.paid') : t('cmerch.collect', { amount: euro(o.totalCents) })}
          </Text>
          {o.items.map((i, k) => (
            <Text key={k} style={styles.text}>
              {i.quantity}× {i.title} ({i.variantLabel})
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}
