import { UseQueryResult, useQuery } from '@tanstack/react-query';
import { getSignedPhotoUrl } from '@/utils/getSignedPhotoUrl';

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
