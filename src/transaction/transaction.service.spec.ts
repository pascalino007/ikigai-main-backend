import { TransactionsService } from './transaction.service';
import { TransactionMotif, TransactionStatus } from './transaction.contants';

describe('TransactionsService', () => {
  let transactionRepository: { find: jest.Mock };
  let usersRepository: { find: jest.Mock };
  let shopsRepository: { find: jest.Mock };
  let service: TransactionsService;

  beforeEach(() => {
    transactionRepository = { find: jest.fn() };
    usersRepository = { find: jest.fn().mockResolvedValue([]) };
    shopsRepository = { find: jest.fn().mockResolvedValue([]) };

    service = new TransactionsService(
      transactionRepository as never,
      {} as never, // clientWalletRepository — unused by the methods under test
      shopsRepository as never,
      usersRepository as never,
      {} as never, // dataSource
      {} as never, // stripeService
      {} as never, // kkiapayService
      {} as never, // paygateService
      {} as never, // paymentWebhookService
    );
  });

  describe('getAllTransactions', () => {
    it('resolves client/shop names from the linked booking, and payer/payee names from Users', async () => {
      transactionRepository.find.mockResolvedValue([
        {
          id: 1,
          fromUserId: 10,
          toUserId: 42, // a shop id for BOOKING_PAYMENT, not a Users.id
          transactionMotifId: TransactionMotif.BOOKING_PAYMENT,
          booking: { user_id: 10, provider_id: 42 },
        },
        {
          id: 2,
          fromUserId: 10,
          toUserId: 10,
          transactionMotifId: TransactionMotif.WALLET_DEPOSIT,
          booking: undefined,
        },
      ]);
      usersRepository.find.mockResolvedValue([{ id: 10, firstname: 'Ama', lastname: 'K.' }]);
      shopsRepository.find.mockResolvedValue([{ id: 42, name: 'Salon Ama' }]);

      const result = await service.getAllTransactions();

      expect(result[0]).toMatchObject({
        clientName: 'Ama K.',
        shopName: 'Salon Ama',
        fromUserName: 'Ama K.',
        toUserName: null, // 42 is a shop id, never resolved against Users
      });
      expect(result[1]).toMatchObject({
        clientName: null,
        shopName: null,
        fromUserName: 'Ama K.',
        toUserName: 'Ama K.',
      });
    });

    it('returns an empty array without querying Users/Shops when there are no transactions', async () => {
      transactionRepository.find.mockResolvedValue([]);
      const result = await service.getAllTransactions();
      expect(result).toEqual([]);
      expect(usersRepository.find).not.toHaveBeenCalled();
      expect(shopsRepository.find).not.toHaveBeenCalled();
    });
  });

  describe('getPlatformEarnings', () => {
    function commissionRow(daysAgo: number, amount: number, grossAmount: number) {
      const createdAt = new Date();
      createdAt.setUTCDate(createdAt.getUTCDate() - daysAgo);
      return {
        amount,
        createdAt,
        metadata: { grossAmount },
      };
    }

    it('sums commission and gross per day, and fills days with no activity as zero', async () => {
      transactionRepository.find.mockResolvedValue([
        commissionRow(0, 100, 1000), // today
        commissionRow(0, 50, 500), // also today — same bucket
        commissionRow(1, 200, 2000), // yesterday
      ]);

      const result = await service.getPlatformEarnings(3);

      expect(result.series).toHaveLength(3);
      const [twoDaysAgo, yesterday, today] = result.series;
      expect(twoDaysAgo).toMatchObject({ commission: 0, gross: 0, bookingsCount: 0 });
      expect(yesterday).toMatchObject({ commission: 200, gross: 2000, bookingsCount: 1 });
      expect(today).toMatchObject({ commission: 150, gross: 1500, bookingsCount: 2 });
      expect(result.totals).toEqual({ commission: 350, gross: 3500, bookingsCount: 3 });
    });

    it('only queries SUCCESS ADMIN_COMMISSION transactions', async () => {
      transactionRepository.find.mockResolvedValue([]);
      await service.getPlatformEarnings(7);
      expect(transactionRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            transactionMotifId: TransactionMotif.ADMIN_COMMISSION,
            status: TransactionStatus.SUCCESS,
          }),
        }),
      );
    });

    it('clamps the requested range to [1, 365] days', async () => {
      transactionRepository.find.mockResolvedValue([]);
      expect((await service.getPlatformEarnings(0)).series).toHaveLength(1);
      expect((await service.getPlatformEarnings(-5)).series).toHaveLength(1);
      expect((await service.getPlatformEarnings(1000)).series).toHaveLength(365);
    });

    it('defaults to 30 days when none is given', async () => {
      transactionRepository.find.mockResolvedValue([]);
      const result = await service.getPlatformEarnings();
      expect(result.series).toHaveLength(30);
    });

    it('treats a missing grossAmount in metadata as zero rather than throwing', async () => {
      transactionRepository.find.mockResolvedValue([{ amount: 100, createdAt: new Date(), metadata: null }]);
      const result = await service.getPlatformEarnings(1);
      expect(result.totals).toEqual({ commission: 100, gross: 0, bookingsCount: 1 });
    });
  });
});
