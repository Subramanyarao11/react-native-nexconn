/**
 * Deterministic test doubles. Not imported by the runtime entry points.
 *
 * `MockTransport` records invocations, returns scripted results and lets
 * tests emit native-shaped events, so application code can be tested without
 * the native SDK. It never claims a real network operation succeeded.
 */
import { NexconnClient } from '../core/client.ts';
import type {
  NativeEventEnvelope,
  Transport,
  TransportPlatform,
} from '../core/transport.ts';

export type MockHandler = (args: Readonly<Record<string, unknown>>) => unknown;

export interface RecordedCall {
  readonly method: string;
  readonly args: Readonly<Record<string, unknown>>;
}

export class MockTransport implements Transport {
  readonly platform: TransportPlatform;
  readonly calls: RecordedCall[] = [];
  private readonly handlers = new Map<string, MockHandler>();
  private readonly listeners = new Set<(event: NativeEventEnvelope) => void>();
  generation = 0;

  constructor(platform: TransportPlatform = 'android') {
    this.platform = platform;
  }

  /** Scripts the result (or thrown error) for `method`. */
  on(method: string, handler: MockHandler): this {
    this.handlers.set(method, handler);
    return this;
  }

  async invoke(
    method: string,
    args: Readonly<Record<string, unknown>>
  ): Promise<unknown> {
    // Round-trip through JSON like the real bridge does.
    const copy = JSON.parse(JSON.stringify(args)) as Record<string, unknown>;
    this.calls.push({ method, args: copy });
    const handler = this.handlers.get(method);
    if (!handler) {
      throw new Error(
        JSON.stringify({
          category: 'unsupported',
          message: `MockTransport has no handler for ${method}`,
          method,
        })
      );
    }
    return handler(copy);
  }

  addListener(listener: (event: NativeEventEnvelope) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  /** Emits an SDK-shaped event, e.g. `MessageHandler.onMessageReceived`. */
  emit(
    type: string,
    payload: unknown,
    overrides: Partial<NativeEventEnvelope> = {}
  ): void {
    const envelope: NativeEventEnvelope = {
      type,
      generation: this.generation,
      payload: JSON.parse(JSON.stringify(payload ?? {})),
      ...overrides,
    };
    for (const listener of [...this.listeners]) listener(envelope);
  }

  /** Builds a bridge-formatted rejection for scripted handlers. */
  static nativeError(code: number, message: string, method = 'unknown'): Error {
    return new Error(
      JSON.stringify({ category: 'native', code, message, method })
    );
  }
}

export function createMockClient(platform: TransportPlatform = 'android'): {
  client: NexconnClient;
  transport: MockTransport;
} {
  const transport = new MockTransport(platform);
  return { client: new NexconnClient(transport), transport };
}

/** Native-shaped fixtures matching the bridge serializer output. */
export const fixtures = {
  textMessage(
    overrides: Record<string, unknown> = {}
  ): Record<string, unknown> {
    return {
      __type: 'Message',
      clientId: 1,
      messageId: 'MSG-1',
      channelIdentifier: {
        __type: 'ChannelIdentifier',
        channelType: 1,
        channelId: 'bob',
      },
      direction: 2,
      senderUserId: 'bob',
      sentStatus: 30,
      sentTime: 1_700_000_000_000,
      messageType: 'RC:TxtMsg',
      content: { __type: 'TextMessage', text: 'hello' },
      hasChanged: false,
      needReceipt: false,
      sentReceipt: false,
      disableNotification: false,
      disableUpdateLastMessage: false,
      isCounted: true,
      isPersisted: true,
      isStatusMessage: false,
      expiry: 0,
      ...overrides,
    };
  },
  directChannel(
    overrides: Record<string, unknown> = {}
  ): Record<string, unknown> {
    return {
      __type: 'DirectChannel',
      channelType: 1,
      channelId: 'bob',
      unreadCount: 0,
      isPinned: false,
      operationTime: 1_700_000_000_000,
      mentionedCount: 0,
      mentionedMeCount: 0,
      noDisturbLevel: 0,
      translateStrategy: 0,
      includeRobot: false,
      attributes: {},
      ...overrides,
    };
  },
};
