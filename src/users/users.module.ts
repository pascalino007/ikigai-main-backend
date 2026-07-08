import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { PassportModule } from '@nestjs/passport';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { Users } from './user.entity';
import { TrustedDevice } from './trusted-device.entity';
import { ClientWallet } from '../client/client_wallet/client_wallet.entity';
import { Shops } from '../shops/shop.entity';
import { UploadModule } from '../upload/upload.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports:[
    TypeOrmModule.forFeature([Users, TrustedDevice, ClientWallet, Shops]),
    UploadModule,
    MailModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'yourSecretKey',
      // Mobile/provider sessions are long-lived; QR check-in/out relies on a valid token.
      signOptions: {
        expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as StringValue,
      },
    }),
  ],
  controllers: [UsersController],
  providers: [UsersService]
})
export class UsersModule {}
