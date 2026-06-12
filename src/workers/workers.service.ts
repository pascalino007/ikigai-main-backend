import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Worker } from './entities/worker.entity';
import { WorkerSchedule } from './entities/worker-schedule.entity';
import { WorkerException } from './entities/worker-exception.entity';
import { Bookings } from '../client/bookings/bookings.entity';
import { Services } from '../services/services.entity';
import { Shops } from '../shops/shop.entity';
import { Users } from '../users/user.entity';
import { ProOwnners } from '../providers/pro_ownners/pro_ownners.entity';
import {
  CreateWorkerDto,
  UpdateWorkerDto,
  CreateExceptionDto,
  CreateScheduleDto,
} from './dto/create-worker.dto';

export interface TimeSlot {
  start: string; // HH:mm
  end: string;   // HH:mm
  available: boolean;
}

@Injectable()
export class WorkersService {
  constructor(
    @InjectRepository(Worker)
    private readonly workerRepo: Repository<Worker>,
    @InjectRepository(WorkerSchedule)
    private readonly scheduleRepo: Repository<WorkerSchedule>,
    @InjectRepository(WorkerException)
    private readonly exceptionRepo: Repository<WorkerException>,
    @InjectRepository(Bookings)
    private readonly bookingsRepo: Repository<Bookings>,
    @InjectRepository(Services)
    private readonly servicesRepo: Repository<Services>,
    @InjectRepository(Shops)
    private readonly shopsRepo: Repository<Shops>,
    @InjectRepository(Users)
    private readonly usersRepo: Repository<Users>,
    @InjectRepository(ProOwnners)
    private readonly proOwnersRepo: Repository<ProOwnners>,
  ) {}

  // ─── CRUD ──────────────────────────────────────────────────────────────

  async create(dto: CreateWorkerDto): Promise<Worker> {
    const worker = this.workerRepo.create({
      shop_id: dto.shop_id,
      first_name: dto.first_name,
      last_name: dto.last_name,
      phone: dto.phone,
      email: dto.email,
      avatar_url: dto.avatar_url,
      speciality: dto.speciality,
      buffer_minutes: dto.buffer_minutes ?? 5,
    });

    const saved = await this.workerRepo.save(worker);

    if (dto.schedules?.length) {
      const schedules = dto.schedules.map((s) =>
        this.scheduleRepo.create({
          worker_id: saved.id,
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          end_time: s.end_time,
        }),
      );
      await this.scheduleRepo.save(schedules);
    }

    return this.findOne(saved.id);
  }

  async findAll(): Promise<Worker[]> {
    return this.workerRepo.find({ relations: ['schedules', 'exceptions'] });
  }

  async findByShop(shopId: number): Promise<Worker[]> {
    const workers = await this.workerRepo.find({
      where: { shop_id: shopId },
      relations: ['schedules', 'exceptions'],
    });
    if (workers.length > 0) return workers;

    // No workers → create a default "shop owner" worker
    const defaultWorker = await this._createDefaultWorker(shopId);
    return defaultWorker ? [defaultWorker] : [];
  }

  private async _createDefaultWorker(shopId: number): Promise<Worker | null> {
    const shop = await this.shopsRepo.findOne({ where: { id: shopId } });
    if (!shop) return null;

    let firstName = 'Propriétaire';
    let lastName = '';

    // 1st priority: ProOwner linked by shop.owner email
    if (shop.owner) {
      const proOwner = await this.proOwnersRepo.findOne({
        where: { email: shop.owner },
      });
      if (proOwner) {
        firstName = proOwner.firstname;
        lastName = proOwner.lastname;
      }
    }

    // 2nd priority: user linked via shop.user_id
    if (firstName === 'Propriétaire' && shop.user_id) {
      const user = await this.usersRepo.findOne({ where: { id: shop.user_id } });
      if (user) {
        firstName = user.firstname;
        lastName = user.lastname;
      }
    }

    const worker = this.workerRepo.create({
      id: -shopId, // sentinel: negative shopId means default owner worker
      shop_id: shopId,
      first_name: firstName,
      last_name: lastName,
      phone: '123456789',
      email: shop.email,
      buffer_minutes: 5,
      is_active: true,
    });
    // Attach empty relations so downstream code doesn't crash
    (worker as any).schedules = [];
    (worker as any).exceptions = [];
    return worker;
  }

  async findOne(id: number): Promise<Worker> {
    const worker = await this.workerRepo.findOne({
      where: { id },
      relations: ['schedules', 'exceptions'],
    });
    if (!worker) throw new NotFoundException(`Worker #${id} not found`);
    return worker;
  }

