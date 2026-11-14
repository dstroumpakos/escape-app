/**
 * Slots tab: open and close times for every room on one day.
 * Same rules as the website's Slots page (escape-web src/components/company/SlotBoard.tsx):
 *  - a date with its own timeSlots rows uses those; otherwise the room's
 *    defaultTimeSlots apply, all open;
 *  - available:false is closed, a booking makes it taken;
 *  - weekdays outside room.operatingDays are closed all day;
 *  - started times are closed, and a free time closes 1 hour before it starts
 *    unless the time before it is booked (slotClosedReason);
 *  - "extra" times are date-only times not in the weekly schedule.
 * Saving writes the date's list with setSlots; a list equal to the defaults is
 * saved as empty so the date follows the weekly schedule again.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal,
  ActivityIndicator, Animated, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { useCompanyQuery, useCompanySession, isSessionExpired } from '../../companySession';
import { convex } from '../../convex';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';
import { slotSortKey, slotClosedReason, slotStart, useNow } from '../../slotTime';

// ─── Helpers ──────────────────────────────────────────────

type Slot = { time: string; price: number; available: boolean; pricePerGroup?: { players: number; price: number }[] };
type SlotState = 'open' | 'closed' | 'booked' | 'past' | 'cutoff';

const DAY_MS = 24 * 60 * 60 * 1000;

export function localDateKey(d: Date = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(date: string, n: number) {
  const d = new Date(date + 'T12:00:00');
  d.setTime(d.getTime() + n * DAY_MS);
  return localDateKey(d);
}

const byTime = (a: { time: string }, b: { time: string }) => slotSortKey(a.time) - slotSortKey(b.time);

function effectiveSlots(room: any, custom: any[] | undefined | null): Slot[] {
  if (custom && custom.length > 0) {
    return custom
      .map((r) => ({ time: r.time, price: r.price, available: r.available, ...(r.pricePerGroup ? { pricePerGroup: r.pricePerGroup } : {}) }))
      .sort(byTime);
  }
  return ((room?.defaultTimeSlots || []) as { time: string; price: number }[])
    .filter((s) => s.time)
    .map((s) => ({ time: s.time, price: s.price, available: true }))
    .sort(byTime);
}

function isClosedWeekday(room: any, date: string) {
  const dow = new Date(date + 'T00:00:00').getDay();
  return Array.isArray(room?.operatingDays) && !room.operatingDays.includes(dow);
}

function toSave(next: Slot[], room: any): Slot[] {
  const defaults = ((room?.defaultTimeSlots || []) as { time: string; price: number }[]).filter((s) => s.time);
  const same =
    defaults.length > 0 &&
    defaults.length === next.length &&
    next.every((s) => {
      const d = defaults.find((x) => x.time === s.time);
      return d && s.available && !s.pricePerGroup && d.price === s.price;
    });
  return same ? [] : next;
}

const isSlotPast = (date: string, time: string, now: Date) =>
  /^\d{1,2}:\d{2}$/.test(time) && slotStart(date, time).getTime() <= now.getTime();

function errText(err: unknown, fallback: string) {
  const data = (err as any)?.data;
  if (typeof data === 'string' && data) return data;
  return fallback;
}

// ─── Toast (with undo) ────────────────────────────────────

type ToastMsg = { kind: 'success' | 'error'; message: string; undo?: () => void };

function useToast() {
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: ToastMsg) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(m);
    timer.current = setTimeout(() => setToast(null), m.undo ? 5000 : 3000);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { toast, show, hide: () => setToast(null) };
}

// ─── setSlots with an instant (optimistic) update ─────────

function useSetSlots() {
  const { token, onExpired } = useCompanySession();
  const mutate = useMutation(api.companies.setSlots).withOptimisticUpdate((store, args) => {
    store.setQuery(
      api.companies.getRoomSlots,
      { roomId: args.roomId, date: args.date },
      args.slots.map((s, i) => ({
        _id: `optimistic-${i}` as any,
        _creationTime: Date.now(),
        roomId: args.roomId,
        date: args.date,
        ...s,
      })) as any
    );
  });
  return useCallback(
    async (args: { roomId: Id<'rooms'>; date: string; slots: Slot[] }) => {
      try {
        return await mutate({ ...args, sessionToken: token ?? undefined });
      } catch (err) {
        if (isSessionExpired(err)) onExpired();
        throw err;
      }
    },
    [mutate, token, onExpired]
  );
}

// ─── Screen ───────────────────────────────────────────────

export default function CompanySlots({ companyId }: { companyId: string }) {
  const { t, language } = useTranslation();
  const navigation = useNavigation<any>();
  const now = useNow();
  const today = localDateKey(now);
  const locale = language === 'el' ? 'el-GR' : 'en-GB';
  const [date, setDate] = useState(today);
  const [stripStart, setStripStart] = useState(today);
  const [rangeOpen, setRangeOpen] = useState(false);
  const { toast, show, hide } = useToast();
  const stripRef = useRef<ScrollView>(null);

  const rooms = useCompanyQuery(api.companies.getRooms, { companyId: companyId as Id<'companies'> });
  const bookings = useCompanyQuery(api.companies.getBookingsByDate, { companyId: companyId as Id<'companies'>, date });

  const bookableRooms = useMemo(() => (rooms || []).filter((r: any) => !r.photosOnly && r.isActive !== false), [rooms]);
  const inactiveCount = (rooms || []).filter((r: any) => !r.photosOnly && r.isActive === false).length;
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(stripStart, i)), [stripStart]);

  useEffect(() => {
    stripRef.current?.scrollTo({ x: 0, animated: false });
  }, [stripStart]);

  const longDate = new Date(date + 'T12:00:00').toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t('slots.title')}</Text>
          <Text style={styles.headerSub}>{t('slots.subtitle')}</Text>
        </View>
        <TouchableOpacity
          style={[styles.headerBtn, bookableRooms.length === 0 && { opacity: 0.4 }]}
          disabled={bookableRooms.length === 0}
          onPress={() => setRangeOpen(true)}
          accessibilityLabel={t('slots.rangeButton')}
        >
          <Ionicons name="calendar-outline" size={20} color={theme.colors.bone} />
        </TouchableOpacity>
      </View>

      {/* Date strip */}
      <View style={styles.stripCard}>
        <View style={styles.stripRow}>
          <TouchableOpacity onPress={() => setStripStart(addDays(stripStart, -7))} style={styles.stripArrow} accessibilityLabel={t('slots.prevWeek')}>
            <Ionicons name="chevron-back" size={20} color={theme.colors.bone} />
          </TouchableOpacity>
          <ScrollView ref={stripRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {days.map((d) => {
              const dt = new Date(d + 'T12:00:00');
              const selected = d === date;
              const isToday = d === today;
              return (
                <TouchableOpacity
                  key={d}
                  onPress={() => setDate(d)}
                  style={[styles.dayChip, isToday && !selected && styles.dayChipToday, selected && styles.dayChipSelected]}
                >
                  <Text style={[styles.dayWeek, (selected || isToday) && { color: selected ? '#fff' : theme.colors.redLight }]}>
                    {isToday ? t('slots.todayShort') : dt.toLocaleDateString(locale, { weekday: 'short' })}
                  </Text>
                  <Text style={[styles.dayNum, selected && { color: '#fff' }]}>{dt.getDate()}</Text>
                  <Text style={[styles.dayMonth, selected && { color: 'rgba(255,255,255,0.8)' }]}>
                    {dt.toLocaleDateString(locale, { month: 'short' })}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity onPress={() => setStripStart(addDays(stripStart, 7))} style={styles.stripArrow} accessibilityLabel={t('slots.nextWeek')}>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.bone} />
          </TouchableOpacity>
        </View>
        <View style={styles.stripFooter}>
          <Text style={styles.longDate}>{longDate}</Text>
          {date !== today && (
            <TouchableOpacity
              style={styles.smallBtn}
              onPress={() => {
                setDate(today);
                setStripStart(today);
              }}
            >
              <Text style={styles.smallBtnText}>{t('slots.today')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140, gap: 12 }} keyboardShouldPersistTaps="handled">
        <View style={styles.legendRow}>
          <Ionicons name="information-circle-outline" size={14} color={theme.colors.textSecondary} />
          <Text style={styles.legendText}>{t('slots.hint')}</Text>
        </View>
        <Legend />

        {rooms === undefined ? (
          <ActivityIndicator color={theme.colors.redPrimary} style={{ marginTop: 40 }} />
        ) : bookableRooms.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="key-outline" size={40} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>{t('slots.noRoomsTitle')}</Text>
            <Text style={styles.emptyDesc}>{t('slots.noRoomsDesc')}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate('CompanyRoomEditor', {})}>
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>{t('slots.addRoom')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {bookableRooms.map((room: any) => (
              <RoomSlotRow key={room._id} room={room} date={date} bookings={bookings} now={now} onToast={show} />
            ))}
            {inactiveCount > 0 && (
              <Text style={styles.legendText}>{t('slots.inactiveHidden', { count: inactiveCount })}</Text>
            )}
          </>
        )}
      </ScrollView>

      {toast && (
        <View style={[styles.toast, toast.kind === 'error' && styles.toastError]}>
          <Ionicons
            name={toast.kind === 'error' ? 'alert-circle' : 'checkmark-circle'}
            size={18}
            color={toast.kind === 'error' ? '#FF8A80' : theme.colors.success}
          />
          <Text style={styles.toastText} numberOfLines={2}>{toast.message}</Text>
          {toast.undo && (
            <TouchableOpacity
              onPress={() => {
                const undo = toast.undo!;
                hide();
                undo();
              }}
            >
              <Text style={styles.toastUndo}>{t('slots.undo')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {rangeOpen && (
        <RangeModal rooms={bookableRooms} initialDate={date} onClose={() => setRangeOpen(false)} onToast={show} />
      )}
    </View>
  );
}

function Legend() {
  const { t } = useTranslation();
  const items: { label: string; style: object }[] = [
    { label: t('slots.open'), style: { backgroundColor: '#34D399' } },
    { label: t('slots.closed'), style: { backgroundColor: 'rgba(255,255,255,0.3)' } },
    { label: t('slots.booked'), style: { backgroundColor: '#60A5FA' } },
    { label: t('slots.legendPast'), style: { borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.4)' } },
    { label: t('slots.legendExtra'), style: { borderWidth: 1, borderColor: 'rgba(251,191,36,0.8)' } },
  ];
  return (
    <View style={styles.legendWrap}>
      {items.map((i) => (
        <View key={i.label} style={styles.legendItem}>
          <View style={[styles.legendDot, i.style]} />
          <Text style={styles.legendText}>{i.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── One room, one day ────────────────────────────────────

function RoomSlotRow({
  room, date, bookings, now, onToast,
}: {
  room: any; date: string; bookings: any[] | undefined; now: Date; onToast: (m: ToastMsg) => void;
}) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const custom = useQuery(api.companies.getRoomSlots, { roomId: room._id, date });
  const setSlots = useSetSlots();
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const slots = useMemo(() => (custom === undefined ? null : effectiveSlots(room, custom)), [custom, room]);
  const booked = useMemo(() => {
    const m = new Map<string, any>();
    for (const b of bookings || []) {
      if (String(b.roomId) === String(room._id) && b.date === date && b.status !== 'cancelled') m.set(b.time, b);
    }
    return m;
  }, [bookings, room._id, date]);

  const weekdayClosed = isClosedWeekday(room, date);
  const bookedTimes = useMemo(() => new Set(booked.keys()), [booked]);
  const allTimes = useMemo(() => new Set<string>([...(slots || []).map((s) => s.time), ...bookedTimes]), [slots, bookedTimes]);
  const defaultTimes = useMemo(
    () => new Set(((room?.defaultTimeSlots || []) as { time: string }[]).map((s) => s.time)),
    [room]
  );
  const isExtra = (time: string) => !defaultTimes.has(time);

  const stateOf = (s: Slot): SlotState => {
    if (booked.has(s.time)) return 'booked';
    if (isSlotPast(date, s.time, now)) return 'past';
    if (!s.available) return 'closed';
    return slotClosedReason(date, s.time, allTimes, bookedTimes, now) === 'cutoff' ? 'cutoff' : 'open';
  };

  const save = async (next: Slot[], undoTo: Slot[] | null, message: string) => {
    setBusy(true);
    try {
      await setSlots({ roomId: room._id, date, slots: toSave(next, room) });
      onToast({
        kind: 'success',
        message,
        undo: undoTo ? () => void save(undoTo, null, t('slots.restored')) : undefined,
      });
    } catch (err) {
      onToast({ kind: 'error', message: errText(err, t('slots.saveFailed')) });
    } finally {
      setBusy(false);
    }
  };

  const toggle = (time: string) => {
    if (!slots || busy) return;
    const current = slots.find((s) => s.time === time);
    if (!current) return;
    const st = stateOf(current);
    if (st === 'booked' || st === 'past' || st === 'cutoff') return;
    const next = slots.map((s) => (s.time === time ? { ...s, available: !s.available } : s));
    void save(next, slots, t(current.available ? 'slots.closedOne' : 'slots.openedOne', { time, room: room.title }));
  };

  const setAll = (open: boolean) => {
    if (!slots) return;
    const next = slots.map((s) => {
      const st = stateOf(s);
      return st === 'booked' || st === 'past' || st === 'cutoff' ? s : { ...s, available: open };
    });
    void save(next, slots, t(open ? 'slots.openedAll' : 'slots.closedAll', { room: room.title }));
  };

  const addSlot = (rawTime: string, price: number): string | null => {
    if (!slots) return null;
    const m = rawTime.trim().match(/^(\d{1,2})[:.](\d{2})$/);
    const time = m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return t('slots.extraBadTime');
    if (allTimes.has(time)) return t('slots.extraExists', { time });
    if (isSlotPast(date, time, now)) return t('slots.extraPast');
    if (!Number.isFinite(price) || price < 0) return t('slots.extraBadPrice');
    void save([...slots, { time, price, available: true }].sort(byTime), slots, t('slots.extraAdded', { time, room: room.title }));
    return null;
  };

  const removeSlot = (time: string) => {
    if (!slots || booked.has(time) || !isExtra(time)) return;
    void save(slots.filter((s) => s.time !== time), slots, t('slots.extraRemoved', { time, room: room.title }));
  };

  const suggestPrice = (time?: string) => {
    const list = slots || [];
    if (time && /^\d{1,2}:\d{2}$/.test(time) && list.length) {
      const prev = [...list].reverse().find((s) => slotSortKey(s.time) < slotSortKey(time));
      if (prev) return prev.price;
    }
    return list[list.length - 1]?.price ?? room?.price ?? 0;
  };

  const states = (slots || []).map(stateOf);
  const counts = {
    open: states.filter((s) => s === 'open').length,
    closed: states.filter((s) => s === 'closed').length,
    past: states.filter((s) => s === 'past' || s === 'cutoff').length,
    booked: booked.size,
  };
  const extraBooked = [...booked.values()].filter((b) => !slots?.some((s) => s.time === b.time)).sort(byTime);
  const canAdd = date >= localDateKey(now);

  return (
    <View style={styles.roomCard}>
      <View style={styles.roomHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.roomTitle} numberOfLines={1}>{room.title}</Text>
          {slots && !weekdayClosed && slots.length > 0 && (
            <Text style={styles.roomSummary}>
              {t('slots.summary', { open: counts.open, closed: counts.closed + counts.past, booked: counts.booked })}
            </Text>
          )}
        </View>
        {slots && !weekdayClosed && counts.open > 0 && (
          <TouchableOpacity style={styles.dayBtn} disabled={busy} onPress={() => setAll(false)}>
            <Ionicons name="lock-closed-outline" size={13} color={theme.colors.textSecondary} />
            <Text style={styles.dayBtnText}>{t('slots.closeDay')}</Text>
          </TouchableOpacity>
        )}
        {slots && !weekdayClosed && counts.closed > 0 && (
          <TouchableOpacity style={styles.dayBtn} disabled={busy} onPress={() => setAll(true)}>
            <Ionicons name="lock-open-outline" size={13} color={theme.colors.textSecondary} />
            <Text style={styles.dayBtnText}>{t('slots.openDay')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {slots === null ? (
        <ActivityIndicator color={theme.colors.redPrimary} style={{ alignSelf: 'flex-start', marginVertical: 12 }} />
      ) : weekdayClosed ? (
        <View style={styles.noteRow}>
          <Ionicons name="calendar-clear-outline" size={16} color={theme.colors.textSecondary} />
          <Text style={[styles.noteText, { flex: 1 }]}>{t('slots.weekdayClosed')}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('CompanyRoomEditor', { roomId: room._id })}>
            <Text style={styles.link}>{t('slots.changeSchedule')}</Text>
          </TouchableOpacity>
        </View>
      ) : slots.length === 0 && extraBooked.length === 0 && !adding ? (
        <View style={styles.noteRow}>
          <Ionicons name="time-outline" size={16} color={theme.colors.textSecondary} />
          <Text style={[styles.noteText, { flex: 1 }]}>{t('slots.noTimes')}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('CompanyRoomEditor', { roomId: room._id })}>
            <Text style={styles.link}>{t('slots.addTimes')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.chipGrid}>
          {slots.map((s) => (
            <SlotChip
              key={s.time}
              time={s.time}
              state={stateOf(s)}
              booking={booked.get(s.time)}
              extra={isExtra(s.time)}
              onToggle={() => toggle(s.time)}
              onRemove={() => removeSlot(s.time)}
            />
          ))}
          {extraBooked.map((b) => (
            <SlotChip key={`b-${b._id}`} time={b.time} state="booked" booking={b} extra={false} />
          ))}
          {canAdd && !adding && (
            <TouchableOpacity style={styles.addChip} disabled={busy} onPress={() => setAdding(true)}>
              <Ionicons name="add" size={14} color={theme.colors.textSecondary} />
              <Text style={styles.addChipText}>{t('slots.extraAdd')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {adding && (
        <AddSlotForm
          suggestPrice={suggestPrice}
          busy={busy}
          onAdd={(time, price) => {
            const err = addSlot(time, price);
            if (!err) setAdding(false);
            return err;
          }}
          onCancel={() => setAdding(false)}
        />
      )}
    </View>
  );
}

function SlotChip({
  time, state, booking, extra, onToggle, onRemove,
}: {
  time: string; state: SlotState; booking?: any; extra: boolean; onToggle?: () => void; onRemove?: () => void;
}) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const scale = useRef(new Animated.Value(1)).current;
  const pulse = () =>
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.92, duration: 70, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 110, useNativeDriver: true }),
    ]).start();

  let body: React.ReactNode;
  if (state === 'booked') {
    body = (
      <TouchableOpacity
        style={[styles.chip, styles.chipBooked]}
        onPress={() => booking?._id && navigation.navigate('CompanyBookingDetail', { bookingId: booking._id })}
      >
        <Text style={[styles.chipTime, { color: '#93C5FD' }]}>{time}</Text>
        <Text style={[styles.chipSub, { color: 'rgba(147,197,253,0.85)' }]} numberOfLines={1}>
          {booking?.source === 'external' ? t('slots.blocked') : booking?.playerName || t('slots.booked')}
        </Text>
      </TouchableOpacity>
    );
  } else if (state === 'past' || state === 'cutoff') {
    body = (
      <View style={[styles.chip, styles.chipPast]}>
        <Text style={[styles.chipTime, { color: theme.colors.textSecondary }]}>{time}</Text>
        <Text style={styles.chipSub}>{t('slots.past')}</Text>
      </View>
    );
  } else {
    const open = state === 'open';
    body = (
      <Animated.View style={{ transform: [{ scale }] }}>
        <TouchableOpacity
          style={[styles.chip, open ? styles.chipOpen : styles.chipClosed, open && extra && { borderColor: 'rgba(251,191,36,0.55)' }]}
          onPress={() => {
            pulse();
            onToggle?.();
          }}
          accessibilityRole="switch"
          accessibilityState={{ checked: open }}
          accessibilityLabel={t(open ? 'slots.ariaClose' : 'slots.ariaOpen', { time })}
        >
          <Text style={[styles.chipTime, open ? { color: '#6EE7B7' } : styles.chipTimeClosed]}>{time}</Text>
          <Text style={[styles.chipSub, open && { color: 'rgba(110,231,183,0.8)' }]}>
            {open ? t('slots.open') : t('slots.closed')}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  if (!extra) return <View>{body}</View>;
  return (
    <View>
      {body}
      <Text style={styles.extraMark}>+</Text>
      {onRemove && state !== 'booked' && (
        <TouchableOpacity
          style={styles.removeBtn}
          onPress={onRemove}
          hitSlop={8}
          accessibilityLabel={t('slots.extraRemove', { time })}
        >
          <Ionicons name="close" size={11} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function AddSlotForm({
  onAdd, onCancel, suggestPrice, busy,
}: {
  onAdd: (time: string, price: number) => string | null;
  onCancel: () => void;
  suggestPrice: (time?: string) => number;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const [time, setTime] = useState('');
  const [price, setPrice] = useState(String(suggestPrice()));
  const [priceTouched, setPriceTouched] = useState(false);
  const [error, setError] = useState('');

  return (
    <View style={styles.addForm}>
      <Text style={styles.addFormTitle}>{t('slots.extraAddTitle')}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.inputLabel}>{t('slots.extraTime')}</Text>
          <TextInput
            style={styles.input}
            value={time}
            autoFocus
            placeholder="22:30"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            onChangeText={(v) => {
              setTime(v);
              setError('');
              if (!priceTouched) setPrice(String(suggestPrice(v)));
            }}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.inputLabel}>{t('slots.extraPrice')} (€)</Text>
          <TextInput
            style={styles.input}
            value={price}
            keyboardType="decimal-pad"
            onChangeText={(v) => {
              setPrice(v);
              setPriceTouched(true);
              setError('');
            }}
          />
        </View>
      </View>
      {error ? <Text style={styles.formError}>{error}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <TouchableOpacity
          style={[styles.primaryBtn, { flex: 1 }, (!time || busy) && { opacity: 0.5 }]}
          disabled={!time || busy}
          onPress={() => {
            const err = onAdd(time, Number(price.replace(',', '.')));
            if (err) setError(err);
          }}
        >
          <Text style={styles.primaryBtnText}>{t('slots.extraSave')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ghostBtn} onPress={onCancel}>
          <Text style={styles.ghostBtnText}>{t('cancel')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Close / reopen several days ──────────────────────────

function RangeModal({
  rooms, initialDate, onClose, onToast,
}: {
  rooms: any[]; initialDate: string; onClose: () => void; onToast: (m: ToastMsg) => void;
}) {
  const { t, language } = useTranslation();
  const locale = language === 'el' ? 'el-GR' : 'en-GB';
  const setSlots = useSetSlots();
  const [from, setFrom] = useState(initialDate);
  const [to, setTo] = useState(initialDate);
  const [mode, setMode] = useState<'close' | 'open'>('close');
  const [selected, setSelected] = useState<string[]>(rooms.map((r) => r._id));
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  const dayCount = to >= from
    ? Math.round((new Date(to + 'T12:00:00').getTime() - new Date(from + 'T12:00:00').getTime()) / DAY_MS) + 1
    : 0;

  const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  const run = async () => {
    setError('');
    if (!dayCount) return setError(t('slotRange.badDates'));
    if (dayCount > 92) return setError(t('slotRange.tooLong'));
    if (selected.length === 0) return setError(t('slotRange.pickRoom'));
    setRunning(true);
    let changed = 0;
    let done = 0;
    const total = dayCount * selected.length;
    try {
      for (let i = 0; i < dayCount; i++) {
        const date = addDays(from, i);
        for (const roomId of selected) {
          const room = rooms.find((r) => r._id === roomId);
          done++;
          setProgress(t('slotRange.progress', { done, total }));
          if (!room || isClosedWeekday(room, date)) continue;
          const custom = await convex.query(api.companies.getRoomSlots, { roomId: room._id, date });
          const current = effectiveSlots(room, custom);
          const next = current.map((s) => ({ ...s, available: mode === 'open' }));
          const diff = current.filter((s, idx) => s.available !== next[idx].available).length;
          if (diff === 0) continue;
          await setSlots({ roomId: room._id, date, slots: toSave(next, room) });
          changed += diff;
        }
      }
      onToast({
        kind: 'success',
        message: t(mode === 'close' ? 'slotRange.doneClosed' : 'slotRange.doneOpened', { count: changed, days: dayCount }),
      });
      onClose();
    } catch (err) {
      setError(errText(err, t('slots.saveFailed')));
    } finally {
      setRunning(false);
      setProgress('');
    }
  };

  const Stepper = ({ label, value, onChange, min }: { label: string; value: string; onChange: (v: string) => void; min?: string }) => (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.stepper}>
        <TouchableOpacity
          style={styles.stepperBtn}
          disabled={!!min && value <= min}
          onPress={() => onChange(addDays(value, -1))}
        >
          <Ionicons name="remove" size={18} color={!!min && value <= min ? theme.colors.textMuted : theme.colors.bone} />
        </TouchableOpacity>
        <Text style={styles.stepperValue}>{fmt(value)}</Text>
        <TouchableOpacity style={styles.stepperBtn} onPress={() => onChange(addDays(value, 1))}>
          <Ionicons name="add" size={18} color={theme.colors.bone} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.stepperBtn} onPress={() => onChange(addDays(value, 7))}>
          <Text style={styles.stepperWeek}>+7</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={running ? undefined : onClose}>
      <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{t('slotRange.title')}</Text>
            <TouchableOpacity onPress={onClose} disabled={running} hitSlop={10}>
              <Ionicons name="close" size={22} color={theme.colors.bone} />
            </TouchableOpacity>
          </View>
          <ScrollView>
            <Text style={[styles.noteText, { marginBottom: 14 }]}>{t('slotRange.desc')}</Text>

            <View style={styles.segment}>
              {(['close', 'open'] as const).map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.segmentItem, mode === m && (m === 'close' ? styles.segClose : styles.segOpen)]}
                  onPress={() => setMode(m)}
                >
                  <Text style={[styles.segmentText, mode === m && { color: m === 'close' ? '#FCA5A5' : '#6EE7B7' }]}>
                    {t(m === 'close' ? 'slotRange.modeClose' : 'slotRange.modeOpen')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Stepper
              label={t('slotRange.from')}
              value={from}
              onChange={(v) => {
                setFrom(v);
                if (to < v) setTo(v);
              }}
            />
            <Stepper label={t('slotRange.to')} value={to} onChange={setTo} min={from} />

            {rooms.length > 1 && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.inputLabel}>{t('slotRange.rooms')}</Text>
                {rooms.map((r) => {
                  const on = selected.includes(r._id);
                  return (
                    <TouchableOpacity
                      key={r._id}
                      style={styles.checkRow}
                      onPress={() => setSelected((prev) => (on ? prev.filter((id) => id !== r._id) : [...prev, r._id]))}
                    >
                      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? theme.colors.redPrimary : theme.colors.textMuted} />
                      <Text style={styles.checkText} numberOfLines={1}>{r.title}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {mode === 'close' && <Text style={[styles.noteText, styles.keptNote]}>{t('slotRange.bookingsKept')}</Text>}
            {error ? <Text style={styles.formError}>{error}</Text> : null}

            <TouchableOpacity style={[styles.primaryBtn, { marginTop: 12 }, running && { opacity: 0.7 }]} disabled={running} onPress={run}>
              {running ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name={mode === 'close' ? 'lock-closed' : 'lock-open'} size={15} color="#fff" />}
              <Text style={styles.primaryBtnText}>
                {running ? progress : t(mode === 'close' ? 'slotRange.submitClose' : 'slotRange.submitOpen', { days: dayCount || 0 })}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 56, paddingHorizontal: 20, paddingBottom: 12 },
  headerTitle: { fontSize: 26, fontFamily: theme.fonts.display, color: theme.colors.bone },
  headerSub: { fontSize: 12, lineHeight: 17, color: theme.colors.textSecondary, marginTop: 2 },
  headerBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder, alignItems: 'center', justifyContent: 'center',
  },

  stripCard: {
    marginHorizontal: 20, marginBottom: 12, padding: 10, borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid, borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  stripRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stripArrow: { padding: 6 },
  dayChip: { width: 52, paddingVertical: 7, borderRadius: theme.radius.md, alignItems: 'center' },
  dayChipToday: { backgroundColor: theme.colors.redSubtle },
  dayChipSelected: { backgroundColor: theme.colors.redPrimary },
  dayWeek: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: theme.colors.textSecondary },
  dayNum: { fontSize: 18, fontWeight: '800', color: theme.colors.bone },
  dayMonth: { fontSize: 10, color: theme.colors.textMuted },
  stripFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingHorizontal: 4 },
  longDate: { fontSize: 14, fontWeight: '700', color: theme.colors.bone, textTransform: 'capitalize', flex: 1 },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: theme.radius.md, backgroundColor: 'rgba(255,255,255,0.06)' },
  smallBtnText: { fontSize: 12, fontWeight: '600', color: theme.colors.bone },

  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: theme.colors.textSecondary },

  roomCard: {
    padding: 14, borderRadius: theme.radius.lg, backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  roomHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  roomTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.bone },
  roomSummary: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },
  dayBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 7,
    borderRadius: theme.radius.md, backgroundColor: 'rgba(255,255,255,0.05)',
  },
  dayBtnText: { fontSize: 11, fontWeight: '600', color: theme.colors.textSecondary },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    width: 78, minHeight: 54, borderRadius: theme.radius.md, borderWidth: 1, paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  chipOpen: { backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.3)' },
  chipClosed: { backgroundColor: theme.colors.bgPrimary, borderColor: 'rgba(255,255,255,0.1)' },
  chipBooked: { backgroundColor: 'rgba(59,130,246,0.1)', borderColor: 'rgba(59,130,246,0.3)' },
  chipPast: { borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.12)', opacity: 0.55 },
  chipTime: { fontSize: 15, fontWeight: '800' },
  chipTimeClosed: { color: theme.colors.textSecondary, textDecorationLine: 'line-through' },
  chipSub: { fontSize: 10, color: theme.colors.textSecondary, marginTop: 1 },
  extraMark: { position: 'absolute', top: 2, left: 5, fontSize: 10, fontWeight: '800', color: '#FBBF24' },
  removeBtn: {
    position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.glassBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  addChip: {
    width: 78, minHeight: 54, borderRadius: theme.radius.md, borderWidth: 1, borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  addChipText: { fontSize: 10, fontWeight: '600', color: theme.colors.textSecondary },

  addForm: {
    marginTop: 12, padding: 12, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  addFormTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.bone, marginBottom: 10 },
  inputLabel: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 5 },
  input: {
    backgroundColor: theme.colors.bgPrimary, borderWidth: 1, borderColor: theme.colors.glassBorder,
    borderRadius: theme.radius.md, paddingHorizontal: 12, paddingVertical: 10, color: theme.colors.bone, fontSize: 15,
  },
  formError: { fontSize: 12, color: '#FF8A80', marginTop: 8 },

  noteRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: theme.radius.md,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  noteText: { fontSize: 13, lineHeight: 18, color: theme.colors.textSecondary },
  link: { fontSize: 12, fontWeight: '700', color: theme.colors.redLight },

  empty: {
    alignItems: 'center', padding: 28, gap: 8, borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid, borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.bone },
  emptyDesc: { fontSize: 13, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: 8 },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: theme.colors.redPrimary, paddingVertical: 12, paddingHorizontal: 18, borderRadius: theme.radius.full,
  },
  primaryBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  ghostBtn: {
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: theme.radius.full,
    borderWidth: 1, borderColor: theme.colors.glassBorder, alignItems: 'center', justifyContent: 'center',
  },
  ghostBtnText: { fontSize: 14, fontWeight: '600', color: theme.colors.bone },

  toast: {
    position: 'absolute', left: 16, right: 16, bottom: 100, flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: 'rgba(76,175,80,0.35)', ...theme.shadow.card,
  },
  toastError: { borderColor: 'rgba(244,67,54,0.4)' },
  toastText: { flex: 1, fontSize: 13, color: theme.colors.bone },
  toastUndo: { fontSize: 13, fontWeight: '800', color: theme.colors.redLight },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '88%', padding: 20, paddingBottom: 36, borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl,
    backgroundColor: theme.colors.bgCardSolid, borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.bone, flex: 1 },
  segment: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  segmentItem: {
    flex: 1, paddingVertical: 11, borderRadius: theme.radius.md, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center',
  },
  segClose: { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)' },
  segOpen: { backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.3)' },
  segmentText: { fontSize: 14, fontWeight: '600', color: theme.colors.textSecondary },
  stepper: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: theme.colors.glassBorder,
    borderRadius: theme.radius.md, backgroundColor: theme.colors.bgPrimary, padding: 4,
  },
  stepperBtn: { width: 36, height: 36, borderRadius: theme.radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  stepperValue: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '600', color: theme.colors.bone },
  stepperWeek: { fontSize: 12, fontWeight: '700', color: theme.colors.bone },
  checkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 6,
    borderRadius: theme.radius.md, backgroundColor: theme.colors.bgPrimary,
  },
  checkText: { flex: 1, fontSize: 14, color: theme.colors.bone },
  keptNote: { padding: 10, borderRadius: theme.radius.md, backgroundColor: 'rgba(0,0,0,0.35)', fontSize: 12 },
});
