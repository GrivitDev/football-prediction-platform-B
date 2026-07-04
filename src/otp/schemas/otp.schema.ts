import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { HydratedDocument } from 'mongoose';

export type OtpDocument = HydratedDocument<Otp>;

@Schema({
  timestamps: true,
})
export class Otp {
  @Prop({
    required: true,
    lowercase: true,
  })
  email!: string;

  @Prop({
    required: true,
  })
  code!: string;

  @Prop({
    default: Date.now,
    expires: 300,
  })
  createdAt!: Date;
}

export const OtpSchema = SchemaFactory.createForClass(Otp);
