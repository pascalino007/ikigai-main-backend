import { BadRequestException } from '@nestjs/common';
import { ProWalletService } from './pro_wallet.service';
import { ProWallet } from './pro_wallet.entity';
import { Transaction } from '../../transaction/transaction.entity';
import { Bookings } from '../../client/bookings/bookings.entity';
import { Shops } from '../../shops/shop.entity';
import { BookingStatus } from '../../client/bookings/booking-status.constants';
import { TransactionMotif, TransactionStatus } from '../../transaction/transaction.contants';
import { FakeManager, makeFakeDataSource } from '../../test-utils/fake-manager';

describe('ProWalletService.creditForBooking', () => {
  let manager: FakeManager;
  let dataSource: ReturnType<typeof makeFakeDataSource>;
  let walletRepo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
  let transactionRepo: { find: jest.Mock; findOne: jest.Mock };
  let shopsRepo: { findOne: jest.Mock };
  let bookingRepo: { find: jest.Mock };
  let service: ProWalletService;

  beforeEach(async () => {
    manager = new FakeManager();
    dataSource = makeFakeDataSource(manager);
    walletRepo = { findOne: jest.fn(), save: jest.fn(), create: jest.fn() };
    transactionRepo = { find: jest.fn(), findOne: jest.fn() };
    shopsRepo = { findOne: jest.fn().mockResolvedValue({ id: 42, user_id: 5 }) };
    bookingRepo = { find: jest.fn() };

    service = new ProWalletService(
      walletRepo as never,
      transactionRepo as never,
      shopsRepo as never,
      bookingRepo as never,
      {} as never, // subscriptionRepo — unused by creditForBooking/reconcileBookingCredits
      dataSource as never,
    );

    // Pre-seed the shop's wallet and the shop itself in the fake manager —
    // creditForBooking reads both through `manager`, not through the injected repos.
    await manager.seed(ProWallet, manager.create(ProWallet, { shop_id: 42, balance: 0 }));
    await manager.seed(Shops, manager.create(Shops, { id: 42, user_id: 5 }));
  });

  it('rejects a non-positive gross amount', async () => {
    await expect(service.creditForBooking(42, 0, 'label', 1)).rejects.toThrow(BadRequestException);
    await expect(service.creditForBooking(42, -100, 'label', 1)).rejects.toThrow(BadRequestException);
  });

  it('credits 90% of the gross amount to the wallet and books the 10% commission separately', async () => {
    await service.creditForBooking(42, 1000, 'Booking #1 completed', 1);

    const wallet = await manager.findOne(ProWallet, { where: { shop_id: 42 } });
    expect(wallet!.balance).toBe(900);

    const payout = await manager.findOne(Transaction, { where: { transactionRef: 'BOOKING-PAYOUT-1' } });
    expect(payout).toMatchObject({
      amount: 900,
      status: TransactionStatus.SUCCESS,
      transactionMotifId: TransactionMotif.PROVIDER_PAYOUT,
      toUserId: 5,
    });

    const commission = await manager.findOne(Transaction, {
      where: { transactionRef: 'BOOKING-COMMISSION-1' },
    });
    expect(commission).toMatchObject({
      amount: 100,
      status: TransactionStatus.SUCCESS,
      transactionMotifId: TransactionMotif.ADMIN_COMMISSION,
      fromUserId: 5,
    });
    // The commission entry is audit-only — it must never move the wallet balance itself.
    expect(commission!.balanceBefore).toBe(0);
    expect(commission!.balanceAfter).toBe(0);
  });

  it('rounds the commission (round-half-up) rather than truncating', async () => {
    await service.creditForBooking(42, 999, 'label', 2);
    const payout = await manager.findOne(Transaction, { where: { transactionRef: 'BOOKING-PAYOUT-2' } });
    const commission = await manager.findOne(Transaction, {
      where: { transactionRef: 'BOOKING-COMMISSION-2' },
    });
    expect(commission!.amount).toBe(100); // round(99.9) = 100
    expect(payout!.amount).toBe(899);
  });

  it('is idempotent per booking: a second call for the same bookingId does not double-credit', async () => {
    await service.creditForBooking(42, 1000, 'label', 3);
    await service.creditForBooking(42, 1000, 'label', 3);

    const wallet = await manager.findOne(ProWallet, { where: { shop_id: 42 } });
    expect(wallet!.balance).toBe(900);

    const payouts = await manager.find(Transaction, { where: { transactionRef: 'BOOKING-PAYOUT-3' } });
    expect(payouts).toHaveLength(1);
  });

  it('recovers from a partial prior failure: backfills a missing commission entry without re-crediting the payout', async () => {
    // Simulate a previous run that recorded the payout but crashed before the
    // commission entry was written (each idempotency check is independent).
    const wallet = await manager.findOne(ProWallet, { where: { shop_id: 42 } });
    wallet!.balance = 900;
    await manager.save(ProWallet, wallet!);
    await manager.seed(
      Transaction,
      manager.create(Transaction, {
        label: 'prior payout',
        fromUserId: 0,
        toUserId: 5,
        amount: 900,
        currency: 'XOF',
        status: TransactionStatus.SUCCESS,
        transactionMotifId: TransactionMotif.PROVIDER_PAYOUT,
        transactionRef: 'BOOKING-PAYOUT-4',
        paymentMethod: 'system',
        paymentProvider: 'system',
        externalPaymentId: null,
        balanceBefore: 0,
        balanceAfter: 900,
      }),
    );

    await service.creditForBooking(42, 1000, 'label', 4);

    const updatedWallet = await manager.findOne(ProWallet, { where: { shop_id: 42 } });
    expect(updatedWallet!.balance).toBe(900); // unchanged — payout was not re-applied
    const commission = await manager.findOne(Transaction, {
      where: { transactionRef: 'BOOKING-COMMISSION-4' },
    });
    expect(commission).not.toBeNull();
    expect(commission!.amount).toBe(100);
  });

  it('auto-creates the wallet on first credit if the shop had none yet', async () => {
    const result = await service.creditForBooking(99, 1000, 'label', 5);
    expect(result.shop_id).toBe(99);
    expect(result.balance).toBe(900);
  });
});

