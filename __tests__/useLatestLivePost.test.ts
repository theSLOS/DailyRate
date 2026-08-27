import { waitFor } from '@testing-library/react-native';
import { useLatestLivePost } from '@/hooks/useLatestLivePost';
import { apiGet } from '@/lib/apiClient';
import type { FeedPost } from '@/types/posts';
import { renderHookWithQueryClient } from './testUtils/renderHookWithQueryClient';

jest.mock('@/lib/apiClient', () => ({ apiGet: jest.fn() }));

const mockApiGet = apiGet as jest.Mock;

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

describe('useLatestLivePost', () => {
  it("resolves the user's most recent live post", async () => {
    const post = makeFeedPost({ id: 'post-2' });
    mockApiGet.mockResolvedValue(post);

    const { result } = await renderHookWithQueryClient(() => useLatestLivePost('user-1'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(post);
    expect(mockApiGet).toHaveBeenCalledWith('/api/posts/latest?userId=user-1');
  });

  it('resolves null when the user has no live post', async () => {
    mockApiGet.mockResolvedValue(null);

    const { result } = await renderHookWithQueryClient(() => useLatestLivePost('user-1'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('stays disabled with no query when userId is undefined', async () => {
    const { result } = await renderHookWithQueryClient(() => useLatestLivePost(undefined));

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockApiGet).not.toHaveBeenCalled();
  });
});
