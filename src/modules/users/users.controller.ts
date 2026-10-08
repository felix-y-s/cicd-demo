import { Controller, Delete, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { plainToInstance } from 'class-transformer';
import {
  ApiDeleteResponses,
  ApiGetResponses,
} from '../../common/swagger/index.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { UserResponseDto } from './dto/user-response.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '내 정보 조회' })
  @ApiGetResponses(UserResponseDto, '내 정보 조회 성공')
  @Throttle({ long: {} })
  @Get('me')
  async findMe(
    @CurrentUser('userId') userId: string,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.findMe(userId);
    return plainToInstance(UserResponseDto, user);
  }

  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '회원 탈퇴',
    description: '계정을 비활성화합니다(soft delete). 이후 로그인할 수 없습니다.',
  })
  @ApiDeleteResponses('회원 탈퇴 성공')
  @Throttle({ medium: {} })
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async withdraw(@CurrentUser('userId') userId: string): Promise<void> {
    await this.usersService.withdraw(userId);
  }
}
