import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import configuration from '../config/configuration.js';
import { RabbitMQModule } from './rabbitmq.module.js';
import { RabbitMQConnectionService } from './rabbitmq-connection.service.js';

describe('RabbitMQConnectionService 연결 테스트', () => {
  let module: TestingModule;
  let connectionService: RabbitMQConnectionService;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        RabbitMQModule,
      ],
    }).compile();

    await module.init();
    connectionService = module.get<RabbitMQConnectionService>(
      RabbitMQConnectionService,
    );
  });

  afterAll(async () => {
    await module.close();
  });

  it('서버에 연결할 수 있다', () => {
    expect(connectionService.isConnected()).toBe(true);
  });

  it('송신 채널 풀이 초기 크기로 생성된다', () => {
    const stats = connectionService.getChannelStats();
    expect(stats.publisherChannels.total).toBe(5);
    expect(stats.publisherChannels.inUse).toBe(0);
  });

  it('채널을 빌리고 반환하면 사용 중 개수가 원래대로 돌아온다', async () => {
    const channel = await connectionService.getPublisherChannel();
    expect(connectionService.getChannelStats().publisherChannels.inUse).toBe(
      1,
    );

    connectionService.releasePublisherChannel(channel);
    expect(connectionService.getChannelStats().publisherChannels.inUse).toBe(
      0,
    );
  });
});
