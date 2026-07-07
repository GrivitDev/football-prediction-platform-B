export const LEAGUE_NAMES: Record<string, string> = {
  // =========================
  // ENGLAND
  // =========================
  PL: 'Premier League',
  ELC: 'EFL Championship',

  // =========================
  // SPAIN
  // =========================
  PD: 'La Liga',

  // =========================
  // GERMANY
  // =========================
  BL1: 'Bundesliga',

  // =========================
  // ITALY
  // =========================
  SA: 'Serie A',

  // =========================
  // FRANCE
  // =========================
  FL1: 'Ligue 1',

  // =========================
  // NETHERLANDS
  // =========================
  DED: 'Eredivisie',

  // =========================
  // PORTUGAL
  // =========================
  PPL: 'Primeira Liga',

  // =========================
  // BELGIUM
  // =========================
  BSA: 'Belgian Pro League',

  // =========================
  // SCOTLAND
  // =========================
  SPL: 'Scottish Premiership',

  // =========================
  // TURKEY
  // =========================
  TSL: 'Turkish Super Lig',

  // =========================
  // SAUDI ARABIA
  // =========================
  SPLSA: 'Saudi Pro League',

  // =========================
  // USA
  // =========================
  MLS: 'Major League Soccer',

  // =========================
  // MEXICO
  // =========================
  LMX: 'Liga MX',

  // =========================
  // SOUTH AMERICA
  // =========================
  BSAA: 'Brazil Serie A',
  LPF: 'Argentina Primera Division',

  // =========================
  // ASIA
  // =========================
  J1: 'Japan J1 League',
  KL1: 'South Korea K League 1',
  AL: 'Australia A-League',

  // =========================
  // AFRICA
  // =========================
  NPFL: 'Nigeria Premier Football League',
  PSL: 'South Africa Premier Division',
  EPLEG: 'Egyptian Premier League',
  BOTOLA: 'Morocco Botola Pro',

  // =========================
  // EUROPE COMPETITIONS
  // =========================
  CL: 'UEFA Champions League',
  EL: 'UEFA Europa League',
  ECL: 'UEFA Europa Conference League',

  // =========================
  // AFRICA CLUB COMPETITIONS
  // =========================
  CAFCL: 'CAF Champions League',
};

export const getLeagueName = (code?: string): string => {
  if (!code) return '-';

  return LEAGUE_NAMES[code] ?? code;
};
