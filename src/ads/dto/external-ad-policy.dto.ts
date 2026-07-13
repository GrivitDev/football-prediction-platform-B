import { ExternalAdFrequency } from '../enums/external-ad-frequency.enum';

export class ExternalAdPolicyDto {
  enabled: boolean = true;

  frequency: ExternalAdFrequency = ExternalAdFrequency.NORMAL;

  aggressive: boolean = true;

  // Seconds before external ads may refresh (0 = never)
  refreshInterval: number = 60;

  allowPopup: boolean = true;

  allowInterstitial: boolean = true;

  allowRewarded: boolean = true;
}
