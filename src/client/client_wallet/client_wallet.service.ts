import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientWallet } from './client_wallet.entity';
import { Transaction } from '../../transaction/transaction.entity';

@Injectable()
export class ClientWalletService {
  constructor(
    @InjectRepository(ClientWallet)
    private readonly walletRepo: Repository<ClientWallet>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
  ) {}

  /** Creates wallet if missing (e.g. users registered before wallet auto-create). */
  async getOrCreateWallet(clientId: number): Promise<ClientWallet> {
    let wallet = await this.walletRepo.findOne({
      where: { client_id: clientId },
    });
    if (!wallet) {
      wallet = await this.walletRepo.save(
        this.walletRepo.create({ client_id: clientId, balance: 0 }),
      );
    }
    return wallet;
  }

  async getSummary(clientId: number): Promise<{
    clientId: number;
    balance: number;
    currency: string;
  }> {
    const w = await this.getOrCreateWallet(clientId);
    return {
      clientId: w.client_id,
      balance: w.balance,
      currency: 'XOF',
    };
  }

  async listTransactionsForUser(
    clientId: number,
    limit = 50,
  ): Promise<Transaction[]> {
    await this.getOrCreateWallet(clientId);
    return this.transactionRepo.find({
      where: [{ fromUserId: clientId }, { toUserId: clientId }],
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }
}
