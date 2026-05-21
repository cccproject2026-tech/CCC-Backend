import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OtpToken, OtpTokenSchema } from './schemas/otp.schema';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { OtpService } from './otp.service';
import { JwtStrategy } from './utils/jwt.strategy';
import { UsersModule } from '../../modules/users/users.module';
import { MailerService } from '../../common/utils/mail.util';
import { GoogleCalendarModule } from '../google-calendar/google-calendar.module';

@Module({
    imports: [
        ConfigModule,
        PassportModule,
        JwtModule.registerAsync({
            imports: [ConfigModule],
            useFactory: async (config: ConfigService) => ({
                secret: config.get<string>('jwtSecret'),
                signOptions: { expiresIn: config.get<string>('jwtExpiresIn') || '15m' },
            }),
            inject: [ConfigService],
        }),
        MongooseModule.forFeature([{ name: OtpToken.name, schema: OtpTokenSchema }]),
        UsersModule,
        GoogleCalendarModule,
    ],
    providers: [AuthService, OtpService, JwtStrategy, MailerService],
    controllers: [AuthController],
    exports: [AuthService],
})
export class AuthModule { }