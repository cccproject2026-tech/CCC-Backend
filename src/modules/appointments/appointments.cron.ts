import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AppointmentsService } from './appointments.service';

@Injectable()
export class AppointmentsCronService {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  /**
   * Runs every 15 minutes:
   * - `in-progress` past `endTime` → `completed` (+ linked assessment marked done, join links cleared)
   * - `scheduled` past end + 15m grace → `missed` (+ link cleanup)
   * - `completed` past `endTime` → join links stripped
   */
  @Cron('*/15 * * * *')
  async completePastAppointments(): Promise<void> {
    await this.appointmentsService.runPastAppointmentLifecycleCron();
  }
}
