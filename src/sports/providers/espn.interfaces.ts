// ============================================================
// ESPN API RESPONSE
// ============================================================

export interface EspnApiResponse<T = unknown> {
  count?: number;
  pageIndex?: number;
  pageSize?: number;
  pageCount?: number;

  items?: EspnReferenceItem[];

  leagues?: EspnLeague[];

  events?: EspnEvent[];

  season?: EspnSeason;

  day?: EspnDay;

  [key: string]: unknown;
}

// ============================================================
// ESPN REFERENCE
// ============================================================

export interface EspnReferenceItem {
  $ref?: string;

  [key: string]: unknown;
}

// ============================================================
// ESPN LEAGUE
// ============================================================

export interface EspnLeague {
  id?: string;

  uid?: string;

  name?: string;

  abbreviation?: string;

  shortName?: string;

  displayName?: string;

  slug?: string;

  country?: {
    id?: string;
    name?: string;
    abbreviation?: string;
    slug?: string;

    [key: string]: unknown;
  };

  type?: {
    id?: string;
    name?: string;
    abbreviation?: string;
    slug?: string;

    [key: string]: unknown;
  };

  /**
   * Current season returned by the ESPN league-detail endpoint.
   */
  season?: EspnSeason;

  /**
   * Some ESPN responses may expose multiple seasons.
   */
  seasons?: EspnSeason[];

  logos?: EspnLogo[];

  links?: EspnLink[];

  $ref?: string;

  [key: string]: unknown;
}

// ============================================================
// ESPN SEASON
// ============================================================

export interface EspnSeason {
  year?: number;

  displayName?: string;

  startDate?: string;

  endDate?: string;

  slug?: string;

  type?: EspnSeasonType;

  [key: string]: unknown;
}

// ============================================================
// ESPN SEASON TYPE
// ============================================================

export interface EspnSeasonType {
  id?: string;

  type?: string;

  name?: string;

  abbreviation?: string;

  startDate?: string;

  endDate?: string;

  slug?: string;

  [key: string]: unknown;
}

// ============================================================
// ESPN DAY
// ============================================================

export interface EspnDay {
  date?: string;

  number?: number;

  [key: string]: unknown;
}

// ============================================================
// ESPN LOGO
// ============================================================

export interface EspnLogo {
  href?: string;

  width?: number;

  height?: number;

  alt?: string;

  rel?: string[];

  lastUpdated?: string;

  [key: string]: unknown;
}

// ============================================================
// ESPN LINK
// ============================================================

export interface EspnLink {
  href?: string;

  text?: string;

  shortText?: string;

  rel?: string[];

  isExternal?: boolean;

  isPremium?: boolean;

  isAffiliate?: boolean;

  [key: string]: unknown;
}

// ============================================================
// ESPN EVENT
// ============================================================

export interface EspnEvent {
  id: string;

  uid?: string;

  date?: string;

  name?: string;

  shortName?: string;

  timeValid?: boolean;

  season?: EspnSeason;

  seasonType?: EspnSeasonType;

  competitions?: EspnCompetition[];

  links?: EspnLink[];

  league?: EspnLeague;

  [key: string]: unknown;
}

// ============================================================
// ESPN COMPETITION
// ============================================================

export interface EspnCompetition {
  id: string;

  uid?: string;

  date?: string;

  startDate?: string;

  attendance?: number;

  timeValid?: boolean;

  recent?: boolean;

  status?: EspnCompetitionStatus;

  venue?: EspnVenue;

  format?: EspnFormat;

  notes?: EspnNote[];

  broadcasts?: EspnBroadcast[];

  competitors?: EspnCompetitor[];

  details?: EspnEventDetail[];

  leaders?: EspnLeader[];

  odds?: EspnOdds[];

  links?: EspnLink[];

  [key: string]: unknown;
}

// ============================================================
// ESPN COMPETITION STATUS
// ============================================================

export interface EspnCompetitionStatus {
  clock?: number;

  displayClock?: string;

  period?: number;

  type?: EspnStatusType;

  [key: string]: unknown;
}

// ============================================================
// ESPN STATUS TYPE
// ============================================================

export interface EspnStatusType {
  id?: string;

  name?: string;

  state?: string;

  completed?: boolean;

  description?: string;

  detail?: string;

  shortDetail?: string;

  abbreviation?: string;

  [key: string]: unknown;
}

// ============================================================
// ESPN VENUE
// ============================================================

export interface EspnVenue {
  id?: string;

  fullName?: string;

  shortName?: string;

  address?: {
    city?: string;

    state?: string;

    country?: string;

    countryCode?: string;

    zipCode?: string;

    [key: string]: unknown;
  };

  capacity?: number;

  indoor?: boolean;

  grass?: boolean;

  images?: EspnImage[];

  [key: string]: unknown;
}

// ============================================================
// ESPN FORMAT
// ============================================================

