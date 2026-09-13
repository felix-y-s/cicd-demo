import Joi from 'joi';

/**
 * 환경 변수 유효성 검사 스키마
 * - 필수 환경 변수 체크 (.required())
 * - 타입 및 형식 검증
 * - 기본값 제공 (.default())
 */
export const validationSchema = Joi.object({
  // 애플리케이션
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  API_PREFIX: Joi.string().default('api'),
  CORS_ORIGIN: Joi.string().optional(),

  // PostgreSQL (Prisma)
  DATABASE_URL: Joi.string().uri().required(),

  // MongoDB
  MONGODB_URI: Joi.string().uri({ scheme: ['mongodb', 'mongodb+srv'] }).required(),

  // Redis
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().optional(),

  // RabbitMQ
  RABBITMQ_URL: Joi.string().uri({ scheme: ['amqp', 'amqps'] }).required(),
  RABBITMQ_CHANNEL_POOL_SIZE: Joi.number().default(5),

  // JWT
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  // 보안
  BCRYPT_SALT_ROUNDS: Joi.number().default(10),

  // 로깅
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug', 'verbose')
    .default('debug'),
  LOG_DIR: Joi.string().default('logs'),
  LOG_MAX_FILES: Joi.string().default('30d'),
  LOG_MAX_SIZE: Joi.string().default('20m'),

  // Swagger
  SWAGGER_ENABLED: Joi.boolean().default(true),
  SWAGGER_PATH: Joi.string().default('api-docs'),

  // Rate Limiting
  THROTTLE_SHORT_TTL: Joi.number().default(1000),
  THROTTLE_SHORT_LIMIT: Joi.number().default(3),
  THROTTLE_MEDIUM_TTL: Joi.number().default(10000),
  THROTTLE_MEDIUM_LIMIT: Joi.number().default(20),
  THROTTLE_LONG_TTL: Joi.number().default(60000),
  THROTTLE_LONG_LIMIT: Joi.number().default(100),
});
