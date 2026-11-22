/**
 * Enumerations shared by the Android and iOS Nexconn SDKs.
 *
 * The bridge transports native raw integer values. These values were read
 * from the pinned native artifacts (Android `ai.nexconn.chat:chat:26.4.2`
 * enum constructors and iOS `NexconnChatSDK 26.4.2` Swift raw values) and are
 * identical on both platforms unless noted. See docs/reference/parity.md.
 */

export const ChannelType = {
  direct: 1,
  group: 3,
  open: 4,
  system: 6,
  community: 10,
} as const;
export type ChannelType = (typeof ChannelType)[keyof typeof ChannelType];

/**
 * Connection status. `-1` is NETWORK_UNAVAILABLE on Android and `unknown` on
 * iOS; both mean the SDK cannot currently use the network connection.
 */
export const ConnectionStatus = {
  networkUnavailable: -1,
  connected: 0,
  connecting: 1,
  unconnected: 2,
  kickedOfflineByOtherClient: 3,
  tokenIncorrect: 4,
  connUserBlocked: 6,
  signedOut: 12,
  suspended: 13,
  timeout: 14,
  proxyUnavailable: 17,
  userAbandon: 19,
} as const;
export type ConnectionStatus =
  (typeof ConnectionStatus)[keyof typeof ConnectionStatus];

export const AreaCode = { bj: 1, sg: 2, na: 3, sa: 5, om: 6 } as const;
export type AreaCode = (typeof AreaCode)[keyof typeof AreaCode];

export const LogLevel = {
  none: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  verbose: 5,
} as const;
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export const ChannelNoDisturbLevel = {
  allMessage: -1,
  default: 0,
  mention: 1,
  mentionUsers: 2,
  mentionAll: 4,
  muted: 5,
} as const;
export type ChannelNoDisturbLevel =
  (typeof ChannelNoDisturbLevel)[keyof typeof ChannelNoDisturbLevel];

export const NoDisturbTimeLevel = { default: 0, mention: 1, muted: 5 } as const;
export type NoDisturbTimeLevel =
  (typeof NoDisturbTimeLevel)[keyof typeof NoDisturbTimeLevel];

export const TranslateStrategy = { default: 0, autoOn: 1, autoOff: 2 } as const;
export type TranslateStrategy =
  (typeof TranslateStrategy)[keyof typeof TranslateStrategy];

export const TranslateMode = { mechanical: 0, intelligent: 1 } as const;
export type TranslateMode = (typeof TranslateMode)[keyof typeof TranslateMode];

export const TranslateStatus = {
  none: 0,
  translating: 1,
  success: 2,
  failed: 3,
} as const;
export type TranslateStatus =
  (typeof TranslateStatus)[keyof typeof TranslateStatus];

export const TranslateSourceType = { message: 0, text: 1 } as const;
export type TranslateSourceType =
  (typeof TranslateSourceType)[keyof typeof TranslateSourceType];

export const MessageDirection = { send: 1, receive: 2 } as const;
export type MessageDirection =
  (typeof MessageDirection)[keyof typeof MessageDirection];

/** `0` (NONE) exists only on Android; `80` (invalid) exists only on iOS. */
export const SentStatus = {
  none: 0,
  sending: 10,
  failed: 20,
  sent: 30,
  received: 40,
  read: 50,
  destroyed: 60,
  canceled: 70,
  invalid: 80,
} as const;
export type SentStatus = (typeof SentStatus)[keyof typeof SentStatus];

export const MentionedType = { all: 1, users: 2 } as const;
export type MentionedType = (typeof MentionedType)[keyof typeof MentionedType];

export const MessageBlockType = {
  global: 1,
  custom: 2,
  thirdParty: 3,
} as const;
export type MessageBlockType =
  (typeof MessageBlockType)[keyof typeof MessageBlockType];

export const MessageOperationPolicy = { local: 0, localRemote: 1 } as const;
export type MessageOperationPolicy =
  (typeof MessageOperationPolicy)[keyof typeof MessageOperationPolicy];

export const MessageReadReceiptStatus = {
  responded: 0,
  unresponded: 1,
} as const;
export type MessageReadReceiptStatus =
  (typeof MessageReadReceiptStatus)[keyof typeof MessageReadReceiptStatus];

export const MessageUpdateStatus = {
  success: 0,
  updating: 1,
  failed: 2,
} as const;
export type MessageUpdateStatus =
  (typeof MessageUpdateStatus)[keyof typeof MessageUpdateStatus];

