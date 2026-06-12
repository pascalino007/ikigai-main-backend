import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ProWallet } from './pro_wallet.entity';
import { Transaction } from '../../transaction/transaction.entity';
import { Shops } from '../../shops/shop.entity';
import { Bookings } from '../../client/bookings/bookings.entity';
import { Subscription } from '../../subscriptions/subscription.entity';
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

  async creditForBooking(shopId: number, amount: number, label: string, transactionRef: string) {
    const wallet = await this.getOrCreateWallet(shopId);
    const before = wallet.balance;
    wallet.balance += amount;
    await this.walletRepo.save(wallet);
    const shop = await this.shopsRepo.findOne({ where: { id: shopId } });
    const tx = this.transactionRepo.create({
      label, fromUserId: 0, toUserId: shop?.user_id ?? 0,
      amount, currency: 'XOF', status: 1, transactionMotifId: 9,
      transactionRef, paymentMethod: 'system', paymentProvider: 'system',
      externalPaymentId: null, balanceBefore: before,
      balanceAfter: wallet.balance, bookingId: null,
    });
    await this.transactionRepo.save(tx);
    return wallet;
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
