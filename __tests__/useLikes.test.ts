import { act, waitFor } from '@testing-library/react-native';
import { useLikeStatus, useToggleLike } from '@/hooks/useLikes';
import { apiGet, apiPut, apiDelete } from '@/lib/apiClient';
import type { FeedPost } from '@/types/posts';
import { renderHookWithQueryClient } from './testUtils/renderHookWithQueryClient';

jest.mock('@/lib/apiClient', () => ({
  apiGet: jest.fn(),
  apiPut: jest.fn(),
  apiDelete: jest.fn(),
}));

const mockApiGet = apiGet as jest.Mock;
const mockApiPut = apiPut as jest.Mock;
const mockApiDelete = apiDelete as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

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
    mockApiGet.mockResolvedValue(true);

    const { result } = await renderHookWithQueryClient(() => useLikeStatus('post-1', 'user-1'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(true);
    expect(mockApiGet).toHaveBeenCalledWith('/api/posts/post-1/like');
  });

  it('resolves false when no like row exists', async () => {
    mockApiGet.mockResolvedValue(false);

    const { result } = await renderHookWithQueryClient(() => useLikeStatus('post-1', 'user-1'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(false);
  });
});

// The highest-risk hook in the codebase per its own review history — optimistic
// update, must roll back correctly on failure. Rewired in Phase 5.5 Concept 7 to
// call PUT/DELETE /api/posts/:id/like via apiPut/apiDelete instead of Supabase
// directly; the onMutate/onError/onSettled logic itself is untouched by that
// swap, so these guard the same contract as before, against the new fetcher.
describe('useToggleLike', () => {
  const likeKey = ['likes', { postId: 'post-1', userId: 'user-1' }];
  const postKey = ['posts', { id: 'post-1' }];

  it('optimistically flips the like status and increments like_count before the network call resolves', async () => {
    let resolvePut: (value: undefined) => void = () => {};
    const pendingPut = new Promise<undefined>((resolve) => {
      resolvePut = resolve;
    });
    mockApiPut.mockReturnValue(pendingPut);

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
    expect(mockApiPut).toHaveBeenCalledWith('/api/posts/post-1/like');

    await act(async () => {
      resolvePut(undefined);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rolls back the optimistic update when the mutation fails', async () => {
    mockApiPut.mockRejectedValue(new Error('insert failed'));

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

  it('calls apiDelete (not apiPut) and decrements like_count when unliking', async () => {
    mockApiDelete.mockResolvedValue(undefined);

    const { result, queryClient } = await renderHookWithQueryClient(() => useToggleLike());
    queryClient.setQueryData(likeKey, true);
    queryClient.setQueryData(postKey, makeFeedPost({ like_count: 4 }));

    await act(() => {
      result.current.mutate({ postId: 'post-1', userId: 'user-1', liked: true });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApiDelete).toHaveBeenCalledWith('/api/posts/post-1/like');
    expect(mockApiPut).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(likeKey)).toBe(false);
    expect((queryClient.getQueryData(postKey) as FeedPost).like_count).toBe(3);
  });

  it('rolls back correctly when unliking fails', async () => {
    mockApiDelete.mockRejectedValue(new Error('delete failed'));

    const { result, queryClient } = await renderHookWithQueryClient(() => useToggleLike());
    queryClient.setQueryData(likeKey, true);
    queryClient.setQueryData(postKey, makeFeedPost({ like_count: 4 }));

    await act(() => {
      result.current.mutate({ postId: 'post-1', userId: 'user-1', liked: true });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(queryClient.getQueryData(likeKey)).toBe(true);
    expect((queryClient.getQueryData(postKey) as FeedPost).like_count).toBe(4);
  });
});
