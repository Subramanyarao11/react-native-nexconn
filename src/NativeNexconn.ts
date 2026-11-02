import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  getIntegrationStatus(): Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('Nexconn');
