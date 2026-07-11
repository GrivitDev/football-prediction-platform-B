import { ExternalAdFrequency } from '../enums/external-ad-frequency.enum';

export class ExternalAdPolicyDto {
  enabled!: boolean;

  frequency!: ExternalAdFrequency;
}

export class AdPolicyResponseDto {
  external!: ExternalAdPolicyDto;
}
