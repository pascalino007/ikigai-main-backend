import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { Bookings } from './bookings.entity';
import { Shops } from '../../shops/shop.entity';
import { Worker } from '../../workers/entities/worker.entity';
import { BookingStatus } from './booking-status.constants';
import { FakeManager, makeFakeDataSource } from '../../test-utils/fake-manager';

/**
 * QR check-in/check-out is the actual mechanism connecting the provider app
 * and the client app (mobile_app): the provider scans the client's QR
 * (qr_checkin_token) to start service, then the client scans the provider's
 * QR (qr_checkout_token) to end it. Both sides are just thin UI over these
 * two BookingsService methods, so this is what genuinely tests "the two apps
 * talking to each other" — previously zero coverage.
 */
describe('BookingsService — QR check-in / check-out', () => {
  const PROVIDER_AUTH_ID = 5; // shops.user_id — the provider app's logged-in user
  const CLIENT_AUTH_ID = 1; // bookings.user_id — the client app's logged-in user
  const SHOP_ID = 42;
  const WORKER_ID = 7;

  let manager: FakeManager;
  let dataSource: ReturnType<typeof makeFakeDataSource>;
  let serviceRepo: { find: jest.Mock };
  let shopRepo: { find: jest.Mock };
  let userRepo: { find: jest.Mock };
  let workerRepo: { find: jest.Mock };
  let bookingRepo: { find: jest.Mock; findOne: jest.Mock; save: jest.Mock };
  let proWalletService: { creditForBooking: jest.Mock };
  let service: BookingsService;

  /** offsetMinutes from "now", correctly rolled over across midnight. */
  function scheduledAtOffset(offsetMinutes: number): { booking_date: string; booking_time: Date } {
    const target = new Date(Date.now() + offsetMinutes * 60_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const booking_date = `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`;
    const booking_time = new Date();
    booking_time.setHours(target.getHours(), target.getMinutes(), 0, 0);
    return { booking_date, booking_time };
  }

  async function seedShop(overrides: Partial<Shops> = {}) {
    return manager.seed(Shops, manager.create(Shops, { id: SHOP_ID, user_id: PROVIDER_AUTH_ID, name: 'Salon Test', ...overrides }));
  }

  async function seedWorker(overrides: Partial<Worker> = {}) {
    return manager.seed(Worker, manager.create(Worker, { id: WORKER_ID, shop_id: SHOP_ID, first_name: 'W', last_name: 'K', status: 'libre', ...overrides }));
  }

  /** A CONFIRMED booking, scheduled "now" by default (so the grace-window check passes), ready for qrCheckin. */
  async function seedConfirmedBooking(overrides: Partial<Bookings> = {}) {
    const { booking_date, booking_time } = scheduledAtOffset(0);
    const booking = manager.create(Bookings, {
      user_id: CLIENT_AUTH_ID,
      provider_id: SHOP_ID,
      service_id: 9,
      worker_id: WORKER_ID,
      booking_date,
      booking_time,
      booking_status: BookingStatus.CONFIRMED,
      payement_status: 1,
      amount: 5000,
      currency: 'XOF',
      qr_checkin_token: 'checkin-token-abc',
      qr_checkout_token: null,
      ...overrides,
    });
    return manager.seed(Bookings, booking);
  }

  /** An IN_SERVICE booking (already checked in), ready for qrCheckout. */
  async function seedInServiceBooking(overrides: Partial<Bookings> = {}) {
    return seedConfirmedBooking({
      booking_status: BookingStatus.IN_SERVICE,
      qr_checkin_token: null,
      qr_checkout_token: 'checkout-token-xyz',
      checked_in_at: new Date(),
      ...overrides,
    });
  }

  beforeEach(async () => {
    manager = new FakeManager();
    dataSource = makeFakeDataSource(manager);
    serviceRepo = { find: jest.fn().mockResolvedValue([]) };
    shopRepo = { find: jest.fn().mockResolvedValue([]) };
    userRepo = { find: jest.fn().mockResolvedValue([]) };
    workerRepo = { find: jest.fn().mockResolvedValue([]) };
    bookingRepo = { find: jest.fn(), findOne: jest.fn(), save: jest.fn() };
    proWalletService = { creditForBooking: jest.fn().mockResolvedValue(undefined) };

    service = new BookingsService(
      bookingRepo as never,
      serviceRepo as never,
      shopRepo as never,
      userRepo as never,
      workerRepo as never,
      proWalletService as never,
      dataSource as never,
    );

    await seedShop();
    await seedWorker();
  });

  describe('qrCheckin — provider scans the client\'s QR', () => {
    it('starts the service: IN_SERVICE, stamps checked_in_at, issues a checkout token, consumes the check-in token, and busies the worker', async () => {
      const booking = await seedConfirmedBooking();

      const result = await service.qrCheckin(booking.qr_checkin_token!, PROVIDER_AUTH_ID);

      expect(result.booking_status).toBe(BookingStatus.IN_SERVICE);
      expect(result.checked_in_at).toBeInstanceOf(Date);
      expect(result.qr_checkin_token).toBeNull();
      expect(result.qr_checkout_token).toEqual(expect.any(String));
      expect(result.qr_checkout_token).not.toBe('checkin-token-abc');

      const worker = await manager.findOne(Worker, { where: { id: WORKER_ID } });
      expect(worker!.status).toBe('occupé');
    });

    it('rejects an unknown/invalid token', async () => {
      await seedConfirmedBooking();
      await expect(service.qrCheckin('not-a-real-token', PROVIDER_AUTH_ID)).rejects.toThrow(NotFoundException);
    });

    it('rejects a provider who does not own the shop', async () => {
      const booking = await seedConfirmedBooking();
      const someoneElse = 999;
      await expect(service.qrCheckin(booking.qr_checkin_token!, someoneElse)).rejects.toThrow(ForbiddenException);
    });

    it('rejects when the booking\'s shop cannot be found at all', async () => {
      const booking = await seedConfirmedBooking({ provider_id: 404404 });
      await expect(service.qrCheckin(booking.qr_checkin_token!, PROVIDER_AUTH_ID)).rejects.toThrow(ForbiddenException);
    });

    it('rejects a booking that is not CONFIRMED (e.g. already IN_SERVICE)', async () => {
      const booking = await seedConfirmedBooking({ booking_status: BookingStatus.IN_SERVICE, qr_checkin_token: 'still-here' });
      await expect(service.qrCheckin('still-here', PROVIDER_AUTH_ID)).rejects.toThrow(BadRequestException);
      void booking;
    });

    it('rejects a booking that was never paid (PENDING_PAYMENT)', async () => {
      const booking = await seedConfirmedBooking({ booking_status: BookingStatus.PENDING_PAYMENT, qr_checkin_token: 'pending-token' });
      await expect(service.qrCheckin('pending-token', PROVIDER_AUTH_ID)).rejects.toThrow(BadRequestException);
      void booking;
    });

    it('rejects checking in more than the 15-minute grace window before the scheduled time', async () => {
      const { booking_date, booking_time } = scheduledAtOffset(30); // 30 min from now
      const booking = await seedConfirmedBooking({ booking_date, booking_time });
      try {
        await service.qrCheckin(booking.qr_checkin_token!, PROVIDER_AUTH_ID);
        fail('expected qrCheckin to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        const body = (err as HttpException).getResponse() as Record<string, unknown>;
        expect(body.error).toBe('too_early');
        expect(typeof body.minutesRemaining).toBe('number');
        expect(body.minutesRemaining as number).toBeGreaterThan(0);
      }
    });

    it('rejects checking in for a booking scheduled on a future date entirely (not just later today)', async () => {
      const { booking_date, booking_time } = scheduledAtOffset(60 * 24 * 3); // 3 days from now
      const booking = await seedConfirmedBooking({ booking_date, booking_time });
      try {
        await service.qrCheckin(booking.qr_checkin_token!, PROVIDER_AUTH_ID);
        fail('expected qrCheckin to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        const body = (err as HttpException).getResponse() as Record<string, unknown>;
        expect(body.error).toBe('too_early');
        // ~3 days away — well past the 15-minute grace window, not just a few minutes.
        expect(body.minutesRemaining as number).toBeGreaterThan(60 * 24 * 2);
      }
    });

    it('a rejected "too early" attempt leaves the booking untouched — still CONFIRMED, token not consumed — so it can be retried once the window opens', async () => {
      const { booking_date, booking_time } = scheduledAtOffset(30); // 30 min from now — too early
      const booking = await seedConfirmedBooking({ booking_date, booking_time });
      const token = booking.qr_checkin_token!;

      await expect(service.qrCheckin(token, PROVIDER_AUTH_ID)).rejects.toThrow(BadRequestException);

      // Nothing was mutated by the rejected attempt.
      const stillPending = await manager.findOne(Bookings, { where: { id: booking.id } });
      expect(stillPending!.booking_status).toBe(BookingStatus.CONFIRMED);
      expect(stillPending!.qr_checkin_token).toBe(token);
      const worker = await manager.findOne(Worker, { where: { id: WORKER_ID } });
      expect(worker!.status).toBe('libre');

      // Move the booking's scheduled time into the grace window (simulating time
      // having passed) and retry with the SAME token — it must still work.
      const { booking_date: nowDate, booking_time: nowTime } = scheduledAtOffset(5);
      stillPending!.booking_date = nowDate;
      stillPending!.booking_time = nowTime;
      await manager.save(Bookings, stillPending!);

      const result = await service.qrCheckin(token, PROVIDER_AUTH_ID);
      expect(result.booking_status).toBe(BookingStatus.IN_SERVICE);
    });

    it('allows checking in within the 15-minute grace window before the scheduled time', async () => {
      const { booking_date, booking_time } = scheduledAtOffset(10); // 10 min from now — inside the 15-min grace window
      const booking = await seedConfirmedBooking({ booking_date, booking_time });
      const result = await service.qrCheckin(booking.qr_checkin_token!, PROVIDER_AUTH_ID);
      expect(result.booking_status).toBe(BookingStatus.IN_SERVICE);
    });

    it('allows checking in after the scheduled time (late arrival is fine, only "too early" is blocked)', async () => {
      const { booking_date, booking_time } = scheduledAtOffset(-45); // scheduled 45 min ago
      const booking = await seedConfirmedBooking({ booking_date, booking_time });
      const result = await service.qrCheckin(booking.qr_checkin_token!, PROVIDER_AUTH_ID);
      expect(result.booking_status).toBe(BookingStatus.IN_SERVICE);
    });

    it('is single-use: scanning the same token again after a successful check-in fails', async () => {
      const booking = await seedConfirmedBooking();
      const token = booking.qr_checkin_token!;
      await service.qrCheckin(token, PROVIDER_AUTH_ID);
      await expect(service.qrCheckin(token, PROVIDER_AUTH_ID)).rejects.toThrow(NotFoundException);
    });

    it('does not touch a worker when the booking has none assigned', async () => {
      const booking = await seedConfirmedBooking({ worker_id: null });
      await expect(service.qrCheckin(booking.qr_checkin_token!, PROVIDER_AUTH_ID)).resolves.toBeDefined();
      const worker = await manager.findOne(Worker, { where: { id: WORKER_ID } });
      expect(worker!.status).toBe('libre'); // unchanged
    });
  });

  describe('qrCheckout — client scans the provider\'s QR', () => {
    it('ends the service: DONE, stamps checked_out_at, consumes the checkout token, and frees the worker', async () => {
      await seedWorker({ status: 'occupé' });
      const booking = await seedInServiceBooking();

      const result = await service.qrCheckout(booking.qr_checkout_token!, CLIENT_AUTH_ID);

      expect(result.booking_status).toBe(BookingStatus.DONE);
      expect(result.checked_out_at).toBeInstanceOf(Date);
      expect(result.qr_checkout_token).toBeNull();

      const worker = await manager.findOne(Worker, { where: { id: WORKER_ID } });
      expect(worker!.status).toBe('libre');
    });

    it('rejects an unknown/invalid token', async () => {
      await seedInServiceBooking();
      await expect(service.qrCheckout('not-a-real-token', CLIENT_AUTH_ID)).rejects.toThrow(NotFoundException);
    });

    it('rejects a scanning client who is not the booking\'s owner', async () => {
      const booking = await seedInServiceBooking();
      const someoneElse = 888;
      await expect(service.qrCheckout(booking.qr_checkout_token!, someoneElse)).rejects.toThrow(ForbiddenException);
    });

    it('rejects a booking that is not IN_SERVICE (e.g. still CONFIRMED — never checked in)', async () => {
      const booking = await seedConfirmedBooking({ qr_checkout_token: 'premature-token' });
      await expect(service.qrCheckout('premature-token', CLIENT_AUTH_ID)).rejects.toThrow(BadRequestException);
      void booking;
    });

    it('rejects a booking that is already DONE', async () => {
      const booking = await seedInServiceBooking({ booking_status: BookingStatus.DONE, qr_checkout_token: 'late-token' });
      await expect(service.qrCheckout('late-token', CLIENT_AUTH_ID)).rejects.toThrow(BadRequestException);
      void booking;
    });

    it('is single-use: scanning the same token again after a successful check-out fails', async () => {
      const booking = await seedInServiceBooking();
      const token = booking.qr_checkout_token!;
      await service.qrCheckout(token, CLIENT_AUTH_ID);
      await expect(service.qrCheckout(token, CLIENT_AUTH_ID)).rejects.toThrow(NotFoundException);
    });

    it('does not touch a worker when the booking has none assigned', async () => {
      const booking = await seedInServiceBooking({ worker_id: null });
      await expect(service.qrCheckout(booking.qr_checkout_token!, CLIENT_AUTH_ID)).resolves.toBeDefined();
      const worker = await manager.findOne(Worker, { where: { id: WORKER_ID } });
      expect(worker!.status).toBe('libre'); // never changed to 'occupé' in the first place
    });

    it('crediting the provider wallet is NOT done here — that\'s BookingsSubscriber\'s job on the save event', async () => {
      const booking = await seedInServiceBooking();
      await service.qrCheckout(booking.qr_checkout_token!, CLIENT_AUTH_ID);
      // BookingsService itself never calls this directly (see the class's own
      // comment above the manager.save call); the FakeManager doesn't emit
      // TypeORM subscriber events, so this also structurally proves the
      // credit path lives outside qrCheckout — covered separately in
      // bookings.subscriber.spec.ts and pro_wallet.service.spec.ts.
      expect(proWalletService.creditForBooking).not.toHaveBeenCalled();
    });
  });

  describe('full round trip: provider app + mobile_app, back to back', () => {
    it('CONFIRMED → (provider scans client QR) → IN_SERVICE → (client scans provider QR) → DONE', async () => {
      const booking = await seedConfirmedBooking();
      const checkinToken = booking.qr_checkin_token!;

      // Provider app: scan the client's QR to start the appointment.
      const afterCheckin = await service.qrCheckin(checkinToken, PROVIDER_AUTH_ID);
      expect(afterCheckin.booking_status).toBe(BookingStatus.IN_SERVICE);
      const checkoutToken = afterCheckin.qr_checkout_token as string;
      expect(checkoutToken).toBeTruthy();

      const workerMidService = await manager.findOne(Worker, { where: { id: WORKER_ID } });
      expect(workerMidService!.status).toBe('occupé');

      // The client's OWN check-in token is now dead — the provider app can't replay it.
      await expect(service.qrCheckin(checkinToken, PROVIDER_AUTH_ID)).rejects.toThrow(NotFoundException);

      // mobile_app: scan the provider's QR to end the appointment.
      const afterCheckout = await service.qrCheckout(checkoutToken, CLIENT_AUTH_ID);
      expect(afterCheckout.booking_status).toBe(BookingStatus.DONE);

      const workerAfterService = await manager.findOne(Worker, { where: { id: WORKER_ID } });
      expect(workerAfterService!.status).toBe('libre');

      // And the checkout token is equally single-use.
      await expect(service.qrCheckout(checkoutToken, CLIENT_AUTH_ID)).rejects.toThrow(NotFoundException);
    });

    it('a client cannot short-circuit straight to checkout without the provider checking them in first', async () => {
      const booking = await seedConfirmedBooking();
      // No checkout token exists yet (still null) — nothing for the client to scan.
      expect(booking.qr_checkout_token).toBeNull();
      await expect(service.qrCheckout('anything', CLIENT_AUTH_ID)).rejects.toThrow(NotFoundException);
    });
  });
});
