import { decodeNativeError, NexconnError } from './errors.ts';
import { translateNativeEvent } from './normalize.ts';
import type { NativeEventEnvelope, Transport } from './transport.ts';
import type { NexconnEventMap, NexconnEventName } from './types.ts';

type Listener<K extends NexconnEventName> = (
  payload: NexconnEventMap[K]
) => void;
type AnyListener = (payload: unknown) => void;

export interface OperationHandlers {
  onEvent(type: string, payload: unknown): void;
}

/** Maximum operations (sends/downloads) tracked concurrently. */
const MAX_OPERATIONS = 256;

/**
 * Shared invocation and event plumbing used by every client module.
 *
 * - Serializes arguments and decodes errors into `NexconnError`.
 * - Fans native events out to typed listeners.
 * - Drops SDK events from an older session generation so callbacks from a
 *   previous user cannot update the current user's state.
 * - Routes `op.*` progress events to the operation that requested them.
 */
export class Bridge {
  readonly transport: Transport;
  private generationValue = 0;
  private readonly listeners = new Map<NexconnEventName, Set<AnyListener>>();
  private readonly operations = new Map<string, OperationHandlers>();
  private opCounter = 0;
  private readonly unsubscribeTransport: () => void;
  private disposed = false;

  constructor(transport: Transport) {
    this.transport = transport;
    this.unsubscribeTransport = transport.addListener((event) =>
      this.handleEnvelope(event)
    );
  }

  get generation(): number {
    return this.generationValue;
  }

  /** Called with the generation returned by connect/disconnect. */
  setGeneration(generation: number): void {
    if (generation > this.generationValue) this.generationValue = generation;
  }

  async invoke<T = unknown>(
    method: string,
    args: Readonly<Record<string, unknown>> = {}
  ): Promise<T> {
    if (this.disposed) {
      throw new NexconnError({
        category: 'internal',
        message: 'Client has been disposed',
        method,
      });
    }
    try {
      return (await this.transport.invoke(method, args)) as T;
    } catch (error) {
      throw decodeNativeError(error, method);
    }
  }

  /** Creates an operation id whose `op.*` events go to `handlers`. */
  beginOperation(handlers: OperationHandlers): string {
    if (this.operations.size >= MAX_OPERATIONS) {
      throw new NexconnError({
        category: 'limit_exceeded',
        message: `More than ${MAX_OPERATIONS} concurrent operations`,
      });
    }
    this.opCounter += 1;
    const id = `op-${Date.now().toString(36)}-${this.opCounter}`;
    this.operations.set(id, handlers);
    return id;
  }

  endOperation(id: string): void {
    this.operations.delete(id);
  }

  on<K extends NexconnEventName>(event: K, listener: Listener<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    const entry = listener as AnyListener;
    set.add(entry);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      set.delete(entry);
    };
  }

  listenerCount(event?: NexconnEventName): number {
    if (event) return this.listeners.get(event)?.size ?? 0;
    let total = 0;
    for (const set of this.listeners.values()) total += set.size;
    return total;
  }

  /** Emits a JS-originated event (used for synthesized events). */
  emit<K extends NexconnEventName>(
    event: K,
    payload: NexconnEventMap[K]
  ): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        listener(payload);
      } catch (error) {
        // A listener failure must not break delivery to other listeners.
        reportListenerError(error);
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeTransport();
    this.listeners.clear();
    this.operations.clear();
  }

  private handleEnvelope(envelope: NativeEventEnvelope): void {
    if (envelope.type.startsWith('op.')) {
      if (envelope.opId) {
        this.operations
          .get(envelope.opId)
          ?.onEvent(envelope.type, envelope.payload);
      }
      return;
    }
    const isConnectionEvent =
      envelope.type === 'ConnectionStatusHandler.onConnectionStatusChanged';
    if (!isConnectionEvent && envelope.generation < this.generationValue) {
      return; // Late callback from a previous session.
    }
    this.setGeneration(envelope.generation);
    let translated;
    try {
      translated = translateNativeEvent(envelope.type, envelope.payload);
    } catch (error) {
      reportListenerError(error);
      return;
    }
    this.emit(translated.name, translated.payload as never);
  }
}

function reportListenerError(error: unknown): void {
  const consoleRef = (
    globalThis as { console?: { error?: (...a: unknown[]) => void } }
  ).console;
  consoleRef?.error?.('[react-native-nexconn] listener error', error);
}
