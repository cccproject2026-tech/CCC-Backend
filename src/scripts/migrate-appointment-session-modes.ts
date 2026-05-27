import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { Appointment, AppointmentDocument } from '../modules/appointments/schemas/appointment.schema';
import { RECORDING_STATUSES, SESSION_MODES } from '../common/constants/status.constants';

function modifiedCount(result: any): number {
    return result?.modifiedCount ?? result?.nModified ?? 0;
}

async function main() {
    const logger = new Logger('MigrateAppointmentSessionModes');
    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn', 'log'],
    });
    try {
        const appointmentModel = app.get<Model<AppointmentDocument>>(getModelToken(Appointment.name));
        const modeRes = await appointmentModel.updateMany(
            { sessionMode: { $exists: false } },
            { $set: { sessionMode: SESSION_MODES.ONLINE } },
        );
        const recordingRes = await appointmentModel.updateMany(
            { recordingStatus: { $exists: false } },
            { $set: { recordingStatus: RECORDING_STATUSES.NOT_STARTED } },
        );
        logger.log(
            `sessionMode updated: ${modifiedCount(modeRes)}, recordingStatus updated: ${modifiedCount(recordingRes)}`,
        );
    } finally {
        await app.close();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
