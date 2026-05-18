import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Interest, InterestSchema } from './schemas/interest.schema';
import { InterestFormFields, InterestFormFieldsSchema } from './schemas/interest-form-fields.schema';
import { InterestController } from './interests.controller';
import { InterestService } from './interests.service';
import { InterestFormFieldsService } from './services/interest-form-fields.service';
import { MailerService } from 'src/common/utils/mail.util';
import { UsersModule } from '../users/users.module';
import { HomeModule } from '../home/home.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Interest.name, schema: InterestSchema },
      { name: InterestFormFields.name, schema: InterestFormFieldsSchema },
    ]),
    forwardRef(() => UsersModule),
    HomeModule,
  ],
  controllers: [InterestController],
  providers: [InterestService, InterestFormFieldsService, MailerService],
  exports: [InterestService, InterestFormFieldsService],
})
export class InterestModule { }
