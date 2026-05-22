import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MicroGrantController } from './micro-grant.controller';
import { MicroGrantService } from './micro-grant.service';
import {
  MicroGrantForm,
  MicroGrantFormSchema,
} from './schemas/micro-grant-form.schema';
import {
  MicroGrantApplication,
  MicroGrantApplicationSchema,
} from './schemas/micro-grant-application.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { S3Module } from '../s3/s3.module';
import { MulterModule } from '@nestjs/platform-express';
import { HomeModule } from '../home/home.module';
import { ConfigModule } from '@nestjs/config';
import { MailerService } from 'src/common/utils/mail.util';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MicroGrantForm.name, schema: MicroGrantFormSchema },
      { name: MicroGrantApplication.name, schema: MicroGrantApplicationSchema },
      { name: User.name, schema: UserSchema },
    ]),
    S3Module,
    MulterModule.register({
      storage: require('multer').memoryStorage(),
    }),
    HomeModule,
    ConfigModule,

  ],
  controllers: [MicroGrantController],
  providers: [MicroGrantService, MailerService],
})
export class MicroGrantModule { }
