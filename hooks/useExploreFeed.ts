import { useInfiniteQuery, UseInfiniteQueryResult, InfiniteData } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { PostgrestError } from '@supabase/supabase-js';
import type { FeedPost } from '@/types/posts';
import type { ExploreFeedType, RegionFeedTier } from '@/types/feed';
import type { Region } from '@/types/region';
import { FEED_PAGE_SIZE, MOST_LIKED_LIMIT, POST_POLL_INTERVAL_MS } from '@/constants/posts';
import { useHiddenPostsIds } from './useHiddenPosts';

export type ExploreFeedPage = {
  posts: FeedPost[];
  tier: RegionFeedTier | null;
};

type PageParam = {
  cursor: string | undefined;
  tier: RegionFeedTier | null;
};

async function fetchNewest(cursor: string | undefined): Promise<FeedPost[]> {
  let query = supabase
    .from('posts_feed')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(FEED_PAGE_SIZE);
  if (cursor) query = query.lt('created_at', cursor);

  const { data, error } = await query;
  if (error) throw error;
  return data as FeedPost[];
}

async function fetchMostLiked(): Promise<FeedPost[]> {
  const { data, error } = await supabase
    .from('posts_feed')
    .select('*')
    .order('like_count', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(MOST_LIKED_LIMIT);

  if (error) throw error;
  return data as FeedPost[];
}

async function fetchByRegion(
  column: 'region_state_code' | 'region_country_code',
  code: string,
  cursor: string | undefined
): Promise<FeedPost[]> {
  let query = supabase
    .from('posts_feed')
    .select('*')
    .eq(column, code)
    .order('created_at', { ascending: false })
    .limit(FEED_PAGE_SIZE);
  if (cursor) query = query.lt('created_at', cursor);

  const { data, error } = await query;
  if (error) throw error;
  return data as FeedPost[];
}

async function fetchRegionPage(param: PageParam, region: Region | null): Promise<ExploreFeedPage> {
  // the tier is resolved once, on the first page, then carried in the page param —
  // otherwise page 2 could fall through to a different tier than page 1 and interleave feeds
  if (param.tier !== null) {
    if (param.tier === 'mostLiked') return { posts: await fetchMostLiked(), tier: 'mostLiked' };
    const column = param.tier === 'state' ? 'region_state_code' : 'region_country_code';
    const code = param.tier === 'state' ? region?.stateCode : region?.countryCode;
    if (!code) return { posts: await fetchMostLiked(), tier: 'mostLiked' };
    return { posts: await fetchByRegion(column, code, param.cursor), tier: param.tier };
  }

  if (region?.stateCode) {
    const posts = await fetchByRegion('region_state_code', region.stateCode, undefined);
    if (posts.length > 0) return { posts, tier: 'state' };
  }

  if (region?.countryCode) {
    const posts = await fetchByRegion('region_country_code', region.countryCode, undefined);
    if (posts.length > 0) return { posts, tier: 'country' };
  }

  return { posts: await fetchMostLiked(), tier: 'mostLiked' };
}

export function useExploreFeed(
  userId: string | undefined,
  feedType: ExploreFeedType,
  region: Region | null
): UseInfiniteQueryResult<InfiniteData<ExploreFeedPage, PageParam>, PostgrestError> {
  const { data: hiddenIds } = useHiddenPostsIds();

  return useInfiniteQuery({
    queryKey: [
      'posts',
      {
        scope: 'explore',
        feedType,
        region: feedType === 'region' ? (region?.stateCode ?? region?.countryCode ?? null) : null,
      },
    ],
    initialPageParam: { cursor: undefined, tier: null } as PageParam,
    queryFn: async ({ pageParam }): Promise<ExploreFeedPage> => {
      if (!userId) {
        throw new Error('User ID is required');
      }

      if (feedType === 'mostLiked') return { posts: await fetchMostLiked(), tier: null };
      if (feedType === 'newest') return { posts: await fetchNewest(pageParam.cursor), tier: null };
      return fetchRegionPage(pageParam, region);
    },
    getNextPageParam: (lastPage): PageParam | undefined => {
      // most-liked is bounded; a mutable sort key cannot be paginated by keyset safely
      if (feedType === 'mostLiked' || lastPage.tier === 'mostLiked') return undefined;
      if (lastPage.posts.length < FEED_PAGE_SIZE) return undefined;

      return {
        cursor: lastPage.posts[lastPage.posts.length - 1].created_at,
        tier: lastPage.tier,
      };
    },
    select: (data) => ({
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        posts: page.posts.filter((p) => p.user_id !== userId && !hiddenIds?.has(p.id)),
      })),
    }),
    enabled: userId !== undefined,
    refetchInterval: POST_POLL_INTERVAL_MS,
  });
}
