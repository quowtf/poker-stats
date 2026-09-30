/**
 * Canonical scoring and BI configuration for poker stats.
 *
 * This module is the single source of truth for the points system and the
 * significance thresholds used across the stats layer. Import from here
 * instead of redefining values in `stats.ts`, `ladders.ts`, etc.
 */

/**
 * Points awarded by final finish position in a session.
 * 1st=10, 2nd=7, 3rd=5, 4th=3, 5th=2, 6th+=1.
 */
export function positionPoints(position: number): number {
  switch (position) {
    case 1:
      return 10;
    case 2:
      return 7;
    case 3:
      return 5;
    case 4:
      return 3;
    case 5:
      return 2;
    default:
      return 1;
  }
}

/** Each beer drunk adds a tiny bonus to points (just for fun). */
export const BEER_POINT_VALUE = 0.01;

/**
 * Minimum thresholds so a metric is statistically meaningful (avoids noise
 * from players with too few data points). Document the threshold used in each
 * metric's `description`.
 */
export const MIN_THRESHOLDS = {
  /** Sessions required to compute volatility / consistency. */
  volatilitySessions: 3,
  /** Hands required to compute win rate. */
  winRateHands: 10,
  /** Shared sessions required to count a rivalry. */
  rivalrySharedSessions: 5,
  /** All-ins required to compute all-in survival rate. */
  allInSurvival: 3,
  /** Hands required to compute fold rate. */
  foldRateHands: 10,
} as const;
