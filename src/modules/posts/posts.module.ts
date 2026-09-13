import { Module } from '@nestjs/common';
import { PostEventConsumer } from './events/post-event.consumer.js';
import { PostsController } from './posts.controller.js';
import { PostsService } from './posts.service.js';
import { PostsRepository } from './repositories/posts.repository.js';

/**
 * Posts 모듈
 * PostEventConsumer가 이 모듈에서 등록되어야 post.created 이벤트를
 * 실제로 구독한다 (nest-rabbitmq 단계에서는 Consumer 파일만 준비됨).
 */
@Module({
  controllers: [PostsController],
  providers: [PostsService, PostsRepository, PostEventConsumer],
  exports: [PostsService],
})
export class PostsModule {}
