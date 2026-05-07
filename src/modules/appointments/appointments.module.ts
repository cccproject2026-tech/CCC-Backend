import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';
import { Appointment, AppointmentSchema } from './schemas/appointment.schema';
import { Availability, AvailabilitySchema } from './schemas/availability.schema';
import { AssessmentAssigned, AssessmentAssignedSchema } from '../assessment/schemas/assessment_assigned';
import { HomeModule } from '../home/home.module';
import { ZoomModule } from '../zoom/zoom.module';
import { MailerService } from '../../common/utils/mail.util';
import { TranscriptSummaryService } from './transcript-summary.service';
import { AppointmentsCronService } from './appointments.cron';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Appointment.name, schema: AppointmentSchema },
            { name: Availability.name, schema: AvailabilitySchema },
            { name: AssessmentAssigned.name, schema: AssessmentAssignedSchema }
        ]),
        HomeModule,
        ZoomModule,
        ConfigModule,
    ],
    controllers: [AppointmentsController],
    providers: [AppointmentsService, MailerService, TranscriptSummaryService, AppointmentsCronService],
    exports: [AppointmentsService],
})
export class AppointmentsModule { }