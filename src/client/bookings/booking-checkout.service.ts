import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Bookings } from './bookings.entity';
import { Transaction } from '../../transaction/transaction.entity';
import { Services } from '../../services/services.entity';
import { ClientWallet } from '../client_wallet/client_wallet.entity';
import { InitiateBookingCheckoutDto } from './dtos/initiate-booking-checkout.dto';
import { BookingStatus } from './booking-status.constants';
import { parseServicePriceToAmount } from './service-price.util';
import { TransactionMotif, TransactionStatus } from '../../transaction/transaction.contants';
import { StripeService } from '../../payments/stripe.service';
import { KkiapayService } from '../../payments/kkiapay.service';
import * as crypto from 'crypto';

export interface BookingCheckoutResult {
  /** 'confirmed' if paid from wallet, 'pending_payment' if external */
  status: 'confirmed' | 'pending_payment';
  booking: Bookings;
  transaction: Transaction;
  payment: {
    provider: string;
    transactionRef: string;
    amount: number;
    currency: string;
    clientInstructions: Record<string, unknown>;
  };
}

@Injectable()
export class BookingCheckoutService {
  constructor(
    @InjectRepository(Services)
    private readonly servicesRepo: Repository<Services>,
    @InjectRepository(ClientWallet)
    private readonly walletRepo: Repository<ClientWallet>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly stripeService: StripeService,
    private readonly kkiapayService: KkiapayService,
  ) {}

  async initiateCheckout(
    dto: InitiateBookingCheckoutDto,
  ): Promise<BookingCheckoutResult> {
    const service = await this.servicesRepo.findOne({
      where: { id: dto.service_id },
    });
    if (!service) {
      throw new NotFoundException('Service not found');
    }
    if (!service.is_active) {
      throw new BadRequestException('Service is not available');
    }
    if (service.provider_id !== dto.provider_id) {
      throw new BadRequestException('Service does not belong to this provider');
    }

    const amount = parseServicePriceToAmount(service.price);
    const currency = 'XOF';

    // ── WALLET PAYMENT PATH ──
    if (dto.payment_provider === 'wallet') {
      return this.checkoutWithWallet(dto, amount, currency);
    }

    // ── EXTERNAL PAYMENT PATH (Stripe / Kkiapay / sandbox) ──
    return this.checkoutWithExternalProvider(dto, amount, currency);
  }

