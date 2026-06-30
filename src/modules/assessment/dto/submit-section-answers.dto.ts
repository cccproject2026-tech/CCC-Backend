import {
    IsString,
    IsNotEmpty,
    IsArray,
    ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class LayerAnswerDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    layerId: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    selectedChoice: string;
}

export class SectionAnswerDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    sectionId: string;

    @ApiProperty()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => LayerAnswerDto)
    layers: LayerAnswerDto[];
}

export class SubmitSectionAnswersDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    userId: string;

    @ApiProperty()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SectionAnswerDto)
    answers: SectionAnswerDto[];
}
