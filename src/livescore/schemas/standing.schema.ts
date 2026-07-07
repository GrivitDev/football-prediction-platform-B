import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({
  timestamps: true,
})
export class Standing {
  @Prop({
    index: true,
  })
  leagueCode!: string;

  @Prop()
  position!: number;

  @Prop()
  teamId!: number;

  @Prop()
  team!: string;

  @Prop()
  shortName!: string;

  @Prop()
  crest!: string;

  @Prop()
  played!: number;

  @Prop()
  won!: number;

  @Prop()
  draw!: number;

  @Prop()
  lost!: number;

  @Prop()
  goalsFor!: number;

  @Prop()
  goalsAgainst!: number;

  @Prop()
  goalDifference!: number;

  @Prop()
  points!: number;

  @Prop()
  form!: string;
}

export const StandingSchema = SchemaFactory.createForClass(Standing);
