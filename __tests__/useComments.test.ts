import { act, waitFor } from '@testing-library/react-native';
import { useComments, useSubmitComment, CommentWithAuthor } from '@/hooks/useComments';
import { supabase } from '@/lib/supabase';
import { apiGet } from '@/lib/apiClient';
import type { CommentWithReplies } from '@/utils/buildCommentTree';
import type { FeedPost } from '@/types/posts';
import { renderHookWithQueryClient } from './testUtils/renderHookWithQueryClient';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/lib/apiClient', () => ({ apiGet: jest.fn() }));

const mockFrom = supabase.from as jest.Mock;
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

function makeComment(overrides: Partial<CommentWithAuthor>): CommentWithAuthor {
  return {
    id: 'comment-1',
    post_id: 'post-1',
    user_id: 'user-1',
    parent_comment_id: null,
    body: 'nice day',
    created_at: '2026-08-08T00:00:00Z',
    author: { username: 'sam', display_name: 'Sam', avatar_url: null },
    ...overrides,
  } as CommentWithAuthor;
}

describe('useComments', () => {
  it('resolves comments joined with author, built into a reply tree', async () => {
    const topLevel = makeComment({ id: 'comment-1', parent_comment_id: null });
    const reply = makeComment({ id: 'comment-2', parent_comment_id: 'comment-1', body: 'agreed' });
    mockApiGet.mockResolvedValue([topLevel, reply]);

    const { result } = await renderHookWithQueryClient(() => useComments('post-1'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ ...topLevel, replies: [reply] }]);
    expect(mockApiGet).toHaveBeenCalledWith('/api/posts/post-1/comments');
  });
});

// The second full-depth optimistic-update test in this codebase, matching
// useLikes.test.ts's template — useSubmitComment is flagged in the hook's
// own review history as needing the same guard on its onMutate/onError/
// onSettled cycle.
describe('useSubmitComment', () => {
  const postId = 'post-1';
  const commentsKey = ['comments', { postId }];
  const postKey = ['posts', { id: postId }];

  it('optimistically appends a new top-level comment and bumps comment_count', async () => {
    let resolveInsert: (value: { data: null; error: null }) => void = () => {};
    const pendingInsert = new Promise<{ data: null; error: null }>((resolve) => {
      resolveInsert = resolve;
    });
    mockFrom.mockReturnValue({ insert: jest.fn(() => pendingInsert) });

    const { result, queryClient } = await renderHookWithQueryClient(() => useSubmitComment());
    queryClient.setQueryData<CommentWithReplies[]>(commentsKey, []);
    queryClient.setQueryData(postKey, makeFeedPost({ comment_count: 2 }));

    await act(() => result.current.mutate({ postId, userId: 'user-1', body: 'great day' }));

    await waitFor(() => {
      const comments = queryClient.getQueryData<CommentWithReplies[]>(commentsKey);
      expect(comments).toHaveLength(1);
    });
    const comments = queryClient.getQueryData<CommentWithReplies[]>(commentsKey);
    expect(comments?.[0]).toMatchObject({ body: 'great day', user_id: 'user-1', replies: [] });
    expect((queryClient.getQueryData(postKey) as FeedPost).comment_count).toBe(3);

    await act(async () => {
      resolveInsert({ data: null, error: null });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('optimistically nests a reply into its parent comment', async () => {
    mockFrom.mockReturnValue({
      insert: jest.fn(() => Promise.resolve({ data: null, error: null })),
    });

    const parent: CommentWithReplies = { ...makeComment({ id: 'comment-1' }), replies: [] };
    const { result, queryClient } = await renderHookWithQueryClient(() => useSubmitComment());
    queryClient.setQueryData<CommentWithReplies[]>(commentsKey, [parent]);
    queryClient.setQueryData(postKey, makeFeedPost({ comment_count: 1 }));

    await act(() =>
      result.current.mutate({
        postId,
        userId: 'user-2',
        body: 'me too',
        parentCommentId: 'comment-1',
      })
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const comments = queryClient.getQueryData<CommentWithReplies[]>(commentsKey);
    expect(comments).toHaveLength(1);
    expect(comments?.[0].replies).toHaveLength(1);
    expect(comments?.[0].replies[0]).toMatchObject({ body: 'me too', user_id: 'user-2' });
  });

  it('rolls back the optimistic comment and comment_count when the mutation fails', async () => {
    mockFrom.mockReturnValue({
      insert: jest.fn(() => Promise.resolve({ data: null, error: { message: 'insert failed' } })),
    });

    const { result, queryClient } = await renderHookWithQueryClient(() => useSubmitComment());
    queryClient.setQueryData<CommentWithReplies[]>(commentsKey, []);
    queryClient.setQueryData(postKey, makeFeedPost({ comment_count: 2 }));

    await act(() => result.current.mutate({ postId, userId: 'user-1', body: 'will fail' }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData<CommentWithReplies[]>(commentsKey)).toEqual([]);
    expect((queryClient.getQueryData(postKey) as FeedPost).comment_count).toBe(2);
  });
});
