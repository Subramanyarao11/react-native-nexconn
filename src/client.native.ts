import Nexconn from './NativeNexconn';
import { createNexconnClient, type NexconnClient } from './core';

/** The single client for the process-wide native Nexconn engine. */
export const NexconnChat: NexconnClient = createNexconnClient({
  initialize: (appKey, areaCode) => Nexconn.initialize(appKey, areaCode),
  connect: (token, timeoutSeconds, sessionId) =>
    Nexconn.connect(token, timeoutSeconds, sessionId),
  disconnect: (disablePush) => Nexconn.disconnect(disablePush),
  getConnectionStatus: () => Nexconn.getConnectionStatus(),
  sendDirectText: (targetUserId, text) =>
    Nexconn.sendDirectText(targetUserId, text),
  onConnectionStatusChanged: (listener) =>
    Nexconn.onConnectionStatusChanged(listener),
  onMessageReceived: (listener) => Nexconn.onMessageReceived(listener),
});
