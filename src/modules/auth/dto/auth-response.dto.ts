import { ApiProperty } from '@nestjs/swagger';

export class UserSummaryDto {
  @ApiProperty({
    description: '사용자 ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({ description: '이메일', example: 'user@example.com' })
  email!: string;

  @ApiProperty({ description: '역할', example: 'USER', enum: ['USER', 'ADMIN'] })
  role!: string;

  @ApiProperty({ description: '생성 일시', example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ description: '수정 일시', example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: Date;

  @ApiProperty({ description: '삭제 일시 (soft delete)', nullable: true, example: null })
  deletedAt!: Date | null;
}

export class AuthTokensDto {
  @ApiProperty({
    description: 'JWT Access Token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken!: string;

  @ApiProperty({
    description: 'JWT Refresh Token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken!: string;
}

export class AuthResponseDto extends AuthTokensDto {
  @ApiProperty({ description: '로그인/가입한 사용자 정보', type: UserSummaryDto })
  user!: UserSummaryDto;
}
