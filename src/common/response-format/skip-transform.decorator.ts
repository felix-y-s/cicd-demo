import { SetMetadata } from '@nestjs/common';

export const SKIP_TRANSFORM_KEY = 'skipTransform';

/**
 * 이 데코레이터가 붙은 핸들러의 응답은 TransformInterceptor가 래핑하지 않는다.
 * 파일 다운로드, 스트리밍 등 원시 응답이 필요한 엔드포인트에 사용한다.
 *
 * @example
 * ```typescript
 * @SkipTransform()
 * @Get(':id/avatar')
 * async downloadAvatar(@Param('id') id: string, @Res() res: Response) {
 *   res.download(filePath); // { success, data, ... }로 감싸지 않고 그대로 응답
 * }
 * ```
 */
export const SkipTransform = () => SetMetadata(SKIP_TRANSFORM_KEY, true);
