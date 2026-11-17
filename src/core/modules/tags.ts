import type { Bridge } from '../bridge.ts';
import { compact, encodeChannelList, requireString } from '../encode.ts';
import { normalizeChannel, normalizeValue } from '../normalize.ts';
import { PagedQuery } from '../query.ts';
import type {
  Channel,
  ChannelIdentifier,
  Tag,
  TaggedChannelsQueryParams,
  UntaggedChannelsQueryParams,
} from '../types.ts';

/** Channel tags (folders). */
export class TagsModule {
  private readonly bridge: Bridge;

  constructor(bridge: Bridge) {
    this.bridge = bridge;
  }

  async create(tagId: string, tagName: string): Promise<Tag> {
    return normalizeValue(
      await this.bridge.invoke('tag.create', {
        tagId: requireString(tagId, 'tagId'),
        tagName: requireString(tagName, 'tagName'),
      })
    ) as Tag;
  }

  async getTags(): Promise<Tag[]> {
    const raw = normalizeValue(await this.bridge.invoke('tag.getTags'));
    return (Array.isArray(raw) ? raw : []) as Tag[];
  }

  async getTag(tagId: string): Promise<Tag | undefined> {
    const raw = await this.bridge.invoke('tag.getTag', {
      tagId: requireString(tagId, 'tagId'),
    });
    return raw == null ? undefined : (normalizeValue(raw) as Tag);
  }

  delete(tagId: string): Promise<void> {
    return this.bridge.invoke('tag.delete', {
      tagId: requireString(tagId, 'tagId'),
    });
  }

  rename(tagId: string, tagName: string): Promise<void> {
    return this.bridge.invoke('tag.update', {
      tagId: requireString(tagId, 'tagId'),
      tagName: requireString(tagName, 'tagName'),
    });
  }

  addChannels(
    tagId: string,
    channels: readonly ChannelIdentifier[]
  ): Promise<void> {
    return this.bridge.invoke('tag.addChannels', {
      tagId: requireString(tagId, 'tagId'),
      channels: encodeChannelList(channels),
    });
  }

  removeChannels(
    tagId: string,
    channels: readonly ChannelIdentifier[]
  ): Promise<void> {
    return this.bridge.invoke('tag.deleteChannels', {
      tagId: requireString(tagId, 'tagId'),
      channels: encodeChannelList(channels),
    });
  }

  getUnreadCount(tagId: string, containNoDisturb = false): Promise<number> {
    return this.bridge.invoke('tag.getUnreadCount', {
      tagId: requireString(tagId, 'tagId'),
      containNoDisturb,
    });
  }

  clearUnreadCount(tagId: string): Promise<void> {
    return this.bridge.invoke('tag.clearUnreadCount', {
      tagId: requireString(tagId, 'tagId'),
    });
  }

  clearChannels(tagId: string, deleteMessages = false): Promise<void> {
    return this.bridge.invoke('tag.clearChannels', {
      tagId: requireString(tagId, 'tagId'),
      deleteMessages,
    });
  }

  createTaggedChannelsQuery(
    params: TaggedChannelsQueryParams
  ): PagedQuery<Channel> {
    requireString(params.tagId, 'tagId');
    return new PagedQuery(
      this.bridge,
      'taggedChannels',
      compact({ ...params }),
      normalizeChannel
    );
  }

  createUntaggedChannelsQuery(
    params: UntaggedChannelsQueryParams = {}
  ): PagedQuery<Channel> {
    return new PagedQuery(
      this.bridge,
      'untaggedChannels',
      compact({ ...params }),
      normalizeChannel
    );
  }
}