export interface EspnFormat {
  regulation?: number;

  overtime?: boolean;

  periods?: number;

  clock?: number;

  [key: string]: unknown;
}

// ============================================================
// ESPN BROADCAST
// ============================================================

export interface EspnBroadcast {
  id?: string;

  market?: string;

  names?: string[];

  type?: {
    id?: string;

    shortName?: string;

    [key: string]: unknown;
  };

  media?: {
    shortName?: string;

    [key: string]: unknown;
  };

  [key: string]: unknown;
}

// ============================================================
// ESPN NOTE
// ============================================================

export interface EspnNote {
  headline?: string;

  type?: string;

  text?: string;

  [key: string]: unknown;
}

// ============================================================
// ESPN COMPETITOR
// ============================================================

export interface EspnCompetitor {
  id?: string;

  uid?: string;

  type?: string;

  order?: number;

  homeAway?: 'home' | 'away';

  winner?: boolean;

  form?: string;

  score?: string | number;

  records?: EspnTeamRecord[];

  team?: EspnTeam;

  statistics?: EspnTeamMatchStatistic[];

  [key: string]: unknown;
}

// ============================================================
// ESPN TEAM
// ============================================================

export interface EspnTeam {
  id?: string;

  uid?: string;

  slug?: string;

  abbreviation?: string;

  displayName?: string;

  shortDisplayName?: string;

  name?: string;

  nickname?: string;

  location?: string;

  color?: string;

  alternateColor?: string;

  logo?: string;

  logos?: EspnLogo[];

  isActive?: boolean;

  venue?: EspnTeamVenue;

  links?: EspnLink[];

  record?: EspnTeamRecord[];

  [key: string]: unknown;
}

// ============================================================
// ESPN TEAM VENUE
// ============================================================

export interface EspnTeamVenue {
  id?: string;

  fullName?: string;

  address?: {
    city?: string;

    state?: string;

    country?: string;

    [key: string]: unknown;
  };

  capacity?: number;

  indoor?: boolean;

  grass?: boolean;

  images?: EspnImage[];

  [key: string]: unknown;
}

// ============================================================
// ESPN TEAM RECORD
// ============================================================

export interface EspnTeamRecord {
  id?: string;

  name?: string;

  abbreviation?: string;

  type?: string;

  summary?: string;

  displayValue?: string;

  [key: string]: unknown;
}

// ============================================================
// ESPN TEAM MATCH STATISTICS
// ============================================================

export interface EspnTeamMatchStatistic {
  name?: string;

  displayName?: string;

  shortDisplayName?: string;

  description?: string;

  abbreviation?: string;

  value?: number;

  displayValue?: string;

  rank?: number;

  [key: string]: unknown;
}

// ============================================================
// ESPN MATCH DETAIL
// ============================================================

export interface EspnMatchDetail {
  id?: string;

  type?: string;

  text?: string;

  abbreviation?: string;

  clock?: EspnClock;

  team?: EspnTeam;

  athlete?: EspnAthlete;

  participants?: EspnAthlete[];

  scoreValue?: number;

  shootingPlayer?: EspnAthlete;

  assist?: EspnAthlete;

  [key: string]: unknown;
}

// ============================================================
// ESPN CLOCK
// ============================================================

export interface EspnClock {
  value?: number;

  displayValue?: string;

  [key: string]: unknown;
}

// ============================================================
// ESPN ATHLETE
// ============================================================

export interface EspnAthlete {
  id?: string;

  uid?: string;

  displayName?: string;

  shortName?: string;

  fullName?: string;

  jersey?: string;

  position?: {
    id?: string;

    name?: string;

    abbreviation?: string;

    [key: string]: unknown;
  };

  team?: EspnTeam;

  links?: EspnLink[];

  [key: string]: unknown;
}

// ============================================================
// ESPN EVENT DETAIL
// ============================================================

export interface EspnEventDetail {
  id?: string;

  text?: string;

  type?: string;

  team?: EspnTeam;

  athlete?: EspnAthlete;

  clock?: EspnClock;

  scoringPlay?: boolean;

  redCard?: boolean;

  yellowCard?: boolean;

  penaltyKick?: boolean;

  ownGoal?: boolean;

  [key: string]: unknown;
}

// ============================================================
// ESPN IMAGE
// ============================================================

export interface EspnImage {
  href?: string;

  width?: number;

  height?: number;

  alt?: string;

  rel?: string[];

  source?: string;

  [key: string]: unknown;
}

// ============================================================
// ESPN STANDINGS RESPONSE
// ============================================================

export interface EspnStandingsResponse {
  uid?: string;

  name?: string;

  abbreviation?: string;

  season?: EspnSeason;

  seasonType?: EspnSeasonType;

  fullViewLink?: EspnLink;

  children?: EspnStandingsGroup[];

  standings?: EspnStandingsContainer;

