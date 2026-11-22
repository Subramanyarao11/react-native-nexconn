import { Bridge } from './bridge.ts';
import { compact, requireString } from './encode.ts';
import { ConnectionStatus } from './enums.ts';
import { NexconnError } from './errors.ts';
import { isRecord, normalizeValue } from './normalize.ts';
import type { Transport } from './transport.ts';
import type {
  AppSettings,
  Capabilities,
  CompressOptions,
  ConnectOptions,
  ConnectResult,
  CustomMessageDefinition,
  InitOptions,
  InitResult,
  NexconnEventMap,
  NexconnEventName,
  NoDisturbTimeInfo,
  NoDisturbTimeInput,
} from './types.ts';
import { ChannelsModule } from './modules/channels.ts';
import { CommunityModule } from './modules/community.ts';
import { GroupsModule } from './modules/groups.ts';
import { MessagesModule } from './modules/messages.ts';
import { OpenChannelsModule } from './modules/openChannels.ts';
import { TagsModule } from './modules/tags.ts';
import { TranslationModule } from './modules/translation.ts';
import { UsersModule } from './modules/users.ts';

/** Observable session state, suitable for `useSyncExternalStore`. */
export interface ClientSnapshot {
  readonly initialized: boolean;
  readonly connectionStatus: ConnectionStatus;
  readonly userId: string | undefined;
  /** Increments on every connect/disconnect; stale results compare against it. */
  readonly generation: number;
  readonly isConnecting: boolean;
}

/** Fetches a fresh per-user token from your authenticated backend. */
export type TokenProvider = () => Promise<string>;

export interface ConnectWithProviderOptions extends Omit<
  ConnectOptions,
  'token'
> {
  tokenProvider: TokenProvider;
}

/** Push notification and do-not-disturb controls. */
export class NotificationsModule {
  private readonly bridge: Bridge;

  constructor(bridge: Bridge) {
    this.bridge = bridge;
  }

  setNoDisturbTime(input: NoDisturbTimeInput): Promise<void> {
    return this.bridge.invoke(
      'engine.setNoDisturbTime',
      compact({
        ...input,
        startTime: requireString(input.startTime, 'startTime'),
      })
    );
  }

  async getNoDisturbTime(): Promise<NoDisturbTimeInfo | undefined> {
    const raw = await this.bridge.invoke('engine.getNoDisturbTime');
    return raw == null ? undefined : (normalizeValue(raw) as NoDisturbTimeInfo);
  }

  removeNoDisturbTime(): Promise<void> {
    return this.bridge.invoke('engine.removeNoDisturbTime');
  }

  /** Android only: whether pushes show message content. */
  setPushContentShowStatus(show: boolean): Promise<void> {
    return this.bridge.invoke('engine.setPushContentShowStatus', { show });
  }

  /** Android only. */
  getPushContentShowStatus(): Promise<boolean> {
    return this.bridge.invoke('engine.getPushContentShowStatus');
  }

  /**
   * iOS only: forwards the APNs device token (hex string, as produced by most
   * push libraries) to the SDK. Android push tokens are handled by the
   * Nexconn push plugin (`ai.nexconn.chat:push-fcm`).
   */
  setDeviceToken(hexToken: string): Promise<void> {
    if (!/^[0-9a-fA-F]+$/.test(hexToken) || hexToken.length % 2 !== 0) {
      return Promise.reject(
        new NexconnError({
          category: 'invalid_argument',
          message: 'APNs device token must be an even-length hex string',
          method: 'engine.setDeviceToken',
        })
      );
    }
    return this.bridge.invoke('engine.setDeviceToken', { hexToken });
  }
}

/**
 * The Nexconn Chat client. The native SDK is a process-wide singleton, so a
 * production app should use the shared instance from `getNexconnClient()`.
 */
export class NexconnClient {
  readonly channels: ChannelsModule;
  readonly messages: MessagesModule;
  readonly groups: GroupsModule;
  readonly openChannels: OpenChannelsModule;
  readonly community: CommunityModule;
  readonly users: UsersModule;
  readonly translation: TranslationModule;
  readonly tags: TagsModule;
  readonly notifications: NotificationsModule;

  private readonly bridge: Bridge;
  private snapshot: ClientSnapshot = {
    initialized: false,
    connectionStatus: ConnectionStatus.unconnected,
    userId: undefined,
    generation: 0,
    isConnecting: false,
  };
  private readonly snapshotListeners = new Set<() => void>();
  private connectPromise: Promise<ConnectResult> | undefined;
  private initPromise: Promise<InitResult> | undefined;
  private initializedAppKey: string | undefined;
  private readonly internalSubscriptions: Array<() => void> = [];

