import type { Post } from '@/types/posts';
import type { ChartRange } from '@/constants/chart';
import * as chart from '@/constants/chart';

export function filterPostsByRange(posts: Post[], range: ChartRange): Post[] {
  const ascending = [...posts].reverse();

  if (range === 'all') {
    return ascending;
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - chart.RANGE_DAY_WINDOW[range]);

  return ascending.filter((post) => new Date(post.local_date) >= cutoff);
}
