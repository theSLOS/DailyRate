import { act, waitFor } from '@testing-library/react-native';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { renderHookWithQueryClient } from './testUtils/renderHookWithQueryClient';

const unsubscribe = jest.fn();
let authStateCallback: ((event: string, session: unknown) => void) | undefined;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
    },
  },
}));

const mockGetSession = supabase.auth.getSession as jest.Mock;
const mockOnAuthStateChange = supabase.auth.onAuthStateChange as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  authStateCallback = undefined;
  mockOnAuthStateChange.mockImplementation((callback) => {
    authStateCallback = callback;
    return { data: { subscription: { unsubscribe } } };
  });
});

describe('useAuth', () => {
  it('starts loading, then resolves the initial session', async () => {
    const session = { user: { id: 'user-1' } };
    mockGetSession.mockResolvedValue({ data: { session } });

    const { result } = await renderHookWithQueryClient(() => useAuth());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toEqual(session);
  });

  it('resolves session: null when signed out', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const { result } = await renderHookWithQueryClient(() => useAuth());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toBeNull();
  });

  it('updates session when the auth state change subscription fires', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const { result } = await renderHookWithQueryClient(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const newSession = { user: { id: 'user-2' } };
    await act(() => {
      authStateCallback?.('SIGNED_IN', newSession);
    });

    await waitFor(() => expect(result.current.session).toEqual(newSession));
  });

  it('unsubscribes from auth state changes on unmount', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const { unmount } = await renderHookWithQueryClient(() => useAuth());
    await unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });
});
