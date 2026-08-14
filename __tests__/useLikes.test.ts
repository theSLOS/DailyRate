import { act, waitFor } from '@testing-library/react-native';
import { useLikeStatus, useToggleLike } from '@/hooks/useLikes';
import { supabase } from '@/lib/supabase';
import type { FeedPost } from '@/types/posts';
import { renderHookWithQueryClient } from './testUtils/renderHookWithQueryClient';
import { makeQueryChainMock } from './testUtils/supabaseMock';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

const mockFrom = supabase.from as jest.Mock;

function makeFeedPost(overrides: Partial<FeedPost>): FeedPost {
  return {
    id: 'post-1',
    rating: 5,
    message: 'a post',
    created_at: '2026-08-08T00:00:00Z',
    local_date: '2026-08-08',
    like_count: 0,
    is_anonymous: false,
    user_id: 'user-1',
    photo_url: null,
    author_username: null,
    author_display_name: null,
    author_avatar_url: null,
    comment_count: 0,
    region_country_code: null,
    region_state_code: null,
    place_label: null,
    moderation_status: 'approved',
    ...overrides,
  } as FeedPost;
}

describe('useLikeStatus', () => {
  it('resolves true when a like row exists', async () => {
    mockFrom.mockReturnValue(makeQueryChainMock({ data: { id: 'like-1' }, error: null }));

    const { result } = await renderHookWithQueryClient(() => useLikeStatus('post-1', 'user-1'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(true);
  });

  it('resolves false when no like row exists', async () => {
    mockFrom.mockReturnValue(makeQueryChainMock({ data: null, error: null }));

    const { result } = await renderHookWithQueryClient(() => useLikeStatus('post-1', 'user-1'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(false);
  });
});

// The highest-risk hook in the codebase per its own review history — optimistic
// update, must roll back correctly on failure. These tests exist specifically to
// guard the onMutate/onError/onSettled logic before Phase 5.5's Concept 8 rewires
// this hook's fetcher to call the front server instead of Supabase directly.
describe('useToggleLike', () => {
  const likeKey = ['likes', { postId: 'post-1', userId: 'user-1' }];
  const postKey = ['posts', { id: 'post-1' }];

  it('optimistically flips the like status and increments like_count before the network call resolves', async () => {
    let resolveInsert: (value: { data: null; error: null }) => void = () => {};
    const pendingInsert = new Promise<{ data: null; error: null }>((resolve) => {
      resolveInsert = resolve;
    });
    mockFrom.mockReturnValue({ insert: jest.fn(() => pendingInsert) });

    const { result, queryClient } = await renderHookWithQueryClient(() => useToggleLike());
    queryClient.setQueryData(likeKey, false);
    queryClient.setQueryData(postKey, makeFeedPost({ like_count: 3 }));

    // RTL's act() always wraps the callback async now, so an unawaited call
    // resolves on a later microtask — it can bleed into the next test's act
    // scope (React warns "You called act(async () => ...) without await")
    // and race that test's own effect flush. Always await it.
    await act(() => {
      result.current.mutate({ postId: 'post-1', userId: 'user-1', liked: false });
    });

    await waitFor(() => expect(queryClient.getQueryData(likeKey)).toBe(true));
    expect((queryClient.getQueryData(postKey) as FeedPost).like_count).toBe(4);

    await act(async () => {
      resolveInsert({ data: null, error: null });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rolls back the optimistic update when the mutation fails', async () => {
    mockFrom.mockReturnValue({
      insert: jest.fn(() => Promise.resolve({ data: null, error: { message: 'insert failed' } })),
    });

    const { result, queryClient } = await renderHookWithQueryClient(() => useToggleLike());
    queryClient.setQueryData(likeKey, false);
    queryClient.setQueryData(postKey, makeFeedPost({ like_count: 3 }));

    await act(() => {
      result.current.mutate({ postId: 'post-1', userId: 'user-1', liked: false });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(queryClient.getQueryData(likeKey)).toBe(false);
    expect((queryClient.getQueryData(postKey) as FeedPost).like_count).toBe(3);
  });
});
