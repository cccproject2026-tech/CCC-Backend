import { IsEmail, IsNotEmpty, Length, MinLength } from "class-validator";
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
    @ApiProperty()
    @IsEmail()
    email: string;
}

export class SetPasswordDto extends ForgotPasswordDto {
    @ApiProperty()
    @IsNotEmpty()
    @MinLength(6)
    password: string;

    @ApiProperty()
    @IsNotEmpty()
    @MinLength(6)
    confirmPassword: string;
}

export class ResetPasswordDto extends ForgotPasswordDto {
    @ApiProperty()
    @IsNotEmpty()
    @Length(4, 8)
    otp: string;

    @ApiProperty()
    @IsNotEmpty()
    @MinLength(6)
    newPassword: string;

    @ApiProperty()
    @IsNotEmpty()
    @MinLength(6)
    confirmPassword: string;
}
