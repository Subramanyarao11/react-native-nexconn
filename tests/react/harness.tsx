import type { ReactNode } from 'react';
import { act } from '@testing-library/react-native';
import { ConnectionStatus } from '../../src/core/enums.ts';
import { NexconnProvider } from '../../src/react/index.ts';
import {
  createMockClient,
  fixtures,
  type MockTransport,
} from '../../src/testing/index.ts';

export type PageItems = (params: Record<string, unknown>) => unknown[];

/**
 * A mock client with paged queries: `pages[kind]` returns all items for a
 * query's params; they are served `pageSize` at a time.
 */
export function setup(
  options: {
    pages?: Record<string, PageItems>;
    platform?: 'android' | 'ios';
  } = {}
) {
  const { client, transport } = createMockClient(options.platform ?? 'android');
  const pages = options.pages ?? {};
  const queries = new Map<
    string,
    { items: unknown[]; offset: number; size: number }
  >();
  let nextQuery = 1;
  transport.on('engine.initialize', () => ({
    alreadyInitialized: false,
    platform: 'android',
    sdkVersion: 'test',
  }));
  transport.on('query.create', (args) => {
    const kind = args.kind as string;
    const params = (args.params ?? {}) as Record<string, unknown>;
    const all = pages[kind]?.(params) ?? [];
    const queryId = `q${nextQuery++}`;
    queries.set(queryId, {
      items: all,
      offset: 0,
      size: typeof params.pageSize === 'number' ? params.pageSize : 20,
    });
    return { queryId };
  });
  transport.on('query.loadNextPage', (args) => {
    const query = queries.get(args.queryId as string);
    if (!query) throw new Error('unknown query');
    const items = query.items.slice(query.offset, query.offset + query.size);
    query.offset += items.length;
    return { items, hasMore: query.offset < query.items.length };
  });
  transport.on('query.release', (args) => {
    queries.delete(args.queryId as string);
    return null;
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <NexconnProvider client={client} restoreSession={false}>
      {children}
    </NexconnProvider>
  );

  /** Connects as `userId` in a new session (generation). */
  async function connect(userId = 'alice') {
    transport.generation += 1;
    const generation = transport.generation;
    transport.on('engine.connect', () => ({ userId, generation }));
    await act(async () => {
      if (!client.getSnapshot().initialized) {
        await client.initialize({ appKey: 'k' });
      }
      await client.connect({ token: 't' });
    });
  }

  /** A network drop and automatic reconnect: same session. */
  async function setStatus(status: number) {
    await act(async () => {
      transport.emit('ConnectionStatusHandler.onConnectionStatusChanged', {
        status,
      });
    });
  }

  return {
    client,
    transport,
    wrapper,
    connect,
    setStatus,
    queries,
    disconnected: () => setStatus(ConnectionStatus.connecting),
    reconnected: () => setStatus(ConnectionStatus.connected),
  };
}

export const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

export function textMessage(overrides: Record<string, unknown> = {}) {
  return fixtures.textMessage(overrides);
}

export function calls(transport: MockTransport, method: string) {
  return transport.calls.filter((c) => c.method === method);
}

export function member(userId: string, role = 1, joinedTime = 1) {
  return {
    __type: 'GroupMemberInfo',
    userId,
    name: userId,
    role,
    joinedTime,
    isRobot: false,
  };
}
