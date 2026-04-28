import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ClientWallet } from './client_wallet.entity';
import { Transaction } from '../../transaction/transaction.entity';
import { Users } from '../../users/user.entity';

@Injectable()
export class ClientWalletService {
  constructor(
    @InjectRepository(ClientWallet)
    private readonly walletRepo: Repository<ClientWallet>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectRepository(Users)
    private readonly usersRepo: Repository<Users>,
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

  /** Get all wallets with client info (admin) */
  async findAllWithClientInfo(): Promise<any[]> {
    const wallets = await this.walletRepo.find();
    
    // Get all client IDs
    const clientIds = wallets.map(w => w.client_id);
    
    // Fetch user data for these clients
    const users = clientIds.length > 0 
      ? await this.usersRepo.find({ where: { id: In(clientIds) } as any })
      : [];
    const userMap = new Map(users.map(u => [u.id, u]));
    
    // Merge wallet with client info
    return wallets.map(wallet => ({
      ...wallet,
      client: userMap.get(wallet.client_id) || null,
    }));
  }

  /** Manual top-up by admin */
  async manualTopUp(walletId: number, amount: number): Promise<ClientWallet> {
    const wallet = await this.walletRepo.findOne({ where: { id: walletId } });
    if (!wallet) {
      throw new NotFoundException(`Wallet #${walletId} not found`);
    }

    // Update wallet balance
    wallet.balance += amount;
    await this.walletRepo.save(wallet);

    // Create transaction record
    const transaction = this.transactionRepo.create({
      label: 'Manual top-up by admin',
      fromUserId: 0, // System/admin
      toUserId: wallet.client_id,
      amount: amount,
      currency: 'XOF',
      status: 1, // success
      transactionMotifId: 1, // deposit
      transactionRef: `ADMIN-TOPUP-${Date.now()}-${wallet.client_id}`,
      paymentMethod: 'admin_manual',
      paymentProvider: 'system',
      externalPaymentId: null,
      balanceBefore: wallet.balance - amount,
      balanceAfter: wallet.balance,
      bookingId: null,
    });
    await this.transactionRepo.save(transaction);

    return wallet;
  }

  /** Reset wallet balance to 0 by admin */
  async resetToZero(walletId: number): Promise<ClientWallet> {
    const wallet = await this.walletRepo.findOne({ where: { id: walletId } });
    if (!wallet) {
      throw new NotFoundException(`Wallet #${walletId} not found`);
    }

    const previousBalance = wallet.balance;
    if (previousBalance === 0) {
      return wallet; // Already at 0
    }

    // Update wallet balance to 0
    wallet.balance = 0;
    await this.walletRepo.save(wallet);

    // Create transaction record
    const transaction = this.transactionRepo.create({
      label: 'Reset to zero by admin',
      fromUserId: wallet.client_id,
      toUserId: 0, // System/admin receiving the balance back
      amount: previousBalance,
      currency: 'XOF',
      status: 1, // success
      transactionMotifId: 7, // adjustment/other
      transactionRef: `ADMIN-RESET-${Date.now()}-${wallet.client_id}`,
      paymentMethod: 'admin_manual',
      paymentProvider: 'system',
      externalPaymentId: null,
      balanceBefore: previousBalance,
      balanceAfter: 0,
      bookingId: null,
    });
    await this.transactionRepo.save(transaction);

    return wallet;
  }
}
