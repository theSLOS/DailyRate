import { filterPostsByRange } from '@/utils/filterPostsByRange';
import type { Post } from '@/types/posts';

function makePost(overrides: Partial<Post>): Post {
  return {
    id: 'post-id',
    user_id: 'user-id',
    rating: 5,
    message: 'a message',
    local_date: '2026-08-08',
    created_at: '2026-08-08T00:00:00Z',
    is_anonymous: false,
    like_count: 0,
    comment_count: 0,
    moderation_status: 'approved',
    photo_url: null,
    photo_thumb_url: null,
    place_label: null,
    region_country_code: null,
    region_state_code: null,
    location: null,
    ...overrides,
  };
}

function daysAgoDateString(now: Date, days: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

describe('filterPostsByRange', () => {
  const NOW = new Date('2026-08-08T12:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reverses newest-first input into oldest-first output for "all"', () => {
    const posts = [
      makePost({ id: 'newer', local_date: daysAgoDateString(NOW, 1) }),
      makePost({ id: 'older', local_date: daysAgoDateString(NOW, 5) }),
    ];
    expect(filterPostsByRange(posts, 'all').map((p) => p.id)).toEqual(['older', 'newer']);
  });

  it('"week" keeps posts within 7 days and drops older ones', () => {
    const posts = [
      makePost({ id: 'within', local_date: daysAgoDateString(NOW, 3) }),
      makePost({ id: 'outside', local_date: daysAgoDateString(NOW, 10) }),
    ];
    const result = filterPostsByRange(posts, 'week').map((p) => p.id);
    expect(result).toContain('within');
    expect(result).not.toContain('outside');
  });

  it('"month" keeps posts within 30 days and drops older ones', () => {
    const posts = [
      makePost({ id: 'within', local_date: daysAgoDateString(NOW, 20) }),
      makePost({ id: 'outside', local_date: daysAgoDateString(NOW, 40) }),
    ];
    const result = filterPostsByRange(posts, 'month').map((p) => p.id);
    expect(result).toContain('within');
    expect(result).not.toContain('outside');
  });

  it('does not mutate the original array', () => {
    const posts = [makePost({ id: 'a' }), makePost({ id: 'b' })];
    const original = [...posts];
    filterPostsByRange(posts, 'all');
    expect(posts).toEqual(original);
  });
});
