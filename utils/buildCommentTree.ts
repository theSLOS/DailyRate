/**
 * Assembles a flat, joined comment query result into a two-level tree
 * (top-level comments each carrying their own `replies` array).
 */
import type { CommentWithAuthor } from '@/hooks/useComments';

export type CommentWithReplies = CommentWithAuthor & { replies: CommentWithAuthor[] };

/** Groups a flat comment list into top-level comments with their replies nested underneath. */
export function buildCommentTree(comments: CommentWithAuthor[]): CommentWithReplies[] {
  const topLevels: CommentWithAuthor[] = comments.filter((c) => c.parent_comment_id === null);

  const commentTree: CommentWithReplies[] = topLevels.map((topLevel) => ({
    ...topLevel,
    replies: comments.filter((c) => c.parent_comment_id === topLevel.id),
  }));

  return commentTree;
}
