// src/articles/dto/check-grammar.dto.ts

import { IsString, MinLength } from 'class-validator';

export class CheckGrammarDto {
  @IsString()
  @MinLength(1)
  content!: string;

  @IsString()
  @MinLength(1)
  language!: string;
}
