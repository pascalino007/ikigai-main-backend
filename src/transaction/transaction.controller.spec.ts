import { INestApplication } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { TransactionsController } from './transaction.controller';
import { TransactionsService } from './transaction.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

/**
 * HTTP-level test of the admin transaction routes: real routing, a real
 * signed JWT verified by a real JwtService, and the real JwtAuthGuard/
 * RolesGuard — only TransactionsService (the thing that would otherwise
 * touch a real database) is a mock. This is what actually proves the
 * `/transactions/admin/earnings` route is wired correctly end to end,
 * as opposed to unit tests that call the service method directly.
 */
describe('TransactionsController (HTTP)', () => {
  const JWT_SECRET = 'test-secret';

  let app: INestApplication;
  let jwt: JwtService;
  let transactionsService: { getPlatformEarnings: jest.Mock; getAllTransactions: jest.Mock };

  function signToken(overrides: Partial<{ sub: number; email: string; role: string }> = {}) {
    return jwt.sign({ sub: 1, email: 'admin@ikigai.test', role: 'admin', ...overrides });
  }

  beforeEach(async () => {
    transactionsService = {
      getPlatformEarnings: jest.fn().mockResolvedValue({
        series: [{ date: '2026-09-23', commission: 100, gross: 1000, bookingsCount: 1 }],
        totals: { commission: 100, gross: 1000, bookingsCount: 1 },
      }),
      getAllTransactions: jest.fn().mockResolvedValue([]),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: JWT_SECRET })],
      controllers: [TransactionsController],
      providers: [
        { provide: TransactionsService, useValue: transactionsService },
        JwtAuthGuard,
        RolesGuard,
        Reflector,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    jwt = moduleFixture.get(JwtService);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /transactions/admin/earnings', () => {
    it('rejects a request with no Authorization header', async () => {
      await request(app.getHttpServer()).get('/transactions/admin/earnings').expect(401);
      expect(transactionsService.getPlatformEarnings).not.toHaveBeenCalled();
    });

    it('rejects an invalid/garbage token', async () => {
      await request(app.getHttpServer())
        .get('/transactions/admin/earnings')
        .set('Authorization', 'Bearer not-a-real-jwt')
        .expect(401);
    });

    it("rejects a valid token whose role isn't admin/manager", async () => {
      const token = signToken({ role: 'provider' });
      await request(app.getHttpServer())
        .get('/transactions/admin/earnings')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      expect(transactionsService.getPlatformEarnings).not.toHaveBeenCalled();
    });

    it.each(['admin', 'manager'])('allows a valid %s token and returns the earnings payload', async (role) => {
      const token = signToken({ role });
      const res = await request(app.getHttpServer())
        .get('/transactions/admin/earnings?days=7')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual({
        series: [{ date: '2026-09-23', commission: 100, gross: 1000, bookingsCount: 1 }],
        totals: { commission: 100, gross: 1000, bookingsCount: 1 },
      });
      expect(transactionsService.getPlatformEarnings).toHaveBeenCalledWith(7);
    });

    it('passes undefined (service default) when no ?days is given', async () => {
      const token = signToken();
      await request(app.getHttpServer())
        .get('/transactions/admin/earnings')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(transactionsService.getPlatformEarnings).toHaveBeenCalledWith(undefined);
    });
  });

  describe('GET /transactions/admin/all', () => {
    it('is also admin/manager-gated', async () => {
      await request(app.getHttpServer()).get('/transactions/admin/all').expect(401);
      const clientToken = signToken({ role: 'client' });
      await request(app.getHttpServer())
        .get('/transactions/admin/all')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(403);

      const adminToken = signToken({ role: 'admin' });
      await request(app.getHttpServer())
        .get('/transactions/admin/all')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });
});
