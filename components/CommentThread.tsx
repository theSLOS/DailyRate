import { useComments, useSubmitComment, CommentWithAuthor } from '@/hooks/useComments';
import { JSX, useState } from 'react';
import { Pressable, View, Text, ActivityIndicator, TextInput } from 'react-native';
import { Link } from 'expo-router';
import { ANONYMOUS_AUTHOR_LABEL } from '@/constants/posts';
import { ReportButton } from '@/components/ReportButton';

export type CommentThreadProps = {
  postId: string;
  userId: string | undefined;
};

export function resolveReplyTarget(comment: CommentWithAuthor): string {
  return comment.parent_comment_id ?? comment.id;
}

export function CommentThread({ postId, userId }: CommentThreadProps): JSX.Element {
  const commentsQuery = useComments(postId);
  const submitComment = useSubmitComment();
  const [body, setBody] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ id: string; authorLabel: string } | null>(null);

  const handleSubmit = (): void => {
    if (!userId || body.trim() === '') {
      console.warn('User ID and comment body are required to submit a comment');
      return;
    }
    submitComment.mutate(
      { postId, userId, body, parentCommentId: replyingTo?.id },
      {
        onSuccess: () => {
          setBody('');
          setReplyingTo(null);
        },
      }
    );
  };

  return (
    <View>
      {commentsQuery.isLoading && <ActivityIndicator />}
      {commentsQuery.error && <Text>Couldn't load comments.</Text>}
      {commentsQuery.data?.map((comment) => (
        <View key={comment.id} className="border border-gray-300 rounded-lg p-3 mb-3">
          <Link href={{ pathname: '/profile/[id]', params: { id: comment.user_id } }}>
            <Text>
              {comment.author.display_name ?? comment.author.username ?? ANONYMOUS_AUTHOR_LABEL}
            </Text>
          </Link>
          <Text>{comment.body}</Text>
          <Pressable
            onPress={() =>
              setReplyingTo({
                id: resolveReplyTarget(comment),
                authorLabel:
                  comment.author.display_name ?? comment.author.username ?? ANONYMOUS_AUTHOR_LABEL,
              })
            }
          >
            <Text>Reply</Text>
          </Pressable>
          {comment.user_id !== userId && (
            <ReportButton reporterId={userId} targetType="comment" targetId={comment.id} />
          )}

          {comment.replies.map((reply) => (
            <View key={reply.id} className="ml-4 mt-2">
              <Link href={{ pathname: '/profile/[id]', params: { id: reply.user_id } }}>
                <Text>
                  {reply.author.display_name ?? reply.author.username ?? ANONYMOUS_AUTHOR_LABEL}
                </Text>
              </Link>
              <Text>{reply.body}</Text>
              <Pressable
                onPress={() =>
                  setReplyingTo({
                    id: resolveReplyTarget(reply),
                    authorLabel:
                      reply.author.display_name ?? reply.author.username ?? ANONYMOUS_AUTHOR_LABEL,
                  })
                }
              >
                <Text>Reply</Text>
              </Pressable>
              {reply.user_id !== userId && (
                <ReportButton reporterId={userId} targetType="comment" targetId={reply.id} />
              )}
            </View>
          ))}
        </View>
      ))}
      {replyingTo && (
        <View>
          <Text>Replying to {replyingTo.authorLabel}</Text>
          <Pressable onPress={() => setReplyingTo(null)}>
            <Text>Cancel</Text>
          </Pressable>
        </View>
      )}
      <TextInput value={body} onChangeText={setBody} placeholder="Add a comment" />
      <Pressable onPress={handleSubmit} disabled={!userId || body.trim() === ''}>
        <Text>Post</Text>
      </Pressable>
    </View>
  );
}
