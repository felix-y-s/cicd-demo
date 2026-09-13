import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { PaginationMeta } from './pagination.types.js';

/**
 * 페이지네이션 메타데이터 DTO (Swagger 문서화 전용)
 *
 * 실제로는 PaginationMeta 인터페이스를 통해 반환하고,
 * 이 클래스는 @ApiPaginatedResponse 데코레이터에서 $ref 스키마 등록에만 사용된다.
 */
export class PaginationMetaDto implements PaginationMeta {
  @ApiProperty({ description: '전체 항목 수', example: 100 })
  total!: number;

  @ApiProperty({ description: '현재 페이지 번호', example: 1 })
  page!: number;

  @ApiProperty({ description: '페이지당 항목 수', example: 10 })
  limit!: number;

  @ApiProperty({ description: '전체 페이지 수', example: 10 })
  totalPages!: number;

  @ApiProperty({ description: '다음 페이지 존재 여부', example: true })
  hasNextPage!: boolean;

  @ApiProperty({ description: '이전 페이지 존재 여부', example: false })
  hasPreviousPage!: boolean;

  @ApiPropertyOptional({
    description: '다음 페이지 번호 (없으면 null)',
    example: 2,
    nullable: true,
  })
  nextPage!: number | null;

  @ApiPropertyOptional({
    description: '이전 페이지 번호 (없으면 null)',
    example: null,
    nullable: true,
  })
  previousPage!: number | null;
}
