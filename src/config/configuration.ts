/**
 * 애플리케이션 설정 파일
 * - 환경 변수를 구조화된 객체로 변환
 * - 타입 안정성 제공
 *
 * 사용예:
 * ```typescript
 * // ConfigModule을 앱에 등록
 * ConfigModule.forRoot({
 *   isGlobal: true,
 *   load: [configuration],
 * })
 *
 * // ConfigService로 설정값 주입받아 사용
 * constructor(private configService: ConfigService) {}
 *
 * // 설정값 접근
 * const port = this.configService.get<number>('app.port');
 * const dbUrl = this.configService.get<string>('database.postgres.url');
 * ```
 */
export default () => ({
  // 애플리케이션 기본 설정
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    apiPrefix: process.env.API_PREFIX || 'api',
    corsOrigin: process.env.CORS_ORIGIN?.split(',') || [
      'http://localhost:3000',
    ],
  },

  // 데이터베이스 설정
  database: {
    postgres: {
      url: process.env.DATABASE_URL,
    },
    mongodb: {
      uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/nest_template',
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
    },
  },

  // RabbitMQ 설정
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://nest:nest@localhost:5672',
    channelPoolSize: parseInt(
      process.env.RABBITMQ_CHANNEL_POOL_SIZE || '5',
      10,
    ),
  },

  // JWT 인증 설정
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  // 보안 설정
  security: {
    bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10),
  },

  // 로깅 설정
  logging: {
    level: process.env.LOG_LEVEL || 'debug',
    dir: process.env.LOG_DIR || 'logs',
    maxFiles: process.env.LOG_MAX_FILES || '30d',
    maxSize: process.env.LOG_MAX_SIZE || '20m',
  },

  // Swagger 설정
  swagger: {
    enabled: process.env.SWAGGER_ENABLED !== 'false',
    path: process.env.SWAGGER_PATH || 'api-docs',
  },

  // Rate Limiting(Throttler) 설정
  throttle: {
    shortTtl: parseInt(process.env.THROTTLE_SHORT_TTL || '1000', 10),
    shortLimit: parseInt(process.env.THROTTLE_SHORT_LIMIT || '3', 10),
    mediumTtl: parseInt(process.env.THROTTLE_MEDIUM_TTL || '10000', 10),
    mediumLimit: parseInt(process.env.THROTTLE_MEDIUM_LIMIT || '20', 10),
    longTtl: parseInt(process.env.THROTTLE_LONG_TTL || '60000', 10),
    longLimit: parseInt(process.env.THROTTLE_LONG_LIMIT || '100', 10),
  },
});
