package com.nexconn.bridge

import ai.nexconn.chat.NCCallbackExecutors
import ai.nexconn.chat.NCEngine
import ai.nexconn.chat.channel.BaseChannel
import ai.nexconn.chat.channel.ChannelType
import ai.nexconn.chat.channel.CommunityChannel
import ai.nexconn.chat.channel.CommunitySubChannel
import ai.nexconn.chat.channel.DirectChannel
import ai.nexconn.chat.channel.GroupChannel
import ai.nexconn.chat.channel.OpenChannel
import ai.nexconn.chat.channel.SystemChannel
import ai.nexconn.chat.channel.model.BatchRemoteMessagesResult
import ai.nexconn.chat.channel.model.ChannelIdentifier
import ai.nexconn.chat.channel.model.ChannelNoDisturbLevel
import ai.nexconn.chat.channel.model.CommunitySubChannelIdentifier
import ai.nexconn.chat.channel.model.CommunityUnreadInfo
import ai.nexconn.chat.channel.model.EditedMessageDraft
import ai.nexconn.chat.channel.model.GroupApplicationDirection
import ai.nexconn.chat.channel.model.GroupApplicationStatus
import ai.nexconn.chat.channel.model.GroupFollowDetail
import ai.nexconn.chat.channel.model.GroupInfo
import ai.nexconn.chat.channel.model.GroupInviteHandlePermission
import ai.nexconn.chat.channel.model.GroupJoinPermission
import ai.nexconn.chat.channel.model.GroupMemberFilterRobotType
import ai.nexconn.chat.channel.model.GroupMemberInfo
import ai.nexconn.chat.channel.model.GroupMemberInfoEditPermission
import ai.nexconn.chat.channel.model.GroupMemberRole
import ai.nexconn.chat.channel.model.GroupOperationPermission
import ai.nexconn.chat.channel.model.LeaveGroupConfig
import ai.nexconn.chat.channel.model.MessageOperationPolicy
import ai.nexconn.chat.channel.model.SearchChannelResult
import ai.nexconn.chat.channel.model.TranslateStrategy
import ai.nexconn.chat.error.NCError
import ai.nexconn.chat.handler.ConnectHandler
import ai.nexconn.chat.handler.CreateGroupHandler
import ai.nexconn.chat.handler.DownloadMediaMessageHandler
import ai.nexconn.chat.handler.ErrorDetailHandler
import ai.nexconn.chat.handler.ErrorHandler
import ai.nexconn.chat.handler.OperationHandler
import ai.nexconn.chat.handler.RefreshReferenceMessageHandler
import ai.nexconn.chat.handler.SendMediaMessageHandler
import ai.nexconn.chat.handler.SendMessageHandler
import ai.nexconn.chat.internal.query.PageableQuery
import ai.nexconn.chat.message.CombineMessage
import ai.nexconn.chat.message.FileMessage
import ai.nexconn.chat.message.GIFMessage
import ai.nexconn.chat.message.HDVoiceMessage
import ai.nexconn.chat.message.ImageMessage
import ai.nexconn.chat.message.LocationMessage
import ai.nexconn.chat.message.MediaMessageContent
import ai.nexconn.chat.message.Message
import ai.nexconn.chat.message.MessageContent
import ai.nexconn.chat.message.ReferenceMessage
import ai.nexconn.chat.message.ShortVideoMessage
import ai.nexconn.chat.message.TextMessage
import ai.nexconn.chat.message.model.DownloadInfo
import ai.nexconn.chat.message.model.MentionedInfo
import ai.nexconn.chat.message.model.MentionedType
import ai.nexconn.chat.message.model.MessageDirection
import ai.nexconn.chat.message.model.MessageIdentifier
import ai.nexconn.chat.message.model.MessageReadReceiptStatus
import ai.nexconn.chat.message.model.MessageReceivedStatusInfo
import ai.nexconn.chat.message.model.ReadReceiptInfo
import ai.nexconn.chat.message.model.ReadReceiptUsersResult
import ai.nexconn.chat.message.model.ReferenceMessageResult
import ai.nexconn.chat.message.model.SentStatus
import ai.nexconn.chat.model.NoDisturbTimeLevel
import ai.nexconn.chat.model.PageData
import ai.nexconn.chat.model.PageResult
import ai.nexconn.chat.params.AcceptGroupApplicationParams
import ai.nexconn.chat.params.AddFriendParams
import ai.nexconn.chat.params.AndroidPushConfig
import ai.nexconn.chat.params.AreaCode
import ai.nexconn.chat.params.ChannelTypeNoDisturbLevelParams
import ai.nexconn.chat.params.ChannelsQueryParams
import ai.nexconn.chat.params.ChannelsUnreadCountParams
import ai.nexconn.chat.params.CompressOptions
import ai.nexconn.chat.params.ConnectParams
import ai.nexconn.chat.params.CreateGroupParams
import ai.nexconn.chat.params.CreateTagParams
import ai.nexconn.chat.params.DeleteMessagesForMeByTimestampParams
import ai.nexconn.chat.params.EnterOpenChannelParams
import ai.nexconn.chat.params.FriendApplicationsQueryParams
import ai.nexconn.chat.params.GetMessageByIdParams
import ai.nexconn.chat.params.GetMessagesAroundTimeParams
import ai.nexconn.chat.params.GetMessagesReadReceiptByUsersParams
import ai.nexconn.chat.params.GetSubscribeEventParams
import ai.nexconn.chat.params.GroupApplicationsQueryParams
import ai.nexconn.chat.params.GroupMembersByRoleQueryParams
import ai.nexconn.chat.params.IOSPushConfig
import ai.nexconn.chat.params.InitParams
import ai.nexconn.chat.params.InsertMessageItem
import ai.nexconn.chat.params.JoinedGroupsByRoleQueryParams
import ai.nexconn.chat.params.KickGroupMembersParams
import ai.nexconn.chat.params.LocalMessagesByTimeQueryParams
import ai.nexconn.chat.params.LogLevel
import ai.nexconn.chat.params.MessagesQueryParams
import ai.nexconn.chat.params.MessagesReadReceiptUsersQueryParams
import ai.nexconn.chat.params.NoDisturbTimeInfo
import ai.nexconn.chat.params.NoDisturbTimeParams
import ai.nexconn.chat.params.OpenChannelDeleteMetadataParams
import ai.nexconn.chat.params.OpenChannelMessagesQueryParams
import ai.nexconn.chat.params.OpenChannelSetMetadataParams
import ai.nexconn.chat.params.PinParams
import ai.nexconn.chat.params.PushConfig
import ai.nexconn.chat.params.RefreshReferenceMessageParams
import ai.nexconn.chat.params.RefuseGroupApplicationParams
import ai.nexconn.chat.params.RefuseGroupInviteParams
import ai.nexconn.chat.params.SearchChannelsParams
import ai.nexconn.chat.params.SearchGroupMembersQueryParams
import ai.nexconn.chat.params.SearchJoinedGroupsQueryParams
import ai.nexconn.chat.params.SearchMessagesByTimeRangeQueryParams
import ai.nexconn.chat.params.SearchMessagesByUserQueryParams
import ai.nexconn.chat.params.SearchMessagesQueryParams
import ai.nexconn.chat.params.SendMediaMessageParams
import ai.nexconn.chat.params.SendMessageParams
import ai.nexconn.chat.params.SetFriendInfoParams
import ai.nexconn.chat.params.SetGroupMemberInfoParams
import ai.nexconn.chat.params.SubscribeEventParams
import ai.nexconn.chat.params.SubscribeQueryParams
import ai.nexconn.chat.params.TaggedChannelsQueryParams
import ai.nexconn.chat.params.TransferGroupOwnerParams
import ai.nexconn.chat.params.TranslateMessagesParams
import ai.nexconn.chat.params.TranslateTextsParams
import ai.nexconn.chat.params.UnreadMentionMeChannelsQueryParams
import ai.nexconn.chat.params.UnsubscribeEventParams
import ai.nexconn.chat.params.UntaggedChannelsQueryParams
import ai.nexconn.chat.params.UpdateGroupInfoParams
import ai.nexconn.chat.params.UpdateMessageParams
import ai.nexconn.chat.tag.Tag
import ai.nexconn.chat.tag.model.ChannelTagInfo
import ai.nexconn.chat.translate.model.TranslateMessageParam
import ai.nexconn.chat.translate.model.TranslateMode
import ai.nexconn.chat.translate.model.TranslateTextParam
import ai.nexconn.chat.user.model.FriendAddPermission
import ai.nexconn.chat.user.model.FriendApplicationStatus
import ai.nexconn.chat.user.model.FriendApplicationType
import ai.nexconn.chat.user.model.FriendDetail
import ai.nexconn.chat.user.model.FriendRelation
import ai.nexconn.chat.user.model.SubscribeType
import ai.nexconn.chat.user.model.SubscriptionStatusInfo
import ai.nexconn.chat.user.model.UserInfo
import ai.nexconn.chat.user.model.UserOnlineStatus
import ai.nexconn.chat.user.model.UserProfile
import ai.nexconn.chat.user.model.UserProfileVisibility
import ai.nexconn.chat.user.model.UserType
import android.content.Context
import android.util.Base64
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

