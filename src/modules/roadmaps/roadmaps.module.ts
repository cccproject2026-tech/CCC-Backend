import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RoadMapsService } from './roadmaps.service';
import { RoadMapsController } from './roadmaps.controller';
import { RoadMap, RoadMapSchema } from './schemas/roadmap.schema';
import { Comments, CommentsSchema } from './schemas/comments.schema';
import { Queries, QueriesSchema } from './schemas/queries.schema';
import { Extras, ExtrasSchema } from './schemas/extras.schema';
import { Progress, ProgressSchema } from '../progress/schemas/progress.schema';
import { S3Module } from '../s3/s3.module';
import { HomeModule } from '../home/home.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Availability, AvailabilitySchema } from '../appointments/schemas/availability.schema';
import { AppointmentsModule } from '../appointments/appointments.module';
import { MailerService } from 'src/common/utils/mail.util';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [
        ConfigModule,
        MongooseModule.forFeature([
            { name: RoadMap.name, schema: RoadMapSchema },
            { name: Comments.name, schema: CommentsSchema },
            { name: Queries.name, schema: QueriesSchema },
            { name: Extras.name, schema: ExtrasSchema },
            { name: Progress.name, schema: ProgressSchema },
            { name: User.name, schema: UserSchema },
            { name: Availability.name, schema: AvailabilitySchema }
        ]),
        S3Module,
        HomeModule,
         AppointmentsModule
    ],
    controllers: [RoadMapsController],
    providers: [RoadMapsService, MailerService],
    exports: [RoadMapsService],
})
export class RoadMapsModule { }