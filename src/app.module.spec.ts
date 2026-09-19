import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/**
 * Boot smoke test: resolves the whole provider graph exactly as startup does
 * (services, controllers, guards), so a missing `TypeOrmModule.forFeature([...])`
 * entry or an unimported module fails here instead of crash-looping in prod —
 * `tsc` cannot see Nest dependency-injection errors.
 *
 * Preview mode skips constructors and factories, so no database, Redis or
 * Firebase connection is made; unresolved dependencies still throw.
 */
describe('AppModule', () => {
  it('resolves its full dependency graph', async () => {
    const app = await NestFactory.createApplicationContext(AppModule, {
      preview: true,
      logger: false,
      abortOnError: false,
    });
    await app.close();
  }, 60_000);
});
