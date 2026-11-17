import { Platform } from 'react-native';
import NativeNexconn from './NativeNexconn';
import {
  decodeEnvelope,
  decodeResult,
  type NativeEventEnvelope,
  type Transport,
} from './core/transport.ts';

const NOT_LINKED = JSON.stringify({
  category: 'not_linked',
  message:
    'The Nexconn native module is not linked. Rebuild the app (Expo Go is not supported).',
});

/** Transport backed by the Codegen TurboModule. */
export function createNativeTransport(): Transport {
  const native = NativeNexconn;
  const listeners = new Set<(event: NativeEventEnvelope) => void>();
  let subscription: { remove(): void } | undefined;

  const ensureSubscribed = () => {
    if (subscription || !native) return;
    subscription = native.onNativeEvent((raw: string) => {
      const envelope = decodeEnvelope(raw);
      if (!envelope) return;
      for (const listener of [...listeners]) listener(envelope);
    });
  };

  return {
    platform:
      Platform.OS === 'android' || Platform.OS === 'ios'
        ? Platform.OS
        : 'unsupported',
    async invoke(method, args) {
      if (!native) throw new Error(NOT_LINKED);
      return decodeResult(await native.invoke(method, JSON.stringify(args)));
    },
    addListener(listener) {
      listeners.add(listener);
      ensureSubscribed();
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        listeners.delete(listener);
        if (listeners.size === 0 && subscription) {
          subscription.remove();
          subscription = undefined;
        }
      };
    },
  };
}
