import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { MiService } from './mi-service.entity';
import { MiServiceOrder } from './mi-service-order.entity';
import { MiServiceCategory } from './mi-service-category.entity';
import { Transaction } from '../transaction/transaction.entity';
import { ProWallet } from '../providers/pro_wallet/pro_wallet.entity';
import { TransactionMotif, TransactionStatus } from '../transaction/transaction.contants';
import { KkiapayService } from '../payments/kkiapay.service';
import { StripeService } from '../payments/stripe.service';
import { CreateMiServiceDto } from './dtos/create-mi-service.dto';
import { CreateMiServiceCategoryDto } from './dtos/create-mi-service-category.dto';
import { RedisService } from '../redis/redis.service';

/** Mi service catalog (services + categories) is near-static → cache 2 min. */
const MI_TTL = 120;

@Injectable()
export class MiServicesService {
  constructor(
    @InjectRepository(MiService)
    private readonly miServiceRepo: Repository<MiService>,
    @InjectRepository(MiServiceCategory)
    private readonly categoryRepo: Repository<MiServiceCategory>,
    @InjectRepository(MiServiceOrder)
    private readonly orderRepo: Repository<MiServiceOrder>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    private readonly dataSource: DataSource,
    private readonly kkiapayService: KkiapayService,
    private readonly stripeService: StripeService,
    private readonly redis: RedisService,
  ) {}

  /** Drop cached catalog reads (orders are never cached). */
  private invalidateCatalog(): Promise<void> {
    return this.redis.delPattern('mi:*');
  }

  // ── Category CRUD ──

  async createCategory(dto: CreateMiServiceCategoryDto): Promise<MiServiceCategory> {
    const category = this.categoryRepo.create(dto);
    const saved = await this.categoryRepo.save(category);
    await this.invalidateCatalog();
    return saved;
  }

  async findAllCategories(): Promise<MiServiceCategory[]> {
    return this.redis.remember('mi:cats', MI_TTL, () =>
      this.categoryRepo.find({ order: { createdAt: 'DESC' } }),
    );
  }

  async updateCategory(id: number, dto: Partial<CreateMiServiceCategoryDto>): Promise<MiServiceCategory> {
    const category = await this.categoryRepo.findOne({ where: { id } });
    if (!category) throw new NotFoundException(`Mi service category #${id} not found`);
    Object.assign(category, dto);
    const saved = await this.categoryRepo.save(category);
    await this.invalidateCatalog();
    return saved;
  }

  async removeCategory(id: number): Promise<void> {
    const result = await this.categoryRepo.delete(id);
    if (result.affected === 0) throw new NotFoundException(`Mi service category #${id} not found`);
    await this.invalidateCatalog();
  }

  // ── Mi Service CRUD ──

  async create(dto: CreateMiServiceDto): Promise<MiService> {
    const service = this.miServiceRepo.create(dto);
    const saved = await this.miServiceRepo.save(service);
    await this.invalidateCatalog();
    return saved;
  }

  async findAll(): Promise<MiService[]> {
    return this.redis.remember('mi:all', MI_TTL, () =>
      this.miServiceRepo.find({ order: { createdAt: 'DESC' } }),
    );
  }

  async findOne(id: number): Promise<MiService> {
    return this.redis.remember(`mi:one:${id}`, MI_TTL, async () => {
      const service = await this.miServiceRepo.findOne({ where: { id } });
      if (!service) throw new NotFoundException(`Mi service #${id} not found`);
      return service;
    });
  }

  async update(id: number, dto: Partial<CreateMiServiceDto>): Promise<MiService> {
    const service = await this.miServiceRepo.findOne({ where: { id } });
    if (!service) throw new NotFoundException(`Mi service #${id} not found`);
    Object.assign(service, dto);
    const saved = await this.miServiceRepo.save(service);
    await this.invalidateCatalog();
    return saved;
  }

  async remove(id: number): Promise<void> {
    const result = await this.miServiceRepo.delete(id);
    if (result.affected === 0) throw new NotFoundException(`Mi service #${id} not found`);
    await this.invalidateCatalog();
  }

