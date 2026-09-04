import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Raw, Repository } from 'typeorm';
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
    // A shop is only ever OPEN or CLOSED, driven automatically by its working
    // hours (busy/free is now a per-worker concept, not a shop one).
    // A manual hard-close is still respected.
    const manualStatus = (shop.status || '').toLowerCase().trim();
    if (manualStatus === 'closed') return 'closed';

    // Shop hours are local to the shops' market (Bénin/Togo, UTC+0/+1); the
    // server may run in UTC, so compute "now" in the configured timezone
    // instead of server-local time.
    const timeZone = process.env.SHOP_TIMEZONE || 'Africa/Porto-Novo';
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'long',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const part = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const weekdayEn = part('weekday'); // "Monday", …
    const currentMinutes = parseInt(part('hour'), 10) * 60 + parseInt(part('minute'), 10);

    // Working-hours rows store the day in English (dashboard) or French
    // (mobile/legacy data) — accept both.
    const frByEn: Record<string, string> = {
      Sunday: 'Dimanche',
      Monday: 'Lundi',
      Tuesday: 'Mardi',
      Wednesday: 'Mercredi',
      Thursday: 'Jeudi',
      Friday: 'Vendredi',
      Saturday: 'Samedi',
    };
    const todayNames = [weekdayEn.toLowerCase(), (frByEn[weekdayEn] || '').toLowerCase()];

    // No hours configured → treat as open.
    if (!shop.workingHours || !Array.isArray(shop.workingHours) || shop.workingHours.length === 0) {
      return 'open';
    }

    const todayEntry = shop.workingHours.find(
      (wh) => wh && wh.length >= 2 && todayNames.includes(String(wh[0]).toLowerCase().trim()),
    );

    // No entry for today → assume open (provider didn't specify hours for this day)
    if (!todayEntry) return 'open';

    const hoursStr = todayEntry[1].trim();
    if (hoursStr.toLowerCase() === 'fermé' || hoursStr === '-') return 'closed';

    const timeMatch = hoursStr.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
    if (!timeMatch) return 'open';

    const [, openH, openM, closeH, closeM] = timeMatch.map(Number);
    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    if (currentMinutes < openMinutes || currentMinutes >= closeMinutes) return 'closed';
    return 'open';
  }

// ✅ (Optional) Get all shops, optionally filtered by grade and/or country ("pays").
  // `random` shuffles the result (client-facing discovery screens); left off, order is
  // the DB's natural order (what the admin dashboard relies on).
  async findAll(grade?: string, pays?: string, random = false): Promise<Shops[]> {
    const where: FindOptionsWhere<Shops> = {};
    if (grade) where.grade = grade as any;
    // pays is free-text (no enum at the DB level) and existing data is inconsistently
    // cased ("Togo" / "togo"), so compare case-insensitively rather than with `=`.
    if (pays) {
      where.pays = Raw((alias) => `LOWER(${alias}) = LOWER(:pays)`, { pays });
    }

    const shops = await this.shopsRepository.find({
      where: Object.keys(where).length ? where : undefined,
    });
    for (const shop of shops) {
      shop.status = this.computeEffectiveStatus(shop) as any;
    }
    if (random) {
      for (let i = shops.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shops[i], shops[j]] = [shops[j], shops[i]];
      }
    }
    return shops;
  }

  // ✅ Record a client visit — atomic increment so concurrent visits don't race
  async recordVisit(id: number): Promise<{ id: number; views: number }> {
    const shop = await this.shopsRepository.findOne({ where: { id }, select: ['id', 'views'] });
    if (!shop) throw new NotFoundException(`Shop with ID ${id} not found`);
    await this.shopsRepository.increment({ id }, 'views', 1);
    return { id, views: (shop.views ?? 0) + 1 };
  }

  // ✅ Most-visited shops (for the dashboard leaderboard), with computed open/closed status
  async findMostVisited(limit = 10): Promise<Shops[]> {
    const shops = await this.shopsRepository.find({
      order: { views: 'DESC' },
      take: Math.max(1, Math.min(limit, 100)),
    });
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

  // ✅ Count shops
  async count(): Promise<number> {
    return this.shopsRepository.count();
  }

  // ✅ (Optional) Delete shop
  async remove(id: number): Promise<void> {
    const result = await this.shopsRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Shop with ID ${id} not found`);
    }
  }
}
