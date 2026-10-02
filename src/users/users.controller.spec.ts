import { BadRequestException, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UploadService } from '../upload/upload.service';

/**
 * HTTP-level test of the real login/register surface at `/auth`: real
 * routing, real ValidationPipe (whitelist+transform, matching main.ts), and
 * the real AppSignatureGuard on the OTP-login routes — only UsersService
 * itself (the thing that would otherwise touch the DB/Redis/mail) is mocked.
 * This is what the mobile app's login.dart/register.dart/registerscreen.dart
 * actually call: /auth/signup, /auth/register/request-otp + /register/verify,
 * and /auth/login/request-otp + /login/verify.
 */
describe('UsersController (HTTP) — /auth', () => {
  let app: INestApplication;
  let usersService: Record<string, jest.Mock>;

  beforeEach(async () => {
    usersService = {
      create: jest.fn(),
      signin: jest.fn(),
      requestRegisterOtp: jest.fn(),
      verifyRegisterOtpAndCreate: jest.fn(),
      requestLoginOtp: jest.fn(),
      verifyLoginOtp: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        // UsersController only needs UploadService for the (untested here)
        // profile-image route — a stub keeps DI happy without pulling in
        // the real Backblaze client.
        { provide: UploadService, useValue: {} },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /auth/signup (legacy immediate signup — what registerscreen.dart calls)', () => {
    const validBody = {
      firstname: 'Ama',
      lastname: 'K.',
      phone: '90171212',
      email: 'ama@example.com',
      password: 'secret123',
      role: 'user',
      image: '',
    };

    it('creates the account and returns it', async () => {
      usersService.create.mockResolvedValue({ user: { id: 1, email: 'ama@example.com' }, rawPassword: 'secret123' });
      const res = await request(app.getHttpServer()).post('/auth/signup').send(validBody).expect(201);
      expect(res.body.user.email).toBe('ama@example.com');
      expect(usersService.create).toHaveBeenCalledWith(expect.objectContaining({ email: 'ama@example.com' }));
    });

    it('rejects a payload missing required fields before it ever reaches the service', async () => {
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email: 'ama@example.com' })
        .expect(400);
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('surfaces a duplicate-email rejection from the service as-is', async () => {
      usersService.create.mockRejectedValue(new BadRequestException('User with this email already exists'));
      await request(app.getHttpServer()).post('/auth/signup').send(validBody).expect(400);
    });
  });

  describe('POST /auth/signin', () => {
    it('returns a session on valid credentials', async () => {
      usersService.signin.mockResolvedValue({
        message: 'ok',
        accessToken: 'jwt-access',
        refreshToken: 'jwt-refresh',
        user: { id: 1, email: 'ama@example.com' },
      });
      const res = await request(app.getHttpServer())
        .post('/auth/signin')
        .send({ email: 'ama@example.com', password: 'secret123' })
        .expect(201);
      expect(res.body.accessToken).toBe('jwt-access');
      expect(usersService.signin).toHaveBeenCalledWith(
        { email: 'ama@example.com', password: 'secret123' },
        undefined,
      );
    });

    it('rejects a malformed email before it reaches the service', async () => {
      await request(app.getHttpServer())
        .post('/auth/signin')
        .send({ email: 'not-an-email', password: 'secret123' })
        .expect(400);
      expect(usersService.signin).not.toHaveBeenCalled();
    });

    it('propagates invalid-credentials as 401', async () => {
      usersService.signin.mockRejectedValue(new UnauthorizedException('Invalid credentials'));
      await request(app.getHttpServer())
        .post('/auth/signin')
        .send({ email: 'ama@example.com', password: 'wrong' })
        .expect(401);
    });

    it('omitting x-app-id entirely is the real backward-compat path and reaches the service unsigned', async () => {
      usersService.signin.mockResolvedValue({ accessToken: 'a', refreshToken: 'b', user: {} });
      await request(app.getHttpServer())
        .post('/auth/signin')
        .send({ email: 'ama@example.com', password: 'secret123' })
        .expect(201);
      expect(usersService.signin).toHaveBeenCalledWith(expect.anything(), undefined);
    });

    it('sending x-app-id WITHOUT the matching timestamp/signature is rejected, not waved through', async () => {
      // Backward compat only covers an app build that sends none of the
      // X-App-* headers — once x-app-id is present, AppSignatureGuard
      // requires the full signed trio, so a partial header set is invalid.
      await request(app.getHttpServer())
        .post('/auth/signin')
        .set('x-app-id', 'client')
        .send({ email: 'ama@example.com', password: 'secret123' })
        .expect(401);
      expect(usersService.signin).not.toHaveBeenCalled();
    });

    it('rejects a present-but-invalid app signature (AppSignatureGuard)', async () => {
      await request(app.getHttpServer())
        .post('/auth/signin')
        .set('x-app-id', 'client')
        .set('x-app-timestamp', String(Date.now()))
        .set('x-app-signature', 'not-a-real-signature')
        .send({ email: 'ama@example.com', password: 'secret123' })
        .expect(401);
      expect(usersService.signin).not.toHaveBeenCalled();
    });
  });

  describe('OTP register flow — what register.dart calls', () => {
    it('POST /auth/register/request-otp sends the code', async () => {
      usersService.requestRegisterOtp.mockResolvedValue({ success: true, message: 'sent' });
      const res = await request(app.getHttpServer())
        .post('/auth/register/request-otp')
        .send({ email: 'ama@example.com' })
        .expect(201);
      expect(res.body).toEqual({ success: true, message: 'sent' });
      expect(usersService.requestRegisterOtp).toHaveBeenCalledWith('ama@example.com');
    });

    it('POST /auth/register/verify creates the account once the OTP is valid', async () => {
      usersService.verifyRegisterOtpAndCreate.mockResolvedValue({
        user: { id: 2, email: 'ama@example.com' },
        rawPassword: 'secret123',
      });
      const res = await request(app.getHttpServer())
        .post('/auth/register/verify')
        .send({
          firstname: 'Ama',
          lastname: 'K.',
          phone: '90171212',
          email: 'ama@example.com',
          password: 'secret123',
          role: 'user',
          image: '',
          otp: '123456',
        })
        .expect(201);
      expect(res.body.user.id).toBe(2);
      expect(usersService.verifyRegisterOtpAndCreate).toHaveBeenCalledWith(
        expect.objectContaining({ otp: '123456', email: 'ama@example.com' }),
      );
    });

    it('POST /auth/register/verify rejects a request with no otp field', async () => {
      await request(app.getHttpServer())
        .post('/auth/register/verify')
        .send({ firstname: 'Ama', lastname: 'K.', phone: '90171212', email: 'ama@example.com', password: 'x', role: 'user', image: '' })
        .expect(400);
      expect(usersService.verifyRegisterOtpAndCreate).not.toHaveBeenCalled();
    });
  });

  describe('OTP login flow — what login.dart calls', () => {
    it('POST /auth/login/request-otp reports otpRequired for an untrusted device', async () => {
      usersService.requestLoginOtp.mockResolvedValue({ otpRequired: true, message: 'sent' });
      const res = await request(app.getHttpServer())
        .post('/auth/login/request-otp')
        .send({ email: 'ama@example.com', password: 'secret123', deviceId: 'device-1' })
        .expect(201);
      expect(res.body.otpRequired).toBe(true);
      expect(usersService.requestLoginOtp).toHaveBeenCalledWith(
        'ama@example.com',
        'secret123',
        'device-1',
        undefined,
        undefined,
      );
    });

    it('POST /auth/login/request-otp skips straight to a session for an already-trusted device', async () => {
      usersService.requestLoginOtp.mockResolvedValue({
        otpRequired: false,
        accessToken: 'jwt-access',
        refreshToken: 'jwt-refresh',
        user: { id: 1 },
      });
      const res = await request(app.getHttpServer())
        .post('/auth/login/request-otp')
        .send({ email: 'ama@example.com', password: 'secret123', deviceId: 'device-1', deviceToken: 'trusted-token' })
        .expect(201);
      expect(res.body.otpRequired).toBe(false);
      expect(res.body.accessToken).toBe('jwt-access');
    });

    it('POST /auth/login/verify issues a session once the OTP checks out', async () => {
      usersService.verifyLoginOtp.mockResolvedValue({
        message: 'ok',
        accessToken: 'jwt-access',
        refreshToken: 'jwt-refresh',
        user: { id: 1, email: 'ama@example.com' },
      });
      const res = await request(app.getHttpServer())
        .post('/auth/login/verify')
        .send({ email: 'ama@example.com', otp: '654321' })
        .expect(201);
      expect(res.body.accessToken).toBe('jwt-access');
      expect(usersService.verifyLoginOtp).toHaveBeenCalledWith(
        'ama@example.com',
        '654321',
        undefined,
        undefined,
        undefined,
        undefined,
      );
    });

    it('POST /auth/login/verify propagates an invalid-OTP rejection as 400', async () => {
      usersService.verifyLoginOtp.mockRejectedValue(new BadRequestException('Code invalide'));
      await request(app.getHttpServer())
        .post('/auth/login/verify')
        .send({ email: 'ama@example.com', otp: '000000' })
        .expect(400);
    });
  });
});