  // ── Orders ──

  async findAllOrders(): Promise<Array<MiServiceOrder & { mi_service_name?: string }>> {
    const orders = await this.orderRepo.find({ order: { createdAt: 'DESC' } });
    // Attach the service name (no DB relation defined; map in-memory).
    const services = await this.miServiceRepo.find();
    const nameById = new Map(services.map((s) => [s.id, s.name]));
    return orders.map((o) => ({
      ...o,
      mi_service_name: nameById.get(o.mi_service_id),
    }));
  }

  async findOrdersByShop(
    shopId: number,
  ): Promise<Array<MiServiceOrder & { mi_service_name?: string; mi_service_image?: string }>> {
    const orders = await this.orderRepo.find({
      where: { shop_id: shopId },
      order: { createdAt: 'DESC' },
    });
    const services = await this.miServiceRepo.find();
    const byId = new Map(services.map((s) => [s.id, s]));
    return orders.map((o) => ({
      ...o,
      mi_service_name: byId.get(o.mi_service_id)?.name,
      mi_service_image: byId.get(o.mi_service_id)?.imageUrl,
    }));
  }

  /** Admin marks an order as delivered. */
  async markOrderDelivered(orderId: number): Promise<MiServiceOrder> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order #${orderId} not found`);
    order.delivered_at = new Date();
    order.status = 'delivered';
    return this.orderRepo.save(order);
  }

  /**
   * Initiate a Mi service purchase.
   * Creates a pending order + transaction and returns KKIAPAY widget payload.
   */
  async initiatePurchase(
    miServiceId: number,
    shopId: number,
    userId: number,
    paymentProvider: 'kkiapay' | 'stripe' | 'wallet' = 'kkiapay',
  ): Promise<{ order: MiServiceOrder; clientInstructions: Record<string, unknown> }> {
    const miService = await this.findOne(miServiceId);
    if (!miService.isActive) {
      throw new BadRequestException('This service is not available');
    }

    const transactionRef = `MI-${Date.now()}-${shopId}-${miServiceId}`;

    // Expected delivery = today + temps de réalisation (jours).
    const eta = new Date();
    eta.setDate(eta.getDate() + (miService.realisationDays ?? 1));
    const expectedDeliveryDate = eta.toISOString().slice(0, 10); // YYYY-MM-DD

    // Wallet payment: debit the shop's pro_wallet immediately and mark the
    // order paid in a single atomic transaction (mirrors paySubscriptionFromWallet).
    if (paymentProvider === 'wallet') {
      return this.dataSource.transaction(async (manager) => {
        const wallet = await manager.findOne(ProWallet, {
          where: { shop_id: shopId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!wallet || wallet.balance < miService.price) {
          throw new BadRequestException('Solde du portefeuille insuffisant');
        }

        const before = wallet.balance;
        wallet.balance -= miService.price;
        await manager.save(ProWallet, wallet);

        const order = manager.create(MiServiceOrder, {
          mi_service_id: miServiceId,
          shop_id: shopId,
          user_id: userId,
          amount: miService.price,
          status: 'paid',
          transaction_ref: transactionRef,
          payment_provider: 'wallet',
          expected_delivery_date: expectedDeliveryDate,
        });
        await manager.save(MiServiceOrder, order);

        const txn = manager.create(Transaction, {
          label: `Commande Mi Service: ${miService.name}`,
          fromUserId: userId,
          toUserId: 0,
          amount: miService.price,
          currency: 'XOF',
          status: TransactionStatus.SUCCESS,
          transactionMotifId: TransactionMotif.MI_SERVICE,
          transactionRef,
          paymentMethod: 'wallet',
          paymentProvider: 'pro_wallet',
          externalPaymentId: null,
          balanceBefore: before,
          balanceAfter: wallet.balance,
          metadata: { miServiceId, shopId, orderId: order.id },
        });
        await manager.save(Transaction, txn);

        return {
          order,
          clientInstructions: {
            provider: 'wallet',
            status: 'paid',
            transactionRef,
            amount: miService.price,
            walletBalance: wallet.balance,
          },
        };
      });
    }

    return this.dataSource.transaction(async (manager) => {
      // Create order record
      const order = manager.create(MiServiceOrder, {
        mi_service_id: miServiceId,
        shop_id: shopId,
        user_id: userId,
        amount: miService.price,
        status: 'pending',
        transaction_ref: transactionRef,
        payment_provider: paymentProvider,
        expected_delivery_date: expectedDeliveryDate,
      });
      await manager.save(MiServiceOrder, order);

      // Create linked transaction
      const txn = manager.create(Transaction, {
        label: `Commande Mi Service: ${miService.name}`,
        fromUserId: userId,
        toUserId: 0,
        amount: miService.price,
        currency: 'XOF',
        status: TransactionStatus.PENDING,
        transactionMotifId: TransactionMotif.MI_SERVICE,
        transactionRef,
        paymentMethod: 'mobile_money',
        paymentProvider,
        externalPaymentId: null,
        balanceBefore: 0,
        balanceAfter: 0,
        metadata: { miServiceId, shopId, orderId: order.id },
      });
      await manager.save(Transaction, txn);

      // Build client payment instructions
      let clientInstructions: Record<string, unknown>;

      if (paymentProvider === 'stripe' && this.stripeService.isConfigured) {
        const intent = await this.stripeService.createPaymentIntent({
          amount: miService.price,
          currency: 'xof',
          metadata: { transactionRef, type: 'mi_service' },
        });
        clientInstructions = {
          provider: 'stripe',
          publishableKey: this.stripeService.publishableKey,
          clientSecret: intent.clientSecret,
          paymentIntentId: intent.paymentIntentId,
          transactionRef,
          amount: miService.price,
          currency: 'xof',
        };
      } else if (paymentProvider === 'kkiapay' && this.kkiapayService.isConfigured) {
        clientInstructions = {
          ...this.kkiapayService.buildWidgetPayload({
            amount: miService.price,
            transactionRef,
            reason: `Commande Mi Service: ${miService.name}`,
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

      return { order, clientInstructions };
    });
  }

  /**
   * Initiate a bulk Mi service purchase (cart): one payment for several services.
   *
   * - `wallet`: debits the total from the pro wallet in a single atomic, locked
   *   transaction and creates every order as `paid`.
   * - `kkiapay`: creates one pending order + transaction per service, all sharing
   *   a single `bulkRef`, and returns ONE widget payload for the total amount.
   *   The webhook fans the result out to every transaction with that bulkRef.
   */
  async initiateBulkPurchase(
    miServiceIds: number[],
    shopId: number,
    userId: number,
    paymentProvider: 'kkiapay' | 'wallet' = 'wallet',
  ): Promise<{
    orders: MiServiceOrder[];
    total: number;
    bulkRef: string;
    clientInstructions: Record<string, unknown>;
  }> {
    const uniqueIds = [...new Set(miServiceIds ?? [])];
    if (uniqueIds.length === 0) {
      throw new BadRequestException('Le panier est vide');
    }

    const services = await this.miServiceRepo.find({ where: { id: In(uniqueIds) } });
    if (services.length !== uniqueIds.length) {
      throw new BadRequestException('Un ou plusieurs services sont introuvables');
    }
    const inactive = services.filter((s) => !s.isActive);
    if (inactive.length > 0) {
      throw new BadRequestException(
        `Service(s) indisponible(s): ${inactive.map((s) => s.name).join(', ')}`,
      );
    }

    const total = services.reduce((sum, s) => sum + s.price, 0);
    const bulkRef = `MIBULK-${Date.now()}-${shopId}`;
    const refFor = (serviceId: number) => `${bulkRef}-${serviceId}`;
    const etaFor = (s: MiService) => {
      const eta = new Date();
      eta.setDate(eta.getDate() + (s.realisationDays ?? 1));
      return eta.toISOString().slice(0, 10);
    };

    // ── WALLET: atomic total debit, all orders paid ──
    if (paymentProvider === 'wallet') {
      return this.dataSource.transaction(async (manager) => {
        const wallet = await manager.findOne(ProWallet, {
          where: { shop_id: shopId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!wallet || wallet.balance < total) {
          throw new BadRequestException('Solde du portefeuille insuffisant');
        }

        const orders: MiServiceOrder[] = [];
        let running = wallet.balance;
        for (const s of services) {
          const before = running;
          running -= s.price;

          const order = manager.create(MiServiceOrder, {
            mi_service_id: s.id,
            shop_id: shopId,
            user_id: userId,
            amount: s.price,
            status: 'paid',
            transaction_ref: refFor(s.id),
            payment_provider: 'wallet',
            expected_delivery_date: etaFor(s),
          });
          await manager.save(MiServiceOrder, order);

          const txn = manager.create(Transaction, {
            label: `Commande Mi Service: ${s.name}`,
            fromUserId: userId,
            toUserId: 0,
            amount: s.price,
            currency: 'XOF',
            status: TransactionStatus.SUCCESS,
            transactionMotifId: TransactionMotif.MI_SERVICE,
            transactionRef: refFor(s.id),
            bulkRef,
            paymentMethod: 'wallet',
            paymentProvider: 'pro_wallet',
            externalPaymentId: null,
            balanceBefore: before,
            balanceAfter: running,
            metadata: { miServiceId: s.id, shopId, orderId: order.id, bulkRef },
          });
          await manager.save(Transaction, txn);
          orders.push(order);
        }

        wallet.balance = running;
        await manager.save(ProWallet, wallet);

        return {
          orders,
          total,
          bulkRef,
          clientInstructions: {
            provider: 'wallet',
            status: 'paid',
            bulkRef,
            amount: total,
            walletBalance: wallet.balance,
          },
        };
      });
    }

    // ── KKIAPAY (or sandbox): N pending orders sharing bulkRef, one widget ──
    return this.dataSource.transaction(async (manager) => {
      const orders: MiServiceOrder[] = [];
      for (const s of services) {
        const order = manager.create(MiServiceOrder, {
          mi_service_id: s.id,
          shop_id: shopId,
          user_id: userId,
          amount: s.price,
          status: 'pending',
          transaction_ref: refFor(s.id),
          payment_provider: paymentProvider,
          expected_delivery_date: etaFor(s),
        });
        await manager.save(MiServiceOrder, order);

        const txn = manager.create(Transaction, {
          label: `Commande Mi Service: ${s.name}`,
          fromUserId: userId,
          toUserId: 0,
          amount: s.price,
          currency: 'XOF',
          status: TransactionStatus.PENDING,
          transactionMotifId: TransactionMotif.MI_SERVICE,
          transactionRef: refFor(s.id),
          bulkRef,
          paymentMethod: 'mobile_money',
          paymentProvider,
          externalPaymentId: null,
          balanceBefore: 0,
          balanceAfter: 0,
          metadata: { miServiceId: s.id, shopId, orderId: order.id, bulkRef },
        });
        await manager.save(Transaction, txn);
        orders.push(order);
      }

      let clientInstructions: Record<string, unknown>;
      if (paymentProvider === 'kkiapay' && this.kkiapayService.isConfigured) {
        clientInstructions = {
          ...this.kkiapayService.buildWidgetPayload({
            amount: total,
            transactionRef: bulkRef,
            reason: `Commande Mi Services (${services.length})`,
          }),
          transactionRef: bulkRef,
          bulkRef,
        };
      } else {
        clientInstructions = {
          provider: 'sandbox',
          hint: 'POST /payments/webhooks/sandbox with transactionRef = bulkRef to settle all',
          simulateWebhook: {
            method: 'POST',
            path: '/payments/webhooks/sandbox',
            body: {
              transactionRef: bulkRef,
              status: 'succeeded',
              externalPaymentId: `sandbox-${bulkRef}`,
            },
          },
        };
      }

      return { orders, total, bulkRef, clientInstructions };
    });
  }
}
