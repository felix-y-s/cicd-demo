import type { Options } from 'amqplib';

/** Consumer 채널 생성 옵션 */
export interface ConsumerChannelOptions {
  /** 소비할 Queue 이름 (예: nest-template.posts.process) */
  queueName: string;
  /** 바인딩할 Exchange 이름 (기본값: nest-template.events) */
  exchangeName?: string;
  /** Exchange 타입 (기본값: topic) */
  exchangeType?: 'topic' | 'direct' | 'fanout' | 'headers';
  /** Routing Key 패턴 (예: post.*) */
  routingKey?: string;
  /** 동시 처리 메시지 수 (기본값: 5) */
  prefetchCount?: number;
  /** Queue 옵션 */
  queueOptions?: Options.AssertQueue & {
    /** 우선순위 큐 최대 값 (0-10) */
    maxPriority?: number;
  };
}
