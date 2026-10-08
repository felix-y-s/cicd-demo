import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

/**
 * 사용자 응답 DTO
 *
 * passwordHash/refreshTokenHash는 절대 노출하지 않는다 — @Exclude()로
 * 기본 제외하고 응답에 포함할 속성만 @Expose()로 명시한다.
 */
@Exclude()
export class UserResponseDto {
  @ApiProperty({
    description: '사용자 ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @Expose()
  id!: string;

  @ApiProperty({ description: '이메일', example: 'user@example.com' })
  @Expose()
  email!: string;

  @ApiProperty({ description: '권한', example: 'USER', enum: ['USER', 'ADMIN'] })
  @Expose()
  role!: string;

  @ApiProperty({
    description: '가입일시',
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
