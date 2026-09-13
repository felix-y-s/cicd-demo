import { SetMetadata } from '@nestjs/common';

// JwtAuthGuard가 이 메타데이터를 읽어 인증을 건너뜁니다
export const Public = () => SetMetadata('isPublic', true);
