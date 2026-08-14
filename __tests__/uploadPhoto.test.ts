import { uploadPhoto } from '@/utils/uploadPhoto';
import { supabase } from '@/lib/supabase';
import * as Crypto from 'expo-crypto';

jest.mock('@/lib/supabase', () => ({ supabase: { storage: { from: jest.fn() } } }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));

const mockStorageFrom = supabase.storage.from as jest.Mock;
const mockRandomUUID = Crypto.randomUUID as jest.Mock;

const mockBlob = { size: 123 } as Blob;

beforeEach(() => {
  jest.clearAllMocks();
  mockRandomUUID.mockReturnValue('11111111-1111-1111-1111-111111111111');
  global.fetch = jest.fn(() =>
    Promise.resolve({ blob: () => Promise.resolve(mockBlob) })
  ) as unknown as typeof fetch;
});

describe('uploadPhoto', () => {
  it('fetches the local uri, uploads it under a fresh random path, and returns that path', async () => {
    const upload = jest.fn(() => Promise.resolve({ data: { path: 'ignored' }, error: null }));
    mockStorageFrom.mockReturnValue({ upload });

    const path = await uploadPhoto('file:///tmp/photo.jpg');

    expect(global.fetch).toHaveBeenCalledWith('file:///tmp/photo.jpg');
    expect(path).toBe('11111111-1111-1111-1111-111111111111.jpg');
    expect(mockStorageFrom).toHaveBeenCalledWith('post-photos');
    expect(upload).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111.jpg', mockBlob, {
      contentType: 'image/jpeg',
    });
  });

  it('throws the storage error when the upload fails', async () => {
    const upload = jest.fn(() =>
      Promise.resolve({ data: null, error: { message: 'quota exceeded' } })
    );
    mockStorageFrom.mockReturnValue({ upload });

    await expect(uploadPhoto('file:///tmp/photo.jpg')).rejects.toEqual({
      message: 'quota exceeded',
    });
  });
});
