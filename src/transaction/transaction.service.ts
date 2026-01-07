import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Transaction } from './transaction.entity';
import { ClientWallet } from 'src/client/client_wallet/client_wallet.entity';
import { TransactionMotif, TransactionStatus } from './transaction.contants';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,

    @InjectRepository(ClientWallet)
    private readonly clientWalletRepository: Repository<ClientWallet>,

    private readonly dataSource: DataSource,
  ) {}

  
  async initiateDeposit(
    clientId: number,
    amount: number,
    paymentMethod: string,
  ): Promise<Transaction> {
    if (!amount || amount <= 0) {
      throw new BadRequestException('Invalid deposit amount');
    }

    const wallet = await this.clientWalletRepository.findOne({
      where: { client_id: clientId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const transaction = this.transactionRepository.create({
      label: 'Wallet deposit',
      fromUserId: clientId,
      toUserId: clientId,
      amount,
      paymentMethod,
      status: TransactionStatus.PENDING, // 0
      transactionMotifId: TransactionMotif.WALLET_DEPOSIT,
      transactionRef: `DEP-${Date.now()}-${clientId}`,
      balanceBefore: wallet.balance,
      balanceAfter: wallet.balance + amount,
    });

    return this.transactionRepository.save(transaction);
  }

  
  async confirmDeposit(transactionRef: string): Promise<Transaction> {
    return this.dataSource.transaction(async (manager) => {
      const transaction = await manager.findOne(Transaction, {
        where: { transactionRef },
        lock: { mode: 'pessimistic_write' },
      });

      if (!transaction) {
        throw new NotFoundException('Transaction not found');
      }

      if (transaction.status === TransactionStatus.SUCCESS) {
        throw new BadRequestException('Transaction already confirmed');
      }

      const wallet = await manager.findOne(ClientWallet, {
        where: { client_id: transaction.toUserId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      wallet.balance += transaction.amount;
      await manager.save(ClientWallet, wallet);

      transaction.status = TransactionStatus.SUCCESS; // 1
      transaction.balanceAfter = wallet.balance;

      return manager.save(Transaction, transaction);
    });
  }

 
  async initiateUserPayment(
    fromUserId: number,
    toUserId: number,
    amount: number,
  ): Promise<Transaction> {
    if (!amount || amount <= 0) {
      throw new BadRequestException('Invalid payment amount');
    }

    if (fromUserId === toUserId) {
      throw new BadRequestException('Cannot pay yourself');
    }

    const senderWallet = await this.clientWalletRepository.findOne({
      where: { client_id: fromUserId },
    });

    if (!senderWallet) {
      throw new NotFoundException('Sender wallet not found');
    }

    if (senderWallet.balance < amount) {
      throw new BadRequestException('Insufficient balance');
    }

    const transaction = this.transactionRepository.create({
      label: 'User payment',
      fromUserId,
      toUserId,
      amount,
      paymentMethod: 'wallet',
      status: TransactionStatus.PENDING, // 0
      transactionMotifId: TransactionMotif.ORDER_PAYMENT,
      transactionRef: `PAY-${Date.now()}-${fromUserId}-${toUserId}`,
      balanceBefore: senderWallet.balance,
      balanceAfter: senderWallet.balance - amount,
    });

    return this.transactionRepository.save(transaction);
  }

  
  async confirmUserPayment(transactionRef: string): Promise<Transaction> {
    return this.dataSource.transaction(async (manager) => {
      const transaction = await manager.findOne(Transaction, {
        where: { transactionRef },
        lock: { mode: 'pessimistic_write' },
      });

      if (!transaction) {
        throw new NotFoundException('Transaction not found');
      }

      if (transaction.status === TransactionStatus.SUCCESS) {
        throw new BadRequestException('Transaction already confirmed');
      }

      const senderWallet = await manager.findOne(ClientWallet, {
        where: { client_id: transaction.fromUserId },
        lock: { mode: 'pessimistic_write' },
      });

      const receiverWallet = await manager.findOne(ClientWallet, {
        where: { client_id: transaction.toUserId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!senderWallet || !receiverWallet) {
        throw new NotFoundException('Wallet not found');
      }

      if (senderWallet.balance < transaction.amount) {
        throw new BadRequestException('Insufficient balance');
      }

      // 💸 Debit sender
      senderWallet.balance -= transaction.amount;
      await manager.save(ClientWallet, senderWallet);

      // 💰 Credit receiver
      receiverWallet.balance += transaction.amount;
      await manager.save(ClientWallet, receiverWallet);

      transaction.status = TransactionStatus.SUCCESS;
      transaction.balanceAfter = senderWallet.balance;

      return manager.save(Transaction, transaction);
    });
  }

 
  async getUserTransactions(clientId: number): Promise<Transaction[]> {
    return this.transactionRepository.find({
      where: [{ fromUserId: clientId }, { toUserId: clientId }],
      order: { createdAt: 'DESC' },
    });
  }

 
  async getAllTransactions(): Promise<Transaction[]> {
    return this.transactionRepository.find({
      order: { createdAt: 'DESC' },
    });
  }
}
