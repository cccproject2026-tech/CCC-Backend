import { IsEmail, IsIn, IsNotEmpty, IsString, Length } from "class-validator";
import { ApiProperty } from '@nestjs/swagger';

export class SendOtpDto {
    @ApiProperty()
    @IsEmail()
    email: string;

    @ApiProperty({ enum: ['email_verification', 'password_reset'], example: 'email_verification' })
    @IsNotEmpty()
    @IsIn(['email_verification', 'password_reset'])
    purpose: 'email_verification' | 'password_reset';
}

export class VerifyOtpDto {
    @ApiProperty()
    @IsEmail()
    email: string;

    @ApiProperty()
    @IsNotEmpty()
    @IsString()
    @Length(4, 8)
    otp: string;
}
