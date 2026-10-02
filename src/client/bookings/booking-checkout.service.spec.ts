import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';
import { BookingCheckoutService } from './booking-checkout.service';
import { Bookings } from './bookings.entity';
import { ClientWallet } from '../client_wallet/client_wallet.entity';
import { Transaction } from '../../transaction/transaction.entity';
import { BookingStatus } from './booking-status.constants';
import { TransactionStatus } from '../../transaction/transaction.contants';
import { InitiateBookingCheckoutDto } from './dtos/initiate-booking-checkout.dto';
import { BulkBookingCheckoutDto } from './dtos/bulk-booking-checkout.dto';
import { FakeManager, makeFakeDataSource } from '../../test-utils/fake-manager';

describe('BookingCheckoutService', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  let manager: FakeManager;
  let dataSource: ReturnType<typeof makeFakeDataSource>;
  let servicesRepo: { findOne: jest.Mock };
  let walletRepo: { findOne: jest.Mock };
  let shopsRepo: { findOne: jest.Mock };
  let usersRepo: { findOne: jest.Mock };
  let config: { get: jest.Mock };
  let stripeService: { isConfigured: boolean; publishableKey: string; createPaymentIntent: jest.Mock };
  let kkiapayService: { isConfigured: boolean; buildWidgetPayload: jest.Mock };
  let paygateService: { isConfigured: boolean; initiatePayment: jest.Mock };
  let notificationsService: { sendPushNotification: jest.Mock };
  let service: BookingCheckoutService;

  const testService = {
    id: 7,
    is_active: true,
    provider_id: 42,
    price: '5000',
    duration_minutes: 30,
    name: 'Coupe homme',
  };

  function baseDto(overrides: Partial<InitiateBookingCheckoutDto> = {}): InitiateBookingCheckoutDto {
    return {
      user_id: 1,
      provider_id: 42,
      service_id: 7,
      booking_date: '2026-09-25',
      booking_time: '10:00',
      payment_channel: 'wallet',
      payment_provider: 'wallet',
      ...overrides,
    } as InitiateBookingCheckoutDto;
  }

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    manager = new FakeManager();
    dataSource = makeFakeDataSource(manager);
    servicesRepo = { findOne: jest.fn().mockResolvedValue({ ...testService }) };
    walletRepo = { findOne: jest.fn().mockResolvedValue(null) };
    shopsRepo = { findOne: jest.fn().mockResolvedValue({ id: 42, name: 'Salon Test', fcm_token: null }) };
    usersRepo = { findOne: jest.fn().mockResolvedValue({ id: 1, fcm_token: null }) };
    config = { get: jest.fn() };
    stripeService = {
      isConfigured: false,
      publishableKey: 'pk_test',
      createPaymentIntent: jest.fn(),
    };
    kkiapayService = { isConfigured: false, buildWidgetPayload: jest.fn() };
    paygateService = { isConfigured: false, initiatePayment: jest.fn() };
    notificationsService = { sendPushNotification: jest.fn().mockResolvedValue(undefined) };

    service = new BookingCheckoutService(
      servicesRepo as never,
      walletRepo as never,
      shopsRepo as never,
      usersRepo as never,
      dataSource as never,
      config as never,
      stripeService as never,
      kkiapayService as never,
      paygateService as never,
      notificationsService as never,
    );
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('service validation', () => {
    it('throws NotFoundException when the service does not exist', async () => {
      servicesRepo.findOne.mockResolvedValue(null);
      await expect(service.initiateCheckout(baseDto())).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when the service is inactive', async () => {
      servicesRepo.findOne.mockResolvedValue({ ...testService, is_active: false });
      await expect(service.initiateCheckout(baseDto())).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the service does not belong to the given provider', async () => {
      servicesRepo.findOne.mockResolvedValue({ ...testService, provider_id: 999 });
      await expect(service.initiateCheckout(baseDto())).rejects.toThrow(BadRequestException);
    });
  });

  describe('wallet checkout', () => {
    it('debits the wallet, confirms the booking, and issues a QR check-in token', async () => {
      await manager.seed(ClientWallet, manager.create(ClientWallet, { client_id: 1, balance: 10000 }));
      shopsRepo.findOne.mockResolvedValue({ id: 42, name: 'Salon Test', fcm_token: 'shop-fcm' });
      usersRepo.findOne.mockResolvedValue({ id: 1, fcm_token: 'user-fcm' });

      const result = await service.initiateCheckout(baseDto());

      expect(result.status).toBe('confirmed');
      expect(result.booking.booking_status).toBe(BookingStatus.CONFIRMED);
      expect(result.booking.payement_status).toBe(1);
      expect(result.booking.qr_checkin_token).toEqual(expect.any(String));
      expect(result.transaction.status).toBe(TransactionStatus.SUCCESS);
      expect(result.transaction.balanceBefore).toBe(10000);
      expect(result.transaction.balanceAfter).toBe(5000);
      expect(result.payment.clientInstructions.newBalance).toBe(5000);

      const wallet = await manager.findOne(ClientWallet, { where: { client_id: 1 } });
      expect(wallet!.balance).toBe(5000);

      expect(notificationsService.sendPushNotification).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'shop-fcm', title: 'Nouvelle réservation' }),
      );
      expect(notificationsService.sendPushNotification).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'user-fcm', title: 'Réservation confirmée' }),
      );
    });

    it('auto-creates a zero-balance wallet for a first-time client', async () => {
      await expect(service.initiateCheckout(baseDto())).rejects.toMatchObject({
        response: expect.objectContaining({ error: 'insufficient_balance', balance: 0, required: 5000 }),
      });
      const wallet = await manager.findOne(ClientWallet, { where: { client_id: 1 } });
      expect(wallet).not.toBeNull();
      expect(wallet!.balance).toBe(0);
    });

    it('throws a structured 402 when the wallet balance is insufficient, without creating a booking', async () => {
      await manager.seed(ClientWallet, manager.create(ClientWallet, { client_id: 1, balance: 1000 }));

      await expect(service.initiateCheckout(baseDto())).rejects.toThrow(HttpException);
      try {
        await service.initiateCheckout(baseDto());
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(402);
        expect((err as HttpException).getResponse()).toMatchObject({
          error: 'insufficient_balance',
          balance: 1000,
          required: 5000,
          deficit: 4000,
          currency: 'XOF',
        });
      }

      const wallet = await manager.findOne(ClientWallet, { where: { client_id: 1 } });
      expect(wallet!.balance).toBe(1000); // untouched
      const bookings = await manager.find(Bookings, { where: {} });
      expect(bookings).toHaveLength(0);
    });
  });

  describe('external checkout — stripe', () => {
    it('creates a PENDING_PAYMENT booking and returns Stripe client instructions', async () => {
      stripeService.isConfigured = true;
      stripeService.createPaymentIntent.mockResolvedValue({
        clientSecret: 'cs_123',
        paymentIntentId: 'pi_123',
      });

      const result = await service.initiateCheckout(
        baseDto({ payment_provider: 'stripe', payment_channel: 'card' }),
      );

      expect(result.status).toBe('pending_payment');
      expect(result.booking.booking_status).toBe(BookingStatus.PENDING_PAYMENT);
      expect(result.transaction.status).toBe(TransactionStatus.PENDING);
      expect(result.payment.clientInstructions).toMatchObject({
        provider: 'stripe',
        publishableKey: 'pk_test',
        clientSecret: 'cs_123',
        paymentIntentId: 'pi_123',
      });

      const txn = await manager.findOne(Transaction, { where: { id: result.transaction.id } });
      expect(txn!.externalPaymentId).toBe('pi_123');
    });

    it('throws BadRequestException when Stripe is not configured, but still leaves the pending booking behind', async () => {
      stripeService.isConfigured = false;
      await expect(
        service.initiateCheckout(baseDto({ payment_provider: 'stripe', payment_channel: 'card' })),
      ).rejects.toThrow(BadRequestException);

      const bookings = await manager.find(Bookings, { where: {} });
      expect(bookings).toHaveLength(1);
      expect(bookings[0].booking_status).toBe(BookingStatus.PENDING_PAYMENT);
    });
  });

  describe('external checkout — kkiapay', () => {
    it('returns the widget payload and does not stamp an externalPaymentId', async () => {
      kkiapayService.isConfigured = true;
      kkiapayService.buildWidgetPayload.mockReturnValue({
        provider: 'kkiapay',
        publicKey: 'pk_kkia',
        amount: 5000,
      });

      const result = await service.initiateCheckout(
        baseDto({ payment_provider: 'kkiapay', payment_channel: 'mobile_money' }),
      );

      expect(result.payment.clientInstructions).toMatchObject({ provider: 'kkiapay', publicKey: 'pk_kkia' });
      const txn = await manager.findOne(Transaction, { where: { id: result.transaction.id } });
      expect(txn!.externalPaymentId).toBeNull();
    });

    it('throws BadRequestException when Kkiapay is not configured', async () => {
      kkiapayService.isConfigured = false;
      await expect(
        service.initiateCheckout(baseDto({ payment_provider: 'kkiapay', payment_channel: 'mobile_money' })),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('external checkout — paygate', () => {
    it('requires a phone number', async () => {
      paygateService.isConfigured = true;
      await expect(
        service.initiateCheckout(baseDto({ payment_provider: 'paygate', payment_channel: 'mobile_money' })),
      ).rejects.toThrow(BadRequestException);
    });

    it('initiates the USSD push and stamps the txReference as externalPaymentId', async () => {
      paygateService.isConfigured = true;
      paygateService.initiatePayment.mockResolvedValue({ txReference: 'PG-123' });

      const result = await service.initiateCheckout(
        baseDto({
          payment_provider: 'paygate',
          payment_channel: 'mobile_money',
          phone: '90171212',
        }),
      );

      expect(result.payment.clientInstructions).toMatchObject({
        provider: 'paygate',
        txReference: 'PG-123',
        network: 'FLOOZ',
      });
      const txn = await manager.findOne(Transaction, { where: { id: result.transaction.id } });
      expect(txn!.externalPaymentId).toBe('PG-123');
    });

    it('throws BadRequestException when PayGate is not configured', async () => {
      paygateService.isConfigured = false;
      await expect(
        service.initiateCheckout(
          baseDto({ payment_provider: 'paygate', payment_channel: 'mobile_money', phone: '90171212' }),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('external checkout — sandbox', () => {
    it('returns a simulate-webhook hint outside production', async () => {
      const result = await service.initiateCheckout(
        baseDto({ payment_provider: 'sandbox', payment_channel: 'card' }),
      );
      expect(result.payment.clientInstructions).toMatchObject({
        provider: 'sandbox',
        simulateWebhook: expect.objectContaining({
          body: expect.objectContaining({ status: 'succeeded' }),
        }),
      });
    });

    it('is refused in production', async () => {
      process.env.NODE_ENV = 'production';
      await expect(
        service.initiateCheckout(baseDto({ payment_provider: 'sandbox', payment_channel: 'card' })),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('bulk checkout', () => {
    function bulkDto(overrides: Partial<BulkBookingCheckoutDto> = {}): BulkBookingCheckoutDto {
      return {
        user_id: 1,
        payment_provider: 'wallet',
        payment_channel: 'wallet',
        items: [
          { provider_id: 42, service_id: 7, booking_date: '2026-09-25', booking_time: '10:00' },
          { provider_id: 42, service_id: 8, booking_date: '2026-09-25', booking_time: '11:00' },
        ],
        ...overrides,
      } as BulkBookingCheckoutDto;
    }

    beforeEach(() => {
      servicesRepo.findOne.mockImplementation(({ where }: { where: { id: number } }) => {
        if (where.id === 7) return Promise.resolve({ ...testService, id: 7, price: '3000' });
        if (where.id === 8) return Promise.resolve({ ...testService, id: 8, price: '2000' });
        return Promise.resolve(null);
      });
    });

    it('rejects an empty items list', async () => {
      await expect(service.initiateBulkCheckout(bulkDto({ items: [] }))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('validates every item before writing anything, so a bad item cancels the whole batch', async () => {
      servicesRepo.findOne.mockImplementation(({ where }: { where: { id: number } }) => {
        if (where.id === 7) return Promise.resolve({ ...testService, id: 7, price: '3000' });
        if (where.id === 8) return Promise.resolve({ ...testService, id: 8, price: '2000', is_active: false });
        return Promise.resolve(null);
      });
      await expect(service.initiateBulkCheckout(bulkDto())).rejects.toThrow(BadRequestException);
      const bookings = await manager.find(Bookings, { where: {} });
      expect(bookings).toHaveLength(0);
    });

    it('wallet path: single atomic debit of the total, N confirmed bookings sharing a bulkRef', async () => {
      await manager.seed(ClientWallet, manager.create(ClientWallet, { client_id: 1, balance: 10000 }));

      const result = await service.initiateBulkCheckout(bulkDto());

      expect(result.status).toBe('confirmed');
      expect(result.totalAmount).toBe(5000);
      expect(result.bookings).toHaveLength(2);
      expect(result.bookings.every((b) => b.booking_status === BookingStatus.CONFIRMED)).toBe(true);
      expect(result.transactions.every((t) => t.bulkRef === result.bulkRef)).toBe(true);
      expect(new Set(result.transactions.map((t) => t.transactionRef)).size).toBe(2);

      const wallet = await manager.findOne(ClientWallet, { where: { client_id: 1 } });
      expect(wallet!.balance).toBe(5000);
    });

    it('wallet path: insufficient total balance rejects the whole batch atomically', async () => {
      await manager.seed(ClientWallet, manager.create(ClientWallet, { client_id: 1, balance: 4000 }));

      await expect(service.initiateBulkCheckout(bulkDto())).rejects.toThrow(HttpException);

      const bookings = await manager.find(Bookings, { where: {} });
      expect(bookings).toHaveLength(0);
      const wallet = await manager.findOne(ClientWallet, { where: { client_id: 1 } });
      expect(wallet!.balance).toBe(4000);
    });

    it('external path: one pending_payment intent for the total, N pending bookings sharing a bulkRef', async () => {
      const result = await service.initiateBulkCheckout(
        bulkDto({ payment_provider: 'sandbox', payment_channel: 'card' }),
      );

      expect(result.status).toBe('pending_payment');
      expect(result.bookings.every((b) => b.booking_status === BookingStatus.PENDING_PAYMENT)).toBe(true);
      expect(result.transactions.every((t) => t.bulkRef === result.bulkRef)).toBe(true);
      expect(result.payment.clientInstructions).toMatchObject({
        simulateWebhook: expect.objectContaining({
          body: expect.objectContaining({ transactionRef: result.bulkRef }),
        }),
      });
    });
  });
});
