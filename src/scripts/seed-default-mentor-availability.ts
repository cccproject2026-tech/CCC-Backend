import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { AppointmentsService } from '../modules/appointments/appointments.service';

/**
 * Optional manual migration only (not run on signup, interest accept, or cron).
 * Seeds next 60 days Mon–Sat, 9 AM–9 PM, for mentors/directors/field mentors.
 *
 * Usage (from repo root, with .env loaded):
 *   npm run seed:mentor-availability
 */
async function main() {
    const logger = new Logger('SeedMentorAvailability');
    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn', 'log'],
    });

    try {
        const appointmentsService = app.get(AppointmentsService);
        const result = await appointmentsService.seedDefaultSixtyDayAvailabilityForMentorsAndDirectors();
        logger.log(JSON.stringify(result, null, 2));
        if (result.errors.length > 0) {
            process.exitCode = 1;
        }
    } finally {
        await app.close();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
