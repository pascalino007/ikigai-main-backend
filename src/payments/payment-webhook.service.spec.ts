import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentWebhookService } from './payment-webhook.service';
import { Transaction } from '../transaction/transaction.entity';
import { Bookings } from '../client/bookings/bookings.entity';
import { ClientWallet } from '../client/client_wallet/client_wallet.entity';
import { BookingStatus } from '../client/bookings/booking-status.constants';
import { TransactionMotif, TransactionStatus } from '../transaction/transaction.contants';
import { FakeManager, makeFakeDataSource } from '../test-utils/fake-manager';

describe('PaymentWebhookService', () => {
  let manager: FakeManager;
  let dataSource: ReturnType<typeof makeFakeDataSource>;
  let shopsRepo: { findOne: jest.Mock };
  let servicesRepo: { findOne: jest.Mock };
  let usersRepo: { findOne: jest.Mock };
  let notificationRepo: { save: jest.Mock };
  let notificationsService: { sendPushNotification: jest.Mock };
  let mailService: { sendMail: jest.Mock };
  let service: PaymentWebhookService;

  beforeEach(() => {
    manager = new FakeManager();
    dataSource = makeFakeDataSource(manager);
    shopsRepo = { findOne: jest.fn().mockResolvedValue(null) };
    servicesRepo = { findOne: jest.fn().mockResolvedValue({ name: 'Coupe' }) };
    usersRepo = { findOne: jest.fn().mockResolvedValue(null) };
    notificationRepo = { save: jest.fn().mockResolvedValue(undefined) };
    notificationsService = { sendPushNotification: jest.fn().mockResolvedValue(undefined) };
    mailService = { sendMail: jest.fn().mockResolvedValue(true) };

    service = new PaymentWebhookService(
      dataSource as never,
      shopsRepo as never,
      servicesRepo as never,
      usersRepo as never,
      notificationRepo as never,
      {} as never, // subscriptionRepo — unused, writes go through the transaction manager
      {} as never, // planRepo — unused
      notificationsService as never,
      mailService as never,
    );
  });

  function seedBookingPayment(overrides: {
    transactionRef: string;
    bulkRef?: string | null;
    externalPaymentId?: string | null;
    txnStatus?: number;
    bookingStatus?: number;
  }) {
    const booking = manager.create(Bookings, {
      user_id: 1,
      provider_id: 42,
      service_id: 7,
      booking_status: overrides.bookingStatus ?? BookingStatus.PENDING_PAYMENT,
      payement_status: 0,
      amount: 5000,
      currency: 'XOF',
      booking_date: '2026-09-23',
      booking_time: new Date('1970-01-01T10:00:00'),
    });
    return manager.seed(Bookings, booking).then((savedBooking) => {
      const txn = manager.create(Transaction, {
        label: `Booking #${savedBooking.id}`,
        fromUserId: 1,
        toUserId: 42,
        amount: 5000,
        currency: 'XOF',
        status: overrides.txnStatus ?? TransactionStatus.PENDING,
        transactionMotifId: TransactionMotif.BOOKING_PAYMENT,
        transactionRef: overrides.transactionRef,
        bulkRef: overrides.bulkRef ?? null,
        paymentMethod: 'card',
        paymentProvider: 'stripe',
        externalPaymentId: overrides.externalPaymentId ?? null,
        balanceBefore: 0,
        balanceAfter: 0,
        booking: savedBooking,
      });
      return manager.seed(Transaction, txn).then((savedTxn) => ({ booking: savedBooking, txn: savedTxn }));
    });
  }

  describe('pending events', () => {
    it('is a no-op and never opens a transaction', async () => {
      await service.applyPaymentEvent({ status: 'pending', transactionRef: 'REF-1' });
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('transaction lookup', () => {
    it('matches by transactionRef', async () => {
      const { txn } = await seedBookingPayment({ transactionRef: 'BKG-1-100' });
      await service.applyPaymentEvent({ status: 'succeeded', transactionRef: 'BKG-1-100' });
      const updated = await manager.findOne(Transaction, { where: { id: txn.id } });
      expect(updated!.status).toBe(TransactionStatus.SUCCESS);
    });

    it('falls back to externalPaymentId when transactionRef does not match', async () => {
      const { txn } = await seedBookingPayment({
        transactionRef: 'BKG-1-100',
        externalPaymentId: 'pi_abc',
      });
      await service.applyPaymentEvent({
        status: 'succeeded',
        transactionRef: 'no-such-ref',
        externalPaymentId: 'pi_abc',
      });
      const updated = await manager.findOne(Transaction, { where: { id: txn.id } });
      expect(updated!.status).toBe(TransactionStatus.SUCCESS);
    });

    it('throws NotFoundException when neither ref nor externalPaymentId matches anything', async () => {
      await expect(
        service.applyPaymentEvent({ status: 'succeeded', transactionRef: 'ghost-ref' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('booking payment — success', () => {
    it('confirms the booking, generates a QR check-in token, and marks the transaction SUCCESS', async () => {
      const { booking, txn } = await seedBookingPayment({ transactionRef: 'BKG-1-100' });
      await service.applyPaymentEvent({ status: 'succeeded', transactionRef: 'BKG-1-100' });

      const updatedTxn = await manager.findOne(Transaction, { where: { id: txn.id } });
      const updatedBooking = await manager.findOne(Bookings, { where: { id: booking.id } });

      expect(updatedTxn!.status).toBe(TransactionStatus.SUCCESS);
      expect(updatedBooking!.booking_status).toBe(BookingStatus.CONFIRMED);
      expect(updatedBooking!.payement_status).toBe(1);
      expect(updatedBooking!.qr_checkin_token).toEqual(expect.any(String));
      expect(updatedBooking!.qr_checkin_token!.length).toBeGreaterThan(0);
    });

    it('is idempotent: a repeated success webhook does not regenerate the QR token', async () => {
      await seedBookingPayment({ transactionRef: 'BKG-1-100' });
      await service.applyPaymentEvent({ status: 'succeeded', transactionRef: 'BKG-1-100' });
      const firstToken = (await manager.findOne(Bookings, { where: { id: 1 } }))!.qr_checkin_token;

      await service.applyPaymentEvent({ status: 'succeeded', transactionRef: 'BKG-1-100' });
      const secondToken = (await manager.findOne(Bookings, { where: { id: 1 } }))!.qr_checkin_token;

      expect(secondToken).toBe(firstToken);
    });

    it('does not stamp externalPaymentId on a bulk sub-transaction (would collide on the unique column)', async () => {
      const { txn } = await seedBookingPayment({
        transactionRef: 'BULK-1-100',
        bulkRef: 'BULK-1-100',
      });
      await service.applyPaymentEvent({
        status: 'succeeded',
        transactionRef: 'BULK-1-100',
        externalPaymentId: 'shared-intent-id',
      });
      const updated = await manager.findOne(Transaction, { where: { id: txn.id } });
      expect(updated!.externalPaymentId).toBeNull();
    });

    it('rejects a BOOKING_PAYMENT transaction with no linked booking', async () => {
      const txn = manager.create(Transaction, {
        label: 'orphaned',
        fromUserId: 1,
        toUserId: 42,
        amount: 5000,
        currency: 'XOF',
        status: TransactionStatus.PENDING,
        transactionMotifId: TransactionMotif.BOOKING_PAYMENT,
        transactionRef: 'BKG-ORPHAN',
        paymentMethod: 'card',
        paymentProvider: 'stripe',
        externalPaymentId: null,
        balanceBefore: 0,
        balanceAfter: 0,
      });
      await manager.seed(Transaction, txn);
      await expect(
        service.applyPaymentEvent({ status: 'succeeded', transactionRef: 'BKG-ORPHAN' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('booking payment — failure', () => {
    it('marks the booking PAYMENT_FAILED and the transaction FAILED', async () => {
      const { booking, txn } = await seedBookingPayment({ transactionRef: 'BKG-1-100' });
      await service.applyPaymentEvent({ status: 'failed', transactionRef: 'BKG-1-100' });

      const updatedTxn = await manager.findOne(Transaction, { where: { id: txn.id } });
      const updatedBooking = await manager.findOne(Bookings, { where: { id: booking.id } });
      expect(updatedTxn!.status).toBe(TransactionStatus.FAILED);
      expect(updatedBooking!.booking_status).toBe(BookingStatus.PAYMENT_FAILED);
      expect(updatedBooking!.payement_status).toBe(0);
    });

    it('ignores a late failure that arrives after the booking already succeeded', async () => {
      const { booking, txn } = await seedBookingPayment({ transactionRef: 'BKG-1-100' });
      await service.applyPaymentEvent({ status: 'succeeded', transactionRef: 'BKG-1-100' });
      await service.applyPaymentEvent({ status: 'failed', transactionRef: 'BKG-1-100' });

      const updatedTxn = await manager.findOne(Transaction, { where: { id: txn.id } });
      const updatedBooking = await manager.findOne(Bookings, { where: { id: booking.id } });
      expect(updatedTxn!.status).toBe(TransactionStatus.SUCCESS);
      expect(updatedBooking!.booking_status).toBe(BookingStatus.CONFIRMED);
    });
  });

  describe('bulk fan-out', () => {
    it('applies the same event to every transaction sharing a bulkRef in one call', async () => {
      const first = await seedBookingPayment({ transactionRef: 'BKG-1-a', bulkRef: 'BULK-9' });
      const second = await seedBookingPayment({ transactionRef: 'BKG-2-b', bulkRef: 'BULK-9' });

      await service.applyPaymentEvent({ status: 'succeeded', transactionRef: 'BULK-9' });

      for (const { booking, txn } of [first, second]) {
        const updatedTxn = await manager.findOne(Transaction, { where: { id: txn.id } });
        const updatedBooking = await manager.findOne(Bookings, { where: { id: booking.id } });
        expect(updatedTxn!.status).toBe(TransactionStatus.SUCCESS);
        expect(updatedBooking!.booking_status).toBe(BookingStatus.CONFIRMED);
      }
    });

    it('stops at the bulk match and never falls through to the single transactionRef lookup', async () => {
      const bulk = await seedBookingPayment({ transactionRef: 'BKG-9-x', bulkRef: 'SHARED-REF' });
      // Decoy: an unrelated, non-bulk transaction whose OWN transactionRef
      // happens to equal the incoming event's ref. If the single-ref lookup
      // ran, it would match and mutate this one too.
      const decoy = manager.create(Transaction, {
        label: 'decoy',
        fromUserId: 3,
        toUserId: 3,       
        @Roles('provider', 'admin','enroller', 'manager')
        @Post('/services')
        createService() { ... }
        amount: 100,
        currency: 'XOF',
        status: TransactionStatus.PENDING,
        transactionMotifId: TransactionMotif.WALLET_DEPOSIT,
        transactionRef: 'SHARED-REF',
        paymentMethod: 'card',
        paymentProvider: 'stripe',
        externalPaymentId: null,
        balanceBefore: 0,
        balanceAfter: 0,
      });
      await manager.seed(Transaction, decoy);

      await service.applyPaymentEvent({ status: 'succeeded', transactionRef: 'SHARED-REF' });

      const updatedBulk = await manager.findOne(Transaction, { where: { id: bulk.txn.id } });
      const updatedDecoy = await manager.findOne(Transaction, { where: { id: decoy.id } });
      expect(updatedBulk!.status).toBe(TransactionStatus.SUCCESS);
      expect(updatedDecoy!.status).toBe(TransactionStatus.PENDING);
    });
  });

  describe('wallet deposit', () => {
    async function seedDeposit(status = TransactionStatus.PENDING) {
      const wallet = manager.create(ClientWallet, { client_id: 7, balance: 1000 });
      await manager.seed(ClientWallet, wallet);
      const txn = manager.create(Transaction, {
        label: 'Deposit',
        fromUserId: 7,
        toUserId: 7,
        amount: 2000,
        currency: 'XOF',
        status,
        transactionMotifId: TransactionMotif.WALLET_DEPOSIT,
        transactionRef: 'DEP-1',
        paymentMethod: 'card',
        paymentProvider: 'stripe',
        externalPaymentId: null,
        balanceBefore: 1000,
        balanceAfter: 1000,
      });
      await manager.seed(Transaction, txn);
      return { wallet, txn };
    }

    it('credits the wallet and marks the transaction SUCCESS', async () => {
      usersRepo.findOne.mockResolvedValue({ id: 7, email: 'a@b.com', firstname: 'A', fcm_token: null });
      const { wallet, txn } = await seedDeposit();

      await service.applyPaymentEvent({ status: 'succeeded', transactionRef: 'DEP-1' });

      const updatedWallet = await manager.findOne(ClientWallet, { where: { id: wallet.id } });
      const updatedTxn = await manager.findOne(Transaction, { where: { id: txn.id } });
      expect(updatedWallet!.balance).toBe(3000);
      expect(updatedTxn!.status).toBe(TransactionStatus.SUCCESS);
      expect(updatedTxn!.balanceAfter).toBe(3000);
      expect(notificationRepo.save).toHaveBeenCalled();
      expect(mailService.sendMail).toHaveBeenCalled();
    });

    it('is idempotent: a repeated success webhook does not double-credit the wallet', async () => {
      const { wallet } = await seedDeposit();
      await service.applyPaymentEvent({ status: 'succeeded', transactionRef: 'DEP-1' });
      await service.applyPaymentEvent({ status: 'succeeded', transactionRef: 'DEP-1' });

      const updatedWallet = await manager.findOne(ClientWallet, { where: { id: wallet.id } });
      expect(updatedWallet!.balance).toBe(3000);
    });

    it('throws NotFoundException when the client has no wallet row at all', async () => {
      const txn = manager.create(Transaction, {
        label: 'Deposit',
        fromUserId: 99,
        toUserId: 99,
        amount: 2000,
        currency: 'XOF',
        status: TransactionStatus.PENDING,
        transactionMotifId: TransactionMotif.WALLET_DEPOSIT,
        transactionRef: 'DEP-NO-WALLET',
        paymentMethod: 'card',
        paymentProvider: 'stripe',
        externalPaymentId: null,
        balanceBefore: 0,
        balanceAfter: 0,
      });
      await manager.seed(Transaction, txn);

      await expect(
        service.applyPaymentEvent({ status: 'succeeded', transactionRef: 'DEP-NO-WALLET' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('marks a failed deposit FAILED without touching the wallet balance', async () => {
      const { wallet } = await seedDeposit();
      await service.applyPaymentEvent({ status: 'failed', transactionRef: 'DEP-1' });
      const updatedWallet = await manager.findOne(ClientWallet, { where: { id: wallet.id } });
      expect(updatedWallet!.balance).toBe(1000);
    });
  });

  describe('unsupported motif', () => {
    it('throws BadRequestException for a transaction motif the webhook does not handle', async () => {
      const txn = manager.create(Transaction, {
        label: 'Unknown motif',
        fromUserId: 1,
        toUserId: 2,
        amount: 100,
        currency: 'XOF',
        status: TransactionStatus.PENDING,
        transactionMotifId: 999,
        transactionRef: 'WEIRD-1',
        paymentMethod: 'card',
        paymentProvider: 'stripe',
        externalPaymentId: null,
        balanceBefore: 0,
        balanceAfter: 0,
      });
      await manager.seed(Transaction, txn);

      await expect(
        service.applyPaymentEvent({ status: 'succeeded', transactionRef: 'WEIRD-1' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
