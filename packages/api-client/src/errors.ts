import { codeFromSqlState, safeMessage, KovaError, type ErrorCode } from '@kova/domain';

interface PgLikeError {
  code?: string;
  message?: string;
  status?: number;
  name?: string;
}

/** Map any supabase-js / fetch error to a KovaError with a safe message (no SQL details). */
export function toKovaError(err: unknown, status?: number): KovaError {
  if (err instanceof KovaError) return err;
  const e = (err ?? {}) as PgLikeError;

  const httpStatus = status ?? e.status;
  let code: ErrorCode;
  // fetch() failures and aborted requests never reached the server. Any other TypeError is a bug in
  // our code and must not pass for "no connection".
  if (e.name === 'AbortError' || /fetch failed|network request failed|failed to fetch|load failed|network/i.test(e.message ?? '')) {
    code = 'NETWORK';
  } else {
    code = codeFromSqlState(e.code);
    if (code === 'INTERNAL') {
      if (httpStatus === 401) code = 'UNAUTHENTICATED';
      else if (httpStatus === 403) code = 'FORBIDDEN';
      else if (httpStatus === 404) code = 'NOT_FOUND';
      else if (httpStatus === 429) code = 'RATE_LIMITED';
      else if (httpStatus !== undefined && httpStatus >= 500) code = 'NETWORK'; // transient server/gateway error
    }
  }
  // The user only sees the safe message; the raw cause (never the payload) goes to the console/logcat.
  if (code === 'NETWORK' || code === 'INTERNAL') {
    console.warn('[kova] request failed:', code, e.name ?? '', e.code ?? '', httpStatus ?? '', (e.message ?? '').slice(0, 300));
  }
  return new KovaError(code, safeMessage(code));
}

export interface SupabaseResult {
  data: unknown;
  error: unknown;
  status?: number;
}

/** Unwrap a supabase-js `{ data, error }` result. */
export function unwrap<R extends SupabaseResult>(res: R): NonNullable<R['data']> {
  if (res.error) throw toKovaError(res.error, res.status);
  return res.data as NonNullable<R['data']>;
}
