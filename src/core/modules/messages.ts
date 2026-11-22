import type { Bridge } from '../bridge.ts';
import {
  compact,
  encodeChannel,
  encodeContent,
  encodeMessageRef,
  encodeSendOptions,
  isMediaContent,
  requireNumber,
  requireString,
  requireStringList,
} from '../encode.ts';
import type { MessageOperationPolicy } from '../enums.ts';
import { NexconnError } from '../errors.ts';
import {
  isRecord,
  messageList,
  normalizeError,
  normalizeMessage,
  normalizeValue,
  optMessage,
} from '../normalize.ts';
import { PagedQuery } from '../query.ts';
import type {
  ChannelIdentifier,
  DownloadResult,
  InsertMessageInput,
  LocalMessagesByTimeQueryParams,
  MediaDownloadInfo,
  Message,
  MessageRef,
  MessagesQueryParams,
  OutgoingContent,
  ReadReceiptInfo,
  ReadReceiptUser,
  ReadReceiptUsersQueryParams,
  ReadReceiptUsersResult,
  ReferenceRefreshResult,
  SearchMessagesByTimeRangeQueryParams,
  SearchMessagesByUserQueryParams,
  SearchMessagesQueryParams,
  SendMediaCallbacks,
  SendOptions,
  StringMap,
} from '../types.ts';

export interface DownloadCallbacks {
  onProgress?: (progress: number) => void;
}

/** Message sending, history, editing, receipts, media and metadata. */
export class MessagesModule {
  private readonly bridge: Bridge;

  constructor(bridge: Bridge) {
    this.bridge = bridge;
  }

  /**
   * Sends non-media content (text, location, reference, custom). The promise
   * resolves with the server-acknowledged message, or rejects with the native
   * error. `onAttached` fires once the message is stored locally.
   */
  send(
    channel: ChannelIdentifier,
    content: OutgoingContent,
    options?: SendOptions & { onAttached?: (message: Message) => void }
  ): Promise<Message> {
    if (isMediaContent(content)) {
      return Promise.reject(
        new NexconnError({
          category: 'invalid_argument',
          message: `Use sendMedia() for ${content.type} content`,
          method: 'message.send',
        })
      );
    }
    return this.runSend('message.send', channel, content, options, options);
  }

  /** Sends media content with upload progress. Cancel with `cancelSendMedia`. */
  sendMedia(
    channel: ChannelIdentifier,
    content: OutgoingContent,
    options?: SendOptions & SendMediaCallbacks
  ): Promise<Message> {
    if (!isMediaContent(content) && content.type !== 'custom') {
      return Promise.reject(
        new NexconnError({
          category: 'invalid_argument',
          message: `Use send() for ${content.type} content`,
          method: 'message.sendMedia',
        })
      );
    }
    return this.runSend(
      'message.sendMedia',
      channel,
      content,
      options,
      options
    );
  }

  private async runSend(
    method: string,
    channel: ChannelIdentifier,
    content: OutgoingContent,
    options: SendOptions | undefined,
    callbacks: SendMediaCallbacks | undefined
  ): Promise<Message> {
    const encodedChannel = encodeChannel(channel);
    const encodedContent = encodeContent(content);
    const { onAttached, onProgress } = callbacks ?? {};
    const sendOptions = { ...(options ?? {}) } as Record<string, unknown>;
    delete sendOptions.onAttached;
    delete sendOptions.onProgress;
    const opId = this.bridge.beginOperation({
      onEvent: (type, payload) => {
        const record = isRecord(payload) ? payload : {};
        if (type === 'op.attached' && onAttached) {
          onAttached(normalizeMessage(record.message));
        } else if (type === 'op.progress' && onProgress) {
          onProgress(
            typeof record.progress === 'number' ? record.progress : 0,
            optMessage(record.message)
          );
        }
      },
    });
    try {
      const raw = await this.bridge.invoke(method, {
        channel: encodedChannel,
        content: encodedContent,
        options: encodeSendOptions(sendOptions as SendOptions),
        opId,
      });
      return normalizeMessage(raw);
    } finally {
      this.bridge.endOperation(opId);
    }
  }

