import type { DemoDefaults } from '../../examples/shared/DemoApp';

/**
 * Optional prefilled values for the sign-in form. Leave blank in source
 * control; the App Key and token server URL can be typed in the app.
 * Never put the App Secret or user tokens here.
 *
 * Android emulator -> host machine: http://10.0.2.2:8787
 * iOS simulator    -> host machine: http://localhost:8787
 */
export const demoConfig: DemoDefaults = {
  appKey: '',
  tokenServerUrl: '',
};
