import { HIDDEN_POSTS_STORAGE_KEY } from '@/constants/posts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useMutation,
  UseMutationResult,
  useQuery,
  useQueryClient,
  UseQueryResult,
} from '@tanstack/react-query';

export function useHiddenPostsIds(): UseQueryResult<Set<string>, Error> {
  return useQuery({
    queryKey: ['hiddenPosts'],
    queryFn: async () => {
      const raw = await AsyncStorage.getItem(HIDDEN_POSTS_STORAGE_KEY);
      return new Set<string>(raw ? JSON.parse(raw) : []);
    },
  });
}

export function useHidePost(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      const raw = await AsyncStorage.getItem(HIDDEN_POSTS_STORAGE_KEY);
      const ids: string[] = raw ? JSON.parse(raw) : [];
      if (!ids.includes(postId)) {
        await AsyncStorage.setItem(HIDDEN_POSTS_STORAGE_KEY, JSON.stringify([...ids, postId]));
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hiddenPosts'] }),
  });
}
