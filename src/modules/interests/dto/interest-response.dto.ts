import { IsString, IsEmail, IsOptional, IsArray, ValidateNested, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ChurchDetailsResponseDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    churchName?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    churchPhone?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    churchWebsite?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    churchAddress?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    city?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    state?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    zipCode?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    country?: string;
}

export class InterestResponseDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    id: string;

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

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    phoneNumber: string;

    @ApiProperty()
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    profilePicture?: string;

    @ApiPropertyOptional()
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => ChurchDetailsResponseDto)
    churchDetails?: ChurchDetailsResponseDto[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    title?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    conference?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    yearsInMinistry?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    currentCommunityProjects?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    interests?: string[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    comments?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    userId?: string;

    @ApiProperty()
    @IsString()
    status: string;

}