/** One JavaScript invocation; resolves or rejects exactly once. */
internal class Call(
  val method: String,
  private val onResolve: (String) -> Unit,
  private val onReject: (String) -> Unit,
) {
  private val done = AtomicBoolean(false)

  fun resolve(value: Any?) {
    if (!done.compareAndSet(false, true)) return
    val json = try {
      JSONObject().put("v", NexconnSerializer.encode(value)).toString()
    } catch (t: Throwable) {
      onReject(errorJson("internal", "Failed to serialize result: ${t.message}", null, null))
      return
    }
    onResolve(json)
  }

  fun reject(error: BridgeException) {
    if (!done.compareAndSet(false, true)) return
    onReject(errorJson(error.category, error.message, error.code, error.detail))
  }

  fun native(error: NCError?, detail: Any? = null) {
    reject(
      BridgeException(
        "native",
        error?.message?.takeIf { it.isNotEmpty() } ?: "Nexconn SDK error ${error?.code ?: -1}",
        error?.code ?: -1,
        detail,
      ),
    )
  }

  private fun errorJson(category: String, message: String, code: Int?, detail: Any?): String {
    val obj = JSONObject().put("category", category).put("message", message).put("method", method)
    if (code != null) obj.put("code", code)
    if (detail != null) obj.put("detail", NexconnSerializer.encode(detail))
    return obj.toString()
  }
}

private fun failed(error: NCError?): Boolean = error != null && error.code != 0

/**
 * Process-wide bridge to the Nexconn Android SDK (itself a singleton).
 * Survives React Native reloads; the TurboModule attaches/detaches the emitter.
 */
internal object NexconnBridge {
  const val BRIDGE_VERSION = "1.0.0"
  private const val HANDLER_ID = "react-native-nexconn"
  private const val MAX_QUERIES = 64
  private const val MAX_CACHED_MESSAGES = 512

  @Volatile private var emitter: ((String) -> Unit)? = null
  @Volatile private var appContext: Context? = null
  @Volatile private var initializedAppKey: String? = null
  private val generation = AtomicInteger(0)
  private val connecting = AtomicBoolean(false)
  private val forwarder = NexconnEventForwarder { type, payload -> emit(type, payload, null) }

  private class QueryEntry(val kind: String, val query: Any, val generation: Int)

  private val queries = ConcurrentHashMap<String, QueryEntry>()
  private val queryCounter = AtomicLong(0)

  private val messageCache = object : LinkedHashMap<Int, Message>(64, 0.75f, true) {
    override fun removeEldestEntry(eldest: MutableMap.MutableEntry<Int, Message>?) =
      size > MAX_CACHED_MESSAGES
  }

  private val methods = HashMap<String, (JSONObject, Call) -> Unit>()

  init {
    NexconnSerializer.onMessageSerialized = { remember(it) }
    registerEngine()
    registerChannels()
    registerMessages()
    registerGroups()
    registerOpenAndCommunity()
    registerUsers()
    registerTranslateAndTags()
    registerQueries()
  }

  // -------------------------------------------------------------------------
  // Module plumbing
  // -------------------------------------------------------------------------

  fun attach(context: Context, emit: (String) -> Unit) {
    appContext = context.applicationContext
    emitter = emit
  }

  fun detach(emit: (String) -> Unit) {
    if (emitter === emit) emitter = null
  }

  fun isSdkIntegrated(): Boolean = true

  fun invoke(method: String, argsJson: String, resolve: (String) -> Unit, reject: (String) -> Unit) {
    val call = Call(method, resolve, reject)
    try {
      val handler = methods[method] ?: throw unsupported(method)
      if (!method.startsWith("engine.") && initializedAppKey == null) {
        throw BridgeException("not_initialized", "Call initialize() before $method")
      }
      val args = if (argsJson.isBlank()) JSONObject() else JSONObject(argsJson)
      handler(args, call)
    } catch (e: BridgeException) {
      call.reject(e)
    } catch (e: org.json.JSONException) {
      call.reject(invalidArg("Malformed arguments: ${e.message}"))
    } catch (e: IllegalArgumentException) {
      call.reject(invalidArg(e.message ?: "Invalid argument"))
    } catch (t: Throwable) {
      call.reject(BridgeException("internal", t.message ?: t.javaClass.simpleName))
    }
  }

  private fun on(method: String, handler: (JSONObject, Call) -> Unit) {
    methods[method] = handler
  }

  private fun emit(type: String, payload: Any?, opId: String?) {
    val target = emitter ?: return
    val envelope = try {
      JSONObject()
        .put("type", type)
        .put("generation", generation.get())
        .put("payload", NexconnSerializer.encode(payload))
        .also { if (opId != null) it.put("opId", opId) }
        .toString()
    } catch (_: Throwable) {
      return
    }
    target(envelope)
  }

  private fun emitOp(opId: String?, type: String, payload: Any?) {
    if (opId != null) emit(type, payload, opId)
  }

  private fun remember(message: Message) {
    synchronized(messageCache) { if (message.clientId > 0) messageCache[message.clientId] = message }
  }

  private fun cached(clientId: Int?, messageId: String?): Message? = synchronized(messageCache) {
    clientId?.let { messageCache[it] }
      ?: messageId?.let { id -> messageCache.values.firstOrNull { it.messageId == id } }
  }

  private fun resetSession() {
    queries.clear()
    synchronized(messageCache) { messageCache.clear() }
  }

  // -------------------------------------------------------------------------
  // Callback adapters
  // -------------------------------------------------------------------------

  private fun errorHandler(call: Call, value: () -> Any? = { null }) = object : ErrorHandler {
    override fun onError(error: NCError?) {
      if (failed(error)) call.native(error) else call.resolve(value())
    }
  }

  private fun <T> result(call: Call, map: (T?) -> Any? = { it }) = object : OperationHandler<T> {
    override fun onResult(result: T?, error: NCError?) {
      if (failed(error)) call.native(error) else call.resolve(map(result))
    }
  }

  private fun done(call: Call) = result<Boolean>(call) { null }

  private fun detailHandler(call: Call) = object : ErrorDetailHandler<List<String>> {
    override fun onError(errorDetail: List<String>?, error: NCError?) {
      if (failed(error)) call.native(error, errorDetail) else call.resolve(errorDetail ?: emptyList<String>())
    }
  }

  /** Runs [block], turning bridge exceptions into rejections (for async continuations). */
  private inline fun guarded(call: Call, block: () -> Unit) {
    try {
      block()
    } catch (e: BridgeException) {
      call.reject(e)
    } catch (t: Throwable) {
      call.reject(BridgeException("internal", t.message ?: t.javaClass.simpleName))
    }
  }

  // -------------------------------------------------------------------------
  // Decoders
  // -------------------------------------------------------------------------

  private fun channelType(raw: Int): ChannelType =
    NexconnSerializer.enumFrom(ChannelType::class.java, raw, "channelType")

  private fun channelTypes(a: JSONObject, key: String = "channelTypes"): List<ChannelType> =
    (a.ints(key) ?: throw invalidArg("$key is required")).map(::channelType)

  private fun identifierOf(o: JSONObject): ChannelIdentifier {
    val type = channelType(o.reqInt("channelType"))
    val id = o.reqStr("channelId")
    val sub = o.str("subChannelId")
    return if (type == ChannelType.COMMUNITY && !sub.isNullOrEmpty()) {
      CommunitySubChannelIdentifier(id, sub)
    } else {
      ChannelIdentifier(type, id)
    }
  }

  private fun channelOf(o: JSONObject): BaseChannel {
    val type = channelType(o.reqInt("channelType"))
    val id = o.reqStr("channelId")
    val sub = o.str("subChannelId")
    return when (type) {
      ChannelType.DIRECT -> DirectChannel(id)
      ChannelType.GROUP -> GroupChannel(id)
      ChannelType.OPEN -> OpenChannel(id)
      ChannelType.SYSTEM -> SystemChannel(id)
      ChannelType.COMMUNITY -> if (!sub.isNullOrEmpty()) CommunitySubChannel(id, sub) else CommunityChannel(id)
    }
  }

  private fun leaveConfig(o: JSONObject?): LeaveGroupConfig =
    if (o == null) {
      LeaveGroupConfig()
    } else {
      LeaveGroupConfig(
        o.bool("deleteMuteStatus") ?: false,
        o.bool("deleteAllowedSendersList") ?: false,
        o.bool("deleteFavorites") ?: false,
      )
    }

  private fun compressOptions(o: JSONObject): CompressOptions = CompressOptions().apply {
    o.int("imageWidth")?.let { imageWidth = it }
    o.int("imageHeight")?.let { imageHeight = it }
    o.double("imageQuality")?.let { imageQuality = it.toFloat() }
    o.int("maxOriginalImageSize")?.let { maxOriginalImageSize = it }
    o.int("thumbnailMaxSize")?.let { thumbnailMaxSize = it }
    o.int("thumbnailMinSize")?.let { thumbnailMinSize = it }
    o.double("thumbnailQuality")?.let { thumbnailQuality = it.toFloat() }
    o.int("sightCompressWidth")?.let { sightCompressWidth = it }
    o.int("sightCompressHeight")?.let { sightCompressHeight = it }
    o.int("locationImageWidth")?.let { locationImageWidth = it }
    o.int("locationImageHeight")?.let { locationImageHeight = it }
    o.double("locationImageQuality")?.let { locationImageQuality = it.toFloat() }
  }

