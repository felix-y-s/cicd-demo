import { Module } from '@nestjs/common';
import { UsersRepository } from './repositories/users.repository.js';
import { UsersService } from './users.service.js';

/**
 * Users 모듈
 * - UsersService를 export해 AuthModule에서 주입받아 사용한다.
 */
@Module({
  providers: [UsersRepository, UsersService],
  exports: [UsersRepository, UsersService],
})
export class UsersModule {}
