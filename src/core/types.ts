import type {
  AreaCode,
  ChannelNoDisturbLevel,
  ChannelType,
  CommunitySubChannelChangeType,
  CommunitySubChannelType,
  ConnectionStatus,
  FriendApplicationStatus,
  FriendApplicationType,
  FriendRelationType,
  GroupApplicationDirection,
  GroupApplicationStatus,
  GroupApplicationType,
  GroupInviteHandlePermission,
  GroupJoinPermission,
  GroupMemberFilterRobotType,
  GroupMemberInfoEditPermission,
  GroupMemberRole,
  GroupOperation,
  GroupOperationPermission,
  GroupOperationType,
  LogLevel,
  MentionedType,
  MessageBlockType,
  MessageDirection,
  MessagePersistent,
  MessageReadReceiptStatus,
  MessageUpdateStatus,
  NoDisturbTimeLevel,
  OpenChannelDestroyType,
  OpenChannelExitReason,
  OpenChannelMetadataOperationType,
  OpenChannelParticipantActionType,
  OpenChannelParticipantBanType,
  OpenChannelParticipantMuteType,
  OpenChannelSyncStatus,
  Platform,
  ReferenceMessageStatus,
  SentStatus,
  SpeechToTextStatus,
  SubscribeOperationType,
  SubscribeType,
  TranslateMode,
  TranslateSourceType,
  TranslateStatus,
  TranslateStrategy,
  UserType,
} from './enums.ts';

/** Plain string map used by metadata, attributes and extension profiles. */
export type StringMap = Readonly<Record<string, string>>;

/** Native fields not yet modelled are preserved here rather than dropped. */
export type NativeExtras = Readonly<Record<string, unknown>>;

export type RuntimePlatform = 'android' | 'ios';

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export interface ChannelIdentifier {
  readonly channelType: ChannelType;
  readonly channelId: string;
  /** Only for community sub-channels. */
  readonly subChannelId?: string;
}

/**
 * A message reference. `clientId` is the local database id assigned by the
 * native SDK; `messageId` is the server UID assigned after a successful send.
 */
export interface MessageRef {
  readonly clientId?: number;
  readonly messageId?: string;
}

// ---------------------------------------------------------------------------
// Init / connection
// ---------------------------------------------------------------------------

export interface CompressOptions {
  imageWidth?: number;
  imageHeight?: number;
  imageQuality?: number;
  maxOriginalImageSize?: number;
  thumbnailMaxSize?: number;
  thumbnailMinSize?: number;
  thumbnailQuality?: number;
  sightCompressWidth?: number;
  sightCompressHeight?: number;
  locationImageWidth?: number;
  locationImageHeight?: number;
  locationImageQuality?: number;
}

export interface InitOptions {
  /** App Key from the Nexconn console. Never pass the App Secret. */
  appKey: string;
  areaCode?: AreaCode;
  naviServer?: string;
  logLevel?: LogLevel;
  /** Android only. Defaults to the SDK default (true). */
  enablePush?: boolean;
  enableSyncEmptyTopConversation?: boolean;
  compressOptions?: CompressOptions;
  /** iOS only: keep the connection alive in the background. */
  forceKeepAlive?: boolean;
  /** iOS only. */
  crashMonitorEnabled?: boolean;
}

export interface InitResult {
  readonly alreadyInitialized: boolean;
  readonly platform: RuntimePlatform;
  readonly sdkVersion: string;
}

export interface ConnectOptions {
  /**
   * Per-user access token issued by your authenticated backend. It is passed
   * to the native SDK and never logged by the bridge.
   */
  token: string;
  /** Seconds. `0` or omitted uses the SDK default. */
  timeout?: number;
  reconnectKickEnable?: boolean;
}

export interface ConnectResult {
  readonly userId: string;
  readonly generation: number;
}

export interface DatabaseOpenedEvent {
  readonly isRecreated: boolean;
  readonly error?: NativeErrorInfo;
}

export interface NativeErrorInfo {
  readonly code: number;
  readonly message: string;
}

export interface AppSettings {
  readonly speechToTextEnabled: boolean;
  readonly messageModifiableMinutes: number;
  readonly onlineStatusSubscribeEnabled: boolean;
  readonly friendOnlineStatusSubscribeEnabled: boolean;
  readonly gifLimitSize: number;
  readonly maxVideoDurationSeconds: number;
}

export interface Capabilities {
  readonly platform: RuntimePlatform;
  readonly sdkVersion: string;
  readonly bridgeVersion: string;
  /** Bridge methods implemented by this platform's native layer. */
  readonly methods: readonly string[];
}

