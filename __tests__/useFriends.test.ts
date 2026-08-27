import { act, waitFor } from '@testing-library/react-native';
import {
  useFriendRequests,
  useFriendsIds,
  useFriendsList,
  useFriendCount,
  useFriendStatus,
  useSendFriendRequest,
  useDeleteFriendRequest,
  useAcceptFriendRequest,
  useRemoveFriendship,
} from '@/hooks/useFriends';
import { supabase } from '@/lib/supabase';
import { apiGet } from '@/lib/apiClient';
import { renderHookWithQueryClient } from './testUtils/renderHookWithQueryClient';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('@/lib/apiClient', () => ({ apiGet: jest.fn() }));

const mockFrom = supabase.from as jest.Mock;
const mockRpc = supabase.rpc as jest.Mock;
const mockApiGet = apiGet as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

// TanStack Query's notifyManager batches via a real setTimeout(0), not just a
// microtask — waitFor can resolve on its very first (already-true) check
// without giving that macrotask a chance to fire, so a state update from an
// already-in-flight query can still land after the test function returns and
// outside any act() scope. Force one full event-loop turn inside act() so
// tests that short-circuit past the isPending checks (the 'unknown'/'self'
// branches below, which return before those checks) don't leak into the next
// test.
async function flushPendingQueries(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('useFriendRequests', () => {
  it('resolves requests with joined requester/addressee profiles', async () => {
    const requests = [{ requester_id: 'a', addressee_id: 'b', created_at: '2026-08-01' }];
    mockApiGet.mockResolvedValue(requests);

    const { result } = await renderHookWithQueryClient(() => useFriendRequests('a'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(requests);
    expect(mockApiGet).toHaveBeenCalledWith('/api/friends/requests');
  });
});

describe('useFriendsIds', () => {
  it('resolves a Set built from a flat array of ids', async () => {
    mockApiGet.mockResolvedValue(['b', 'c']);

    const { result } = await renderHookWithQueryClient(() => useFriendsIds('a'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(new Set(['b', 'c']));
    expect(mockApiGet).toHaveBeenCalledWith('/api/friends/ids');
  });
});

describe('useFriendsList', () => {
  it('resolves friendships with the joined friend profile', async () => {
    const friendships = [{ user_id: 'a', friend_id: 'b', friend: { id: 'b', username: 'bee' } }];
    mockApiGet.mockResolvedValue(friendships);

    const { result } = await renderHookWithQueryClient(() => useFriendsList('a'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(friendships);
    expect(mockApiGet).toHaveBeenCalledWith('/api/friends/list');
  });
});

describe('useFriendCount', () => {
  it('resolves the count from the server', async () => {
    mockApiGet.mockResolvedValue(3);

    const { result } = await renderHookWithQueryClient(() => useFriendCount('a'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(3);
    expect(mockApiGet).toHaveBeenCalledWith('/api/friends/count?userId=a');
  });
});

// useFriendStatus composes useFriendRequests + useFriendsIds + useBlockStatus
// (three separate server calls) into one derived status. Route mockApiGet by
// path so all three sub-hooks resolve in a single render.
function mockFriendStatusData(options: {
  requests?: { requester_id: string; addressee_id: string }[];
  friendIds?: string[];
  blocked?: boolean;
}): void {
  const requests = options.requests ?? [];
  const friendIds = options.friendIds ?? [];
  const blocked = options.blocked ?? false;

  mockApiGet.mockImplementation((path: string) => {
    if (path === '/api/friends/requests') return Promise.resolve(requests);
    if (path === '/api/friends/ids') return Promise.resolve(friendIds);
    if (path.startsWith('/api/blocks/')) return Promise.resolve(blocked);
    throw new Error(`Unexpected path: ${path}`);
  });
}

describe('useFriendStatus', () => {
  it("returns 'unknown' when either id is undefined", async () => {
    mockFriendStatusData({});
    const { result } = await renderHookWithQueryClient(() => useFriendStatus('other', undefined));

    // sessionUserId is undefined so useFriendRequests/useFriendsIds never
    // fire, but otherUserId is defined so useBlockStatus does — flush it to
    // completion before the test ends (see flushPendingQueries above).
    await waitFor(() =>
      expect(mockApiGet).toHaveBeenCalledWith(expect.stringContaining('/api/blocks/'))
    );
    await flushPendingQueries();
    expect(result.current).toBe('unknown');
  });

  it("returns 'self' when comparing a user to themselves", async () => {
    mockFriendStatusData({});
    const { result } = await renderHookWithQueryClient(() => useFriendStatus('a', 'a'));

    // The 'self' branch returns before the isPending checks, but all three
    // sub-hooks still fire in the background (both ids are defined) — flush
    // them to completion before the test ends, same reason as 'unknown'
    // above.
    await waitFor(() =>
      expect(mockApiGet).toHaveBeenCalledWith(expect.stringContaining('/api/blocks/'))
    );
    await flushPendingQueries();
    expect(result.current).toBe('self');
  });

  it("returns 'blocked' when the other user is blocked", async () => {
    mockFriendStatusData({ blocked: true });
    const { result } = await renderHookWithQueryClient(() => useFriendStatus('other', 'a'));

    await waitFor(() => expect(result.current).toBe('blocked'));
  });

  it("returns 'friends' when the other user is in the friend id set", async () => {
    mockFriendStatusData({ friendIds: ['other'] });
    const { result } = await renderHookWithQueryClient(() => useFriendStatus('other', 'a'));

    await waitFor(() => expect(result.current).toBe('friends'));
  });

  it("returns 'incoming' when the other user sent a request to me", async () => {
    mockFriendStatusData({ requests: [{ requester_id: 'other', addressee_id: 'a' }] });
    const { result } = await renderHookWithQueryClient(() => useFriendStatus('other', 'a'));

    await waitFor(() => expect(result.current).toBe('incoming'));
  });

  it("returns 'outgoing' when I sent a request to the other user", async () => {
    mockFriendStatusData({ requests: [{ requester_id: 'a', addressee_id: 'other' }] });
    const { result } = await renderHookWithQueryClient(() => useFriendStatus('other', 'a'));

    await waitFor(() => expect(result.current).toBe('outgoing'));
  });

  it("returns 'none' when there is no relationship at all", async () => {
    mockFriendStatusData({});
    const { result } = await renderHookWithQueryClient(() => useFriendStatus('other', 'a'));

    await waitFor(() => expect(result.current).toBe('none'));
  });
});

describe('useSendFriendRequest', () => {
  it('inserts a friend_requests row and invalidates friendRequests', async () => {
    const insert = jest.fn(() => Promise.resolve({ data: null, error: null }));
    mockFrom.mockReturnValue({ insert });

    const { result, queryClient } = await renderHookWithQueryClient(() => useSendFriendRequest());
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    await act(() => result.current.mutate({ requesterId: 'a', addresseeId: 'b' }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(insert).toHaveBeenCalledWith({ requester_id: 'a', addressee_id: 'b' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['friendRequests'] });
  });
});

describe('useDeleteFriendRequest', () => {
  it('deletes the matching friend_requests row and invalidates friendRequests', async () => {
    const eq2 = jest.fn(() => Promise.resolve({ data: null, error: null }));
    const eq1 = jest.fn(() => ({ eq: eq2 }));
    const del = jest.fn(() => ({ eq: eq1 }));
    mockFrom.mockReturnValue({ delete: del });

    const { result, queryClient } = await renderHookWithQueryClient(() => useDeleteFriendRequest());
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    await act(() => result.current.mutate({ requesterId: 'a', addresseeId: 'b' }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(eq1).toHaveBeenCalledWith('requester_id', 'a');
    expect(eq2).toHaveBeenCalledWith('addressee_id', 'b');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['friendRequests'] });
  });
});

describe('useAcceptFriendRequest', () => {
  it('calls accept_friend_request and invalidates both friendRequests and friends', async () => {
    mockRpc.mockReturnValue(Promise.resolve({ data: null, error: null }));

    const { result, queryClient } = await renderHookWithQueryClient(() => useAcceptFriendRequest());
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    await act(() => result.current.mutate({ otherUserId: 'b' }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockRpc).toHaveBeenCalledWith('accept_friend_request', { other_user_id: 'b' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['friendRequests'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['friends'] });
  });
});

describe('useRemoveFriendship', () => {
  it('calls remove_friendship and invalidates friends', async () => {
    mockRpc.mockReturnValue(Promise.resolve({ data: null, error: null }));

    const { result, queryClient } = await renderHookWithQueryClient(() => useRemoveFriendship());
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    await act(() => result.current.mutate({ otherUserId: 'b' }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockRpc).toHaveBeenCalledWith('remove_friendship', { other_user_id: 'b' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['friends'] });
  });
});
