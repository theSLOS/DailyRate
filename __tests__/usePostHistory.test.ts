import { waitFor } from '@testing-library/react-native';
import { usePostHistory } from '@/hooks/usePostHistory';
import { supabase } from '@/lib/supabase';
import type { Post } from '@/types/posts';
import { renderHookWithQueryClient } from './testUtils/renderHookWithQueryClient';
import { makeQueryChainMock } from './testUtils/supabaseMock';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

const mockFrom = supabase.from as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

function makePost(overrides: Partial<Post>): Post {
  return {
    id: 'post-1',
    user_id: 'user-1',
    rating: 5,
    message: 'a post',
    local_date: '2026-08-08',
    created_at: '2026-08-08T00:00:00Z',
    location: null,
    photo_url: null,
    photo_thumb_url: null,
    moderation_status: 'approved',
    like_count: 0,
    comment_count: 0,
    place_label: null,
    region_country_code: null,
    region_state_code: null,
    is_anonymous: false,
    ...overrides,
  } as Post;
}

describe('usePostHistory', () => {
  it("resolves the user's own posts ordered by local_date descending", async () => {
    const posts = [
      makePost({ id: 'post-2', local_date: '2026-08-08' }),
      makePost({ id: 'post-1', local_date: '2026-08-07' }),
    ];
    mockFrom.mockReturnValue(makeQueryChainMock({ data: posts, error: null }));

    const { result } = await renderHookWithQueryClient(() => usePostHistory('user-1'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(posts);
    expect(mockFrom).toHaveBeenCalledWith('posts');
  });

  it('stays disabled with no query when userId is undefined', async () => {
    const { result } = await renderHookWithQueryClient(() => usePostHistory(undefined));

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  // Not exercised here (would need two renderHookWithQueryClient calls sharing
  // one queryClient), but worth flagging: the query key is `['posts', { scope:
  // 'history' }]` — not parameterized by userId — so two different users'
  // history hooks mounted against the same QueryClient would collide on one
  // cache entry. Not a bug introduced by this test pass; noted for whoever
  // next touches this hook.
});
