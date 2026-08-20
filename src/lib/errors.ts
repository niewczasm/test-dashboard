/**
 * Node's fetch() reports network failures (DNS, connection refused, TLS, timeouts)
 * as a generic "fetch failed" Error with the real reason nested in `.cause`.
 * Surface that nested reason so sync logs are actually actionable.
 */
export function describeError(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as { cause?: unknown }).cause;
    const causeMessage =
      cause instanceof Error ? cause.message : typeof cause === "string" ? cause : null;
    return causeMessage && causeMessage !== err.message
      ? `${err.message}: ${causeMessage}`
      : err.message;
  }
  return String(err);
}
