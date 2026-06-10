import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Commande } from './commande.entity';
import { CreateCommandeDto } from './dtos/create-commande.dto';
import { UpdateStatusDto } from './dtos/update-status.dto';

@Injectable()
export class CommandesService {
  constructor(
    @InjectRepository(Commande)
    private readonly commandeRepo: Repository<Commande>,
  ) {}

  async create(dto: CreateCommandeDto): Promise<Commande> {
    const commande = this.commandeRepo.create({
      ...dto,
      status: 'pending',
      createdAt: new Date(),
    });
    return this.commandeRepo.save(commande);
  }

  async findAll(): Promise<Commande[]> {
    return this.commandeRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findByUser(userId: number): Promise<Commande[]> {
    return this.commandeRepo.find({
      where: { user_id: userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Commande> {
    const commande = await this.commandeRepo.findOne({ where: { id } });
    if (!commande) throw new NotFoundException(`Commande #${id} not found`);
    return commande;
  }

  async updateStatus(id: number, dto: UpdateStatusDto): Promise<Commande> {
    const commande = await this.findOne(id);
    commande.status = dto.status;
    return this.commandeRepo.save(commande);
  }

  async remove(id: number): Promise<void> {
    const result = await this.commandeRepo.delete(id);
    if (result.affected === 0) throw new NotFoundException(`Commande #${id} not found`);
  }
}
