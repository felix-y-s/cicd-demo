import { Module, Global } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { EventPublisherService } from './event-publisher.service.js';

@Global()
@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: true, // 와일드카드 패턴 지원 (post.*)
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 20,
      verboseMemoryLeak: true,
      ignoreErrors: false,
    }),
  ],
  providers: [EventPublisherService],
  exports: [EventPublisherService],
})
export class EventsModule {}
