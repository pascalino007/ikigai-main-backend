import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shops } from './shop.entity';
import { Users } from '../users/user.entity';
import { CreateShopDto } from './dtos/create-shop.dto';
import { UpdateShopDto } from './dtos/update-shop.dto';

const GRADE_POINTS: Record<string, number> = { basic: 10, pro: 30, elite: 50 };

@Injectable()
export class ShopsService {
  constructor(
    @InjectRepository(Shops)
    private readonly shopsRepository: Repository<Shops>,
    @InjectRepository(Users)
    private readonly usersRepository: Repository<Users>,
  ) {}

  // ✅ Create a new shop — awards points to enroller if registered_by is a numeric enroller ID
  // Also links shop to provider user via owner email
  async create(createShopDto: CreateShopDto): Promise<Shops> {
    const newShop = this.shopsRepository.create(createShopDto);

    // Link shop to provider user via owner email
    if (createShopDto.owner) {
      const provider = await this.usersRepository.findOne({
        where: { email: createShopDto.owner, role: 'provider' },
      });
      if (provider) {
        newShop.user_id = provider.id;
      }
    }

    const savedShop = await this.shopsRepository.save(newShop);

    const enrollerId = parseInt(createShopDto.registered_by, 10);
    if (!isNaN(enrollerId)) {
      const enroller = await this.usersRepository.findOne({ where: { id: enrollerId, role: 'enroller' } });
      if (enroller) {
        const grade = createShopDto.grade || 'basic';
        enroller.points = (enroller.points || 0) + (GRADE_POINTS[grade] ?? 10);
        await this.usersRepository.save(enroller);
      }
    }

    return savedShop;
  }

  // ✅ Update an existing shop
   async update(id: number, updateShopDto: UpdateShopDto): Promise<Shops> {
    const shop = await this.shopsRepository.findOne({ where: { id } });

    if (!shop) {
      throw new NotFoundException(`Shop with ID ${id} not found`);
    }

    Object.assign(shop, updateShopDto);

    // Re-link provider by owner email whenever owner changes
    if (updateShopDto.owner !== undefined) {
      if (updateShopDto.owner) {
        const provider = await this.usersRepository.findOne({
          where: { email: updateShopDto.owner, role: 'provider' },
        });
        shop.user_id = provider ? provider.id : null;
      } else {
        shop.user_id = null;
      }
    }

    return await this.shopsRepository.save(shop);
  } 

  // ✅ Compute effective status from working hours (UTC = local for Togo/Bénin)
  // Rules:
  //   - If provider manually set 'occupé' or 'free', always respect it.
  //   - If provider manually set 'closed', always respect it.
  //   - If status is 'ouvert'/'open' (default), auto-close outside working hours.
  computeEffectiveStatus(shop: Shops): string {
    const manualStatus = (shop.status || 'ouvert').toLowerCase().trim();

    // Provider explicitly set a non-default status → respect it
    if (manualStatus === 'occupé' || manualStatus === 'free' || manualStatus === 'closed') {
      return shop.status;
    }

    // From here, status is 'ouvert' or 'open' → check working hours
    const now = new Date();
    const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    // Use local time so it matches the server's timezone (should align with shop locale)
    const todayName = dayNames[now.getDay()];

    if (!shop.workingHours || !Array.isArray(shop.workingHours) || shop.workingHours.length === 0) {
      return shop.status || 'ouvert';
    }

    const todayEntry = shop.workingHours.find(
      (wh) => wh && wh.length >= 2 && wh[0].toLowerCase() === todayName.toLowerCase(),
    );

    // No entry for today → assume open (provider didn't specify hours for this day)
    if (!todayEntry) {
      return shop.status || 'ouvert';
    }

    const hoursStr = todayEntry[1].trim();
    if (hoursStr.toLowerCase() === 'fermé' || hoursStr === '-') {
      return 'closed';
    }

    const timeMatch = hoursStr.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
    if (!timeMatch) {
      return shop.status || 'ouvert';
    }

    const [, openH, openM, closeH, closeM] = timeMatch.map(Number);
    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;
    // Use local hours so it matches the shop's timezone
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    if (currentMinutes < openMinutes || currentMinutes >= closeMinutes) {
      return 'closed';
    }

    return shop.status || 'ouvert';
  }

// ✅ (Optional) Get all shops, optionally filtered by grade
  async findAll(grade?: string): Promise<Shops[]> {
    let shops: Shops[];
    if (grade) {
      shops = await this.shopsRepository.find({ where: { grade: grade as any } });
    } else {
      shops = await this.shopsRepository.find();
    }
    for (const shop of shops) {
      shop.status = this.computeEffectiveStatus(shop) as any;
    }
    return shops;
  }

  // ✅ Toggle shop visibility on mobile app
  async toggleActive(id: number): Promise<Shops> {
    const shop = await this.shopsRepository.findOne({ where: { id } });
    if (!shop) throw new NotFoundException(`Shop with ID ${id} not found`);
    shop.is_active = !shop.is_active;
    return await this.shopsRepository.save(shop);
  }

  // ✅ Update shop status (ouvert|occupé|free|closed)
  async updateStatus(id: number, status: 'open' | 'ouvert' | 'occupé' | 'free' | 'closed'): Promise<Shops> {
    const valid = ['open', 'ouvert', 'occupé', 'free', 'closed'];
    if (!valid.includes(status)) {
      throw new NotFoundException(`Invalid status: ${status}`);
    }
    const shop = await this.shopsRepository.findOne({ where: { id } });
    if (!shop) throw new NotFoundException(`Shop with ID ${id} not found`);
    shop.status = status;
    return await this.shopsRepository.save(shop);
  }

  // ✅ Toggle shop verification status (only if certificationImage exists)
  async toggleVerification(id: number): Promise<Shops> {
    const shop = await this.shopsRepository.findOne({ where: { id } });
    if (!shop) throw new NotFoundException(`Shop with ID ${id} not found`);
    if (!shop.certificationImage) {
      throw new Error('Cannot verify shop without certification image');
    }
    shop.is_verified = !shop.is_verified;
    return await this.shopsRepository.save(shop);
  }

  // ✅ (Optional) Get a single shop by ID
  async findOne(id: number): Promise<Shops> {
    const shop = await this.shopsRepository.findOne({ where: { id } });
    if (!shop) throw new NotFoundException(`Shop with ID ${id} not found`);
    shop.status = this.computeEffectiveStatus(shop) as any;
    return shop;
  }

  // ✅ Update FCM token for push notifications
  async updateFcmToken(id: number, fcmToken: string): Promise<Shops> {
    const shop = await this.shopsRepository.findOne({ where: { id } });
    if (!shop) throw new NotFoundException(`Shop with ID ${id} not found`);
    shop.fcm_token = fcmToken;
    return await this.shopsRepository.save(shop);
  }

  // ✅ (Optional) Delete shop
  async remove(id: number): Promise<void> {
    const result = await this.shopsRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Shop with ID ${id} not found`);
    }
  }
}
