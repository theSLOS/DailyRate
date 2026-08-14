import { waitFor } from '@testing-library/react-native';
import { useEnsureTimezone } from '@/hooks/useEnsureTimezone';
import { supabase } from '@/lib/supabase';
import { renderHookWithQueryClient } from './testUtils/renderHookWithQueryClient';
import type { Session } from '@supabase/supabase-js';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

const mockFrom = supabase.from as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(
    () =>
      ({
        resolvedOptions: () => ({ timeZone: 'Australia/Sydney' }),
      }) as unknown as Intl.DateTimeFormat
  );
});

afterEach(() => {
  jest.restoreAllMocks();
});

function makeSession(userId: string): Session {
  return { user: { id: userId } } as Session;
}

describe('useEnsureTimezone', () => {
  it('does nothing when there is no session', async () => {
    await renderHookWithQueryClient(() => useEnsureTimezone(null));

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('backfills the device timezone for a signed-in user with no timezone set', async () => {
    let settled: Promise<{ error: null }> = Promise.resolve({ error: null });
    const is = jest.fn(() => {
      settled = Promise.resolve({ error: null });
      return settled;
    });
    const eq = jest.fn(() => ({ is }));
    const update = jest.fn(() => ({ eq }));
    mockFrom.mockReturnValue({ update });

    await renderHookWithQueryClient(() => useEnsureTimezone(makeSession('user-1')));

    // Wait for the actual promise the effect is awaiting, not just that
    // update() was invoked — otherwise the test ends before that promise
    // settles and its resolution lands outside any act() scope, racing the
    // next test (the same class of bug this project already hit once).
    await waitFor(() => expect(is).toHaveBeenCalled());
    await settled;
    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(update).toHaveBeenCalledWith({ timezone: 'Australia/Sydney' });
    expect(eq).toHaveBeenCalledWith('id', 'user-1');
    expect(is).toHaveBeenCalledWith('timezone', null);
  });

  it('logs, but does not throw, when the update fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const is = jest.fn(() => Promise.resolve({ error: { message: 'update failed' } }));
    const eq = jest.fn(() => ({ is }));
    const update = jest.fn(() => ({ eq }));
    mockFrom.mockReturnValue({ update });

    await renderHookWithQueryClient(() => useEnsureTimezone(makeSession('user-1')));

    await waitFor(() => expect(consoleError).toHaveBeenCalled());
  });
});
