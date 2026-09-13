import type { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RabbitMQConnectionService } from '../../rabbitmq/rabbitmq-connection.service.js';
import { EventType, type PostCreatedEvent } from './event.types.js';
import { EventPublisherService } from './event-publisher.service.js';

describe('EventPublisherService', () => {
  let service: EventPublisherService;
  let mockChannel: { publish: ReturnType<typeof vi.fn> };
  let mockConnection: {
    getPublisherChannel: ReturnType<typeof vi.fn>;
    releasePublisherChannel: ReturnType<typeof vi.fn>;
  };
  let mockEmitter: { emit: ReturnType<typeof vi.fn> };

  const sampleEvent: PostCreatedEvent = {
    eventId: 'event-1',
    eventType: EventType.POST_CREATED,
    timestamp: new Date(),
    userId: 'user-1',
    data: { postId: 'post-1', authorId: 'user-1', title: '제목' },
  };

  beforeEach(() => {
    mockChannel = { publish: vi.fn().mockResolvedValue(undefined) };
    mockConnection = {
      getPublisherChannel: vi.fn().mockResolvedValue(mockChannel),
      releasePublisherChannel: vi.fn(),
    };
    mockEmitter = { emit: vi.fn() };

    service = new EventPublisherService(
      mockConnection as unknown as RabbitMQConnectionService,
      mockEmitter as unknown as EventEmitter2,
    );
  });

  describe('emitLocal', () => {
    it('EventEmitter2로 eventType을 이벤트명으로 발행한다', () => {
      service.emitLocal(sampleEvent);
      expect(mockEmitter.emit).toHaveBeenCalledWith(
        EventType.POST_CREATED,
        sampleEvent,
      );
    });
  });

  describe('emitDistributed', () => {
    it('채널을 빌려 publish하고 반드시 반환한다', async () => {
      await service.emitDistributed(sampleEvent);

      expect(mockConnection.getPublisherChannel).toHaveBeenCalled();
      expect(mockChannel.publish).toHaveBeenCalledWith(
        'nest-template.events',
        EventType.POST_CREATED,
        expect.any(Buffer),
        expect.objectContaining({ persistent: true, messageId: 'event-1' }),
      );
      expect(mockConnection.releasePublisherChannel).toHaveBeenCalledWith(
        mockChannel,
      );
    });

    it('publish가 실패해도 채널을 반환한다', async () => {
      mockChannel.publish.mockRejectedValue(new Error('boom'));

      await expect(service.emitDistributed(sampleEvent)).rejects.toThrow(
        'boom',
      );
      expect(mockConnection.releasePublisherChannel).toHaveBeenCalledWith(
        mockChannel,
      );
    });
  });

  describe('emitAll', () => {
    it('로컬과 분산 발행을 모두 수행한다', async () => {
      await service.emitAll(sampleEvent);

      expect(mockEmitter.emit).toHaveBeenCalled();
      expect(mockChannel.publish).toHaveBeenCalled();
    });
  });
});
