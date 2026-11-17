import type { Bridge } from '../bridge.ts';
import {
  encodeMessageRef,
  requireString,
  requireStringList,
} from '../encode.ts';
import {
  channelList,
  isRecord,
  messageList,
  normalizeValue,
} from '../normalize.ts';
import type {
  Channel,
  CommunityUnreadInfo,
  Message,
  MessageRef,
} from '../types.ts';

/** Community channels and their sub-channels. */
export class CommunityModule {
  private readonly bridge: Bridge;

  constructor(bridge: Bridge) {
    this.bridge = bridge;
  }

  async getSubChannels(channelId: string): Promise<Channel[]> {
    return channelList(
      await this.bridge.invoke('community.getSubChannels', {
        channelId: requireString(channelId, 'channelId'),
      })
    );
  }

  getUnreadCount(channelId: string): Promise<number> {
    return this.bridge.invoke('community.getUnreadCount', {
      channelId: requireString(channelId, 'channelId'),
    });
  }

  async getChannelsUnreadInfo(
    channelIds: readonly string[]
  ): Promise<CommunityUnreadInfo[]> {
    const raw = normalizeValue(
      await this.bridge.invoke('community.getChannelsUnreadInfo', {
        channelIds: requireStringList(channelIds, 'channelIds'),
      })
    );
    return (Array.isArray(raw) ? raw : []) as CommunityUnreadInfo[];
  }

  getTotalUnreadCount(): Promise<number> {
    return this.bridge.invoke('community.getTotalUnreadCount');
  }

  getTotalUnreadMentionedCount(): Promise<number> {
    return this.bridge.invoke('community.getTotalUnreadMentionedCount');
  }

  /** Splits local messages into those still present remotely and those not. */
  async checkRemoteMessages(
    messages: readonly MessageRef[]
  ): Promise<{ matched: Message[]; notMatched: Message[] }> {
    const raw = await this.bridge.invoke('community.checkRemoteMessages', {
      messages: messages.map(encodeMessageRef),
    });
    const record = isRecord(raw) ? raw : {};
    return {
      matched: messageList(record.matched),
      notMatched: messageList(record.notMatched),
    };
  }
}
