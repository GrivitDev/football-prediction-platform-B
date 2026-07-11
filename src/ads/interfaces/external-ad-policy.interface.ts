import { ExternalAdFrequency } from '../enums/external-ad-frequency.enum';

export interface ExternalAdPolicy {
  enabled: boolean;
  frequency: ExternalAdFrequency;
}

export interface AdPolicyResponse {
  external: ExternalAdPolicy;
}
