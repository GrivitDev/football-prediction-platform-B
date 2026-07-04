import { IsMongoId, IsNotEmpty } from 'class-validator';

export class InitializePurchaseDto {
  @IsMongoId()
  @IsNotEmpty()
  predictionId!: string;
}
