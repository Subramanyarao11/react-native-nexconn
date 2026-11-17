/**
 * Stable wrapper error categories. The native SDK code (when any) is kept in
 * `nativeCode` so applications can map vendor status codes themselves.
 */
export type NexconnErrorCategory =
  | 'not_linked' // The native module is not installed in this binary.
  | 'not_initialized' // initialize() has not been called.
  | 'already_initialized' // initialize() was called with a different App Key.
  | 'invalid_argument' // The bridge rejected the input before calling the SDK.
  | 'unsupported' // The capability does not exist on this platform's SDK.
  | 'busy' // A conflicting lifecycle operation is in progress.
  | 'canceled' // The operation was canceled (e.g. media upload cancel).
  | 'not_found' // A referenced message, query or object could not be resolved.
  | 'limit_exceeded' // Bridge resource limits (for example live queries).
  | 'stale_session' // The result belongs to a previous connection session.
  | 'native' // The Nexconn SDK reported an error code.
  | 'internal'; // Unexpected bridge failure.

export interface NexconnErrorInit {
  category: NexconnErrorCategory;
  message: string;
  method?: string;
  nativeCode?: number;
  detail?: unknown;
}

export class NexconnError extends Error {
  readonly category: NexconnErrorCategory;
  readonly method: string | undefined;
  readonly nativeCode: number | undefined;
  readonly detail: unknown;

  constructor(init: NexconnErrorInit) {
    super(init.message);
    this.name = 'NexconnError';
    this.category = init.category;
    this.method = init.method;
    this.nativeCode = init.nativeCode;
    this.detail = init.detail;
  }
}

export function isNexconnError(value: unknown): value is NexconnError {
  return value instanceof NexconnError;
}

const CATEGORIES: ReadonlySet<string> = new Set<NexconnErrorCategory>([
  'not_linked',
  'not_initialized',
  'already_initialized',
  'invalid_argument',
  'unsupported',
  'busy',
  'canceled',
  'not_found',
  'limit_exceeded',
  'stale_session',
  'native',
  'internal',
]);

/**
 * Native rejections carry a JSON message:
 * `{"category":"native","code":31004,"message":"...","method":"engine.connect"}`.
 * Anything else is wrapped as an internal error without losing the text.
 */
export function decodeNativeError(
  error: unknown,
  method: string
): NexconnError {
  if (error instanceof NexconnError) return error;
  const text =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : String(error);
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null) {
      const record = parsed as Record<string, unknown>;
      const category =
        typeof record.category === 'string' && CATEGORIES.has(record.category)
          ? (record.category as NexconnErrorCategory)
          : 'internal';
      return new NexconnError({
        category,
        message:
          typeof record.message === 'string' ? record.message : 'Native error',
        method: typeof record.method === 'string' ? record.method : method,
        nativeCode: typeof record.code === 'number' ? record.code : undefined,
        detail: record.detail,
      });
    }
  } catch {
    // Not a bridge-formatted payload.
  }
  return new NexconnError({ category: 'internal', message: text, method });
}
