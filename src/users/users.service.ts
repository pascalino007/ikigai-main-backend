import { Injectable, NotFoundException, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';

import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Users } from './user.entity';
import { TrustedDevice } from './trusted-device.entity';
import { ClientWallet } from '../client/client_wallet/client_wallet.entity';
import { Shops } from '../shops/shop.entity';
import { CreateUserDto } from './dtos/create-user.dto';
import { RegisterWithOtpDto } from './dtos/register-otp.dto';
import { UpdateUserDto } from './dtos/update-user.dto';
import { SigninUserDto } from './dtos/signin-user.dto';
import { MailService } from '../mail/mail.service';
import { RedisService } from '../redis/redis.service';
import { resetPasswordTemplate } from '../mail/templates/reset-password.template';
import { otpEmailTemplate } from '../mail/templates/otp.template';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(Users)
    private readonly usersRepository: Repository<Users>,
    @InjectRepository(ClientWallet)
    private readonly clientWalletRepository: Repository<ClientWallet>,
    @InjectRepository(Shops)
    private readonly shopsRepository: Repository<Shops>,
    @InjectRepository(TrustedDevice)
    private readonly trustedDevicesRepository: Repository<TrustedDevice>,
    private jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly redis: RedisService,
  ) {}

  // ✅ Create a new user
   async create(createUserDto: CreateUserDto): Promise<{ user: Users; rawPassword: string }> {
    if (!createUserDto.email) {
      throw new BadRequestException('Email is required');
    }
    const email = createUserDto.email.toLowerCase().trim();
    const existingUser = await this.usersRepository.findOne({ where: { email } });
    if (existingUser) {
      throw new BadRequestException('User with this email already exists');
    }

    const role = createUserDto.role ? createUserDto.role.toLowerCase().trim() : 'user';
    let rawPassword = createUserDto.password;

    if (!rawPassword) {
      if (role === 'user') {
        throw new BadRequestException('Password is required');
      } else {
        // For admin, enroller, manager, provider → role + 123
        rawPassword = `${role}123`;
      }
    }

  const hashedPassword = await bcrypt.hash(rawPassword, 10);

  const newUser = this.usersRepository.create({
    ...createUserDto,
    email,
    role,
    password: hashedPassword,
    is_active: true,
    createdAt: new Date(),
  });

  const savedUser = await this.usersRepository.save(newUser);
  await this.ensureClientWallet(savedUser.id);
  delete (savedUser as any).password;

  return { user: savedUser, rawPassword }; // return plain password once
}

  /** One wallet per user; idempotent for safe retries. */
  private async ensureClientWallet(userId: number): Promise<void> {
    const existing = await this.clientWalletRepository.findOne({
      where: { client_id: userId },
    });
    if (existing) {
      return;
    }
    await this.clientWalletRepository.save(
      this.clientWalletRepository.create({
        client_id: userId,
        balance: 0,
      }),
    );
  }



    async signin(signinDto: SigninUserDto): Promise<{ message: string; accessToken: string; user: Users; shop?: Shops | null }> {
    const user = await this.validateCredentials(signinDto.email, signinDto.password);
    return this.issueSession(user);
  }

  /** Validate email + password, returning the user (with legacy plain-text migration). Throws on failure. */
  private async validateCredentials(rawEmail: string, password: string): Promise<Users> {
    if (!rawEmail || !password) {
      throw new BadRequestException('Email and password are required');
    }

    const email = rawEmail.toLowerCase().trim();
    const user = await this.usersRepository.createQueryBuilder('users')
      .addSelect('users.password')
      .where('users.email = :email', { email })
      .getOne();

    if (!user) {
      console.warn(`Signin failed: User not found for email ${email}`);
      throw new NotFoundException('User not found');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      console.warn(`Signin failed: Invalid password for user ${email}`);
      // Check if the password in DB is plain text (legacy support/migration)
      if (password === user.password) {
        // Hash it and save
        user.password = await bcrypt.hash(password, 10);
        await this.usersRepository.save(user);
      } else {
        throw new UnauthorizedException('Invalid credentials');
      }
    }

    return user;
  }

  /** Issue a JWT session for an already-authenticated user. */
  private async issueSession(user: Users): Promise<{ message: string; accessToken: string; sessionId: string; user: Users; shop?: Shops | null }> {
    delete (user as any).password;
    delete (user as any).active_session_id;
    await this.ensureClientWallet(user.id);

    // Single active session: this login supersedes any previous one on other devices.
    const sessionId = crypto.randomBytes(24).toString('hex');
    await this.usersRepository.update(user.id, { active_session_id: sessionId });

    const payload = { email: user.email, sub: user.id, role: user.role, sid: sessionId };
    const accessToken = this.jwtService.sign(payload);

    let shop: Shops | null = null;
    if (user.role === 'provider') {
      shop = await this.shopsRepository.findOne({ where: { user_id: user.id } });
      // Fallback: match by owner email for shops not yet linked via user_id
      if (!shop) {
        shop = await this.shopsRepository.findOne({ where: { owner: user.email } });
        // Opportunistically fix the user_id for next logins
        if (shop && shop.user_id == null) {
          shop.user_id = user.id;
          await this.shopsRepository.save(shop);
        }
      }
    }

    return { message: 'Signin successful', accessToken, sessionId, user, shop };
  }

  /** Is this the user's current active session? */
  async checkSession(userId: number, sessionId: string): Promise<{ valid: boolean }> {
    if (!userId || !sessionId) return { valid: false };
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'active_session_id'],
    });
    return { valid: !!user && user.active_session_id === sessionId };
  }

  /** Clear the active session (manual logout). Only clears if the caller owns the current session. */
  async clearSession(userId: number, sessionId?: string): Promise<{ success: boolean }> {
    if (!userId) return { success: false };
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'active_session_id'],
    });
    if (user && (!sessionId || user.active_session_id === sessionId)) {
      await this.usersRepository.update(userId, { active_session_id: null });
    }
    return { success: true };
  }

  // ===== Auth OTP (email verification for sign-up + 2FA login) =====

  /** Generate, store (Redis, 10 min) and record a 6-digit OTP for the given purpose. */
  private async generateAuthOtp(email: string, purpose: 'register' | 'login'): Promise<string> {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await this.redis.setex(`auth:otp:${purpose}:${email}`, 600, otp);
    UsersService.otpHistory.unshift({ email, otp, createdAt: Date.now(), validated: false, expired: false });
    return otp;
  }

  /** Verify + consume an OTP for the given purpose. Throws if missing/invalid. */
  private async consumeAuthOtp(email: string, otp: string, purpose: 'register' | 'login'): Promise<void> {
    if (!otp) throw new BadRequestException('Code requis');
    const key = `auth:otp:${purpose}:${email}`;
    const stored = await this.redis.get(key);
    if (!stored) throw new BadRequestException('Aucun code demandé pour cet email ou code expiré');
    if (stored !== otp.trim()) throw new BadRequestException('Code invalide');
    await this.redis.del(key);
    const h = UsersService.otpHistory.find(x => x.email === email && x.otp === stored && !x.validated);
    if (h) { h.validated = true; h.validatedAt = Date.now(); }
  }

  private async sendAuthOtpEmail(email: string, otp: string, subject: string, purpose: string): Promise<void> {
    const sent = await this.mailService.sendMail({ to: email, subject, html: otpEmailTemplate(otp, purpose) });
    if (!sent) this.logger.warn(`Failed to send OTP email to ${email}, but OTP is still valid`);
  }

  private devOtp(otp: string) {
    return process.env.NODE_ENV === 'production' ? {} : { devOtp: otp };
  }

  /** Step 1 of sign-up: email must be free; send a verification OTP. */
  async requestRegisterOtp(email: string): Promise<{ success: boolean; message: string; devOtp?: string }> {
    if (!email) throw new BadRequestException('Email requis');
    const normalized = email.toLowerCase().trim();
    const existing = await this.usersRepository.findOne({ where: { email: normalized } });
    if (existing) throw new BadRequestException('Un compte existe déjà avec cet email');
    const otp = await this.generateAuthOtp(normalized, 'register');
    await this.sendAuthOtpEmail(normalized, otp, 'Code de vérification - Ikigai', 'vérification');
    return { success: true, message: 'Un code de vérification a été envoyé à votre email', ...this.devOtp(otp) };
  }

  /** Step 2 of sign-up: verify OTP then create the account. */
  async verifyRegisterOtpAndCreate(dto: RegisterWithOtpDto): Promise<{ user: Users; rawPassword: string }> {
    const normalized = (dto.email || '').toLowerCase().trim();
    await this.consumeAuthOtp(normalized, dto.otp, 'register');
    const { otp, ...userDto } = dto;
    return this.create(userDto as CreateUserDto);
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /** True if this device is currently trusted for the user (refreshes lastUsedAt). */
  private async isDeviceTrusted(userId: number, deviceId?: string, token?: string): Promise<boolean> {
    if (!deviceId || !token) return false;
    const rec = await this.trustedDevicesRepository.findOne({
      where: { user_id: userId, device_id: deviceId, token_hash: this.hashToken(token) },
    });
    if (!rec) return false;
    if (rec.expiresAt.getTime() < Date.now()) {
      await this.trustedDevicesRepository.delete(rec.id);
      return false;
    }
    rec.lastUsedAt = new Date();
    await this.trustedDevicesRepository.save(rec);
    return true;
  }

  /** Remember a device for 30 days; returns the secret token (only its hash is stored). */
  private async rememberDevice(userId: number, deviceId: string, deviceName?: string): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const existing = await this.trustedDevicesRepository.findOne({ where: { user_id: userId, device_id: deviceId } });
    if (existing) {
      existing.token_hash = this.hashToken(token);
      existing.device_name = deviceName ?? existing.device_name ?? null;
      existing.expiresAt = expiresAt;
      existing.lastUsedAt = new Date();
      await this.trustedDevicesRepository.save(existing);
    } else {
      await this.trustedDevicesRepository.save(
        this.trustedDevicesRepository.create({
          user_id: userId,
          device_id: deviceId,
          token_hash: this.hashToken(token),
          device_name: deviceName ?? null,
          expiresAt,
          lastUsedAt: new Date(),
        }),
      );
    }
    return token;
  }

  /**
   * Step 1 of login: validate credentials. If the device is already trusted,
   * skip OTP and return the session immediately; otherwise send a login OTP.
   */
  async requestLoginOtp(
    email: string,
    password: string,
    deviceId?: string,
    deviceToken?: string,
  ): Promise<{ otpRequired: boolean; message?: string; accessToken?: string; sessionId?: string; user?: Users; shop?: Shops | null; devOtp?: string }> {
    const user = await this.validateCredentials(email, password);
    const normalized = user.email.toLowerCase().trim();

    if (await this.isDeviceTrusted(user.id, deviceId, deviceToken)) {
      const session = await this.issueSession(user);
      return { otpRequired: false, ...session };
    }

    const otp = await this.generateAuthOtp(normalized, 'login');
    await this.sendAuthOtpEmail(normalized, otp, 'Code de connexion - Ikigai', 'connexion');
    return { otpRequired: true, message: 'Un code de connexion a été envoyé à votre email', ...this.devOtp(otp) };
  }

  /** Step 2 of login: verify OTP, issue the session, and optionally remember the device. */
  async verifyLoginOtp(
    email: string,
    otp: string,
    deviceId?: string,
    rememberDevice?: boolean,
    deviceName?: string,
  ): Promise<{ message: string; accessToken: string; sessionId?: string; user: Users; shop?: Shops | null; deviceToken?: string }> {
    if (!email) throw new BadRequestException('Email requis');
    const normalized = email.toLowerCase().trim();
    await this.consumeAuthOtp(normalized, otp, 'login');
    const user = await this.usersRepository.findOne({ where: { email: normalized } });
    if (!user) throw new NotFoundException('User not found');
    const session = await this.issueSession(user);
    if (rememberDevice && deviceId) {
      const deviceToken = await this.rememberDevice(user.id, deviceId, deviceName);
      return { ...session, deviceToken };
    }
    return session;
  }

  // ✅ Get all users
  async findAll(): Promise<Users[]> {
    return await this.usersRepository.find();
  }

  /**
   * Mobile-app usage stats.
   *
   * The mobile app integrates Firebase Cloud Messaging only (no Firebase Auth / Analytics),
   * so the truthful "using the app" signal is the Firebase push token a device registers
   * when it opens the app — persisted here as Users.fcm_token. A client with a token is a
   * device actively registered with Firebase for our app.
   */
  async getAppUsageStats() {
    const clients = await this.usersRepository.find({
      where: { role: 'user' },
      select: ['id', 'createdAt', 'fcm_token', 'is_active'],
    });

    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    let appUsers = 0; // clients registered with Firebase push (proxy for active app installs)
    let activeClients = 0; // account is_active
    let newLast7Days = 0;
    let newLast30Days = 0;
    const dailyMap = new Map<string, number>();

    for (const c of clients) {
      if (c.fcm_token && c.fcm_token.trim() !== '') appUsers++;
      if (c.is_active) activeClients++;
      if (c.createdAt) {
        const created = new Date(c.createdAt).getTime();
        if (now - created <= 7 * DAY) newLast7Days++;
        if (now - created <= 30 * DAY) newLast30Days++;
        const key = new Date(c.createdAt).toISOString().slice(0, 10);
        dailyMap.set(key, (dailyMap.get(key) ?? 0) + 1);
      }
    }

    // Client sign-ups per day for the last 14 days (for a trend chart).
    const signupsByDay: { date: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const key = new Date(now - i * DAY).toISOString().slice(0, 10);
      signupsByDay.push({ date: key, count: dailyMap.get(key) ?? 0 });
    }

    return {
      totalClients: clients.length,
      appUsers,
      activeClients,
      adoptionRate: clients.length ? Math.round((appUsers / clients.length) * 100) : 0,
      newLast7Days,
      newLast30Days,
      signupsByDay,
      source: 'firebase-cloud-messaging',
      generatedAt: new Date().toISOString(),
    };
  }

  // ✅ Get a single user by ID
  async findOne(id: number): Promise<Users> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);
    return user;
  }

  // ✅ Update a user
  async update(id: number, updateUserDto: UpdateUserDto): Promise<Users> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);

    // Hash password if provided
    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    Object.assign(user, updateUserDto);
    return await this.usersRepository.save(user);
  }

  // ✅ Delete a user
  async remove(id: number): Promise<{ message: string }> {
    const result = await this.usersRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return { message: `User with ID ${id} deleted successfully` };
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean; message: string }> {
    if (!currentPassword || !newPassword) {
      throw new BadRequestException('Current and new password are required');
    }
    if (newPassword.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters');
    }
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.id = :id', { id: userId })
      .getOne();
    if (!user) throw new NotFoundException('User not found');

    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) {
      throw new BadRequestException('Current password is incorrect');
    }
    user.password = await bcrypt.hash(newPassword, 10);
    await this.usersRepository.save(user);
    return { success: true, message: 'Password updated successfully' };
  }

  async updateFcmToken(id: number, fcmToken: string): Promise<Users> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);
    user.fcm_token = fcmToken;
    return await this.usersRepository.save(user);
  }

  async resetPassword(userId: number, newPassword: string): Promise<string> {
  const user = await this.usersRepository.findOne({ where: { id: userId } });
  if (!user) throw new NotFoundException("User not found");

  user.password = await bcrypt.hash(newPassword, 10);

  await this.usersRepository.save(user);

  return "Password updated successfully";
}

  // ===== Password reset flow (OTP by email) =====
  // In-memory OTP store (email -> {otp, expiresAt}). For production use Redis/DB.
  private static resetOtps = new Map<string, { otp: string; expiresAt: number }>();
  private static resetTokens = new Map<string, { email: string; expiresAt: number }>();

  // OTP history for admin monitoring (email, otp, createdAt, validated, validatedAt)
  private static otpHistory: Array<{
    email: string;
    otp: string;
    createdAt: number;
    validated: boolean;
    validatedAt?: number;
    expired: boolean;
  }> = [];

  static getAllOtps() {
    const now = Date.now();
    // Active OTPs from the map
    const active = Array.from(UsersService.resetOtps.entries()).map(([email, entry]) => ({
      email,
      otp: entry.otp,
      createdAt: entry.expiresAt - 10 * 60 * 1000, // approximate
      expiresAt: entry.expiresAt,
      validated: false,
      expired: entry.expiresAt < now,
    }));
    return { active, history: UsersService.otpHistory };
  }

  async requestPasswordReset(email: string): Promise<{ success: boolean; message: string; devOtp?: string }> {
    if (!email) throw new BadRequestException('Email is required');
    const normalized = email.toLowerCase().trim();
    const user = await this.usersRepository.findOne({ where: { email: normalized } });
    if (!user) throw new NotFoundException('No account found with this email');

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const now = Date.now();
    const expiresAt = now + 10 * 60 * 1000; // 10 minutes
    UsersService.resetOtps.set(normalized, { otp, expiresAt });
    // Shared across instances + auto-expiring (in-memory map kept as fallback).
    await this.redis.setex(`reset:otp:${normalized}`, 600, otp);
    UsersService.otpHistory.unshift({
      email: normalized,
      otp,
      createdAt: now,
      validated: false,
      expired: false,
    });

    // Send OTP via email
    const html = resetPasswordTemplate(otp);
    const sent = await this.mailService.sendMail({
      to: normalized,
      subject: 'Code de réinitialisation - Ikigai',
      html,
    });

    if (!sent) {
      this.logger.warn(`Failed to send OTP email to ${normalized}, but OTP is still valid`);
    }

    const isProd = process.env.NODE_ENV === 'production';
    return {
      success: true,
      message: 'A verification code has been sent to your email',
      ...(isProd ? {} : { devOtp: otp }),
    };
  }

  async verifyResetOtp(email: string, otp: string): Promise<{ success: boolean; resetToken: string }> {
    if (!email || !otp) throw new BadRequestException('Email and OTP are required');
    const normalized = email.toLowerCase().trim();
    const provided = otp.trim();

    // Redis first (shared, auto-expiring), then the in-memory fallback.
    let storedOtp = await this.redis.get(`reset:otp:${normalized}`);
    if (!storedOtp) {
      const entry = UsersService.resetOtps.get(normalized);
      if (entry && entry.expiresAt >= Date.now()) {
        storedOtp = entry.otp;
      } else if (entry) {
        UsersService.resetOtps.delete(normalized);
      }
    }
    if (!storedOtp) throw new BadRequestException('No OTP requested for this email or it has expired');
    if (storedOtp !== provided) throw new BadRequestException('Invalid OTP');

    // OTP consumed — mark validated in history
    const historyEntry = UsersService.otpHistory.find(
      h => h.email === normalized && h.otp === storedOtp && !h.validated,
    );
    if (historyEntry) {
      historyEntry.validated = true;
      historyEntry.validatedAt = Date.now();
    }
    await this.redis.del(`reset:otp:${normalized}`);
    UsersService.resetOtps.delete(normalized);

    const resetToken = `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    UsersService.resetTokens.set(resetToken, {
      email: normalized,
      expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes
    });
    await this.redis.setex(`reset:token:${resetToken}`, 900, normalized);
    return { success: true, resetToken };
  }

  async resetPasswordWithToken(resetToken: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    if (!resetToken || !newPassword) throw new BadRequestException('Reset token and new password are required');
    if (newPassword.length < 8) throw new BadRequestException('Password must be at least 8 characters');

    let email = await this.redis.get(`reset:token:${resetToken}`);
    if (!email) {
      const entry = UsersService.resetTokens.get(resetToken);
      if (entry && entry.expiresAt >= Date.now()) {
        email = entry.email;
      } else if (entry) {
        UsersService.resetTokens.delete(resetToken);
      }
    }
    if (!email) throw new BadRequestException('Invalid or expired reset token');

    const user = await this.usersRepository.findOne({ where: { email } });
    if (!user) throw new NotFoundException('User not found');

    user.password = await bcrypt.hash(newPassword, 10);
    await this.usersRepository.save(user);

    await this.redis.del(`reset:token:${resetToken}`);
    UsersService.resetTokens.delete(resetToken);
    return { success: true, message: 'Password updated successfully' };
  }
}
