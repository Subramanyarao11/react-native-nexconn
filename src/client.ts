import {
  createNexconnClient,
  NexconnError,
  type NexconnClient,
  type NexconnOperation,
} from './core';

function unsupported(operation: NexconnOperation): Promise<never> {
  return Promise.reject(
    new NexconnError(
      'unsupported',
      operation,
      'Nexconn Chat is only available in Android and iOS native builds'
    )
  );
}

const noSubscription = { remove() {} };

/** Non-native environments fail explicitly instead of pretending to connect. */
export const NexconnChat: NexconnClient = createNexconnClient({
  initialize: () => unsupported('initialize'),
  connect: () => unsupported('connect'),
  disconnect: () => unsupported('disconnect'),
  getConnectionStatus: () => unsupported('getConnectionStatus'),
  sendDirectText: () => unsupported('sendDirectText'),
  onConnectionStatusChanged: () => noSubscription,
  onMessageReceived: () => noSubscription,
});
