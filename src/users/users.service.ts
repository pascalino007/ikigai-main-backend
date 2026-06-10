import { Injectable, NotFoundException, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';

import * as bcrypt from 'bcrypt';
import { Users } from './user.entity';
import { ClientWallet } from '../client/client_wallet/client_wallet.entity';
import { Shops } from '../shops/shop.entity';
import { CreateUserDto } from './dtos/create-user.dto';
import { UpdateUserDto } from './dtos/update-user.dto';
import { SigninUserDto } from './dtos/signin-user.dto';
import { MailService } from '../mail/mail.service';
import { resetPasswordTemplate } from '../mail/templates/reset-password.template';

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
    private jwtService: JwtService,
    private readonly mailService: MailService,
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
    const { email: rawEmail, password } = signinDto;

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

    delete (user as any).password;
    await this.ensureClientWallet(user.id);
    const payload = { email: user.email, sub: user.id, role: user.role };
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

    return { message: 'Signin successful', accessToken, user, shop };
  }

  // ✅ Get all users
  async findAll(): Promise<Users[]> {
    return await this.usersRepository.find();
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
    const entry = UsersService.resetOtps.get(normalized);
    if (!entry) throw new BadRequestException('No OTP requested for this email');
    if (entry.expiresAt < Date.now()) {
      UsersService.resetOtps.delete(normalized);
      throw new BadRequestException('OTP has expired');
    }
    if (entry.otp !== otp.trim()) throw new BadRequestException('Invalid OTP');

    // OTP consumed — mark validated in history
    const historyEntry = UsersService.otpHistory.find(
      h => h.email === normalized && h.otp === entry.otp && !h.validated,
    );
    if (historyEntry) {
      historyEntry.validated = true;
      historyEntry.validatedAt = Date.now();
    }
    UsersService.resetOtps.delete(normalized);

    const resetToken = `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    UsersService.resetTokens.set(resetToken, {
      email: normalized,
      expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes
    });
    return { success: true, resetToken };
  }

  async resetPasswordWithToken(resetToken: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    if (!resetToken || !newPassword) throw new BadRequestException('Reset token and new password are required');
    if (newPassword.length < 8) throw new BadRequestException('Password must be at least 8 characters');

    const entry = UsersService.resetTokens.get(resetToken);
    if (!entry) throw new BadRequestException('Invalid or expired reset token');
    if (entry.expiresAt < Date.now()) {
      UsersService.resetTokens.delete(resetToken);
      throw new BadRequestException('Reset token has expired');
    }

    const user = await this.usersRepository.findOne({ where: { email: entry.email } });
    if (!user) throw new NotFoundException('User not found');

    user.password = await bcrypt.hash(newPassword, 10);
    await this.usersRepository.save(user);

    UsersService.resetTokens.delete(resetToken);
    return { success: true, message: 'Password updated successfully' };
  }
}
