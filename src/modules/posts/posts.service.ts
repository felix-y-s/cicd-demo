import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Post } from '@prisma/client';
import { EventType } from '../../common/events/event.types.js';
import { EventPublisherService } from '../../common/events/event-publisher.service.js';
import { PostForbiddenException, PostNotFoundException } from '../../common/exception/index.js';
import {
  PaginationUtil,
  type PaginatedResult,
  type PaginationOptions,
} from '../../common/pagination/index.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';
import { PostsRepository } from './repositories/posts.repository.js';

@Injectable()
export class PostsService {
  constructor(
    private readonly postsRepository: PostsRepository,
    private readonly eventPublisher: EventPublisherService,
  ) {}

  /**
   * 게시글 생성 후 post.created 이벤트를 발행한다
   */
  async create(authorId: string, dto: CreatePostDto): Promise<Post> {
    const post = await this.postsRepository.create({
      title: dto.title,
      content: dto.content,
      author: { connect: { id: authorId } },
    });

    await this.eventPublisher.emitAll({
      eventId: randomUUID(),
      eventType: EventType.POST_CREATED,
      timestamp: new Date(),
      userId: authorId,
      data: { postId: post.id, authorId, title: post.title },
    });

    return post;
  }

  async findAll(
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<Post>> {
    const options = PaginationUtil.normalize(pagination);
    const prismaOptions = PaginationUtil.getPrismaOptions(options);

    const [items, total] = await Promise.all([
      this.postsRepository.findMany(prismaOptions),
      this.postsRepository.count(),
    ]);

    return PaginationUtil.paginate(items, total, options);
  }

  /**
   * @throws PostNotFoundException 게시글이 존재하지 않을 때
   */
  async findOne(id: string): Promise<Post> {
    const post = await this.postsRepository.findById(id);
    if (!post) throw new PostNotFoundException();
    return post;
  }

  /**
   * @throws PostNotFoundException 게시글이 존재하지 않을 때
   * @throws PostForbiddenException 요청자가 작성자 본인이 아닐 때
   */
  async update(
    id: string,
    userId: string,
    dto: UpdatePostDto,
  ): Promise<Post> {
    const post = await this.findOne(id);
    if (post.authorId !== userId) throw new PostForbiddenException();

    return this.postsRepository.update(id, dto);
  }

  /**
   * @throws PostNotFoundException 게시글이 존재하지 않을 때
   * @throws PostForbiddenException 요청자가 작성자 본인이 아닐 때
   */
  async remove(id: string, userId: string): Promise<void> {
    const post = await this.findOne(id);
    if (post.authorId !== userId) throw new PostForbiddenException();

    await this.postsRepository.delete(id);
  }
}