  /** Cancels an in-flight media upload. The send promise rejects with `canceled`. */
  cancelSendMedia(message: MessageRef): Promise<void> {
    return this.bridge.invoke('message.cancelSendMedia', {
      message: encodeMessageRef(message),
    });
  }

  /** Inserts local-only messages (not delivered to the server). */
  insert(
    channel: ChannelIdentifier,
    items: readonly InsertMessageInput[]
  ): Promise<void> {
    return this.bridge.invoke('message.insert', {
      channel: encodeChannel(channel),
      items: items.map((item) => ({
        ...item,
        content: encodeContent(item.content),
      })),
    });
  }

  /** Edits a sent message's content (subject to `messageModifiableMinutes`). */
  async update(
    channel: ChannelIdentifier,
    messageId: string,
    content: OutgoingContent
  ): Promise<Message> {
    return normalizeMessage(
      await this.bridge.invoke('message.update', {
        channel: encodeChannel(channel),
        messageId: requireString(messageId, 'messageId'),
        content: encodeContent(content),
      })
    );
  }

  /** Deletes messages for the current user only. */
  deleteForMe(
    channel: ChannelIdentifier,
    messages: readonly MessageRef[]
  ): Promise<void> {
    return this.bridge.invoke('message.deleteForMe', {
      channel: encodeChannel(channel),
      messages: messages.map(encodeMessageRef),
    });
  }

  /** Recalls a message for everyone. Resolves with the recall notification message. */
  async deleteForAll(
    channel: ChannelIdentifier,
    message: MessageRef
  ): Promise<Message | undefined> {
    return optMessage(
      await this.bridge.invoke('message.deleteForAll', {
        channel: encodeChannel(channel),
        message: encodeMessageRef(message),
      })
    );
  }

  deleteForMeByTimestamp(
    channel: ChannelIdentifier,
    timestamp: number,
    policy: MessageOperationPolicy
  ): Promise<void> {
    return this.bridge.invoke('message.deleteForMeByTimestamp', {
      channel: encodeChannel(channel),
      timestamp: requireNumber(timestamp, 'timestamp'),
      policy,
    });
  }

  /** Deletes messages from the local database by reference. */
  deleteLocal(messages: readonly MessageRef[]): Promise<void> {
    return this.bridge.invoke('message.deleteLocal', {
      messages: messages.map(encodeMessageRef),
    });
  }

  async getAroundTime(
    channel: ChannelIdentifier,
    params: { sentTime: number; beforeCount: number; afterCount: number }
  ): Promise<Message[]> {
    return messageList(
      await this.bridge.invoke('message.getAroundTime', {
        channel: encodeChannel(channel),
        ...params,
      })
    );
  }

  async getById(ref: MessageRef): Promise<Message | undefined> {
    return optMessage(
      await this.bridge.invoke('message.getById', {
        message: encodeMessageRef(ref),
      })
    );
  }

  /** History query (local + remote, managed by the native SDK). */
  createMessagesQuery(params: MessagesQueryParams): PagedQuery<Message> {
    return new PagedQuery(
      this.bridge,
      'messages',
      compact({ ...params, channel: encodeChannel(params.channel) }),
      normalizeMessage
    );
  }

  createLocalMessagesByTimeQuery(
    params: LocalMessagesByTimeQueryParams
  ): PagedQuery<Message> {
    return new PagedQuery(
      this.bridge,
      'localMessagesByTime',
      compact({ ...params, channel: encodeChannel(params.channel) }),
      normalizeMessage
    );
  }

  createSearchMessagesQuery(
    params: SearchMessagesQueryParams
  ): PagedQuery<Message> {
    requireString(params.keyword, 'keyword');
    return new PagedQuery(
      this.bridge,
      'searchMessages',
      compact({ ...params }),
      normalizeMessage
    );
  }

  createSearchMessagesByUserQuery(
    params: SearchMessagesByUserQueryParams
  ): PagedQuery<Message> {
    return new PagedQuery(
      this.bridge,
      'searchMessagesByUser',
      compact({ ...params }),
      normalizeMessage
    );
  }