export interface NoDisturbTimeInput {
  /** `HH:MM:SS`. */
  startTime: string;
  spanMinutes: number;
  level?: NoDisturbTimeLevel;
  timezone?: string;
}

export interface NoDisturbTimeInfo {
  readonly startTime: string;
  readonly spanMinutes: number;
  readonly level: NoDisturbTimeLevel;
  readonly timezone?: string;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export interface UserInfo {
  userId?: string;
  userType?: UserType;
  name?: string;
  portraitUri?: string;
  alias?: string;
  extra?: string;
}

export interface UserProfile {
  readonly userId: string;
  readonly name?: string;
  readonly avatarUrl?: string;
  readonly uniqueId?: string;
  readonly email?: string;
  readonly birthday?: string;
  readonly gender?: number;
  readonly location?: string;
  readonly role?: number;
  readonly level?: number;
  readonly extProfile?: StringMap;
}

export type UserProfileInput = Omit<UserProfile, 'uniqueId'> & {
  uniqueId?: string;
};

export interface FriendInfo {
  readonly userId: string;
  readonly name?: string;
  readonly avatarUrl?: string;
  readonly remark?: string;
  readonly extProfile?: StringMap;
  readonly addTime?: number;
}

export interface FriendRelation {
  readonly userId: string;
  readonly relationType: FriendRelationType;
}

export interface FriendApplication {
  readonly userId: string;
  readonly name?: string;
  readonly avatarUrl?: string;
  readonly applicationType: FriendApplicationType;
  readonly applicationStatus: FriendApplicationStatus;
  readonly operationTime: number;
  readonly extra?: string;
}

export interface PlatformOnlineStatus {
  readonly platform: Platform;
  readonly isOnline: boolean;
  readonly updateTime: number;
}

export interface UserOnlineStatus {
  readonly userId: string;
  readonly isOnline: boolean;
  readonly platforms: readonly PlatformOnlineStatus[];
}

export interface SubscriptionStatusDetail {
  readonly eventValue: number;
  readonly changeTime: number;
  readonly platform: Platform;
}

export interface SubscriptionStatusInfo {
  readonly userId: string;
  readonly subscribeType: SubscribeType;
  readonly subscribeTime: number;
  readonly expiry: number;
  readonly details: readonly SubscriptionStatusDetail[];
  readonly userProfile?: UserProfile;
}

export interface SubscribeChange {
  readonly userId: string;
  readonly subscribeType: SubscribeType;
  readonly operationType: SubscribeOperationType;
  readonly subscribeTime: number;
  readonly expiry: number;
}

// ---------------------------------------------------------------------------
// Message content
// ---------------------------------------------------------------------------

export interface MentionedInfo {
  type: MentionedType;
  userIdList?: readonly string[];
  mentionedContent?: string;
  /** iOS only. */
  readonly isMentionedMe?: boolean;
}

interface ContentBase {
  extra?: string;
  mentionedInfo?: MentionedInfo;
  senderUserInfo?: UserInfo;
}

interface MediaBase extends ContentBase {
  /** Local file path or `file://` URI. Required when sending. */
  localPath?: string;
  remoteUrl?: string;
  name?: string;
}

export interface TextContent extends ContentBase {
  type: 'text';
  text: string;
}
export interface ImageContent extends MediaBase {
  type: 'image';
  original?: boolean;
  readonly thumbnailBase64?: string;
  readonly thumbWidth?: number;
  readonly thumbHeight?: number;
}
export interface FileContent extends MediaBase {
  type: 'file';
  size?: number;
  fileType?: string;
}
export interface VoiceContent extends MediaBase {
  type: 'voice';
  /** Seconds. */
  duration: number;
  readonly numberOfChannels?: number;
  readonly sampleRate?: number;
  readonly format?: string;
  readonly speechToText?: SpeechToTextInfo | string;
}
export interface GifContent extends MediaBase {
  type: 'gif';
  width: number;
  height: number;
  readonly dataSize?: number;
}
export interface VideoContent extends MediaBase {
  type: 'video';
  /** Seconds. */
  duration: number;
  size?: number;
  /** Local path of the thumbnail image (required by iOS when sending). */
  thumbnailPath?: string;
  readonly thumbnailBase64?: string;
}
export interface LocationContent extends ContentBase {
  type: 'location';
  latitude: number;
  longitude: number;
  poi: string;
  /** Local path to a map snapshot (required by iOS when sending). */
  thumbnailPath?: string;
  readonly thumbnailBase64?: string;
}
export interface ReferenceContent extends ContentBase {
  type: 'reference';
  /** The reply text. */
  content: string;
  referMsgId: string;
  referMsgSenderId: string;
  /** Content of the quoted message (received or supplied). */
  referMsg?: MessageContent;
  readonly referMsgType?: string;
  readonly referMsgStatus?: ReferenceMessageStatus;
}
export interface CombineContent extends MediaBase {
  type: 'combine';
  /** Messages to forward as one combined message (send only). */
  messages?: readonly MessageRef[];
  channelType: ChannelType;
  nameList: readonly string[];
  summaryList: readonly string[];
  readonly msgNum?: number;
  readonly msgList?: readonly unknown[];
}
export interface StreamContent extends ContentBase {
  readonly type: 'stream';
  readonly content: string;
  readonly streamType?: string;
  readonly isComplete: boolean;
  readonly completeReason?: number;
  readonly stopReason?: number;
  readonly sync?: boolean;
  readonly referenceInfo?: {
    readonly senderUserId?: string;
    readonly messageId?: string;
    readonly content?: MessageContent;
  };
}
export interface RecallNotificationContent extends ContentBase {
  readonly type: 'recallNotification';
  readonly operatorId?: string;
  readonly admin?: boolean;
  readonly recallTime?: number;
  readonly originalObjectName?: string;
  readonly recallContent?: string;
  readonly originalContent?: string;
}
export interface CustomContent extends MediaBase {
  type: 'custom';
  /** Registered with `client.registerCustomMessages`. */
  messageType: string;
  fields: Readonly<Record<string, unknown>>;
}
export interface UnknownContent extends ContentBase {
  readonly type: 'unknown';
  readonly nativeType?: string;
  readonly raw?: NativeExtras;
}

export type MessageContent =
  | TextContent
  | ImageContent
  | FileContent
  | VoiceContent
  | GifContent
  | VideoContent
  | LocationContent
  | ReferenceContent
  | CombineContent
  | StreamContent
  | RecallNotificationContent
  | CustomContent
  | UnknownContent;

/** Content accepted by `messages.send` / `messages.sendMedia`. */
export type OutgoingContent = Exclude<
  MessageContent,
  StreamContent | RecallNotificationContent | UnknownContent
>;

export interface SpeechToTextInfo {
  readonly status: SpeechToTextStatus;
  readonly text: string;
  readonly isVisible: boolean;
}

export interface TranslateInfo {
  readonly targetLanguage: string;
  readonly translatedText: string;
  readonly status: TranslateStatus;
}

export interface CustomMessageDefinition {
  /** Unique object name, for example `app:poll`. */
  messageType: string;
  persistentFlag: MessagePersistent;
  /** Field names whose string values are indexed for search. */
  searchableFields?: readonly string[];
  /** Media custom messages are uploaded with `sendMedia`. */
  isMedia?: boolean;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export interface MessageReceivedStatus {
  readonly isRead: boolean;
  readonly isListened: boolean;
  readonly isDownloaded: boolean;
  readonly isRetrieved: boolean;
  readonly isMultipleReceive?: boolean;
}

export interface MessageUpdateInfo {
  readonly timestamp: number;
  readonly content?: MessageContent;
  readonly status: MessageUpdateStatus;
}

export interface Message {
  readonly clientId: number;
  /** Server UID; undefined until the server acknowledges the message. */
  readonly messageId?: string;
  readonly channel: ChannelIdentifier;
  readonly direction: MessageDirection;
  readonly senderUserId?: string;
  readonly sentStatus: SentStatus;
  /** Milliseconds since epoch, as reported by the native SDK. */
  readonly sentTime: number;
  readonly messageType?: string;
  readonly content: MessageContent;
  readonly metadata?: StringMap;
  readonly hasChanged: boolean;
  readonly updateInfo?: MessageUpdateInfo;
  readonly needReceipt: boolean;
  readonly sentReceipt: boolean;
  readonly receivedStatus?: MessageReceivedStatus;
  readonly directedUserIds?: readonly string[];
  readonly disableNotification: boolean;
  readonly disableUpdateLastMessage: boolean;
  readonly isCounted: boolean;
  readonly isPersisted: boolean;
  readonly isStatusMessage: boolean;
  readonly expiry: number;
  readonly translateInfo?: TranslateInfo;
}

export interface AndroidPushConfig {
  notificationId?: string;
  channelIdHW?: string;
  importanceHW?: string;
  hwImageUrl?: string;
  categoryHW?: string;
  fcmChannelId?: string;
  fcmCollapseKey?: string;
  fcmImageUrl?: string;
}

export interface IOSPushConfig {
  threadId?: string;
  category?: string;
  apnsCollapseId?: string;
  richMediaUri?: string;
  interruptionLevel?: string;
}

export interface PushConfig {
  disablePushTitle?: boolean;
  pushTitle?: string;
  pushContent?: string;
  pushData?: string;
  forceShowDetailContent?: boolean;
  templateId?: string;
  iOSConfig?: IOSPushConfig;
  androidConfig?: AndroidPushConfig;
}

export interface SendOptions {
  pushConfig?: PushConfig;
  directedUserIds?: readonly string[];
  disableNotification?: boolean;
  disableUpdateLastMessage?: boolean;
  metadata?: StringMap;
  needReceipt?: boolean;
  /** Seconds before the message expires; 0 = never. */
  expiry?: number;
}

export interface SendMediaCallbacks {
  /** Called once the message has been stored locally. */
  onAttached?: (message: Message) => void;
  /** Upload progress in percent. */
  onProgress?: (progress: number, message: Message | undefined) => void;
}

export interface InsertMessageInput {
  content: OutgoingContent;
  direction: MessageDirection;
  senderUserId?: string;
  sentTime: number;
  sentStatus: SentStatus;
}

export interface ReadReceiptUser {
  readonly userId: string;
  readonly timestamp: number;
  readonly isMentioned: boolean;
}

export interface ReadReceiptInfo {
  readonly channel?: ChannelIdentifier;
  readonly messageId: string;
  readonly readCount: number;
  readonly unreadCount: number;
  readonly totalCount: number;
}

export interface ReadReceiptResponse extends ReadReceiptInfo {
  readonly users: readonly ReadReceiptUser[];
}

export interface ReadReceiptUsersResult {
  readonly users: readonly ReadReceiptUser[];
  readonly totalCount?: number;
  readonly pageToken?: string;
}

export interface MediaDownloadInfo {
  readonly totalLength?: number;
  readonly currentLength?: number;
  readonly progress?: number;
  readonly filePath?: string;
  readonly url?: string;
  readonly isDownloading?: boolean;
  readonly isFinished?: boolean;
}

export interface DownloadResult {
  /** Updated message (Android) when the SDK returns it. */
  readonly message?: Message;
  /** Local path of the downloaded media when the SDK returns it (iOS). */
  readonly localPath?: string;
}

export interface ReferenceRefreshResult {
  readonly messageId: string;
  readonly message?: Message;
  readonly error?: NativeErrorInfo;
  /** iOS result code (0 success, 1 not found, -1 error). */
  readonly code?: number;
}

export interface BlockedMessageInfo {
  readonly channel: ChannelIdentifier;
  readonly messageId: string;
  readonly blockType: MessageBlockType;
  readonly extra?: string;
  readonly sentTime?: number;
  readonly sourceType: number;
  readonly sourceContent?: string;
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

export interface Channel extends ChannelIdentifier {
  readonly unreadCount: number;
  readonly isPinned: boolean;
  readonly operationTime: number;
  readonly draft?: string;
  readonly latestMessage?: Message;
  readonly mentionedCount: number;
  readonly mentionedMeCount: number;
  readonly noDisturbLevel: ChannelNoDisturbLevel;
  readonly translateStrategy: TranslateStrategy;
  readonly includeRobot: boolean;
  readonly attributes: StringMap;
  readonly editedMessageDraft?: {
    readonly messageId: string;
    readonly content?: string;
  };
  readonly dataManagementInfo?: {
    readonly name?: string;
    readonly portraitUri?: string;
  };
  /** Subclass-specific fields (memberCount, participantCount, peerUserId...). */
  readonly extras: NativeExtras;
}

export interface ChannelSearchResult {
  readonly channel: Channel;
  readonly matchCount: number;
}

export interface ChannelTagInfo {
  readonly tag: Tag;
  readonly isTop: boolean;
}

export interface TypingStatus {
  readonly userId: string;
  readonly typingMessageType: string;
  readonly sentTime: number;
}

export interface CommunityUnreadInfo {
  readonly channelId: string;
  readonly subChannelId?: string;
  readonly unreadCount: number;
  readonly mentionedCount: number;
  readonly mentionedMeCount: number;
  readonly noDisturbLevel: ChannelNoDisturbLevel;
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export interface GroupPermissions {
  joinPermission?: GroupJoinPermission;
  removeMemberPermission?: GroupOperationPermission;
  invitePermission?: GroupOperationPermission;
  inviteHandlePermission?: GroupInviteHandlePermission;
  groupInfoEditPermission?: GroupOperationPermission;
  memberInfoEditPermission?: GroupMemberInfoEditPermission;
}

export interface GroupInfo extends Required<Readonly<GroupPermissions>> {
  readonly groupId: string;
  readonly groupName: string;
  readonly avatarUrl?: string;
  readonly introduction?: string;
  readonly notice?: string;
  readonly extProfile: StringMap;
  readonly creatorId?: string;
  readonly ownerId?: string;
  readonly createTime: number;
  readonly membersCount: number;
  readonly joinedTime: number;
  readonly role: GroupMemberRole;
}

export interface GroupMemberInfo {
  readonly userId: string;
  readonly name?: string;
  readonly avatarUrl?: string;
  readonly nickname?: string;
  readonly extra?: string;
  readonly role: GroupMemberRole;
  readonly joinedTime: number;
  readonly isRobot: boolean;
}

export interface GroupApplicationInfo {
  readonly groupId: string;
  readonly joinMemberInfo?: GroupMemberInfo;
  readonly inviterInfo?: GroupMemberInfo;
  readonly operatorInfo?: GroupMemberInfo;
  readonly status: GroupApplicationStatus;
  readonly direction: GroupApplicationDirection;
  readonly type: GroupApplicationType;
  readonly operationTime: number;
  readonly reason?: string;
}

export interface GroupFavorite {
  readonly userId: string;
  readonly time: number;
}

export interface CreateGroupInput extends GroupPermissions {
  groupId: string;
  groupName: string;
  inviteeUserIds?: readonly string[];
  avatarUrl?: string;
  introduction?: string;
  notice?: string;
  extProfile?: StringMap;
}

export type UpdateGroupInput = Partial<
  Omit<CreateGroupInput, 'groupId' | 'inviteeUserIds'>
>;

export interface CreateGroupResult {
  readonly processCode: number;
  /** Keys rejected by content moderation, if any. */
  readonly errorKeys: readonly string[];
}

export interface LeaveGroupConfig {
  deleteMuteStatus?: boolean;
  deleteAllowedSendersList?: boolean;
  deleteFavorites?: boolean;
}

// ---------------------------------------------------------------------------
// Open channels
// ---------------------------------------------------------------------------

export interface OpenChannelEnterResponse {
  readonly createTime: number;
  readonly participantCount: number;
  readonly isAllChannelMuted: boolean;
  readonly isCurrentUserMuted: boolean;
  readonly isCurrentChannelMuted: boolean;
  readonly isCurrentChannelInAllowlist: boolean;
  readonly enterTime: number;
}

export interface OpenChannelParticipantAction {
  readonly userId: string;
  readonly actionType: OpenChannelParticipantActionType;
  readonly extra?: string;
}

export interface OpenChannelMetadataChange {
  readonly channelId: string;
  readonly key: string;
  readonly value?: string;
  readonly operationType: OpenChannelMetadataOperationType;
}

export interface OpenChannelMultiLoginSyncInfo {
  readonly channelId: string;
  readonly status: OpenChannelSyncStatus;
  readonly reason: OpenChannelExitReason;
  readonly timestamp: number;
  readonly extra?: string;
}

export interface OpenChannelMutedInfo {
  readonly channelId: string;
  readonly muteType: OpenChannelParticipantMuteType;
  readonly durationTime: number;
  readonly operateTime: number;
  readonly userIds: readonly string[];
  readonly extra?: string;
}

export interface OpenChannelBannedInfo {
  readonly channelId: string;
  readonly banType: OpenChannelParticipantBanType;
  readonly durationTime: number;
  readonly operateTime: number;
  readonly userIds: readonly string[];
  readonly extra?: string;
}

// ---------------------------------------------------------------------------
// Tags / translation
// ---------------------------------------------------------------------------

export interface Tag {
  readonly tagId: string;
  readonly tagName: string;
  readonly channelCount: number;
  readonly createTime: number;
}

export interface TranslateResult {
  readonly identifier: string;
  readonly sourceType: TranslateSourceType;
  readonly translateInfo?: TranslateInfo;
  readonly error?: NativeErrorInfo;
}

export interface TranslateMessageItem {
  messageId: string;
  sourceLanguage?: string;
  targetLanguage?: string;
}

export interface TranslateTextItem {
  text: string;
  sourceLanguage?: string;
  targetLanguage?: string;
}

export interface TranslateMessagesInput {
  list: readonly TranslateMessageItem[];
  force?: boolean;
  mode?: TranslateMode;
}

export interface TranslateTextsInput {
  list: readonly TranslateTextItem[];
  mode?: TranslateMode;
}

// ---------------------------------------------------------------------------
// Paged queries
// ---------------------------------------------------------------------------

export interface Page<T> {
  readonly items: readonly T[];
  readonly totalCount?: number;
  readonly hasMore?: boolean;
}

export interface ChannelsQueryParams {
  channelTypes: readonly ChannelType[];
  pageSize?: number;
  startTime?: number;
  topPriority?: boolean;
}

export interface MessagesQueryParams {
  channel: ChannelIdentifier;
  pageSize?: number;
  startTime?: number;
  isAscending?: boolean;
}

export interface LocalMessagesByTimeQueryParams {
  channel: ChannelIdentifier;
  sentTime?: number;
  isAscending?: boolean;
  messageTypes?: readonly string[];
  pageSize?: number;
}

export interface SearchMessagesByUserQueryParams {
  channelType: ChannelType;
  channelId: string;
  userId: string;
  startTime?: number;
  pageSize?: number;
  subChannelIds?: readonly string[];
}

export interface SearchMessagesByTimeRangeQueryParams {
  channel: ChannelIdentifier;
  keyword: string;
  startTime: number;
  endTime: number;
  pageSize?: number;
}

export interface SearchMessagesQueryParams {
  keyword: string;
  startTime?: number;
  endTime?: number;
  channelTypes?: readonly ChannelType[];
  channelIds?: readonly string[];
  subChannelIds?: readonly string[];
  senderUserIds?: readonly string[];
  messageTypes?: readonly string[];
  pageSize?: number;
  isAscending?: boolean;
}

export interface ReadReceiptUsersQueryParams {
  channel: ChannelIdentifier;
  messageId: string;
  pageSize?: number;
  status?: MessageReadReceiptStatus;
  isAscending?: boolean;
}

export interface OpenChannelMessagesQueryParams {
  channelId: string;
  startTime?: number;
  pageSize?: number;
  isAscending?: boolean;
}

export interface UnreadMentionMeChannelsQueryParams {
  channelTypes: readonly ChannelType[];
  topPriority?: boolean;
  startTime?: number;
  pageSize?: number;
}

export interface GroupApplicationsQueryParams {
  pageSize?: number;
  isAscending?: boolean;
  directions?: readonly GroupApplicationDirection[];
  status?: readonly GroupApplicationStatus[];
}

export interface JoinedGroupsByRoleQueryParams {
  role?: GroupMemberRole;
  pageSize?: number;
  isAscending?: boolean;
}

export interface SearchJoinedGroupsQueryParams {
  groupName: string;
  pageSize?: number;
  isAscending?: boolean;
}

export interface SearchGroupMembersQueryParams {
  groupId: string;
  memberName: string;
  pageSize?: number;
  isAscending?: boolean;
}

export interface GroupMembersByRoleQueryParams {
  groupId: string;
  role?: GroupMemberRole;
  pageSize?: number;
  isAscending?: boolean;
  filterRobotType?: GroupMemberFilterRobotType;
}

export interface FriendApplicationsQueryParams {
  pageSize?: number;
  isAscending?: boolean;
  applicationTypes?: readonly FriendApplicationType[];
  applicationStatuses?: readonly FriendApplicationStatus[];
}

export interface SubscribeQueryParams {
  subscribeType: SubscribeType;
  pageSize?: number;
}

export interface TaggedChannelsQueryParams {
  tagId: string;
  pageSize?: number;
  startTime?: number;
}

export interface UntaggedChannelsQueryParams {
  pageSize?: number;
  topPriority?: boolean;
  startTime?: number;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** A Nexconn push notification, as reported by the native push plumbing. */
export interface PushNotification {
  /** Bridge-assigned id, unique per process; used to de-duplicate taps. */
  readonly id: string;
  readonly platform: 'android' | 'ios';
  /** Push provider: `apns` on iOS; RongPush type name on Android (e.g. `FCM`). */
  readonly pushType?: string;
  readonly channelType?: ChannelType;
  /** Target id of the channel (user id for direct, group id for group). */
  readonly channelId?: string;
  readonly senderId?: string;
  /** Android only. */
  readonly senderName?: string;
  /** Server push id; on most pushes the message UID. */
  readonly pushId?: string;
  /** Message object name, e.g. `RC:TxtMsg`. */
  readonly objectName?: string;
  readonly title?: string;
  readonly body?: string;
  /** `pushData` set by the sender (`PushConfig.pushData`). */
  readonly pushData?: string;
  /** Android only. */
  readonly extra?: string;
  /** Android only (milliseconds). */
  readonly receivedTime?: number;
  /** iOS: notification request identifier; Android: SDK notification id. */
  readonly notificationId?: string;
  /** iOS: non-default action identifier the user chose. */
  readonly actionIdentifier?: string;
  /** Provider-specific fields (iOS: the full `userInfo`). */
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface PushToken {
  readonly token: string;
  readonly pushType?: string;
  readonly platform: 'android' | 'ios';
}

/**
 * Notification permission. Android reports only `granted`/`denied` from the
 * system setting; iOS also `undetermined`, `provisional` and `ephemeral`.
 */
export type PushPermissionStatus =
  'granted' | 'denied' | 'undetermined' | 'provisional' | 'ephemeral';

export interface PushPermissionRequest {
  /** iOS: authorization options (default alert, badge and sound). */
  readonly alert?: boolean;
  readonly badge?: boolean;
  readonly sound?: boolean;
  readonly provisional?: boolean;
  /** iOS: call `registerForRemoteNotifications` when granted (default true). */
  readonly registerForRemoteNotifications?: boolean;
}

export interface NexconnEventMap {
  connectionStatusChanged: { readonly status: ConnectionStatus };
  databaseOpened: DatabaseOpenedEvent;
  databaseUpgradeWillStart: Record<string, never>;
  databaseUpgrading: { readonly progress: number };
  databaseUpgradeCompleted: { readonly error?: NativeErrorInfo };

