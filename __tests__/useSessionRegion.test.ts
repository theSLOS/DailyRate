import { waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { useSessionRegion } from '@/hooks/useSessionRegion';
import { apiGet } from '@/lib/apiClient';
import { renderHookWithQueryClient } from './testUtils/renderHookWithQueryClient';

jest.mock('@/lib/apiClient', () => ({ apiGet: jest.fn() }));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Lowest: 1 },
}));

const mockApiGet = apiGet as jest.Mock;
const mockRequestPermission = Location.requestForegroundPermissionsAsync as jest.Mock;
const mockGetPosition = Location.getCurrentPositionAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useSessionRegion', () => {
  it('resolves unavailable/permission-denied without requesting a position', async () => {
    mockRequestPermission.mockResolvedValue({ status: 'denied' });

    const { result } = await renderHookWithQueryClient(() => useSessionRegion('user-1'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ status: 'unavailable', reason: 'permission-denied' });
    expect(mockGetPosition).not.toHaveBeenCalled();
  });

  it('resolves unavailable/no-match when the server finds no match', async () => {
    mockRequestPermission.mockResolvedValue({ status: 'granted' });
    mockGetPosition.mockResolvedValue({ coords: { longitude: -150, latitude: 0 } });
    mockApiGet.mockResolvedValue(null);

    const { result } = await renderHookWithQueryClient(() => useSessionRegion('user-1'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ status: 'unavailable', reason: 'no-match' });
  });

  it('resolves a region and maps snake_case columns to camelCase', async () => {
    mockRequestPermission.mockResolvedValue({ status: 'granted' });
    mockGetPosition.mockResolvedValue({ coords: { longitude: 151.2, latitude: -33.8 } });
    mockApiGet.mockResolvedValue({
      country_code: 'AU',
      state_code: 'AU-NSW',
      place_label: 'New South Wales, Australia',
    });

    const { result } = await renderHookWithQueryClient(() => useSessionRegion('user-1'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      status: 'resolved',
      region: { countryCode: 'AU', stateCode: 'AU-NSW', placeLabel: 'New South Wales, Australia' },
    });
    expect(mockApiGet).toHaveBeenCalledWith('/api/region?lat=-33.8&lng=151.2');
  });

  it('surfaces a server error as a plain Error', async () => {
    mockRequestPermission.mockResolvedValue({ status: 'granted' });
    mockGetPosition.mockResolvedValue({ coords: { longitude: 0, latitude: 0 } });
    mockApiGet.mockRejectedValue(new Error('boom'));

    const { result } = await renderHookWithQueryClient(() => useSessionRegion('user-1'));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('boom');
  });

  it('stays disabled when the caller gates it off (lazy call-site)', async () => {
    const { result } = await renderHookWithQueryClient(() => useSessionRegion('user-1', false));

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it('is configured to never automatically refetch (staleTime/gcTime: Infinity)', async () => {
    mockRequestPermission.mockResolvedValue({ status: 'denied' });

    const { result, queryClient } = await renderHookWithQueryClient(() =>
      useSessionRegion('user-1')
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const query = queryClient.getQueryCache().find({ queryKey: ['region', { userId: 'user-1' }] });
    const options = query?.options as { staleTime?: number; gcTime?: number } | undefined;
    expect(options?.staleTime).toBe(Infinity);
    expect(options?.gcTime).toBe(Infinity);
  });
});
