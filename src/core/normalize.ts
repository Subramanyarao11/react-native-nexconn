/**
 * Converts the native bridge's JSON representation into the public models.
 *
 * Both native layers serialize SDK objects generically: every public property
 * becomes a JSON field, enums become their raw integer value and each object
 * carries `__type` (the SDK class name; iOS names may have an `NC` prefix).
 * The two SDKs use slightly different property names for a few models; this
 * module is the single place where those differences are reconciled.
 */
import type {
  Channel,
  ChannelIdentifier,
  Message,
  MessageContent,
  NativeErrorInfo,
  NexconnEventMap,
  NexconnEventName,
  PushNotification,
  PushToken,
  StringMap,
} from './types.ts';
import type { ChannelType } from './enums.ts';

type Rec = Record<string, unknown>;

export function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function optNum(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}
function bool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function stringList(value: unknown): string[] {
  return list(value).filter((v): v is string => typeof v === 'string');
}
function stringMap(value: unknown): StringMap {
  const out: Record<string, string> = {};
  if (isRecord(value)) {
    for (const [k, v] of Object.entries(value)) {
      if (k !== '__type' && typeof v === 'string') out[k] = v;
    }
  }
  return out;
}
function optStringMap(value: unknown): StringMap | undefined {
  return isRecord(value) ? stringMap(value) : undefined;
}

/** `NCTextMessage` -> `TextMessage`; `TextMessage` unchanged. */
export function nativeTypeName(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.__type !== 'string') return undefined;
  const name = value.__type;
  return /^NC[A-Z]/.test(name) ? name.slice(2) : name;
}

export function normalizeError(value: unknown): NativeErrorInfo | undefined {
  if (!isRecord(value)) return undefined;
  return { code: num(value.code, -1), message: str(value.message) ?? '' };
}

export function normalizeChannelIdentifier(
  value: unknown
): ChannelIdentifier | undefined {
  if (!isRecord(value)) return undefined;
  const source = isRecord(value.channelIdentifier)
    ? value.channelIdentifier
    : value;
  const channelId = str(source.channelId);
  if (channelId === undefined) return undefined;
  const subChannelId = str(source.subChannelId) ?? str(value.subChannelId);
  return {
    channelType: num(source.channelType, num(value.channelType)) as ChannelType,
    channelId,
    ...(subChannelId ? { subChannelId } : {}),
  };
}

const CONTENT_BASE_KEYS = ['extra', 'mentionedInfo', 'senderUserInfo'];

function contentBase(raw: Rec): Rec {
  const base: Rec = {};
  for (const key of CONTENT_BASE_KEYS) {
    if (raw[key] !== undefined && raw[key] !== null) {
      base[key] = key === 'extra' ? raw[key] : stripTypes(raw[key]);
    }
  }
  return base;
}

function mediaBase(raw: Rec): Rec {
  const base = contentBase(raw);
  for (const key of ['localPath', 'remoteUrl', 'name']) {
    const v = str(raw[key]);
    if (v) base[key] = v;
  }
  return base;
}

