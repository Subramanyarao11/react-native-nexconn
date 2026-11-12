/**
 * Platform-independent client core.
 *
 * This file must not import runtime modules: the Node contract tests load it
 * directly, and it defines the only place where native payloads are trusted.
 */

export type AreaCode = 'BJ' | 'SG' | 'NA' | 'SA' | 'OM';

export type ConnectionStatus =
  | 'networkUnavailable'
  | 'connected'
  | 'connecting'
  | 'unconnected'
  | 'kickedOfflineByOtherClient'
  | 'tokenIncorrect'
  | 'userBlocked'
  | 'signedOut'
  | 'suspended'
  | 'timeout'
  | 'proxyUnavailable'
  | 'userAbandon'
  | 'unknown';

/** Integer values shared by the pinned Android and iOS SDK enums. */
const CONNECTION_STATUS_BY_CODE: Readonly<Record<number, ConnectionStatus>> = {
  [-1]: 'networkUnavailable',
  0: 'connected',
  1: 'connecting',
  2: 'unconnected',
  3: 'kickedOfflineByOtherClient',
  4: 'tokenIncorrect',
  6: 'userBlocked',
  12: 'signedOut',
  13: 'suspended',
  14: 'timeout',
  17: 'proxyUnavailable',
  19: 'userAbandon',
};

export type ChannelType = 'direct' | 'group' | 'open' | 'system' | 'community';

export type MessageContent =
  | Readonly<{ type: 'text'; text: string }>
  /** Content this wrapper version does not convert. Never treated as empty. */
  | Readonly<{ type: 'unsupported'; messageType: string | null }>;

export type Message = Readonly<{
  /** Server-assigned identifier; absent until the service has accepted it. */
  messageId: string | null;
  /** Identifier in the device's local message store. */
  clientId: number;
  channelType: ChannelType;
  channelId: string;
  direction: 'send' | 'receive';
  senderUserId: string | null;
  /** Milliseconds since the Unix epoch, as reported by the native SDK. */
  sentTime: number;
  content: MessageContent;
}>;

export type MessageReceivedEvent = Readonly<{
  message: Message;
  /** True when delivered as part of the offline backlog. */
  offline: boolean;
  /** Messages remaining in the current delivery batch. */
  left: number;
}>;

export type ConnectionStatusEvent = Readonly<{
  status: ConnectionStatus;
  /** Raw native enum value, kept for diagnostics. */
  nativeStatusCode: number;
}>;

export type Subscription = Readonly<{ remove(): void }>;

export type NexconnErrorCategory =
  | 'notInitialized'
  | 'alreadyInitialized'
  | 'invalidArgument'
  | 'invalidState'
  | 'token'
  | 'timeout'
  | 'sessionChanged'
  | 'invalidPayload'
  | 'unsupported'
  | 'native';

export type NexconnOperation =
  | 'initialize'
  | 'connect'
  | 'disconnect'
  | 'getConnectionStatus'
  | 'sendDirectText'
  | 'event';

export class NexconnError extends Error {
  readonly category: NexconnErrorCategory;
  readonly operation: NexconnOperation;
  /** Error code reported by the native Nexconn SDK, when there was one. */
  readonly nativeCode: number | null;

  constructor(
    category: NexconnErrorCategory,
    operation: NexconnOperation,
    message: string,
    nativeCode: number | null = null
  ) {
    super(message);
    this.name = 'NexconnError';
    this.category = category;
    this.operation = operation;
    this.nativeCode = nativeCode;
  }
}

const BRIDGE_CATEGORIES: Readonly<Record<string, NexconnErrorCategory>> = {
  not_initialized: 'notInitialized',
  already_initialized: 'alreadyInitialized',
  invalid_argument: 'invalidArgument',
  invalid_state: 'invalidState',
};

/** Native SDK codes documented by Nexconn that have a stable wrapper category. */
const NATIVE_CATEGORIES: Readonly<Record<number, NexconnErrorCategory>> = {
  31004: 'token',
  31020: 'token',
  33001: 'notInitialized',
  34001: 'invalidState',
  34006: 'timeout',
};

/**
 * Convert a rejected native promise into a NexconnError.
 * Both platforms reject with `nexconn/<reason>` or `nexconn/native/<code>`.
 */
export function toNexconnError(
  error: unknown,
  operation: NexconnOperation
): NexconnError {
  if (error instanceof NexconnError) {
    return error;
  }
  const record =
    typeof error === 'object' && error !== null
      ? (error as Record<string, unknown>)
      : {};
  const code = typeof record.code === 'string' ? record.code : '';
  const message =
    typeof record.message === 'string' && record.message !== ''
      ? record.message
      : String(error);
  const native = /^nexconn\/native\/(-?\d+)$/.exec(code);
  if (native) {
    const nativeCode = Number(native[1]);
    return new NexconnError(
      NATIVE_CATEGORIES[nativeCode] ?? 'native',
      operation,
      message,
      nativeCode
    );
  }
  const bridge = /^nexconn\/([a-z_]+)$/.exec(code);
  const category = bridge ? BRIDGE_CATEGORIES[bridge[1] ?? ''] : undefined;
  return new NexconnError(category ?? 'native', operation, message);
}

