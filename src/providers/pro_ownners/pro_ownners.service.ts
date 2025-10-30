import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProOwnners } from './pro_ownners.entity';
import { CreateProOwnnerDto } from './dtos/create-proownner.dto';
import { UpdateProOwnnerDto } from './dtos/update-proownner.dto';


@Injectable()
export class ProOwnnersService {
  constructor(
    @InjectRepository(ProOwnners)
    private readonly proOwnnersRepository: Repository<ProOwnners>,
  ) {}

  // ✅ Create a ProOwner
  async create(createDto: CreateProOwnnerDto): Promise<ProOwnners> {
    const proOwner = this.proOwnnersRepository.create({
      ...createDto,
      createdAt: new Date(),
    });
    return await this.proOwnnersRepository.save(proOwner);
  }

  // ✅ Get all ProOwners
  async findAll(): Promise<ProOwnners[]> {
    return await this.proOwnnersRepository.find();
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
