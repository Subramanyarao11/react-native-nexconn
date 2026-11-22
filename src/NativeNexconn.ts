import {
  TurboModuleRegistry,
  type CodegenTypes,
  type TurboModule,
} from 'react-native';

/**
 * Codegen specification for the Nexconn TurboModule.
 *
 * The SDK surface (~150 operations) is exposed through one JSON dispatcher so
 * that both native layers share a single, versioned wire protocol (see
 * docs/reference/bridge-protocol.md). The typed API lives in JavaScript.
 */
export interface Spec extends TurboModule {
  /** JSON IntegrationStatus describing link/SDK state. */
  getIntegrationStatus(): Promise<string>;
  /** Resolves with `{"v": <result>}` JSON; rejects with a JSON error message. */
  invoke(method: string, argsJson: string): Promise<string>;
  /** JSON event envelopes: `{"type","generation","opId?","payload"}`. */
  readonly onNativeEvent: CodegenTypes.EventEmitter<string>;
}

export default TurboModuleRegistry.get<Spec>('Nexconn');
