import { Module, Global } from '@nestjs/common';
import { RabbitMQConnectionService } from './rabbitmq-connection.service.js';

@Global()
@Module({
  providers: [RabbitMQConnectionService],
  exports: [RabbitMQConnectionService],
})
export class RabbitMQModule {}
