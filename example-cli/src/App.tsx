import { AreaCode } from '@subramanyarao11/react-native-nexconn';
import { DemoApp } from '../../examples/shared/DemoApp';
import { demoConfig } from './config';

/** React Native Community CLI app using the same public API as the Expo app. */
export default function App() {
  return (
    <DemoApp
      title="Nexconn · Community CLI"
      defaults={{ ...demoConfig, areaCode: demoConfig.areaCode ?? AreaCode.sg }}
    />
  );
}
