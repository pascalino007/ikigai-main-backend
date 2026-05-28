import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { ProOwnners } from './pro_ownners.entity';
import { Users } from '../../users/user.entity';
import { CreateProOwnnerDto } from './dtos/create-proownner.dto';
import { UpdateProOwnnerDto } from './dtos/update-proownner.dto';


@Injectable()
export class ProOwnnersService {
  constructor(
    @InjectRepository(ProOwnners)
    private readonly proOwnnersRepository: Repository<ProOwnners>,
    @InjectRepository(Users)
    private readonly usersRepository: Repository<Users>,
  ) {}

  // ✅ Create a ProOwner and auto-create a provider user
  async create(createDto: CreateProOwnnerDto): Promise<{ proOwner: ProOwnners; rawPassword: string }> {
    const proOwner = this.proOwnnersRepository.create({
      ...createDto,
      createdAt: new Date(),
    });
    const savedProOwner = await this.proOwnnersRepository.save(proOwner);

    const rawPassword = 'ikigai@2026';
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    const user = this.usersRepository.create({
      firstname: savedProOwner.firstname,
      lastname: savedProOwner.lastname,
      email: savedProOwner.email,
      phone: savedProOwner.phone_number,
      password: hashedPassword,
      role: 'provider',
      image: savedProOwner.profileImageUrl || '',
      is_active: true,
      createdAt: new Date(),
    });
    await this.usersRepository.save(user);

    return { proOwner: savedProOwner, rawPassword };
  }

  // ✅ Get all ProOwners
  async findAll(): Promise<ProOwnners[]> {
    return await this.proOwnnersRepository.find();
  }

  // ✅ Count ProOwners in DB
  async count(): Promise<number> {
    return await this.proOwnnersRepository.count();
  }

  // ✅ Get one ProOwner
  async findOne(id: number): Promise<ProOwnners> {
    const proOwner = await this.proOwnnersRepository.findOne({ where: { id } });
    if (!proOwner) throw new NotFoundException(`ProOwner with ID ${id} not found`);
    return proOwner;
  }

  // ✅ Update a ProOwner
  async update(id: number, updateDto: UpdateProOwnnerDto): Promise<ProOwnners> {
    const proOwner = await this.proOwnnersRepository.findOne({ where: { id } });
    if (!proOwner) throw new NotFoundException(`ProOwner with ID ${id} not found`);

    Object.assign(proOwner, updateDto);
    return await this.proOwnnersRepository.save(proOwner);
  }

  // ✅ Delete a ProOwner
  async remove(id: number): Promise<{ message: string }> {
    const result = await this.proOwnnersRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`ProOwner with ID ${id} not found`);
    }
    return { message: `ProOwner with ID ${id} deleted successfully` };
  }
}
