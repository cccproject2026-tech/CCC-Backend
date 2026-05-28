import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from '../users/users.module';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleCalendarController } from './google-calendar.controller';

@Module({
    imports: [ConfigModule, UsersModule],
    controllers: [GoogleCalendarController],
    providers: [GoogleCalendarService],
    exports: [GoogleCalendarService],
})
export class GoogleCalendarModule {}
