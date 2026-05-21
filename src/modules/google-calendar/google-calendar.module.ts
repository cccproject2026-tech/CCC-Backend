import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from '../users/users.module';
import { GoogleCalendarService } from './google-calendar.service';

@Module({
    imports: [ConfigModule, UsersModule],
    providers: [GoogleCalendarService],
    exports: [GoogleCalendarService],
})
export class GoogleCalendarModule {}
