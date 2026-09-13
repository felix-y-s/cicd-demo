import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { plainToInstance } from 'class-transformer';
import {
  ApiCreateResponses,
  ApiDeleteResponses,
  ApiGetResponses,
  ApiUpdateResponses,
} from '../../common/swagger/index.js';
import {
  ApiPaginatedResponse,
  PaginationDto,
} from '../../common/pagination/index.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { PostResponseDto } from './dto/post-response.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';
import { PostsService } from './posts.service.js';

@ApiTags('posts')
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '게시글 생성' })
  @ApiCreateResponses(PostResponseDto, '게시글 생성 성공')
  @Throttle({ medium: {} })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreatePostDto,
  ): Promise<PostResponseDto> {
    const post = await this.postsService.create(userId, dto);
    return plainToInstance(PostResponseDto, post);
  }

  // 목록 조회는 공개 — 로그인하지 않은 사용자도 게시글을 볼 수 있다
  @Public()
  @ApiOperation({ summary: '게시글 목록 조회' })
  @ApiPaginatedResponse(PostResponseDto, '게시글 목록 조회 성공')
  @Throttle({ long: {} })
  @Get()
  async findAll(@Query() query: PaginationDto) {
    const result = await this.postsService.findAll(query);
    return {
      items: plainToInstance(PostResponseDto, result.items),
      meta: result.meta,
    };
  }

  @Public()
  @ApiOperation({ summary: '게시글 단건 조회' })
  @ApiGetResponses(PostResponseDto, '게시글 조회 성공')
  @Throttle({ long: {} })
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<PostResponseDto> {
    const post = await this.postsService.findOne(id);
    return plainToInstance(PostResponseDto, post);
  }

  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '게시글 수정 (작성자 본인만 가능)' })
  @ApiUpdateResponses(PostResponseDto, '게시글 수정 성공')
  @Throttle({ medium: {} })
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdatePostDto,
  ): Promise<PostResponseDto> {
    const post = await this.postsService.update(id, userId, dto);
    return plainToInstance(PostResponseDto, post);
  }

  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '게시글 삭제 (작성자 본인만 가능)' })
  @ApiDeleteResponses('게시글 삭제 성공')
  @Throttle({ medium: {} })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
  ): Promise<void> {
    await this.postsService.remove(id, userId);
  }
}