export const ReferenceMessageStatus = {
  default: 0,
  modified: 1,
  recalled: 2,
  deleted: 3,
} as const;
export type ReferenceMessageStatus =
  (typeof ReferenceMessageStatus)[keyof typeof ReferenceMessageStatus];

export const SpeechToTextStatus = {
  notConverted: 0,
  converting: 1,
  success: 2,
  failed: 3,
} as const;
export type SpeechToTextStatus =
  (typeof SpeechToTextStatus)[keyof typeof SpeechToTextStatus];

/** Message persistence flags used when registering custom message types. */
export const MessagePersistent = {
  none: 0,
  persisted: 1,
  counted: 3,
  status: 16,
} as const;
export type MessagePersistent =
  (typeof MessagePersistent)[keyof typeof MessagePersistent];

export const GroupJoinPermission = {
  ownerVerify: 0,
  free: 1,
  ownerOrAdminVerify: 2,
  noOneAllowed: 3,
} as const;
export type GroupJoinPermission =
  (typeof GroupJoinPermission)[keyof typeof GroupJoinPermission];

export const GroupOperationPermission = {
  owner: 0,
  ownerOrAdmin: 1,
  everyone: 2,
} as const;
export type GroupOperationPermission =
  (typeof GroupOperationPermission)[keyof typeof GroupOperationPermission];

export const GroupInviteHandlePermission = {
  free: 0,
  inviteeVerify: 1,
} as const;
export type GroupInviteHandlePermission =
  (typeof GroupInviteHandlePermission)[keyof typeof GroupInviteHandlePermission];

export const GroupMemberInfoEditPermission = {
  ownerOrAdminOrSelf: 0,
  ownerOrSelf: 1,
  self: 2,
} as const;
export type GroupMemberInfoEditPermission =
  (typeof GroupMemberInfoEditPermission)[keyof typeof GroupMemberInfoEditPermission];

/** `0` (UNDEF) exists only on Android. */
export const GroupMemberRole = {
  undefined: 0,
  normal: 1,
  admin: 2,
  owner: 3,
} as const;
export type GroupMemberRole =
  (typeof GroupMemberRole)[keyof typeof GroupMemberRole];

export const GroupOperation = {
  create: 0,
  join: 1,
  kick: 2,
  quit: 3,
  dismiss: 4,
  addAdmin: 5,
  removeAdmin: 6,
  transferOwner: 7,
} as const;
export type GroupOperation =
  (typeof GroupOperation)[keyof typeof GroupOperation];

export const GroupOperationType = { add: 1, remove: 2 } as const;
export type GroupOperationType =
  (typeof GroupOperationType)[keyof typeof GroupOperationType];

export const GroupApplicationStatus = {
  adminUnhandled: 0,
  adminRefused: 1,
  inviteeUnhandled: 2,
  inviteeRefused: 3,
  joined: 4,
  expired: 5,
} as const;
export type GroupApplicationStatus =
  (typeof GroupApplicationStatus)[keyof typeof GroupApplicationStatus];

export const GroupApplicationDirection = {
  applicationSent: 0,
  invitationSent: 1,
  invitationReceived: 2,
  applicationReceived: 3,
} as const;
export type GroupApplicationDirection =
  (typeof GroupApplicationDirection)[keyof typeof GroupApplicationDirection];

export const GroupApplicationType = { application: 0, invitation: 1 } as const;
export type GroupApplicationType =
  (typeof GroupApplicationType)[keyof typeof GroupApplicationType];

export const GroupMemberFilterRobotType = {
  all: 0,
  excludeRobot: 1,
  robotOnly: 2,
} as const;
export type GroupMemberFilterRobotType =
  (typeof GroupMemberFilterRobotType)[keyof typeof GroupMemberFilterRobotType];

export const OpenChannelDestroyType = { manual: 0, auto: 3 } as const;
export type OpenChannelDestroyType =
  (typeof OpenChannelDestroyType)[keyof typeof OpenChannelDestroyType];

export const OpenChannelExitReason = {
  exitVoluntarily: 1,
  kickedOutByOtherDevice: 2,
} as const;
export type OpenChannelExitReason =
  (typeof OpenChannelExitReason)[keyof typeof OpenChannelExitReason];

export const OpenChannelSyncStatus = { exit: 0, enter: 1 } as const;
export type OpenChannelSyncStatus =
  (typeof OpenChannelSyncStatus)[keyof typeof OpenChannelSyncStatus];