  private fun pushConfig(o: JSONObject): PushConfig = PushConfig().apply {
    o.bool("disablePushTitle")?.let { disablePushTitle = it }
    o.str("pushTitle")?.let { pushTitle = it }
    o.str("pushContent")?.let { pushContent = it }
    o.str("pushData")?.let { pushData = it }
    o.bool("forceShowDetailContent")?.let { forceShowDetailContent = it }
    o.str("templateId")?.let { templateId = it }
    o.obj("iOSConfig")?.let { ios ->
      iOSConfig = IOSPushConfig().apply {
        ios.str("threadId")?.let { threadId = it }
        ios.str("category")?.let { category = it }
        ios.str("apnsCollapseId")?.let { apnsCollapseId = it }
        ios.str("richMediaUri")?.let { richMediaUri = it }
        ios.str("interruptionLevel")?.let { interruptionLevel = it }
      }
    }
    o.obj("androidConfig")?.let { and ->
      androidConfig = AndroidPushConfig().apply {
        and.str("notificationId")?.let { notificationId = it }
        and.str("channelIdHW")?.let { channelIdHW = it }
        and.str("importanceHW")?.let { importanceHW = it }
        and.str("hwImageUrl")?.let { hwImageUrl = it }
        and.str("categoryHW")?.let { categoryHW = it }
        and.str("fcmChannelId")?.let { fcmChannelId = it }
        and.str("fcmCollapseKey")?.let { fcmCollapseKey = it }
        and.str("fcmImageUrl")?.let { fcmImageUrl = it }
      }
    }
  }

  private fun readBase64(path: String?): String? {
    if (path.isNullOrEmpty()) return null
    val file = File(path.removePrefix("file://"))
    if (!file.isFile) throw invalidArg("Thumbnail file not found: $path")
    return Base64.encodeToString(file.readBytes(), Base64.NO_WRAP)
  }

  private fun applyCommon(content: MessageContent, o: JSONObject) {
    o.str("extra")?.let { content.extra = it }
    o.obj("mentionedInfo")?.let { m ->
      content.mentionedInfo = MentionedInfo(
        NexconnSerializer.enumFrom(MentionedType::class.java, m.reqInt("type"), "mentionedInfo.type"),
        m.strings("userIdList"),
        m.str("mentionedContent"),
      )
    }
    o.obj("senderUserInfo")?.let { u ->
      content.senderUserInfo = UserInfo().apply {
        u.str("userId")?.let { userId = it }
        u.int("userType")?.let { userType = NexconnSerializer.enumFrom(UserType::class.java, it, "userType") }
        u.str("name")?.let { name = it }
        u.str("portraitUri")?.let { portraitUri = it }
        u.str("alias")?.let { alias = it }
        u.str("extra")?.let { extra = it }
      }
    }
  }

  private fun applyMedia(content: MediaMessageContent, o: JSONObject, requirePath: Boolean = true) {
    val path = o.str("localPath")
    if (requirePath && path.isNullOrEmpty()) throw invalidArg("content.localPath is required")
    path?.let { content.localPath = it }
    o.str("remoteUrl")?.let { content.remoteUrl = it }
    o.str("name")?.let { content.name = it }
  }

  /** Builds SDK content. `combine` needs resolved messages (see [withContent]). */
  private fun buildContent(o: JSONObject, resolved: List<Message> = emptyList()): MessageContent {
    val built: MessageContent = when (val type = o.reqStr("type")) {
      "text" -> TextMessage(o.str("text") ?: "")
      "image" -> ImageMessage().apply {
        applyMedia(this, o)
        o.bool("original")?.let { original = it }
      }
      "file" -> FileMessage().apply {
        applyMedia(this, o)
        o.long("size")?.let { size = it }
        o.str("fileType")?.let { fileType = it }
      }
      "voice" -> HDVoiceMessage().apply {
        applyMedia(this, o)
        duration = o.reqInt("duration")
      }
      "gif" -> GIFMessage().apply {
        applyMedia(this, o)
        width = o.reqInt("width")
        height = o.reqInt("height")
        o.long("dataSize")?.let { dataSize = it }
      }
      "video" -> ShortVideoMessage().apply {
        applyMedia(this, o)
        duration = o.reqInt("duration")
        o.long("size")?.let { size = it }
        (o.str("thumbnailBase64") ?: readBase64(o.str("thumbnailPath")))?.let { thumbnailBase64 = it }
      }
      "location" -> LocationMessage().apply {
        latitude = o.double("latitude") ?: throw invalidArg("latitude is required")
        longitude = o.double("longitude") ?: throw invalidArg("longitude is required")
        poi = o.str("poi") ?: ""
        (o.str("thumbnailBase64") ?: readBase64(o.str("thumbnailPath")))?.let { thumbnailBase64 = it }
      }
      "reference" -> ReferenceMessage().apply {
        content = o.str("content") ?: ""
        referMsgId = o.reqStr("referMsgId")
        o.str("referMsgSenderId")?.let { referMsgSenderId = it }
        o.obj("referMsg")?.let { referMsg = buildContent(it) }
      }
      "combine" -> {
        if (resolved.isEmpty()) throw invalidArg("combine.messages could not be resolved")
        val ctx = appContext ?: throw BridgeException("internal", "No Android context")
        CombineMessage.obtain(
          ctx,
          resolved,
          o.strings("nameList") ?: emptyList(),
          o.strings("summaryList") ?: emptyList(),
          channelType(o.reqInt("channelType")),
        )
      }
      "custom" -> {
        val messageType = o.reqStr("messageType")
        val fields = (jsonToKotlin(o.reqObj("fields")) as? Map<*, *>)
          ?.entries?.associate { it.key.toString() to it.value } ?: emptyMap()
        when (val custom = NexconnCustomRegistry.create(messageType)) {
          is NexconnCustomSlot -> custom.also { it.fields = fields }
          is NexconnCustomMediaSlot -> custom.also {
            it.fields = fields
            applyMedia(it, o, requirePath = false)
          }
          else -> throw invalidArg("Custom message type $messageType is not registered")
        }
      }
      else -> throw invalidArg("Unsupported content type $type")
    }
    applyCommon(built, o)
    return built
  }

  /** Resolves combine message references before building content. */
  private fun withContent(o: JSONObject, call: Call, block: (MessageContent) -> Unit) {
    if (o.str("type") == "combine") {
      withMessages(o.objects("messages"), call) { list -> guarded(call) { block(buildContent(o, list)) } }
    } else {
      block(buildContent(o))
    }
  }

  private fun withMessage(ref: JSONObject, call: Call, block: (Message) -> Unit) {
    val clientId = ref.int("clientId")?.takeIf { it > 0 }
    val messageId = ref.str("messageId")?.takeIf { it.isNotEmpty() }
    if (clientId == null && messageId == null) throw invalidArg("message needs clientId or messageId")
    cached(clientId, messageId)?.let { return block(it) }
    BaseChannel.getMessageById(
      GetMessageByIdParams(messageId, clientId),
      object : OperationHandler<Message> {
        override fun onResult(result: Message?, error: NCError?) {
          when {
            failed(error) -> call.native(error)
            result == null -> call.reject(BridgeException("not_found", "Message not found"))
            else -> {
              remember(result)
              guarded(call) { block(result) }
            }
          }
        }
      },
    )
  }

  private fun withMessages(refs: List<JSONObject>, call: Call, block: (List<Message>) -> Unit) {
    val out = ArrayList<Message>(refs.size)
    fun next(index: Int) {
      if (index >= refs.size) return block(out)
      withMessage(refs[index], call) { m ->
        out.add(m)
        next(index + 1)
      }
    }
    next(0)
  }

  private fun group(a: JSONObject) = GroupChannel(a.reqStr("groupId"))

  // -------------------------------------------------------------------------
  // engine.*
  // -------------------------------------------------------------------------

  private fun registerHandlers() {
    NCEngine.addConnectionStatusHandler(HANDLER_ID, forwarder)
    NCEngine.addDatabaseStatusHandler(HANDLER_ID, forwarder)
    NCEngine.addMessageHandler(HANDLER_ID, forwarder)
    NCEngine.addChannelHandler(HANDLER_ID, forwarder)
    NCEngine.addGroupChannelHandler(HANDLER_ID, forwarder)
    NCEngine.addOpenChannelHandler(HANDLER_ID, forwarder)
    NCEngine.addTagHandler(HANDLER_ID, forwarder)
    NCEngine.addTranslateHandler(HANDLER_ID, forwarder)
    NCEngine.addUserHandler(HANDLER_ID, forwarder)
    NCEngine.addUserSettingsHandler(HANDLER_ID, forwarder)
  }

