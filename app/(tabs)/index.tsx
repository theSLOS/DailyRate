import { useState } from 'react';
import { Text, ActivityIndicator, Alert } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { useTodayPost, useUpsertPost } from '@/hooks/usePosts';
import { useSignedPhotoUrl } from '@/hooks/useSignedPhotoUrl';
import { uploadPhoto } from '@/utils/uploadPhoto';
import { getEntryDate } from '@/utils/getEntryDate';
import { ComposeForm } from '@/components/ComposeForm';
import { Centered } from '@/components/Centered';
import type { JSX } from 'react';

export default function TodayScreen(): JSX.Element {
  const { session, loading: authLoading } = useAuth();
  const entryDate = getEntryDate(new Date());
  const todayPostQuery = useTodayPost(session?.user.id);
  const upsertPost = useUpsertPost();
  const photoUrlQuery = useSignedPhotoUrl(todayPostQuery.data?.photo_url ?? null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (authLoading) {
    return (
      <Centered>
        <ActivityIndicator />
      </Centered>
    );
  }

  if (entryDate === null) {
    return (
      <Centered>
        <Text>No active posting window — check back at 4pm.</Text>
      </Centered>
    );
  }

  if (todayPostQuery.isLoading) {
    return (
      <Centered>
        <ActivityIndicator />
      </Centered>
    );
  }

  async function handleSubmit(values: {
    rating: number;
    message: string;
    newPhotoLocalUri: string | null;
  }): Promise<void> {
    if (!session) return;

    const submitEntryDate = getEntryDate(new Date());
    if (submitEntryDate === null) {
      Alert.alert('No active posting window');
      return;
    }

    setIsSubmitting(true);
    try {
      let photoPath = todayPostQuery.data?.photo_url ?? null;
      if (values.newPhotoLocalUri) {
        photoPath = await uploadPhoto(values.newPhotoLocalUri, session.user.id, submitEntryDate);
      }

      upsertPost.mutate(
        {
          userId: session.user.id,
          rating: values.rating,
          message: values.message,
          photoUrl: photoPath,
        },
        {
          onError: (error) => Alert.alert('Could not save your entry', error.message),
          onSettled: () => setIsSubmitting(false),
        }
      );
    } catch (error) {
      setIsSubmitting(false);
      Alert.alert(
        'Could not upload photo',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  return (
    <ComposeForm
      initialRating={todayPostQuery.data?.rating}
      initialMessage={todayPostQuery.data?.message}
      initialPhotoDisplayUri={photoUrlQuery.data ?? null}
      submitting={isSubmitting}
      onSubmit={handleSubmit}
    />
  );
}
