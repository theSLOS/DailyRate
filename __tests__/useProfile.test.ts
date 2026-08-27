import { waitFor } from '@testing-library/react-native';
import { useProfile } from '@/hooks/useProfile';
import { apiGet } from '@/lib/apiClient';
import { renderHookWithQueryClient } from './testUtils/renderHookWithQueryClient';

jest.mock('@/lib/apiClient', () => ({ apiGet: jest.fn() }));

const mockApiGet = apiGet as jest.Mock;

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
    mockApiGet.mockResolvedValue(profile);

    const { result } = await renderHookWithQueryClient(() => useProfile('user-1'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(profile);
    expect(mockApiGet).toHaveBeenCalledWith('/api/profiles/user-1');
  });

  it('resolves null when no profile row exists', async () => {
    mockApiGet.mockResolvedValue(null);

    const { result } = await renderHookWithQueryClient(() => useProfile('user-1'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('does not query and stays disabled when userId is undefined', async () => {
    const { result } = await renderHookWithQueryClient(() => useProfile(undefined));

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockApiGet).not.toHaveBeenCalled();
  });
});