  private fun registerEngine() {
    on("engine.getCapabilities") { _, c ->
      c.resolve(
        mapOf(
          "platform" to "android",
          "sdkVersion" to NCEngine.getVersion(),
          "bridgeVersion" to BRIDGE_VERSION,
          "methods" to methods.keys.sorted(),
        ),
      )
    }
    on("engine.initialize") { a, c ->
      val appKey = a.reqStr("appKey")
      val existing = initializedAppKey
      if (existing != null) {
        if (existing != appKey) {
          throw BridgeException("already_initialized", "SDK already initialized with a different App Key")
        }
        registerHandlers() // idempotent; restores handlers after a JS reload
        c.resolve(mapOf("alreadyInitialized" to true, "platform" to "android", "sdkVersion" to NCEngine.getVersion()))
        return@on
      }
      val context = appContext ?: throw BridgeException("internal", "No Android context")
      val params = InitParams(context, appKey).apply {
        a.int("areaCode")?.let { areaCode = NexconnSerializer.enumFrom(AreaCode::class.java, it, "areaCode") }
        a.str("naviServer")?.let { naviServer = it }
        a.int("logLevel")?.let { logLevel = NexconnSerializer.enumFrom(LogLevel::class.java, it, "logLevel") }
        a.bool("enablePush")?.let { enablePush = it }
        a.bool("enableSyncEmptyTopConversation")?.let { enableSyncEmptyTopConversation = it }
        a.obj("compressOptions")?.let { compressOptions = compressOptions(it) }
        // Deliver SDK callbacks off the main thread; serialization happens there.
        callbackExecutor = NCCallbackExecutors.WORKER
      }
      NCEngine.initialize(params)
      // Handlers are registered before any connect so offline messages are not missed.
      registerHandlers()
      initializedAppKey = appKey
      c.resolve(mapOf("alreadyInitialized" to false, "platform" to "android", "sdkVersion" to NCEngine.getVersion()))
    }
    on("engine.connect") { a, c ->
      if (initializedAppKey == null) throw BridgeException("not_initialized", "Call initialize() before connect()")
      val token = a.reqStr("token")
      if (!connecting.compareAndSet(false, true)) throw BridgeException("busy", "A connect() call is already in progress")
      val gen = generation.incrementAndGet()
      resetSession()
      val params = ConnectParams(token).apply {
        a.int("timeout")?.let { timeout = it }
        a.bool("reconnectKickEnable")?.let { reconnectKickEnable = it }
      }
      try {
        NCEngine.connect(
          params,
          object : ConnectHandler {
            override fun onResult(userId: String?, error: NCError?) {
              connecting.set(false)
              if (failed(error)) c.native(error) else c.resolve(mapOf("userId" to userId, "generation" to gen))
            }

            override fun onDatabaseOpened(isRecreated: Boolean, error: NCError?) {
              emit("Engine.onDatabaseOpened", mapOf("isRecreated" to isRecreated, "error" to error), null)
            }
          },
        )
      } catch (t: Throwable) {
        connecting.set(false)
        throw t
      }
    }
    on("engine.disconnect") { a, c ->
      if (initializedAppKey == null) throw BridgeException("not_initialized", "Call initialize() first")
      val gen = generation.incrementAndGet()
      resetSession()
      NCEngine.disconnect(a.bool("disablePush") ?: false)
      c.resolve(mapOf("generation" to gen))
    }
    on("engine.getConnectionStatus") { _, c -> c.resolve(NCEngine.getConnectionStatus()) }
    on("engine.getCurrentUserId") { _, c -> c.resolve(NCEngine.getCurrentUserId()) }
    on("engine.getVersion") { _, c -> c.resolve(NCEngine.getVersion()) }
    on("engine.getServerTimeDelta") { _, c -> c.resolve(NCEngine.getServerTimeDelta()) }
    on("engine.getAppSettings") { _, c -> c.resolve(NCEngine.getAppSettings()) }
    on("engine.getCompressOptions") { _, c -> c.resolve(NCEngine.getCompressOptions()) }
    on("engine.registerCustomMessages") { a, c ->
      if (initializedAppKey == null) throw BridgeException("not_initialized", "Call initialize() first")
      val classes = ArrayList<Class<out MessageContent>>()
      for (t in a.objects("types")) {
        val cls = NexconnCustomRegistry.register(
          NexconnCustomRegistry.Definition(
            messageType = t.reqStr("messageType"),
            persistentFlag = t.int("persistentFlag") ?: 0,
            searchableFields = t.strings("searchableFields") ?: emptyList(),
            isMedia = t.bool("isMedia") ?: false,
          ),
        )
        @Suppress("UNCHECKED_CAST")
        if (cls != null) classes.add(cls as Class<out MessageContent>)
      }
      if (classes.isNotEmpty()) NCEngine.registerCustomMessages(classes)
      c.resolve(null)
    }
    on("engine.setNoDisturbTime") { a, c ->
      NCEngine.setNoDisturbTime(
        NoDisturbTimeParams(
          a.reqStr("startTime"),
          a.reqInt("spanMinutes"),
          NexconnSerializer.enumFrom(NoDisturbTimeLevel::class.java, a.int("level") ?: 5, "level"),
          a.str("timezone"),
        ),
        errorHandler(c),
      )
    }
    on("engine.getNoDisturbTime") { _, c -> NCEngine.getNoDisturbTime(result<NoDisturbTimeInfo>(c)) }
    on("engine.removeNoDisturbTime") { _, c -> NCEngine.removeNoDisturbTime(errorHandler(c)) }
    on("engine.setPushContentShowStatus") { a, c ->
      NCEngine.setPushContentShowStatus(a.bool("show") ?: true, errorHandler(c))
    }
    on("engine.getPushContentShowStatus") { _, c -> NCEngine.getPushContentShowStatus(result<Boolean>(c)) }
    // engine.setDeviceToken: iOS only (Android tokens come from the push plugin).
  }

  // -------------------------------------------------------------------------
  // channel.*
  // -------------------------------------------------------------------------

  private fun registerChannels() {
    on("channel.getChannels") { a, c ->
      BaseChannel.getChannels(a.objects("channels").map(::identifierOf), result<List<BaseChannel>>(c))
    }
    on("channel.reload") { a, c -> channelOf(a.reqObj("channel")).reload(result<BaseChannel>(c)) }
    on("channel.getUnreadChannels") { a, c ->
      BaseChannel.getUnreadChannels(channelTypes(a), result<List<BaseChannel>>(c))
    }
    on("channel.getPinnedChannels") { a, c ->
      BaseChannel.getPinnedChannels(channelTypes(a), result<List<BaseChannel>>(c))
    }
    on("channel.search") { a, c ->
      val params = SearchChannelsParams(a.reqStr("keyword"), channelTypes(a)).apply {
        a.strings("messageTypes")?.let { messageTypes = it }
      }
      BaseChannel.searchChannels(params, result<List<SearchChannelResult>>(c))
    }
    on("channel.syncRemoteChannels") { _, c -> BaseChannel.syncRemoteChannels(errorHandler(c)) }
    on("channel.deleteChannels") { a, c ->
      BaseChannel.deleteChannels(a.objects("channels").map(::identifierOf), done(c))
    }
    on("channel.delete") { a, c -> channelOf(a.reqObj("channel")).delete(done(c)) }
    on("channel.pin") { a, c ->
      val params = PinParams().apply { updateOperationTime = a.bool("updateOperationTime") ?: false }
      channelOf(a.reqObj("channel")).pin(params, done(c))
    }
    on("channel.unpin") { a, c -> channelOf(a.reqObj("channel")).unpin(done(c)) }
    on("channel.setNoDisturbLevel") { a, c ->
      val level = NexconnSerializer.enumFrom(ChannelNoDisturbLevel::class.java, a.reqInt("level"), "level")
      channelOf(a.reqObj("channel")).setNoDisturbLevel(level, errorHandler(c))
    }
    on("channel.setChannelTypeNoDisturbLevel") { a, c ->
      BaseChannel.setChannelTypeNoDisturbLevel(
        ChannelTypeNoDisturbLevelParams(
          channelType(a.reqInt("channelType")),
          NexconnSerializer.enumFrom(ChannelNoDisturbLevel::class.java, a.reqInt("level"), "level"),
        ),
        errorHandler(c),
      )
    }
    on("channel.getChannelTypeNoDisturbLevel") { a, c ->
      BaseChannel.getChannelTypeNoDisturbLevel(channelType(a.reqInt("channelType")), result<ChannelNoDisturbLevel>(c))
    }
    on("channel.clearUnreadCount") { a, c -> channelOf(a.reqObj("channel")).clearUnreadCount(done(c)) }
    on("channel.getTotalUnreadCount") { _, c -> BaseChannel.getTotalUnreadCount(result<Int>(c) { it ?: 0 }) }
    on("channel.getUnreadCountByNoDisturbLevel") { a, c ->
      val levels = (a.ints("levels") ?: emptyList()).map {
        NexconnSerializer.enumFrom(ChannelNoDisturbLevel::class.java, it, "level")
      }
      BaseChannel.getChannelsUnreadCountByNoDisturbLevel(
        ChannelsUnreadCountParams(channelTypes(a), levels),
        result<Int>(c) { it ?: 0 },
      )
    }
    on("channel.getFirstUnreadMessage") { a, c ->
      channelOf(a.reqObj("channel")).getFirstUnreadMessage(result<Message>(c))
    }
    on("channel.getUnreadMentionedMessages") { a, c ->
      channelOf(a.reqObj("channel")).getUnreadMentionedMessages(result<List<Message>>(c))
    }
    on("channel.getTags") { a, c -> channelOf(a.reqObj("channel")).getTags(result<List<ChannelTagInfo>>(c)) }
    on("channel.deleteTags") { a, c ->
      channelOf(a.reqObj("channel")).deleteTags(a.reqStrings("tagIds"), errorHandler(c))
    }
    on("channel.saveDraft") { a, c -> channelOf(a.reqObj("channel")).saveDraft(a.str("draft") ?: "", done(c)) }
    on("channel.clearDraft") { a, c -> channelOf(a.reqObj("channel")).clearDraft(done(c)) }
    on("channel.saveEditedMessageDraft") { a, c ->
      channelOf(a.reqObj("channel"))
        .saveEditedMessageDraft(EditedMessageDraft(a.reqStr("messageId"), a.str("content")), done(c))
    }
    on("channel.clearEditedMessageDraft") { a, c ->
      channelOf(a.reqObj("channel")).clearEditedMessageDraft(done(c))
    }
    on("channel.setAttributes") { a, c ->
      channelOf(a.reqObj("channel")).setAttributes(a.stringMap("attributes") ?: emptyMap(), errorHandler(c))
    }
    on("channel.removeAttributes") { a, c ->
      channelOf(a.reqObj("channel")).removeAttributes(a.reqStrings("keys"), errorHandler(c))
    }
    on("channel.syncReadStatus") { a, c ->
      val ts = a.long("timestamp") ?: throw invalidArg("timestamp is required")
      channelOf(a.reqObj("channel")).syncConversationReadStatus(ts, errorHandler(c))
    }
    on("channel.sendTypingStatus") { a, c ->
      val channel = channelOf(a.reqObj("channel")) as? DirectChannel
        ?: throw invalidArg("Typing status is only supported for direct channels")
      channel.sendTypingStatus(a.reqStr("typingMessageType"))
      c.resolve(null)
    }
  }

