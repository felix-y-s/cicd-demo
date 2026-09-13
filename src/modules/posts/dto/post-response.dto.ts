import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

/**
 * 게시글 응답 DTO
 *
 * @Exclude(): 클래스 레벨 — 모든 속성 기본 제외
 * @Expose(): 응답에 포함할 속성만 명시적 노출
 */
@Exclude()
export class PostResponseDto {
  @ApiProperty({
    description: '게시글 ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @Expose()
  id!: string;

  @ApiProperty({ description: '제목', example: '첫 번째 게시글입니다' })
  @Expose()
  title!: string;

  @ApiProperty({ description: '내용', example: '게시글 본문 내용입니다.' })
  @Expose()
  content!: string;

  @ApiProperty({
    description: '작성자 ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @Expose()
  authorId!: string;

  @ApiProperty({
    description: '생성일시',
    example: '2026-01-01T00:00:00.000Z',
  })
  @Expose()
  createdAt!: Date;

  @ApiProperty({
    description: '수정일시',
    example: '2026-01-01T00:00:00.000Z',
  })
  @Expose()
  updatedAt!: Date;
}
