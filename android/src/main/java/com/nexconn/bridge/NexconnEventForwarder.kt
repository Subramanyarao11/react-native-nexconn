package com.nexconn.bridge

import ai.nexconn.chat.channel.model.ChannelNoDisturbLevelSyncEvent
import ai.nexconn.chat.channel.model.ChannelPinnedSyncEvent
import ai.nexconn.chat.channel.model.ChannelStatusSyncCompletedEvent
import ai.nexconn.chat.channel.model.ChannelTranslateStrategySyncEvent
import ai.nexconn.chat.channel.model.ChannelUnreadStatusSyncEvent
import ai.nexconn.chat.channel.model.CommunityChannelsSyncCompletedEvent
import ai.nexconn.chat.channel.model.CommunitySubChannelDeletedEvent
import ai.nexconn.chat.channel.model.CommunitySubChannelTypeChangedEvent
import ai.nexconn.chat.channel.model.CommunitySubChannelUserKickedEvent
import ai.nexconn.chat.channel.model.GroupApplicationEvent
import ai.nexconn.chat.channel.model.GroupFavoritesChangedSyncEvent
import ai.nexconn.chat.channel.model.GroupInfoChangedEvent
import ai.nexconn.chat.channel.model.GroupMemberInfoChangedEvent
import ai.nexconn.chat.channel.model.GroupOperationEvent
import ai.nexconn.chat.channel.model.OpenChannelDestroyedEvent
import ai.nexconn.chat.channel.model.OpenChannelEnterFailedEvent
import ai.nexconn.chat.channel.model.OpenChannelEnteredEvent
import ai.nexconn.chat.channel.model.OpenChannelEnteringEvent
import ai.nexconn.chat.channel.model.OpenChannelExitedEvent
import ai.nexconn.chat.channel.model.OpenChannelMetadataChangedEvent
import ai.nexconn.chat.channel.model.OpenChannelMetadataSyncedEvent
import ai.nexconn.chat.channel.model.OpenChannelNotifyMultiLoginSyncEvent
import ai.nexconn.chat.channel.model.OpenChannelParticipantBannedEvent
import ai.nexconn.chat.channel.model.OpenChannelParticipantChangedEvent
import ai.nexconn.chat.channel.model.OpenChannelParticipantMutedEvent
import ai.nexconn.chat.channel.model.OpenChannelResetEvent
import ai.nexconn.chat.channel.model.RemoteChannelsSyncCompletedEvent
import ai.nexconn.chat.channel.model.TypingStatusChangedEvent
import ai.nexconn.chat.handler.ChannelHandler
import ai.nexconn.chat.handler.ConnectionStatusHandler
import ai.nexconn.chat.handler.DatabaseStatusHandler
import ai.nexconn.chat.handler.GroupChannelHandler
import ai.nexconn.chat.handler.MessageHandler
import ai.nexconn.chat.handler.OpenChannelHandler
import ai.nexconn.chat.handler.TagHandler
import ai.nexconn.chat.handler.TranslateHandler
import ai.nexconn.chat.handler.UserHandler
import ai.nexconn.chat.handler.UserSettingsHandler
import ai.nexconn.chat.message.model.CommunityChannelMessageMetadataChangedEvent
import ai.nexconn.chat.message.model.ExpireMessageDeletedEvent
import ai.nexconn.chat.message.model.MessageBlockedEvent
import ai.nexconn.chat.message.model.MessageDeletedEvent
import ai.nexconn.chat.message.model.MessageMetadataDeletedEvent
import ai.nexconn.chat.message.model.MessageMetadataUpdatedEvent
import ai.nexconn.chat.message.model.MessageReceiptResponseEvent
import ai.nexconn.chat.message.model.MessageReceivedEvent
import ai.nexconn.chat.message.model.MessagesUpdatedEvent
import ai.nexconn.chat.message.model.OfflineMessageSyncCompletedEvent
import ai.nexconn.chat.message.model.SpeechToTextCompletedEvent
import ai.nexconn.chat.message.model.StreamMessageDeltaEvent
import ai.nexconn.chat.message.model.StreamMessageRequestCompleteEvent
import ai.nexconn.chat.message.model.StreamMessageRequestInitEvent
import ai.nexconn.chat.message.model.UpdatedMessageSyncCompletedEvent
import ai.nexconn.chat.model.ConnectionStatusChangedEvent
import ai.nexconn.chat.model.DatabaseUpgradeCompletedEvent
import ai.nexconn.chat.model.DatabaseUpgradeWillStartEvent
import ai.nexconn.chat.model.DatabaseUpgradingEvent
import ai.nexconn.chat.model.UserSettingsSyncCompletedEvent
import ai.nexconn.chat.tag.model.ChannelTagChangedEvent
import ai.nexconn.chat.tag.model.TagChangedEvent
import ai.nexconn.chat.translate.model.AutoTranslateStateChangedEvent
import ai.nexconn.chat.translate.model.TranslationCompletedEvent
import ai.nexconn.chat.translate.model.TranslationLanguageChangedEvent
import ai.nexconn.chat.user.model.FriendAddEvent
import ai.nexconn.chat.user.model.FriendApplicationStatusChangedEvent
import ai.nexconn.chat.user.model.FriendClearedEvent
import ai.nexconn.chat.user.model.FriendInfoChangedSyncEvent
import ai.nexconn.chat.user.model.FriendRemoveEvent
import ai.nexconn.chat.user.model.SubscriptionChangedEvent
import ai.nexconn.chat.user.model.SubscriptionChangedOnOtherDevicesEvent
import ai.nexconn.chat.user.model.SubscriptionSyncCompletedEvent

