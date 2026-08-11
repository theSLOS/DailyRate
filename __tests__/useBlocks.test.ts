import { act, waitFor } from '@testing-library/react-native';
import { useBlockStatus, useToggleBlock } from '@/hooks/useBlocks';
import { supabase } from '@/lib/supabase';
import { renderHookWithQueryClient } from './testUtils/renderHookWithQueryClient';
import { makeQueryChainMock } from './testUtils/supabaseMock';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

const mockFrom = supabase.from as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useBlockStatus', () => {
  it('resolves true when a block row exists', async () => {
    mockFrom.mockReturnValue(
      makeQueryChainMock({ data: { blocker_id: 'a', blocked_id: 'b' }, error: null })
    );

    const { result } = await renderHookWithQueryClient(() => useBlockStatus('b'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith('blocks');
  });

  it('resolves false when no block row exists', async () => {
    mockFrom.mockReturnValue(makeQueryChainMock({ data: null, error: null }));

    const { result } = await renderHookWithQueryClient(() => useBlockStatus('b'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(false);
  });
});

describe('useToggleBlock', () => {
  it('inserts a block row when not currently blocked', async () => {
    const insert = jest.fn(() => Promise.resolve({ data: null, error: null }));
    mockFrom.mockReturnValue({ insert });

    const { result } = await renderHookWithQueryClient(() => useToggleBlock());

    await act(() =>
      result.current.mutate({ blockerId: 'a', blockedUserId: 'b', isCurrentlyBlocked: false })
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(insert).toHaveBeenCalledWith({ blocker_id: 'a', blocked_id: 'b' });
  });

  it('deletes the block row when currently blocked', async () => {
    const eq2 = jest.fn(() => Promise.resolve({ data: null, error: null }));
    const eq1 = jest.fn(() => ({ eq: eq2 }));
    const del = jest.fn(() => ({ eq: eq1 }));
    mockFrom.mockReturnValue({ delete: del });

    const { result } = await renderHookWithQueryClient(() => useToggleBlock());

    await act(() =>
      result.current.mutate({ blockerId: 'a', blockedUserId: 'b', isCurrentlyBlocked: true })
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(del).toHaveBeenCalled();
    expect(eq1).toHaveBeenCalledWith('blocker_id', 'a');
    expect(eq2).toHaveBeenCalledWith('blocked_id', 'b');
  });
});
