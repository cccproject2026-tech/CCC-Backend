import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminInitService } from './services/super-admin-init.service';
import { User, UserSchema } from './schemas/user.schema';
import { S3Module } from '../s3/s3.module';
import { MulterModule } from '@nestjs/platform-express';
import { Interest, InterestSchema } from '../interests/schemas/interest.schema';
import { HomeModule } from '../home/home.module';
import { MailerService } from 'src/common/utils/mail.util';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [
        MongooseModule.forFeature([{ name: User.name, schema: UserSchema },
        { name: Interest.name, schema: InterestSchema }
        ]),
        ConfigModule,
        S3Module,
        MulterModule.register({
            storage: require('multer').memoryStorage(),
        }),
        forwardRef(() => HomeModule),
        forwardRef(() => require('../interests/interests.module').InterestModule),
    ],
    controllers: [UsersController, SuperAdminController],
    providers: [UsersService, SuperAdminInitService, MailerService],
    exports: [UsersService],
})
export class UsersModule { }
