import { act, waitFor } from '@testing-library/react-native';
import { useTodayPost, useUpsertPost } from '@/hooks/usePosts';
import { supabase } from '@/lib/supabase';
import type { Post } from '@/types/posts';
import { renderHookWithQueryClient } from './testUtils/renderHookWithQueryClient';
import { makeQueryChainMock } from './testUtils/supabaseMock';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

const mockFrom = supabase.from as jest.Mock;

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
    mockFrom.mockReturnValue(makeQueryChainMock({ data: post, error: null }));

    const { result } = await renderHookWithQueryClient(() => useTodayPost('user-1'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(post);
    expect(mockFrom).toHaveBeenCalledWith('posts');
  });

  it('short-circuits to no data and no query during the dead zone', async () => {
    jest.setSystemTime(new Date(2026, 7, 8, 14, 0));

    const { result } = await renderHookWithQueryClient(() => useTodayPost('user-1'));

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('useUpsertPost', () => {
  it('upserts on (user_id, local_date) and invalidates posts on success', async () => {
    jest.setSystemTime(new Date(2026, 7, 8, 18, 0));
    const created = makePost({});
    const single = jest.fn(() => Promise.resolve({ data: created, error: null }));
    const select = jest.fn(() => ({ single }));
    const upsert = jest.fn(() => ({ select }));
    mockFrom.mockReturnValue({ upsert });

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
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', rating: 7, local_date: '2026-08-08' }),
      { onConflict: 'user_id,local_date' }
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['posts'] });
  });

  it('rejects synchronously during the dead zone without calling Supabase', async () => {
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
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
