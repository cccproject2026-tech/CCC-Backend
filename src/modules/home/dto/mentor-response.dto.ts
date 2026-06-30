import { IsEmail, IsNotEmpty, IsOptional, isString, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MentorResponseDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    id: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    firstName: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    lastName: string;

    @ApiProperty()
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    username?: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    role: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    roleId: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    profileInfo?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    phoneNumber?: string;
}
