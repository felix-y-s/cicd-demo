import { applyDecorators, Type } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

/**
 * GET 요청 표준 응답 데코레이터 (200 OK)
 *
 * @example
 * ```typescript
 * @ApiGetResponses(PostResponseDto, '게시글 조회 성공')
 * @Get(':id')
 * async findOne(@Param('id') id: string): Promise<PostResponseDto> { ... }
 * ```
 */
export function ApiGetResponses<TModel extends Type<unknown>>(
  model: TModel,
  description = '조회 성공',
) {
  return applyDecorators(
    ApiResponse({ status: 200, description, type: model }),
    ApiResponse({ status: 400, description: '잘못된 요청 파라미터' }),
    ApiResponse({ status: 401, description: '인증 실패 (토큰 없음 또는 만료)' }),
    ApiResponse({ status: 403, description: '권한 없음' }),
    ApiResponse({ status: 429, description: 'Rate Limit 초과' }),
    ApiResponse({ status: 500, description: '서버 내부 오류' }),
  );
}

/**
 * POST 요청 표준 응답 데코레이터 (201 Created)
 *
 * @example
 * ```typescript
 * @ApiCreateResponses(PostResponseDto, '게시글 생성 성공')
 * @Post()
 * async create(@Body() dto: CreatePostDto): Promise<PostResponseDto> { ... }
 * ```
 */
export function ApiCreateResponses<TModel extends Type<unknown>>(
  model: TModel,
  description = '생성 성공',
) {
  return applyDecorators(
    ApiResponse({ status: 201, description, type: model }),
    ApiResponse({ status: 400, description: '유효성 검사 실패' }),
    ApiResponse({ status: 401, description: '인증 실패' }),
    ApiResponse({ status: 403, description: '권한 없음' }),
    ApiResponse({ status: 409, description: '중복 데이터 충돌' }),
    ApiResponse({ status: 429, description: 'Rate Limit 초과' }),
    ApiResponse({ status: 500, description: '서버 내부 오류' }),
  );
}

/**
 * PATCH/PUT 요청 표준 응답 데코레이터 (200 OK)
 *
 * @example
 * ```typescript
 * @ApiUpdateResponses(PostResponseDto, '게시글 수정 성공')
 * @Patch(':id')
 * async update(@Param('id') id: string, @Body() dto: UpdatePostDto): Promise<PostResponseDto> { ... }
 * ```
 */
export function ApiUpdateResponses<TModel extends Type<unknown>>(
  model: TModel,
  description = '수정 성공',
) {
  return applyDecorators(
    ApiResponse({ status: 200, description, type: model }),
    ApiResponse({ status: 400, description: '유효성 검사 실패' }),
    ApiResponse({ status: 401, description: '인증 실패' }),
    ApiResponse({ status: 403, description: '권한 없음' }),
    ApiResponse({ status: 404, description: '리소스를 찾을 수 없음' }),
    ApiResponse({ status: 429, description: 'Rate Limit 초과' }),
    ApiResponse({ status: 500, description: '서버 내부 오류' }),
  );
}

/**
 * DELETE 요청 표준 응답 데코레이터 (204 No Content)
 *
 * @example
 * ```typescript
 * @ApiDeleteResponses('게시글 삭제 성공')
 * @Delete(':id')
 * @HttpCode(HttpStatus.NO_CONTENT)
 * async remove(@Param('id') id: string): Promise<void> { ... }
 * ```
 */
export function ApiDeleteResponses(description = '삭제 성공') {
  return applyDecorators(
    ApiResponse({ status: 204, description }),
    ApiResponse({ status: 401, description: '인증 실패' }),
    ApiResponse({ status: 403, description: '권한 없음' }),
    ApiResponse({ status: 404, description: '리소스를 찾을 수 없음' }),
    ApiResponse({ status: 429, description: 'Rate Limit 초과' }),
    ApiResponse({ status: 500, description: '서버 내부 오류' }),
  );
}

/**
 * 인증 불필요 공개 API 응답 데코레이터 (401/403 제외)
 *
 * @example
 * ```typescript
 * @Public()
 * @ApiPublicResponses(200, PostResponseDto, '게시글 목록 조회 성공')
 * @Get()
 * async findAll(@Query() query: PaginationDto) { ... }
 * ```
 */
export function ApiPublicResponses<TModel extends Type<unknown>>(
  status: number,
  model: TModel,
  description = '성공',
) {
  return applyDecorators(
    ApiResponse({ status, description, type: model }),
    ApiResponse({ status: 400, description: '잘못된 요청' }),
    ApiResponse({ status: 429, description: 'Rate Limit 초과' }),
    ApiResponse({ status: 500, description: '서버 내부 오류' }),
  );
}
