import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

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
  ) {}

  // ✅ Create a new user
  async create(createUserDto: CreateUserDto): Promise<Users> {
    let passwordToUse: string;

    if (createUserDto.role.toLowerCase() === 'user') {
      // Use provided password
      passwordToUse = createUserDto.password;
    } else {
      // Generate random password for admins/managers
      passwordToUse = Math.random().toString(36).slice(-8); // 8-char password
    }

    const hashedPassword = await bcrypt.hash(passwordToUse, 10);

    const newUser = this.usersRepository.create({
      ...createUserDto,
      password: hashedPassword,
      is_active: true,
      createdAt: new Date(),
    });

    return await this.usersRepository.save(newUser);
  }

    async signin(signinDto: SigninUserDto): Promise<{ message: string; userId?: number }> {
    const { email, password } = signinDto;
    const user = await this.usersRepository.findOne({ where: { email } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new BadRequestException('Invalid password');
    }

    return { message: 'Signin successful', userId: user.id };
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

    // If password is being updated for role 'user', hash it
    if (updateUserDto.password && user.role.toLowerCase() === 'user') {
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
}