export function normalizeContent(
  value: unknown,
  messageType?: string
): MessageContent {
  if (!isRecord(value)) {
    return { type: 'unknown', nativeType: messageType };
  }
  const type = nativeTypeName(value);
  switch (type) {
    case 'TextMessage':
      return {
        type: 'text',
        text: str(value.text) ?? '',
        ...contentBase(value),
      };
    case 'ImageMessage':
      return {
        type: 'image',
        ...mediaBase(value),
        original: bool(value.original),
        thumbnailBase64:
          str(value.thumbnailBase64) ?? str(value.thumbnailBase64String),
        thumbWidth: optNum(value.thumWidth),
        thumbHeight: optNum(value.thumHeight),
      };
    case 'FileMessage':
      return {
        type: 'file',
        ...mediaBase(value),
        size: optNum(value.size),
        fileType: str(value.fileType),
      };
    case 'HDVoiceMessage':
      return {
        type: 'voice',
        ...mediaBase(value),
        duration: num(value.duration),
        numberOfChannels: optNum(value.numberOfChannels),
        sampleRate: optNum(value.sampleRate),
        format: str(value.format),
        speechToText: isRecord(value.sttInfo)
          ? {
              status: num(value.sttInfo.status) as never,
              text: str(value.sttInfo.text) ?? '',
              isVisible: bool(value.sttInfo.isVisible),
            }
          : str(value.sttInfo),
      };
    case 'GIFMessage':
      return {
        type: 'gif',
        ...mediaBase(value),
        width: num(value.width),
        height: num(value.height),
        dataSize: optNum(value.dataSize),
      };
    case 'ShortVideoMessage':
      return {
        type: 'video',
        ...mediaBase(value),
        duration: num(value.duration),
        size: optNum(value.size),
        thumbnailBase64: str(value.thumbnailBase64),
      };
    case 'LocationMessage':
      return {
        type: 'location',
        ...contentBase(value),
        latitude: num(value.latitude),
        longitude: num(value.longitude),
        poi: str(value.poi) ?? '',
        thumbnailBase64: str(value.thumbnailBase64),
      };
    case 'ReferenceMessage':
      return {
        type: 'reference',
        ...contentBase(value),
        content: str(value.content) ?? '',
        referMsgId: str(value.referMsgId) ?? '',
        referMsgSenderId: str(value.referMsgSenderId) ?? '',
        referMsg: isRecord(value.referMsg)
          ? normalizeContent(value.referMsg, str(value.referMsgType))
          : undefined,
        referMsgType: str(value.referMsgType),
        referMsgStatus: optNum(value.referMsgStatus) as never,
      };
    case 'CombineMessage':
      return {
        type: 'combine',
        ...mediaBase(value),
        channelType: num(value.channelType) as ChannelType,
        nameList: stringList(value.nameList),
        summaryList: stringList(value.summaryList),
        msgNum: optNum(value.msgNum),
        msgList: list(value.msgList).map(stripTypes),
      };
    case 'StreamMessage': {
      const ref = isRecord(value.referenceInfo)
        ? value.referenceInfo
        : undefined;
      return {
        type: 'stream',
        ...contentBase(value),
        content: str(value.content) ?? '',
        streamType: str(value.type),
        isComplete: bool(value.isComplete),
        completeReason: optNum(value.completeReason),
        stopReason: optNum(value.stopReason),
        sync: typeof value.sync === 'boolean' ? value.sync : undefined,
        referenceInfo: ref
          ? {
              senderUserId: str(ref.senderUserId),
              messageId: str(ref.messageId),
              content: isRecord(ref.content)
                ? normalizeContent(ref.content)
                : undefined,
            }
          : undefined,
      };
    }
    case 'RecallNotificationMessage':
      return {
        type: 'recallNotification',
        ...contentBase(value),
        operatorId: str(value.operatorId),
        admin: typeof value.admin === 'boolean' ? value.admin : undefined,
        recallTime: optNum(value.recallTime),
        originalObjectName: str(value.originalObjectName),
        recallContent: str(value.recallContent),
        originalContent: str(value.originalContent),
      };
    case 'CustomMessageContent':
      return {
        type: 'custom',
        ...mediaBase(value),
        messageType: str(value.messageType) ?? messageType ?? '',
        fields: isRecord(value.fields) ? value.fields : {},
      };
    default:
      return {
        type: 'unknown',
        nativeType: messageType ?? type,
        raw: stripTypes(value) as Rec,
        ...contentBase(value),
      };
  }
}

