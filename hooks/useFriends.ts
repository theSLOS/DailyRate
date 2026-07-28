import {
  useMutation,
  UseMutationResult,
  useQuery,
  useQueryClient,
  UseQueryResult,
} from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { PostgrestError } from '@supabase/supabase-js';

import { useBlockStatus } from '@/hooks/useBlocks';
import type { FriendRequest, FriendStatus } from '@/types/friends';
import type { ProfilePublicRow } from '@/types/posts';

export type FriendRequestWithProfiles = FriendRequest & {
  requester: Pick<ProfilePublicRow, 'id' | 'username' | 'display_name' | 'avatar_url'>;
  addressee: Pick<ProfilePublicRow, 'id' | 'username' | 'display_name' | 'avatar_url'>;
};

export function useFriendRequests(
  sessionUserId: string | undefined
): UseQueryResult<FriendRequestWithProfiles[], PostgrestError> {
  return useQuery({
    queryKey: ['friendRequests', { sessionUserId }],
    queryFn: async (): Promise<FriendRequestWithProfiles[]> => {
      if (!sessionUserId) {
        throw new Error('Session User ID needed');
      }
      const { data, error } = await supabase
        .from('friend_requests')
        .select(
          '*, requester:profiles_public!friend_requests_requester_id_fkey(id, username, display_name, avatar_url), addressee:profiles_public!friend_requests_addressee_id_fkey(id, username, display_name, avatar_url)'
        )
        .order('created_at', { ascending: false });
      if (error) {
        throw error;
      }
      return data;
    },
    enabled: sessionUserId !== undefined,
  });
}

export function useFriendsIds(
  sessionUserId: string | undefined
): UseQueryResult<Set<string>, PostgrestError> {
  return useQuery({
    queryKey: ['friends', { scope: 'mine', sessionUserId }],
    queryFn: async (): Promise<Set<string>> => {
      if (!sessionUserId) {
        throw new Error('Session User ID needed');
      }
      const { data, error } = await supabase.from('friendships').select('friend_id');
      if (error) {
        throw error;
      }
      return new Set(data.map((row) => row.friend_id));
    },
    enabled: sessionUserId !== undefined,
  });
}

export function useFriendCount(userId: string | undefined): UseQueryResult<number, PostgrestError> {
  return useQuery({
    queryKey: ['friends', { count: userId }],
    queryFn: async (): Promise<number> => {
      if (!userId) {
        throw new Error('User ID needed');
      }
      const { data, error } = await supabase.rpc('friend_count', { target_user_id: userId });
      if (error) {
        throw error;
      }
      return data;
    },
    enabled: userId !== undefined,
  });
}

export function useFriendStatus(
  otherUserId: string | undefined,
  sessionUserId: string | undefined
): FriendStatus {
  const requests = useFriendRequests(sessionUserId);
  const friendIds = useFriendsIds(sessionUserId);
  const blocked = useBlockStatus(otherUserId);

  if (otherUserId === undefined || sessionUserId === undefined) {
    return 'unknown';
  }
  if (otherUserId === sessionUserId) {
    return 'self';
  }
  if (
    requests.isPending ||
    friendIds.isPending ||
    blocked.isPending ||
    requests.data === undefined ||
    friendIds.data === undefined
  ) {
    return 'unknown';
  }
  // Cosmetic only: blocking does not gate friend requests server-side until
  // Phase 7, and being blocked by someone is deliberately undetectable — so
  // they can still send you requests and this hides nothing from them.
  if (blocked.data) {
    return 'blocked';
  }
  if (friendIds.data.has(otherUserId)) {
    return 'friends';
  }
  if (requests.data.some((request) => request.requester_id === otherUserId)) {
    return 'incoming';
  }
  if (requests.data.some((request) => request.addressee_id === otherUserId)) {
    return 'outgoing';
  }
  return 'none';
}

type SendFriendRequestInput = { requesterId: string; addresseeId: string };

export function useSendFriendRequest(): UseMutationResult<
  void,
  PostgrestError,
  SendFriendRequestInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ requesterId, addresseeId }) => {
      const { error } = await supabase
        .from('friend_requests')
        .insert({ requester_id: requesterId, addressee_id: addresseeId });
      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
    },
  });
}

type DeleteFriendRequestInput = { requesterId: string; addresseeId: string };

// Covers both rejecting a request sent to you and cancelling one you sent —
// friend_requests' DELETE policy authorises either party, so the only
// difference is which way round the caller passes the ids.
export function useDeleteFriendRequest(): UseMutationResult<
  void,
  PostgrestError,
  DeleteFriendRequestInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ requesterId, addresseeId }) => {
      const { error } = await supabase
        .from('friend_requests')
        .delete()
        .eq('requester_id', requesterId)
        .eq('addressee_id', addresseeId);
      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
    },
  });
}

type AcceptFriendRequestInput = { otherUserId: string };

export function useAcceptFriendRequest(): UseMutationResult<
  void,
  PostgrestError,
  AcceptFriendRequestInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ otherUserId }) => {
      const { error } = await supabase.rpc('accept_friend_request', {
        other_user_id: otherUserId,
      });
      if (error) {
        throw error;
      }
    },
    // Accept consumes a friend_requests row and creates two friendships rows,
    // so both namespaces move. The bare ['friends'] prefix also catches every
    // cached ['friends', { count }] — both parties' counts changed.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
      queryClient.invalidateQueries({ queryKey: ['friends'] });
    },
  });
}

type RemoveFriendshipInput = { otherUserId: string };

export function useRemoveFriendship(): UseMutationResult<
  void,
  PostgrestError,
  RemoveFriendshipInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ otherUserId }) => {
      const { error } = await supabase.rpc('remove_friendship', { other_user_id: otherUserId });
      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
    },
  });
}
