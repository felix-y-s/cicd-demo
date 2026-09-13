import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { plainToInstance } from 'class-transformer';
import {
  ApiGetResponses,
  ApiCreateResponses,
} from '../../common/swagger/index.js';
import {
  ApiPaginatedResponse,
  PaginationDto,
} from '../../common/pagination/index.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { ActivityLogsService } from './activity-logs.service.js';
import { ActivityLogResponseDto, CreateActivityLogDto } from './dto/index.js';

@ApiTags('activity-logs')
@ApiBearerAuth('access-token')
@Controller('activity-logs')
export class ActivityLogsController {
  constructor(private readonly activityLogsService: ActivityLogsService) {}

  @ApiOperation({
    summary: '활동 로그 기록',
    description: '요청자 본인 명의로 활동 로그를 기록한다.',
  })
  @ApiCreateResponses(ActivityLogResponseDto, '기록 성공')
  @Throttle({ medium: {} })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async record(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateActivityLogDto,
  ): Promise<ActivityLogResponseDto> {
    const log = await this.activityLogsService.record(userId, dto);
    return plainToInstance(ActivityLogResponseDto, log);
  }

  @ApiOperation({ summary: '내 활동 로그 목록 조회 (최신순)' })
  @ApiPaginatedResponse(ActivityLogResponseDto, '활동 로그 목록 조회 성공')
  @Throttle({ long: {} })
  @Get()
  async findMine(
    @CurrentUser('userId') userId: string,
    @Query() query: PaginationDto,
  ) {
    const result = await this.activityLogsService.findByUserId(userId, query);
    return {
      items: plainToInstance(ActivityLogResponseDto, result.items),
      meta: result.meta,
    };
  }

  @ApiOperation({
    summary: '활동 로그 단건 조회',
    description: '본인 소유의 활동 로그만 조회할 수 있다.',
  })
  @ApiGetResponses(ActivityLogResponseDto, '조회 성공')
  @Throttle({ long: {} })
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
  ): Promise<ActivityLogResponseDto> {
    const log = await this.activityLogsService.findOne(id, userId);
    return plainToInstance(ActivityLogResponseDto, log);
  }
}
