import { IsNotEmpty, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateAdActionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  label!: string;

  @IsString()
  @IsNotEmpty()
  @IsUrl({
    require_tld: false,
  })
  @MaxLength(500)
  url!: string;
}
