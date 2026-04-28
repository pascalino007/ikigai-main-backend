import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Users } from '../users/user.entity';
import { Shops } from '../shops/shop.entity';
import * as bcrypt from 'bcrypt';

export interface CreateEnrollerDto {
  firstname: string;
  lastname: string;
  email: string;
  phone: string;
  password: string;
  image?: string;
}

@Injectable()
export class EnrollersService {
  constructor(
    @InjectRepository(Users)
    private readonly usersRepo: Repository<Users>,
    @InjectRepository(Shops)
    private readonly shopsRepo: Repository<Shops>,
  ) {}

  /** List all enrollers with their shops count */
  async findAll() {
    const enrollers = await this.usersRepo.find({ where: { role: 'enroller' } });
    const withStats = await Promise.all(
      enrollers.map(async (e) => {
        const shopsCount = await this.shopsRepo.count({ where: { registered_by: String(e.id) } });
        let superiorName: string | null = null;
        if (e.superior_id) {
          const sup = await this.usersRepo.findOne({ where: { id: e.superior_id } });
          if (sup) superiorName = `${sup.firstname} ${sup.lastname}`;
        }
        return { ...e, shopsCount, superiorName };
      }),
    );
    return withStats;
  }

  /** Get one enroller with their enrolled shops */
  async findOne(id: number) {
    const enroller = await this.usersRepo.findOne({ where: { id, role: 'enroller' } });
    if (!enroller) throw new NotFoundException(`Enroller #${id} not found`);

    const shops = await this.shopsRepo.find({ where: { registered_by: String(id) } });
    let superiorName: string | null = null;
    if (enroller.superior_id) {
      const sup = await this.usersRepo.findOne({ where: { id: enroller.superior_id } });
      if (sup) superiorName = `${sup.firstname} ${sup.lastname}`;
    }
    return { ...enroller, shops, superiorName };
  }

  /** Get shops enrolled by a specific enroller */
  async getEnrollerShops(id: number) {
    const enroller = await this.usersRepo.findOne({ where: { id } });
    if (!enroller) throw new NotFoundException(`Enroller #${id} not found`);
    return this.shopsRepo.find({ where: { registered_by: String(id) }, order: { createdAt: 'DESC' } });
  }

  /**
   * Create an enroller.
   * - admin can create any enroller
   * - manager can create 'enroller' only; superior_id is set to the manager's id
   */
  async create(dto: CreateEnrollerDto, creatorRole: string, creatorId: number) {
    if (creatorRole !== 'admin' && creatorRole !== 'manager') {
      throw new ForbiddenException('Only admin or manager can create enrollers');
    }

    const email = dto.email.toLowerCase().trim();
    const existing = await this.usersRepo.findOne({ where: { email } });
    if (existing) throw new BadRequestException('Email already in use');

    if (!dto.password || dto.password.trim().length < 4) {
      throw new BadRequestException('Password must be at least 4 characters');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const superior_id = creatorRole === 'manager' ? creatorId : null;

    const enroller = this.usersRepo.create({
      firstname: dto.firstname,
      lastname: dto.lastname,
      email,
      phone: dto.phone,
      password: hashedPassword,
      role: 'enroller',
      image: dto.image || '',
      is_active: true,
      createdAt: new Date(),
      points: 0,
      superior_id,
    });

    const saved = await this.usersRepo.save(enroller);
    delete (saved as any).password;
    return saved;
  }

  /** Toggle enroller active status */
  async toggleActive(id: number) {
    const enroller = await this.usersRepo.findOne({ where: { id, role: 'enroller' } });
    if (!enroller) throw new NotFoundException(`Enroller #${id} not found`);
    enroller.is_active = !enroller.is_active;
    const saved = await this.usersRepo.save(enroller);
    delete (saved as any).password;
    return saved;
  }
}