  // -------------------------------------------------------------------------
  // message.*
  // -------------------------------------------------------------------------

  private fun applySend(params: SendMessageParams, o: JSONObject?) {
    if (o == null) return
    o.obj("pushConfig")?.let { params.pushConfig = pushConfig(it) }
    o.strings("directedUserIds")?.let { params.directedUserIds = it.toTypedArray() }
    o.bool("disableNotification")?.let { params.disableNotification = it }
    o.bool("disableUpdateLastMessage")?.let { params.disableUpdateLastMessage = it }
    o.stringMap("metadata")?.let { params.metadata = it }
    o.bool("needReceipt")?.let { params.needReceipt = it }
    o.int("expiry")?.let { params.expiry = it }
  }

  private fun applySendMedia(params: SendMediaMessageParams, o: JSONObject?) {
    if (o == null) return
    o.obj("pushConfig")?.let { params.pushConfig = pushConfig(it) }
    o.strings("directedUserIds")?.let { params.directedUserIds = it.toTypedArray() }
    o.bool("disableNotification")?.let { params.disableNotification = it }
    o.bool("disableUpdateLastMessage")?.let { params.disableUpdateLastMessage = it }
    o.stringMap("metadata")?.let { params.metadata = it }
    o.bool("needReceipt")?.let { params.needReceipt = it }
    o.int("expiry")?.let { params.expiry = it }
  }

  private fun registerMessages() {
    on("message.send") { a, c ->
      val channel = channelOf(a.reqObj("channel"))
      val opId = a.str("opId")
      withContent(a.reqObj("content"), c) { content ->
        val params = SendMessageParams(content).also { applySend(it, a.obj("options")) }
        channel.sendMessage(
          params,
          object : SendMessageHandler {
            override fun onAttached(message: Message) {
              remember(message)
              emitOp(opId, "op.attached", mapOf("message" to message))
            }

            override fun onResult(message: Message?, error: NCError?) {
              if (failed(error)) c.native(error, message) else c.resolve(message)
            }
          },
        )
      }
    }
    on("message.sendMedia") { a, c ->
      val channel = channelOf(a.reqObj("channel"))
      val opId = a.str("opId")
      withContent(a.reqObj("content"), c) { content ->
        val media = content as? MediaMessageContent ?: throw invalidArg("sendMedia requires media content")
        val params = SendMediaMessageParams(media).also { applySendMedia(it, a.obj("options")) }
        channel.sendMediaMessage(
          params,
          object : SendMediaMessageHandler {
            override fun onAttached(message: Message) {
              remember(message)
              emitOp(opId, "op.attached", mapOf("message" to message))
            }

            override fun onProgress(message: Message, progress: Int) {
              emitOp(opId, "op.progress", mapOf("progress" to progress, "message" to message))
            }

            override fun onCanceled(message: Message) {
              c.reject(BridgeException("canceled", "Media message upload was canceled", null, message))
            }

            override fun onResult(message: Message?, error: NCError?) {
              if (failed(error)) c.native(error, message) else c.resolve(message)
            }
          },
        )
      }
    }
    on("message.cancelSendMedia") { a, c ->
      withMessage(a.reqObj("message"), c) { m ->
        BaseChannel(m.channelIdentifier).cancelSendMediaMessage(m, errorHandler(c))
      }
    }
    on("message.insert") { a, c ->
      val channel = channelOf(a.reqObj("channel"))
      val items = a.objects("items").map { item ->
        InsertMessageItem(
          buildContent(item.reqObj("content")),
          NexconnSerializer.enumFrom(MessageDirection::class.java, item.reqInt("direction"), "direction"),
          item.str("senderUserId"),
          item.long("sentTime") ?: System.currentTimeMillis(),
          NexconnSerializer.enumFrom(SentStatus::class.java, item.int("sentStatus") ?: 30, "sentStatus"),
        )
      }
      channel.insertMessages(items, done(c))
    }
    on("message.update") { a, c ->
      val channel = channelOf(a.reqObj("channel"))
      channel.updateMessage(
        UpdateMessageParams(a.reqStr("messageId"), buildContent(a.reqObj("content"))),
        result<Message>(c),
      )
    }
    on("message.deleteForMe") { a, c ->
      val channel = channelOf(a.reqObj("channel"))
      withMessages(a.objects("messages"), c) { list -> channel.deleteMessagesForMe(list, errorHandler(c)) }
    }
    on("message.deleteForAll") { a, c ->
      val channel = channelOf(a.reqObj("channel"))
      withMessage(a.reqObj("message"), c) { m -> channel.deleteMessageForAll(m, result<Message>(c)) }
    }
    on("message.deleteForMeByTimestamp") { a, c ->
      channelOf(a.reqObj("channel")).deleteMessagesForMeByTimestamp(
        DeleteMessagesForMeByTimestampParams(
          a.long("timestamp") ?: throw invalidArg("timestamp is required"),
          NexconnSerializer.enumFrom(MessageOperationPolicy::class.java, a.reqInt("policy"), "policy"),
        ),
        errorHandler(c),
      )
    }
    on("message.deleteLocal") { a, c ->
      withMessages(a.objects("messages"), c) { list ->
        BaseChannel.deleteLocalMessages(list.map { it.clientId.toString() }, done(c))
      }
    }
    on("message.getAroundTime") { a, c ->
      channelOf(a.reqObj("channel")).getMessagesAroundTime(
        GetMessagesAroundTimeParams(
          a.long("sentTime") ?: throw invalidArg("sentTime is required"),
          a.int("beforeCount") ?: 10,
          a.int("afterCount") ?: 10,
        ),
        result<List<Message>>(c),
      )
    }
    on("message.getById") { a, c -> withMessage(a.reqObj("message"), c) { m -> c.resolve(m) } }
    on("message.sendReadReceiptResponse") { a, c ->
      channelOf(a.reqObj("channel")).sendReadReceiptResponse(a.reqStrings("messageIds"), errorHandler(c))
    }
    on("message.getReadReceiptInfo") { a, c ->
      channelOf(a.reqObj("channel")).getMessageReadReceiptInfo(a.reqStrings("messageIds"), result<List<ReadReceiptInfo>>(c))
    }
    on("message.getReadReceiptInfoByIdentifiers") { a, c ->
      val ids = a.objects("identifiers").map { MessageIdentifier(identifierOf(it.reqObj("channel")), it.reqStr("messageId")) }
      BaseChannel.getMessageReadReceiptInfoByIdentifiers(ids, result<List<ReadReceiptInfo>>(c))
    }
    on("message.getReadReceiptByUsers") { a, c ->
      channelOf(a.reqObj("channel")).getMessagesReadReceiptByUsers(
        GetMessagesReadReceiptByUsersParams(a.reqStr("messageId"), a.reqStrings("userIds")),
        result<ReadReceiptUsersResult>(c),
      )
    }
    on("message.setMetadata") { a, c ->
      val metadata = a.stringMap("metadata") ?: throw invalidArg("metadata is required")
      withMessage(a.reqObj("message"), c) { m -> m.setMetadata(metadata, errorHandler(c)) }
    }
    on("message.deleteMetadata") { a, c ->
      val keys = a.reqStrings("keys")
      withMessage(a.reqObj("message"), c) { m -> m.deleteMetadata(keys, errorHandler(c)) }
    }
    on("message.setReceivedStatus") { a, c ->
      withMessage(a.reqObj("message"), c) { m ->
        val info = MessageReceivedStatusInfo().apply {
          if (a.bool("isRead") == true) setRead()
          if (a.bool("isListened") == true) setListened()
          if (a.bool("isDownloaded") == true) setDownloaded()
          if (a.bool("isRetrieved") == true) setRetrieved()
        }
        m.setReceivedStatusInfo(info, done(c))
      }
    }
    on("message.requestSpeechToText") { a, c ->
      withMessage(a.reqObj("message"), c) { m -> m.requestSpeechToText(errorHandler(c)) }
    }
    on("message.setSpeechToTextVisible") { a, c ->
      val visible = a.bool("visible") ?: true
      withMessage(a.reqObj("message"), c) { m -> m.setSpeechToTextVisible(visible, errorHandler(c)) }
    }
    on("message.requestStream") { a, c ->
      withMessage(a.reqObj("message"), c) { m -> m.requestStreamMessage(errorHandler(c)) }
    }
    on("message.downloadMedia") { a, c ->
      val opId = a.str("opId")
      withMessage(a.reqObj("message"), c) { m ->
        m.downloadMedia(
          object : DownloadMediaMessageHandler {
            override fun onSuccess(message: Message) {
              remember(message)
              val path = (message.content as? MediaMessageContent)?.localPath
              c.resolve(mapOf("message" to message, "localPath" to path))
            }

            override fun onProgress(message: Message, progress: Int) {
              emitOp(opId, "op.progress", mapOf("progress" to progress))
            }

            override fun onError(message: Message, error: NCError) = c.native(error, message)

            override fun onCanceled(message: Message) {
              c.reject(BridgeException("canceled", "Media download was canceled", null, message))
            }
          },
        )
      }
    }
    on("message.pauseDownload") { a, c ->
      withMessage(a.reqObj("message"), c) { m -> m.pauseDownloadingMedia(errorHandler(c)) }
    }
    on("message.cancelDownload") { a, c ->
      withMessage(a.reqObj("message"), c) { m -> m.cancelDownloadingMedia(errorHandler(c)) }
    }
    on("message.getMediaDownloadInfo") { a, c ->
      BaseChannel.getMediaDownloadInfo(a.reqStr("url"), result<DownloadInfo>(c))
    }
    on("message.refreshReference") { a, c ->
      val local = ArrayList<ReferenceMessageResult>()
      BaseChannel.refreshReferenceMessage(
        RefreshReferenceMessageParams(identifierOf(a.reqObj("channel")), a.reqStrings("messageIds")),
        object : RefreshReferenceMessageHandler {
          override fun onLocalMessages(results: List<ReferenceMessageResult>) {
            local.addAll(results)
          }

          override fun onRemoteMessages(results: List<ReferenceMessageResult>) {
            c.resolve(mapOf("local" to local, "remote" to results))
          }

          override fun onError(error: NCError) = c.native(error, mapOf("local" to local))
        },
      )
    }
    // message.downloadMediaUrl / cancelDownloadMediaUrl: iOS only.
  }

