export const YOUTUBE_CONFIG = {
  apiBaseUrl: 'https://www.googleapis.com/youtube/v3',

  /**
   * We only search for video results.
   */
  searchType: 'video',

  /**
   * Highlights are searched after a match has finished.
   *
   * This value is used to define the useful publication window
   * around a completed fixture.
   */
  defaultSearchWindowMinutes: 20,

  /**
   * Maximum number of attempts for one fixture.
   *
   * The initial search counts as attempt 1.
   */
  maxRetryCount: 3,

  /**
   * Delay before another search attempt for the same fixture.
   */
  retryDelayMinutes: 20,

  /**
   * Search only for videos that can be embedded.
   */
  requireEmbeddable: true,
} as const;

export type YoutubeConfig = typeof YOUTUBE_CONFIG;
