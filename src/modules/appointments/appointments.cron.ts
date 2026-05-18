import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Appointment, AppointmentDocument } from './schemas/appointment.schema';
import { APPOINTMENT_STATUSES } from '../../common/constants/status.constants';

@Injectable()
export class AppointmentsCronService {
  private readonly logger = new Logger(AppointmentsCronService.name);

  constructor(
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
  ) { }

  /**
   * Keeps appointment history after endTime by:
   * 1) marking still-scheduled meetings as missed after a 15-minute grace period
   * 2) removing meeting links so they cannot be reused
   * Runs every 15 minutes.
   */
  @Cron('*/15 * * * *')
  async completePastAppointments(): Promise<void> {
    const now = new Date();
    const GRACE_PERIOD_MS = 15 * 60 * 1000;
    const missedCutoff = new Date(now.getTime() - GRACE_PERIOD_MS);

    const missedRes = await this.appointmentModel.updateMany(
      {
        status: APPOINTMENT_STATUSES.SCHEDULED,
        endTime: { $lt: missedCutoff },
      },
      {
        $set: {
          status: APPOINTMENT_STATUSES.MISSED,
        },
        $unset: {
          meetingLink: 1,
          'zoomMeeting.joinUrl': 1,
          'zoomMeeting.startUrl': 1,
        },
      },
    );

    const missedModified =
      (missedRes as any)?.modifiedCount ??
      (missedRes as any)?.nModified ??
      0;

    const completedRes = await this.appointmentModel.updateMany(
      {
        status: APPOINTMENT_STATUSES.COMPLETED,
        endTime: { $lt: now },
      },
      {
        $unset: {
          meetingLink: 1,
          'zoomMeeting.joinUrl': 1,
          'zoomMeeting.startUrl': 1,
        },
      },
    );

    const completedModified =
      (completedRes as any)?.modifiedCount ??
      (completedRes as any)?.nModified ??
      0;

    if (missedModified > 0 || completedModified > 0) {
      this.logger.log(
        `Processed past appointments: ${missedModified} marked missed, ${completedModified} completed links disabled.`,
      );
    }
  }
}

