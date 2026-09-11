/**
 * Spaced Repetition System (SRS) Interval Policy
 * Discrete 6-level ladder for Queensland bus route memory retention.
 */
export const SRS_INTERVAL_SECONDS = {
  0: 10 * 60,              // Level 0: 10 minutes (Again / Lapse)
  1: 1 * 24 * 60 * 60,     // Level 1: 1 day
  2: 3 * 24 * 60 * 60,     // Level 2: 3 days
  3: 7 * 24 * 60 * 60,     // Level 3: 7 days
  4: 14 * 24 * 60 * 60,    // Level 4: 14 days
  5: 30 * 24 * 60 * 60,    // Level 5: 30 days (Mature / Mastered)
} as const;

export type SrsLevel = 0 | 1 | 2 | 3 | 4 | 5;
