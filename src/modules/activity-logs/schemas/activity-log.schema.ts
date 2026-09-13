import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

/**
 * ActivityLog 스키마
 * - 사용자의 행동(로그인, 게시글 생성 등)을 비정형 메타데이터와 함께 기록한다.
 * - timestamps: true → createdAt, updatedAt 자동 생성
 */
@Schema({ collection: 'activity_logs', timestamps: true })
export class ActivityLog extends Document {
  @Prop({ required: true })
  userId!: string;

  /** 예: 'post.created', 'user.login' */
  @Prop({ required: true })
  action!: string;

  /** 행동별로 형태가 달라지는 임의 메타데이터 (예: { postId, title }) */
  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata?: Record<string, unknown>;

  // timestamps: true 로 자동 생성되는 필드 (선언은 타입을 위해 필요)
  createdAt!: Date;
  updatedAt!: Date;
}

export const ActivityLogSchema = SchemaFactory.createForClass(ActivityLog);

// 복합 인덱스 — ESR 규칙: userId(Equality) → createdAt(Sort, 최신순 조회 대비)
ActivityLogSchema.index({ userId: 1, createdAt: -1 });
