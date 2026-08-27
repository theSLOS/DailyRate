import { waitFor } from '@testing-library/react-native';
import { usePost } from '@/hooks/usePost';
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

describe('usePost', () => {
  it('resolves a single post from the server by id', async () => {
    const post = makeFeedPost({ id: 'post-1' });
    mockApiGet.mockResolvedValue(post);

    const { result } = await renderHookWithQueryClient(() => usePost('post-1'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(post);
    expect(mockApiGet).toHaveBeenCalledWith('/api/posts/post-1');
  });

  it('resolves null when the post does not exist (or has aged out)', async () => {
    mockApiGet.mockResolvedValue(null);

    const { result } = await renderHookWithQueryClient(() => usePost('missing-post'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('stays disabled with no query when postId is undefined', async () => {
    const { result } = await renderHookWithQueryClient(() => usePost(undefined));

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockApiGet).not.toHaveBeenCalled();
  });
});
