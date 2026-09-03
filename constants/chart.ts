/**
 * Rating-history chart config: the week/month/all-time range toggle and the
 * day-window each range covers.
 */
export const RATING_CHART_RANGES = ['week', 'month', 'all'] as const;
export type ChartRange = (typeof RATING_CHART_RANGES)[number];

export const RANGE_DAY_WINDOW: Record<'week' | 'month', number> = { week: 7, month: 30 };
