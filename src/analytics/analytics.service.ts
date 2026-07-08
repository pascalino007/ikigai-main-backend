import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { AnalyticsEvent } from './analytics-event.entity';
import { CreateEventDto } from './dtos/create-event.dto';

const DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(AnalyticsEvent)
    private readonly repo: Repository<AnalyticsEvent>,
  ) {}

  /** Store a single event coming from the mobile app. */
  async record(dto: CreateEventDto): Promise<{ ok: true }> {
    const event = this.repo.create({
      name: dto.name,
      screen: dto.screen ?? null,
      user_id: dto.userId ?? null,
      platform: dto.platform ?? null,
      params: dto.params ? JSON.stringify(dto.params) : null,
    });
    await this.repo.save(event);
    return { ok: true };
  }

  /** Aggregated analytics for the dashboard over the last `days` days. */
  async overview(days = 14) {
    const windowDays = Math.max(1, Math.min(days, 365));
    const since = new Date(Date.now() - windowDays * DAY);

    const [totalEvents, screenViews, activeUsersRow, byNameRaw, topScreensRaw, byDayRaw] =
      await Promise.all([
        this.repo.count({ where: { createdAt: MoreThanOrEqual(since) } }),
        this.repo.count({ where: { name: 'screen_view', createdAt: MoreThanOrEqual(since) } }),
        this.repo
          .createQueryBuilder('e')
          .select('COUNT(DISTINCT e.user_id)', 'c')
          .where('e.createdAt >= :since', { since })
          .andWhere('e.user_id IS NOT NULL')
          .getRawOne<{ c: string }>(),
        this.repo
          .createQueryBuilder('e')
          .select('e.name', 'name')
          .addSelect('COUNT(*)', 'count')
          .where('e.createdAt >= :since', { since })
          .groupBy('e.name')
          .orderBy('count', 'DESC')
          .getRawMany<{ name: string; count: string }>(),
        this.repo
          .createQueryBuilder('e')
          .select('e.screen', 'screen')
          .addSelect('COUNT(*)', 'count')
          .where('e.createdAt >= :since', { since })
          .andWhere("e.name = 'screen_view'")
          .andWhere('e.screen IS NOT NULL')
          .groupBy('e.screen')
          .orderBy('count', 'DESC')
          .limit(10)
          .getRawMany<{ screen: string; count: string }>(),
        this.repo
          .createQueryBuilder('e')
          .select('DATE(e.createdAt)', 'd')
          .addSelect('COUNT(*)', 'count')
          .where('e.createdAt >= :since', { since })
          .groupBy('DATE(e.createdAt)')
          .getRawMany<{ d: string | Date; count: string }>(),
      ]);

    // Normalize the daily buckets and fill missing days with 0.
    const dailyMap = new Map<string, number>();
    for (const row of byDayRaw) {
      const key =
        row.d instanceof Date ? row.d.toISOString().slice(0, 10) : String(row.d).slice(0, 10);
      dailyMap.set(key, Number(row.count) || 0);
    }
    const eventsByDay: { date: string; count: number }[] = [];
    for (let i = windowDays - 1; i >= 0; i--) {
      const key = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
      eventsByDay.push({ date: key, count: dailyMap.get(key) ?? 0 });
    }

    return {
      days: windowDays,
      totalEvents,
      screenViews,
      activeUsers: Number(activeUsersRow?.c ?? 0),
      eventsByName: byNameRaw.map((r) => ({ name: r.name, count: Number(r.count) || 0 })),
      topScreens: topScreensRaw.map((r) => ({ screen: r.screen, count: Number(r.count) || 0 })),
      eventsByDay,
      generatedAt: new Date().toISOString(),
    };
  }
}
