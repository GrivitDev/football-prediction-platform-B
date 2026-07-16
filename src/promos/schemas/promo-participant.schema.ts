import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';

export type PromoParticipantDocument = HydratedDocument<PromoParticipant>;

@Schema({
  timestamps: true,
})
export class PromoParticipant {
  @Prop({
    required: true,
    index: true,
  })
  promoId!: string;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId!: mongoose.Types.ObjectId;

  @Prop({
    default: Date.now,
  })
  joinedAt!: Date;
}

export const PromoParticipantSchema =
  SchemaFactory.createForClass(PromoParticipant);

PromoParticipantSchema.index(
  {
    promoId: 1,

    userId: 1,
  },
  {
    unique: true,
  },
);