export function normalizeMessage(value: unknown): Message {
  if (!isRecord(value)) throw new TypeError('Invalid native message payload');
  const channel = normalizeChannelIdentifier(value.channelIdentifier) ?? {
    channelType: 1 as ChannelType,
    channelId: '',
  };
  const messageType = str(value.messageType);
  const received = isRecord(value.receivedStatusInfo)
    ? value.receivedStatusInfo
    : undefined;
  const update = isRecord(value.updateInfo) ? value.updateInfo : undefined;
  const content = isRecord(value.content) ? value.content : undefined;
  const translate =
    content && isRecord(content.translateInfo)
      ? content.translateInfo
      : undefined;
  const messageId = str(value.messageId);
  return {
    clientId: num(value.clientId),
    ...(messageId ? { messageId } : {}),
    channel,
    direction: num(value.direction, 1) as never,
    senderUserId: str(value.senderUserId),
    sentStatus: num(value.sentStatus) as never,
    sentTime: num(value.sentTime),
    messageType,
    content: normalizeContent(value.content, messageType),
    metadata: optStringMap(value.metadata),
    hasChanged: bool(value.hasChanged),
    updateInfo: update
      ? {
          timestamp: num(update.timestamp),
          content: isRecord(update.content)
            ? normalizeContent(update.content)
            : undefined,
          status: num(update.status) as never,
        }
      : undefined,
    needReceipt: bool(value.needReceipt),
    sentReceipt: bool(value.sentReceipt),
    receivedStatus: received
      ? {
          isRead: bool(received.isRead),
          isListened: bool(received.isListened),
          isDownloaded: bool(received.isDownloaded),
          isRetrieved: bool(received.isRetrieved),
          isMultipleReceive:
            typeof received.isMultipleReceive === 'boolean'
              ? received.isMultipleReceive
              : undefined,
        }
      : undefined,
    directedUserIds: Array.isArray(value.directedUserIds)
      ? stringList(value.directedUserIds)
      : undefined,
    disableNotification: bool(value.disableNotification),
    disableUpdateLastMessage: bool(value.disableUpdateLastMessage),
    isCounted: bool(value.isCounted),
    isPersisted: bool(value.isPersisted),
    isStatusMessage: bool(value.isStatusMessage),
    expiry: num(value.expiry),
    translateInfo: translate
      ? {
          targetLanguage: str(translate.targetLanguage) ?? '',
          translatedText: str(translate.translatedText) ?? '',
          status: num(translate.status) as never,
        }
      : undefined,
  };
}

export function optMessage(value: unknown): Message | undefined {
  return isRecord(value) ? normalizeMessage(value) : undefined;
}

export function messageList(value: unknown): Message[] {
  return list(value).filter(isRecord).map(normalizeMessage);
}

const CHANNEL_KEYS = new Set([
  '__type',
  'channelType',
  'channelId',
  'subChannelId',
  'unreadCount',
  'isPinned',
  'operationTime',
  'draft',
  'latestMessage',
  'mentionedCount',
  'mentionedMeCount',
  'noDisturbLevel',
  'translateStrategy',
  'includeRobot',
  'attributes',
  'editedMessageDraft',
  'dataManagementInfo',
]);

export function normalizeChannel(value: unknown): Channel {
  if (!isRecord(value)) throw new TypeError('Invalid native channel payload');
  const id = normalizeChannelIdentifier(value);
  if (!id) throw new TypeError('Native channel payload has no channelId');
  const extras: Rec = {};
  for (const [k, v] of Object.entries(value)) {
    if (!CHANNEL_KEYS.has(k)) extras[k] = stripTypes(v);
  }
  const draft = isRecord(value.editedMessageDraft)
    ? value.editedMessageDraft
    : undefined;
  const info = isRecord(value.dataManagementInfo)
    ? value.dataManagementInfo
    : undefined;
  return {
    ...id,
    unreadCount: num(value.unreadCount),
    isPinned: bool(value.isPinned),
    operationTime: num(value.operationTime),
    draft: str(value.draft) || undefined,
    latestMessage: optMessage(value.latestMessage),
    mentionedCount: num(value.mentionedCount),
    mentionedMeCount: num(value.mentionedMeCount),
    noDisturbLevel: num(value.noDisturbLevel) as never,
    translateStrategy: num(value.translateStrategy) as never,
    includeRobot: bool(value.includeRobot),
    attributes: stringMap(value.attributes),
    editedMessageDraft: draft
      ? { messageId: str(draft.messageId) ?? '', content: str(draft.content) }
      : undefined,
    dataManagementInfo: info
      ? { name: str(info.name), portraitUri: str(info.portraitUri) }
      : undefined,
    extras,
  };
}

