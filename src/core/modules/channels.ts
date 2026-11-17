import type { Bridge } from '../bridge.ts';
import {
  compact,
  encodeChannel,
  encodeChannelList,
  requireString,
  requireStringList,
} from '../encode.ts';
import type { ChannelNoDisturbLevel, ChannelType } from '../enums.ts';
import {
  channelList,
  isRecord,
  normalizeChannel,
  normalizeValue,
  optMessage,
  messageList,
} from '../normalize.ts';
import { PagedQuery } from '../query.ts';
import type {
  Channel,
  ChannelIdentifier,
  ChannelSearchResult,
  ChannelsQueryParams,
  ChannelTagInfo,
  Message,
  StringMap,
  UnreadMentionMeChannelsQueryParams,
} from '../types.ts';

/** Direct, group, open, system and community channel operations. */
export class ChannelsModule {
  private readonly bridge: Bridge;

  constructor(bridge: Bridge) {
    this.bridge = bridge;
  }

  /** Paged channel list ordered by operation time. */
  createChannelsQuery(params: ChannelsQueryParams): PagedQuery<Channel> {
    return new PagedQuery(
      this.bridge,
      'channels',
      compact({ ...params }),
      normalizeChannel
    );
  }

  createUnreadMentionMeChannelsQuery(
    params: UnreadMentionMeChannelsQueryParams
  ): PagedQuery<Channel> {
    return new PagedQuery(
      this.bridge,
      'unreadMentionMeChannels',
      compact({ ...params }),
      normalizeChannel
    );
  }

  async getChannels(
    channels: readonly ChannelIdentifier[]
  ): Promise<Channel[]> {
    return channelList(
      await this.bridge.invoke('channel.getChannels', {
        channels: encodeChannelList(channels),
      })
    );
  }

  async getChannel(channel: ChannelIdentifier): Promise<Channel | undefined> {
    return (await this.getChannels([channel]))[0];
  }

  async reload(channel: ChannelIdentifier): Promise<Channel> {
    return normalizeChannel(
      await this.bridge.invoke('channel.reload', {
        channel: encodeChannel(channel),
      })
    );
  }

  async getUnreadChannels(
    channelTypes: readonly ChannelType[]
  ): Promise<Channel[]> {
    return channelList(
      await this.bridge.invoke('channel.getUnreadChannels', { channelTypes })
    );
  }

  async getPinnedChannels(
    channelTypes: readonly ChannelType[]
  ): Promise<Channel[]> {
    return channelList(
      await this.bridge.invoke('channel.getPinnedChannels', { channelTypes })
    );
  }

  async search(params: {
    keyword: string;
    channelTypes: readonly ChannelType[];
    messageTypes?: readonly string[];
  }): Promise<ChannelSearchResult[]> {
    requireString(params.keyword, 'keyword');
    const raw = await this.bridge.invoke(
      'channel.search',
      compact({ ...params })
    );
    return (Array.isArray(raw) ? raw : []).filter(isRecord).map((item) => ({
      channel: normalizeChannel(item.channel),
      matchCount: typeof item.matchCount === 'number' ? item.matchCount : 0,
    }));
  }

  syncRemoteChannels(): Promise<void> {
    return this.bridge.invoke('channel.syncRemoteChannels');
  }

  deleteChannels(channels: readonly ChannelIdentifier[]): Promise<void> {
    return this.bridge.invoke('channel.deleteChannels', {
      channels: encodeChannelList(channels),
    });
  }

  delete(channel: ChannelIdentifier): Promise<void> {
    return this.bridge.invoke('channel.delete', {
      channel: encodeChannel(channel),
    });
  }

  pin(
    channel: ChannelIdentifier,
    options: { updateOperationTime?: boolean } = {}
  ): Promise<void> {
    return this.bridge.invoke('channel.pin', {
      channel: encodeChannel(channel),
      updateOperationTime: options.updateOperationTime ?? false,
    });
  }

  unpin(channel: ChannelIdentifier): Promise<void> {
    return this.bridge.invoke('channel.unpin', {
      channel: encodeChannel(channel),
    });
  }

  setNoDisturbLevel(
    channel: ChannelIdentifier,
    level: ChannelNoDisturbLevel
  ): Promise<void> {
    return this.bridge.invoke('channel.setNoDisturbLevel', {
      channel: encodeChannel(channel),
      level,
    });
  }

