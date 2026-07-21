import type { CommentWithAuthor } from '@/hooks/useComments';

export type CommentWithReplies = CommentWithAuthor & { replies: CommentWithAuthor[] };

export function buildCommentTree(comments: CommentWithAuthor[]): CommentWithReplies[] {
  const topLevels: CommentWithAuthor[] = comments.filter((c) => c.parent_comment_id === null);

  const commentTree: CommentWithReplies[] = topLevels.map((topLevel) => ({
    ...topLevel,
    replies: comments.filter((c) => c.parent_comment_id === topLevel.id),
  }));

  return commentTree;
}
