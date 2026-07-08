import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ProWallet } from './pro_wallet.entity';
import { Transaction } from '../../transaction/transaction.entity';
import { Shops } from '../../shops/shop.entity';
import { Bookings } from '../../client/bookings/bookings.entity';
import { Subscription } from '../../subscriptions/subscription.entity';
import { BookingStatus } from '../../client/bookings/booking-status.constants';
import { TransactionStatus, TransactionMotif } from '../../transaction/transaction.contants';

@Injectable()
export class ProWalletService {
  constructor(
    @InjectRepository(ProWallet)
    private readonly walletRepo: Repository<ProWallet>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectRepository(Shops)
    private readonly shopsRepo: Repository<Shops>,
    @InjectRepository(Bookings)
    private readonly bookingRepo: Repository<Bookings>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    private readonly dataSource: DataSource,
  ) {}

  async getOrCreateWallet(shopId: number): Promise<ProWallet> {
    let wallet = await this.walletRepo.findOne({ where: { shop_id: shopId } });
    if (!wallet) {
      wallet = await this.walletRepo.save(
        this.walletRepo.create({ shop_id: shopId, balance: 0 }),
      );
    }
    return wallet;
  }

  async getSummary(shopId: number) {
    const w = await this.getOrCreateWallet(shopId);
    return { shopId: w.shop_id, balance: w.balance, currency: 'XOF' };
  }

  async getTransactions(shopId: number): Promise<Transaction[]> {
    const shop = await this.shopsRepo.findOne({ where: { id: shopId } });
    if (!shop) throw new NotFoundException(`Shop #${shopId} not found`);
    const userId = shop.user_id ?? 0;
    return this.transactionRepo.find({
      where: [{ toUserId: userId }, { fromUserId: userId }],
      order: { createdAt: 'DESC' },
    });
  }

