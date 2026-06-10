import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
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
import { Transaction} from './transaction/transaction.entity';

import { SlidersModule } from './admin/sliders/sliders.module';
import { Slider } from './admin/sliders/sliders.entity';
import { SongsModule } from './admin/songs/songs.module';
import { Song } from './admin/songs/song.entity';
import { EnrollersModule } from './enrollers/enrollers.module';

import { PermissionsModule } from './general/permissions/permissions.module';
import { ProOwnners } from './providers/pro_ownners/pro_ownners.entity';
import { ProOwnnersModule } from './providers/pro_ownners/pro_ownners.module';
import { ProWalletModule } from './providers/pro_wallet/pro_wallet.module';
import { SousCategories } from './admin/sous-category/sous-category.entity';
import { SousCategoryModule } from './admin/sous-category/sous-category.module';
import { UploadModule } from './upload/upload.module';
import { SpecialsModule } from './specials/specials.module';
import { Special } from './specials/special.entity';
import { GeovilleModule } from './geolocation/geoville/geoville.module';
import { Geoville } from './geolocation/geoville/entities/geoville.entity';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { Product } from './marketplace/product.entity';
import { PaymentsModule } from './payments/payments.module';
import { CommandesModule } from './commandes/commandes.module';
import { Commande } from './commandes/commande.entity';
import { ReviewsModule } from './reviews/reviews.module';
import { Review } from './reviews/review.entity';
import { MailModule } from './mail/mail.module';
import { WorkersModule } from './workers/workers.module';
import { Worker } from './workers/entities/worker.entity';
import { WorkerSchedule } from './workers/entities/worker-schedule.entity';
import { WorkerException } from './workers/entities/worker-exception.entity';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { Subscription } from './subscriptions/subscription.entity';
import { ProWallet } from './providers/pro_wallet/pro_wallet.entity';
import { ShopSchedulerModule } from './scheduler/shop-scheduler.module';
import { BookingSchedulerModule } from './scheduler/booking-scheduler.module';
import { NotificationsModule } from './notifications/notifications.module';
import { Notification } from './notifications/notification.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      database: 'ikigaidb',
      username: 'root',
      password: 'kabadelivery',
      entities: [
        Users,
        Shops,
        Categories,
        Services,
        Bookings,
        ClientWallet,
        Transaction,
        ProOwnners ,
        SousCategories,
        Special,
        Geoville,
        Product,
        Slider,
        Song,
        Commande,
        Review,
        Worker,
        WorkerSchedule,
        WorkerException,
        Subscription,
        ProWallet,
        Notification,
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
    ProWalletModule,
    TransactionModule,
    CartModule,
    SlidersModule,
    SongsModule,
    EnrollersModule,
    PermissionsModule,
    ProOwnnersModule,
    UploadModule,
    SpecialsModule,
    GeovilleModule,
    MarketplaceModule,
    PaymentsModule,
    CommandesModule,
    ReviewsModule,
    MailModule,
    WorkersModule,
    SubscriptionsModule,
    ScheduleModule.forRoot(),
    ShopSchedulerModule,
    BookingSchedulerModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
