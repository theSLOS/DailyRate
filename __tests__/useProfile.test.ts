import { waitFor } from '@testing-library/react-native';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/lib/supabase';
import { renderHookWithQueryClient } from './testUtils/renderHookWithQueryClient';
import { makeQueryChainMock } from './testUtils/supabaseMock';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

const mockFrom = supabase.from as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useProfile', () => {
  it('resolves the public profile row for a given user id', async () => {
    const profile = {
      id: 'user-1',
      username: 'sam',
      display_name: 'Sam',
      avatar_url: null,
    };
    mockFrom.mockReturnValue(makeQueryChainMock({ data: profile, error: null }));

    const { result } = await renderHookWithQueryClient(() => useProfile('user-1'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(profile);
    expect(mockFrom).toHaveBeenCalledWith('profiles_public');
  });

  it('resolves null when no profile row exists', async () => {
    mockFrom.mockReturnValue(makeQueryChainMock({ data: null, error: null }));

    const { result } = await renderHookWithQueryClient(() => useProfile('user-1'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('does not query and stays disabled when userId is undefined', async () => {
    const { result } = await renderHookWithQueryClient(() => useProfile(undefined));

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
