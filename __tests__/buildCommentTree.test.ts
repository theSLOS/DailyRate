import { buildCommentTree } from '@/utils/buildCommentTree';
import type { CommentWithAuthor } from '@/hooks/useComments';

function makeComment(overrides: Partial<CommentWithAuthor>): CommentWithAuthor {
  return {
    id: 'comment-id',
    post_id: 'post-id',
    user_id: 'user-id',
    body: 'a comment',
    parent_comment_id: null,
    created_at: '2026-08-08T00:00:00Z',
    author: { username: 'someone', display_name: null, avatar_url: null },
    ...overrides,
  };
}

describe('buildCommentTree', () => {
  it('returns an empty array for no comments', () => {
    expect(buildCommentTree([])).toEqual([]);
  });

  it('gives every top-level comment an empty replies array when there are no replies', () => {
    const comments = [makeComment({ id: 'a' }), makeComment({ id: 'b' })];
    const tree = buildCommentTree(comments);

    expect(tree).toHaveLength(2);
    expect(tree[0].replies).toEqual([]);
    expect(tree[1].replies).toEqual([]);
  });

  it('nests a reply under its top-level parent', () => {
    const comments = [
      makeComment({ id: 'top', parent_comment_id: null }),
      makeComment({ id: 'reply', parent_comment_id: 'top' }),
    ];
    const tree = buildCommentTree(comments);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('top');
    expect(tree[0].replies.map((r) => r.id)).toEqual(['reply']);
  });

  it('collects multiple replies to the same top-level comment, in original order', () => {
    const comments = [
      makeComment({ id: 'top', parent_comment_id: null }),
      makeComment({ id: 'reply1', parent_comment_id: 'top' }),
      makeComment({ id: 'reply2', parent_comment_id: 'top' }),
    ];
    const tree = buildCommentTree(comments);

    expect(tree[0].replies.map((r) => r.id)).toEqual(['reply1', 'reply2']);
  });

  it('keeps two top-level threads and their replies separate', () => {
    const comments = [
      makeComment({ id: 'topA', parent_comment_id: null }),
      makeComment({ id: 'topB', parent_comment_id: null }),
      makeComment({ id: 'replyToA', parent_comment_id: 'topA' }),
    ];
    const tree = buildCommentTree(comments);

    const threadA = tree.find((c) => c.id === 'topA');
    const threadB = tree.find((c) => c.id === 'topB');
    expect(threadA?.replies.map((r) => r.id)).toEqual(['replyToA']);
    expect(threadB?.replies).toEqual([]);
  });

  // The 2-level cap depends on every reply-to-reply's parent_comment_id already
  // pointing at the ORIGINAL top-level comment (enforced client-side at submission,
  // in CommentThread.tsx's resolveReplyTarget — not re-checked here). This test
  // exercises that already-flattened shape, not the enforcement itself.
  it('flattens a reply-to-a-reply into the same top-level thread, given already-flattened input', () => {
    const comments = [
      makeComment({ id: 'top', parent_comment_id: null }),
      makeComment({ id: 'reply1', parent_comment_id: 'top' }),
      makeComment({ id: 'reply2', parent_comment_id: 'top' }), // "reply to reply1", but flattened to top's id
    ];
    const tree = buildCommentTree(comments);

    expect(tree).toHaveLength(1);
    expect(tree[0].replies.map((r) => r.id)).toEqual(['reply1', 'reply2']);
  });
});
