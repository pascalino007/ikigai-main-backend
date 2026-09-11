import { Bookings } from './bookings.entity';

/**
 * The booking's scheduled moment, in server-local time.
 *
 * booking_date is a YYYY-MM-DD string, booking_time a datetime column whose
 * only meaningful part is its hour/minute. Both must be combined via LOCAL
 * getters/constructors (not UTC) to agree with each other — a previous bug
 * had this method use local time while several NO_SHOW checks separately
 * reconstructed the same moment via `booking_time.toISOString()` (UTC hour/
 * minute) concatenated into a local-parsed string, silently disagreeing by
 * the server's UTC offset whenever it isn't itself UTC.
 */
export function getScheduledDateTime(b: Bookings): Date {
  const datePart = b.booking_date ?? new Date().toISOString().slice(0, 10);
  const scheduled = new Date(`${datePart}T00:00:00`);
  scheduled.setHours(b.booking_time.getHours(), b.booking_time.getMinutes(), 0, 0);
  return scheduled;
}