describe('ProWalletService.reconcileBookingCredits', () => {
  let manager: FakeManager;
  let dataSource: ReturnType<typeof makeFakeDataSource>;
  let transactionRepo: { findOne: jest.Mock };
  let bookingRepo: { find: jest.Mock };
  let shopsRepo: { findOne: jest.Mock };
  let service: ProWalletService;

  beforeEach(() => {
    manager = new FakeManager();
    dataSource = makeFakeDataSource(manager);
    transactionRepo = { findOne: jest.fn() };
    bookingRepo = { find: jest.fn() };
    shopsRepo = { findOne: jest.fn().mockResolvedValue({ id: 42, user_id: 5 }) };

    service = new ProWalletService(
      {} as never, // walletRepo — unused directly (creditForBooking uses the manager)
      transactionRepo as never,
      shopsRepo as never,
      bookingRepo as never,
      {} as never,
      dataSource as never,
    );
  });

  it('credits only the DONE bookings missing a payout, and reports counts', async () => {
    const doneBookings = [
      { id: 10, provider_id: 42, amount: 1000, booking_status: BookingStatus.DONE },
      { id: 11, provider_id: 42, amount: 2000, booking_status: BookingStatus.DONE },
    ];
    bookingRepo.find.mockResolvedValue(doneBookings);
    // Booking #10 already has a payout; #11 does not.
    transactionRepo.findOne.mockImplementation(({ where }: { where: { transactionRef: string } }) =>
      Promise.resolve(where.transactionRef === 'BOOKING-PAYOUT-10' ? { id: 1 } : null),
    );

    const result = await service.reconcileBookingCredits();

    expect(result).toMatchObject({
      dryRun: false,
      scanned: 2,
      alreadyCredited: 1,
      credited: 1,
      amountCredited: 2000,
      creditedBookingIds: [11],
    });

    const wallet = await manager.findOne(ProWallet, { where: { shop_id: 42 } });
    expect(wallet!.balance).toBe(1800); // 2000 gross - 10% commission
  });

  it('dryRun reports what would be credited without touching any wallet', async () => {
    bookingRepo.find.mockResolvedValue([
      { id: 20, provider_id: 42, amount: 1000, booking_status: BookingStatus.DONE },
    ]);
    transactionRepo.findOne.mockResolvedValue(null);

    const result = await service.reconcileBookingCredits({ dryRun: true });

    expect(result).toMatchObject({ dryRun: true, credited: 1, creditedBookingIds: [20] });
    const wallet = await manager.findOne(ProWallet, { where: { shop_id: 42 } });
    expect(wallet).toBeNull(); // no wallet was ever created/credited
  });

  it('skips bookings with no provider or a non-positive amount', async () => {
    bookingRepo.find.mockResolvedValue([
      { id: 30, provider_id: null, amount: 1000, booking_status: BookingStatus.DONE },
      { id: 31, provider_id: 42, amount: 0, booking_status: BookingStatus.DONE },
    ]);
    const result = await service.reconcileBookingCredits();
    expect(result.scanned).toBe(0);
    expect(result.credited).toBe(0);
  });
});
