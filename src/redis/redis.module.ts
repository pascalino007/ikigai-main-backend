import { Global, Logger, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT, RedisService } from './redis.service';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (): Redis => {
        const logger = new Logger('Redis');
        const client = new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
          password: process.env.REDIS_PASSWORD || undefined,
          // Keep retrying in the background; commands fail fast (handled by RedisService).
          maxRetriesPerRequest: 2,
          enableOfflineQueue: false,
          retryStrategy: (times) => Math.min(times * 200, 5000),
        });
        client.on('connect', () => logger.log('Connected'));
        client.on('error', (e) => logger.warn(`Connection error: ${e.message}`));
        return client;
      },
    },
    RedisService,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
