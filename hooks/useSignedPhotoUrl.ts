/**
 * Query wrapper around getSignedPhotoUrl, so a post photo's signed URL is
 * cached/refetched like any other query instead of minted ad hoc.
 */
import { UseQueryResult, useQuery } from '@tanstack/react-query';
import { getSignedPhotoUrl } from '@/utils/getSignedPhotoUrl';

/** Fetches a fresh signed URL for the given Storage path, or null if there's no path. */
export function useSignedPhotoUrl(path: string | null): UseQueryResult<string | null, Error> {
  return useQuery({
    queryKey: ['photos', 'signedUrl', path],
    queryFn: async (): Promise<string | null> => {
      if (!path) return Promise.resolve(null);
      return getSignedPhotoUrl(path);
    },
    enabled: path !== null,
  });
}
