import { IsArray, IsString, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CountryStateDto {
    @ApiProperty()
    @IsString()
    country: string;

    @ApiProperty()
    @IsArray()
    @IsString({ each: true })
    states: string[];
}

export class InterestMetadataDto {
    @ApiProperty()
    @IsArray()
    @IsString({ each: true })
    titles: string[];

    @ApiProperty()
    @IsArray()
    @IsString({ each: true })
    countries: string[];

    @ApiProperty()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CountryStateDto)
    countryStates: CountryStateDto[];

    @ApiProperty()
    @IsArray()
    @IsString({ each: true })
    interests: string[];
}
