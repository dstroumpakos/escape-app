/**
 * Bookings calendar: one column per room (per day in the multi-day views),
 * hours down the side, every time slot drawn as a block at its start time with
 * a height that matches the room's game duration. Same view as the website's
 * dashboard calendar (escape-web src/components/company/BookingCalendar.tsx).
 *
 *  green  = free slot (tap to book it, ✕ closes it)
 *  blue   = booked by a player (app or the company's website widget)
 *  navy   = external block or manual booking, source in brackets
 *  red    = closed slot (✓ opens it again)
 *  amber  = waiting for online payment
 *  grey   = start time has passed
 *
 * Slot rules come from the Hours screen's helpers, so both screens agree.
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueries } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { useCompanyQuery } from '../../companySession';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';
import { RootStackParamList } from '../../types';
import { slotSortKey, slotClosedReason, useNow } from '../../slotTime';
import {
  type Slot, type SlotState, localDateKey, addDays, effectiveSlots, isClosedWeekday, toSave, isSlotPast,
  errText, useSetSlots, stripTonos,
} from './CompanySlots';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export type CalView = 'day' | '2days' | '3days' | 'week';
const VIEWS: CalView[] = ['day', '2days', '3days', 'week'];
const VIEW_DAYS: Record<CalView, number> = { day: 1, '2days': 2, '3days': 3, week: 7 };

const HOUR_PX = 64;
const PX_PER_MIN = HOUR_PX / 60;
const AXIS_W = 38;
const ROOM_ROW_H = 30;
const DAY_ROW_H = 24;
const DEFAULT_RANGE: [number, number] = [17 * 60, 25 * 60]; // 17:00 to 01:00

function mondayOf(date: string) {
  const dow = new Date(date + 'T12:00:00').getDay();
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

function viewDays(view: CalView, anchor: string): string[] {
  const start = view === 'week' ? mondayOf(anchor) : anchor;
  return Array.from({ length: VIEW_DAYS[view] }, (_, i) => addDays(start, i));
}

/** "HH:MM" from a slotSortKey minute count (wraps past midnight). */
function fmtKey(key: number) {
  const m = ((key % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function roomDuration(room: any) {
  const d = Number(room?.duration);
  return Number.isFinite(d) && d > 0 ? d : 60;
}

function slotRange(time: string, room: any) {
  return `${time}-${fmtKey(slotSortKey(time) + roomDuration(room))}`;
}

type BookingKind = 'online' | 'external' | 'manual' | 'pending';

/** Who made a booking, which decides its colour. */
function bookingKind(b: any): BookingKind {
  if (b.status === 'pending_payment') return 'pending';
  if (b.source === 'external') {
    // The company's own website widget books real customers: same as the app.
    if (String(b.bookingCode || '').startsWith('WEB-') || b.externalSource === 'Website Widget') return 'online';
    return 'external';
  }
  return b.userId ? 'online' : 'manual';
}

function sourceLabel(b: any, t: (k: string) => string): string {
  if (bookingKind(b) === 'manual') return t('cal.manual');
  const raw = String(b.externalSource || '');
  const key = raw.toLowerCase().replace(/[\s_-]+/g, '');
  const map: Record<string, string> = {
    escapeall: 'addBooking.escapeAll',
    phone: 'addBooking.phone',
    walkin: 'addBooking.walkIn',
    privateevent: 'addBooking.privateEvent',
    websitewidget: 'cal.website',
  };
  if (map[key]) return t(map[key]);
  return raw || t('cal.external');
}

const C = {
  free: { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.5)', text: '#D1FAE5' },
  closed: { bg: 'rgba(239,68,68,0.2)', border: 'rgba(239,68,68,0.5)', text: '#FEE2E2' },
  past: { bg: 'rgba(255,255,255,0.02)', border: 'rgba(255,255,255,0.12)', text: theme.colors.textMuted },
  online: { bg: 'rgba(37,99,235,0.8)', border: 'rgba(96,165,250,0.75)', text: '#FFFFFF' },
  external: { bg: '#082F49', border: '#075985', text: '#F0F9FF' },
  manual: { bg: '#082F49', border: '#075985', text: '#F0F9FF' },
  pending: { bg: 'rgba(245,158,11,0.2)', border: 'rgba(251,191,36,0.65)', text: '#FEF3C7' },
};

// ─── Card: toolbar + grid ─────────────────────────────────

export default function BookingCalendar({
  companyId, rooms, defaultView = 'day',
}: {
  companyId: string; rooms: any[] | undefined; defaultView?: CalView;
}) {
  const { t, language } = useTranslation();
  const locale = language === 'el' ? 'el-GR' : 'en-GB';
  const today = localDateKey();
  const [anchor, setAnchor] = useState(today);
  const [view, setView] = useState<CalView>(defaultView);
  const days = useMemo(() => viewDays(view, anchor), [view, anchor]);
  const step = VIEW_DAYS[view];

  const first = new Date(days[0] + 'T12:00:00');
  const last = new Date(days[days.length - 1] + 'T12:00:00');
  const title =
    days.length === 1
      ? first.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })
      : `${first.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} – ${last.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}`;

  const viewLabel: Record<CalView, string> = {
    day: t('cal.viewDay'), '2days': t('cal.view2days'), '3days': t('cal.view3days'), week: t('cal.viewWeek'),
  };

  return (
    <View style={styles.card}>
      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.navBtn} onPress={() => setAnchor(addDays(anchor, -step))} accessibilityLabel={t('cal.prev')}>
          <Ionicons name="chevron-back" size={18} color={theme.colors.bone} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={() => setAnchor(addDays(anchor, step))} accessibilityLabel={t('cal.next')}>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.bone} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.todayBtn, days.includes(today) && anchor === today && { opacity: 0.4 }]}
          disabled={days.includes(today) && anchor === today}
          onPress={() => setAnchor(today)}
        >
          <Text style={styles.todayText}>{t('cal.today')}</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segment}>
        {VIEWS.map((v) => (
          <TouchableOpacity key={v} onPress={() => setView(v)} style={[styles.segBtn, view === v && styles.segBtnActive]}>
            <Text style={[styles.segText, view === v && styles.segTextActive]}>{viewLabel[v]}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {rooms === undefined ? (
        <ActivityIndicator color={theme.colors.redPrimary} style={{ marginVertical: 24 }} />
      ) : (
        <CalendarGrid companyId={companyId} rooms={rooms} days={days} locale={locale} />
      )}
      <Legend />
    </View>
  );
}

/** Bookings for up to 7 days (fixed number of hooks; unused ones skip). */
function useDaysBookings(companyId: string, days: string[]) {
  const out: (any[] | undefined)[] = [];
  for (let i = 0; i < 7; i++) {
    const d = days[i];
    // eslint-disable-next-line react-hooks/rules-of-hooks
    out.push(useCompanyQuery(api.companies.getBookingsByDate, d ? { companyId: companyId as Id<'companies'>, date: d } : 'skip'));
  }
  return out.slice(0, days.length);
}

function CalendarGrid({ companyId, rooms, days, locale }: { companyId: string; rooms: any[]; days: string[]; locale: string }) {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const now = useNow();
  const today = localDateKey(now);
  const [width, setWidth] = useState(0);
  const bookingsByDay = useDaysBookings(companyId, days);
  const live = (b: any) => b.status !== 'cancelled';

  // Active bookable rooms, plus any other room that still has bookings on screen.
  const shownRooms = useMemo(
    () =>
      rooms.filter(
        (r) =>
          (r.isActive !== false && !r.photosOnly) ||
          bookingsByDay.some((list) => (list || []).some((b) => String(b.roomId) === String(r._id) && live(b)))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rooms, JSON.stringify(bookingsByDay.map((l) => (l || []).map((b) => b._id)))]
  );

  const slotQueries = useMemo(() => {
    const q: Record<string, { query: typeof api.companies.getRoomSlots; args: { roomId: any; date: string } }> = {};
    for (const r of shownRooms) for (const d of days) q[`${r._id}|${d}`] = { query: api.companies.getRoomSlots, args: { roomId: r._id, date: d } };
    return q;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownRooms.map((r) => r._id).join(','), days.join(',')]);
  const slotRows = useQueries(slotQueries);
  const rowsFor = (r: any, d: string) => {
    const rows = slotRows[`${r._id}|${d}`];
    return rows instanceof Error ? [] : (rows as any[] | undefined);
  };

  const [rangeStart, rangeEnd] = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    const take = (time: string, room: any) => {
      if (!time || !/^\d{1,2}:\d{2}$/.test(time)) return;
      const k = slotSortKey(time);
      lo = Math.min(lo, k);
      hi = Math.max(hi, k + roomDuration(room));
    };
    for (const r of shownRooms) for (const d of days) for (const s of effectiveSlots(r, rowsFor(r, d))) take(s.time, r);
    for (const list of bookingsByDay) {
      for (const b of list || []) if (live(b)) take(b.time, shownRooms.find((r) => String(r._id) === String(b.roomId)));
    }
    if (!Number.isFinite(lo)) return DEFAULT_RANGE;
    return [Math.floor(lo / 60) * 60, Math.ceil(hi / 60) * 60] as [number, number];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotRows, bookingsByDay, shownRooms, days]);

  if (rooms.length === 0 || shownRooms.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="key-outline" size={34} color={theme.colors.textMuted} />
        <Text style={styles.emptyText}>{t('cal.noRooms')}</Text>
        <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.navigate('CompanyRoomEditor', {})}>
          <Ionicons name="add" size={16} color={theme.colors.bone} />
          <Text style={styles.emptyBtnText}>{t('cal.addRoom')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const height = (rangeEnd - rangeStart) * PX_PER_MIN;
  const hours: number[] = [];
  for (let k = rangeStart; k < rangeEnd; k += 60) hours.push(k);

  const multiDay = days.length > 1;
  const cols = shownRooms.length * days.length;
  const colMin = multiDay ? (days.length >= 7 ? 96 : 112) : 132;
  const colW = width > 0 ? Math.max(colMin, Math.floor((width - AXIS_W) / cols)) : colMin;
  const headH = ROOM_ROW_H + (multiDay ? DAY_ROW_H : 0);

  return (
    <View style={styles.grid} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {/* Hour axis stays put while the columns scroll sideways */}
      <View style={{ width: AXIS_W }}>
        <View style={{ height: headH, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }} />
        <View style={{ height, borderRightWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
          {hours.map((k, i) => (
            <Text key={k} style={[styles.hour, { top: (k - rangeStart) * PX_PER_MIN + (i === 0 ? 2 : -7) }]}>
              {fmtKey(k).slice(0, 2)}
            </Text>
          ))}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} key={days.join(',')}>
        <View>
          {/* Header: day labels (multi-day) and room names */}
          {multiDay && (
            <View style={{ flexDirection: 'row', height: DAY_ROW_H }}>
              {days.map((d, di) => {
                const dt = new Date(d + 'T12:00:00');
                const isToday = d === today;
                return (
                  <View
                    key={d}
                    style={[
                      styles.dayHead,
                      { width: colW * shownRooms.length },
                      di > 0 && styles.dayEdge,
                      isToday && { backgroundColor: 'rgba(212,20,31,0.2)' },
                    ]}
                  >
                    <Text style={[styles.dayHeadText, isToday && { color: theme.colors.bone }]} numberOfLines={1}>
                      {isToday ? `${t('cal.today')} · ` : ''}
                      {stripTonos(dt.toLocaleDateString(locale, { weekday: 'short' }))} {dt.getDate()}/{dt.getMonth() + 1}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
          <View style={{ flexDirection: 'row', height: ROOM_ROW_H, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
            {days.map((d, di) =>
              shownRooms.map((r, ri) => (
                <View key={`${d}|${r._id}`} style={[styles.roomHead, { width: colW }, ri === 0 && di > 0 ? styles.dayEdge : ri > 0 ? styles.colEdge : null]}>
                  <Text style={[styles.roomHeadText, r.isActive === false && { color: theme.colors.textMuted }]} numberOfLines={1}>
                    {r.title}
                  </Text>
                </View>
              ))
            )}
          </View>

          {/* Body: one column per room and day */}
          <View style={{ flexDirection: 'row' }}>
            {days.map((d, di) =>
              shownRooms.map((r, ri) => (
                <RoomDayColumn
                  key={`${d}|${r._id}`}
                  companyId={companyId}
                  room={r}
                  date={d}
                  custom={rowsFor(r, d)}
                  bookings={bookingsByDay[di]}
                  now={now}
                  rangeStart={rangeStart}
                  hours={hours}
                  width={colW}
                  height={height}
                  edge={ri === 0 && di > 0 ? 'day' : ri > 0 ? 'col' : null}
                />
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── One room, one day ────────────────────────────────────

function RoomDayColumn({
  companyId, room, date, custom, bookings, now, rangeStart, hours, width, height, edge,
}: {
  companyId: string; room: any; date: string; custom: any[] | undefined; bookings: any[] | undefined; now: Date;
  rangeStart: number; hours: number[]; width: number; height: number; edge: 'day' | 'col' | null;
}) {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const setSlots = useSetSlots();
  const [busy, setBusy] = useState(false);
  const duration = roomDuration(room);

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

  const stateOf = (s: Slot): SlotState => {
    if (booked.has(s.time)) return 'booked';
    if (isSlotPast(date, s.time, now)) return 'past';
    if (!s.available) return 'closed';
    return slotClosedReason(date, s.time, allTimes, bookedTimes, now) === 'cutoff' ? 'cutoff' : 'open';
  };

  const toggle = async (time: string) => {
    if (!slots || busy) return;
    const current = slots.find((s) => s.time === time);
    if (!current) return;
    const st = stateOf(current);
    if (st === 'booked' || st === 'past' || st === 'cutoff') return;
    const next = slots.map((s) => (s.time === time ? { ...s, available: !s.available } : s));
    setBusy(true);
    try {
      await setSlots({ roomId: room._id, date, slots: toSave(next, room) });
    } catch (err) {
      Alert.alert(t('error'), errText(err, t('slots.saveFailed')));
    } finally {
      setBusy(false);
    }
  };

  const pos = (time: string) => ({
    top: (slotSortKey(time) - rangeStart) * PX_PER_MIN + 1,
    height: Math.max(duration * PX_PER_MIN - 3, 20),
  });

  // Red line at the current time, in the column's own day (late slots belong to the evening before).
  const midnight = new Date(date + 'T00:00:00').getTime();
  const nowKey = (now.getTime() - midnight) / 60000;
  const showNow = nowKey >= rangeStart && nowKey <= rangeStart + height / PX_PER_MIN;

  const extraBooked = weekdayClosed
    ? [...booked.values()]
    : [...booked.values()].filter((b) => !slots?.some((s) => s.time === b.time));

  return (
    <View style={[{ width, height }, edge === 'day' ? styles.dayEdge : edge === 'col' ? styles.colEdge : null]}>
      {hours.map((k) => (
        <React.Fragment key={k}>
          <View style={[styles.hourLine, { top: (k - rangeStart) * PX_PER_MIN }]} />
          <View style={[styles.halfLine, { top: (k - rangeStart) * PX_PER_MIN + HOUR_PX / 2 }]} />
        </React.Fragment>
      ))}

      {slots === null && <View style={styles.loadingCol} />}

      {weekdayClosed && (
        <View style={styles.closedDay}>
          <Ionicons name="calendar-clear-outline" size={13} color={theme.colors.textSecondary} />
          <Text style={styles.closedDayText}>{t('cal.dayClosed')}</Text>
        </View>
      )}

      {slots && !weekdayClosed &&
        slots.map((s) => {
          const booking = booked.get(s.time);
          const state = stateOf(s);
          return booking ? (
            <BookingBlock
              key={s.time}
              booking={booking}
              room={room}
              style={pos(s.time)}
              past={state === 'past'}
              onPress={() => navigation.navigate('CompanyBookingDetail', { bookingId: booking._id })}
            />
          ) : (
            <SlotBlock
              key={s.time}
              slot={s}
              state={state}
              room={room}
              busy={busy}
              style={pos(s.time)}
              onBook={() => navigation.navigate('CompanyAddBooking', { companyId, roomId: room._id, date, time: s.time })}
              onToggle={() => void toggle(s.time)}
            />
          );
        })}

      {/* Bookings at times outside the slot list (custom times, closed weekdays) */}
      {extraBooked.map((b) => (
        <BookingBlock
          key={b._id}
          booking={b}
          room={room}
          style={pos(b.time)}
          past={false}
          onPress={() => navigation.navigate('CompanyBookingDetail', { bookingId: b._id })}
        />
      ))}

      {showNow && <View pointerEvents="none" style={[styles.nowLine, { top: (nowKey - rangeStart) * PX_PER_MIN }]} />}
    </View>
  );
}

function SlotBlock({
  slot, state, room, busy, style, onBook, onToggle,
}: {
  slot: Slot; state: SlotState; room: any; busy: boolean; style: { top: number; height: number };
  onBook: () => void; onToggle: () => void;
}) {
  const { t } = useTranslation();
  const range = slotRange(slot.time, room);
  const tall = style.height > 36;

  if (state === 'past') {
    return (
      <View style={[styles.block, style, { backgroundColor: C.past.bg, borderColor: C.past.border, borderStyle: 'dashed' }]}>
        <Text style={[styles.blockTime, { color: C.past.text }]} numberOfLines={1}>{range}</Text>
      </View>
    );
  }

  if (state === 'closed') {
    return (
      <View style={[styles.block, style, styles.blockRow, { backgroundColor: C.closed.bg, borderColor: C.closed.border }]}>
        <TouchableOpacity
          onPress={onToggle}
          disabled={busy}
          hitSlop={8}
          style={styles.iconBtn}
          accessibilityLabel={t('cal.openSlot', { time: slot.time })}
        >
          <Ionicons name="checkmark" size={15} color="#6EE7B7" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.blockTime, { color: C.closed.text }]} numberOfLines={1}>{range}</Text>
          {tall && <Text style={[styles.blockSub, { color: C.closed.text }]} numberOfLines={1}>{t('cal.legendClosed')}</Text>}
        </View>
      </View>
    );
  }

  // open or cutoff: still free, the company can add a booking.
  const cutoff = state === 'cutoff';
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onBook}
      style={[styles.block, style, styles.blockRow, { backgroundColor: C.free.bg, borderColor: C.free.border }]}
      accessibilityLabel={t('cal.newBookingAt', { time: slot.time })}
    >
      {!cutoff ? (
        <TouchableOpacity
          onPress={onToggle}
          disabled={busy}
          hitSlop={8}
          style={styles.iconBtn}
          accessibilityLabel={t('cal.closeSlot', { time: slot.time })}
        >
          <Ionicons name="close" size={15} color="#F87171" />
        </TouchableOpacity>
      ) : (
        <View style={styles.iconBtn}>
          <Ionicons name="time-outline" size={13} color={C.free.text} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.blockTime, { color: C.free.text }]} numberOfLines={1}>{range}</Text>
        {tall && <Text style={[styles.blockSub, { color: C.free.text }]} numberOfLines={1}>€{slot.price}</Text>}
      </View>
    </TouchableOpacity>
  );
}

function BookingBlock({
  booking, room, style, past, onPress,
}: {
  booking: any; room: any; style: { top: number; height: number }; past: boolean; onPress: () => void;
}) {
  const { t } = useTranslation();
  const kind = bookingKind(booking);
  const c = C[kind];
  const source = kind === 'external' || kind === 'manual' ? sourceLabel(booking, t) : '';
  const completed = booking.status === 'completed';
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={[
        styles.block,
        style,
        { zIndex: 2, backgroundColor: c.bg, borderColor: c.border, borderStyle: kind === 'pending' ? 'dashed' : 'solid' },
        past && !completed && { opacity: 0.8 },
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        <Text style={[styles.blockTime, { color: c.text, opacity: 0.9 }]} numberOfLines={1}>{slotRange(booking.time, room)}</Text>
        {completed && <Ionicons name="checkmark-circle" size={11} color={c.text} />}
        {kind === 'pending' && <Ionicons name="time-outline" size={11} color={c.text} />}
      </View>
      <Text style={[styles.blockName, { color: c.text }]} numberOfLines={1}>
        {booking.playerName || ''}
        {source ? <Text style={{ fontWeight: '400', fontStyle: 'italic' }}> ({source})</Text> : null}
      </Text>
      {style.height > 52 && booking.players > 0 && (
        <Text style={[styles.blockSub, { color: c.text }]} numberOfLines={1}>
          {t('companyBookings.playersCount', { n: booking.players })}
        </Text>
      )}
    </TouchableOpacity>
  );
}

function Legend() {
  const { t } = useTranslation();
  const item = (c: { bg: string; border: string }, label: string, dashed = false) => (
    <View style={styles.legendItem} key={label}>
      <View style={[styles.legendSwatch, { backgroundColor: c.bg, borderColor: c.border, borderStyle: dashed ? 'dashed' : 'solid' }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
  return (
    <View>
      <View style={styles.legend}>
        {item(C.free, t('cal.legendFree'))}
        {item(C.online, t('cal.legendBooked'))}
        {item(C.external, t('cal.legendExternal'))}
        {item(C.closed, t('cal.legendClosed'))}
        {item(C.pending, t('cal.legendPending'), true)}
        {item(C.past, t('cal.legendPast'), true)}
      </View>
      <Text style={styles.hint}>{t('cal.hint')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20, marginBottom: 20, padding: 12,
    backgroundColor: theme.colors.bgCardSolid, borderRadius: theme.radius.xl,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  navBtn: {
    width: 34, height: 34, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  todayBtn: { paddingHorizontal: 10, height: 34, borderRadius: theme.radius.md, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  todayText: { fontSize: 13, fontWeight: '600', color: theme.colors.bone },
  title: { flex: 1, textAlign: 'right', fontSize: 14, fontWeight: '700', color: theme.colors.bone, textTransform: 'capitalize' },
  segment: { flexGrow: 1, gap: 2, padding: 2, borderRadius: theme.radius.md, backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 10 },
  segBtn: { flexGrow: 1, alignItems: 'center', paddingVertical: 7, paddingHorizontal: 10, borderRadius: theme.radius.sm },
  segBtnActive: { backgroundColor: theme.colors.redPrimary },
  segText: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },
  segTextActive: { color: '#fff' },

  grid: {
    flexDirection: 'row', borderRadius: theme.radius.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(8,5,5,0.6)', overflow: 'hidden',
  },
  hour: { position: 'absolute', right: 6, fontSize: 11, color: theme.colors.textSecondary },
  dayHead: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  dayHeadText: { fontSize: 11, fontWeight: '700', color: theme.colors.textSecondary },
  roomHead: { justifyContent: 'center', paddingHorizontal: 6 },
  roomHeadText: { fontSize: 12, fontWeight: '700', color: theme.colors.bone, textAlign: 'center' },
  dayEdge: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.2)' },
  colEdge: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.05)' },
  hourLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.07)' },
  halfLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.025)' },
  nowLine: {
    position: 'absolute', left: 0, right: 0, height: 2, zIndex: 5, backgroundColor: theme.colors.redPrimary,
    shadowColor: theme.colors.redPrimary, shadowOpacity: 0.8, shadowRadius: 4, shadowOffset: { width: 0, height: 0 },
  },
  loadingCol: { position: 'absolute', top: 4, bottom: 4, left: 4, right: 4, borderRadius: theme.radius.md, backgroundColor: 'rgba(255,255,255,0.04)' },
  closedDay: {
    position: 'absolute', top: 10, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.radius.md, backgroundColor: 'rgba(8,5,5,0.85)',
  },
  closedDayText: { fontSize: 11, fontWeight: '600', color: theme.colors.textSecondary },

  block: {
    position: 'absolute', left: 3, right: 3, borderRadius: theme.radius.md, borderWidth: 1,
    paddingHorizontal: 5, paddingVertical: 3, overflow: 'hidden',
  },
  blockRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 3 },
  iconBtn: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center', marginLeft: -2 },
  blockTime: { fontSize: 11, fontWeight: '700' },
  blockName: { fontSize: 12, fontWeight: '800' },
  blockSub: { fontSize: 10, opacity: 0.8 },

  empty: { alignItems: 'center', paddingVertical: 28, gap: 10 },
  emptyText: { fontSize: 13, color: theme.colors.textSecondary },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: theme.radius.md, backgroundColor: theme.colors.redPrimary,
  },
  emptyBtnText: { fontSize: 13, fontWeight: '700', color: theme.colors.bone },

  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 12, height: 12, borderRadius: 2, borderWidth: 1 },
  legendText: { fontSize: 11, color: theme.colors.textSecondary },
  hint: { fontSize: 11, color: theme.colors.textMuted, marginTop: 8 },
});
