import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqp-connection-manager';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';
import type { ConsumerChannelOptions } from './types/channel.types.js';

const EXCHANGE_EVENTS = 'nest-template.events';
const EXCHANGE_COMMANDS = 'nest-template.commands';
const EXCHANGE_DLX = 'nest-template.dlx';

@Injectable()
export class RabbitMQConnectionService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RabbitMQConnectionService.name);

  /** amqp-connection-manager 연결 인스턴스 */
  private connection!: amqp.AmqpConnectionManager;

  /** 송신 전용 채널 풀 (빌림 → 사용 → 반환) */
  private publisherChannelPool: ChannelWrapper[] = [];

  /** 현재 사용 중인 송신 채널 추적 Set */
  private publisherChannelsInUse: Set<ChannelWrapper> = new Set();

  /** 수신 전용 채널 추적 Set (Consumer가 직접 관리) */
  private consumerChannels: Set<ChannelWrapper> = new Set();

  /** 송신 채널 풀 크기 */
  private readonly POOL_SIZE = 5;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  /**
   * RabbitMQ 연결 및 초기화
   * - 공통 Exchange만 생성 (Queue/Binding은 각 Consumer가 담당)
   * - 송신 채널 풀 생성
   */
  private async connect(): Promise<void> {
    const url = this.configService.get<string>('rabbitmq.url');
    this.logger.log(`RabbitMQ 연결 시작: ${url}`);

    // 자동 재연결 설정
    this.connection = amqp.connect([url as string], {
      heartbeatIntervalInSeconds: 30,
      reconnectTimeInSeconds: 1,
    });

    this.connection.on('connect', () => this.logger.log('RabbitMQ 연결 성공'));
    this.connection.on('disconnect', (err) =>
      this.logger.error('RabbitMQ 연결 끊김', err?.err),
    );

    // 공통 Exchange 생성용 초기 채널
    const setupChannel = this.connection.createChannel({
      json: false,
      setup: async (channel: ConfirmChannel) => {
        await this.setupCommonExchanges(channel);
      },
    });

    await setupChannel.waitForConnect();
    await setupChannel.close();

    // 송신 채널 풀 생성
    await this.createPublisherChannelPool();
    this.logger.log('RabbitMQ 초기화 완료');
  }

  /**
   * 공통 Exchange 설정
   * Queue/Binding은 각 Consumer가 자율적으로 설정
   */
  private async setupCommonExchanges(channel: ConfirmChannel): Promise<void> {
    // 이벤트 Exchange (Topic): post.*, user.* 등 패턴 라우팅
    await channel.assertExchange(EXCHANGE_EVENTS, 'topic', { durable: true });

    // 커맨드 Exchange (Direct): 특정 큐에 직접 전달
    await channel.assertExchange(EXCHANGE_COMMANDS, 'direct', {
      durable: true,
    });

    // Dead Letter Exchange: 처리 실패 메시지 수집
    await channel.assertExchange(EXCHANGE_DLX, 'topic', { durable: true });

    this.logger.log('공통 Exchange 설정 완료');
  }

  /**
   * 송신 채널 풀 생성
   * Publisher는 채널을 빌리고 즉시 반환 (단기 실행)
   */
  private async createPublisherChannelPool(): Promise<void> {
    const poolCreations = Array.from({ length: this.POOL_SIZE }, () =>
      this.connection.createChannel({ json: false }),
    );
    this.publisherChannelPool = await Promise.all(poolCreations);
    this.logger.log(`송신 채널 풀 생성 완료 (${this.POOL_SIZE}개)`);
  }

  /**
   * 송신 채널 빌리기
   * 사용 후 반드시 releasePublisherChannel() 호출
   */
  async getPublisherChannel(): Promise<ChannelWrapper> {
    const available = this.publisherChannelPool.find(
      (ch) => !this.publisherChannelsInUse.has(ch),
    );

    if (!available) {
      // 풀이 소진된 경우 새 채널 생성 (임시)
      const extra = this.connection.createChannel({ json: false });
      this.publisherChannelsInUse.add(extra);
      return extra;
    }

    this.publisherChannelsInUse.add(available);
    return available;
  }

  /**
   * 송신 채널 반환
   * @param channel getPublisherChannel()로 빌린 채널
   */
  releasePublisherChannel(channel: ChannelWrapper): void {
    this.publisherChannelsInUse.delete(channel);
  }

  /**
   * Consumer 전용 채널 생성
   * - Consumer가 자율적으로 Queue/Exchange/Binding을 설정
   * - 생성된 채널은 자동으로 추적됨
   */
  async createConsumerChannel(
    options: ConsumerChannelOptions,
  ): Promise<ChannelWrapper> {
    const {
      queueName,
      exchangeName = EXCHANGE_EVENTS,
      exchangeType = 'topic',
      routingKey,
      prefetchCount = 5,
      queueOptions = {},
    } = options;

    const channel = this.connection.createChannel({
      json: false,
      setup: async (ch: ConfirmChannel) => {
        // prefetch 설정 (동시 처리 제한)
        await ch.prefetch(prefetchCount);

        // Exchange 확인/생성 (멱등성)
        await ch.assertExchange(exchangeName, exchangeType, {
          durable: true,
        });

        // Queue 생성
        const { maxPriority, ...restQueueOptions } = queueOptions;
        await ch.assertQueue(queueName, {
          durable: true,
          ...restQueueOptions,
          ...(maxPriority ? { maxPriority } : {}),
        });

        // Routing Key가 있으면 바인딩
        if (routingKey) {
          await ch.bindQueue(queueName, exchangeName, routingKey);
        }

        this.logger.log(
          `Consumer 채널 설정 완료: ${queueName} (routingKey: ${routingKey})`,
        );
      },
    });

    await channel.waitForConnect();

    // 수신 채널 추적
    this.consumerChannels.add(channel);
    return channel;
  }

  /**
   * Consumer 채널 제거 및 종료
   * @param channel onModuleDestroy()에서 호출
   */
  async removeConsumerChannel(channel: ChannelWrapper): Promise<void> {
    this.consumerChannels.delete(channel);
    await channel.close();
  }

  /**
   * 연결 종료 (순서: Consumer → Publisher → 연결)
   */
  private async disconnect(): Promise<void> {
    this.logger.log('RabbitMQ 연결 종료 중...');

    await Promise.all(
      Array.from(this.consumerChannels).map((ch) =>
        ch.close().catch(() => {}),
      ),
    );

    await Promise.all(
      this.publisherChannelPool.map((ch) => ch.close().catch(() => {})),
    );

    if (this.connection) {
      await this.connection.close();
    }

    this.logger.log('RabbitMQ 연결 종료 완료');
  }

  /** 연결 상태 확인 (헬스체크용) */
  isConnected(): boolean {
    return this.connection?.isConnected() ?? false;
  }

  /** 채널 현황 통계 조회 (모니터링용) */
  getChannelStats() {
    return {
      publisherChannels: {
        total: this.publisherChannelPool.length,
        inUse: this.publisherChannelsInUse.size,
        available:
          this.publisherChannelPool.length - this.publisherChannelsInUse.size,
      },
      consumerChannels: {
        total: this.consumerChannels.size,
      },
    };
  }
}
