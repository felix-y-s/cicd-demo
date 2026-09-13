import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import configuration from '../../config/configuration.js';
import { MongodbModule } from './mongodb.module.js';
import { MongodbService } from './mongodb.service.js';

describe('MongodbService 연결 테스트', () => {
  let mongodbService: MongodbService;
  let connection: Connection;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        MongodbModule,
      ],
    }).compile();

    mongodbService = module.get<MongodbService>(MongodbService);
    connection = module.get<Connection>(getConnectionToken());
  });

  afterAll(async () => {
    await connection.close();
  });

  it('DB에 연결할 수 있다', async () => {
    expect(connection.readyState).toBe(1); // 1: connected
  });

  it('isConnected()는 연결이 정상이면 true를 반환한다', async () => {
    const connected = await mongodbService.isConnected();
    expect(connected).toBe(true);
  });
});
