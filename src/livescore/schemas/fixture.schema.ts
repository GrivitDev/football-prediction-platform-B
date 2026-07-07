import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({
  timestamps: true,
})
export class Fixture {
  @Prop({
    unique: true,
    index: true,
  })
  fixtureId!: string;

  @Prop({
    index: true,
  })
  leagueCode!: string;

  @Prop()
  leagueName!: string;

  @Prop()
  homeTeam!: string;

  @Prop()
  awayTeam!: string;

  @Prop()
  homeTeamBadge!: string;

  @Prop()
  awayTeamBadge!: string;

  @Prop()
  date!: string;

  @Prop()
  time!: string;

  @Prop()
  kickoffTimestamp!: number;

  @Prop({
    default: 'SCHEDULED',
  })
  status!: string;

  @Prop({
    default: null,
  })
  homeScore!: number;

  @Prop({
    default: null,
  })
  awayScore!: number;

  @Prop()
  matchday!: number;
}

export const FixtureSchema = SchemaFactory.createForClass(Fixture);
