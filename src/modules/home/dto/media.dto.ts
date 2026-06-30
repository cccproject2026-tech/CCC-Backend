import {
    IsArray,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMediaDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    heading: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(300)
    subheading?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    description?: string;

    /**
     * Optional default type when clients only send files without specifying type.
     * If not present, we detect type from mimetype.
     */
    @ApiPropertyOptional()
    @IsOptional()
    @IsIn(['image', 'video'])
    defaultType?: 'image' | 'video';
}

export class UpdateMediaDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(200)
    heading?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(300)
    subheading?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    description?: string;

    /**
     * Optional: replace entire mediaFiles array from client (rare).
     * Usually you will upload new files — API appends them. If you need to remove
     * specific file entries, call a dedicated endpoint (not included by default).
     */
    @ApiPropertyOptional()
    @IsOptional()
    mediaFiles?: {
        url: string;
        type: 'image' | 'video';
        fileName: string;
        size?: number;
    }[];
}
