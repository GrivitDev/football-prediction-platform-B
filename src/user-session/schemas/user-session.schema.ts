import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserSessionDocument = HydratedDocument<UserSession>;

@Schema({
  timestamps: true,
})
export class UserSession {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    index: true,
    required: true,
  })
  userId!: Types.ObjectId;

  @Prop({
    required: true,
  })
  ipAddress!: string;

  @Prop({
    required: true,
  })
  userAgent!: string;

  @Prop({
    default: 'Unknown Device',
  })
  device!: string;

  @Prop({
    type: Object,
    default: undefined,
  })
  location?: {
    country?: string;

    countryCode?: string;

    region?: string;

    city?: string;

    timezone?: string;

    isp?: string;

    organization?: string;

    latitude?: number;

    longitude?: number;
  };

  @Prop({
    default: true,
    index: true,
  })
  isActive!: boolean;

  @Prop({
    default: Date.now,
  })
  lastActiveAt!: Date;

  @Prop({
    required: true,
  })
  expiresAt!: Date;

  createdAt!: Date;

  updatedAt!: Date;
}

export const UserSessionSchema = SchemaFactory.createForClass(UserSession);

UserSessionSchema.index({
  userId: 1,
  isActive: 1,
});

UserSessionSchema.index(
  {
    expiresAt: 1,
  },
  {
    expireAfterSeconds: 0,
  },
);
