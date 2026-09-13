import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import configuration from '../config/configuration.js';
import { RabbitMQModule } from './rabbitmq.module.js';
import { RabbitMQConnectionService } from './rabbitmq-connection.service.js';

describe('RabbitMQConnectionService 연결 테스트', () => {
  let module: TestingModule;
  let connectionService: RabbitMQConnectionService;

  // amqp-connection-manager는 module.close() 이후에도 채널 종료 처리(pending
  // command 정리)가 비동기로 뒤늦게 완료될 수 있고, 이때 발생하는
  // "Channel ended, no reply will be forthcoming" reject는 close() 호출의
  // 반환값과 무관한 별도 이벤트로 발생해 catch로 잡히지 않는다.
  // CI처럼 CPU가 제한된 환경에서는 이 타이밍이 벌어져 vitest가 unhandled
  // rejection으로 잡아 테스트 전체를 실패 처리하는 사례가 있었다
  // (로컬에서는 재현되지 않음). 해당 파일에서 발생하는 이 특정 에러만
  // 무시하도록 방어한다 — 테스트 자체(assert)는 모두 통과한 뒤의 cleanup
  // 단계에서만 발생하므로 실제 검증 결과에는 영향이 없다.
  const ignoreLateChannelCloseRejection = (reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    if (message.includes('Channel ended')) {
      return;
    }
    throw reason;
  };

  beforeAll(async () => {
    process.on('unhandledRejection', ignoreLateChannelCloseRejection);

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
    // close() 이후 뒤늦게 도착하는 reject를 흘려보낼 시간을 준다.
    await new Promise((resolve) => setTimeout(resolve, 100));
    process.off('unhandledRejection', ignoreLateChannelCloseRejection);
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
