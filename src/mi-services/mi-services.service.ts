import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { MiService } from './mi-service.entity';
import { MiServiceOrder } from './mi-service-order.entity';
import { MiServiceCategory } from './mi-service-category.entity';
import { Transaction } from '../transaction/transaction.entity';
import { TransactionMotif, TransactionStatus } from '../transaction/transaction.contants';
import { KkiapayService } from '../payments/kkiapay.service';
import { StripeService } from '../payments/stripe.service';
import { CreateMiServiceDto } from './dtos/create-mi-service.dto';
import { CreateMiServiceCategoryDto } from './dtos/create-mi-service-category.dto';

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
  ) {}

  // ── Category CRUD ──

  async createCategory(dto: CreateMiServiceCategoryDto): Promise<MiServiceCategory> {
    const category = this.categoryRepo.create(dto);
    return this.categoryRepo.save(category);
  }

  async findAllCategories(): Promise<MiServiceCategory[]> {
    return this.categoryRepo.find({ order: { createdAt: 'DESC' } });
  }

  async updateCategory(id: number, dto: Partial<CreateMiServiceCategoryDto>): Promise<MiServiceCategory> {
    const category = await this.categoryRepo.findOne({ where: { id } });
    if (!category) throw new NotFoundException(`Mi service category #${id} not found`);
    Object.assign(category, dto);
    return this.categoryRepo.save(category);
  }

  async removeCategory(id: number): Promise<void> {
    const result = await this.categoryRepo.delete(id);
    if (result.affected === 0) throw new NotFoundException(`Mi service category #${id} not found`);
  }

  // ── Mi Service CRUD ──

  async create(dto: CreateMiServiceDto): Promise<MiService> {
    const service = this.miServiceRepo.create(dto);
    return this.miServiceRepo.save(service);
  }

  async findAll(): Promise<MiService[]> {
    return this.miServiceRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: number): Promise<MiService> {
    const service = await this.miServiceRepo.findOne({ where: { id } });
    if (!service) throw new NotFoundException(`Mi service #${id} not found`);
    return service;
  }

  async update(id: number, dto: Partial<CreateMiServiceDto>): Promise<MiService> {
    const service = await this.findOne(id);
    Object.assign(service, dto);
    return this.miServiceRepo.save(service);
  }

  async remove(id: number): Promise<void> {
    const result = await this.miServiceRepo.delete(id);
    if (result.affected === 0) throw new NotFoundException(`Mi service #${id} not found`);
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

  async findOrdersByShop(shopId: number): Promise<MiServiceOrder[]> {
    return this.orderRepo.find({
      where: { shop_id: shopId },
      order: { createdAt: 'DESC' },
    });
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
    paymentProvider: 'kkiapay' | 'stripe' = 'kkiapay',
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
}
