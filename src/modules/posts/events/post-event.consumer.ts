import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { ConsumeMessage } from 'amqplib';
import {
  EventType,
  type PostCreatedEvent,
} from '../../../common/events/event.types.js';
import { RabbitMQConnectionService } from '../../../rabbitmq/rabbitmq-connection.service.js';

const QUEUE_NAME = 'nest-template.posts.process';

/**
 * 게시글 도메인 이벤트 Consumer
 * - post.created 이벤트를 구독해 처리한다
 * - 지금은 로그만 남기지만, 향후 알림 발송/검색 색인 갱신 등으로 확장 가능
 */
@Injectable()
export class PostEventConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PostEventConsumer.name);
  private consumerChannel!: ChannelWrapper;

  constructor(private readonly rabbitMQConnection: RabbitMQConnectionService) {}

  async onModuleInit(): Promise<void> {
    this.consumerChannel = await this.rabbitMQConnection.createConsumerChannel(
      {
        queueName: QUEUE_NAME,
        exchangeName: 'nest-template.events',
        exchangeType: 'topic',
        routingKey: 'post.*',
        prefetchCount: 5,
        queueOptions: {
          durable: true,
          deadLetterExchange: 'nest-template.dlx',
          deadLetterRoutingKey: 'posts.failed',
        },
      },
    );

    await this.startConsuming();
    this.logger.log('Post Consumer 시작');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.consumerChannel) {
      await this.rabbitMQConnection.removeConsumerChannel(
        this.consumerChannel,
      );
      this.logger.log('Post Consumer 종료');
    }
  }

  private async startConsuming(): Promise<void> {
    await this.consumerChannel.consume(
      QUEUE_NAME,
      async (msg: ConsumeMessage | null) => {
        if (!msg) return;

        try {
          const event = JSON.parse(
            msg.content.toString(),
          ) as PostCreatedEvent;
          this.logger.log(
            `메시지 수신: ${event.eventType} | ID: ${event.eventId}`,
          );

          await this.handlePostEvent(event);

          this.consumerChannel.ack(msg);
        } catch (error) {
          this.logger.error(
            `메시지 처리 실패: ${msg.properties.messageId}`,
            error instanceof Error ? error.stack : String(error),
          );
          // requeue: false — DLQ(nest-template.dlx)로 이동
          this.consumerChannel.nack(msg, false, false);
        }
      },
      { noAck: false }, // 수동 ACK 모드 (필수)
    );
  }

  private async handlePostEvent(event: PostCreatedEvent): Promise<void> {
    switch (event.eventType) {
      case EventType.POST_CREATED:
        await this.handlePostCreated(event.data);
        break;
      default:
        this.logger.warn(`처리되지 않은 이벤트 타입: ${event.eventType}`);
    }
  }

  private async handlePostCreated(
    data: PostCreatedEvent['data'],
  ): Promise<void> {
    // [CUSTOMIZE] 알림 발송, 검색 색인 갱신 등 실제 후속 처리를 여기에 구현
    this.logger.log(
      `게시글 생성 이벤트 처리: postId=${data.postId}, authorId=${data.authorId}`,
    );
  }
}
