import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

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
    required: true,
    index: true,
  })
  userId!: string;

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
