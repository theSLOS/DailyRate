import { waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFriendsFeed } from '@/hooks/useFriendsFeed';
import { supabase } from '@/lib/supabase';
import type { FeedPost } from '@/types/posts';
import { FEED_PAGE_SIZE, HIDDEN_POSTS_STORAGE_KEY } from '@/constants/posts';
import { renderHookWithQueryClient } from './testUtils/renderHookWithQueryClient';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
// jest.mock's factory can't use a top-level import (hoisting), so require() is
// the only option here — this is the package's own documented mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const mockFrom = supabase.from as jest.Mock;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
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
    user_id: 'friend-1',
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

function makeFullPage(count: number, startHour: number): FeedPost[] {
  return Array.from({ length: count }, (_, i) =>
    makeFeedPost({
      id: `post-${startHour}-${i}`,
      created_at: `2026-08-08T${String(startHour - i).padStart(2, '0')}:00:00Z`,
    })
  );
}

// Chainable mock for a `.from().select().order().limit()[.lt()]` query that
// resolves at whichever step the hook stops chaining, mirroring
// posts_feed_friends' actual query shape (no .eq('user_id', ...) — the view
// itself scopes to friends, see the hook's own comment).
function makeInfiniteQueryMock(pagesByCursor: Map<string | undefined, FeedPost[]>): {
  from: jest.Mock;
  ltMock: jest.Mock;
} {
  let currentPage: FeedPost[] = pagesByCursor.get(undefined) ?? [];
  const ltMock = jest.fn((_col: string, cursor: string) => {
    currentPage = pagesByCursor.get(cursor) ?? [];
    return chain;
  });
  const chain: Record<string, jest.Mock> = {
    select: jest.fn(() => chain),
    order: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    lt: ltMock,
    then: jest.fn((onFulfilled: (v: { data: FeedPost[]; error: null }) => unknown) =>
      Promise.resolve({ data: currentPage, error: null }).then(onFulfilled)
    ),
  };
  return { from: jest.fn(() => chain), ltMock };
}

describe('useFriendsFeed', () => {
  it('resolves the first page from posts_feed_friends with no next page when short', async () => {
    const shortPage = makeFullPage(2, 10);
    const { from } = makeInfiniteQueryMock(new Map([[undefined, shortPage]]));
    mockFrom.mockImplementation(from);

    const { result } = await renderHookWithQueryClient(() => useFriendsFeed('user-1'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0]).toEqual(shortPage);
    expect(result.current.hasNextPage).toBe(false);
    expect(mockFrom).toHaveBeenCalledWith('posts_feed_friends');
  });

  it('paginates by created_at cursor when a page is full', async () => {
    const page1 = makeFullPage(FEED_PAGE_SIZE, 23);
    const page2 = makeFullPage(2, 3);
    const cursor = page1[page1.length - 1].created_at;
    const { from, ltMock } = makeInfiniteQueryMock(
      new Map([
        [undefined, page1],
        [cursor, page2],
      ])
    );
    mockFrom.mockImplementation(from);

    const { result } = await renderHookWithQueryClient(() => useFriendsFeed('user-1'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);

    await act(() => result.current.fetchNextPage());

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(ltMock).toHaveBeenCalledWith('created_at', cursor);
    expect(result.current.data?.pages[1]).toEqual(page2);
    expect(result.current.hasNextPage).toBe(false);
  });

  it('filters out hidden posts from the resolved pages', async () => {
    const hiddenPost = makeFeedPost({ id: 'hidden-post', created_at: '2026-08-08T09:00:00Z' });
    const visiblePost = makeFeedPost({ id: 'visible-post', created_at: '2026-08-08T08:00:00Z' });
    await AsyncStorage.setItem(HIDDEN_POSTS_STORAGE_KEY, JSON.stringify(['hidden-post']));

    const { from } = makeInfiniteQueryMock(new Map([[undefined, [hiddenPost, visiblePost]]]));
    mockFrom.mockImplementation(from);

    const { result } = await renderHookWithQueryClient(() => useFriendsFeed('user-1'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.data?.pages[0]).toEqual([visiblePost]));
  });
});
