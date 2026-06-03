import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProWallet } from './pro_wallet.entity';
import { Transaction } from '../../transaction/transaction.entity';
import { Shops } from '../../shops/shop.entity';

@Injectable()
export class ProWalletService {
  constructor(
    @InjectRepository(ProWallet)
    private readonly walletRepo: Repository<ProWallet>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectRepository(Shops)
    private readonly shopsRepo: Repository<Shops>,
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
}