  // -------------------------------------------------------------------------
  // group.*
  // -------------------------------------------------------------------------

  private fun registerGroups() {
    on("group.create") { a, c ->
      val params = CreateGroupParams(a.reqStr("groupId"), a.reqStr("groupName"), a.strings("inviteeUserIds") ?: emptyList()).apply {
        a.str("avatarUrl")?.let { avatarUrl = it }
        a.str("introduction")?.let { introduction = it }
        a.str("notice")?.let { notice = it }
        a.stringMap("extProfile")?.let { extProfile = it }
        a.int("joinPermission")?.let { joinPermission = NexconnSerializer.enumFrom(GroupJoinPermission::class.java, it, "joinPermission") }
        a.int("removeMemberPermission")?.let { removeMemberPermission = NexconnSerializer.enumFrom(GroupOperationPermission::class.java, it, "removeMemberPermission") }
        a.int("invitePermission")?.let { invitePermission = NexconnSerializer.enumFrom(GroupOperationPermission::class.java, it, "invitePermission") }
        a.int("inviteHandlePermission")?.let { inviteHandlePermission = NexconnSerializer.enumFrom(GroupInviteHandlePermission::class.java, it, "inviteHandlePermission") }
        a.int("groupInfoEditPermission")?.let { groupInfoEditPermission = NexconnSerializer.enumFrom(GroupOperationPermission::class.java, it, "groupInfoEditPermission") }
        a.int("memberInfoEditPermission")?.let { memberInfoEditPermission = NexconnSerializer.enumFrom(GroupMemberInfoEditPermission::class.java, it, "memberInfoEditPermission") }
      }
      GroupChannel.createGroup(
        params,
        object : CreateGroupHandler {
          override fun onResult(processCode: Int?, errorKeys: List<String>?, error: NCError?) {
            if (failed(error)) {
              c.native(error, mapOf("errorKeys" to errorKeys))
            } else {
              c.resolve(mapOf("processCode" to (processCode ?: 0), "errorKeys" to (errorKeys ?: emptyList<String>())))
            }
          }
        },
      )
    }
    on("group.getGroupsInfo") { a, c -> GroupChannel.getGroupsInfo(a.reqStrings("groupIds"), result<List<GroupInfo>>(c)) }
    on("group.getJoinedGroups") { a, c -> GroupChannel.getJoinedGroups(a.reqStrings("groupIds"), result<List<GroupInfo>>(c)) }
    on("group.updateInfo") { a, c ->
      val params = UpdateGroupInfoParams().apply {
        a.str("groupName")?.let { groupName = it }
        a.str("avatarUrl")?.let { avatarUrl = it }
        a.str("introduction")?.let { introduction = it }
        a.str("notice")?.let { notice = it }
        a.stringMap("extProfile")?.let { extProfile = it }
        a.int("joinPermission")?.let { joinPermission = NexconnSerializer.enumFrom(GroupJoinPermission::class.java, it, "joinPermission") }
        a.int("removeMemberPermission")?.let { removeMemberPermission = NexconnSerializer.enumFrom(GroupOperationPermission::class.java, it, "removeMemberPermission") }
        a.int("invitePermission")?.let { invitePermission = NexconnSerializer.enumFrom(GroupOperationPermission::class.java, it, "invitePermission") }
        a.int("inviteHandlePermission")?.let { inviteHandlePermission = NexconnSerializer.enumFrom(GroupInviteHandlePermission::class.java, it, "inviteHandlePermission") }
        a.int("groupInfoEditPermission")?.let { groupInfoEditPermission = NexconnSerializer.enumFrom(GroupOperationPermission::class.java, it, "groupInfoEditPermission") }
        a.int("memberInfoEditPermission")?.let { memberInfoEditPermission = NexconnSerializer.enumFrom(GroupMemberInfoEditPermission::class.java, it, "memberInfoEditPermission") }
      }
      group(a).updateInfo(params, detailHandler(c))
    }
    on("group.join") { a, c -> group(a).join(result<Int>(c) { it ?: 0 }) }
    on("group.leave") { a, c -> group(a).leave(leaveConfig(a.obj("config")), errorHandler(c)) }
    on("group.dismiss") { a, c -> group(a).dismiss(errorHandler(c)) }
    on("group.transferOwner") { a, c ->
      val params = TransferGroupOwnerParams(a.reqStr("newOwnerId")).apply {
        leaveAfterTransfer = a.bool("leaveAfterTransfer") ?: false
        a.obj("config")?.let { config = leaveConfig(it) }
      }
      group(a).transferOwner(params, errorHandler(c))
    }
    on("group.inviteUsers") { a, c -> group(a).inviteUsers(a.reqStrings("userIds"), result<Int>(c) { it ?: 0 }) }
    on("group.kickMembers") { a, c ->
      val params = KickGroupMembersParams(a.reqStrings("userIds")).apply {
        a.obj("config")?.let { config = leaveConfig(it) }
      }
      group(a).kickMembers(params, errorHandler(c))
    }
    on("group.addAdmins") { a, c -> group(a).addAdmins(a.reqStrings("userIds"), errorHandler(c)) }
    on("group.removeAdmins") { a, c -> group(a).removeAdmins(a.reqStrings("userIds"), errorHandler(c)) }
    on("group.addManagers") { a, c -> group(a).addManagers(a.reqStrings("userIds"), errorHandler(c)) }
    on("group.removeManagers") { a, c -> group(a).removeManagers(a.reqStrings("userIds"), errorHandler(c)) }
    on("group.acceptInvite") { a, c -> group(a).acceptInvite(a.reqStr("inviterId"), errorHandler(c)) }
    on("group.refuseInvite") { a, c ->
      val params = RefuseGroupInviteParams(a.reqStr("inviterId")).apply { a.str("reason")?.let { reason = it } }
      group(a).refuseInvite(params, errorHandler(c))
    }
    on("group.acceptApplication") { a, c ->
      val params = AcceptGroupApplicationParams(a.reqStr("applicantId")).apply {
        a.str("inviterId")?.let { inviterId = it }
      }
      group(a).acceptApplication(params, result<Int>(c) { it ?: 0 })
    }
    on("group.refuseApplication") { a, c ->
      val params = RefuseGroupApplicationParams(a.reqStr("applicantId")).apply {
        a.str("inviterId")?.let { inviterId = it }
        a.str("reason")?.let { reason = it }
      }
      group(a).refuseApplication(params, errorHandler(c))
    }
    on("group.getMembers") { a, c -> group(a).getMembers(a.reqStrings("userIds"), result<List<GroupMemberInfo>>(c)) }
    on("group.setMemberInfo") { a, c ->
      group(a).setMemberInfo(
        SetGroupMemberInfoParams(a.reqStr("userId"), a.str("nickname") ?: "", a.str("extra")),
        detailHandler(c),
      )
    }
    on("group.addFavorites") { a, c -> group(a).addFavorites(a.reqStrings("userIds"), errorHandler(c)) }
    on("group.removeFavorites") { a, c -> group(a).removeFavorites(a.reqStrings("userIds"), errorHandler(c)) }
    on("group.getFavorites") { a, c -> group(a).getFavorites(result<List<GroupFollowDetail>>(c)) }
  }

  // -------------------------------------------------------------------------
  // open.* and community.*
  // -------------------------------------------------------------------------

  private fun registerOpenAndCommunity() {
    on("open.enter") { a, c ->
      val params = EnterOpenChannelParams().apply {
        a.int("messageCount")?.let { messageCount = it }
        a.str("extra")?.let { extra = it }
      }
      // Android reports the enter response through OpenChannelHandler.onEntered.
      OpenChannel(a.reqStr("channelId")).enterChannel(params, errorHandler(c))
    }
    on("open.exit") { a, c ->
      val channel = OpenChannel(a.reqStr("channelId"))
      val extra = a.str("extra")
      if (extra != null) channel.exitChannel(extra, errorHandler(c)) else channel.exitChannel(errorHandler(c))
    }
    on("open.getMetadata") { a, c ->
      OpenChannel(a.reqStr("channelId")).getMetadata(a.reqStr("key"), result<Map<String, String>>(c))
    }
    on("open.setMetadata") { a, c ->
      val params = OpenChannelSetMetadataParams(
        a.stringMap("metadata") ?: throw invalidArg("metadata is required"),
        a.bool("deleteWhenLeft") ?: false,
        a.bool("overwrite") ?: false,
      )
      OpenChannel(a.reqStr("channelId")).setMetadata(params, errorHandler(c) { emptyList<String>() })
    }
    on("open.deleteMetadata") { a, c ->
      val params = OpenChannelDeleteMetadataParams(a.reqStrings("keys"), a.bool("force") ?: false)
      OpenChannel(a.reqStr("channelId")).deleteMetadata(params, errorHandler(c) { emptyList<String>() })
    }

    on("community.getSubChannels") { a, c ->
      CommunityChannel(a.reqStr("channelId")).getSubChannels(result<List<CommunitySubChannel>>(c))
    }
    on("community.getUnreadCount") { a, c ->
      CommunityChannel(a.reqStr("channelId")).getUnreadCount(result<Int>(c) { it ?: 0 })
    }
    on("community.getChannelsUnreadInfo") { a, c ->
      CommunityChannel.getChannelsUnreadInfo(a.reqStrings("channelIds").toTypedArray(), result<List<CommunityUnreadInfo>>(c))
    }
    on("community.getTotalUnreadCount") { _, c -> CommunityChannel.getTotalUnreadCount(result<Int>(c) { it ?: 0 }) }
    on("community.getTotalUnreadMentionedCount") { _, c ->
      CommunityChannel.getTotalUnreadMentionedCount(result<Int>(c) { it ?: 0 })
    }
    on("community.checkRemoteMessages") { a, c ->
      withMessages(a.objects("messages"), c) { list ->
        CommunityChannel.checkRemoteMessages(
          list,
          result<BatchRemoteMessagesResult>(c) { r ->
            mapOf("matched" to r?.matchedMessages, "notMatched" to r?.notMatchedMessages)
          },
        )
      }
    }
  }

