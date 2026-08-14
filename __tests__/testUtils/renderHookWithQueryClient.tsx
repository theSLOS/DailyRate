import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, RenderHookResult } from '@testing-library/react-native';

export async function renderHookWithQueryClient<TResult, TProps>(
  callback: (props: TProps) => TResult
): Promise<RenderHookResult<TResult, TProps> & { queryClient: QueryClient }> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  function wrapper({ children }: { children: ReactNode }): ReactNode {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  // testing-library/react-native v14's renderHook is async (it awaits the
  // underlying render), so this helper must be too — awaiting here instead
  // of at every call site would still leave `result` a Promise.
  const result = await renderHook(callback, { wrapper });
  return { ...result, queryClient };
}
