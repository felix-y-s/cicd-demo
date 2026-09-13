import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';
import { Public } from './modules/auth/decorators/public.decorator.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // 헬스체크/루트 확인용 — 인증 없이 접근 가능해야 한다
  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
