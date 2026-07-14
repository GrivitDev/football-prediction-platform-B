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
    default: false,
  })
  completed!: boolean;
}

export const PromoParticipantSchema =
  SchemaFactory.createForClass(PromoParticipant);
