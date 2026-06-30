import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsEnum,
  IsInt,
  Min,
  Max,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum SearchModule {
  ROADMAPS = 'roadmaps',
  APPOINTMENTS = 'appointments',
  ASSESSMENTS = 'assessments',
  USERS = 'users',
  INTERESTS = 'interests',
  SCHOLARSHIPS = 'scholarships',
  MICRO_GRANTS = 'micro-grants',
  ALL = 'all',
}

export class SearchQueryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Search query must be at least 2 characters long' })
  query: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsEnum(SearchModule, { each: true })
  modules?: SearchModule[] = [SearchModule.ALL];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(['relevance', 'date', 'name'])
  sortBy?: string = 'relevance';
}