  createSearchMessagesByTimeRangeQuery(
    params: SearchMessagesByTimeRangeQueryParams
  ): PagedQuery<Message> {
    return new PagedQuery(
      this.bridge,
      'searchMessagesByTimeRange',
      compact({ ...params, channel: encodeChannel(params.channel) }),
      normalizeMessage
    );
  }

  createReadReceiptUsersQuery(
    params: ReadReceiptUsersQueryParams
  ): PagedQuery<ReadReceiptUser> {
    return new PagedQuery(
      this.bridge,
      'messagesReadReceiptUsers',
      compact({ ...params, channel: encodeChannel(params.channel) }),
      (v) => normalizeValue(v) as ReadReceiptUser
    );
  }

  /** Marks messages as read and notifies their senders (read receipts v5). */
  sendReadReceiptResponse(
    channel: ChannelIdentifier,
    messageIds: readonly string[]
  ): Promise<void> {
    return this.bridge.invoke('message.sendReadReceiptResponse', {
      channel: encodeChannel(channel),
      messageIds: requireStringList(messageIds, 'messageIds'),
    });
  }

  async getReadReceiptInfo(
    channel: ChannelIdentifier,
    messageIds: readonly string[]
  ): Promise<ReadReceiptInfo[]> {
    return normalizeValue(
      await this.bridge.invoke('message.getReadReceiptInfo', {
        channel: encodeChannel(channel),
        messageIds: requireStringList(messageIds, 'messageIds'),
      })
    ) as ReadReceiptInfo[];
  }

  async getReadReceiptInfoByIdentifiers(
    identifiers: readonly { channel: ChannelIdentifier; messageId: string }[]
  ): Promise<ReadReceiptInfo[]> {
    return normalizeValue(
      await this.bridge.invoke('message.getReadReceiptInfoByIdentifiers', {
        identifiers: identifiers.map((i) => ({
          channel: encodeChannel(i.channel),
          messageId: requireString(i.messageId, 'messageId'),
        })),
      })
    ) as ReadReceiptInfo[];
  }

  async getReadReceiptByUsers(
    channel: ChannelIdentifier,
    messageId: string,
    userIds: readonly string[]
  ): Promise<ReadReceiptUsersResult> {
    const raw = normalizeValue(
      await this.bridge.invoke('message.getReadReceiptByUsers', {
        channel: encodeChannel(channel),
        messageId: requireString(messageId, 'messageId'),
        userIds: requireStringList(userIds, 'userIds'),
      })
    );
    // iOS returns a user list; Android returns a result object.
    if (Array.isArray(raw)) return { users: raw as ReadReceiptUser[] };
    return raw as ReadReceiptUsersResult;
  }

  setMetadata(message: MessageRef, metadata: StringMap): Promise<void> {
    return this.bridge.invoke('message.setMetadata', {
      message: encodeMessageRef(message),
      metadata,
    });
  }

  deleteMetadata(message: MessageRef, keys: readonly string[]): Promise<void> {
    return this.bridge.invoke('message.deleteMetadata', {
      message: encodeMessageRef(message),
      keys: requireStringList(keys, 'keys'),
    });
  }

  setReceivedStatus(
    message: MessageRef,
    status: {
      isRead?: boolean;
      isListened?: boolean;
      isDownloaded?: boolean;
      isRetrieved?: boolean;
    }
  ): Promise<void> {
    return this.bridge.invoke('message.setReceivedStatus', {
      message: encodeMessageRef(message),
      ...status,
    });
  }

  /** Result arrives via the `speechToTextCompleted` event. */
  requestSpeechToText(message: MessageRef): Promise<void> {
    return this.bridge.invoke('message.requestSpeechToText', {
      message: encodeMessageRef(message),
    });
  }

  setSpeechToTextVisible(message: MessageRef, visible: boolean): Promise<void> {
    return this.bridge.invoke('message.setSpeechToTextVisible', {
      message: encodeMessageRef(message),
      visible,
    });
  }