  /**
   * Pay booking from wallet balance.
   * If insufficient → throw 402 with balance info so the app can show top-up screen.
   */
  private async checkoutWithWallet(
    dto: InitiateBookingCheckoutDto,
    amount: number,
    currency: string,
  ): Promise<BookingCheckoutResult> {
    // Payment goes to the service provider
    const settlementUserId = dto.provider_id;

    return this.dataSource.transaction(async (manager) => {
      // Lock wallet for atomic balance check + debit
      let wallet = await manager.findOne(ClientWallet, {
        where: { client_id: dto.user_id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        wallet = await manager.save(
          ClientWallet,
          manager.create(ClientWallet, { client_id: dto.user_id, balance: 0 }),
        );
      }

      // Insufficient balance → 402
      if (wallet.balance < amount) {
        throw new HttpException(
          {
            statusCode: HttpStatus.PAYMENT_REQUIRED,
            error: 'insufficient_balance',
            message: 'Wallet balance is insufficient for this booking',
            balance: wallet.balance,
            required: amount,
            deficit: amount - wallet.balance,
            currency,
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }

      // Debit wallet
      const balanceBefore = wallet.balance;
      wallet.balance -= amount;
      await manager.save(ClientWallet, wallet);

      // Create confirmed booking with QR check-in token
      const bookingEntity = manager.create(Bookings, {
        user_id: dto.user_id,
        provider_id: dto.provider_id,
        service_id: dto.service_id,
        booking_date: dto.booking_date.slice(0, 10),
        booking_time: new Date(`1970-01-01T${dto.booking_time}:00`),
        booking_status: BookingStatus.CONFIRMED,
        payement_status: 1,
        amount,
        currency,
        qr_checkin_token: crypto.randomUUID().replace(/-/g, ''),
      });
      await manager.save(Bookings, bookingEntity);

      const transactionRef = `BKG-${bookingEntity.id}-${Date.now()}`;

      // Create successful transaction
      const txn = manager.create(Transaction, {
        label: `Booking #${bookingEntity.id} (wallet)`,
        fromUserId: dto.user_id,
        toUserId: settlementUserId,
        amount,
        currency,
        status: TransactionStatus.SUCCESS,
        transactionMotifId: TransactionMotif.BOOKING_PAYMENT,
        transactionRef,
        paymentMethod: 'wallet',
        paymentProvider: 'wallet',
        externalPaymentId: null,
        balanceBefore,
        balanceAfter: wallet.balance,
        booking: bookingEntity,
      });
      await manager.save(Transaction, txn);

      return {
        status: 'confirmed' as const,
        booking: bookingEntity,
        transaction: txn,
        payment: {
          provider: 'wallet',
          transactionRef,
          amount,
          currency,
          clientInstructions: {
            provider: 'wallet',
            message: 'Booking confirmed and paid from wallet',
            newBalance: wallet.balance,
          },
        },
      };
    });
  }

  /**
   * Create a pending booking + transaction, return provider SDK instructions.
   * Booking is confirmed only after the payment webhook arrives.
   */
  private async checkoutWithExternalProvider(
    dto: InitiateBookingCheckoutDto,
    amount: number,
    currency: string,
  ): Promise<BookingCheckoutResult> {
    // Payment goes to the service provider
    const settlementUserId = dto.provider_id;

    const wallet = await this.walletRepo.findOne({
      where: { client_id: dto.user_id },
    });
    const balanceSnapshot = wallet?.balance ?? 0;

    const { booking, transaction } = await this.dataSource.transaction(
      async (manager) => {
        const bookingEntity = manager.create(Bookings, {
          user_id: dto.user_id,
          provider_id: dto.provider_id,
          service_id: dto.service_id,
          booking_date: dto.booking_date.slice(0, 10),
          booking_time: new Date(`1970-01-01T${dto.booking_time}:00`),
          booking_status: BookingStatus.PENDING_PAYMENT,
          payement_status: 0,
          amount,
          currency,
        });
        await manager.save(Bookings, bookingEntity);

        const transactionRef = `BKG-${bookingEntity.id}-${Date.now()}`;

        const txn = manager.create(Transaction, {
          label: `Booking #${bookingEntity.id}`,
          fromUserId: dto.user_id,
          toUserId: settlementUserId,
          amount,
          currency,
          status: TransactionStatus.PENDING,
          transactionMotifId: TransactionMotif.BOOKING_PAYMENT,
          transactionRef,
          paymentMethod: dto.payment_channel,
          paymentProvider: dto.payment_provider,
          externalPaymentId: null,
          balanceBefore: balanceSnapshot,
          balanceAfter: balanceSnapshot,
          booking: bookingEntity,
        });
        await manager.save(Transaction, txn);

        return { booking: bookingEntity, transaction: txn };
      },
    );

    // Build provider-specific client instructions
    const clientInstructions = await this.buildClientInstructions(
      dto.payment_provider,
      transaction.transactionRef,
      amount,
      currency,
      booking.id,
    );

    // Store externalPaymentId if Stripe created one
    if (clientInstructions.paymentIntentId) {
      transaction.externalPaymentId =
        clientInstructions.paymentIntentId as string;
      await this.dataSource.getRepository(Transaction).save(transaction);
    }

    return {
      status: 'pending_payment',
      booking,
      transaction,
      payment: {
        provider: dto.payment_provider,
        transactionRef: transaction.transactionRef,
        amount,
        currency,
        clientInstructions,
      },
    };
  }

  private async buildClientInstructions(
    provider: string,
    transactionRef: string,
    amount: number,
    currency: string,
    bookingId: number,
  ): Promise<Record<string, unknown>> {
    if (provider === 'stripe' && this.stripeService.isConfigured) {
      const intent = await this.stripeService.createPaymentIntent({
        amount,
        currency,
        metadata: {
          transactionRef,
          type: 'booking_payment',
          bookingId: String(bookingId),
        },
      });
      return {
        provider: 'stripe',
        publishableKey: this.stripeService.publishableKey,
        clientSecret: intent.clientSecret,
        paymentIntentId: intent.paymentIntentId,
        transactionRef,
        amount,
        currency: currency.toLowerCase(),
      };
    }

    if (provider === 'kkiapay' && this.kkiapayService.isConfigured) {
      return {
        ...this.kkiapayService.buildWidgetPayload({
          amount,
          transactionRef,
          reason: `Booking #${bookingId}`,
        }),
        transactionRef,
      };
    }

    // Sandbox / fallback
    return {
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
}