  async update(id: number, dto: UpdateWorkerDto): Promise<Worker> {
    const worker = await this.findOne(id);
    const { schedules: _schedules, ...rest } = dto as any;
    Object.assign(worker, rest);

    if (dto.schedules) {
      // Replace all schedules
      await this.scheduleRepo.delete({ worker_id: id });
      const schedules = dto.schedules.map((s) =>
        this.scheduleRepo.create({
          worker_id: id,
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          end_time: s.end_time,
        }),
      );
      await this.scheduleRepo.save(schedules);
    }

    await this.workerRepo.save(worker);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const worker = await this.findOne(id);
    await this.workerRepo.remove(worker);
  }

  // ─── BOOKINGS BY WORKER ────────────────────────────────────────────────

  async getWorkerBookings(workerId: number): Promise<any[]> {
    await this.findOne(workerId); // ensure exists
    const bookings = await this.bookingsRepo.find({
      where: { worker_id: workerId },
      order: { booking_date: 'DESC', booking_time: 'DESC' },
    });
    const enriched: any[] = [];
    for (const b of bookings) {
      const service = await this.servicesRepo.findOne({ where: { id: b.service_id } });
      enriched.push({
        ...b,
        service_name: service?.name ?? null,
        service_image_url: service?.imageurl ?? null,
      });
    }
    return enriched;
  }

  // ─── EXCEPTIONS ────────────────────────────────────────────────────────

  async addException(dto: CreateExceptionDto): Promise<WorkerException> {
    const exception = this.exceptionRepo.create({
      worker_id: dto.worker_id,
      exception_date: dto.exception_date,
      type: dto.type || 'day_off',
      start_time: dto.start_time || null,
      end_time: dto.end_time || null,
      reason: dto.reason,
    });
    return this.exceptionRepo.save(exception);
  }

  async removeException(id: number): Promise<void> {
    await this.exceptionRepo.delete(id);
  }

  // ─── AVAILABILITY / SLOTS ─────────────────────────────────────────────

  /**
   * Get available time slots for a worker on a specific date for a given service.
   */
  async getAvailability(
    workerId: number,
    date: string, // YYYY-MM-DD
    serviceId: number,
  ): Promise<TimeSlot[]> {
    let worker: Worker;
    if (workerId < 0) {
      // Default owner worker (sentinel)
      const shopId = -workerId;
      const defaultWorker = await this._createDefaultWorker(shopId);
      if (!defaultWorker) throw new NotFoundException(`Shop #${shopId} not found`);
      worker = defaultWorker;
    } else {
      worker = await this.findOne(workerId);
    }

    const service = await this.servicesRepo.findOne({ where: { id: serviceId } });
    if (!service) throw new NotFoundException(`Service #${serviceId} not found`);

    const durationMinutes = service.duration_minutes || 30;
    const bufferMinutes = worker.buffer_minutes || 5;

    // 1. Get working hours for this date
    const workingHours = await this.getWorkingHours(worker, date);
    if (!workingHours) {
      console.log(`[getAvailability] worker=${workerId} date=${date} -> day off`);
      return []; // day off
    }

    // 2. Get existing bookings for this worker on this date
    const existingBookings = await this.getWorkerBookingsForDate(workerId, date);

    // 3. Generate all possible slots
    const slots = this.generateSlots(
      workingHours.start,
      workingHours.end,
      durationMinutes,
      bufferMinutes,
      existingBookings,
    );

    const lastSlot = slots.length > 0 ? slots[slots.length - 1] : null;
    console.log(
      `[getAvailability] worker=${workerId} date=${date} service=${serviceId} ` +
      `hours=${workingHours.start}-${workingHours.end} duration=${durationMinutes}min ` +
      `buffer=${bufferMinutes}min bookings=${existingBookings.length} ` +
      `slots=${slots.length} lastSlot=${lastSlot ? lastSlot.start + '-' + lastSlot.end : 'none'}`,
    );

    return slots;
  }

  /**
   * Get available slots for ANY worker in a shop for a given date/service.
   * Returns workers with their available slots.
   */
  async getShopAvailability(
    shopId: number,
    date: string,
    serviceId: number,
  ): Promise<{ worker: Worker; slots: TimeSlot[] }[]> {
    const workers = await this.findByShop(shopId);
    const results: { worker: Worker; slots: TimeSlot[] }[] = [];

    for (const worker of workers) {
      const slots = await this.getAvailability(worker.id, date, serviceId);
      const availableSlots = slots.filter((s) => s.available);
      if (availableSlots.length > 0) {
        results.push({ worker, slots: availableSlots });
      }
    }

    // If no workers had available slots, still return the default owner with empty slots
    if (results.length === 0 && workers.length > 0) {
      const defaultWorker = workers.find((w) => w.id < 0);
      if (defaultWorker) {
        results.push({ worker: defaultWorker, slots: [] });
      }
    }

    return results;
  }

  // ─── PRIVATE HELPERS ──────────────────────────────────────────────────

