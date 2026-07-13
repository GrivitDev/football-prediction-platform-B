import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({
  _id: false,
})
export class AdAction {
  @Prop({
    required: true,
    trim: true,
  })
  label!: string;

  @Prop({
    required: true,
    trim: true,
  })
  url!: string;
}

export const AdActionSchema = SchemaFactory.createForClass(AdAction);