function parseRecord(
  payload: string,
  operation: NexconnOperation
): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    value = undefined;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new NexconnError(
      'invalidPayload',
      operation,
      'The native module returned a malformed payload'
    );
  }
  return value as Record<string, unknown>;
}

function invalid(operation: NexconnOperation, field: string): NexconnError {
  return new NexconnError(
    'invalidPayload',
    operation,
    `The native module returned an invalid "${field}"`
  );
}

const CHANNEL_TYPES: readonly string[] = [
  'direct',
  'group',
  'open',
  'system',
  'community',
];

export function decodeMessage(
  value: unknown,
  operation: NexconnOperation
): Message {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalid(operation, 'message');
  }
  const record = value as Record<string, unknown>;
  const nullableString = (field: string): string | null => {
    const item = record[field];
    if (item === null || item === undefined) {
      return null;
    }
    if (typeof item !== 'string') {
      throw invalid(operation, field);
    }
    return item;
  };
  if (
    typeof record.channelType !== 'string' ||
    !CHANNEL_TYPES.includes(record.channelType)
  ) {
    throw invalid(operation, 'channelType');
  }
  if (typeof record.channelId !== 'string') {
    throw invalid(operation, 'channelId');
  }
  if (record.direction !== 'send' && record.direction !== 'receive') {
    throw invalid(operation, 'direction');
  }
  if (typeof record.clientId !== 'number') {
    throw invalid(operation, 'clientId');
  }
  if (typeof record.sentTime !== 'number') {
    throw invalid(operation, 'sentTime');
  }
  const text = nullableString('text');
  const messageType = nullableString('messageType');
  return {
    messageId: nullableString('messageId'),
    clientId: record.clientId,
    channelType: record.channelType as ChannelType,
    channelId: record.channelId,
    direction: record.direction,
    senderUserId: nullableString('senderUserId'),
    sentTime: record.sentTime,
    content:
      record.contentType === 'text' && text !== null
        ? { type: 'text', text }
        : { type: 'unsupported', messageType },
  };
}

export function decodeConnectionStatus(
  code: unknown,
  operation: NexconnOperation
): ConnectionStatusEvent {
  if (typeof code !== 'number' || !Number.isInteger(code)) {
    throw invalid(operation, 'status');
  }
  return {
    status: CONNECTION_STATUS_BY_CODE[code] ?? 'unknown',
    nativeStatusCode: code,
  };
}

/** The native surface the core depends on; mirrors the Codegen spec. */
export type NexconnTransport = Readonly<{
  initialize(appKey: string, areaCode: string): Promise<void>;
  connect(
    token: string,
    timeoutSeconds: number,
    sessionId: string
  ): Promise<string>;
  disconnect(disablePush: boolean): Promise<void>;
  getConnectionStatus(): Promise<number>;
  sendDirectText(targetUserId: string, text: string): Promise<string>;
  onConnectionStatusChanged(listener: (payload: string) => void): Subscription;
  onMessageReceived(listener: (payload: string) => void): Subscription;
}>;

export type InitializeOptions = Readonly<{
  appKey: string;
  /** Data center of the Nexconn application. The native default is `SG`. */
  areaCode?: AreaCode;
}>;

export type ConnectOptions = Readonly<{
  /** Per-user token issued by your authenticated backend. */
  token: string;
  /** Seconds before the native SDK gives up. 0 keeps retrying. */
  timeoutSeconds?: number;
}>;

export type NexconnClient = Readonly<{
  initialize(options: InitializeOptions): Promise<void>;
  connect(options: ConnectOptions): Promise<{ userId: string }>;
  disconnect(options?: { disablePush?: boolean }): Promise<void>;
  getConnectionStatus(): Promise<ConnectionStatusEvent>;
  sendDirectText(options: {
    targetUserId: string;
    text: string;
  }): Promise<Message>;
  addConnectionStatusListener(
    listener: (event: ConnectionStatusEvent) => void
  ): Subscription;
  addMessageListener(
    listener: (event: MessageReceivedEvent) => void
  ): Subscription;
  /** Reports event payloads that could not be decoded, instead of hiding them. */
  addErrorListener(listener: (error: NexconnError) => void): Subscription;
}>;

const AREA_CODES: readonly string[] = ['BJ', 'SG', 'NA', 'SA', 'OM'];

function requireText(
  value: unknown,
  name: string,
  operation: NexconnOperation
): string {
  if (typeof value !== 'string' || value === '') {
    throw new NexconnError(
      'invalidArgument',
      operation,
      `"${name}" must be a non-empty string`
    );
  }
  return value;
}

/**
 * Create the client over a transport.
 *
 * The native SDK is a process-wide singleton, so one client owns one session at
 * a time. Every session has an identifier that native events carry back; events
 * from a previous session are dropped rather than delivered to the new account.
 */
