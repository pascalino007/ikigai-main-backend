import type { UpdateEvent } from 'typeorm';
import { BookingsSubscriber } from './bookings.subscriber';
import { Bookings } from './bookings.entity';
import { BookingStatus } from './booking-status.constants';

describe('BookingsSubscriber', () => {
  let proWalletService: { creditForBooking: jest.Mock };
  let bookingMail: { sendNewBookingEmail: jest.Mock; sendStatusChangeEmail: jest.Mock };
  let fakeDataSource: { subscribers: unknown[] };
  let subscriber: BookingsSubscriber;

  beforeEach(() => {
    proWalletService = { creditForBooking: jest.fn().mockResolvedValue(undefined) };
    bookingMail = {
      sendNewBookingEmail: jest.fn().mockResolvedValue(undefined),
      sendStatusChangeEmail: jest.fn().mockResolvedValue(undefined),
    };
    fakeDataSource = { subscribers: [] };
    subscriber = new BookingsSubscriber(fakeDataSource as never, proWalletService as never, bookingMail as never);
  });

  it('registers itself on the DataSource so TypeORM activates it', () => {
    expect(fakeDataSource.subscribers).toContain(subscriber);
  });

  describe('afterInsert', () => {
    it('emails the provider when a booking is inserted already CONFIRMED (wallet-paid)', () => {
      subscriber.afterInsert({
        entity: { booking_status: BookingStatus.CONFIRMED } as Bookings,
      } as never);
      expect(bookingMail.sendNewBookingEmail).toHaveBeenCalled();
    });

    it('does nothing for a booking inserted PENDING_PAYMENT', () => {
      subscriber.afterInsert({
        entity: { booking_status: BookingStatus.PENDING_PAYMENT } as Bookings,
      } as never);
      expect(bookingMail.sendNewBookingEmail).not.toHaveBeenCalled();
    });
  });

  function makeUpdateEvent(opts: {
    databaseEntity?: Partial<Bookings> | null;
    entity?: Partial<Bookings> | null;
    reloaded?: Partial<Bookings> | null;
    queryRunner?: object;
  }) {
    const findOne = jest.fn().mockResolvedValue(opts.reloaded ?? null);
    const manager = { getRepository: jest.fn().mockReturnValue({ findOne }) };
    return {
      databaseEntity: opts.databaseEntity ?? undefined,
      entity: opts.entity ?? undefined,
      manager,
      queryRunner: opts.queryRunner,
    } as unknown as UpdateEvent<Bookings>;
  }

  describe('afterUpdate — queueing the provider credit', () => {
    it('queues the credit (does not apply it) when a booking transitions to DONE inside a transaction', async () => {
      const queryRunner = {};
      const reloaded = { id: 55, provider_id: 42, amount: 900, booking_status: BookingStatus.DONE };
      await subscriber.afterUpdate(
        makeUpdateEvent({
          databaseEntity: { id: 55, booking_status: BookingStatus.IN_SERVICE },
          entity: { id: 55, booking_status: BookingStatus.DONE },
          reloaded,
          queryRunner,
        }),
      );
      expect(proWalletService.creditForBooking).not.toHaveBeenCalled();

      await subscriber.afterTransactionCommit({ queryRunner } as never);
      expect(proWalletService.creditForBooking).toHaveBeenCalledWith(42, 900, 'Booking #55 completed', 55);
    });

    it('applying credit is idempotent per commit: a second commit event for the same queryRunner is a no-op', async () => {
      const queryRunner = {};
      const reloaded = { id: 56, provider_id: 42, amount: 900, booking_status: BookingStatus.DONE };
      await subscriber.afterUpdate(
        makeUpdateEvent({
          databaseEntity: { id: 56, booking_status: BookingStatus.IN_SERVICE },
          entity: { id: 56, booking_status: BookingStatus.DONE },
          reloaded,
          queryRunner,
        }),
      );
      await subscriber.afterTransactionCommit({ queryRunner } as never);
      await subscriber.afterTransactionCommit({ queryRunner } as never);
      expect(proWalletService.creditForBooking).toHaveBeenCalledTimes(1);
    });

    it('applies the credit immediately when there is no queryRunner (no transaction context)', async () => {
      const reloaded = { id: 57, provider_id: 42, amount: 900, booking_status: BookingStatus.DONE };
      await subscriber.afterUpdate(
        makeUpdateEvent({
          databaseEntity: { id: 57, booking_status: BookingStatus.IN_SERVICE },
          entity: { id: 57, booking_status: BookingStatus.DONE },
          reloaded,
          queryRunner: undefined,
        }),
      );
      expect(proWalletService.creditForBooking).toHaveBeenCalledWith(42, 900, 'Booking #57 completed', 57);
    });

    it('treats a transition to DONE as "became done" even when the prior status is unknown (no databaseEntity)', async () => {
      const queryRunner = {};
      const reloaded = { id: 58, provider_id: 42, amount: 900, booking_status: BookingStatus.DONE };
      await subscriber.afterUpdate(
        makeUpdateEvent({
          databaseEntity: undefined,
          entity: { id: 58, booking_status: BookingStatus.DONE },
          reloaded,
          queryRunner,
        }),
      );
      await subscriber.afterTransactionCommit({ queryRunner } as never);
      expect(proWalletService.creditForBooking).toHaveBeenCalled();
    });

    it('does not credit when the reloaded booking has no provider_id', async () => {
      const queryRunner = {};
      const reloaded = { id: 59, provider_id: 0, amount: 900, booking_status: BookingStatus.DONE };
      await subscriber.afterUpdate(
        makeUpdateEvent({
          databaseEntity: { id: 59, booking_status: BookingStatus.IN_SERVICE },
          entity: { id: 59, booking_status: BookingStatus.DONE },
          reloaded,
          queryRunner,
        }),
      );
      await subscriber.afterTransactionCommit({ queryRunner } as never);
      expect(proWalletService.creditForBooking).not.toHaveBeenCalled();
    });

    it('does not credit when the reloaded booking has a non-positive amount', async () => {
      const queryRunner = {};
      const reloaded = { id: 60, provider_id: 42, amount: 0, booking_status: BookingStatus.DONE };
      await subscriber.afterUpdate(
        makeUpdateEvent({
          databaseEntity: { id: 60, booking_status: BookingStatus.IN_SERVICE },
          entity: { id: 60, booking_status: BookingStatus.DONE },
          reloaded,
          queryRunner,
        }),
      );
      await subscriber.afterTransactionCommit({ queryRunner } as never);
      expect(proWalletService.creditForBooking).not.toHaveBeenCalled();
    });

    it('swallows a credit failure so it never breaks the booking commit path', async () => {
      proWalletService.creditForBooking.mockRejectedValue(new Error('db down'));
      const queryRunner = {};
      const reloaded = { id: 61, provider_id: 42, amount: 900, booking_status: BookingStatus.DONE };
      await subscriber.afterUpdate(
        makeUpdateEvent({
          databaseEntity: { id: 61, booking_status: BookingStatus.IN_SERVICE },
          entity: { id: 61, booking_status: BookingStatus.DONE },
          reloaded,
          queryRunner,
        }),
      );
      await expect(subscriber.afterTransactionCommit({ queryRunner } as never)).resolves.toBeUndefined();
    });

    it('ignores an update with no status change and no DONE transition, without reloading the entity', async () => {
      const event = makeUpdateEvent({
        databaseEntity: { id: 62, booking_status: BookingStatus.CONFIRMED },
        entity: { id: 62, booking_status: BookingStatus.CONFIRMED },
      });
      await subscriber.afterUpdate(event);
      expect(event.manager.getRepository as unknown as jest.Mock).not.toHaveBeenCalled();
    });

    it('ignores an update where the new status is null/undefined', async () => {
      const event = makeUpdateEvent({
        databaseEntity: { id: 63, booking_status: BookingStatus.CONFIRMED },
        entity: { id: 63 },
      });
      await subscriber.afterUpdate(event);
      expect(event.manager.getRepository as unknown as jest.Mock).not.toHaveBeenCalled();
    });
  });

  describe('afterUpdate — provider emails', () => {
    it('sends the "new booking" email when payment just confirmed a pending booking', async () => {
      const reloaded = {
        id: 70,
        provider_id: 42,
        amount: 900,
        booking_status: BookingStatus.CONFIRMED,
      };
      await subscriber.afterUpdate(
        makeUpdateEvent({
          databaseEntity: { id: 70, booking_status: BookingStatus.PENDING_PAYMENT },
          entity: { id: 70, booking_status: BookingStatus.CONFIRMED },
          reloaded,
        }),
      );
      expect(bookingMail.sendNewBookingEmail).toHaveBeenCalledWith(reloaded);
      expect(bookingMail.sendStatusChangeEmail).not.toHaveBeenCalled();
    });

    it('sends a status-change email for a transition that did not originate from PENDING_PAYMENT', async () => {
      const reloaded = { id: 71, provider_id: 42, amount: 900, booking_status: BookingStatus.IN_SERVICE };
      await subscriber.afterUpdate(
        makeUpdateEvent({
          databaseEntity: { id: 71, booking_status: BookingStatus.CONFIRMED },
          entity: { id: 71, booking_status: BookingStatus.IN_SERVICE },
          reloaded,
        }),
      );
      expect(bookingMail.sendStatusChangeEmail).toHaveBeenCalledWith(reloaded, BookingStatus.CONFIRMED);
      expect(bookingMail.sendNewBookingEmail).not.toHaveBeenCalled();
    });

    it('sends no email when a pending booking moves to a non-confirmed state (payment failed) — it was never the provider\'s', async () => {
      const reloaded = {
        id: 72,
        provider_id: 42,
        amount: 900,
        booking_status: BookingStatus.PAYMENT_FAILED,
      };
      await subscriber.afterUpdate(
        makeUpdateEvent({
          databaseEntity: { id: 72, booking_status: BookingStatus.PENDING_PAYMENT },
          entity: { id: 72, booking_status: BookingStatus.PAYMENT_FAILED },
          reloaded,
        }),
      );
      expect(bookingMail.sendNewBookingEmail).not.toHaveBeenCalled();
      expect(bookingMail.sendStatusChangeEmail).not.toHaveBeenCalled();
    });
  });

  describe('afterTransactionCommit', () => {
    it('is a no-op when nothing was queued for this queryRunner', async () => {
      await expect(subscriber.afterTransactionCommit({ queryRunner: {} } as never)).resolves.toBeUndefined();
      expect(proWalletService.creditForBooking).not.toHaveBeenCalled();
    });
  });
});
