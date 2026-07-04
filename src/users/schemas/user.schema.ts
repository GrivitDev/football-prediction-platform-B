import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

export enum UserStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DELETED = 'deleted',
}

@Schema({
  timestamps: true,
})
export class User {
  // ======================
  // BASIC INFO
  // ======================
  @Prop({ required: true, trim: true })
  fullName!: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  username!: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    index: true,
  })
  email!: string;

  @Prop({ default: '', index: true })
  phoneNumber!: string;

  @Prop({ required: true, select: false })
  password!: string;

  // ======================
  // ACCOUNT STATUS (NEW)
  // ======================
  @Prop({ enum: UserStatus, default: UserStatus.ACTIVE, index: true })
  status!: UserStatus;

  // ======================
  // VERIFICATION
  // ======================
  @Prop({ default: false })
  isVerified!: boolean;

  @Prop({
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
  })
  verificationExpiresAt!: Date;

  // ======================
  // ROLE
  // ======================
  @Prop({ enum: UserRole, default: UserRole.USER, index: true })
  role!: UserRole;

  // ======================
  // PASSWORD RESET
  // ======================
  @Prop()
  passwordResetToken?: string;

  @Prop()
  passwordResetExpires?: Date;

  // ======================
  // LOGIN TRACKING (NEW)
  // ======================
  @Prop()
  lastLoginAt?: Date;

  @Prop({ default: 0 })
  loginCount!: number;

  // ======================
  // BAN SYSTEM (NEW)
  // ======================
  @Prop()
  bannedUntil?: Date;

  @Prop()
  banReason?: string;

  @Prop()
  bannedBy?: string; // admin userId

  // ======================
  // SOFT DELETE (NEW)
  // ======================
  @Prop({ default: false })
  isDeleted!: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop()
  deletedBy?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
