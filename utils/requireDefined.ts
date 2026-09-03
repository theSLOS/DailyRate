/**
 * Narrows a possibly-null/undefined value to its defined type, throwing
 * with a caller-supplied message otherwise.
 */

/** Returns value if it's defined, otherwise throws an Error with the given message. */
export function requireDefined<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
  return value;
}