  // -------------------------------------------------------------------------
  // user.*
  // -------------------------------------------------------------------------

  private fun subscribeType(a: JSONObject) =
    NexconnSerializer.enumFrom(SubscribeType::class.java, a.reqInt("subscribeType"), "subscribeType")

  private fun registerUsers() {
    val users = { NCEngine.userModule }
    on("user.subscribeEvent") { a, c ->
      val params = SubscribeEventParams(subscribeType(a), a.reqStrings("userIds")).apply {
        a.int("expiry")?.let { expiry = it }
      }
      users().subscribeEvent(params, detailHandler(c))
    }
    on("user.unsubscribeEvent") { a, c ->
      users().unsubscribeEvent(UnsubscribeEventParams(subscribeType(a), a.reqStrings("userIds")), detailHandler(c))
    }
    on("user.getSubscribeEvent") { a, c ->
      users().getSubscribeEvent(
        GetSubscribeEventParams(subscribeType(a), a.reqStrings("userIds")),
        result<List<SubscriptionStatusInfo>>(c),
      )
    }
    on("user.getSubscribeUsersOnlineStatus") { a, c ->
      users().getSubscribeUsersOnlineStatus(a.reqStrings("userIds"), result<List<UserOnlineStatus>>(c))
    }
    on("user.addToBlocklist") { a, c -> users().addToBlocklist(a.reqStr("userId"), errorHandler(c)) }
    on("user.removeFromBlocklist") { a, c -> users().removeFromBlocklist(a.reqStr("userId"), errorHandler(c)) }
    on("user.getBlocklist") { _, c -> users().getBlocklist(result<List<String>>(c) { it ?: emptyList<String>() }) }
    on("user.checkBlocked") { a, c -> users().checkBlocked(a.reqStr("userId"), result<Boolean>(c) { it ?: false }) }
    on("user.updateMyUserProfile") { a, c ->
      val p = a.reqObj("profile")
      val profile = UserProfile(
        p.str("userId"),
        p.str("name"),
        p.str("avatarUrl"),
        p.str("uniqueId"),
        p.str("email"),
        p.str("birthday"),
        p.int("gender"),
        p.str("location"),
        p.int("role"),
        p.int("level"),
        p.stringMap("extProfile"),
      )
      users().updateMyUserProfile(profile, detailHandler(c))
    }
    on("user.getUserProfiles") { a, c -> users().getUserProfiles(a.reqStrings("userIds"), result<List<UserProfile>>(c)) }
    on("user.getMyUserProfile") { _, c -> users().getMyUserProfile(result<UserProfile>(c)) }
    on("user.updateMyUserProfileVisibility") { a, c ->
      users().updateMyUserProfileVisibility(
        NexconnSerializer.enumFrom(UserProfileVisibility::class.java, a.reqInt("visibility"), "visibility"),
        errorHandler(c),
      )
    }
    on("user.getMyUserProfileVisibility") { _, c ->
      users().getMyUserProfileVisibility(result<UserProfileVisibility>(c))
    }
    on("user.setFriendAddPermission") { a, c ->
      users().setFriendAddPermission(
        NexconnSerializer.enumFrom(FriendAddPermission::class.java, a.reqInt("permission"), "permission"),
        errorHandler(c),
      )
    }
    on("user.getFriendAddPermission") { _, c -> users().getFriendAddPermission(result<FriendAddPermission>(c)) }
    on("user.addFriend") { a, c ->
      val params = AddFriendParams(a.reqStr("userId")).apply { a.str("extra")?.let { extra = it } }
      users().addFriend(params, result<Int>(c) { it ?: 0 })
    }
    on("user.removeFriends") { a, c -> users().removeFriends(a.reqStrings("userIds"), errorHandler(c)) }
    on("user.acceptFriendApplication") { a, c -> users().acceptFriendApplication(a.reqStr("userId"), errorHandler(c)) }
    on("user.refuseFriendApplication") { a, c -> users().refuseFriendApplication(a.reqStr("userId"), errorHandler(c)) }
    on("user.setFriendInfo") { a, c ->
      val params = SetFriendInfoParams(a.reqStr("userId")).apply {
        a.str("remark")?.let { remark = it }
        a.stringMap("extProfile")?.let { extProfile = it }
      }
      users().setFriendInfo(params, detailHandler(c))
    }
    on("user.checkFriends") { a, c -> users().checkFriends(a.reqStrings("userIds"), result<List<FriendRelation>>(c)) }
    on("user.getFriends") { _, c -> users().getFriends(result<List<FriendDetail>>(c)) }
    on("user.getFriendsInfo") { a, c -> users().getFriendsInfo(a.reqStrings("userIds"), result<List<FriendDetail>>(c)) }
    on("user.searchFriendsInfo") { a, c -> users().searchFriendsInfo(a.reqStr("name"), result<List<FriendDetail>>(c)) }
  }

  // -------------------------------------------------------------------------
  // translate.* and tag.*
  // -------------------------------------------------------------------------

  private fun withTag(a: JSONObject, call: Call, block: (Tag) -> Unit) {
    Tag.getTag(
      a.reqStr("tagId"),
      object : OperationHandler<Tag> {
        override fun onResult(result: Tag?, error: NCError?) {
          when {
            failed(error) -> call.native(error)
            result == null -> call.reject(BridgeException("not_found", "Tag not found"))
            else -> guarded(call) { block(result) }
          }
        }
      },
    )
  }

  private fun registerTranslateAndTags() {
    val translate = { NCEngine.translateModule }
    on("translate.translateMessages") { a, c ->
      val list = a.objects("list").map { item ->
        TranslateMessageParam(item.reqStr("messageId")).apply {
          item.str("sourceLanguage")?.let { sourceLanguage = it }
          item.str("targetLanguage")?.let { targetLanguage = it }
        }
      }
      val params = TranslateMessagesParams(list).apply {
        force = a.bool("force") ?: false
        mode = NexconnSerializer.enumFrom(TranslateMode::class.java, a.int("mode") ?: 0, "mode")
      }
      translate().translateMessages(params, errorHandler(c))
    }
    on("translate.translateTexts") { a, c ->
      val list = a.objects("list").map { item ->
        TranslateTextParam(item.reqStr("text")).apply {
          item.str("sourceLanguage")?.let { sourceLanguage = it }
          item.str("targetLanguage")?.let { targetLanguage = it }
        }
      }
      val params = TranslateTextsParams(list).apply {
        mode = NexconnSerializer.enumFrom(TranslateMode::class.java, a.int("mode") ?: 0, "mode")
      }
      translate().translateTexts(params, errorHandler(c))
    }
    on("translate.setLanguage") { a, c -> translate().setTranslationLanguage(a.reqStr("language"), errorHandler(c)) }
    on("translate.getLanguage") { _, c -> translate().getTranslationLanguage(result<String>(c)) }
    on("translate.setAutoTranslateEnabled") { a, c ->
      translate().setAutoTranslateEnabled(a.bool("enabled") ?: false, errorHandler(c))
    }
    on("translate.getAutoTranslateEnabled") { _, c ->
      translate().getAutoTranslateEnabled(result<Boolean>(c) { it ?: false })
    }
    on("translate.setStrategy") { a, c ->
      translate().setTranslateStrategy(
        a.objects("channels").map(::identifierOf),
        NexconnSerializer.enumFrom(TranslateStrategy::class.java, a.reqInt("strategy"), "strategy"),
        errorHandler(c),
      )
    }

    on("tag.create") { a, c -> Tag.createTag(CreateTagParams(a.reqStr("tagId"), a.reqStr("tagName")), result<Tag>(c)) }
    on("tag.getTags") { _, c -> Tag.getTags(result<List<Tag>>(c)) }
    on("tag.getTag") { a, c -> Tag.getTag(a.reqStr("tagId"), result<Tag>(c)) }
    on("tag.delete") { a, c -> withTag(a, c) { it.delete(errorHandler(c)) } }
    on("tag.update") { a, c ->
      val name = a.reqStr("tagName")
      withTag(a, c) { it.update(name, errorHandler(c)) }
    }
    on("tag.addChannels") { a, c ->
      val ids = a.objects("channels").map(::identifierOf)
      withTag(a, c) { it.addChannels(ids, errorHandler(c)) }
    }
    on("tag.deleteChannels") { a, c ->
      val ids = a.objects("channels").map(::identifierOf)
      withTag(a, c) { it.deleteChannels(ids, errorHandler(c)) }
    }
    on("tag.getUnreadCount") { a, c ->
      val contain = a.bool("containNoDisturb") ?: false
      withTag(a, c) { it.getUnreadCount(contain, result<Int>(c) { v -> v ?: 0 }) }
    }
    on("tag.clearUnreadCount") { a, c -> withTag(a, c) { it.clearUnreadCount(done(c)) } }
    on("tag.clearChannels") { a, c ->
      val delete = a.bool("deleteMessages") ?: false
      withTag(a, c) { it.clearChannels(delete, done(c)) }
    }
  }

