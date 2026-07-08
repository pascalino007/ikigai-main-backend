import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * Thin, fail-safe wrapper around the ioredis client. Every method swallows
 * connection errors and returns a neutral value so the app keeps working (with
 * an in-memory fallback at the call site) when Redis is unavailable.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  /** Raw client for advanced use (pub/sub, locks, scans). */
  get raw(): Redis {
    return this.client;
  }

  get isReady(): boolean {
    return this.client.status === 'ready';
  }

  /** Set a key with a TTL (seconds). Returns false if Redis is unavailable. */
  async setex(key: string, seconds: number, value: string): Promise<boolean> {
    try {
      await this.client.setex(key, seconds, value);
      return true;
    } catch (e) {
      this.logger.warn(`setex ${key} failed: ${e?.message ?? e}`);
      return false;
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (e) {
      this.logger.warn(`get ${key} failed: ${e?.message ?? e}`);
      return null;
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (e) {
      this.logger.warn(`del ${key} failed: ${e?.message ?? e}`);
    }
  }

  /**
   * Cache-aside: return the cached JSON for `key`, otherwise run `producer`,
   * cache the result for `ttlSeconds`, and return it. If Redis is unavailable
   * it simply runs `producer` every time (no caching), so callers never break.
   */
  async remember<T>(key: string, ttlSeconds: number, producer: () => Promise<T>): Promise<T> {
    const cached = await this.get(key);
    if (cached !== null) {
      try {
        return JSON.parse(cached) as T;
      } catch {
        // Corrupted cache entry → ignore and refetch.
      }
    }
    const fresh = await producer();
    await this.setex(key, ttlSeconds, JSON.stringify(fresh));
    return fresh;
  }

  /** Delete every key matching a glob pattern (cache invalidation). */
  async delPattern(pattern: string): Promise<void> {
    try {
      const stream = this.client.scanStream({ match: pattern, count: 200 });
      const keys: string[] = [];
      for await (const batch of stream) {
        keys.push(...(batch as string[]));
      }
      if (keys.length > 0) await this.client.del(...keys);
    } catch (e) {
      this.logger.warn(`delPattern ${pattern} failed: ${e?.message ?? e}`);
    }
  }

  /**
   * Acquire a simple distributed lock (SET key val NX EX ttl).
   * Returns true if acquired — useful to make crons single-runner across instances.
   */
  async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const res = await this.client.set(key, '1', 'EX', ttlSeconds, 'NX');
      return res === 'OK';
    } catch {
      // If Redis is down, fall through as "acquired" so a single-instance dev
      // setup still runs the job.
      return true;
    }
  }

  onModuleDestroy(): void {
    this.client.quit().catch(() => undefined);
  }
}
