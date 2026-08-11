import { waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useExploreFeed } from '@/hooks/useExploreFeed';
import { supabase } from '@/lib/supabase';
import type { FeedPost } from '@/types/posts';
import type { Region } from '@/types/region';
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
    user_id: 'other-user',
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

function makeFullPage(count: number, idPrefix: string): FeedPost[] {
  return Array.from({ length: count }, (_, i) =>
    makeFeedPost({
      id: `${idPrefix}-${i}`,
      created_at: `2026-08-08T${String(23 - i).padStart(2, '0')}:00:00Z`,
    })
  );
}

type Chain = Record<string, jest.Mock>;

// Each call to supabase.from() in this hook's fetch functions starts a fresh
// chain; queue one response per call, in the order the hook is expected to
// make them, and keep every created chain around so tests can assert which
// columns/values a given call in the sequence used.
function makeSequentialFromMock(responses: FeedPost[][]): { from: jest.Mock; chains: Chain[] } {
  const chains: Chain[] = [];
  let i = 0;
  const from = jest.fn(() => {
    const data = responses[i] ?? [];
    i += 1;
    const chain: Chain = {
      select: jest.fn(() => chain),
      eq: jest.fn(() => chain),
      order: jest.fn(() => chain),
      limit: jest.fn(() => chain),
      lt: jest.fn(() => chain),
      then: jest.fn((onFulfilled: (v: { data: FeedPost[]; error: null }) => unknown) =>
        Promise.resolve({ data, error: null }).then(onFulfilled)
      ),
    };
    chains.push(chain);
    return chain;
  });
  return { from, chains };
}

const region: Region = {
  countryCode: 'AU',
  stateCode: 'AU-VIC',
  placeLabel: 'Victoria, Australia',
};

describe('useExploreFeed — mostLiked', () => {
  it('fetches the bounded most-liked set and never paginates', async () => {
    const posts = makeFullPage(3, 'liked');
    const { from, chains } = makeSequentialFromMock([posts]);
    mockFrom.mockImplementation(from);

    const { result } = await renderHookWithQueryClient(() =>
      useExploreFeed('me', 'mostLiked', null)
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0].posts).toEqual(posts);
    expect(result.current.hasNextPage).toBe(false);
    expect(chains[0].order).toHaveBeenCalledWith('like_count', { ascending: false });
  });
});

describe('useExploreFeed — newest', () => {
  it('paginates by created_at cursor', async () => {
    const page1 = makeFullPage(FEED_PAGE_SIZE, 'newest');
    const page2 = makeFullPage(2, 'newest-2');
    const { from, chains } = makeSequentialFromMock([page1, page2]);
    mockFrom.mockImplementation(from);

    const { result } = await renderHookWithQueryClient(() => useExploreFeed('me', 'newest', null));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);

    await act(() => result.current.fetchNextPage());

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(chains[1].lt).toHaveBeenCalledWith('created_at', page1[page1.length - 1].created_at);
  });
});

describe('useExploreFeed — region', () => {
  it('uses the state tier when it has posts', async () => {
    const posts = makeFullPage(3, 'state');
    const { from, chains } = makeSequentialFromMock([posts]);
    mockFrom.mockImplementation(from);

    const { result } = await renderHookWithQueryClient(() =>
      useExploreFeed('me', 'region', region)
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0].tier).toBe('state');
    expect(chains[0].eq).toHaveBeenCalledWith('region_state_code', 'AU-VIC');
  });

  it('falls back to the country tier when the state tier is empty', async () => {
    const posts = makeFullPage(3, 'country');
    const { from, chains } = makeSequentialFromMock([[], posts]);
    mockFrom.mockImplementation(from);

    const { result } = await renderHookWithQueryClient(() =>
      useExploreFeed('me', 'region', region)
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0].tier).toBe('country');
    expect(chains[0].eq).toHaveBeenCalledWith('region_state_code', 'AU-VIC');
    expect(chains[1].eq).toHaveBeenCalledWith('region_country_code', 'AU');
  });

  it('falls back to most-liked when both region tiers are empty', async () => {
    const posts = makeFullPage(3, 'liked');
    const { from, chains } = makeSequentialFromMock([[], [], posts]);
    mockFrom.mockImplementation(from);

    const { result } = await renderHookWithQueryClient(() =>
      useExploreFeed('me', 'region', region)
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0].tier).toBe('mostLiked');
    expect(result.current.hasNextPage).toBe(false);
    expect(chains[2].eq).not.toHaveBeenCalled();
  });

  it('goes straight to most-liked with no region available', async () => {
    const posts = makeFullPage(3, 'liked');
    const { from, chains } = makeSequentialFromMock([posts]);
    mockFrom.mockImplementation(from);

    const { result } = await renderHookWithQueryClient(() => useExploreFeed('me', 'region', null));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0].tier).toBe('mostLiked');
    expect(chains[0].eq).not.toHaveBeenCalled();
  });

  it('carries the resolved tier into page 2 instead of re-deriving it', async () => {
    // page 1 resolves the state tier (full page → keeps paginating);
    // page 2 must stay on the state tier, not re-check state/country/mostLiked.
    const page1 = makeFullPage(FEED_PAGE_SIZE, 'state');
    const page2 = makeFullPage(2, 'state-2');
    const { from, chains } = makeSequentialFromMock([page1, page2]);
    mockFrom.mockImplementation(from);

    const { result } = await renderHookWithQueryClient(() =>
      useExploreFeed('me', 'region', region)
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);

    await act(() => result.current.fetchNextPage());

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(result.current.data?.pages[1].tier).toBe('state');
    expect(chains[1].eq).toHaveBeenCalledWith('region_state_code', 'AU-VIC');
    expect(chains[1].lt).toHaveBeenCalledWith('created_at', page1[page1.length - 1].created_at);
  });
});

describe('useExploreFeed — self-exclusion and hidden-post filtering', () => {
  it("filters out the viewer's own posts and hidden posts", async () => {
    const own = makeFeedPost({ id: 'own-post', user_id: 'me', created_at: '2026-08-08T09:00:00Z' });
    const hidden = makeFeedPost({ id: 'hidden-post', created_at: '2026-08-08T08:00:00Z' });
    const visible = makeFeedPost({ id: 'visible-post', created_at: '2026-08-08T07:00:00Z' });
    await AsyncStorage.setItem(HIDDEN_POSTS_STORAGE_KEY, JSON.stringify(['hidden-post']));

    const { from } = makeSequentialFromMock([[own, hidden, visible]]);
    mockFrom.mockImplementation(from);

    const { result } = await renderHookWithQueryClient(() =>
      useExploreFeed('me', 'mostLiked', null)
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.data?.pages[0].posts).toEqual([visible]));
  });
});
