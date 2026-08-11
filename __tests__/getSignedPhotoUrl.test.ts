import { getSignedPhotoUrl } from '@/utils/getSignedPhotoUrl';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({ supabase: { storage: { from: jest.fn() } } }));

const mockStorageFrom = supabase.storage.from as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getSignedPhotoUrl', () => {
  it('returns the signed URL for a given path', async () => {
    const createSignedUrl = jest.fn(() =>
      Promise.resolve({ data: { signedUrl: 'https://signed.example.com/x.jpg' }, error: null })
    );
    mockStorageFrom.mockReturnValue({ createSignedUrl });

    const url = await getSignedPhotoUrl('abc/def.jpg');

    expect(url).toBe('https://signed.example.com/x.jpg');
    expect(mockStorageFrom).toHaveBeenCalledWith('post-photos');
    expect(createSignedUrl).toHaveBeenCalledWith('abc/def.jpg', 3600);
  });

  it('throws the storage error when signing fails', async () => {
    const createSignedUrl = jest.fn(() =>
      Promise.resolve({ data: null, error: { message: 'not found' } })
    );
    mockStorageFrom.mockReturnValue({ createSignedUrl });

    await expect(getSignedPhotoUrl('missing.jpg')).rejects.toEqual({ message: 'not found' });
  });
});
