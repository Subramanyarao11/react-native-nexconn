import type { Bridge } from '../bridge.ts';
import { encodeChannelList, requireString } from '../encode.ts';
import type { TranslateStrategy } from '../enums.ts';
import type {
  ChannelIdentifier,
  TranslateMessagesInput,
  TranslateTextsInput,
} from '../types.ts';

/** Built-in translation. Results arrive via `translationCompleted`. */
export class TranslationModule {
  private readonly bridge: Bridge;

  constructor(bridge: Bridge) {
    this.bridge = bridge;
  }

  translateMessages(input: TranslateMessagesInput): Promise<void> {
    if (!Array.isArray(input.list) || input.list.length === 0) {
      return Promise.reject(new TypeError('list must not be empty'));
    }
    return this.bridge.invoke('translate.translateMessages', {
      list: input.list.map((item) => ({
        ...item,
        messageId: requireString(item.messageId, 'messageId'),
      })),
      force: input.force ?? false,
      mode: input.mode ?? 0,
    });
  }

  translateTexts(input: TranslateTextsInput): Promise<void> {
    if (!Array.isArray(input.list) || input.list.length === 0) {
      return Promise.reject(new TypeError('list must not be empty'));
    }
    return this.bridge.invoke('translate.translateTexts', {
      list: input.list,
      mode: input.mode ?? 0,
    });
  }

  setLanguage(language: string): Promise<void> {
    return this.bridge.invoke('translate.setLanguage', {
      language: requireString(language, 'language'),
    });
  }

  getLanguage(): Promise<string | null> {
    return this.bridge.invoke('translate.getLanguage');
  }

  setAutoTranslateEnabled(enabled: boolean): Promise<void> {
    return this.bridge.invoke('translate.setAutoTranslateEnabled', { enabled });
  }

  getAutoTranslateEnabled(): Promise<boolean> {
    return this.bridge.invoke('translate.getAutoTranslateEnabled');
  }

  setStrategy(
    channels: readonly ChannelIdentifier[],
    strategy: TranslateStrategy
  ): Promise<void> {
    return this.bridge.invoke('translate.setStrategy', {
      channels: encodeChannelList(channels),
      strategy,
    });
  }
}
