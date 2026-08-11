import { pickAndCompressImage } from '@/utils/pickAndCompressImage';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}));

const mockRequestPermission = ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock;
const mockLaunchLibrary = ImagePicker.launchImageLibraryAsync as jest.Mock;
const mockManipulate = ImageManipulator.manipulateAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('pickAndCompressImage', () => {
  it('returns null and never opens the picker when permission is denied', async () => {
    mockRequestPermission.mockResolvedValue({ granted: false });

    const uri = await pickAndCompressImage();

    expect(uri).toBeNull();
    expect(mockLaunchLibrary).not.toHaveBeenCalled();
  });

  it('returns null when the user cancels the picker', async () => {
    mockRequestPermission.mockResolvedValue({ granted: true });
    mockLaunchLibrary.mockResolvedValue({ canceled: true });

    const uri = await pickAndCompressImage();

    expect(uri).toBeNull();
    expect(mockManipulate).not.toHaveBeenCalled();
  });

  it('resizes and compresses the picked image, returning the manipulated uri', async () => {
    mockRequestPermission.mockResolvedValue({ granted: true });
    mockLaunchLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/original.jpg' }],
    });
    mockManipulate.mockResolvedValue({ uri: 'file:///tmp/compressed.jpg' });

    const uri = await pickAndCompressImage();

    expect(uri).toBe('file:///tmp/compressed.jpg');
    expect(mockManipulate).toHaveBeenCalledWith(
      'file:///tmp/original.jpg',
      [{ resize: { width: 1080 } }],
      { compress: 0.7, format: 'jpeg' }
    );
  });
});
