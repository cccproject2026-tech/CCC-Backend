import { ApiProperty } from '@nestjs/swagger';
import { SearchResultItem, SearchStats } from '../interfaces/search-result.interface';

export class SearchResponseDto {
  @ApiProperty()
  success: boolean;
  @ApiProperty()
  message: string;
  @ApiProperty()
  data: {
    results: Record<string, SearchResultItem[]>;
    total: number;
    page: number;
    limit: number;
    searchQuery: string;
    stats?: SearchStats;
  };
}
