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
import { StripeService } from '../payments/stripe.service';
import { KkiapayService } from '../payments/kkiapay.service';
import { InitiateDepositDto } from './dtos/initiate-deposit.dto';

export interface DepositResult {
  transaction: Transaction;
  clientInstructions: Record<string, unknown>;
}

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,

    @InjectRepository(ClientWallet)
    private readonly clientWalletRepository: Repository<ClientWallet>,

    private readonly dataSource: DataSource,
    private readonly stripeService: StripeService,
    private readonly kkiapayService: KkiapayService,
  ) {}

  /**
   * Create a pending deposit and return provider-specific client instructions
   * so the mobile app can complete the payment via Stripe SDK or Kkiapay widget.
   */
  async initiateDeposit(dto: InitiateDepositDto): Promise<DepositResult> {
    const { clientId, amount, paymentChannel, paymentProvider } = dto;

    if (!amount || amount <= 0) {
      throw new BadRequestException('Invalid deposit amount');
    }

    // Ensure wallet exists
    let wallet = await this.clientWalletRepository.findOne({
      where: { client_id: clientId },
    });
    if (!wallet) {
      wallet = await this.clientWalletRepository.save(
        this.clientWalletRepository.create({ client_id: clientId, balance: 0 }),
      );
    }

    const transactionRef = `DEP-${Date.now()}-${clientId}`;

    const transaction = this.transactionRepository.create({
      label: 'Wallet deposit',
      fromUserId: clientId,
      toUserId: clientId,
      amount,
      currency: 'XOF',
      paymentMethod: paymentChannel,
      paymentProvider,
      externalPaymentId: null,
      status: TransactionStatus.PENDING,
      transactionMotifId: TransactionMotif.WALLET_DEPOSIT,
      transactionRef,
      balanceBefore: wallet.balance,
      balanceAfter: wallet.balance, // updated on confirmation
    });

    await this.transactionRepository.save(transaction);

    // Build provider-specific instructions for the mobile app
    let clientInstructions: Record<string, unknown>;

    if (paymentProvider === 'stripe') {
      if (!this.stripeService.isConfigured) {
        throw new BadRequestException(
          'Stripe is not configured on the server (missing STRIPE_SECRET_KEY)',
        );
      }

      const intent = await this.stripeService.createPaymentIntent({
        amount,
        currency: 'XOF',
        metadata: {
          transactionRef,
          type: 'wallet_deposit',
          clientId: String(clientId),
        },
      });
      transaction.externalPaymentId = intent.paymentIntentId;
      await this.transactionRepository.save(transaction);

      clientInstructions = {
        provider: 'stripe',
        publishableKey: this.stripeService.publishableKey,
        clientSecret: intent.clientSecret,
        paymentIntentId: intent.paymentIntentId,
        transactionRef,
        amount,
        currency: 'xof',
      };
    } else if (paymentProvider === 'kkiapay') {
      if (!this.kkiapayService.isConfigured) {
        throw new BadRequestException(
          'Kkiapay is not configured on the server (missing KKIAPAY_PRIVATE_KEY)',
        );
      }

      clientInstructions = {
        ...this.kkiapayService.buildWidgetPayload({
          amount,
          transactionRef,
          reason: 'Ikigai wallet top-up',
        }),
        transactionRef,
      };
    } else {
      // Sandbox fallback
      clientInstructions = {
        provider: 'sandbox',
        hint: 'POST /payments/webhooks/sandbox to simulate success',
        simulateWebhook: {
          method: 'POST',
          path: '/payments/webhooks/sandbox',
          body: {
            transactionRef,
            status: 'succeeded',
            externalPaymentId: `sandbox-${transactionRef}`,
          },
        },
      };
    }

    return { transaction, clientInstructions };
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

      if (transaction.transactionMotifId === TransactionMotif.BOOKING_PAYMENT) {
        throw new BadRequestException(
          'Booking payments are confirmed via payment webhooks only',
        );
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
      currency: 'XOF',
      paymentMethod: 'wallet',
      paymentProvider: null,
      externalPaymentId: null,
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

      if (transaction.transactionMotifId === TransactionMotif.BOOKING_PAYMENT) {
        throw new BadRequestException(
          'Booking payments are confirmed via payment webhooks only',
        );
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
