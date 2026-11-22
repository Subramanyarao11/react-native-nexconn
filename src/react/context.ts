/**
 * Provider, client access and shared helpers used by every hook module.
 */
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { ClientSnapshot, NexconnClient } from '../core/client.ts';
import { ConnectionStatus } from '../core/enums.ts';
import type { NexconnEventMap, NexconnEventName } from '../core/types.ts';

const ClientContext = createContext<NexconnClient | null>(null);

export interface NexconnProviderProps {
  client: NexconnClient;
  children?: ReactNode;
  /**
   * Re-reads the native session on mount (default true), so a JS reload
   * while the native SDK stays connected restores the signed-in state.
   */
  restoreSession?: boolean;
}

/** Makes a client available to the hooks. */
export function NexconnProvider({
  client,
  children,
  restoreSession = true,
}: NexconnProviderProps) {
  useEffect(() => {
    if (restoreSession) client.restoreSession().catch(() => undefined);
  }, [client, restoreSession]);
  return createElement(ClientContext.Provider, { value: client }, children);
}

export function useNexconnClient(): NexconnClient {
  const client = useContext(ClientContext);
  if (!client) {
    throw new Error('useNexconnClient must be used inside <NexconnProvider>');
  }
  return client;
}

/** Connection state (status, user, generation) with automatic re-render. */
export function useConnection(): ClientSnapshot {
  const client = useNexconnClient();
  return useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getSnapshot
  );
}

/** Subscribes to an SDK event for the lifetime of the component. */
export function useNexconnEvent<K extends NexconnEventName>(
  event: K,
  handler: (payload: NexconnEventMap[K]) => void
): void {
  const client = useNexconnClient();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(
    () => client.on(event, (payload) => ref.current(payload)),
    [client, event]
  );
}

/**
 * Identifies one signed-in session. It changes on connect/disconnect and
 * account switches, but not on automatic reconnects after a network drop.
 */
export function sessionKey(snapshot: ClientSnapshot): string {
  return `${snapshot.generation}:${snapshot.userId ?? ''}`;
}

/** Session key and whether the SDK is currently connected. */
export function useSession(): {
  key: string;
  connected: boolean;
  userId?: string;
} {
  const snapshot = useConnection();
  return {
    key: sessionKey(snapshot),
    connected: snapshot.connectionStatus === ConnectionStatus.connected,
    userId: snapshot.userId,
  };
}

export interface AsyncState {
  loading: boolean;
  error: unknown;
}

export const IDLE: AsyncState = { loading: false, error: undefined };

/** Stable string key for an id list (order-insensitive, de-duplicated). */
export function idsKey(ids: readonly string[]): string {
  return [...new Set(ids.filter((id) => typeof id === 'string' && id))]
    .sort()
    .join('\u0000');
}

export function idsFromKey(key: string): string[] {
  return key ? key.split('\u0000') : [];
}

/** Runs a promise without awaiting it; rejections are ignored. */
export function detach(promise: Promise<unknown> | undefined): void {
  promise?.catch(() => undefined);
}
