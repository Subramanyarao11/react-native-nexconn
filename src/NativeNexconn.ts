import {
  TurboModuleRegistry,
  type CodegenTypes,
  type TurboModule,
} from 'react-native';

/**
 * Structured values cross the boundary as JSON strings and are validated in
 * `core.ts`, so a native change cannot silently produce a mistyped object.
 */
export interface Spec extends TurboModule {
  getIntegrationStatus(): Promise<string>;
  initialize(appKey: string, areaCode: string): Promise<void>;
  connect(
    token: string,
    timeoutSeconds: number,
    sessionId: string
  ): Promise<string>;
  disconnect(disablePush: boolean): Promise<void>;
  getConnectionStatus(): Promise<number>;
  sendDirectText(targetUserId: string, text: string): Promise<string>;

  readonly onConnectionStatusChanged: CodegenTypes.EventEmitter<string>;
  readonly onMessageReceived: CodegenTypes.EventEmitter<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('Nexconn');
