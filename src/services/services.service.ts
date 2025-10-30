import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Services } from './services.entity';
import { CreateServiceDto } from './dtos/create-service.dto';
import { UpdateServiceDto } from './dtos/update-service.dto';


@Injectable()
export class ServicesService {
  constructor(
    @InjectRepository(Services)
    private readonly servicesRepository: Repository<Services>,
  ) {}

  // ✅ Create a service
  async create(createServiceDto: CreateServiceDto): Promise<Services> {
    const service = this.servicesRepository.create({
      ...createServiceDto,
      is_active: true,
      createdAt: new Date(),
    });
    return await this.servicesRepository.save(service);
  }

  // ✅ Get all services
  async findAll(): Promise<Services[]> {
    return await this.servicesRepository.find();
  }

  // ✅ Get one service
  async findOne(id: number): Promise<Services> {
    const service = await this.servicesRepository.findOne({ where: { id } });
    if (!service) throw new NotFoundException(`Service with ID ${id} not found`);
    return service;
  }
  // ✅ Get services by Shop ID
  async findShopServices(id: number): Promise<Services[]> {
    const service = await this.servicesRepository.find({ where: { provider_id: id } });
    if (!service) throw new NotFoundException(`Service with ID ${id} not found`);
    return service;
  }

  // ✅ Update a service
  async update(id: number, updateServiceDto: UpdateServiceDto): Promise<Services> {
    const service = await this.servicesRepository.findOne({ where: { id } });
    if (!service) throw new NotFoundException(`Service with ID ${id} not found`);

    Object.assign(service, updateServiceDto);
    return await this.servicesRepository.save(service);
  }

  // ✅ Delete a service
  async remove(id: number): Promise<{ message: string }> {
    const result = await this.servicesRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Service with ID ${id} not found`);
    }
    return { message: `Service with ID ${id} deleted successfully` };
  }
}

