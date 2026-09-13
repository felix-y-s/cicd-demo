import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: '사용자 이메일',
    example: 'user@example.com',
    format: 'email',
  })
  @IsEmail({}, { message: '유효한 이메일 주소를 입력하세요' })
  email!: string;

  @ApiProperty({
    description: '비밀번호',
    example: 'password123',
    minLength: 8,
    format: 'password',
  })
  @IsString()
  @MinLength(8, { message: '비밀번호는 최소 8자 이상이어야 합니다' })
  password!: string;
}
