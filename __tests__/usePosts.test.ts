import { act, waitFor } from '@testing-library/react-native';
import { useTodayPost, useUpsertPost, useDeletePost } from '@/hooks/usePosts';
import { apiGet, apiPost, apiDelete } from '@/lib/apiClient';
import type { Post } from '@/types/posts';
import { renderHookWithQueryClient } from './testUtils/renderHookWithQueryClient';

jest.mock('@/lib/apiClient', () => ({
  apiGet: jest.fn(),
  apiPost: jest.fn(),
  apiDelete: jest.fn(),
}));

const mockApiGet = apiGet as jest.Mock;
const mockApiPost = apiPost as jest.Mock;
const mockApiDelete = apiDelete as jest.Mock;

// getEntryDate reads the real clock internally — pin "now" so tests control
// whether it's a live-entry window or the dead zone (12:00-16:00 local).
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

function makePost(overrides: Partial<Post>): Post {
  return {
    id: 'post-1',
    user_id: 'user-1',
    rating: 5,
    message: 'a post',
    local_date: '2026-08-08',
    created_at: '2026-08-08T18:00:00Z',
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

describe('useTodayPost', () => {
  it("resolves today's post once the entry window is open", async () => {
    jest.setSystemTime(new Date(2026, 7, 8, 18, 0));
    const post = makePost({});
    mockApiGet.mockResolvedValue(post);

    const { result } = await renderHookWithQueryClient(() => useTodayPost('user-1'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(post);
    expect(mockApiGet).toHaveBeenCalledWith('/api/me/posts/today?localDate=2026-08-08');
  });

  it('short-circuits to no data and no query during the dead zone', async () => {
    jest.setSystemTime(new Date(2026, 7, 8, 14, 0));

    const { result } = await renderHookWithQueryClient(() => useTodayPost('user-1'));

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockApiGet).not.toHaveBeenCalled();
  });
});

describe('useUpsertPost', () => {
  it('POSTs the mapped fields to /api/posts and invalidates posts on success', async () => {
    jest.setSystemTime(new Date(2026, 7, 8, 18, 0));
    const created = makePost({});
    mockApiPost.mockResolvedValue(created);

    const { result, queryClient } = await renderHookWithQueryClient(() => useUpsertPost());
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    await act(() =>
      result.current.mutate({
        userId: 'user-1',
        rating: 7,
        message: 'good day',
        isAnonymous: false,
        regionCountryCode: 'AU',
        regionStateCode: 'AU-VIC',
        placeLabel: 'Victoria, Australia',
      })
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(created);
    expect(mockApiPost).toHaveBeenCalledWith('/api/posts', {
      rating: 7,
      message: 'good day',
      photoUrl: null,
      localDate: '2026-08-08',
      isAnonymous: false,
      regionCountryCode: 'AU',
      regionStateCode: 'AU-VIC',
      placeLabel: 'Victoria, Australia',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['posts'] });
  });

  // the server derives user_id from the JWT (requireUserId), not the body —
  // this is the client-side half of that guarantee: nothing in the request
  // even carries a userId for the server to have to ignore
  it('never sends userId in the request body', async () => {
    jest.setSystemTime(new Date(2026, 7, 8, 18, 0));
    mockApiPost.mockResolvedValue(makePost({}));

    const { result } = await renderHookWithQueryClient(() => useUpsertPost());

    await act(() =>
      result.current.mutate({
        userId: 'user-1',
        rating: 7,
        message: 'good day',
        isAnonymous: false,
        regionCountryCode: null,
        regionStateCode: null,
        placeLabel: null,
      })
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, sentBody] = mockApiPost.mock.calls[0] as [string, Record<string, unknown>];
    expect(sentBody).not.toHaveProperty('userId');
  });

  it('rejects synchronously during the dead zone without calling the server', async () => {
    jest.setSystemTime(new Date(2026, 7, 8, 14, 0));

    const { result } = await renderHookWithQueryClient(() => useUpsertPost());

    await act(() =>
      result.current.mutate({
        userId: 'user-1',
        rating: 7,
        message: 'good day',
        isAnonymous: false,
        regionCountryCode: null,
        regionStateCode: null,
        placeLabel: null,
      })
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Invalid date');
    expect(mockApiPost).not.toHaveBeenCalled();
  });
});

describe('useDeletePost', () => {
  it('DELETEs /api/posts/:id and invalidates posts on success', async () => {
    const deleted = makePost({ id: 'post-1' });
    mockApiDelete.mockResolvedValue(deleted);

    const { result, queryClient } = await renderHookWithQueryClient(() => useDeletePost());
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    await act(() => result.current.mutate('post-1'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(deleted);
    expect(mockApiDelete).toHaveBeenCalledWith('/api/posts/post-1');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['posts'] });
  });

  // mirrors the server's real behavior: a delete outside the entry window (or
  // on someone else's post) is a 404, not a silent success — the hook should
  // surface that as a real mutation error, not swallow it
  it('surfaces a failure (e.g. outside the entry window) as an error, not a success', async () => {
    mockApiDelete.mockRejectedValue(new Error('Post not found or not deletable right now'));

    const { result } = await renderHookWithQueryClient(() => useDeletePost());

    await act(() => result.current.mutate('post-1'));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Post not found or not deletable right now');
  });
});
