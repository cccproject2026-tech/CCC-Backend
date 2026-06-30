import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { User, UserSchema } from '../users/schemas/user.schema';
import { Progress, ProgressSchema } from '../progress/schemas/progress.schema';
import { Extras, ExtrasSchema } from '../roadmaps/schemas/extras.schema';
import { RoadMap, RoadMapSchema } from '../roadmaps/schemas/roadmap.schema';
import { UserAnswer, UserAnswerSchema } from '../assessment/schemas/answer.schema';
import {
    Assessment,
    AssessmentSchema,
} from '../assessment/schemas/assessment.schema';
import { MentorController } from './mentor.controller';
import { MentorService } from './mentor.service';

/**
 * Dedicated orchestration module for mentor-scoped aggregated views.
 * Reads from roadmaps/assessment/progress/users collections directly (read-only),
 * so it does not depend on those feature modules and avoids circular imports.
 */
@Module({
    imports: [
        ConfigModule,
        MongooseModule.forFeature([
            { name: User.name, schema: UserSchema },
            { name: Progress.name, schema: ProgressSchema },
            { name: Extras.name, schema: ExtrasSchema },
            { name: RoadMap.name, schema: RoadMapSchema },
            { name: UserAnswer.name, schema: UserAnswerSchema },
            { name: Assessment.name, schema: AssessmentSchema },
        ]),
    ],
    controllers: [MentorController],
    providers: [MentorService],
})
export class MentorModule {}
