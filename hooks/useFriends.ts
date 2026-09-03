/**
 * Friend requests and friendships: reads (requests, ids, list, count,
 * derived status) plus the four write mutations (send/reject-or-cancel a
 * request, accept, remove a friendship).
 */
import {
  useMutation,
  UseMutationResult,
  useQuery,
  useQueryClient,
  UseQueryResult,
} from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { apiGet, ApiError } from '@/lib/apiClient';
import type { PostgrestError } from '@supabase/supabase-js';

import { useBlockStatus } from '@/hooks/useBlocks';
import type { FriendRequest, Friendship, FriendStatus } from '@/types/friends';
import type { ProfilePublicRow } from '@/types/posts';
import { requireDefined } from '@/utils/requireDefined';

export type FriendRequestWithProfiles = FriendRequest & {
  requester: Pick<ProfilePublicRow, 'id' | 'username' | 'display_name' | 'avatar_url'>;
  addressee: Pick<ProfilePublicRow, 'id' | 'username' | 'display_name' | 'avatar_url'>;
};

export type FriendshipWithProfile = Friendship & {
  friend: Pick<ProfilePublicRow, 'id' | 'username' | 'display_name' | 'avatar_url'>;
};

/** Fetches every pending friend request involving the current user, either direction. */
export function useFriendRequests(
  sessionUserId: string | undefined
): UseQueryResult<FriendRequestWithProfiles[], ApiError> {
  return useQuery({
    queryKey: ['friendRequests', { sessionUserId }],
    queryFn: async (): Promise<FriendRequestWithProfiles[]> => {
      requireDefined(sessionUserId, 'Session User ID needed');
      return apiGet<FriendRequestWithProfiles[]>('/api/friends/requests');
    },
    enabled: sessionUserId !== undefined,
  });
}

/** Fetches the current user's friend ids as a Set, for cheap membership checks. */
export function useFriendsIds(
  sessionUserId: string | undefined
): UseQueryResult<Set<string>, ApiError> {
  return useQuery({
    queryKey: ['friends', { scope: 'mine', shape: 'ids', sessionUserId }],
    queryFn: async (): Promise<Set<string>> => {
      requireDefined(sessionUserId, 'Session User ID needed');
      const ids = await apiGet<string[]>('/api/friends/ids');
      return new Set(ids);
    },
    enabled: sessionUserId !== undefined,
  });
}

/** Fetches the current user's full friends list with each friend's profile. */
export function useFriendsList(
  sessionUserId: string | undefined
): UseQueryResult<FriendshipWithProfile[], ApiError> {
  return useQuery({
    queryKey: ['friends', { scope: 'mine', shape: 'list', sessionUserId }],
    queryFn: async (): Promise<FriendshipWithProfile[]> => {
      requireDefined(sessionUserId, 'Session User ID needed');
      return apiGet<FriendshipWithProfile[]>('/api/friends/list');
    },
    enabled: sessionUserId !== undefined,
  });
}

/** Fetches a given user's friend count via the denormalized friend_count RPC (never map over a list). */
export function useFriendCount(userId: string | undefined): UseQueryResult<number, ApiError> {
  return useQuery({
    queryKey: ['friends', { count: userId }],
    queryFn: async (): Promise<number> => {
      const id = requireDefined(userId, 'User ID needed');
      return apiGet<number>(`/api/friends/count?userId=${id}`);
    },
    enabled: userId !== undefined,
  });
}

/** Derives the current user's relationship to another user (friends/incoming/outgoing/blocked/etc.) from cached reads. */
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

/** Sends a friend request from requesterId to addresseeId. */
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
/** Deletes a pending friend request — used for both rejecting and cancelling. */
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

/** Accepts a pending friend request via the accept_friend_request RPC. */
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

/** Removes an existing friendship (both mirrored rows) via the remove_friendship RPC. */
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
