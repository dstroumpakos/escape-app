import { useEffect, useRef } from 'react';
import { useQuery, useMutation } from 'convex/react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import {
  sendLocalNotification,
  getLastRoomCount,
  setLastRoomCount,
  getLastBookingIds,
  setLastBookingIds,
  getLastBookingStatuses,
  setLastBookingStatuses,
  getLastCompanyBookingIds,
  setLastCompanyBookingIds,
  getLastCompanyBookingStatuses,
  setLastCompanyBookingStatuses,
} from './notifications';
import { useTranslation } from './i18n';

/**
 * Watches Convex queries and fires device notifications when:
 * 1. New escape rooms appear in the database.
 * 2. A booking's status changes (confirmed / cancelled) or new bookings are created.
 *
 * Must be rendered inside a <ConvexProvider>.
 */
export function useNotificationWatcher(userId: string | null, companyId: string | null) {
  const createNotification = useMutation(api.notifications.create);
  const { t } = useTranslation();
  // ── Watch rooms ──
  const rooms = useQuery(api.rooms.list);
  const roomsInitialised = useRef(false);

  useEffect(() => {
    if (!rooms) return;

    (async () => {
      const lastCount = await getLastRoomCount();

      if (lastCount === 0) {
        // First ever run – record baseline
        await setLastRoomCount(rooms.length);
        roomsInitialised.current = true;
        return;
      }

      // Mark initialised on remount (baseline already exists)
      if (!roomsInitialised.current) {
        roomsInitialised.current = true;
      }

      if (rooms.length > lastCount) {
        const newCount = rooms.length - lastCount;
        // Find the newest rooms (Convex returns in insertion order)
        const newest = rooms.slice(-newCount);
        const roomName = newest.length === 1 ? newest[0].title : `${newCount} rooms`;

        const title = '🚪 ' + t('notifications.newRoom');
        const body = newest.length === 1
            ? t('notifications.newRoomBody', { name: newest[0].title })
            : t('notifications.newRoomsBody', { count: newCount });

        await sendLocalNotification(title, body,
          { type: 'new_room', roomIds: newest.map((r: any) => r._id) },
          'new-rooms',
        );

        if (userId) {
          await createNotification({
            userId: userId as Id<"users">,
            type: 'system',
            title,
            message: body,
            data: { roomIds: newest.map((r: any) => r._id) },
          });
        }
      }

      await setLastRoomCount(rooms.length);
      roomsInitialised.current = true;
    })();
  }, [rooms]);

  // ── Watch bookings for the current user ──
  const bookings = useQuery(
    api.bookings.getByUser,
    userId ? { userId: userId as any } : 'skip',
  );
  const bookingsInitialised = useRef(false);

  useEffect(() => {
    if (!bookings || !userId) return;

    (async () => {
      const lastIds = await getLastBookingIds();
      const currentIds = bookings.map((b: any) => b._id);

      if (lastIds.length === 0 && !bookingsInitialised.current) {
        // First ever run – record baseline
        await setLastBookingIds(currentIds);
        const statusMap: Record<string, string> = {};
        for (const b of bookings) statusMap[(b as any)._id] = (b as any).status;
        await setLastBookingStatuses(statusMap);
        bookingsInitialised.current = true;
        return;
      }

      if (!bookingsInitialised.current) {
        bookingsInitialised.current = true;
      }

      // Find newly appeared bookings
      const newBookings = bookings.filter(
        (b: any) => !lastIds.includes(b._id),
      );

      for (const booking of newBookings) {
        const title = '🎟️ ' + t('notifications.bookingConfirmed');
        const body = t('notifications.bookingConfirmedBody', { date: booking.date, time: booking.time });
        await sendLocalNotification(title, body,
          { type: 'booking_confirmed', bookingId: booking._id },
          'bookings',
        );
        if (userId) {
          await createNotification({
            userId: userId as Id<"users">,
            type: 'booking',
            title,
            message: body,
            data: { bookingId: booking._id },
          });
        }
      }

      // Detect cancellations by comparing statuses
      const lastStatuses = await getLastBookingStatuses();
      for (const booking of bookings) {
        const id = (booking as any)._id;
        const prevStatus = lastStatuses[id];
        if (prevStatus && prevStatus !== 'cancelled' && (booking as any).status === 'cancelled') {
          const roomTitle = (booking as any).room?.title || 'escape room';
          const title = '❌ ' + t('notifications.bookingCancelled');
          const body = t('notifications.bookingCancelledBody', { room: roomTitle, date: booking.date, time: booking.time });
          await sendLocalNotification(title, body,
            { type: 'booking_cancelled', bookingId: id },
            'bookings',
          );
          if (userId) {
            await createNotification({
              userId: userId as Id<"users">,
              type: 'cancelled',
              title,
              message: body,
              data: { bookingId: id },
            });
          }
        }
      }

      // Save current statuses
      const statusMap: Record<string, string> = {};
      for (const b of bookings) {
        statusMap[(b as any)._id] = (b as any).status;
      }
      await setLastBookingStatuses(statusMap);
      await setLastBookingIds(currentIds);
      bookingsInitialised.current = true;
    })();
  }, [bookings, userId]);

  // ── Watch company bookings (only for company-connected users) ──
  const companyBookings = useQuery(
    api.companies.getBookings,
    companyId ? { companyId: companyId as any } : 'skip',
  );
  const companyBookingsInitialised = useRef(false);

  useEffect(() => {
    if (!companyBookings || !companyId) return;

    (async () => {
      const lastIds = await getLastCompanyBookingIds();
      const currentIds = companyBookings.map((b: any) => b._id);

      if (lastIds.length === 0 && !companyBookingsInitialised.current) {
        // First ever run – record baseline
        await setLastCompanyBookingIds(currentIds);
        const statusMap: Record<string, string> = {};
        for (const b of companyBookings) statusMap[(b as any)._id] = (b as any).status;
        await setLastCompanyBookingStatuses(statusMap);
        companyBookingsInitialised.current = true;
        return;
      }

      if (!companyBookingsInitialised.current) {
        companyBookingsInitialised.current = true;
      }

      const newBookings = companyBookings.filter(
        (b: any) => !lastIds.includes(b._id),
      );

      for (const booking of newBookings) {
        const roomTitle = (booking as any).roomTitle || 'room';
        await sendLocalNotification(
          '📋 ' + t('notifications.companyNewBooking'),
          t('notifications.companyNewBookingBody', { room: roomTitle, date: booking.date, time: booking.time, players: booking.players }),
          { type: 'company_booking', bookingId: booking._id },
          'bookings',
        );
      }

      // Detect cancellations
      const lastStatuses = await getLastCompanyBookingStatuses();
      for (const booking of companyBookings) {
        const id = (booking as any)._id;
        const prevStatus = lastStatuses[id];
        if (prevStatus && prevStatus !== 'cancelled' && (booking as any).status === 'cancelled') {
          const roomTitle = (booking as any).roomTitle || 'room';
          await sendLocalNotification(
            '❌ ' + t('notifications.companyCancelled'),
            t('notifications.companyCancelledBody', { room: roomTitle, date: booking.date, time: booking.time }),
            { type: 'company_booking_cancelled', bookingId: id },
            'bookings',
          );
        }
      }

      // Save current statuses
      const statusMap: Record<string, string> = {};
      for (const b of companyBookings) {
        statusMap[(b as any)._id] = (b as any).status;
      }
      await setLastCompanyBookingStatuses(statusMap);
      await setLastCompanyBookingIds(currentIds);
      companyBookingsInitialised.current = true;
    })();
  }, [companyBookings, companyId]);

  // ── Watch slot alerts: notify when a watched unavailable slot becomes available ──
  const notifiedAlerts = useQuery(
    api.slotAlerts.getNotifiedByUser,
    userId ? { userId: userId as Id<"users"> } : 'skip',
  );
  const deleteNotifiedAlerts = useMutation(api.slotAlerts.deleteNotified);
  const slotAlertsInitialised = useRef(false);

  useEffect(() => {
    if (!notifiedAlerts || !userId) return;

    if (!slotAlertsInitialised.current) {
      // First run – delete any stale notified alerts without sending notifications
      if (notifiedAlerts.length > 0) {
        deleteNotifiedAlerts({ ids: notifiedAlerts.map((a: any) => a._id) });
      }
      slotAlertsInitialised.current = true;
      return;
    }

    if (notifiedAlerts.length === 0) return;

    // Fire a local notification for each newly-available slot
    (async () => {
      for (const alert of notifiedAlerts) {
        const title = '🔔 ' + t('notifications.slotAvailable');
        const body = t('notifications.slotAvailableBody', { time: alert.time, date: alert.date });
        await sendLocalNotification(title, body,
          { type: 'slot_available', roomId: alert.roomId, date: alert.date, time: alert.time },
          'bookings',
        );
        if (userId) {
          await createNotification({
            userId: userId as Id<"users">,
            type: 'slot_available',
            title,
            message: body,
            data: { roomId: alert.roomId, date: alert.date, time: alert.time },
          });
        }
      }
      // Clean up — delete those alerts so we don't re-notify
      await deleteNotifiedAlerts({ ids: notifiedAlerts.map((a: any) => a._id) });
    })();
  }, [notifiedAlerts, userId]);
}