  constructor(transport: Transport) {
    this.bridge = new Bridge(transport);
    this.channels = new ChannelsModule(this.bridge);
    this.messages = new MessagesModule(this.bridge);
    this.groups = new GroupsModule(this.bridge);
    this.openChannels = new OpenChannelsModule(this.bridge);
    this.community = new CommunityModule(this.bridge);
    this.users = new UsersModule(this.bridge);
    this.translation = new TranslationModule(this.bridge);
    this.tags = new TagsModule(this.bridge);
    this.notifications = new NotificationsModule(this.bridge);

    this.internalSubscriptions.push(
      this.bridge.on('connectionStatusChanged', ({ status }) => {
        this.update({ connectionStatus: status });
      })
    );
  }

  get platform(): Transport['platform'] {
    return this.bridge.transport.platform;
  }

  // Observable state ---------------------------------------------------------

  getSnapshot = (): ClientSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.snapshotListeners.add(listener);
    return () => {
      this.snapshotListeners.delete(listener);
    };
  };

  private update(patch: Partial<ClientSnapshot>): void {
    const next = { ...this.snapshot, ...patch };
    if (
      next.initialized === this.snapshot.initialized &&
      next.connectionStatus === this.snapshot.connectionStatus &&
      next.userId === this.snapshot.userId &&
      next.generation === this.snapshot.generation &&
      next.isConnecting === this.snapshot.isConnecting
    ) {
      return;
    }
    this.snapshot = next;
    for (const listener of [...this.snapshotListeners]) listener();
  }

  /** Subscribes to an SDK event. Returns an idempotent unsubscribe function. */
  on<K extends NexconnEventName>(
    event: K,
    listener: (payload: NexconnEventMap[K]) => void
  ): () => void {
    return this.bridge.on(event, listener);
  }

  // Lifecycle ----------------------------------------------------------------

  /**
   * Initializes the native SDK and registers all native event handlers (so
   * offline messages delivered during connect are not missed). Safe to call
   * again with the same App Key, e.g. after a JS reload.
   */
  initialize(options: InitOptions): Promise<InitResult> {
    requireString(options.appKey, 'appKey');
    if (
      this.initializedAppKey !== undefined &&
      this.initializedAppKey !== options.appKey
    ) {
      return Promise.reject(
        new NexconnError({
          category: 'already_initialized',
          message:
            'The native SDK is already initialized with a different App Key',
          method: 'engine.initialize',
        })
      );
    }
    if (this.initPromise) return this.initPromise;
    const pending = this.bridge
      .invoke('engine.initialize', compact({ ...options }))
      .then(async (raw) => {
        const record = isRecord(raw) ? raw : {};
        this.initializedAppKey = options.appKey;
        this.update({ initialized: true });
        if (record.alreadyInitialized === true) {
          // JS reload: the native SDK kept its session; adopt it.
          await this.restoreSession().catch(() => undefined);
        }
        return {
          alreadyInitialized: record.alreadyInitialized === true,
          platform: record.platform === 'ios' ? 'ios' : 'android',
          sdkVersion:
            typeof record.sdkVersion === 'string' ? record.sdkVersion : '',
        } as InitResult;
      })
      .catch((error: unknown) => {
        this.initPromise = undefined;
        throw error;
      });
    this.initPromise = pending;
    return pending;
  }

  /**
   * Connects with a token from your backend. Concurrent calls share one
   * attempt; calling while connected to another user rejects with `busy`
   * (disconnect first so the previous session is cleaned up).
   */
  connect(options: ConnectOptions): Promise<ConnectResult> {
    requireString(options.token, 'token');
    if (this.connectPromise) return this.connectPromise;
    this.update({ isConnecting: true });
    const pending = this.bridge
      .invoke('engine.connect', compact({ ...options }))
      .then((raw) => {
        const record = isRecord(raw) ? raw : {};
        const result: ConnectResult = {
          userId: typeof record.userId === 'string' ? record.userId : '',
          generation:
            typeof record.generation === 'number' ? record.generation : 0,
        };
        this.bridge.setGeneration(result.generation);
        this.update({
          userId: result.userId,
          generation: this.bridge.generation,
          connectionStatus: ConnectionStatus.connected,
        });
        return result;
      })
      .finally(() => {
        this.connectPromise = undefined;
        this.update({ isConnecting: false });
      });
    this.connectPromise = pending;
    return pending;
  }

  /**
   * Fetches a token and connects. If the SDK reports the token as invalid
   * (`tokenIncorrect`), a fresh token is fetched and the connect retried once.
   */
  async connectWithTokenProvider(
    options: ConnectWithProviderOptions
  ): Promise<ConnectResult> {
    const { tokenProvider, ...rest } = options;
    const first = await tokenProvider();
    try {
      return await this.connect({ ...rest, token: first });
    } catch (error) {
      const status = await this.getConnectionStatus().catch(() => undefined);
      if (status !== ConnectionStatus.tokenIncorrect) throw error;
      const second = await tokenProvider();
      return this.connect({ ...rest, token: second });
    }
  }

  /**
   * Disconnects. Native session resources (queries, cached message handles)
   * are released and late callbacks from this session are ignored.
   */
  async disconnect(options: { disablePush?: boolean } = {}): Promise<void> {
    const raw = await this.bridge.invoke('engine.disconnect', {
      disablePush: options.disablePush ?? false,
    });
    const record = isRecord(raw) ? raw : {};
    if (typeof record.generation === 'number')
      this.bridge.setGeneration(record.generation);
    this.update({
      userId: undefined,
      generation: this.bridge.generation,
      connectionStatus: ConnectionStatus.unconnected,
    });
  }

  /**
   * Reads the native session (which survives JS reloads) and adopts it:
   * initialized flag, connection status, current user and generation.
   * Safe to call at any time; does nothing if the SDK is not initialized.
   */
  async restoreSession(): Promise<ClientSnapshot> {
    const raw = await this.bridge.invoke('engine.getSessionState');
    const record = isRecord(raw) ? raw : {};
    if (record.initialized !== true) return this.snapshot;
    if (typeof record.generation === 'number') {
      this.bridge.setGeneration(record.generation);
    }
    const status =
      typeof record.connectionStatus === 'number'
        ? (record.connectionStatus as ConnectionStatus)
        : this.snapshot.connectionStatus;
    const userId =
      typeof record.userId === 'string' && record.userId.length > 0
        ? record.userId
        : undefined;
    this.update({
      initialized: true,
      connectionStatus: status,
      userId: userId ?? this.snapshot.userId,
      generation: this.bridge.generation,
    });
    return this.snapshot;
  }

  async getConnectionStatus(): Promise<ConnectionStatus> {
    const status = await this.bridge.invoke<ConnectionStatus>(
      'engine.getConnectionStatus'
    );
    this.update({ connectionStatus: status });
    return status;
  }

  getCurrentUserId(): Promise<string | null> {
    return this.bridge.invoke('engine.getCurrentUserId');
  }

  getSdkVersion(): Promise<string> {
    return this.bridge.invoke('engine.getVersion');
  }

  getServerTimeDelta(): Promise<number> {
    return this.bridge.invoke('engine.getServerTimeDelta');
  }

  async getAppSettings(): Promise<AppSettings | undefined> {
    const raw = await this.bridge.invoke('engine.getAppSettings');
    return raw == null ? undefined : (normalizeValue(raw) as AppSettings);
  }

  async getCompressOptions(): Promise<CompressOptions | undefined> {
    const raw = await this.bridge.invoke('engine.getCompressOptions');
    return raw == null ? undefined : (normalizeValue(raw) as CompressOptions);
  }

  /** Lists the bridge methods implemented on this platform. */
  async getCapabilities(): Promise<Capabilities> {
    return (await this.bridge.invoke('engine.getCapabilities')) as Capabilities;
  }

  /** Whether `method` is implemented natively on this platform. */
  async supports(method: string): Promise<boolean> {
    return (await this.getCapabilities()).methods.includes(method);
  }

  /**
   * Registers custom message types. The native bridge provides a fixed pool
   * of generic content classes (see docs/API.md); register all types once,
   * after `initialize` and before `connect`.
   */
  async registerCustomMessages(
    definitions: readonly CustomMessageDefinition[]
  ): Promise<void> {
    for (const def of definitions)
      requireString(def.messageType, 'messageType');
    await this.bridge.invoke('engine.registerCustomMessages', {
      types: definitions.map((d) => compact({ ...d })),
    });
  }

  /** Detaches this client from the transport. Does not disconnect. */
  dispose(): void {
    for (const unsubscribe of this.internalSubscriptions.splice(0))
      unsubscribe();
    this.snapshotListeners.clear();
    this.bridge.dispose();
  }
}
