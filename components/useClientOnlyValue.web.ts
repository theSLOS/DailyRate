/**
 * Web variant of the client/server value selector — returns the server
 * value on first render (avoiding a hydration mismatch), then swaps to the
 * client value once mounted. See useClientOnlyValue.ts for the native variant.
 */
import React from 'react';

// useEffect doesn't run on the server, so this safely detects client vs server rendering
/** Returns the server value until mounted, then the client value. */
export function useClientOnlyValue<S, C>(server: S, client: C): S | C {
  const [value, setValue] = React.useState<S | C>(server);
  React.useEffect(() => {
    setValue(client);
  }, [client]);

  return value;
}
