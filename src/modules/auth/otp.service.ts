import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OtpToken, OtpDocument } from './schemas/otp.schema';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { MailerService } from '../../common/utils/mail.util';

@Injectable()
export class OtpService {
    constructor(
        @InjectModel(OtpToken.name) private otpModel: Model<OtpDocument>,
        private readonly mailerService: MailerService,
    ) { }

    async generateAndSendOtp(email: string, purpose: string, ttlMinutes = 10): Promise<void> {
        const otp = String(randomInt(100000, 999999));
        const otpHash = await bcrypt.hash(otp, 10);
        const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

        await this.otpModel.create({ email, otpHash, purpose, expiresAt, used: false });

        await this.mailerService.sendOtpEmail(email, otp, purpose);
        // return otp;
    }

    async verifyOtp(email: string, otp: string, purpose: string): Promise<boolean> {
        const record = await this.otpModel
            .findOne({ email, purpose, used: false })
            .sort({ createdAt: -1 })
            .exec();
        if (!record) return false;
        if (record.expiresAt < new Date()) return false;
        const match = await bcrypt.compare(otp, record.otpHash);
        if (!match) return false;
        record.used = true;
        await record.save();
        return true;
    }
}
