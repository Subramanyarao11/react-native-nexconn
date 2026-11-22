import { AreaCode } from '@subramanyarao11/react-native-nexconn';
import { DemoApp } from '../../examples/shared/DemoApp';

/**
 * Expo development build (Expo Go cannot load the native Nexconn SDK).
 * Optional defaults come from EXPO_PUBLIC_* variables (see example/.env.example);
 * the App Secret must never be configured here.
 */
export default function App() {
  return (
    <DemoApp
      title="Nexconn · Expo development build"
      defaults={{
        appKey: process.env.EXPO_PUBLIC_NEXCONN_APP_KEY,
        tokenServerUrl: process.env.EXPO_PUBLIC_TOKEN_SERVER_URL,
        areaCode: AreaCode.sg,
      }}
    />
  );
}
