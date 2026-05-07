import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';

import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { InterestModule } from './modules/interests/interests.module';
import { HomeModule } from './modules/home/home.module';
import { RoadMapsModule } from './modules/roadmaps/roadmaps.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { AssessmentModule } from './modules/assessment/assessment.module';
import { ProgressModule } from './modules/progress/progress.module';
import { ProductsServicesModule } from './modules/products_services/products_services.module';
import { MicroGrantModule } from './modules/micro-grand/micro-grant.module';
import { HealthModule } from './health/health.module';
import { S3Module } from './modules/s3/s3.module';
import { SearchModule } from './modules/search/search.module';
import { ZoomModule } from './modules/zoom/zoom.module';
import { FirebaseModule } from './modules/firebase/firebase.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env'],
      cache: true,
      expandVariables: true,
    }),

    ScheduleModule.forRoot(),

    ThrottlerModule.forRoot([
      // {
      //   name: 'short',
      //   ttl: 1000,
      //   limit: 10,
      // },
      {
        name: 'medium',
        ttl: 60000,
        limit: 300,
      },
      // {
      //   name: 'long',
      //   ttl: 3600000,
      //   limit: 1000,
      // },
    ]),

    DatabaseModule,
    HealthModule,
    S3Module,
    AuthModule,
    UsersModule,
    InterestModule,
    HomeModule,
    RoadMapsModule,
    AppointmentsModule,
    ZoomModule,
    AssessmentModule,
    MicroGrantModule,
    ProgressModule,
    ProductsServicesModule,
    SearchModule,
    FirebaseModule,
  ],

  controllers: [],

  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule { }
