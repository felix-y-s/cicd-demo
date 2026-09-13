import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import type { PaginationOptions } from './pagination.types.js';

/**
 * 오프셋 기반 페이지네이션 요청 DTO
 *
 * [주의] 필드에 `?`(optional)를 붙이지 않는다.
 * 기본값(`= 1`)이 있는 필드에 `?`까지 붙이면 타입이 `number | undefined`가 되어
 * 실제 동작(항상 number)과 불일치한다. TypeScript에서 required(`number`)는
 * optional(`number | undefined`)의 부분집합이므로 `?` 없이도
 * `implements PaginationOptions`를 만족한다.
 *
 * @example
 * GET /posts?page=2&limit=20&sortBy=createdAt&sortOrder=DESC
 */
export class PaginationDto implements PaginationOptions {
  @ApiPropertyOptional({
    description: '페이지 번호 (1부터 시작)',
    minimum: 1,
    default: 1,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '페이지 번호는 정수여야 합니다' })
  @Min(1, { message: '페이지 번호는 1 이상이어야 합니다' })
  page: number = 1;

  @ApiPropertyOptional({
    description: '페이지당 항목 수',
    minimum: 1,
    maximum: 100,
    default: 10,
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit는 정수여야 합니다' })
  @Min(1, { message: 'limit는 1 이상이어야 합니다' })
  @Max(100, { message: 'limit는 100 이하여야 합니다' })
  limit: number = 10;

  @ApiPropertyOptional({
    description: '정렬 필드',
    default: 'createdAt',
    example: 'createdAt',
  })
  @IsOptional()
  @IsString({ message: 'sortBy는 문자열이어야 합니다' })
  sortBy: string = 'createdAt';

  @ApiPropertyOptional({
    description: '정렬 순서',
    enum: ['ASC', 'DESC'],
    default: 'DESC',
    example: 'DESC',
  })
  @IsOptional()
  @IsIn(['ASC', 'DESC'], { message: 'sortOrder는 ASC 또는 DESC여야 합니다' })
  sortOrder: 'ASC' | 'DESC' = 'DESC';
}

/**
 * 커서 기반 페이지네이션 요청 DTO
 *
 * @example
 * GET /feed?cursor=123&limit=20&sortOrder=DESC
 */
export class CursorPaginationDto {
  @ApiPropertyOptional({
    description: '커서 (마지막 항목의 ID 또는 타임스탬프). 최초 조회 시 생략',
    example: '123',
  })
  @IsOptional()
  @IsString({ message: '커서는 문자열이어야 합니다' })
  cursor?: string;

  @ApiPropertyOptional({
    description: '가져올 항목 수',
    minimum: 1,
    maximum: 100,
    default: 20,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit는 정수여야 합니다' })
  @Min(1, { message: 'limit는 1 이상이어야 합니다' })
  @Max(100, { message: 'limit는 100 이하여야 합니다' })
  limit?: number = 20;

  @ApiPropertyOptional({
    description: '정렬 순서',
    enum: ['ASC', 'DESC'],
    default: 'DESC',
    example: 'DESC',
  })
  @IsOptional()
  @IsIn(['ASC', 'DESC'], { message: 'sortOrder는 ASC 또는 DESC여야 합니다' })
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}
