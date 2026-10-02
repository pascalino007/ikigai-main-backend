import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { UsersService } from './users.service';

/** In-memory stand-in for RedisService, with the underlying store exposed so tests can read the OTP that was "sent". */
function fakeRedis() {
  const store = new Map<string, string>();
  return {
    setex: jest.fn(async (key: string, _ttlSeconds: number, value: string) => {
      store.set(key, value);
      return true;
    }),
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    del: jest.fn(async (key: string) => {
      store.delete(key);
      return true;
    }),
    _store: store,
  };
}

/** Chainable stand-in for `usersRepository.createQueryBuilder(...).addSelect(...).where(...).getOne()`. */
function fakeQueryBuilder(user: unknown) {
  const qb: any = {
    addSelect: jest.fn(() => qb),
    where: jest.fn(() => qb),
    getOne: jest.fn(async () => user),
  };
  return qb;
}

describe('UsersService', () => {
  let usersRepository: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock; update: jest.Mock; createQueryBuilder: jest.Mock };
  let clientWalletRepository: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let shopsRepository: { findOne: jest.Mock };
  let trustedDevicesRepository: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock; delete: jest.Mock };
  let refreshTokensRepository: { create: jest.Mock; save: jest.Mock };
  let jwtService: { sign: jest.Mock };
  let mailService: { sendMail: jest.Mock };
  let redis: ReturnType<typeof fakeRedis>;
  let service: UsersService;

  beforeEach(() => {
    usersRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((data) => ({ id: 1, ...data })),
      save: jest.fn(async (u) => ({ id: u.id ?? 1, ...u })),
      update: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(),
    };
    clientWalletRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 1, client_id: 1, balance: 0 }),
      create: jest.fn((data) => data),
      save: jest.fn(async (w) => w),
    };
    shopsRepository = { findOne: jest.fn().mockResolvedValue(null) };
    trustedDevicesRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (d) => d),
      create: jest.fn((data) => data),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    refreshTokensRepository = { create: jest.fn((data) => data), save: jest.fn(async (t) => t) };
    jwtService = { sign: jest.fn(() => 'signed-jwt') };
    mailService = { sendMail: jest.fn().mockResolvedValue(true) };
    redis = fakeRedis();

    service = new UsersService(
      usersRepository as never,
      clientWalletRepository as never,
      shopsRepository as never,
      trustedDevicesRepository as never,
      refreshTokensRepository as never,
      jwtService as never,
      mailService as never,
      redis as never,
    );
  });

  describe('create (signup)', () => {
    const validDto = {
      firstname: 'Ama',
      lastname: 'K.',
      phone: '90171212',
      email: 'Ama@Example.com',
      password: 'secret123',
      role: 'user',
      image: '',
    };

    it('rejects a duplicate email', async () => {
      usersRepository.findOne.mockResolvedValue({ id: 1, email: 'ama@example.com' });
      await expect(service.create(validDto as never)).rejects.toThrow(BadRequestException);
    });

    it('lowercases/trims the email and hashes the password before storing', async () => {
      const { user, rawPassword } = await service.create(validDto as never);
      expect(rawPassword).toBe('secret123');
      const savedArg = usersRepository.save.mock.calls[0][0];
      expect(savedArg.email).toBe('ama@example.com');
      expect(savedArg.password).not.toBe('secret123');
      expect(await bcrypt.compare('secret123', savedArg.password)).toBe(true);
      expect(user.password).toBeUndefined(); // stripped before returning
    });

    it('requires a password for role "user"', async () => {
      await expect(service.create({ ...validDto, password: '' } as never)).rejects.toThrow(BadRequestException);
    });

    it('auto-generates a "<role>123" password for a non-user role when none is given', async () => {
      const { rawPassword } = await service.create({ ...validDto, role: 'provider', password: '' } as never);
      expect(rawPassword).toBe('provider123');
    });

    it('provisions a client wallet for the new user when one does not already exist', async () => {
      clientWalletRepository.findOne.mockResolvedValue(null);
      await service.create(validDto as never);
      expect(clientWalletRepository.save).toHaveBeenCalledWith(expect.objectContaining({ client_id: 1, balance: 0 }));
    });
  });

  describe('signin', () => {
    async function seedUser(overrides: Record<string, unknown> = {}) {
      const password = await bcrypt.hash('secret123', 10);
      return { id: 1, email: 'ama@example.com', password, role: 'user', ...overrides };
    }

    it('throws NotFoundException when the email does not exist', async () => {
      usersRepository.createQueryBuilder.mockReturnValue(fakeQueryBuilder(null));
      await expect(service.signin({ email: 'ghost@example.com', password: 'x' } as never)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws UnauthorizedException on a wrong password', async () => {
      const user = await seedUser();
      usersRepository.createQueryBuilder.mockReturnValue(fakeQueryBuilder(user));
      await expect(service.signin({ email: 'ama@example.com', password: 'wrong' } as never)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('migrates a legacy plain-text password on successful match, then still signs in', async () => {
      const user = { id: 1, email: 'ama@example.com', password: 'plain-text-secret', role: 'user' };
      usersRepository.createQueryBuilder.mockReturnValue(fakeQueryBuilder(user));
      // `save`'s argument is the same object `issueSession` later mutates (it deletes
      // `.password` before returning) — snapshot the password at call time, not after.
      let savedPassword: string | undefined;
      usersRepository.save.mockImplementationOnce(async (u: { password: string }) => {
        savedPassword = u.password;
        return { id: 1, ...u };
      });

      const result = await service.signin({ email: 'ama@example.com', password: 'plain-text-secret' } as never);
      expect(result.accessToken).toBe('signed-jwt');
      expect(savedPassword).not.toBe('plain-text-secret');
      expect(await bcrypt.compare('plain-text-secret', savedPassword!)).toBe(true);
    });

    it('rejects a role not allowed for the calling app (x-app-id)', async () => {
      const user = await seedUser({ role: 'provider' });
      usersRepository.createQueryBuilder.mockReturnValue(fakeQueryBuilder(user));
      // APP_ALLOWED_ROLES.client = ['user'] — a 'provider' account can't sign into the client app.
      await expect(
        service.signin({ email: 'ama@example.com', password: 'secret123' } as never, 'client'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('issues an access + refresh token and stamps a fresh session id on success', async () => {
      const user = await seedUser();
      usersRepository.createQueryBuilder.mockReturnValue(fakeQueryBuilder(user));
      const result = await service.signin({ email: 'ama@example.com', password: 'secret123' } as never);
      expect(result.accessToken).toBe('signed-jwt');
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(usersRepository.update).toHaveBeenCalledWith(1, expect.objectContaining({ active_session_id: expect.any(String) }));
    });
  });

  describe('OTP register flow', () => {
    it('requestRegisterOtp rejects an email that already has an account', async () => {
      usersRepository.findOne.mockResolvedValue({ id: 1 });
      await expect(service.requestRegisterOtp('ama@example.com')).rejects.toThrow(BadRequestException);
    });

    it('requestRegisterOtp stores an OTP in Redis and emails it', async () => {
      const result = await service.requestRegisterOtp('Ama@Example.com');
      expect(result.success).toBe(true);
      expect(redis._store.get('auth:otp:register:ama@example.com')).toMatch(/^\d{6}$/);
      expect(mailService.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'ama@example.com' }));
    });

    it('verifyRegisterOtpAndCreate rejects a wrong code', async () => {
      await service.requestRegisterOtp('ama@example.com');
      await expect(
        service.verifyRegisterOtpAndCreate({
          firstname: 'Ama', lastname: 'K.', phone: '90171212', email: 'ama@example.com',
          password: 'secret123', role: 'user', image: '', otp: '000000',
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('verifyRegisterOtpAndCreate creates the account and consumes the OTP on a correct code', async () => {
      await service.requestRegisterOtp('ama@example.com');
      const otp = redis._store.get('auth:otp:register:ama@example.com')!;
      const { user } = await service.verifyRegisterOtpAndCreate({
        firstname: 'Ama', lastname: 'K.', phone: '90171212', email: 'ama@example.com',
        password: 'secret123', role: 'user', image: '', otp,
      } as never);
      expect(user.email).toBe('ama@example.com');
      expect(redis._store.has('auth:otp:register:ama@example.com')).toBe(false); // consumed

      // Replaying the same OTP must fail now that it's been consumed.
      await expect(
        service.verifyRegisterOtpAndCreate({
          firstname: 'Ama', lastname: 'K.', phone: '90171212', email: 'ama2@example.com',
          password: 'secret123', role: 'user', image: '', otp,
        } as never),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('OTP login flow', () => {
    async function seedUser() {
      const password = await bcrypt.hash('secret123', 10);
      return { id: 1, email: 'ama@example.com', password, role: 'user' };
    }

    it('requestLoginOtp sends a code for an untrusted device', async () => {
      const user = await seedUser();
      usersRepository.createQueryBuilder.mockReturnValue(fakeQueryBuilder(user));
      const result = await service.requestLoginOtp('ama@example.com', 'secret123', 'device-1');
      expect(result.otpRequired).toBe(true);
      expect(redis._store.get('auth:otp:login:ama@example.com')).toMatch(/^\d{6}$/);
    });

    it('requestLoginOtp skips the OTP and issues a session for a trusted device', async () => {
      const user = await seedUser();
      usersRepository.createQueryBuilder.mockReturnValue(fakeQueryBuilder(user));
      trustedDevicesRepository.findOne.mockResolvedValue({
        id: 1,
        user_id: 1,
        device_id: 'device-1',
        token_hash: createHash('sha256').update('trusted-token').digest('hex'),
        expiresAt: new Date(Date.now() + 1000 * 60),
      });
      const result = await service.requestLoginOtp('ama@example.com', 'secret123', 'device-1', 'trusted-token');
      expect(result.otpRequired).toBe(false);
      expect(result.accessToken).toBe('signed-jwt');
      expect(mailService.sendMail).not.toHaveBeenCalled();
    });

    it('verifyLoginOtp rejects a wrong code', async () => {
      const user = await seedUser();
      usersRepository.createQueryBuilder.mockReturnValue(fakeQueryBuilder(user));
      await service.requestLoginOtp('ama@example.com', 'secret123', 'device-1');
      await expect(service.verifyLoginOtp('ama@example.com', '000000')).rejects.toThrow(BadRequestException);
    });

    it('verifyLoginOtp issues a session on the correct code, and remembers the device when asked', async () => {
      const user = await seedUser();
      usersRepository.createQueryBuilder.mockReturnValue(fakeQueryBuilder(user));
      usersRepository.findOne.mockResolvedValue(user); // verifyLoginOtp re-looks-up by plain findOne
      await service.requestLoginOtp('ama@example.com', 'secret123', 'device-1');
      const otp = redis._store.get('auth:otp:login:ama@example.com')!;

      const result = await service.verifyLoginOtp('ama@example.com', otp, 'device-1', true, 'iPhone');
      expect(result.accessToken).toBe('signed-jwt');
      expect(result.deviceToken).toEqual(expect.any(String));
      expect(trustedDevicesRepository.save).toHaveBeenCalled();
    });
  });
});
