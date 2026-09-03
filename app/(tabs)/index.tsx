/**
 * The Home tab ("Today"): create/edit today's entry within the active
 * posting window, including photo upload and region resolution.
 */
import { useState } from 'react';
import { Text, ActivityIndicator, Alert } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { useTodayPost, useUpsertPost } from '@/hooks/usePosts';
import { useSignedPhotoUrl } from '@/hooks/useSignedPhotoUrl';
import { uploadPhoto } from '@/utils/uploadPhoto';
import { getEntryDate } from '@/utils/getEntryDate';
import { ComposeForm } from '@/components/ComposeForm';
import { Centered } from '@/components/Centered';
import { useSessionRegion } from '@/hooks/useSessionRegion';
import { LOCATION_RESOLVING_LABEL } from '@/constants/posts';
import type { JSX } from 'react';

/** Renders the compose form for today's entry (create or edit) and handles its submission. */
export default function TodayScreen(): JSX.Element {
  const { session, loading: authLoading } = useAuth();
  const entryDate = getEntryDate(new Date());
  const todayPostQuery = useTodayPost(session?.user.id);
  const regionQuery = useSessionRegion(session?.user.id);
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

  /** Uploads a new photo if one was picked, then upserts today's post with the form's values. */
  async function handleSubmit(values: {
    rating: number;
    message: string;
    newPhotoLocalUri: string | null;
    isAnonymous: boolean;
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
        photoPath = await uploadPhoto(values.newPhotoLocalUri);
      }

      // an edit keeps the region it was first posted from, so a post never relocates
      const existingPost = todayPostQuery.data;
      const resolvedRegion =
        regionQuery.data?.status === 'resolved' ? regionQuery.data.region : null;

      upsertPost.mutate(
        {
          userId: session.user.id,
          rating: values.rating,
          message: values.message,
          photoUrl: photoPath,
          isAnonymous: values.isAnonymous,
          regionCountryCode:
            existingPost?.region_country_code ?? resolvedRegion?.countryCode ?? null,
          regionStateCode: existingPost?.region_state_code ?? resolvedRegion?.stateCode ?? null,
          placeLabel: existingPost?.place_label ?? resolvedRegion?.placeLabel ?? null,
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
      blocked={regionQuery.isLoading}
      blockedLabel={LOCATION_RESOLVING_LABEL}
      initialIsAnonymous={todayPostQuery.data?.is_anonymous}
      onSubmit={handleSubmit}
    />
  );
}