export function channelList(value: unknown): Channel[] {
  return list(value).filter(isRecord).map(normalizeChannel);
}

/**
 * Per-type field renames so that both platforms produce the same shape.
 * Keys are native type names (without `NC`), values map native -> canonical.
 */
const RENAMES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  AppSettings: {
    isSpeechToTextEnable: 'speechToTextEnabled',
    isSpeechToTextEnabled: 'speechToTextEnabled',
    isOnlineStatusSubscribeEnable: 'onlineStatusSubscribeEnabled',
    isOnlineStatusSubscribeEnabled: 'onlineStatusSubscribeEnabled',
    isFriendOnlineStatusSubscribeEnable: 'friendOnlineStatusSubscribeEnabled',
    isFriendOnlineStatusSubscribeEnabled: 'friendOnlineStatusSubscribeEnabled',
  },
  Tag: { count: 'channelCount', timestamp: 'createTime' },
  ChannelTagInfo: { isPinned: 'isTop' },
  SubscribeUserOnlineStatus: { details: 'platforms' },
  UserOnlineStatus: { platformDetails: 'platforms' },
  OpenChannelParticipantActionInfo: { action: 'actionType' },
  OpenChannelDestroyedEvent: { type: 'destroyType' },
  CommunityUnreadInfo: { unreadMessageCount: 'unreadCount' },
  MediaDownloadInfo: { currentProgress: 'progress' },
  DownloadInfo: { length: 'totalLength' },
  TypingStatusChangedEvent: { userTypingStatus: 'users' },
  SubscriptionSyncCompletedEvent: { type: 'subscribeType' },
  OpenChannelMetadataChangedEvent: { changeInfo: 'changes' },
  MessageReadReceiptInfo: {},
};

/**
 * Generic deep normalization for models without a dedicated normalizer:
 * removes `__type`, applies per-type renames, converts nested messages,
 * channels, identifiers and errors.
 */
export function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (!isRecord(value)) return value;
  const type = nativeTypeName(value);
  if (type === 'Message') return normalizeMessage(value);
  if (type === 'NCError' || type === 'Error') return normalizeError(value);
  if (type && /Channel$/.test(type) && 'unreadCount' in value) {
    return normalizeChannel(value);
  }
  if (
    type === 'ChannelIdentifier' ||
    type === 'CommunitySubChannelIdentifier'
  ) {
    return normalizeChannelIdentifier(value);
  }
  const renames = (type && RENAMES[type]) || {};
  const out: Rec = {};
  for (const [key, v] of Object.entries(value)) {
    if (key === '__type') continue;
    if (key === 'channelIdentifier') {
      out.channel = normalizeChannelIdentifier(v);
      continue;
    }
    out[renames[key] ?? key] = normalizeValue(v);
  }
  // Android read receipt info exposes the identifier as flat fields.
  if (
    (type === 'ReadReceiptInfo' || type === 'MessageReadReceiptInfo') &&
    out.channel === undefined
  ) {
    const id = normalizeChannelIdentifier(value);
    if (id) out.channel = id;
    delete out.channelType;
    delete out.channelId;
    delete out.subChannelId;
  }
  if (type === 'CommunityUnreadInfo' && isRecord(out.channel)) {
    out.channelId = out.channel.channelId;
    out.subChannelId = out.channel.subChannelId;
    delete out.channel;
  }
  return out;
}

