// ============================================================
// LEAGUE / COMPETITION
// ============================================================

export interface League {
  code: string;

  name: string;

  country: string;

  type?: 'LEAGUE' | 'CUP' | 'PLAYOFFS' | 'LEAGUE_CUP' | string;

  emblem?: string;
}
