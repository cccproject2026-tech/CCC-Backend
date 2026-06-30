import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEmail, IsEnum, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { VALID_USER_APPLICATION_STATUSES } from '../../../common/constants/status.constants';
import { TITLES_LIST } from '../../../shared/constants/metadata.constants';

class ChurchDetailsDto {
    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    churchName?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    churchPhone?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    churchWebsite?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    churchAddress?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    city?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    state?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    zipCode?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    country?: string;
}

export class CreateInterestDto {
    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    profileInfo?: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    firstName: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    lastName: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    phoneNumber?: string;

    @ApiProperty()
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    @IsIn(['self', 'admin'], { message: 'createdBy must be either "self" or "admin"' })
    createdBy?: 'self' | 'admin';

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    profilePicture?: string;

    @ApiPropertyOptional()
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => ChurchDetailsDto)
    churchDetails?: ChurchDetailsDto[];

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    @IsIn(TITLES_LIST, { message: 'Title must be one of the following: ' + TITLES_LIST.join(', ') })
    title: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    conference?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    yearsInMinistry?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    currentCommunityProjects?: string;

    @ApiPropertyOptional()
    @IsString({ each: true })
    @IsOptional()
    @IsArray()
    interests?: string[];

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    comments?: string;

    @ApiPropertyOptional()
    @IsEnum(VALID_USER_APPLICATION_STATUSES)
    @IsOptional()
    status?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsObject()
    dynamicFieldValues?: Record<string, string | string[] | boolean | number>;
}

export class UpdateInterestDto extends PartialType(CreateInterestDto) {}
