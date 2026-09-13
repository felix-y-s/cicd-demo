import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateActivityLogDto {
  @ApiProperty({ description: '행동 종류', example: 'post.created' })
  @IsString()
  @IsNotEmpty({ message: 'action은 필수입니다' })
  action!: string;

  @ApiPropertyOptional({
    description: '행동별 메타데이터',
    example: { postId: 'post-1', title: '첫 게시글' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