export const OpenChannelParticipantActionType = { exit: 0, enter: 1 } as const;
export type OpenChannelParticipantActionType =
  (typeof OpenChannelParticipantActionType)[keyof typeof OpenChannelParticipantActionType];

/** Android has no raw value; the Android bridge maps BAN/UNBAN to these. */
export const OpenChannelParticipantBanType = { unban: 0, ban: 1 } as const;
export type OpenChannelParticipantBanType =
  (typeof OpenChannelParticipantBanType)[keyof typeof OpenChannelParticipantBanType];

export const OpenChannelParticipantMuteType = {
  unmuteUsers: 0,
  muteUsers: 1,
  unmuteAll: 2,
  muteAll: 3,
  removeAllowlist: 4,
  addAllowlist: 5,
  unmuteGlobal: 6,
  muteGlobal: 7,
} as const;
export type OpenChannelParticipantMuteType =
  (typeof OpenChannelParticipantMuteType)[keyof typeof OpenChannelParticipantMuteType];

export const OpenChannelMetadataOperationType = {
  update: 0,
  remove: 1,
} as const;
export type OpenChannelMetadataOperationType =
  (typeof OpenChannelMetadataOperationType)[keyof typeof OpenChannelMetadataOperationType];

export const CommunitySubChannelType = { public: 0, private: 1 } as const;
export type CommunitySubChannelType =
  (typeof CommunitySubChannelType)[keyof typeof CommunitySubChannelType];

export const CommunitySubChannelChangeType = {
  publicToPrivate: 2,
  privateToPublic: 3,
  publicToPrivateUserNotIn: 6,
} as const;
export type CommunitySubChannelChangeType =
  (typeof CommunitySubChannelChangeType)[keyof typeof CommunitySubChannelChangeType];

export const UserProfileVisibility = {
  notSet: 0,
  invisible: 1,
  everyone: 2,
  friendVisible: 3,
} as const;
export type UserProfileVisibility =
  (typeof UserProfileVisibility)[keyof typeof UserProfileVisibility];

export const SubscribeType = {
  onlineStatus: 1,
  userProfile: 2,
  friendOnlineStatus: 3,
  friendUserProfile: 4,
} as const;
export type SubscribeType = (typeof SubscribeType)[keyof typeof SubscribeType];

export const SubscribeOperationType = { subscribe: 0, unsubscribe: 1 } as const;
export type SubscribeOperationType =
  (typeof SubscribeOperationType)[keyof typeof SubscribeOperationType];

export const FriendAddPermission = {
  free: 1,
  needVerify: 2,
  noOneAllowed: 3,
} as const;
export type FriendAddPermission =
  (typeof FriendAddPermission)[keyof typeof FriendAddPermission];

export const FriendRelationType = {
  none: 0,
  inMyFriendList: 1,
  inOtherFriendList: 2,
  bothWay: 3,
} as const;
export type FriendRelationType =
  (typeof FriendRelationType)[keyof typeof FriendRelationType];

export const FriendApplicationType = { sent: 1, received: 2 } as const;
export type FriendApplicationType =
  (typeof FriendApplicationType)[keyof typeof FriendApplicationType];

export const FriendApplicationStatus = {
  unhandled: 0,
  accepted: 1,
  refused: 2,
  expired: 3,
} as const;
export type FriendApplicationStatus =
  (typeof FriendApplicationStatus)[keyof typeof FriendApplicationStatus];

export const Platform = {
  other: 0,
  ios: 1,
  android: 2,
  web: 3,
  pc: 4,
  miniProgram: 5,
  harmonyOS: 6,
} as const;
export type Platform = (typeof Platform)[keyof typeof Platform];

export const UserType = { normal: 0, robot: 1 } as const;
export type UserType = (typeof UserType)[keyof typeof UserType];

/** Reverse lookup for logging and UI labels. Returns undefined for unknown values. */
export function enumName<T extends Record<string, number>>(
  table: T,
  value: number
): keyof T | undefined {
  for (const key of Object.keys(table) as Array<keyof T>) {
    if (table[key] === value) return key;
  }
  return undefined;
}

/** Throws if `value` is not one of the values in `table`. */
export function assertEnum<T extends Record<string, number>>(
  table: T,
  value: unknown,
  label: string
): T[keyof T] {
  if (typeof value === 'number' && Object.values(table).includes(value)) {
    return value as T[keyof T];
  }
  throw new TypeError(`Invalid ${label}: ${String(value)}`);
}
