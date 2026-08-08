type QueryResult<T> = { data: T; error: null } | { data: null; error: { message: string } };

// Mimics supabase-js's query builder: every filter/modifier method (`select`,
// `eq`, `order`, ...) returns the same chainable object, and the object
// itself is thenable — so `await supabase.from(...).select().eq()` resolves
// to `result` no matter how many methods were chained, same as the real
// PostgrestFilterBuilder.
export function makeQueryChainMock<T>(result: QueryResult<T>): Record<string, jest.Mock> {
  const chainMethods = ['select', 'eq', 'neq', 'order', 'limit', 'range'];
  const chain: Record<string, jest.Mock> = {};

  for (const method of chainMethods) {
    chain[method] = jest.fn(() => chain);
  }
  chain.single = jest.fn(() => Promise.resolve(result));
  chain.maybeSingle = jest.fn(() => Promise.resolve(result));
  chain.then = jest.fn((onFulfilled: (value: QueryResult<T>) => unknown) =>
    Promise.resolve(result).then(onFulfilled)
  );

  return chain;
}
