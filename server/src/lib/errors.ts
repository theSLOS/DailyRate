/**
 * The one error type every route throws — carries the HTTP status and the
 * `{ code, message }` pair the error handler serializes.
 */

/** An error with an HTTP status and a stable code, for errorHandler to serialize as JSON. */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}
