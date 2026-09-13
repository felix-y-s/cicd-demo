import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * 게시글 생성 요청 DTO
 */
export class CreatePostDto {
  @ApiProperty({
    description: '게시글 제목',
    example: '첫 번째 게시글입니다',
    maxLength: 200,
  })
  @IsString()
  @IsNotEmpty({ message: '제목은 필수입니다' })
  @MaxLength(200, { message: '제목은 200자를 초과할 수 없습니다' })
  title!: string;

  @ApiProperty({
    description: '게시글 내용',
    example: '게시글 본문 내용입니다.',
  })
  @IsString()
  @IsNotEmpty({ message: '내용은 필수입니다' })
  content!: string;
}