  private _timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  private _minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private _parseShopHours(
    shop: Shops | null,
    dayOfWeek: number,
  ): { start: string; end: string } | null {
    if (!shop?.workingHours || !Array.isArray(shop.workingHours)) return null;
    const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const todayName = dayNames[dayOfWeek];
    const entry = shop.workingHours.find(
      (wh) => wh && wh.length >= 2 && wh[0].toLowerCase() === todayName.toLowerCase(),
    );
    if (!entry) return null;
    const hoursStr = entry[1].trim();
    if (hoursStr.toLowerCase() === 'fermé' || hoursStr === '-') return null;
    const timeMatch = hoursStr.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
    if (!timeMatch) return null;
    const [, openH, openM, closeH, closeM] = timeMatch.map(Number);
    return {
      start: `${String(openH).padStart(2, '0')}:${String(openM).padStart(2, '0')}`,
      end: `${String(closeH).padStart(2, '0')}:${String(closeM).padStart(2, '0')}`,
    };
  }

  private async getWorkingHours(
    worker: Worker,
    date: string,
  ): Promise<{ start: string; end: string } | null> {
    const dayOfWeek = new Date(date).getDay(); // 0=Sun
    const shop = await this.shopsRepo.findOne({ where: { id: worker.shop_id } });
    const shopHours = this._parseShopHours(shop, dayOfWeek);

    // Check exceptions first
    const exception = worker.exceptions?.find(
      (e) => e.exception_date === date,
    );

    if (exception) {
      if (exception.type === 'day_off') return null;
      if (exception.type === 'custom_hours' && exception.start_time && exception.end_time) {
        if (!shopHours) return { start: exception.start_time, end: exception.end_time };
        const clamped = this._clampHours(
          { start: exception.start_time, end: exception.end_time },
          shopHours,
        );
        return clamped;
      }
    }

    // Fall back to weekly schedule
    const schedule = worker.schedules?.find(
      (s) => s.day_of_week === dayOfWeek && s.is_active,
    );

    if (schedule) {
      if (!shopHours) return { start: schedule.start_time, end: schedule.end_time };
      const clamped = this._clampHours(
        { start: schedule.start_time, end: schedule.end_time },
        shopHours,
      );
      return clamped;
    }

    // Final fallback: shop's working hours
    return shopHours;
  }

  private _clampHours(
    workerHours: { start: string; end: string },
    shopHours: { start: string; end: string },
  ): { start: string; end: string } | null {
    const wStart = this._timeToMinutes(workerHours.start);
    const wEnd = this._timeToMinutes(workerHours.end);
    const sStart = this._timeToMinutes(shopHours.start);
    const sEnd = this._timeToMinutes(shopHours.end);

    const effectiveStart = Math.max(wStart, sStart);
    const effectiveEnd = Math.min(wEnd, sEnd);

    if (effectiveStart >= effectiveEnd) {
      return null; // No valid overlap
    }

    return {
      start: this._minutesToTime(effectiveStart),
      end: this._minutesToTime(effectiveEnd),
    };
  }

  private async getWorkerBookingsForDate(
    workerId: number,
    date: string,
  ): Promise<{ start: Date; end: Date }[]> {
    const bookings = await this.bookingsRepo.find({
      where: {
        worker_id: workerId,
        booking_date: date,
        booking_status: 1, // confirmed only
      },
    });

    return bookings
      .filter((b) => b.booking_time && b.booking_end_time)
      .map((b) => ({
        start: new Date(b.booking_time),
        end: new Date(b.booking_end_time!),
      }));
  }

  private generateSlots(
    dayStart: string, // HH:mm
    dayEnd: string,   // HH:mm
    durationMinutes: number,
    bufferMinutes: number,
    existingBookings: { start: Date; end: Date }[],
  ): TimeSlot[] {
    const slots: TimeSlot[] = [];
    const [startH, startM] = dayStart.split(':').map(Number);
    const [endH, endM] = dayEnd.split(':').map(Number);

    let currentMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const stepMinutes = 15; // fine-grained step for maximum flexibility

    while (currentMinutes + durationMinutes <= endMinutes) {
      const slotStart = this.minutesToTime(currentMinutes);
      const slotEnd = this.minutesToTime(currentMinutes + durationMinutes);

      // Check collision with existing bookings (including buffer after each booking)
      const available = !this.hasCollision(
        currentMinutes,
        currentMinutes + durationMinutes,
        bufferMinutes,
        existingBookings,
      );

      slots.push({ start: slotStart, end: slotEnd, available });

      currentMinutes += stepMinutes;
    }

    return slots;
  }

  private hasCollision(
    slotStartMin: number,
    slotEndMin: number,
    bufferMinutes: number,
    bookings: { start: Date; end: Date }[],
  ): boolean {
    for (const booking of bookings) {
      const bStartMin = booking.start.getHours() * 60 + booking.start.getMinutes();
      const bEndMin = booking.end.getHours() * 60 + booking.end.getMinutes() + bufferMinutes;

      // Overlap check: slot starts before buffered booking ends AND slot ends after booking starts
      if (slotStartMin < bEndMin && slotEndMin > bStartMin) {
        return true;
      }
    }
    return false;
  }

  private minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }
}