  // -------------------------------------------------------------------------
  // query.*
  // -------------------------------------------------------------------------

  private fun createQuery(kind: String, p: JSONObject): Any = when (kind) {
    "channels" -> BaseChannel.createChannelsQuery(
      ChannelsQueryParams(channelTypes(p)).apply {
        p.int("pageSize")?.let { pageSize = it }
        p.long("startTime")?.let { startTime = it }
        p.bool("topPriority")?.let { topPriority = it }
      },
    )
    "unreadMentionMeChannels" -> BaseChannel.createUnreadMentionMeChannelsQuery(
      UnreadMentionMeChannelsQueryParams(channelTypes(p)).apply {
        p.int("pageSize")?.let { pageSize = it }
        p.long("startTime")?.let { startTime = it }
        p.bool("topPriority")?.let { topPriority = it }
      },
    )
    "messages" -> BaseChannel.createMessagesQuery(
      MessagesQueryParams(identifierOf(p.reqObj("channel"))).apply {
        p.long("startTime")?.let { startTime = it }
        p.bool("isAscending")?.let { isAscending = it }
        p.int("pageSize")?.let { pageSize = it }
      },
    )
    "localMessagesByTime" -> BaseChannel.createLocalMessagesByTimeQuery(
      LocalMessagesByTimeQueryParams(identifierOf(p.reqObj("channel"))).apply {
        p.long("sentTime")?.let { sentTime = it }
        p.bool("isAscending")?.let { isAscending = it }
        p.strings("messageTypes")?.let { messageTypes = it }
        p.int("pageSize")?.let { pageSize = it }
      },
    )
    "searchMessagesByUser" -> BaseChannel.createSearchMessagesByUserQuery(
      SearchMessagesByUserQueryParams(
        p.reqStr("channelId"),
        channelType(p.reqInt("channelType")),
        p.reqStr("userId"),
        p.long("startTime") ?: 0L,
        p.int("pageSize") ?: 20,
        p.strings("subChannelIds"),
      ),
    )
    "searchMessagesByTimeRange" -> BaseChannel.createSearchMessagesByTimeRangeQuery(
      SearchMessagesByTimeRangeQueryParams(
        identifierOf(p.reqObj("channel")),
        p.reqStr("keyword"),
        p.long("startTime") ?: 0L,
        p.long("endTime") ?: System.currentTimeMillis(),
        p.int("pageSize") ?: 20,
      ),
    )
    "searchMessages" -> BaseChannel.createSearchMessagesQuery(
      SearchMessagesQueryParams(
        p.reqStr("keyword"),
        p.long("startTime") ?: 0L,
        p.long("endTime") ?: 0L,
        p.ints("channelTypes")?.map(::channelType),
        p.strings("channelIds"),
        p.strings("subChannelIds"),
        p.strings("senderUserIds"),
        p.strings("messageTypes"),
        p.int("pageSize") ?: 20,
        p.bool("isAscending") ?: false,
      ),
    )
    "messagesReadReceiptUsers" -> BaseChannel.createMessagesReadReceiptUsersQuery(
      MessagesReadReceiptUsersQueryParams(identifierOf(p.reqObj("channel")), p.reqStr("messageId")).apply {
        p.int("pageSize")?.let { pageSize = it }
        p.int("status")?.let { status = NexconnSerializer.enumFrom(MessageReadReceiptStatus::class.java, it, "status") }
        p.bool("isAscending")?.let { isAscending = it }
      },
    )
    "openChannelMessages" -> OpenChannel.createOpenChannelMessagesQuery(
      OpenChannelMessagesQueryParams(
        p.reqStr("channelId"),
        p.bool("isAscending") ?: false,
        p.int("pageSize") ?: 20,
        p.long("startTime") ?: 0L,
      ),
    )
    "groupApplications" -> GroupChannel.createGroupApplicationsQuery(
      GroupApplicationsQueryParams().apply {
        p.int("pageSize")?.let { pageSize = it }
        p.bool("isAscending")?.let { isAscending = it }
        p.ints("directions")?.let { list ->
          directions = list.map { NexconnSerializer.enumFrom(GroupApplicationDirection::class.java, it, "direction") }
        }
        p.ints("status")?.let { list ->
          status = list.map { NexconnSerializer.enumFrom(GroupApplicationStatus::class.java, it, "status") }
        }
      },
    )
    "joinedGroupsByRole" -> GroupChannel.createJoinedGroupsByRoleQuery(
      JoinedGroupsByRoleQueryParams().apply {
        p.int("role")?.let { role = NexconnSerializer.enumFrom(GroupMemberRole::class.java, it, "role") }
        p.int("pageSize")?.let { pageSize = it }
        p.bool("isAscending")?.let { isAscending = it }
      },
    )
    "searchJoinedGroups" -> GroupChannel.createSearchJoinedGroupsQuery(
      SearchJoinedGroupsQueryParams(p.reqStr("groupName")).apply {
        p.int("pageSize")?.let { pageSize = it }
        p.bool("isAscending")?.let { isAscending = it }
      },
    )
    "searchGroupMembers" -> GroupChannel.createSearchGroupMembersQuery(
      SearchGroupMembersQueryParams(p.reqStr("groupId"), p.reqStr("memberName")).apply {
        p.int("pageSize")?.let { pageSize = it }
        p.bool("isAscending")?.let { isAscending = it }
      },
    )
    "groupMembersByRole" -> GroupChannel.createGroupMembersByRoleQuery(
      GroupMembersByRoleQueryParams(p.reqStr("groupId")).apply {
        p.int("role")?.let { role = NexconnSerializer.enumFrom(GroupMemberRole::class.java, it, "role") }
        p.bool("isAscending")?.let { isAscending = it }
        p.int("pageSize")?.let { pageSize = it }
        p.int("filterRobotType")?.let {
          filterRobotType = NexconnSerializer.enumFrom(GroupMemberFilterRobotType::class.java, it, "filterRobotType")
        }
      },
    )
    "friendApplications" -> NCEngine.userModule.createFriendApplicationsQuery(
      FriendApplicationsQueryParams().apply {
        p.int("pageSize")?.let { pageSize = it }
        p.bool("isAscending")?.let { isAscending = it }
        p.ints("applicationTypes")?.let { list ->
          applicationTypes = list.map { NexconnSerializer.enumFrom(FriendApplicationType::class.java, it, "applicationType") }
        }
        p.ints("applicationStatuses")?.let { list ->
          applicationStatuses = list.map { NexconnSerializer.enumFrom(FriendApplicationStatus::class.java, it, "applicationStatus") }
        }
      },
    )
    "subscribe" -> NCEngine.userModule.createSubscribeQuery(
      SubscribeQueryParams(
        NexconnSerializer.enumFrom(SubscribeType::class.java, p.reqInt("subscribeType"), "subscribeType"),
        p.int("pageSize") ?: 20,
      ),
    )
    "taggedChannels" -> Tag.createTaggedChannelsQuery(
      TaggedChannelsQueryParams(p.reqStr("tagId")).apply {
        p.int("pageSize")?.let { pageSize = it }
        p.long("startTime")?.let { startTime = it }
      },
    )
    "untaggedChannels" -> Tag.createUntaggedChannelsQuery(
      UntaggedChannelsQueryParams().apply {
        p.int("pageSize")?.let { pageSize = it }
        p.bool("topPriority")?.let { topPriority = it }
        p.long("startTime")?.let { startTime = it }
      },
    )
    else -> throw invalidArg("Unknown query kind $kind")
  }

  private fun hasMore(query: Any): Boolean? = try {
    query.javaClass.getMethod("getHasMore").invoke(query) as? Boolean
  } catch (_: NoSuchMethodException) {
    null
  }

  private fun registerQueries() {
    on("query.create") { a, c ->
      if (queries.size >= MAX_QUERIES) {
        throw BridgeException("limit_exceeded", "More than $MAX_QUERIES live queries; release unused queries")
      }
      val kind = a.reqStr("kind")
      val query = createQuery(kind, a.obj("params") ?: JSONObject())
      val id = "q${queryCounter.incrementAndGet()}"
      queries[id] = QueryEntry(kind, query, generation.get())
      c.resolve(mapOf("queryId" to id))
    }
    on("query.loadNextPage") { a, c ->
      val id = a.reqStr("queryId")
      val entry = queries[id] ?: throw BridgeException("not_found", "Query $id does not exist (released or session ended)")
      if (entry.generation != generation.get()) {
        queries.remove(id)
        throw BridgeException("stale_session", "Query belongs to a previous session")
      }
      @Suppress("UNCHECKED_CAST")
      val pageable = entry.query as? PageableQuery<Any?> ?: throw BridgeException("internal", "Not a pageable query")
      pageable.loadNextPage(
        object : OperationHandler<Any?> {
          override fun onResult(result: Any?, error: NCError?) {
            if (failed(error)) return c.native(error)
            val out = HashMap<String, Any?>()
            when (result) {
              is PageData<*> -> out["items"] = result.data
              is PageResult<*> -> {
                out["items"] = result.data
                out["totalCount"] = result.totalCount
              }
              is List<*> -> out["items"] = result
              null -> out["items"] = emptyList<Any>()
              else -> out["items"] = listOf(result)
            }
            hasMore(entry.query)?.let { out["hasMore"] = it }
            c.resolve(out)
          }
        },
      )
    }
    on("query.release") { a, c ->
      queries.remove(a.reqStr("queryId"))
      c.resolve(null)
    }
  }
}
