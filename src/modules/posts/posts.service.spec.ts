import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Post } from '@prisma/client';
import { PostForbiddenException, PostNotFoundException } from '../../common/exception/index.js';
import { EventPublisherService } from '../../common/events/event-publisher.service.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { PostsRepository } from './repositories/posts.repository.js';
import { PostsService } from './posts.service.js';

describe('PostsService', () => {
  let service: PostsService;
  let repository: {
    create: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let eventPublisher: { emitAll: ReturnType<typeof vi.fn> };

  const mockPost: Post = {
    id: 'post-1',
    title: '제목',
    content: '내용',
    authorId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeEach(async () => {
    repository = {
      create: vi.fn(),
      findById: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    eventPublisher = { emitAll: vi.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: PostsRepository, useValue: repository },
        { provide: EventPublisherService, useValue: eventPublisher },
      ],
    }).compile();

    service = module.get<PostsService>(PostsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('게시글을 생성하고 post.created 이벤트를 발행한다', async () => {
      repository.create.mockResolvedValue(mockPost);
      const dto: CreatePostDto = { title: '제목', content: '내용' };

      const result = await service.create('user-1', dto);

      expect(repository.create).toHaveBeenCalledWith({
        title: '제목',
        content: '내용',
        author: { connect: { id: 'user-1' } },
      });
      expect(eventPublisher.emitAll).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'post.created',
          userId: 'user-1',
          data: { postId: 'post-1', authorId: 'user-1', title: '제목' },
        }),
      );
      expect(result).toEqual(mockPost);
    });
  });

  describe('findAll', () => {
    it('페이지네이션된 결과를 반환한다', async () => {
      repository.findMany.mockResolvedValue([mockPost]);
      repository.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.items).toEqual([mockPost]);
      expect(result.meta.total).toBe(1);
      expect(repository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });
  });

  describe('findOne', () => {
    it('존재하는 ID로 조회하면 게시글을 반환한다', async () => {
      repository.findById.mockResolvedValue(mockPost);

      const result = await service.findOne('post-1');

      expect(result).toEqual(mockPost);
    });

    it('존재하지 않는 ID로 조회하면 PostNotFoundException을 던진다', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findOne('unknown')).rejects.toThrow(
        PostNotFoundException,
      );
    });
  });

  describe('update', () => {
    it('작성자 본인이면 수정한다', async () => {
      repository.findById.mockResolvedValue(mockPost);
      repository.update.mockResolvedValue({ ...mockPost, title: '수정됨' });

      const result = await service.update('post-1', 'user-1', {
        title: '수정됨',
      });

      expect(result.title).toBe('수정됨');
    });

    it('작성자가 아니면 PostForbiddenException을 던진다', async () => {
      repository.findById.mockResolvedValue(mockPost);

      await expect(
        service.update('post-1', 'other-user', { title: 'x' }),
      ).rejects.toThrow(PostForbiddenException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('게시글이 없으면 PostNotFoundException을 던진다', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.update('unknown', 'user-1', { title: 'x' }),
      ).rejects.toThrow(PostNotFoundException);
    });
  });

  describe('remove', () => {
    it('작성자 본인이면 삭제한다', async () => {
      repository.findById.mockResolvedValue(mockPost);

      await service.remove('post-1', 'user-1');

      expect(repository.delete).toHaveBeenCalledWith('post-1');
    });

    it('작성자가 아니면 PostForbiddenException을 던지고 삭제하지 않는다', async () => {
      repository.findById.mockResolvedValue(mockPost);

      await expect(service.remove('post-1', 'other-user')).rejects.toThrow(
        PostForbiddenException,
      );
      expect(repository.delete).not.toHaveBeenCalled();
    });
  });
});
