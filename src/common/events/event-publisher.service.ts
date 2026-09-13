import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RabbitMQConnectionService } from '../../rabbitmq/rabbitmq-connection.service.js';
import type { BaseEvent } from './event.types.js';

const EXCHANGE_EVENTS = 'nest-template.events';

@Injectable()
export class EventPublisherService {
  private readonly logger = new Logger(EventPublisherService.name);

  constructor(
    private readonly rabbitMQConnection: RabbitMQConnectionService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * 로컬 이벤트 발행 (같은 프로세스 내 EventEmitter)
   * 캐시 무효화, 즉시 처리 등 동기적 작업에 사용
   */
  emitLocal<T extends BaseEvent>(event: T): void {
    this.eventEmitter.emit(event.eventType, event);
    this.logger.debug(
      `로컬 이벤트 발행: ${event.eventType} | ID: ${event.eventId}`,
    );
  }

  /**
   * 분산 이벤트 발행 (RabbitMQ)
   * 다른 서비스로 전달하거나 비동기 처리가 필요한 작업에 사용
   */
  async emitDistributed<T extends BaseEvent>(
    event: T,
    options?: { priority?: number; expiration?: number },
  ): Promise<void> {
    const channel = await this.rabbitMQConnection.getPublisherChannel();

    try {
      const buffer = Buffer.from(JSON.stringify(event));

      await channel.publish(EXCHANGE_EVENTS, event.eventType, buffer, {
        persistent: true,
        messageId: event.eventId,
        timestamp: Date.now(),
        contentType: 'application/json',
        priority: options?.priority,
        expiration: options?.expiration?.toString(),
      });

      this.logger.log(
        `분산 이벤트 발행: ${event.eventType} | ID: ${event.eventId}`,
      );
    } finally {
      this.rabbitMQConnection.releasePublisherChannel(channel);
    }
  }

  /**
   * 하이브리드 발행 (로컬 + RabbitMQ 동시)
   * 대부분의 도메인 이벤트에서 권장
   */
  async emitAll<T extends BaseEvent>(event: T): Promise<void> {
    this.emitLocal(event);
    await this.emitDistributed(event);
  }
}
