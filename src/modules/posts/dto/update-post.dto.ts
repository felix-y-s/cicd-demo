import { PartialType } from '@nestjs/swagger';
import { CreatePostDto } from './create-post.dto.js';

/**
 * 게시글 수정 요청 DTO
 * CreatePostDto의 모든 필드를 optional로 상속
 */
export class UpdatePostDto extends PartialType(CreatePostDto) {}