/** Removes `__type` markers without other transformations. */
export function stripTypes(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripTypes);
  if (!isRecord(value)) return value;
  const out: Rec = {};
  for (const [k, v] of Object.entries(value)) {
    if (k !== '__type') out[k] = stripTypes(v);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Event translation
// ---------------------------------------------------------------------------

type EventTranslator = (payload: Rec) => unknown;

function withDefaults(payload: Rec): Rec {
  return normalizeValue(payload) as Rec;
}

const EVENT_NAMES: Readonly<
  Record<string, readonly [NexconnEventName, EventTranslator?]>
> = {
  'ConnectionStatusHandler.onConnectionStatusChanged': [
    'connectionStatusChanged',
  ],
  'Engine.onDatabaseOpened': ['databaseOpened'],
  'DatabaseStatusHandler.onUpgradeWillStart': ['databaseUpgradeWillStart'],
  'DatabaseStatusHandler.onUpgrading': ['databaseUpgrading'],
  'DatabaseStatusHandler.onUpgradeCompleted': ['databaseUpgradeCompleted'],

  'MessageHandler.onMessageReceived': [
    'messageReceived',
    (p) => ({
      message: normalizeMessage(p.message),
      left: num(p.left),
      offline: bool(p.offline),
      hasPackage: bool(p.hasPackage),
    }),
  ],
  'MessageHandler.onOfflineMessageSyncCompleted': [
    'offlineMessageSyncCompleted',
  ],
  'MessageHandler.onMessageDeleted': [
    'messagesDeleted',
    (p) => ({ messages: messageList(p.messages) }),
  ],
  'MessageHandler.onExpireMessageDeleted': [
    'expiredMessagesDeleted',
    (p) => ({ messages: messageList(p.messages) }),
  ],
  'MessageHandler.onSpeechToTextCompleted': ['speechToTextCompleted'],
  'MessageHandler.onMessagesUpdated': [
    'messagesUpdated',
    (p) => ({ messages: messageList(p.messages) }),
  ],
  'MessageHandler.onMessageMetadataUpdated': ['messageMetadataUpdated'],
  'MessageHandler.onMessageMetadataDeleted': ['messageMetadataDeleted'],
  'MessageHandler.onCommunityChannelMessageMetadataChanged': [
    'communityMessageMetadataChanged',
    (p) => ({ messages: messageList(p.messages) }),
  ],
  'MessageHandler.onMessageReceiptResponse': ['readReceiptResponse'],
  'MessageHandler.onMessageBlocked': ['messageBlocked'],
  'MessageHandler.onStreamMessageRequestInit': ['streamMessageRequestInit'],
  'MessageHandler.onStreamMessageRequestDelta': [
    'streamMessageRequestDelta',
    (p) => ({
      message: optMessage(p.message),
      content: isRecord(p.chunkInfo) ? (str(p.chunkInfo.content) ?? '') : '',
    }),
  ],
  'MessageHandler.onStreamMessageRequestComplete': [
    'streamMessageRequestComplete',
  ],
  'MessageHandler.onUpdatedMessageSyncCompleted': [
    'updatedMessageSyncCompleted',
  ],

  'ChannelHandler.onChannelPinnedSync': ['channelPinnedSync'],
  'ChannelHandler.onChannelNoDisturbLevelSync': ['channelNoDisturbLevelSync'],
  'ChannelHandler.onChannelStatusSyncCompleted': ['channelStatusSyncCompleted'],
  'ChannelHandler.onChannelTranslateStrategySync': [
    'channelTranslateStrategySync',
  ],
  'ChannelHandler.onChannelUnreadStatusSync': ['channelUnreadStatusSync'],
  'ChannelHandler.onRemoteChannelsSyncCompleted': [
    'remoteChannelsSyncCompleted',
  ],
  'ChannelHandler.onTypingStatusChanged': ['typingStatusChanged'],
  'ChannelHandler.onCommunitySubChannelTypeChanged': [
    'communitySubChannelTypeChanged',
  ],
  'ChannelHandler.onCommunitySubChannelDeleted': ['communitySubChannelDeleted'],
  'ChannelHandler.onCommunitySubChannelUserKicked': [
    'communitySubChannelUserKicked',
  ],
  'ChannelHandler.onCommunityChannelsSyncCompleted': [
    'communityChannelsSyncCompleted',
  ],

  'GroupChannelHandler.onGroupOperation': ['groupOperation'],
  'GroupChannelHandler.onGroupInfoChanged': ['groupInfoChanged'],
  'GroupChannelHandler.onGroupMemberInfoChanged': ['groupMemberInfoChanged'],
  'GroupChannelHandler.onGroupApplicationEvent': ['groupApplication'],
  'GroupChannelHandler.onGroupFavoritesChangedSync': [
    'groupFavoritesChangedSync',
  ],

  'OpenChannelHandler.onEntering': ['openChannelEntering'],
  'OpenChannelHandler.onEntered': ['openChannelEntered'],
  'OpenChannelHandler.onEnterFailed': ['openChannelEnterFailed'],
  'OpenChannelHandler.onExited': ['openChannelExited'],
  'OpenChannelHandler.onReset': ['openChannelReset'],
  'OpenChannelHandler.onChannelDestroyed': ['openChannelDestroyed'],
  'OpenChannelHandler.onNotifyMultiLoginSync': ['openChannelMultiLoginSync'],
  'OpenChannelHandler.onParticipantBanned': ['openChannelParticipantBanned'],
  'OpenChannelHandler.onParticipantMuted': ['openChannelParticipantMuted'],
  'OpenChannelHandler.onMetadataSynced': ['openChannelMetadataSynced'],
  'OpenChannelHandler.onMetadataChanged': ['openChannelMetadataChanged'],
  'OpenChannelHandler.onParticipantChanged': ['openChannelParticipantChanged'],

  'TagHandler.onTagChanged': ['tagChanged'],
  'TagHandler.onChannelTagChanged': ['channelTagChanged'],

  'TranslateHandler.onTranslationCompleted': ['translationCompleted'],
  'TranslateHandler.onTranslationLanguageChanged': [
    'translationLanguageChanged',
  ],
  'TranslateHandler.onAutoTranslateStateChanged': ['autoTranslateStateChanged'],

  'UserHandler.onSubscriptionChanged': ['subscriptionChanged'],
  'UserHandler.onSubscriptionSyncCompleted': ['subscriptionSyncCompleted'],
  'UserHandler.onSubscriptionChangedOnOtherDevices': [
    'subscriptionChangedOnOtherDevices',
  ],
  'UserHandler.onFriendAdd': ['friendAdded'],
  'UserHandler.onFriendRemove': ['friendsRemoved'],
  'UserHandler.onFriendApplicationStatusChanged': [
    'friendApplicationStatusChanged',
  ],
  'UserHandler.onFriendCleared': ['friendsCleared'],
  'UserHandler.onFriendInfoChangedSync': ['friendInfoChangedSync'],

  'UserSettingsHandler.onUserSettingsSyncCompleted': [
    'userSettingsSyncCompleted',
  ],

  'Push.onNotificationOpened': [
    'notificationOpened',
    normalizePushNotification,
  ],
  'Push.onNotificationReceived': [
    'notificationReceived',
    normalizePushNotification,
  ],
  'Push.onTokenReceived': ['pushTokenReceived', normalizePushToken],
  'Push.onTokenError': [
    'pushTokenError',
    (p) => ({
      pushType: str(p.pushType),
      code: num(p.code),
      message: str(p.message),
      platform: p.platform === 'ios' ? 'ios' : 'android',
    }),
  ],
  'Push.onTokenReportResult': [
    'pushTokenReportResult',
    (p) => ({
      pushType: str(p.pushType),
      code: num(p.code),
      finalPushType: str(p.finalPushType),
    }),
  ],
};

/** Push events only one platform's push stack produces. */
export const PLATFORM_ONLY_EVENT_TYPES: Readonly<
  Record<string, 'android' | 'ios'>
> = { 'Push.onTokenReportResult': 'android' };

const CHANNEL_TYPE_VALUES = new Set([1, 3, 4, 6, 10]);

/** Normalizes a native push notification record (see `PushNotification`). */
export function normalizePushNotification(p: Rec): PushNotification {
  const channelType = optNum(p.channelType);
  const out: Record<string, unknown> = {
    id: str(p.id) ?? '',
    platform: p.platform === 'ios' ? 'ios' : 'android',
    raw: isRecord(p.raw) ? p.raw : {},
  };
  if (channelType !== undefined && CHANNEL_TYPE_VALUES.has(channelType)) {
    out.channelType = channelType;
  }
  for (const key of [
    'pushType',
    'channelId',
    'senderId',
    'senderName',
    'pushId',
    'objectName',
    'title',
    'body',
    'pushData',
    'extra',
    'notificationId',
    'actionIdentifier',
  ] as const) {
    const value = str(p[key]);
    if (value !== undefined && value !== '') out[key] = value;
  }
  const receivedTime = optNum(p.receivedTime);
  if (receivedTime !== undefined && receivedTime > 0) {
    out.receivedTime = receivedTime;
  }
  return out as unknown as PushNotification;
}

const APNS_CHANNEL_TYPES: Readonly<Record<string, number>> = {
  PR: 1,
  GRP: 3,
  CR: 4,
  SYS: 6,
  UG: 10,
};

/**
 * Parses a Nexconn APNs payload delivered through another notification
 * library (e.g. `expo-notifications` `request.content.data`, or a full
 * `userInfo`). Looks for the Nexconn `rc` record at the top level or under
 * `data`/`body`. Returns undefined for non-Nexconn payloads. Mirrors the
 * native iOS mapping; the `rc` keys (`cType`, `tId`, `fId`, `oName`, `id`)
 * follow the RongCloud APNs format and are not yet verified on a device.
 */
export function parseNexconnPushPayload(
  payload: unknown,
  extra: {
    readonly title?: string;
    readonly body?: string;
    readonly id?: string;
  } = {}
): PushNotification | undefined {
  if (!isRecord(payload)) return undefined;
  const candidates = [payload, payload.data, payload.body].filter(isRecord);
  let rc: Rec | undefined;
  let root: Rec = payload;
  for (const candidate of candidates) {
    let value = candidate.rc;
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch {
        value = undefined;
      }
    }
    if (isRecord(value)) {
      rc = value;
      root = candidate;
      break;
    }
  }
  if (!rc) return undefined;
  const aps = isRecord(root.aps) ? root.aps : undefined;
  const alert = aps?.alert;
  const title = extra.title ?? (isRecord(alert) ? str(alert.title) : undefined);
  const body =
    extra.body ??
    (isRecord(alert)
      ? str(alert.body)
      : typeof alert === 'string'
        ? alert
        : undefined);
  const cType = str(rc.cType);
  return normalizePushNotification({
    id: extra.id ?? `js-${str(rc.id) ?? Date.now().toString(36)}`,
    platform: 'ios',
    pushType: 'apns',
    channelType: cType ? APNS_CHANNEL_TYPES[cType] : undefined,
    channelId: rc.tId,
    senderId: rc.fId,
    objectName: rc.oName,
    pushId: rc.id,
    title,
    body,
    pushData: root.appData,
    raw: root,
  });
}

/** Normalizes a native push token record, or undefined if there is none. */
export function normalizePushToken(p: Rec): PushToken {
  return {
    token: str(p.token) ?? '',
    pushType: str(p.pushType),
    platform: p.platform === 'ios' ? 'ios' : 'android',
  };
}

/** All native handler events the bridge is expected to forward. */
export const NATIVE_EVENT_TYPES: readonly string[] = Object.keys(EVENT_NAMES);

export interface TranslatedEvent<
  K extends NexconnEventName = NexconnEventName,
> {
  readonly name: K;
  readonly payload: NexconnEventMap[K];
}

export function translateNativeEvent(
  type: string,
  payload: unknown
): TranslatedEvent {
  const entry = EVENT_NAMES[type];
  const record = isRecord(payload) ? payload : {};
  if (!entry) {
    return {
      name: 'unknownNativeEvent',
      payload: { type, payload: normalizeValue(payload) },
    };
  }
  const [name, translate] = entry;
  return {
    name,
    payload: (translate ?? withDefaults)(record) as never,
  };
}
