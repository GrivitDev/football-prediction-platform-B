import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserSessionDocument = HydratedDocument<UserSession>;

@Schema({
  timestamps: true,
})
export class UserSession {
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  userId!: Types.ObjectId;

  @Prop()
  ipAddress!: string;

  @Prop()
  userAgent!: string;

  @Prop()
  device?: string;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({
    default: Date.now,
  })
  lastActiveAt!: Date;

  @Prop({
    required: true,
    index: true,
  })
  expiresAt!: Date;

  createdAt!: Date;

  updatedAt!: Date;
}

export const UserSessionSchema = SchemaFactory.createForClass(UserSession);
UserSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
