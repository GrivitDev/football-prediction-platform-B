import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { AdPage } from '../enums/ad-page.enum';
import { AdPosition } from '../enums/ad-position.enum';
import { AdTrigger } from '../enums/ad-trigger.enum';
import { AdDevice } from '../enums/ad-device.enum';

@Schema({
  _id: false,
})
export class AdDisplay {
  @Prop({
    required: true,
    enum: AdPage,
  })
  page!: AdPage;

  @Prop({
    required: true,
    enum: AdPosition,
  })
  position!: AdPosition;

  @Prop({
    required: true,
    enum: AdTrigger,
  })
  trigger!: AdTrigger;

  @Prop({
    required: true,
    enum: AdDevice,
    default: AdDevice.ALL,
  })
  device!: AdDevice;

  @Prop({
    default: false,
  })
  fixed!: boolean;

  @Prop({
    default: 1,
    min: 1,
  })
  displayOrder!: number;
}

export const AdDisplaySchema = SchemaFactory.createForClass(AdDisplay);
