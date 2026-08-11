import { waitFor } from '@testing-library/react-native';
import { useSignedPhotoUrl } from '@/hooks/useSignedPhotoUrl';
import { getSignedPhotoUrl } from '@/utils/getSignedPhotoUrl';
import { renderHookWithQueryClient } from './testUtils/renderHookWithQueryClient';

jest.mock('@/utils/getSignedPhotoUrl', () => ({ getSignedPhotoUrl: jest.fn() }));

const mockGetSignedPhotoUrl = getSignedPhotoUrl as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useSignedPhotoUrl', () => {
  it('delegates to the getSignedPhotoUrl util for a given path', async () => {
    mockGetSignedPhotoUrl.mockResolvedValue('https://signed.example.com/photo.jpg');

    const { result } = await renderHookWithQueryClient(() =>
      useSignedPhotoUrl('post-photos/abc.jpg')
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe('https://signed.example.com/photo.jpg');
    expect(mockGetSignedPhotoUrl).toHaveBeenCalledWith('post-photos/abc.jpg');
  });

  it('stays disabled with no call when path is null', async () => {
    const { result } = await renderHookWithQueryClient(() => useSignedPhotoUrl(null));

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetSignedPhotoUrl).not.toHaveBeenCalled();
  });
});