  async requestWithdrawal(shopId: number, amount: number, phone?: string): Promise<Transaction> {
    if (!amount || amount <= 0) throw new BadRequestException('Invalid withdrawal amount');

    return this.dataSource.transaction(async (manager) => {
      let wallet = await manager.findOne(ProWallet, {
        where: { shop_id: shopId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!wallet) {
        wallet = manager.create(ProWallet, { shop_id: shopId, balance: 0 });
        await manager.save(ProWallet, wallet);
      }

      if (wallet.balance < amount) throw new BadRequestException('Insufficient balance');

      const shop = await manager.findOne(Shops, { where: { id: shopId } });
      const userId = shop?.user_id ?? 0;
      const transactionRef = `PRO-WDR-${Date.now()}-${shopId}`;
      const before = wallet.balance;

      wallet.balance -= amount;
      await manager.save(ProWallet, wallet);

      const tx = manager.create(Transaction, {
        label: `Demande de retrait${phone ? ` vers ${phone}` : ''}`,
        fromUserId: userId,
        toUserId: 0,
        amount,
        currency: 'XOF',
        status: TransactionStatus.PENDING,
        transactionMotifId: TransactionMotif.WITHDRAWAL,
        transactionRef,
        paymentMethod: 'mobile_money',
        paymentProvider: 'manual',
        externalPaymentId: null,
        balanceBefore: before,
        balanceAfter: wallet.balance,
        metadata: { shopId, phone },
      });
      return manager.save(Transaction, tx);
    });
  }

  /**
   * Atomically credit a shop wallet and record a ledger transaction.
   *
   * The whole operation runs inside a single DB transaction with a
   * pessimistic write-lock on the wallet row, so concurrent credits to the
   * same shop are serialized (prevents the lost-update race where two
   * bookings completing at once would overwrite each other's balance).
   *
   * Idempotency is enforced two ways:
   *  - `transactionRef` is UNIQUE at the DB level, so a duplicate insert fails.
   *  - we no-op early if a transaction with the same ref already exists.
   */
  private async applyWalletCredit(
    shopId: number,
    amount: number,
    label: string,
    opts: { transactionRef: string; bookingId?: number | null; motif: number },
  ): Promise<ProWallet> {
    if (!amount || amount <= 0) throw new BadRequestException('Invalid credit amount');

    return this.dataSource.transaction(async (manager) => {
      // Lock the wallet first so all credits to this shop are serialized.
      let wallet = await manager.findOne(ProWallet, {
        where: { shop_id: shopId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!wallet) {
        wallet = manager.create(ProWallet, { shop_id: shopId, balance: 0 });
        await manager.save(ProWallet, wallet);
      }

      // Idempotency: never apply the same credit twice.
      const existing = await manager.findOne(Transaction, {
        where: { transactionRef: opts.transactionRef },
      });
      if (existing) return wallet;

      const before = wallet.balance;
      wallet.balance += amount;
      await manager.save(ProWallet, wallet);

      const shop = await manager.findOne(Shops, { where: { id: shopId } });
      const tx = manager.create(Transaction, {
        label,
        fromUserId: 0,
        toUserId: shop?.user_id ?? 0,
        amount,
        currency: 'XOF',
        status: TransactionStatus.SUCCESS,
        transactionMotifId: opts.motif,
        transactionRef: opts.transactionRef,
        paymentMethod: 'system',
        paymentProvider: 'system',
        externalPaymentId: null,
        balanceBefore: before,
        balanceAfter: wallet.balance,
        booking: opts.bookingId ? ({ id: opts.bookingId } as Bookings) : undefined,
        metadata: { shopId, bookingId: opts.bookingId ?? null },
      });
      await manager.save(Transaction, tx);
      return wallet;
    });
  }

  /**
   * Credit a provider's wallet for a completed booking.
   * Idempotent per booking: a deterministic ref (`BOOKING-PAYOUT-<id>`) means a
   * booking can only ever be credited once, even if the completion event fires
   * twice or is retried.
   */
  async creditForBooking(
    shopId: number,
    amount: number,
    label: string,
    bookingId: number,
  ): Promise<ProWallet> {
    return this.applyWalletCredit(shopId, amount, label, {
      transactionRef: `BOOKING-PAYOUT-${bookingId}`,
      bookingId,
      motif: TransactionMotif.PROVIDER_PAYOUT,
    });
  }

  /** Manual/admin credit with a caller-supplied (unique) reference. */
  async creditManual(
    shopId: number,
    amount: number,
    label: string,
    transactionRef: string,
  ): Promise<ProWallet> {
    return this.applyWalletCredit(shopId, amount, label, {
      transactionRef,
      motif: TransactionMotif.PROVIDER_PAYOUT,
    });
  }

  /**
   * One-off backfill: ensure every completed booking has its provider payout.
   *
   * Because {@link creditForBooking} is idempotent (keyed on booking id), this
   * is safe to run repeatedly — bookings already credited are skipped and only
   * genuinely-missing payouts are applied. Pass `dryRun` to report what would
   * be credited without touching any wallet.
   */
  async reconcileBookingCredits(opts?: { shopId?: number; dryRun?: boolean }) {
    const where: Record<string, unknown> = { booking_status: BookingStatus.DONE };
    if (opts?.shopId) where.provider_id = opts.shopId;

    const doneBookings = await this.bookingRepo.find({ where });

    let scanned = 0;
    let credited = 0;
    let amountCredited = 0;
    const creditedBookingIds: number[] = [];

    for (const b of doneBookings) {
      if (!b.provider_id || !(b.amount > 0)) continue;
      scanned++;

      const already = await this.transactionRepo.findOne({
        where: { transactionRef: `BOOKING-PAYOUT-${b.id}` },
      });
      if (already) continue;

      if (!opts?.dryRun) {
        await this.creditForBooking(
          b.provider_id,
          b.amount,
          `Booking #${b.id} completed (reconciled)`,
          b.id,
        );
      }
      credited++;
      amountCredited += b.amount;
      creditedBookingIds.push(b.id);
    }

    return {
      dryRun: !!opts?.dryRun,
      scanned,
      alreadyCredited: scanned - credited,
      credited,
      amountCredited,
      creditedBookingIds,
    };
  }

  async paySubscriptionFromWallet(
    shopId: number,
    amount: number,
    plan: string,
    interval: 'month' | 'year',
  ): Promise<{ transaction: Transaction; subscription: Subscription }> {
    if (!amount || amount <= 0) throw new BadRequestException('Invalid subscription amount');

    return this.dataSource.transaction(async (manager) => {
      let wallet = await manager.findOne(ProWallet, {
        where: { shop_id: shopId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!wallet) {
        wallet = manager.create(ProWallet, { shop_id: shopId, balance: 0 });
        await manager.save(ProWallet, wallet);
      }

      if (wallet.balance < amount) throw new BadRequestException('Insufficient balance');

      const shop = await manager.findOne(Shops, { where: { id: shopId } });
      const userId = shop?.user_id ?? 0;
      const transactionRef = `PRO-SUB-${Date.now()}-${shopId}`;
      const before = wallet.balance;

      wallet.balance -= amount;
      await manager.save(ProWallet, wallet);

      const tx = manager.create(Transaction, {
        label: `Abonnement ${plan} (${interval})`,
        fromUserId: userId,
        toUserId: 0,
        amount,
        currency: 'XOF',
        status: TransactionStatus.SUCCESS,
        transactionMotifId: TransactionMotif.SUBSCRIPTION,
        transactionRef,
        paymentMethod: 'wallet',
        paymentProvider: 'pro_wallet',
        externalPaymentId: null,
        balanceBefore: before,
        balanceAfter: wallet.balance,
        metadata: { shopId, plan, interval, userId },
      });
      await manager.save(Transaction, tx);

      const sub = manager.create(Subscription, {
        user_id: userId,
        shop_id: shopId,
        plan,
        status: 'active',
        price: amount,
        currency: 'XOF',
        interval,
        started_at: new Date(),
        next_billing: interval === 'year'
          ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      await manager.save(Subscription, sub);

      return { transaction: tx, subscription: sub };
    });
  }
}