  [key: string]: unknown;
}

// ============================================================
// ESPN STANDINGS GROUP
// ============================================================

export interface EspnStandingsGroup {
  id?: string;

  uid?: string;

  name?: string;

  abbreviation?: string;

  standings?: EspnStandingsContainer;

  children?: EspnStandingsGroup[];

  [key: string]: unknown;
}

// ============================================================
// ESPN STANDINGS CONTAINER
// ============================================================

export interface EspnStandingsContainer {
  entries?: EspnStandingEntry[];

  [key: string]: unknown;
}

// ============================================================
// ESPN STANDING ENTRY
// ============================================================

export interface EspnStandingEntry {
  team?: EspnTeam;

  note?: {
    color?: string;

    description?: string;

    rank?: number;

    [key: string]: unknown;
  };

  stats?: EspnStandingStatistic[];

  statistics?: EspnStandingStatistic[];

  [key: string]: unknown;
}

// ============================================================
// ESPN STANDING STATISTIC
// ============================================================

export interface EspnStandingStatistic {
  name?: string;

  displayName?: string;

  shortDisplayName?: string;

  description?: string;

  abbreviation?: string;

  type?: string;

  value?: number;

  displayValue?: string;

  rank?: number;

  [key: string]: unknown;
}

// ============================================================
// ESPN ODDS
// ============================================================

export interface EspnOdds {
  provider?: EspnOddsProvider;

  details?: string;

  overUnder?: number;

  spread?: number;

  moneyline?: EspnMoneyline;

  homeTeamOdds?: EspnTeamOdds;

  awayTeamOdds?: EspnTeamOdds;

  [key: string]: unknown;
}

// ============================================================
// ESPN ODDS PROVIDER
// ============================================================

export interface EspnOddsProvider {
  id?: string;

  name?: string;

  priority?: number;

  logo?: string;

  [key: string]: unknown;
}

// ============================================================
// ESPN MONEYLINE
// ============================================================

export interface EspnMoneyline {
  home?: number;

  away?: number;

  draw?: number;

  [key: string]: unknown;
}

// ============================================================
// ESPN TEAM ODDS
// ============================================================

export interface EspnTeamOdds {
  team?: EspnTeam;

  favorite?: boolean;

  underdog?: boolean;

  moneyLine?: number;

  spread?: number;

  spreadOdds?: number;

  total?: number;

  totalOdds?: number;

  [key: string]: unknown;
}

// ============================================================
// ESPN LEADERS
// ============================================================

export interface EspnLeader {
  name?: string;

  displayName?: string;

  shortDisplayName?: string;

  abbreviation?: string;

  leaders?: EspnLeaderItem[];

  [key: string]: unknown;
}

// ============================================================
// ESPN LEADER ITEM
// ============================================================

export interface EspnLeaderItem {
  athlete?: EspnAthlete;

  team?: EspnTeam;

  value?: number;

  displayValue?: string;

  statistics?: EspnTeamMatchStatistic[];

  [key: string]: unknown;
}

// ============================================================
// ESPN NEWS RESPONSE
// ============================================================

export interface EspnNewsResponse {
  resultsCount?: number;

  resultsLimit?: number;

  resultsOffset?: number;

  headlines?: EspnNewsArticle[];

  [key: string]: unknown;
}

// ============================================================
// ESPN NEWS ARTICLE
// ============================================================

export interface EspnNewsArticle {
  id?: string;

  nowId?: string;

  type?: string;

  headline?: string;

  description?: string;

  published?: string;

  lastModified?: string;

  story?: string;

  source?: string;

  author?: string;

  premium?: boolean;

  video?: unknown;

  keywords?: string[];

  categories?: EspnNewsCategory[];

  images?: EspnNewsImage[];

  links?: {
    web?: {
      href?: string;

      text?: string;

      shortText?: string;

      rel?: string[];

      isExternal?: boolean;

      isPremium?: boolean;

      isAffiliate?: boolean;

      [key: string]: unknown;
    };

    [key: string]: unknown;
  };

  [key: string]: unknown;
}

// ============================================================
// ESPN NEWS CATEGORY
// ============================================================

export interface EspnNewsCategory {
  id?: string;

  type?: string;

  leagueId?: string | number;

  league?: {
    id?: string | number;

    description?: string;

    abbreviation?: string;

    links?: EspnLink[];

    [key: string]: unknown;
  };

  teamId?: string | number;

  team?: EspnTeam;

  athleteId?: string | number;

  athlete?: EspnAthlete;

  [key: string]: unknown;
}

// ============================================================
// ESPN NEWS IMAGE
// ============================================================

export interface EspnNewsImage {
  id?: string;

  url?: string | string[];

  width?: number;

  height?: number;

  alt?: string;

  caption?: string;

  credit?: string;

  type?: string;

  rel?: string[];

  [key: string]: unknown;
}
