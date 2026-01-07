import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Geoville } from './entities/geoville.entity';
import { CreateGeovilleDto } from './dto/create-geoville.dto';
import { UpdateGeovilleDto } from './dto/update-geoville.dto';

@Injectable()
export class GeovilleService {
  constructor(
    @InjectRepository(Geoville)
    private readonly geovilleRepository: Repository<Geoville>,
  ) {}

  // CREATE
  async create(createGeovilleDto: CreateGeovilleDto): Promise<Geoville> {
    const geoville = this.geovilleRepository.create(createGeovilleDto);
    return this.geovilleRepository.save(geoville);
  }

  // FIND ALL
  async findAll(): Promise<Geoville[]> {
    return this.geovilleRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  // FIND ONE
  async findOne(id: string): Promise<Geoville> {
    const geoville = await this.geovilleRepository.findOne({
      where: { id },
    });

    if (!geoville) {
      throw new NotFoundException('Geoville not found');
    }

    return geoville;
  }

  // UPDATE
  async update(
    id: string,
    updateGeovilleDto: UpdateGeovilleDto,
  ): Promise<Geoville> {
    await this.findOne(id); // vérifie l'existence
    await this.geovilleRepository.update(id, updateGeovilleDto);
    return this.findOne(id);
  }

  // DELETE
  async remove(id: string): Promise<void> {
    const result = await this.geovilleRepository.delete(id);

    if (result.affected === 0) {
      throw new NotFoundException('Geoville not found');
    }
  }
}
