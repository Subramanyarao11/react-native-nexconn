/**
 * Internal boundary between the typed client and the selected native engine.
 * The production implementation is the Codegen TurboModule
 * (`nativeTransport.ts`); tests use `react-native-nexconn/testing`.
 */

/** Envelope of every event emitted by the native layer. */
export interface NativeEventEnvelope {
  /** `Handler.method` for SDK events or `op.*` for operation progress. */
  readonly type: string;
  /** Native session generation at emission time. */
  readonly generation: number;
  /** Set for `op.*` events: the JS-provided operation id. */
  readonly opId?: string;
  readonly payload: unknown;
}

export type TransportPlatform = 'android' | 'ios' | 'unsupported';

export interface Transport {
  readonly platform: TransportPlatform;
  /**
   * Invokes a bridge method. Resolves with the decoded `value` or rejects
   * with an error whose message is the bridge's JSON error payload.
   */
  invoke(
    method: string,
    args: Readonly<Record<string, unknown>>
  ): Promise<unknown>;
  /** Registers an event listener; returns an idempotent unsubscribe. */
  addListener(listener: (event: NativeEventEnvelope) => void): () => void;
}

/** Validates a raw JSON event string from native code. */
export function decodeEnvelope(raw: string): NativeEventEnvelope | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const record = parsed as Record<string, unknown>;
  if (typeof record.type !== 'string') return undefined;
  return {
    type: record.type,
    generation: typeof record.generation === 'number' ? record.generation : 0,
    opId: typeof record.opId === 'string' ? record.opId : undefined,
    payload: record.payload,
  };
}

/** Decodes the `{"v": ...}` result wrapper used by both native layers. */
export function decodeResult(raw: string): unknown {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed === 'object' && parsed !== null && 'v' in parsed) {
    return (parsed as { v: unknown }).v;
  }
  throw new Error(
    JSON.stringify({ category: 'internal', message: 'Malformed native result' })
  );
}
