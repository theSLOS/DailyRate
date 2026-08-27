import { ProfilePublicRow } from '@/types/posts';
import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { apiGet, ApiError } from '@/lib/apiClient';
import { requireDefined } from '@/utils/requireDefined';

export function useProfile(
  userId: string | undefined
): UseQueryResult<ProfilePublicRow | null, ApiError> {
  return useQuery({
    queryKey: ['profiles', { id: userId }],
    queryFn: async (): Promise<ProfilePublicRow | null> => {
      const id = requireDefined(userId, 'No User Id');
      return apiGet<ProfilePublicRow | null>(`/api/profiles/${id}`);
    },
    enabled: userId !== undefined,
  });
}
