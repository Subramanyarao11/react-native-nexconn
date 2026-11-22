/**
 * react-native-nexconn — community React Native Chat SDK for Nexconn.
 *
 * Headless entry point. React bindings: `@subramanyarao11/react-native-nexconn/react`.
 * Expo config plugin: `@subramanyarao11/react-native-nexconn/app.plugin.js`.
 * Test doubles: `@subramanyarao11/react-native-nexconn/testing`.
 */
import { NexconnClient } from './core/client.ts';
import {
  createNativeTransport,
  requestAndroidNotificationPermission,
} from './nativeTransport.ts';

let sharedClient: NexconnClient | undefined;

/**
 * Returns the process-wide client bound to the native SDK singleton.
 * The native SDK cannot host multiple isolated engines, so there is
 * intentionally no way to create a second native-backed client.
 */
export function getNexconnClient(): NexconnClient {
  if (!sharedClient) {
    sharedClient = new NexconnClient(createNativeTransport());
    sharedClient.push.setAndroidPermissionRequester(
      requestAndroidNotificationPermission
    );
  }
  return sharedClient;
}

export { NexconnClient, NotificationsModule } from './core/client.ts';
export type {
  ClientSnapshot,
  ConnectWithProviderOptions,
  TokenProvider,
} from './core/client.ts';
export { PagedQuery } from './core/query.ts';
export { replyTo, withMentions, mentionsUser } from './core/helpers.ts';
export type { QueryKind } from './core/query.ts';
export { NexconnError, isNexconnError } from './core/errors.ts';
export type { NexconnErrorCategory } from './core/errors.ts';
export * from './core/enums.ts';
export type * from './core/types.ts';
export type { Transport, NativeEventEnvelope } from './core/transport.ts';
export { ChannelsModule } from './core/modules/channels.ts';
export { MessagesModule } from './core/modules/messages.ts';
export type { DownloadCallbacks } from './core/modules/messages.ts';
export { GroupsModule } from './core/modules/groups.ts';
export { OpenChannelsModule } from './core/modules/openChannels.ts';
export { PushModule } from './core/modules/push.ts';
export type { AndroidPermissionRequester } from './core/modules/push.ts';
export { CommunityModule } from './core/modules/community.ts';
export { UsersModule } from './core/modules/users.ts';
export { TranslationModule } from './core/modules/translation.ts';
export { TagsModule } from './core/modules/tags.ts';
export { getIntegrationStatus } from './getIntegrationStatus';
export type { IntegrationStatus } from './diagnostics.ts';
