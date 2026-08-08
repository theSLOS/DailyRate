import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, RenderHookResult } from '@testing-library/react-native';

export function renderHookWithQueryClient<TResult, TProps>(
  callback: (props: TProps) => TResult
): RenderHookResult<TResult, TProps> & { queryClient: QueryClient } {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  function wrapper({ children }: { children: ReactNode }): ReactNode {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  const result = renderHook(callback, { wrapper });
  return { ...result, queryClient };
}
