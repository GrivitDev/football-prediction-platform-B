import { IsBoolean, IsEnum, IsInt, Min } from 'class-validator';

import { AdDevice } from '../enums/ad-device.enum';
import { AdPage } from '../enums/ad-page.enum';
import { AdPosition } from '../enums/ad-position.enum';
import { AdTrigger } from '../enums/ad-trigger.enum';

export class CreateAdDisplayDto {
  @IsEnum(AdPage)
  page!: AdPage;

  @IsEnum(AdPosition)
  position!: AdPosition;

  @IsEnum(AdTrigger)
  trigger!: AdTrigger;

  @IsEnum(AdDevice)
  device: AdDevice = AdDevice.ALL;

  @IsBoolean()
  fixed: boolean = false;

  @IsInt()
  @Min(1)
  displayOrder: number = 1;
}
