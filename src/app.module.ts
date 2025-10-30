import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from './users/users.module';
import { ShopsModule } from './shops/shops.module';
import { ServicesModule } from './services/services.module';
import { BookingsModule } from './client/bookings/bookings.module';
import { Users } from './users/user.entity';
import { Shops } from './shops/shop.entity';
import { Categories } from './admin/categories/categories.entity';
import { CategoriesModule } from './admin/categories/categories.module';
import { Services } from './services/services.entity';
import { Bookings } from './client/bookings/bookings.entity';
import { ClientWalletModule } from './client/client_wallet/client_wallet.module';
import { TransactionModule } from './transaction/transaction.module';
import { ClientWallet } from './client/client_wallet/client_wallet.entity';
import { CartModule } from './client/cart/cart.module';
import { Transactionm } from './transaction/transaction.entity';

import { SlidersModule } from './admin/sliders/sliders.module';
import { EnrollersModule } from './enrollers/enrollers.module';

import { PermissionsModule } from './general/permissions/permissions.module';
import { ProOwnners } from './providers/pro_ownners/pro_ownners.entity';
import { ProOwnnersModule } from './providers/pro_ownners/pro_ownners.module';
import { SousCategories } from './admin/sous-category/sous-category.entity';
import { SousCategoryModule } from './admin/sous-category/sous-category.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      database: 'ikigaidb',
      username: 'root',
      password: 'password',
      entities: [
        Users,
        Shops,
        Categories,
        Services,
        Bookings,
        ClientWallet,
        Transactionm,
        ProOwnners ,
        SousCategories
      ],
      synchronize: true,
    }),
    UsersModule,
    CategoriesModule,
    SousCategoryModule,
    ShopsModule,
    ServicesModule,
    BookingsModule,
    ClientWalletModule,
    TransactionModule,
    CartModule,
    SlidersModule,
    EnrollersModule,
    PermissionsModule,
    ProOwnnersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
