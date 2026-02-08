import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { Users } from './user.entity';

@Module({
  imports:[
    TypeOrmModule.forFeature([Users]),
    PassportModule,
    JwtModule.register({
      secret: 'yourSecretKey', // TODO: Move to environment variables (e.g. process.env.JWT_SECRET)
      signOptions: { expiresIn: '1h' },
    }),
  ],
  controllers: [UsersController],
  providers: [UsersService]
})
export class UsersModule {}