  /** Requests the remaining stream content; deltas arrive as events. */
  requestStreamMessage(message: MessageRef): Promise<void> {
    return this.bridge.invoke('message.requestStream', {
      message: encodeMessageRef(message),
    });
  }

  /** Downloads a received media message's file. */
  async downloadMedia(
    message: MessageRef,
    callbacks: DownloadCallbacks = {}
  ): Promise<DownloadResult> {
    const opId = this.bridge.beginOperation({
      onEvent: (type, payload) => {
        if (type === 'op.progress' && callbacks.onProgress) {
          const record = isRecord(payload) ? payload : {};
          callbacks.onProgress(
            typeof record.progress === 'number' ? record.progress : 0
          );
        }
      },
    });
    try {
      const raw = await this.bridge.invoke('message.downloadMedia', {
        message: encodeMessageRef(message),
        opId,
      });
      const record = isRecord(raw) ? raw : {};
      return {
        message: optMessage(record.message),
        localPath:
          typeof record.localPath === 'string' ? record.localPath : undefined,
      };
    } finally {
      this.bridge.endOperation(opId);
    }
  }

  pauseDownloadMedia(message: MessageRef): Promise<void> {
    return this.bridge.invoke('message.pauseDownload', {
      message: encodeMessageRef(message),
    });
  }

  cancelDownloadMedia(message: MessageRef): Promise<void> {
    return this.bridge.invoke('message.cancelDownload', {
      message: encodeMessageRef(message),
    });
  }

  /**
   * Downloads a media URL to a local file and resolves with its path (iOS:
   * SDK cache; Android: `<cacheDir>/nexconn-media`).
   */
  async downloadMediaUrl(
    url: string,
    fileName: string,
    callbacks: DownloadCallbacks = {}
  ): Promise<string> {
    const opId = this.bridge.beginOperation({
      onEvent: (type, payload) => {
        if (type === 'op.progress' && callbacks.onProgress) {
          const record = isRecord(payload) ? payload : {};
          callbacks.onProgress(
            typeof record.progress === 'number' ? record.progress : 0
          );
        }
      },
    });
    try {
      return await this.bridge.invoke<string>('message.downloadMediaUrl', {
        url: requireString(url, 'url'),
        fileName: requireString(fileName, 'fileName'),
        opId,
      });
    } finally {
      this.bridge.endOperation(opId);
    }
  }

  /** Cancels a `downloadMediaUrl` download. */
  cancelDownloadMediaUrl(url: string): Promise<void> {
    return this.bridge.invoke('message.cancelDownloadMediaUrl', {
      url: requireString(url, 'url'),
    });
  }

  async getMediaDownloadInfo(
    url: string
  ): Promise<MediaDownloadInfo | undefined> {
    const raw = await this.bridge.invoke('message.getMediaDownloadInfo', {
      url: requireString(url, 'url'),
    });
    return raw == null ? undefined : (normalizeValue(raw) as MediaDownloadInfo);
  }

  /** Refreshes quoted (reference) messages; resolves after remote results. */
  async refreshReferenceMessages(
    channel: ChannelIdentifier,
    messageIds: readonly string[]
  ): Promise<{
    local: ReferenceRefreshResult[];
    remote: ReferenceRefreshResult[];
  }> {
    const raw = await this.bridge.invoke('message.refreshReference', {
      channel: encodeChannel(channel),
      messageIds: requireStringList(messageIds, 'messageIds'),
    });
    const record = isRecord(raw) ? raw : {};
    const mapResult = (v: unknown): ReferenceRefreshResult => {
      const r = isRecord(v) ? v : {};
      return {
        messageId: typeof r.messageId === 'string' ? r.messageId : '',
        message: optMessage(r.message),
        error: normalizeError(r.error),
        code: typeof r.code === 'number' ? r.code : undefined,
      };
    };
    return {
      local: (Array.isArray(record.local) ? record.local : []).map(mapResult),
      remote: (Array.isArray(record.remote) ? record.remote : []).map(
        mapResult
      ),
    };
  }
}
