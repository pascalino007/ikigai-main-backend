import { WorkersService } from './workers.service';
import { BookingStatus } from '../client/bookings/booking-status.constants';

// 2026-09-19 is a Saturday, so 20 = Sunday, 21 = Monday, 22 = Tuesday.
const SAT = '2026-09-19';
const SUN = '2026-09-20';
const MON = '2026-09-21';

const SHOP_ID = 5;
// English labels, exactly as the dashboard / provider app store them.
const SHOP_HOURS = [
  ['Monday', '08:00 - 18:00'],
  ['Tuesday', '08:00 - 18:00'],
  ['Wednesday', '08:00 - 18:00'],
  ['Thursday', '08:00 - 18:00'],
  ['Friday', '08:00 - 18:00'],
  ['Saturday', '09:00 - 14:00'],
  ['Sunday', ' - '],
];

const schedule = (day_of_week: number, start_time = '09:00', end_time = '19:30') => ({
  day_of_week,
  start_time,
  end_time,
  is_active: true,
});

function build(opts: { shopHours?: unknown; worker?: any; bookings?: any[] } = {}) {
  const shopHours = 'shopHours' in opts ? opts.shopHours : SHOP_HOURS;
  const workerRepo = {
    findOne: jest.fn().mockResolvedValue(opts.worker),
    create: jest.fn((x) => x),
  };
  const bookingsRepo = { find: jest.fn().mockResolvedValue(opts.bookings ?? []) };
  const servicesRepo = { findOne: jest.fn().mockResolvedValue({ id: 1, duration_minutes: 30 }) };
  const shopsRepo = {
    findOne: jest.fn().mockResolvedValue({ id: SHOP_ID, workingHours: shopHours, email: 'shop@example.com' }),
  };
  const busyRepo = { find: jest.fn().mockResolvedValue([]) };

  const service = new WorkersService(
    workerRepo as any,
    {} as any,
    {} as any,
    bookingsRepo as any,
    servicesRepo as any,
    shopsRepo as any,
    {} as any,
    {} as any,
    busyRepo as any,
  );
  return { service, bookingsRepo };
}

const realWorker = (schedules: any[], exceptions: any[] = []) => ({
  id: 7,
  shop_id: SHOP_ID,
  buffer_minutes: 5,
  schedules,
  exceptions,
});

const OWNER = -SHOP_ID; // sentinel id of the default shop-owner worker

describe('WorkersService.getAvailability', () => {
  describe('default shop-owner worker (no weekly schedule)', () => {
    it('follows the shop opening hours even though they use English day labels', async () => {
      const { service } = build();
      const slots = await service.getAvailability(OWNER, MON, 1);
      expect(slots[0].start).toBe('08:00');
      expect(slots[slots.length - 1].end).toBe('18:00');
      expect(slots.every((s) => s.available)).toBe(true);
    });

    it('still works with French day labels', async () => {
      const { service } = build({ shopHours: [['Lundi', '10:00 - 12:00']] });
      const slots = await service.getAvailability(OWNER, MON, 1);
      expect(slots[0].start).toBe('10:00');
      expect(slots[slots.length - 1].end).toBe('12:00');
    });

    it('uses that day\'s own hours (Saturday 09:00-14:00)', async () => {
      const { service } = build();
      const slots = await service.getAvailability(OWNER, SAT, 1);
      expect(slots[0].start).toBe('09:00');
      expect(slots[slots.length - 1].end).toBe('14:00');
    });

    it('has no slots on a day the shop is closed', async () => {
      const { service } = build();
      expect(await service.getAvailability(OWNER, SUN, 1)).toEqual([]);
    });

    it('has no slots when the shop has no hours configured', async () => {
      const { service } = build({ shopHours: null });
      expect(await service.getAvailability(OWNER, MON, 1)).toEqual([]);
    });
  });

  describe('worker with a weekly schedule', () => {
    const monToWed = [schedule(1), schedule(2), schedule(3)];

    it('is bookable on a scheduled day, clamped to the shop hours', async () => {
      const { service } = build({ worker: realWorker(monToWed) });
      const slots = await service.getAvailability(7, MON, 1);
      expect(slots[0].start).toBe('09:00'); // worker starts later than the shop opens
      expect(slots[slots.length - 1].end).toBe('18:00'); // worker's 19:30 is cut at the shop's closing
    });

    it('is off on a day without a schedule row, even if the shop is open', async () => {
      const { service } = build({ worker: realWorker(monToWed) });
      expect(await service.getAvailability(7, SAT, 1)).toEqual([]);
    });

    it('has no slots on a day the shop is closed, even with a schedule row', async () => {
      const { service } = build({ worker: realWorker([...monToWed, schedule(0)]) });
      expect(await service.getAvailability(7, SUN, 1)).toEqual([]);
    });

    it('honours a day_off exception', async () => {
      const worker = realWorker(monToWed, [{ exception_date: MON, type: 'day_off' }]);
      const { service } = build({ worker });
      expect(await service.getAvailability(7, MON, 1)).toEqual([]);
    });
  });

  describe('blocking bookings', () => {
    // 10:00-11:00 on Monday (local time, like the booking columns).
    const booking = {
      booking_time: new Date(2026, 8, 21, 10, 0),
      booking_end_time: new Date(2026, 8, 21, 11, 0),
    };

    it('asks for CONFIRMED and IN_SERVICE bookings only', async () => {
      const { service, bookingsRepo } = build({ worker: realWorker([schedule(1)]) });
      await service.getAvailability(7, MON, 1);
      const where = bookingsRepo.find.mock.calls[0][0].where;
      expect(where.booking_status.value).toEqual([BookingStatus.CONFIRMED, BookingStatus.IN_SERVICE]);
    });

    it('blocks the booked window plus the buffer, and nothing else', async () => {
      const { service } = build({ worker: realWorker([schedule(1)]), bookings: [booking] });
      const byStart = new Map((await service.getAvailability(7, MON, 1)).map((s) => [s.start, s.available]));
      expect(byStart.get('09:00')).toBe(true); // ends 09:30, before the booking
      expect(byStart.get('09:45')).toBe(false); // overlaps 10:00
      expect(byStart.get('10:30')).toBe(false); // inside the booking
      expect(byStart.get('11:00')).toBe(false); // inside the 5 min buffer after 11:00
      expect(byStart.get('11:15')).toBe(true);
    });
  });
});