  messageReceived: {
    readonly message: Message;
    readonly left: number;
    readonly offline: boolean;
    readonly hasPackage: boolean;
  };
  offlineMessageSyncCompleted: Record<string, never>;
  messagesDeleted: { readonly messages: readonly Message[] };
  expiredMessagesDeleted: { readonly messages: readonly Message[] };
  speechToTextCompleted: {
    readonly messageId: string;
    readonly info?: SpeechToTextInfo;
    readonly error?: NativeErrorInfo;
    readonly code?: number;
  };
  messagesUpdated: { readonly messages: readonly Message[] };
  messageMetadataUpdated: {
    readonly metadata: StringMap;
    readonly message?: Message;
  };
  messageMetadataDeleted: {
    readonly keys: readonly string[];
    readonly message?: Message;
  };
  communityMessageMetadataChanged: { readonly messages: readonly Message[] };
  readReceiptResponse: { readonly responses: readonly ReadReceiptResponse[] };
  messageBlocked: { readonly info?: BlockedMessageInfo };
  streamMessageRequestInit: { readonly messageId: string };
  streamMessageRequestDelta: {
    readonly message?: Message;
    readonly content: string;
  };
  streamMessageRequestComplete: {
    readonly messageId: string;
    readonly error?: NativeErrorInfo;
  };
  updatedMessageSyncCompleted: Record<string, never>;

