import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchResponseDto } from './dto/search-response.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ROLES } from '../../common/constants/roles.constants';

@ApiTags('Search')
@Controller('search')
// @UseGuards(JwtAuthGuard, RolesGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('global')
  // @Roles(
  //   ROLES.SUPER_ADMIN,
  //   ROLES.DIRECTOR,
  //   ROLES.MENTOR,
  //   ROLES.FIELD_MENTOR,
  //   ROLES.PASTOR,
  //   ROLES.LAY_LEADER,
  //   ROLES.SEMINARIAN,
  // )
  async globalSearch(
    @Query() query: SearchQueryDto,
    @CurrentUser() user?: any,
  ): Promise<SearchResponseDto> {
    //For testing
    const testUser = user || {
      _id: 'test-user-id',
      email: 'test@example.com',
      role: query['testRole'] || ROLES.DIRECTOR, // Can override with ?testRole=pastor
    };

    return this.searchService.globalSearch(query, testUser);
  }
}