export function createNexconnClient(
  transport: NexconnTransport
): NexconnClient {
  let sessionCounter = 0;
  let sessionId: string | null = null;
  let connected = false;
  let nativeSubscriptions: Subscription[] = [];

  const statusListeners = new Set<(event: ConnectionStatusEvent) => void>();
  const messageListeners = new Set<(event: MessageReceivedEvent) => void>();
  const errorListeners = new Set<(error: NexconnError) => void>();

  function subscribe<T>(set: Set<T>, listener: T): Subscription {
    set.add(listener);
    return {
      remove() {
        set.delete(listener);
      },
    };
  }

  function dispatch<T>(set: Set<(event: T) => void>, event: T) {
    for (const listener of [...set]) {
      listener(event);
    }
  }

  function handleEvent(payload: string, deliver: (record: any) => void) {
    try {
      const record = parseRecord(payload, 'event');
      // Late callbacks from a previous account must not reach this one.
      if (sessionId === null || record.sessionId !== sessionId) {
        return;
      }
      deliver(record);
    } catch (error) {
      dispatch(errorListeners, toNexconnError(error, 'event'));
    }
  }

  function attach() {
    nativeSubscriptions = [
      transport.onConnectionStatusChanged((payload) =>
        handleEvent(payload, (record) =>
          dispatch(
            statusListeners,
            decodeConnectionStatus(record.status, 'event')
          )
        )
      ),
      transport.onMessageReceived((payload) =>
        handleEvent(payload, (record) => {
          const message = decodeMessage(record.message, 'event');
          dispatch(messageListeners, {
            message,
            offline: record.offline === true,
            left: typeof record.left === 'number' ? record.left : 0,
          });
        })
      ),
    ];
  }

  function endSession() {
    sessionId = null;
    connected = false;
    for (const subscription of nativeSubscriptions) {
      subscription.remove();
    }
    nativeSubscriptions = [];
  }

  return {
    async initialize(options) {
      const appKey = requireText(options?.appKey, 'appKey', 'initialize');
      const areaCode = options.areaCode ?? 'SG';
      if (!AREA_CODES.includes(areaCode)) {
        throw new NexconnError(
          'invalidArgument',
          'initialize',
          `Unknown areaCode "${String(areaCode)}"`
        );
      }
      try {
        await transport.initialize(appKey, areaCode);
      } catch (error) {
        throw toNexconnError(error, 'initialize');
      }
    },

    async connect(options) {
      const token = requireText(options?.token, 'token', 'connect');
      const timeoutSeconds = options.timeoutSeconds ?? 0;
      if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 0) {
        throw new NexconnError(
          'invalidArgument',
          'connect',
          '"timeoutSeconds" must be a non-negative integer'
        );
      }
      if (sessionId !== null) {
        throw new NexconnError(
          'invalidState',
          'connect',
          'A session is already connecting or connected; call disconnect() first'
        );
      }
      sessionCounter += 1;
      const current = `s${sessionCounter}`;
      sessionId = current;
      // Listen before connecting so the offline backlog is not missed.
      attach();
      let payload: string;
      try {
        payload = await transport.connect(token, timeoutSeconds, current);
      } catch (error) {
        if (sessionId === current) {
          endSession();
        }
        throw toNexconnError(error, 'connect');
      }
      if (sessionId !== current) {
        throw new NexconnError(
          'sessionChanged',
          'connect',
          'disconnect() was called before the connection completed'
        );
      }
      try {
        const record = parseRecord(payload, 'connect');
        if (typeof record.userId !== 'string' || record.userId === '') {
          throw invalid('connect', 'userId');
        }
        connected = true;
        return { userId: record.userId };
      } catch (error) {
        endSession();
        throw error;
      }
    },

    async disconnect(options) {
      endSession();
      try {
        await transport.disconnect(options?.disablePush === true);
      } catch (error) {
        throw toNexconnError(error, 'disconnect');
      }
    },

    async getConnectionStatus() {
      try {
        return decodeConnectionStatus(
          await transport.getConnectionStatus(),
          'getConnectionStatus'
        );
      } catch (error) {
        throw toNexconnError(error, 'getConnectionStatus');
      }
    },

    async sendDirectText(options) {
      const targetUserId = requireText(
        options?.targetUserId,
        'targetUserId',
        'sendDirectText'
      );
      const text = requireText(options.text, 'text', 'sendDirectText');
      if (!connected) {
        throw new NexconnError(
          'invalidState',
          'sendDirectText',
          'connect() must complete before sending'
        );
      }
      try {
        const payload = await transport.sendDirectText(targetUserId, text);
        return decodeMessage(
          parseRecord(payload, 'sendDirectText'),
          'sendDirectText'
        );
      } catch (error) {
        throw toNexconnError(error, 'sendDirectText');
      }
    },

    addConnectionStatusListener: (listener) =>
      subscribe(statusListeners, listener),
    addMessageListener: (listener) => subscribe(messageListeners, listener),
    addErrorListener: (listener) => subscribe(errorListeners, listener),
  };
}