  channelPinnedSync: {
    readonly channel: ChannelIdentifier;
    readonly isPinned: boolean;
  };
  channelNoDisturbLevelSync: {
    readonly channel: ChannelIdentifier;
    readonly level: ChannelNoDisturbLevel;
  };
  channelStatusSyncCompleted: { readonly error?: NativeErrorInfo };
  channelTranslateStrategySync: {
    readonly channel: ChannelIdentifier;
    readonly strategy: TranslateStrategy;
  };
  channelUnreadStatusSync: { readonly channel: ChannelIdentifier };
  remoteChannelsSyncCompleted: { readonly error?: NativeErrorInfo };
  typingStatusChanged: {
    readonly channel: ChannelIdentifier;
    readonly users: readonly TypingStatus[];
  };
  communitySubChannelTypeChanged: {
    readonly info: readonly {
      readonly channel?: ChannelIdentifier;
      readonly changeType: CommunitySubChannelChangeType;
      readonly time: number;
    }[];
  };
  communitySubChannelDeleted: {
    readonly info: readonly {
      readonly channel?: ChannelIdentifier;
      readonly subChannelType: CommunitySubChannelType;
      readonly operationTime: number;
    }[];
  };
  communitySubChannelUserKicked: {
    readonly info: readonly {
      readonly channel?: ChannelIdentifier;
      readonly userId: string;
      readonly time: number;
    }[];
  };
  communityChannelsSyncCompleted: Record<string, never>;

