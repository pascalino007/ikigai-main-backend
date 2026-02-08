import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';

import * as bcrypt from 'bcrypt';
import { Users } from './user.entity';
import { CreateUserDto } from './dtos/create-user.dto';
import { UpdateUserDto } from './dtos/update-user.dto';
import { SigninUserDto } from './dtos/signin-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(Users)
    private readonly usersRepository: Repository<Users>,
    private jwtService: JwtService,
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
  delete (savedUser as any).password;

  return { user: savedUser, rawPassword }; // return plain password once
}



    async signin(signinDto: SigninUserDto): Promise<{ message: string; accessToken: string; user: Users }> {
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
    const payload = { email: user.email, sub: user.id, role: user.role };
    const accessToken = this.jwtService.sign(payload);
    return { message: 'Signin successful', accessToken, user };
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

  async resetPassword(userId: number, newPassword: string): Promise<string> {
  const user = await this.usersRepository.findOne({ where: { id: userId } });
  if (!user) throw new NotFoundException("User not found");

  user.password = await bcrypt.hash(newPassword, 10);

  await this.usersRepository.save(user);

  return "Password updated successfully";
}
}
