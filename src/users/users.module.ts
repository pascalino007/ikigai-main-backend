import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { Users } from './user.entity';
import { ClientWallet } from '../client/client_wallet/client_wallet.entity';
import { Shops } from '../shops/shop.entity';
import { UploadModule } from '../upload/upload.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports:[
    TypeOrmModule.forFeature([Users, ClientWallet, Shops]),
    UploadModule,
    MailModule,
    PassportModule,
    JwtModule.register({
      secret: 'yourSecretKey', // TODO: Move to environment variables (e.g. process.env.JWT_SECRET)
      signOptions: { expiresIn: '30m' },
    }),
  ],
  controllers: [UsersController],
  providers: [UsersService]
})
export class UsersModule {}
