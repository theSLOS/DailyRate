import { useComments, useSubmitComment } from '@/hooks/useComments';
import { JSX, useState } from 'react';
import { Pressable, View, Text, ActivityIndicator, TextInput } from 'react-native';
import { ANONYMOUS_AUTHOR_LABEL } from '@/constants/posts';

export type CommentThreadProps = {
  postId: string;
  userId: string | undefined;
};

export function CommentThread({ postId, userId }: CommentThreadProps): JSX.Element {
  const commentsQuery = useComments(postId);
  const submitComment = useSubmitComment();
  const [body, setBody] = useState('');

  const handleSubmit = (): void => {
    if (!userId || body.trim() === '') {
      console.warn('User ID and comment body are required to submit a comment');
      return;
    }
    submitComment.mutate(
      { postId, userId, body },
      {
        onSuccess: () => {
          setBody('');
        },
      }
    );
  };

  return (
    <View>
      {commentsQuery.isLoading && <ActivityIndicator />}
      {commentsQuery.error && <Text>Couldn't load comments.</Text>}
      {commentsQuery.data?.map((comment) => (
        <View key={comment.id}>
          <Text>
            {comment.author.display_name ?? comment.author.username ?? ANONYMOUS_AUTHOR_LABEL}
          </Text>
          <Text>{comment.body}</Text>
        </View>
      ))}
      <TextInput value={body} onChangeText={setBody} placeholder="Add a comment" />
      <Pressable onPress={handleSubmit} disabled={!userId || body.trim() === ''}>
        <Text>Post</Text>
      </Pressable>
    </View>
  );
}
