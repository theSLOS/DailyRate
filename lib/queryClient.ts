/**
 * The single shared TanStack Query client instance, provided app-wide via
 * `QueryClientProvider` in `app/_layout.tsx`.
 */
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient();
