/** 이벤트 라우팅 키 - RabbitMQ routing key와 1:1 매핑 */
export enum EventType {
  // 게시글 도메인 (post.*)
  POST_CREATED = 'post.created',
}

/** 모든 이벤트의 베이스 인터페이스 */
export interface BaseEvent {
  /** 이벤트 고유 ID (uuidv4) */
  eventId: string;
  /** 이벤트 타입 (routing key) */
  eventType: EventType;
  /** 이벤트 발생 시각 */
  timestamp: Date;
  /** 이벤트 발생 주체 사용자 ID */
  userId?: string;
  /** 추가 메타데이터 */
  metadata?: Record<string, unknown>;
}

/** 게시글 생성 이벤트 */
export interface PostCreatedEvent extends BaseEvent {
  eventType: EventType.POST_CREATED;
  data: {
    postId: string;
    authorId: string;
    title: string;
  };
}
