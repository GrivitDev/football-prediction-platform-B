import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({
  timestamps: true,
})
export class League {
  @Prop({
    unique: true,
    required: true,
  })
  code!: string;

  @Prop()
  name!: string;

  @Prop()
  country!: string;

  @Prop()
  emblem!: string;

  @Prop({
    default: true,
  })
  isActive!: boolean;

  @Prop({
    default: false,
  })
  isTracked!: boolean;

  @Prop({
    default: 99,
  })
  priority!: number;
}

export const LeagueSchema = SchemaFactory.createForClass(League);
