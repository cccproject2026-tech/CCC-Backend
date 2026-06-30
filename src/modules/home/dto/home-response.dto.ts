import { IsArray, IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class HomeResponseDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    id: string;

    @ApiProperty()
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    username: string;

    @ApiPropertyOptional()
    @IsArray()
    @IsOptional()
    @IsString({ each: true })
    appointments?: string[];

    @ApiPropertyOptional()
    @IsArray()
    @IsOptional()
    @IsString({ each: true })
    roadmaps?: string[];

    @ApiPropertyOptional()
    @IsArray()
    @IsOptional()
    @IsString({ each: true })
    mentors?: string[];
}
