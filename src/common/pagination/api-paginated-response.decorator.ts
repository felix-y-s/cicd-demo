import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { PaginationMetaDto } from './response.dto.js';

/**
 * Swagger용 오프셋 페이지네이션 응답 데코레이터
 *
 * TypeScript 제네릭은 런타임에 타입 정보가 소실되므로,
 * Swagger가 items 배열의 타입을 인식하려면 이 데코레이터로 명시해야 한다.
 *
 * @example
 * @Get()
 * @ApiPaginatedResponse(PostResponseDto, '게시글 목록 조회 성공')
 * async getPosts(@Query() dto: PaginationDto) { ... }
 */
export const ApiPaginatedResponse = <TModel extends Type<unknown>>(
  model: TModel,
  description?: string,
) => {
  return applyDecorators(
    ApiExtraModels(model, PaginationMetaDto),
    ApiOkResponse({
      description: description || '페이지네이션된 데이터 조회 성공',
      schema: {
        allOf: [
          {
            properties: {
              items: {
                type: 'array',
                items: { $ref: getSchemaPath(model) },
                description: '데이터 배열',
              },
              meta: {
                $ref: getSchemaPath(PaginationMetaDto),
                description: '페이지네이션 메타데이터',
              },
            },
          },
        ],
      },
    }),
  );
};

/**
 * Swagger용 커서 페이지네이션 응답 데코레이터
 */
export const ApiCursorPaginatedResponse = <TModel extends Type<unknown>>(
  model: TModel,
  description?: string,
) => {
  return applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      description: description || '커서 페이지네이션된 데이터 조회 성공',
      schema: {
        allOf: [
          {
            properties: {
              items: {
                type: 'array',
                items: { $ref: getSchemaPath(model) },
                description: '데이터 배열',
              },
              nextCursor: {
                type: 'string',
                nullable: true,
                example: '123',
                description: '다음 커서 (없으면 null)',
              },
              hasNextPage: {
                type: 'boolean',
                example: true,
                description: '다음 페이지 존재 여부',
              },
            },
          },
        ],
      },
    }),
  );
};
