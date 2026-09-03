/**
 * Formats how long ago a timestamp was, at minute/hour granularity
 * ("just now", "12m ago", "3h ago") — used for post age display.
 */
const MS_PER_MINUTE = 60 * 1000;

/** Formats the age of createdAt relative to now as a coarse, human-readable string. */
export function formatCoarseAge(createdAt: string, now: Date): string {
  const diffMS = now.getTime() - new Date(createdAt).getTime();
  const diffMins = diffMS / MS_PER_MINUTE;

  if (diffMins < 1) {
    return 'just now';
  }
  if (diffMins < 60) {
    return `${Math.floor(diffMins)}m ago`;
  }
  return `${Math.floor(diffMins / 60)}h ago`;
}
