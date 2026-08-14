import { act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHiddenPostsIds, useHidePost } from '@/hooks/useHiddenPosts';
import { HIDDEN_POSTS_STORAGE_KEY } from '@/constants/posts';
import { renderHookWithQueryClient } from './testUtils/renderHookWithQueryClient';

// jest.mock's factory can't use a top-level import (hoisting), so require() is
// the only option here — this is the package's own documented mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('useHiddenPostsIds', () => {
  it('resolves an empty set when nothing has been hidden yet', async () => {
    const { result } = await renderHookWithQueryClient(() => useHiddenPostsIds());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(new Set());
  });

  it('resolves the stored ids as a Set', async () => {
    await AsyncStorage.setItem(HIDDEN_POSTS_STORAGE_KEY, JSON.stringify(['post-1', 'post-2']));

    const { result } = await renderHookWithQueryClient(() => useHiddenPostsIds());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(new Set(['post-1', 'post-2']));
  });
});

describe('useHidePost', () => {
  it('appends a new post id to storage and invalidates hiddenPosts', async () => {
    await AsyncStorage.setItem(HIDDEN_POSTS_STORAGE_KEY, JSON.stringify(['post-1']));

    const { result, queryClient } = await renderHookWithQueryClient(() => useHidePost());
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    await act(() => result.current.mutate('post-2'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const stored = await AsyncStorage.getItem(HIDDEN_POSTS_STORAGE_KEY);
    expect(JSON.parse(stored as string)).toEqual(['post-1', 'post-2']);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['hiddenPosts'] });
  });

  it('does not duplicate an id that is already hidden', async () => {
    await AsyncStorage.setItem(HIDDEN_POSTS_STORAGE_KEY, JSON.stringify(['post-1']));

    const { result } = await renderHookWithQueryClient(() => useHidePost());

    await act(() => result.current.mutate('post-1'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const stored = await AsyncStorage.getItem(HIDDEN_POSTS_STORAGE_KEY);
    expect(JSON.parse(stored as string)).toEqual(['post-1']);
  });
});
