import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Appointment, AppointmentDocument } from './schemas/appointment.schema';
import { Availability, AvailabilityDocument } from './schemas/availability.schema';
import { APPOINTMENT_STATUSES } from '../../common/constants/status.constants';

@Injectable()
export class AppointmentsCronService {
  private readonly logger = new Logger(AppointmentsCronService.name);

  constructor(
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(Availability.name)
    private readonly availabilityModel: Model<AvailabilityDocument>,
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

  /**
   * Daily cleanup of stale availability slots to reduce DB size.
   * Retention: keep the most recent 2 days of availability history.
   * Runs at 12:00 AM Asia/Kolkata.
   */
  @Cron('0 0 * * *', { timeZone: 'Asia/Kolkata' })
  async clearPastAvailabilitySlots(): Promise<void> {
    // Convert "today 00:00 IST" to its UTC timestamp for safe DB comparison.
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const RETENTION_DAYS = 2;
    const now = new Date();
    const istNow = new Date(now.getTime() + IST_OFFSET_MS);
    const startOfTodayIstAsUtc = new Date(
      Date.UTC(
        istNow.getUTCFullYear(),
        istNow.getUTCMonth(),
        istNow.getUTCDate(),
        0,
        0,
        0,
        0,
      ) - IST_OFFSET_MS,
    );
    const retentionCutoff = new Date(
      startOfTodayIstAsUtc.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    const res = await this.availabilityModel.updateMany(
      {},
      {
        $pull: {
          weeklySlots: {
            date: { $lt: retentionCutoff },
          },
        },
      },
    );

    const modified =
      (res as any)?.modifiedCount ??
      (res as any)?.nModified ??
      0;

    if (modified > 0) {
      this.logger.log(`Cleared past availability entries for ${modified} mentor(s).`);
    }
  }
}

