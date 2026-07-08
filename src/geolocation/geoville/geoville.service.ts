import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Geoville } from './entities/geoville.entity';
import { CreateGeovilleDto } from './dto/create-geoville.dto';
import { UpdateGeovilleDto } from './dto/update-geoville.dto';
import { RedisService } from '../../redis/redis.service';

/** Geo reference data barely changes → cache 10 min; writes invalidate. */
const TTL = 600;

@Injectable()
export class GeovilleService {
  constructor(
    @InjectRepository(Geoville)
    private readonly geovilleRepository: Repository<Geoville>,
    private readonly redis: RedisService,
  ) {}

  private invalidate(): Promise<void> {
    return this.redis.delPattern('geo:*');
  }

  // CREATE
  async create(createGeovilleDto: CreateGeovilleDto): Promise<Geoville> {
    const geoville = this.geovilleRepository.create(createGeovilleDto);
    const saved = await this.geovilleRepository.save(geoville);
    await this.invalidate();
    return saved;
  }

  // FIND ALL (cached)
  async findAll(): Promise<Geoville[]> {
    return this.redis.remember('geo:all', TTL, () =>
      this.geovilleRepository.find({ order: { createdAt: 'DESC' } }),
    );
  }

  // FIND ONE (cached)
  async findOne(id: string): Promise<Geoville> {
    return this.redis.remember(`geo:one:${id}`, TTL, async () => {
      const geoville = await this.geovilleRepository.findOne({ where: { id } });
      if (!geoville) {
        throw new NotFoundException('Geoville not found');
      }
      return geoville;
    });
  }

  // UPDATE
  async update(
    id: string,
    updateGeovilleDto: UpdateGeovilleDto,
  ): Promise<Geoville> {
    await this.findOne(id); // vérifie l'existence
    await this.geovilleRepository.update(id, updateGeovilleDto);
    await this.invalidate();
    return this.findOne(id);
  }

  // DELETE
  async remove(id: string): Promise<void> {
    const result = await this.geovilleRepository.delete(id);

    if (result.affected === 0) {
      throw new NotFoundException('Geoville not found');
    }
    await this.invalidate();
  }
}
