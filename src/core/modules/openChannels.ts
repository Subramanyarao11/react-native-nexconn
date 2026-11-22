import type { Bridge } from '../bridge.ts';
import { compact, requireString, requireStringList } from '../encode.ts';
import { NexconnError } from '../errors.ts';
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
   * Enters an open channel and resolves with the enter response on both
   * platforms. iOS returns it from the call; Android only reports it through
   * `OpenChannelHandler.onEntered`, so on Android this waits for the matching
   * `openChannelEntered` event (up to `responseTimeoutMs`, default 10 s) and
   * resolves `undefined` if it does not arrive. An `openChannelEnterFailed`
   * event for the channel rejects.
   */
  async enter(
    channelId: string,
    options: {
      messageCount?: number;
      extra?: string;
      responseTimeoutMs?: number;
    } = {}
  ): Promise<OpenChannelEnterResponse | undefined> {
    const id = requireString(channelId, 'channelId');
    const { responseTimeoutMs = 10_000, ...rest } = options;
    let entered: OpenChannelEnterResponse | undefined | null = null;
    let failed: NexconnError | undefined;
    let wake: (() => void) | undefined;
    const subs = [
      this.bridge.on('openChannelEntered', (event) => {
        if (event.channelId !== id) return;
        entered = event.response;
        wake?.();
      }),
      this.bridge.on('openChannelEnterFailed', (event) => {
        if (event.channelId !== id) return;
        failed = new NexconnError({
          category: 'native',
          message: event.error?.message ?? 'Entering the open channel failed',
          nativeCode: event.error?.code,
          method: 'open.enter',
        });
        wake?.();
      }),
    ];
    try {
      const raw = await this.bridge.invoke(
        'open.enter',
        compact({ channelId: id, ...rest })
      );
      if (raw != null) return normalizeValue(raw) as OpenChannelEnterResponse;
      if (entered === null && !failed) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, responseTimeoutMs);
          wake = () => {
            clearTimeout(timer);
            resolve();
          };
        });
      }
      if (failed) throw failed;
      return entered ?? undefined;
    } finally {
      subs.forEach((unsubscribe) => unsubscribe());
    }
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
