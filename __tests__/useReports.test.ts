import { act, waitFor } from '@testing-library/react-native';
import { useSubmitReport } from '@/hooks/useReports';
import { supabase } from '@/lib/supabase';
import { renderHookWithQueryClient } from './testUtils/renderHookWithQueryClient';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

const mockFrom = supabase.from as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useSubmitReport', () => {
  it('inserts a report with the given fields', async () => {
    const insert = jest.fn(() => Promise.resolve({ data: null, error: null }));
    mockFrom.mockReturnValue({ insert });

    const { result } = await renderHookWithQueryClient(() => useSubmitReport());

    await act(() =>
      result.current.mutate({
        reporterId: 'user-1',
        targetType: 'post',
        targetId: 'post-1',
        reason: 'spam',
      })
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledWith('reports');
    expect(insert).toHaveBeenCalledWith({
      reporter_id: 'user-1',
      target_type: 'post',
      target_id: 'post-1',
      reason: 'spam',
    });
  });

  it('surfaces an insert error as isError', async () => {
    const insert = jest.fn(() =>
      Promise.resolve({ data: null, error: { message: 'insert failed' } })
    );
    mockFrom.mockReturnValue({ insert });

    const { result } = await renderHookWithQueryClient(() => useSubmitReport());

    await act(() =>
      result.current.mutate({
        reporterId: 'user-1',
        targetType: 'comment',
        targetId: 'comment-1',
        reason: 'abuse',
      })
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
