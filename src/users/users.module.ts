import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { PassportModule } from '@nestjs/passport';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { Users } from './user.entity';
import { TrustedDevice } from './trusted-device.entity';
import { RefreshToken } from './refresh-token.entity';
import { ClientWallet } from '../client/client_wallet/client_wallet.entity';
import { Shops } from '../shops/shop.entity';
import { UploadModule } from '../upload/upload.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports:[
    TypeOrmModule.forFeature([Users, TrustedDevice, RefreshToken, ClientWallet, Shops]),
    UploadModule,
    MailModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'yourSecretKey',
      // Access tokens are deliberately short-lived now that a rotating
      // refresh token (UsersService.issueRefreshToken / refreshAccessToken)
      // silently renews them — a 7-day access token with no refresh meant a
      // client who didn't reopen the app for a week could get stuck mid-flow
      // (e.g. QR check-out) with no way to recover but a full re-login.
      signOptions: {
        expiresIn: (process.env.JWT_EXPIRES_IN || '2h') as StringValue,
      },
    }),
  ],
  controllers: [UsersController],
  providers: [UsersService]
})
export class UsersModule {}
