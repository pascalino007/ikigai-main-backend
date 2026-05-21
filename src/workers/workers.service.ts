import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Worker } from './entities/worker.entity';
import { WorkerSchedule } from './entities/worker-schedule.entity';
import { WorkerException } from './entities/worker-exception.entity';
import { Bookings } from '../client/bookings/bookings.entity';
import { Services } from '../services/services.entity';
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
    return this.workerRepo.find({
      where: { shop_id: shopId, is_active: true },
      relations: ['schedules', 'exceptions'],
    });
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
    Object.assign(worker, dto);

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
    const worker = await this.findOne(workerId);
    const service = await this.servicesRepo.findOne({ where: { id: serviceId } });
    if (!service) throw new NotFoundException(`Service #${serviceId} not found`);

    const durationMinutes = service.duration_minutes || 30;
    const bufferMinutes = worker.buffer_minutes || 5;

    // 1. Get working hours for this date
    const workingHours = this.getWorkingHours(worker, date);
    if (!workingHours) return []; // day off

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
      if (slots.some((s) => s.available)) {
        results.push({ worker, slots: slots.filter((s) => s.available) });
      }
    }

    return results;
  }

  // ─── PRIVATE HELPERS ──────────────────────────────────────────────────

  private getWorkingHours(
    worker: Worker,
    date: string,
  ): { start: string; end: string } | null {
    // Check exceptions first
    const exception = worker.exceptions?.find(
      (e) => e.exception_date === date,
    );

    if (exception) {
      if (exception.type === 'day_off') return null;
      if (exception.type === 'custom_hours' && exception.start_time && exception.end_time) {
        return { start: exception.start_time, end: exception.end_time };
      }
    }

    // Fall back to weekly schedule
    const dayOfWeek = new Date(date).getDay(); // 0=Sun
    const schedule = worker.schedules?.find(
      (s) => s.day_of_week === dayOfWeek && s.is_active,
    );

    if (!schedule) return null;
    return { start: schedule.start_time, end: schedule.end_time };
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

    while (currentMinutes + durationMinutes <= endMinutes) {
      const slotStart = this.minutesToTime(currentMinutes);
      const slotEnd = this.minutesToTime(currentMinutes + durationMinutes);

      // Check collision with existing bookings
      const available = !this.hasCollision(
        currentMinutes,
        currentMinutes + durationMinutes,
        existingBookings,
      );

      slots.push({ start: slotStart, end: slotEnd, available });

      // Move to next slot (duration + buffer)
      currentMinutes += durationMinutes + bufferMinutes;
    }

    return slots;
  }

  private hasCollision(
    slotStartMin: number,
    slotEndMin: number,
    bookings: { start: Date; end: Date }[],
  ): boolean {
    for (const booking of bookings) {
      const bStartMin = booking.start.getHours() * 60 + booking.start.getMinutes();
      const bEndMin = booking.end.getHours() * 60 + booking.end.getMinutes();

      // Overlap check: slot starts before booking ends AND slot ends after booking starts
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