/**
 * Forwards every SDK handler callback to JavaScript as
 * `{type: "<Handler>.<method>", payload: <serialized event>}`.
 * The event type names are shared with iOS (see src/core/normalize.ts).
 */
internal class NexconnEventForwarder(private val emit: (String, Any?) -> Unit) :
  ConnectionStatusHandler,
  DatabaseStatusHandler,
  MessageHandler,
  ChannelHandler,
  GroupChannelHandler,
  OpenChannelHandler,
  TagHandler,
  TranslateHandler,
  UserHandler,
  UserSettingsHandler {

  // ConnectionStatusHandler
  override fun onConnectionStatusChanged(event: ConnectionStatusChangedEvent) =
    emit("ConnectionStatusHandler.onConnectionStatusChanged", event)

  // DatabaseStatusHandler
  override fun onUpgradeWillStart(event: DatabaseUpgradeWillStartEvent) =
    emit("DatabaseStatusHandler.onUpgradeWillStart", event)

  override fun onUpgrading(event: DatabaseUpgradingEvent) =
    emit("DatabaseStatusHandler.onUpgrading", event)

  override fun onUpgradeCompleted(event: DatabaseUpgradeCompletedEvent) =
    emit("DatabaseStatusHandler.onUpgradeCompleted", event)

  // MessageHandler
  override fun onMessageReceived(event: MessageReceivedEvent) =
    emit("MessageHandler.onMessageReceived", event)

  override fun onOfflineMessageSyncCompleted(event: OfflineMessageSyncCompletedEvent) =
    emit("MessageHandler.onOfflineMessageSyncCompleted", event)

  override fun onMessageDeleted(event: MessageDeletedEvent) =
    emit("MessageHandler.onMessageDeleted", event)

  override fun onExpireMessageDeleted(event: ExpireMessageDeletedEvent) =
    emit("MessageHandler.onExpireMessageDeleted", event)

  override fun onSpeechToTextCompleted(event: SpeechToTextCompletedEvent) =
    emit("MessageHandler.onSpeechToTextCompleted", event)

  override fun onMessagesUpdated(event: MessagesUpdatedEvent) =
    emit("MessageHandler.onMessagesUpdated", event)

  override fun onMessageMetadataUpdated(event: MessageMetadataUpdatedEvent) =
    emit("MessageHandler.onMessageMetadataUpdated", event)

  override fun onMessageMetadataDeleted(event: MessageMetadataDeletedEvent) =
    emit("MessageHandler.onMessageMetadataDeleted", event)

  override fun onCommunityChannelMessageMetadataChanged(
    event: CommunityChannelMessageMetadataChangedEvent,
  ) = emit("MessageHandler.onCommunityChannelMessageMetadataChanged", event)

  override fun onMessageReceiptResponse(event: MessageReceiptResponseEvent) =
    emit("MessageHandler.onMessageReceiptResponse", event)

  override fun onMessageBlocked(event: MessageBlockedEvent) =
    emit("MessageHandler.onMessageBlocked", event)

  override fun onStreamMessageRequestInit(event: StreamMessageRequestInitEvent) =
    emit("MessageHandler.onStreamMessageRequestInit", event)

  override fun onStreamMessageRequestDelta(event: StreamMessageDeltaEvent) =
    emit("MessageHandler.onStreamMessageRequestDelta", event)

  override fun onStreamMessageRequestComplete(event: StreamMessageRequestCompleteEvent) =
    emit("MessageHandler.onStreamMessageRequestComplete", event)

  override fun onUpdatedMessageSyncCompleted(event: UpdatedMessageSyncCompletedEvent) =
    emit("MessageHandler.onUpdatedMessageSyncCompleted", event)

  // ChannelHandler
  override fun onChannelPinnedSync(event: ChannelPinnedSyncEvent) =
    emit("ChannelHandler.onChannelPinnedSync", event)

  override fun onChannelNoDisturbLevelSync(event: ChannelNoDisturbLevelSyncEvent) =
    emit("ChannelHandler.onChannelNoDisturbLevelSync", event)

  override fun onChannelStatusSyncCompleted(event: ChannelStatusSyncCompletedEvent) =
    emit("ChannelHandler.onChannelStatusSyncCompleted", event)

  override fun onChannelTranslateStrategySync(event: ChannelTranslateStrategySyncEvent) =
    emit("ChannelHandler.onChannelTranslateStrategySync", event)

  override fun onChannelUnreadStatusSync(event: ChannelUnreadStatusSyncEvent) =
    emit("ChannelHandler.onChannelUnreadStatusSync", event)

  override fun onRemoteChannelsSyncCompleted(event: RemoteChannelsSyncCompletedEvent) =
    emit("ChannelHandler.onRemoteChannelsSyncCompleted", event)

  override fun onTypingStatusChanged(event: TypingStatusChangedEvent) =
    emit("ChannelHandler.onTypingStatusChanged", event)

  override fun onCommunitySubChannelTypeChanged(event: CommunitySubChannelTypeChangedEvent) =
    emit("ChannelHandler.onCommunitySubChannelTypeChanged", event)

  override fun onCommunitySubChannelDeleted(event: CommunitySubChannelDeletedEvent) =
    emit("ChannelHandler.onCommunitySubChannelDeleted", event)

  override fun onCommunitySubChannelUserKicked(event: CommunitySubChannelUserKickedEvent) =
    emit("ChannelHandler.onCommunitySubChannelUserKicked", event)

  override fun onCommunityChannelsSyncCompleted(event: CommunityChannelsSyncCompletedEvent) =
    emit("ChannelHandler.onCommunityChannelsSyncCompleted", event)

  // GroupChannelHandler
  override fun onGroupOperation(event: GroupOperationEvent) =
    emit("GroupChannelHandler.onGroupOperation", event)

  override fun onGroupInfoChanged(event: GroupInfoChangedEvent) =
    emit("GroupChannelHandler.onGroupInfoChanged", event)

  override fun onGroupMemberInfoChanged(event: GroupMemberInfoChangedEvent) =
    emit("GroupChannelHandler.onGroupMemberInfoChanged", event)

  override fun onGroupApplicationEvent(event: GroupApplicationEvent) =
    emit("GroupChannelHandler.onGroupApplicationEvent", event)

  override fun onGroupFavoritesChangedSync(event: GroupFavoritesChangedSyncEvent) =
    emit("GroupChannelHandler.onGroupFavoritesChangedSync", event)

  // OpenChannelHandler
  override fun onEntering(event: OpenChannelEnteringEvent) =
    emit("OpenChannelHandler.onEntering", event)

  override fun onEntered(event: OpenChannelEnteredEvent) =
    emit("OpenChannelHandler.onEntered", event)

  override fun onEnterFailed(event: OpenChannelEnterFailedEvent) =
    emit("OpenChannelHandler.onEnterFailed", event)

  override fun onExited(event: OpenChannelExitedEvent) =
    emit("OpenChannelHandler.onExited", event)

  override fun onReset(event: OpenChannelResetEvent) =
    emit("OpenChannelHandler.onReset", event)

  override fun onChannelDestroyed(event: OpenChannelDestroyedEvent) =
    emit("OpenChannelHandler.onChannelDestroyed", event)

  override fun onNotifyMultiLoginSync(event: OpenChannelNotifyMultiLoginSyncEvent) =
    emit("OpenChannelHandler.onNotifyMultiLoginSync", event)

  override fun onParticipantBanned(event: OpenChannelParticipantBannedEvent) =
    emit("OpenChannelHandler.onParticipantBanned", event)

  override fun onParticipantMuted(event: OpenChannelParticipantMutedEvent) =
    emit("OpenChannelHandler.onParticipantMuted", event)

  override fun onMetadataSynced(event: OpenChannelMetadataSyncedEvent) =
    emit("OpenChannelHandler.onMetadataSynced", event)

  override fun onMetadataChanged(event: OpenChannelMetadataChangedEvent) =
    emit("OpenChannelHandler.onMetadataChanged", event)

  override fun onParticipantChanged(event: OpenChannelParticipantChangedEvent) =
    emit("OpenChannelHandler.onParticipantChanged", event)

  // TagHandler
  override fun onTagChanged(event: TagChangedEvent) = emit("TagHandler.onTagChanged", event)

  override fun onChannelTagChanged(event: ChannelTagChangedEvent) =
    emit("TagHandler.onChannelTagChanged", event)

  // TranslateHandler
  override fun onTranslationCompleted(event: TranslationCompletedEvent) =
    emit("TranslateHandler.onTranslationCompleted", event)

  override fun onTranslationLanguageChanged(event: TranslationLanguageChangedEvent) =
    emit("TranslateHandler.onTranslationLanguageChanged", event)

  override fun onAutoTranslateStateChanged(event: AutoTranslateStateChangedEvent) =
    emit("TranslateHandler.onAutoTranslateStateChanged", event)

  // UserHandler
  override fun onSubscriptionChanged(event: SubscriptionChangedEvent) =
    emit("UserHandler.onSubscriptionChanged", event)

  override fun onSubscriptionSyncCompleted(event: SubscriptionSyncCompletedEvent) =
    emit("UserHandler.onSubscriptionSyncCompleted", event)

  override fun onSubscriptionChangedOnOtherDevices(event: SubscriptionChangedOnOtherDevicesEvent) =
    emit("UserHandler.onSubscriptionChangedOnOtherDevices", event)

  override fun onFriendAdd(event: FriendAddEvent) = emit("UserHandler.onFriendAdd", event)

  override fun onFriendRemove(event: FriendRemoveEvent) = emit("UserHandler.onFriendRemove", event)

  override fun onFriendApplicationStatusChanged(event: FriendApplicationStatusChangedEvent) =
    emit("UserHandler.onFriendApplicationStatusChanged", event)

  override fun onFriendCleared(event: FriendClearedEvent) = emit("UserHandler.onFriendCleared", event)

  override fun onFriendInfoChangedSync(event: FriendInfoChangedSyncEvent) =
    emit("UserHandler.onFriendInfoChangedSync", event)

  // UserSettingsHandler
  override fun onUserSettingsSyncCompleted(event: UserSettingsSyncCompletedEvent) =
    emit("UserSettingsHandler.onUserSettingsSyncCompleted", event)
}
