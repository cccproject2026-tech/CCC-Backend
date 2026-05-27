import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MentoringSessionsController } from './mentoring-sessions.controller';
import { MentoringSessionsService } from './mentoring-sessions.service';
import { Extras, ExtrasSchema } from '../roadmaps/schemas/extras.schema';
import { Appointment, AppointmentSchema } from '../appointments/schemas/appointment.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
    MentoringRescheduleRequest,
    MentoringRescheduleRequestSchema,
} from './schemas/mentoring-reschedule-request.schema';
import { RoadMapsModule } from '../roadmaps/roadmaps.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { HomeModule } from '../home/home.module';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Extras.name, schema: ExtrasSchema },
            { name: Appointment.name, schema: AppointmentSchema },
            { name: User.name, schema: UserSchema },
            { name: MentoringRescheduleRequest.name, schema: MentoringRescheduleRequestSchema },
        ]),
        // Avoid circular-load issues:
        // MentoringSessionsModule -> RoadMapsModule -> AppointmentsModule -> MentoringSessionsModule
        forwardRef(() => RoadMapsModule),
        forwardRef(() => AppointmentsModule),
        HomeModule,
    ],
    controllers: [MentoringSessionsController],
    providers: [MentoringSessionsService],
    exports: [MentoringSessionsService],
})
export class MentoringSessionsModule {}
