import Foundation
import NexconnChatSDK

/// Forwards every SDK handler callback to JavaScript as
/// `{type: "<Handler>.<method>", payload: <serialized event>}`.
/// Event type names are shared with Android (see src/core/normalize.ts).
final class NexconnEventForwarder: NSObject,
  ConnectionStatusHandler,
  DatabaseStatusHandler,
  MessageHandler,
  ChannelHandler,
  GroupChannelHandler,
  OpenChannelHandler,
  TagHandler,
  TranslateHandler,
  UserHandler,
  UserSettingsHandler
{
  private let emit: (String, Any?) -> Void

  init(emit: @escaping (String, Any?) -> Void) {
    self.emit = emit
    super.init()
  }

  // MARK: ConnectionStatusHandler
  func onConnectionStatusChanged(_ event: ConnectionStatusChangedEvent) {
    // `status` is a plain NS_ENUM; forward its raw value explicitly.
    emit("ConnectionStatusHandler.onConnectionStatusChanged", ["__type": "ConnectionStatusChangedEvent", "status": event.status.rawValue])
  }

  // MARK: DatabaseStatusHandler
  func onUpgradeWillStart(_ event: DatabaseUpgradeWillStartEvent) { emit("DatabaseStatusHandler.onUpgradeWillStart", event) }
  func onUpgrading(_ event: DatabaseUpgradingEvent) { emit("DatabaseStatusHandler.onUpgrading", event) }
  func onUpgradeCompleted(_ event: DatabaseUpgradeCompletedEvent) { emit("DatabaseStatusHandler.onUpgradeCompleted", event) }

  // MARK: MessageHandler
  func onMessageReceived(_ event: MessageReceivedEvent) { emit("MessageHandler.onMessageReceived", event) }
  func onMessageDeleted(_ event: MessageDeletedEvent) { emit("MessageHandler.onMessageDeleted", event) }
  func onExpireMessageDeleted(_ event: ExpireMessageDeletedEvent) { emit("MessageHandler.onExpireMessageDeleted", event) }
  func onOfflineMessageSyncCompleted(_ event: OfflineMessageSyncCompletedEvent) {
    emit("MessageHandler.onOfflineMessageSyncCompleted", event)
  }
  func onMessageReceiptResponse(_ event: MessageReceiptResponseEvent) { emit("MessageHandler.onMessageReceiptResponse", event) }
  func onMessagesUpdated(_ event: MessagesUpdatedEvent) { emit("MessageHandler.onMessagesUpdated", event) }
  func onUpdatedMessageSyncCompleted(_ event: UpdatedMessageSyncCompletedEvent) {
    emit("MessageHandler.onUpdatedMessageSyncCompleted", event)
  }
  func onSpeechToTextCompleted(_ event: SpeechToTextCompletedEvent) { emit("MessageHandler.onSpeechToTextCompleted", event) }
  func onStreamMessageRequestInit(_ event: StreamMessageRequestInitEvent) {
    emit("MessageHandler.onStreamMessageRequestInit", event)
  }
  func onStreamMessageRequestDelta(_ event: StreamMessageDeltaEvent) { emit("MessageHandler.onStreamMessageRequestDelta", event) }
  func onStreamMessageRequestComplete(_ event: StreamMessageRequestCompleteEvent) {
    emit("MessageHandler.onStreamMessageRequestComplete", event)
  }
  func onMessageBlocked(_ event: MessageBlockedEvent) { emit("MessageHandler.onMessageBlocked", event) }
  func onMessageMetadataUpdated(_ event: MessageMetadataUpdatedEvent) { emit("MessageHandler.onMessageMetadataUpdated", event) }
  func onMessageMetadataDeleted(_ event: MessageMetadataDeletedEvent) { emit("MessageHandler.onMessageMetadataDeleted", event) }
  func onCommunityChannelMessageMetadataChanged(_ event: CommunityChannelMessageMetadataChangedEvent) {
    emit("MessageHandler.onCommunityChannelMessageMetadataChanged", event)
  }

  // MARK: ChannelHandler
  func onCommunityChannelsSyncCompleted(_ event: CommunityChannelsSyncCompletedEvent) {
    emit("ChannelHandler.onCommunityChannelsSyncCompleted", event)
  }
  func onRemoteChannelsSyncCompleted(_ event: RemoteChannelsSyncCompletedEvent) {
    emit("ChannelHandler.onRemoteChannelsSyncCompleted", event)
  }
  func onChannelStatusSyncCompleted(_ event: ChannelStatusSyncCompletedEvent) {
    emit("ChannelHandler.onChannelStatusSyncCompleted", event)
  }
  func onChannelPinnedSync(_ event: ChannelPinnedSyncEvent) { emit("ChannelHandler.onChannelPinnedSync", event) }
  func onChannelNoDisturbLevelSync(_ event: ChannelNoDisturbLevelSyncEvent) {
    emit("ChannelHandler.onChannelNoDisturbLevelSync", event)
  }
  func onChannelTranslateStrategySync(_ event: ChannelTranslateStrategySyncEvent) {
    emit("ChannelHandler.onChannelTranslateStrategySync", event)
  }
  func onChannelUnreadStatusSync(_ event: ChannelUnreadStatusSyncEvent) { emit("ChannelHandler.onChannelUnreadStatusSync", event) }
  func onTypingStatusChanged(_ event: TypingStatusChangedEvent) { emit("ChannelHandler.onTypingStatusChanged", event) }
  func onCommunitySubChannelTypeChanged(_ event: CommunitySubChannelTypeChangedEvent) {
    emit("ChannelHandler.onCommunitySubChannelTypeChanged", event)
  }
  func onCommunitySubChannelUserKicked(_ event: CommunitySubChannelUserKickedEvent) {
    emit("ChannelHandler.onCommunitySubChannelUserKicked", event)
  }
  func onCommunitySubChannelDeleted(_ event: CommunitySubChannelDeletedEvent) {
    emit("ChannelHandler.onCommunitySubChannelDeleted", event)
  }

  // MARK: GroupChannelHandler
  func onGroupOperation(_ event: GroupOperationEvent) { emit("GroupChannelHandler.onGroupOperation", event) }
  func onGroupInfoChanged(_ event: GroupInfoChangedEvent) { emit("GroupChannelHandler.onGroupInfoChanged", event) }
  func onGroupMemberInfoChanged(_ event: GroupMemberInfoChangedEvent) { emit("GroupChannelHandler.onGroupMemberInfoChanged", event) }
  func onGroupApplicationEvent(_ event: GroupApplicationEvent) { emit("GroupChannelHandler.onGroupApplicationEvent", event) }
  func onGroupFavoritesChangedSync(_ event: GroupFavoritesChangedSyncEvent) {
    emit("GroupChannelHandler.onGroupFavoritesChangedSync", event)
  }

  // MARK: OpenChannelHandler
  func onEntering(_ event: OpenChannelEnteringEvent) { emit("OpenChannelHandler.onEntering", event) }
  func onEntered(_ event: OpenChannelEnteredEvent) { emit("OpenChannelHandler.onEntered", event) }
  func onEnterFailed(_ event: OpenChannelEnterFailedEvent) { emit("OpenChannelHandler.onEnterFailed", event) }
  func onReset(_ event: OpenChannelResetEvent) { emit("OpenChannelHandler.onReset", event) }
  func onExited(_ event: OpenChannelExitedEvent) { emit("OpenChannelHandler.onExited", event) }
  func onChannelDestroyed(_ event: OpenChannelDestroyedEvent) { emit("OpenChannelHandler.onChannelDestroyed", event) }
  func onMetadataSynced(_ event: OpenChannelMetadataSyncedEvent) { emit("OpenChannelHandler.onMetadataSynced", event) }
  func onMetadataChanged(_ event: OpenChannelMetadataChangedEvent) { emit("OpenChannelHandler.onMetadataChanged", event) }
  func onParticipantChanged(_ event: OpenChannelParticipantChangedEvent) { emit("OpenChannelHandler.onParticipantChanged", event) }
  func onNotifyMultiLoginSync(_ event: OpenChannelNotifyMultiLoginSyncEvent) {
    emit("OpenChannelHandler.onNotifyMultiLoginSync", event)
  }
  func onParticipantMuted(_ event: OpenChannelParticipantMutedEvent) { emit("OpenChannelHandler.onParticipantMuted", event) }
  func onParticipantBanned(_ event: OpenChannelParticipantBannedEvent) { emit("OpenChannelHandler.onParticipantBanned", event) }

  // MARK: TagHandler
  func onTagChanged(_ event: TagChangedEvent) { emit("TagHandler.onTagChanged", event) }
  func onChannelTagChanged(_ event: ChannelTagChangedEvent) { emit("TagHandler.onChannelTagChanged", event) }

  // MARK: TranslateHandler
  func onTranslationLanguageChanged(_ event: TranslationLanguageChangedEvent) {
    emit("TranslateHandler.onTranslationLanguageChanged", event)
  }
  func onAutoTranslateStateChanged(_ event: AutoTranslateStateChangedEvent) {
    emit("TranslateHandler.onAutoTranslateStateChanged", event)
  }
  func onTranslationCompleted(_ event: TranslationCompletedEvent) { emit("TranslateHandler.onTranslationCompleted", event) }

  // MARK: UserHandler
  func onSubscriptionChanged(_ event: SubscriptionChangedEvent) { emit("UserHandler.onSubscriptionChanged", event) }
  func onSubscriptionSyncCompleted(_ event: SubscriptionSyncCompletedEvent) { emit("UserHandler.onSubscriptionSyncCompleted", event) }
  func onSubscriptionChangedOnOtherDevices(_ event: SubscriptionChangedOnOtherDevicesEvent) {
    emit("UserHandler.onSubscriptionChangedOnOtherDevices", event)
  }
  func onFriendAdd(_ event: FriendAddEvent) { emit("UserHandler.onFriendAdd", event) }
  func onFriendRemove(_ event: FriendRemoveEvent) { emit("UserHandler.onFriendRemove", event) }
  func onFriendApplicationStatusChanged(_ event: FriendApplicationStatusChangedEvent) {
    emit("UserHandler.onFriendApplicationStatusChanged", event)
  }
  func onFriendCleared(_ event: FriendClearedEvent) { emit("UserHandler.onFriendCleared", event) }
  func onFriendInfoChangedSync(_ event: FriendInfoChangedSyncEvent) { emit("UserHandler.onFriendInfoChangedSync", event) }

  // MARK: UserSettingsHandler
  func onUserSettingsSyncCompleted(_ event: UserSettingsSyncCompletedEvent) {
    emit("UserSettingsHandler.onUserSettingsSyncCompleted", event)
  }
}
