import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { CommunityPostType } from '../enums/community-post-type.enum';

import { CommunityMediaType } from '../enums/community-media-type.enum';

export class UpdatePostDto {
  @IsOptional()
  @IsEnum(CommunityPostType)
  type?: CommunityPostType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsObject()
  media?: {
    type: CommunityMediaType;

    url: string;

    publicId: string;
  };
}