  groupOperation: {
    readonly groupId: string;
    readonly operation: GroupOperation;
    readonly operatorInfo?: GroupMemberInfo;
    readonly groupInfo?: GroupInfo;
    readonly memberInfos: readonly GroupMemberInfo[];
    readonly operationTime: number;
  };
  groupInfoChanged: {
    readonly operatorInfo?: GroupMemberInfo;
    readonly groupInfo?: GroupInfo;
    readonly changedProperties: readonly string[];
    readonly operationTime: number;
  };
  groupMemberInfoChanged: {
    readonly groupId: string;
    readonly operatorInfo?: GroupMemberInfo;
    readonly memberInfo?: GroupMemberInfo;
    readonly operationTime: number;
  };
  groupApplication: { readonly info: GroupApplicationInfo };
  groupFavoritesChangedSync: {
    readonly groupId: string;
    readonly operationType: GroupOperationType;
    readonly userIds: readonly string[];
    readonly operationTime: number;
  };

  openChannelEntering: { readonly channelId: string };
  openChannelEntered: {
    readonly channelId: string;
    readonly response?: OpenChannelEnterResponse;
  };
  openChannelEnterFailed: {
    readonly channelId: string;
    readonly error?: NativeErrorInfo;
  };
  openChannelExited: { readonly channelId: string };
  openChannelReset: { readonly channelId: string };
  openChannelDestroyed: {
    readonly channelId: string;
    readonly destroyType: OpenChannelDestroyType;
  };
  openChannelMultiLoginSync: { readonly info: OpenChannelMultiLoginSyncInfo };
  openChannelParticipantBanned: { readonly info: OpenChannelBannedInfo };
  openChannelParticipantMuted: { readonly info: OpenChannelMutedInfo };
  openChannelMetadataSynced: { readonly channelId: string };
  openChannelMetadataChanged: {
    readonly changes: readonly OpenChannelMetadataChange[];
  };
  openChannelParticipantChanged: {
    readonly channelId: string;
    readonly actions: readonly OpenChannelParticipantAction[];
    readonly participantCount: number;
  };

