import type { Bridge } from '../bridge.ts';
import { compact, requireString, requireStringList } from '../encode.ts';
import { normalizeMessage, normalizeValue } from '../normalize.ts';
import { PagedQuery } from '../query.ts';
import type {
  Message,
  OpenChannelEnterResponse,
  OpenChannelMessagesQueryParams,
  StringMap,
} from '../types.ts';

/** Open (chatroom-style) channels: enter/exit, metadata and history. */
export class OpenChannelsModule {
  private readonly bridge: Bridge;

  constructor(bridge: Bridge) {
    this.bridge = bridge;
  }

  /**
   * Enters an open channel. iOS resolves with the enter response; Android
   * resolves with `undefined` and delivers the response through the
   * `openChannelEntered` event.
   */
  async enter(
    channelId: string,
    options: { messageCount?: number; extra?: string } = {}
  ): Promise<OpenChannelEnterResponse | undefined> {
    const raw = await this.bridge.invoke(
      'open.enter',
      compact({ channelId: requireString(channelId, 'channelId'), ...options })
    );
    return raw == null
      ? undefined
      : (normalizeValue(raw) as OpenChannelEnterResponse);
  }

  exit(channelId: string, extra?: string): Promise<void> {
    return this.bridge.invoke(
      'open.exit',
      compact({ channelId: requireString(channelId, 'channelId'), extra })
    );
  }

  async getMetadata(channelId: string, key: string): Promise<StringMap> {
    return (normalizeValue(
      await this.bridge.invoke('open.getMetadata', {
        channelId: requireString(channelId, 'channelId'),
        key: requireString(key, 'key'),
      })
    ) ?? {}) as StringMap;
  }

  /** Resolves with keys that failed (iOS) or an empty array. */
  async setMetadata(
    channelId: string,
    metadata: StringMap,
    options: { overwrite?: boolean; deleteWhenLeft?: boolean } = {}
  ): Promise<string[]> {
    const raw = await this.bridge.invoke('open.setMetadata', {
      channelId: requireString(channelId, 'channelId'),
      metadata,
      overwrite: options.overwrite ?? false,
      deleteWhenLeft: options.deleteWhenLeft ?? false,
    });
    return Array.isArray(raw) ? (raw as string[]) : [];
  }

  async deleteMetadata(
    channelId: string,
    keys: readonly string[],
    options: { force?: boolean } = {}
  ): Promise<string[]> {
    const raw = await this.bridge.invoke('open.deleteMetadata', {
      channelId: requireString(channelId, 'channelId'),
      keys: requireStringList(keys, 'keys'),
      force: options.force ?? false,
    });
    return Array.isArray(raw) ? (raw as string[]) : [];
  }

  createMessagesQuery(
    params: OpenChannelMessagesQueryParams
  ): PagedQuery<Message> {
    requireString(params.channelId, 'channelId');
    return new PagedQuery(
      this.bridge,
      'openChannelMessages',
      compact({ ...params }),
      normalizeMessage
    );
  }
}
