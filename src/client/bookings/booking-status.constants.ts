export const BookingStatus = {
  PENDING_PAYMENT: 0,
  CONFIRMED: 1,
  CANCELLED: 2,
  PAYMENT_FAILED: 3,
  IN_SERVICE: 4,
  DONE: 5,
  NO_SHOW: 6,
} as const;

/**
 * How long after the booked time a still-CONFIRMED booking is left alone
 * before being auto-marked NO_SHOW. Shared by BookingsService's per-request
 * checks and BookingSchedulerService's cron sweep so both use the same
 * cutoff — previously there was no grace at all, so a booking flipped to
 * NO_SHOW the instant the clock passed its scheduled time.
 */
export const NO_SHOW_GRACE_MINUTES = 15;