  setChannelTypeNoDisturbLevel(
    channelType: ChannelType,
    level: ChannelNoDisturbLevel
  ): Promise<void> {
    return this.bridge.invoke('channel.setChannelTypeNoDisturbLevel', {
      channelType,
      level,
    });
  }

  getChannelTypeNoDisturbLevel(
    channelType: ChannelType
  ): Promise<ChannelNoDisturbLevel> {
    return this.bridge.invoke('channel.getChannelTypeNoDisturbLevel', {
      channelType,
    });
  }

  clearUnreadCount(channel: ChannelIdentifier): Promise<void> {
    return this.bridge.invoke('channel.clearUnreadCount', {
      channel: encodeChannel(channel),
    });
  }

  getTotalUnreadCount(): Promise<number> {
    return this.bridge.invoke('channel.getTotalUnreadCount');
  }

  getUnreadCountByNoDisturbLevel(
    channelTypes: readonly ChannelType[],
    levels: readonly ChannelNoDisturbLevel[]
  ): Promise<number> {
    return this.bridge.invoke('channel.getUnreadCountByNoDisturbLevel', {
      channelTypes,
      levels,
    });
  }

  async getFirstUnreadMessage(
    channel: ChannelIdentifier
  ): Promise<Message | undefined> {
    return optMessage(
      await this.bridge.invoke('channel.getFirstUnreadMessage', {
        channel: encodeChannel(channel),
      })
    );
  }

  async getUnreadMentionedMessages(
    channel: ChannelIdentifier
  ): Promise<Message[]> {
    return messageList(
      await this.bridge.invoke('channel.getUnreadMentionedMessages', {
        channel: encodeChannel(channel),
      })
    );
  }

  async getTags(channel: ChannelIdentifier): Promise<ChannelTagInfo[]> {
    return normalizeValue(
      await this.bridge.invoke('channel.getTags', {
        channel: encodeChannel(channel),
      })
    ) as ChannelTagInfo[];
  }

  deleteTags(
    channel: ChannelIdentifier,
    tagIds: readonly string[]
  ): Promise<void> {
    return this.bridge.invoke('channel.deleteTags', {
      channel: encodeChannel(channel),
      tagIds: requireStringList(tagIds, 'tagIds'),
    });
  }

  saveDraft(channel: ChannelIdentifier, draft: string): Promise<void> {
    return this.bridge.invoke('channel.saveDraft', {
      channel: encodeChannel(channel),
      draft,
    });
  }

  clearDraft(channel: ChannelIdentifier): Promise<void> {
    return this.bridge.invoke('channel.clearDraft', {
      channel: encodeChannel(channel),
    });
  }

  saveEditedMessageDraft(
    channel: ChannelIdentifier,
    draft: { messageId: string; content?: string }
  ): Promise<void> {
    return this.bridge.invoke('channel.saveEditedMessageDraft', {
      channel: encodeChannel(channel),
      messageId: requireString(draft.messageId, 'messageId'),
      content: draft.content ?? '',
    });
  }

  clearEditedMessageDraft(channel: ChannelIdentifier): Promise<void> {
    return this.bridge.invoke('channel.clearEditedMessageDraft', {
      channel: encodeChannel(channel),
    });
  }

  setAttributes(
    channel: ChannelIdentifier,
    attributes: StringMap
  ): Promise<void> {
    return this.bridge.invoke('channel.setAttributes', {
      channel: encodeChannel(channel),
      attributes,
    });
  }

  removeAttributes(
    channel: ChannelIdentifier,
    keys: readonly string[]
  ): Promise<void> {
    return this.bridge.invoke('channel.removeAttributes', {
      channel: encodeChannel(channel),
      keys: requireStringList(keys, 'keys'),
    });
  }

  /**
   * Android only: synchronizes the read position to other devices.
   * Rejects with `unsupported` on iOS.
   */
  syncReadStatus(channel: ChannelIdentifier, timestamp: number): Promise<void> {
    return this.bridge.invoke('channel.syncReadStatus', {
      channel: encodeChannel(channel),
      timestamp,
    });
  }

  /** Direct channels only. `typingMessageType` is usually the content object name. */
  sendTypingStatus(
    channel: ChannelIdentifier,
    typingMessageType: string
  ): Promise<void> {
    return this.bridge.invoke('channel.sendTypingStatus', {
      channel: encodeChannel(channel),
      typingMessageType: requireString(typingMessageType, 'typingMessageType'),
    });
  }
}
