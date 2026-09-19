import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { AppSignatureGuard } from './app-signature.guard';

/**
 * Global auth: a JwtModule (same secret used to sign tokens at sign-in), a
 * JwtAuthGuard usable on any controller via `@UseGuards(JwtAuthGuard)`, a
 * RolesGuard for `@UseGuards(JwtAuthGuard, RolesGuard) @Roles('provider')`,
 * and an AppSignatureGuard for login routes.
 */
@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'yourSecretKey',
      // Only `secret` matters here (this module only verifies) — kept in
      // sync with UsersModule's signOptions for clarity, not correctness.
      signOptions: {
        expiresIn: (process.env.JWT_EXPIRES_IN || '2h') as StringValue,
      },
    }),
  ],
  providers: [JwtAuthGuard, RolesGuard, AppSignatureGuard],
  exports: [JwtAuthGuard, RolesGuard, AppSignatureGuard, JwtModule],
})
export class AuthModule {}
