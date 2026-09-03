/**
 * Client-side slice of a post history into the rating chart's
 * week/month/all-time range, applied to an already-fetched, unfiltered list.
 */
import type { Post } from '@/types/posts';
import type { ChartRange } from '@/constants/chart';
import * as chart from '@/constants/chart';

/** Returns the subset of posts (oldest-first) that fall within the given chart range. */
export function filterPostsByRange(posts: Post[], range: ChartRange): Post[] {
  const ascending = [...posts].reverse();

  if (range === 'all') {
    return ascending;
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - chart.RANGE_DAY_WINDOW[range]);

  return ascending.filter((post) => new Date(post.local_date) >= cutoff);
}
