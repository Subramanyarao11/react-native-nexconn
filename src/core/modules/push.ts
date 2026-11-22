import type { Bridge } from '../bridge.ts';
import { requireString } from '../encode.ts';
import { NexconnError } from '../errors.ts';
import {
  isRecord,
  normalizePushNotification,
  normalizePushToken,
  parseNexconnPushPayload,
} from '../normalize.ts';
import type {
  PushNotification,
  PushPermissionRequest,
  PushPermissionStatus,
  PushToken,
} from '../types.ts';

/**
 * Requests the Android 13+ `POST_NOTIFICATIONS` runtime permission. The
 * React Native entry point installs one based on `PermissionsAndroid`; the
 * headless core stays independent of React Native.
 */
export type AndroidPermissionRequester = (
  /** Reads the system notification setting (pre-Android 13 path). */
  systemStatus: () => Promise<PushPermissionStatus>
) => Promise<PushPermissionStatus>;

const STATUSES: ReadonlySet<string> = new Set([
  'granted',
  'denied',
  'undetermined',
  'provisional',
  'ephemeral',
]);

function toStatus(raw: unknown): PushPermissionStatus {
  const status = isRecord(raw) ? raw.status : raw;
  return typeof status === 'string' && STATUSES.has(status)
    ? (status as PushPermissionStatus)
    : 'undetermined';
}

/** Bridge-assigned ids already delivered to `onNotificationOpened` listeners. */
const MAX_SEEN = 64;

/**
 * Push notifications: permission, token, notification taps and arrival.
 *
 * Native setup is still required (see docs/guide/push.md): APNs entitlement and
 * AppDelegate token forwarding on iOS; `ai.nexconn.chat:push-fcm` and
 * Firebase configuration on Android. These methods work before
 * `initialize()`.
 */
export class PushModule {
  private readonly bridge: Bridge;
  private androidRequester: AndroidPermissionRequester | undefined;
  private readonly seen: string[] = [];
  private readonly openListeners = new Set<
    (notification: PushNotification) => void
  >();
  private pendingOpen: PushNotification | undefined;

  constructor(bridge: Bridge) {
    this.bridge = bridge;
    bridge.on('notificationOpened', (notification) => {
      if (this.openListeners.size === 0) this.pendingOpen = notification;
      else this.dispatchOpen(notification);
    });
  }

  /** @internal Installed by the React Native entry point. */
  setAndroidPermissionRequester(
    requester: AndroidPermissionRequester | undefined
  ): void {
    this.androidRequester = requester;
  }

  /** Current notification permission. */
  async getPermissionStatus(): Promise<PushPermissionStatus> {
    return toStatus(await this.bridge.invoke('push.getPermissionStatus'));
  }

  /**
   * Asks for notification permission. iOS: requests authorization and (by
   * default) registers for remote notifications; the token then arrives via
   * the AppDelegate → `NexconnBridge.registerDeviceToken`. Android 13+:
   * requests `POST_NOTIFICATIONS`; older Android returns the system setting.
   */
  async requestPermission(
    options: PushPermissionRequest = {}
  ): Promise<PushPermissionStatus> {
    if (this.bridge.transport.platform === 'android') {
      if (this.androidRequester) {
        return this.androidRequester(() => this.getPermissionStatus());
      }
      return this.getPermissionStatus();
    }
    return toStatus(
      await this.bridge.invoke('push.requestPermission', { ...options })
    );
  }

  /** The last push token the native push stack reported in this process. */
  async getToken(): Promise<PushToken | undefined> {
    const raw = await this.bridge.invoke('push.getToken');
    if (!isRecord(raw)) return undefined;
    const token = normalizePushToken(raw);
    return token.token ? token : undefined;
  }

  /**
   * Returns the notification tap that opened the app, once. Prefer
   * `onNotificationOpened`, which also delivers this.
   */
  async getInitialNotification(): Promise<PushNotification | undefined> {
    const raw = await this.bridge.invoke('push.getInitialNotification');
    return isRecord(raw) ? normalizePushNotification(raw) : undefined;
  }

  /**
   * Calls `listener` for every Nexconn notification the user taps, including
   * the one that launched the app (cold start) and a tap that arrived before
   * any listener subscribed. Each tap is delivered once per client. Returns
   * an unsubscribe function.
   */
  onNotificationOpened(
    listener: (notification: PushNotification) => void
  ): () => void {
    this.openListeners.add(listener);
    const buffered = this.pendingOpen;
    this.pendingOpen = undefined;
    if (buffered) this.dispatchOpen(buffered);
    this.getInitialNotification()
      .then((initial) => {
        if (initial) this.dispatchOpen(initial);
      })
      .catch(() => undefined);
    return () => {
      this.openListeners.delete(listener);
    };
  }

  /**
   * Parses a Nexconn APNs payload received through another notification
   * library (for example `expo-notifications`:
   * `parseNotification(response.notification.request.content.data, {
   *   title: content.title, body: content.body,
   *   id: response.notification.request.identifier })`).
   * Returns undefined for notifications that are not from Nexconn.
   */
  parseNotification(
    payload: unknown,
    extra?: {
      readonly title?: string;
      readonly body?: string;
      readonly id?: string;
    }
  ): PushNotification | undefined {
    return parseNexconnPushPayload(payload, extra);
  }

  /** Removes all notifications this app has posted. */
  clearNotifications(): Promise<void> {
    return this.bridge.invoke('push.clearNotifications');
  }

  /**
   * Removes one notification (`PushNotification.notificationId`). Android
   * ids are integer strings.
   */
  clearNotification(notificationId: string): Promise<void> {
    return this.bridge.invoke('push.clearNotification', {
      notificationId: requireString(notificationId, 'notificationId'),
    });
  }

  /** Android only: the active RongPush provider (e.g. `FCM`), if any. */
  async getPushType(): Promise<string | undefined> {
    if (this.bridge.transport.platform !== 'android') {
      throw new NexconnError({
        category: 'unsupported',
        message: 'getPushType is Android only',
        method: 'push.getPushType',
      });
    }
    const raw = await this.bridge.invoke('push.getPushType');
    return typeof raw === 'string' && raw ? raw : undefined;
  }

  private dispatchOpen(notification: PushNotification): void {
    if (!this.markSeen(notification.id)) return;
    for (const listener of [...this.openListeners]) {
      try {
        listener(notification);
      } catch (error) {
        (
          globalThis as { console?: { error?: (...a: unknown[]) => void } }
        ).console?.error?.('[react-native-nexconn] push listener error', error);
      }
    }
  }

  /** Returns false when `id` was already delivered. */
  private markSeen(id: string): boolean {
    if (!id) return true;
    if (this.seen.includes(id)) return false;
    this.seen.push(id);
    if (this.seen.length > MAX_SEEN) this.seen.shift();
    return true;
  }
}
