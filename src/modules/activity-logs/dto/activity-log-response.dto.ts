import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Transform } from 'class-transformer';

@Exclude()
export class ActivityLogResponseDto {
  @ApiProperty({ description: '활동 로그 ID', example: '65f1c2a1b2c3d4e5f6a7b8c9' })
  @Expose()
  @Transform(({ obj }) => String(obj.id ?? obj._id), { toClassOnly: true })
  id!: string;

  @ApiProperty({ description: '사용자 ID', example: '123e4567-e89b-12d3-a456-426614174000' })
  @Expose()
  userId!: string;

  @ApiProperty({ description: '행동 종류', example: 'post.created' })
  @Expose()
  action!: string;

  @ApiProperty({
    description: '행동별 메타데이터 (형태는 action에 따라 다름)',
    example: { postId: 'post-1', title: '첫 게시글' },
    required: false,
  })
  @Expose()
  metadata?: Record<string, unknown>;

  @ApiProperty({ description: '기록 시각', example: '2026-01-01T00:00:00.000Z' })
  @Expose()
  createdAt!: Date;
}