  tagChanged: Record<string, never>;
  channelTagChanged: Record<string, never>;

  translationCompleted: { readonly results: readonly TranslateResult[] };
  translationLanguageChanged: { readonly language: string };
  autoTranslateStateChanged: { readonly isEnabled: boolean };

  subscriptionChanged: { readonly events: readonly SubscriptionStatusInfo[] };
  subscriptionSyncCompleted: { readonly subscribeType: SubscribeType };
  subscriptionChangedOnOtherDevices: {
    readonly events: readonly SubscribeChange[];
  };
  friendAdded: {
    readonly userId: string;
    readonly name?: string;
    readonly avatarUrl?: string;
    readonly operationTime: number;
  };
  friendsRemoved: {
    readonly userIds: readonly string[];
    readonly operationTime: number;
  };
  friendApplicationStatusChanged: {
    readonly userId: string;
    readonly applicationType: FriendApplicationType;
    readonly applicationStatus: FriendApplicationStatus;
    readonly operationTime: number;
    readonly extra?: string;
  };
  friendsCleared: { readonly operationTime: number };
  friendInfoChangedSync: {
    readonly userId: string;
    readonly remark?: string;
    readonly extProfile?: StringMap;
    readonly operationTime: number;
  };

  userSettingsSyncCompleted: { readonly error?: NativeErrorInfo };

  /** A Nexconn notification was tapped (see `client.push.onNotificationOpened`). */
  notificationOpened: PushNotification;
  /**
   * A Nexconn notification arrived. Android: after the SDK posts it. iOS:
   * while in the foreground, through the bridge's notification handler.
   */
  notificationReceived: PushNotification;
  pushTokenReceived: PushToken;
  pushTokenError: {
    readonly pushType?: string;
    readonly code: number;
    readonly message?: string;
    readonly platform: 'android' | 'ios';
  };
  /** Android only: result of reporting the push token to Nexconn. */
  pushTokenReportResult: {
    readonly pushType?: string;
    readonly code: number;
    readonly finalPushType?: string;
  };

  /** A native event the bridge forwarded but this JS version does not model. */
  unknownNativeEvent: { readonly type: string; readonly payload: unknown };
}

export type NexconnEventName = keyof NexconnEventMap;
