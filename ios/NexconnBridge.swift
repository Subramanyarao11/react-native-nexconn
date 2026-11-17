import Foundation
import NexconnChatSDK
import UIKit

/// One JavaScript invocation; resolves or rejects exactly once.
final class Call {
  let method: String
  private let onResolve: (String) -> Void
  private let onReject: (String) -> Void
  private let lock = NSLock()
  private var done = false

  init(method: String, resolve: @escaping (String) -> Void, reject: @escaping (String) -> Void) {
    self.method = method
    onResolve = resolve
    onReject = reject
  }

  private func claim() -> Bool {
    lock.lock()
    defer { lock.unlock() }
    if done { return false }
    done = true
    return true
  }

  func resolve(_ value: Any?) {
    guard claim() else { return }
    let wrapped: [String: Any] = ["v": NexconnSerializer.encode(value)]
    if let data = try? JSONSerialization.data(withJSONObject: wrapped), let json = String(data: data, encoding: .utf8) {
      onResolve(json)
    } else {
      onReject(Call.errorJSON(method, BridgeError(category: "internal", message: "Failed to serialize result")))
    }
  }

  func reject(_ error: BridgeError) {
    guard claim() else { return }
    onReject(Call.errorJSON(method, error))
  }

  func native(_ error: NCError?, detail: Any? = nil) {
    let message = (error?.message).flatMap { $0.isEmpty ? nil : $0 } ?? "Nexconn SDK error \(error?.code ?? -1)"
    reject(BridgeError(category: "native", message: message, code: error?.code ?? -1, detail: detail))
  }

  static func errorJSON(_ method: String, _ error: BridgeError) -> String {
    var obj: [String: Any] = ["category": error.category, "message": error.message, "method": method]
    if let code = error.code { obj["code"] = code }
    if let detail = error.detail { obj["detail"] = NexconnSerializer.encode(detail) }
    if let data = try? JSONSerialization.data(withJSONObject: obj), let json = String(data: data, encoding: .utf8) {
      return json
    }
    return "{\"category\":\"internal\",\"message\":\"Unserializable error\"}"
  }
}

private func failed(_ error: NCError?) -> Bool {
  guard let error = error else { return false }
  return error.code != 0
}

/// Process-wide bridge to the Nexconn iOS SDK (itself a singleton). Survives
/// React Native reloads; the TurboModule attaches/detaches the emitter.
@objc(NexconnBridge)
public final class NexconnBridge: NSObject {
  @objc public static let shared = NexconnBridge()
  @objc public static let bridgeVersion = "1.0.0"

  private static let handlerId = "react-native-nexconn"
  private static let maxQueries = 64
  private static let maxCachedMessages = 512

  private let stateLock = NSLock()
  private var emitters: [Int: (String) -> Void] = [:]
  private var emitterCounter = 0
  private var initializedAppKey: String?
  private var generation = 0
  private var connecting = false
  private let callbackQueue = DispatchQueue(label: "ai.nexconn.reactnative.callbacks")

  private typealias Loader = (@escaping ([Any], Int?, Bool?, NCError?) -> Void) -> Void
  private struct QueryEntry {
    let loader: Loader
    let generation: Int
  }

  private var queries: [String: QueryEntry] = [:]
  private var queryCounter = 0
  private var messageCache: [Int64: Message] = [:]
  private var messageOrder: [Int64] = []

  private var methods: [String: (Args, Call) throws -> Void] = [:]
  private lazy var forwarder = NexconnEventForwarder { [weak self] type, payload in
    self?.emit(type, payload, opId: nil)
  }

  private override init() {
    super.init()
    NexconnSerializer.onMessage = { [weak self] message in self?.remember(message) }
    registerEngine()
    registerChannels()
    registerMessages()
    registerGroups()
    registerOpenAndCommunity()
    registerUsers()
    registerTranslateAndTags()
    registerQueries()
  }

  // MARK: - Module plumbing

  @objc public func attachEmitter(_ emitter: @escaping (String) -> Void) -> Int {
    stateLock.lock()
    defer { stateLock.unlock() }
    emitterCounter += 1
    emitters = [emitterCounter: emitter] // one live React instance at a time
    return emitterCounter
  }

  @objc public func detachEmitter(_ token: Int) {
    stateLock.lock()
    emitters.removeValue(forKey: token)
    stateLock.unlock()
  }

  /// Forwards the APNs device token to the Nexconn SDK. Call from
  /// `application(_:didRegisterForRemoteNotificationsWithDeviceToken:)`:
  /// `NexconnBridge.registerDeviceToken(deviceToken)`.
  @objc public static func registerDeviceToken(_ deviceToken: Data) {
    NCEngine.setDeviceTokenData(deviceToken)
  }

  @objc public func integrationStatusJSON() -> String {
    "{\"platform\":\"ios\",\"nativeModuleLinked\":true,\"sdkIntegrated\":true}"
  }

  @objc public func invoke(_ method: String, args: String, resolve: @escaping (String) -> Void, reject: @escaping (String) -> Void) {
    let call = Call(method: method, resolve: resolve, reject: reject)
    do {
      guard let handler = methods[method] else { throw BridgeError.unsupported(method) }
      if !method.hasPrefix("engine."), currentAppKey() == nil {
        throw BridgeError(category: "not_initialized", message: "Call initialize() before \(method)")
      }
      var parsed: Args = [:]
      if !args.isEmpty {
        guard let data = args.data(using: .utf8),
              let obj = try JSONSerialization.jsonObject(with: data) as? Args
        else { throw BridgeError.invalid("Malformed arguments") }
        parsed = obj
      }
      try handler(parsed, call)
    } catch let error as BridgeError {
      call.reject(error)
    } catch {
      call.reject(BridgeError(category: "internal", message: error.localizedDescription))
    }
  }

  private func on(_ method: String, _ handler: @escaping (Args, Call) throws -> Void) {
    methods[method] = handler
  }

  private func currentAppKey() -> String? {
    stateLock.lock()
    defer { stateLock.unlock() }
    return initializedAppKey
  }

  private func currentGeneration() -> Int {
    stateLock.lock()
    defer { stateLock.unlock() }
    return generation
  }

  private func emit(_ type: String, _ payload: Any?, opId: String?) {
    stateLock.lock()
    let targets = Array(emitters.values)
    let gen = generation
    stateLock.unlock()
    guard !targets.isEmpty else { return }
    var envelope: [String: Any] = ["type": type, "generation": gen, "payload": NexconnSerializer.encode(payload)]
    if let opId = opId { envelope["opId"] = opId }
    guard let data = try? JSONSerialization.data(withJSONObject: envelope),
          let json = String(data: data, encoding: .utf8) else { return }
    targets.forEach { $0(json) }
  }

  private func emitOp(_ opId: String?, _ type: String, _ payload: Any?) {
    if let opId = opId { emit(type, payload, opId: opId) }
  }

  private func remember(_ message: Message) {
    guard message.clientId > 0 else { return }
    stateLock.lock()
    defer { stateLock.unlock() }
    if messageCache[message.clientId] == nil { messageOrder.append(message.clientId) }
    messageCache[message.clientId] = message
    if messageOrder.count > Self.maxCachedMessages {
      let evicted = messageOrder.removeFirst()
      messageCache.removeValue(forKey: evicted)
    }
  }

  private func cachedMessage(clientId: Int64?, messageId: String?) -> Message? {
    stateLock.lock()
    defer { stateLock.unlock() }
    if let id = clientId, let m = messageCache[id] { return m }
    if let mid = messageId { return messageCache.values.first { $0.messageId == mid } }
    return nil
  }

  private func resetSession() {
    stateLock.lock()
    queries.removeAll()
    messageCache.removeAll()
    messageOrder.removeAll()
    stateLock.unlock()
  }

  // MARK: - Callback adapters

  private func errorHandler(_ c: Call, _ value: @escaping () -> Any? = { nil }) -> ErrorHandler {
    { error in failed(error) ? c.native(error) : c.resolve(value()) }
  }

  private func result<T>(_ c: Call, _ map: @escaping (T?) -> Any? = { $0 }) -> OperationHandler<T> {
    { value, error in failed(error) ? c.native(error) : c.resolve(map(value)) }
  }

  private func boolDone(_ c: Call) -> (Bool, NCError?) -> Void {
    { _, error in failed(error) ? c.native(error) : c.resolve(nil) }
  }

  private func count(_ c: Call) -> (Int, NCError?) -> Void {
    { value, error in failed(error) ? c.native(error) : c.resolve(value) }
  }

  private func detail(_ c: Call) -> ErrorDetailHandler<[String]> {
    { keys, error in failed(error) ? c.native(error, detail: keys) : c.resolve(keys ?? []) }
  }

  /// Runs an async continuation, converting thrown errors into rejections.
  private func guarded(_ c: Call, _ block: () throws -> Void) {
    do {
      try block()
    } catch let error as BridgeError {
      c.reject(error)
    } catch {
      c.reject(BridgeError(category: "internal", message: error.localizedDescription))
    }
  }

  // MARK: - Decoders

  private func channelType(_ raw: Int?) throws -> ChannelType {
    try uintEnumValue(ChannelType.self, raw, "channelType")
  }

  private func channelTypeNumbers(_ a: Args, _ key: String = "channelTypes") throws -> [NSNumber] {
    guard let raw = a.ints(key) else { throw BridgeError.invalid("\(key) is required") }
    return try raw.map { NSNumber(value: try channelType($0).rawValue) }
  }

  private func identifier(_ o: Args) throws -> ChannelIdentifier {
    let type = try channelType(o.int("channelType"))
    let id = try o.reqStr("channelId")
    if type == .community, let sub = o.str("subChannelId"), !sub.isEmpty {
      return CommunitySubChannelIdentifier(channelId: id, subChannelId: sub)
    }
    return ChannelIdentifier(channelType: type, channelId: id)
  }

  private func channel(_ o: Args) throws -> BaseChannel {
    let type = try channelType(o.int("channelType"))
    let id = try o.reqStr("channelId")
    let sub = o.str("subChannelId")
    let made: BaseChannel?
    switch type {
    case .direct: made = DirectChannel(channelId: id)
    case .group: made = GroupChannel(channelId: id)
    case .open: made = OpenChannel(channelId: id)
    case .system: made = SystemChannel(channelId: id)
    case .community:
      if let sub = sub, !sub.isEmpty {
        made = CommunitySubChannel(channelId: id, subChannelId: sub)
      } else {
        made = CommunityChannel(channelId: id)
      }
    @unknown default: made = nil
    }
    guard let result = made else { throw BridgeError.invalid("Cannot create channel \(id)") }
    return result
  }

  private func group(_ a: Args) throws -> GroupChannel {
    let id = try a.reqStr("groupId")
    guard let g = GroupChannel(channelId: id) else { throw BridgeError.invalid("Invalid groupId") }
    return g
  }

  private func openChannel(_ a: Args) throws -> OpenChannel {
    let id = try a.reqStr("channelId")
    guard let o = OpenChannel(channelId: id) else { throw BridgeError.invalid("Invalid channelId") }
    return o
  }

  private func leaveConfig(_ o: Args?) -> LeaveGroupConfig {
    let config = LeaveGroupConfig()
    if let o = o {
      config.deleteMuteStatus = o.bool("deleteMuteStatus") ?? false
      config.deleteAllowedSendersList = o.bool("deleteAllowedSendersList") ?? false
      config.deleteFavorites = o.bool("deleteFavorites") ?? false
    }
    return config
  }

  private func compressOptions(_ o: Args) -> CompressOptions {
    let c = CompressOptions()
    c.imageWidth = o.number("imageWidth")
    c.imageHeight = o.number("imageHeight")
    c.imageQuality = o.number("imageQuality")
    c.maxOriginalImageSize = o.number("maxOriginalImageSize")
    c.thumbnailMaxSize = o.number("thumbnailMaxSize")
    c.thumbnailMinSize = o.number("thumbnailMinSize")
    c.thumbnailQuality = o.number("thumbnailQuality")
    c.sightCompressWidth = o.number("sightCompressWidth")
    c.sightCompressHeight = o.number("sightCompressHeight")
    c.locationImageWidth = o.number("locationImageWidth")
    c.locationImageHeight = o.number("locationImageHeight")
    c.locationImageQuality = o.number("locationImageQuality")
    return c
  }

  private func pushConfig(_ o: Args) -> PushConfig {
    let p = PushConfig()
    if let v = o.bool("disablePushTitle") { p.disablePushTitle = v }
    p.pushTitle = o.str("pushTitle")
    p.pushContent = o.str("pushContent")
    p.pushData = o.str("pushData")
    if let v = o.bool("forceShowDetailContent") { p.forceShowDetailContent = v }
    p.templateId = o.str("templateId")
    if let ios = o.dict("iOSConfig") {
      let c = IOSPushConfig()
      c.threadId = ios.str("threadId")
      c.category = ios.str("category")
      c.apnsCollapseId = ios.str("apnsCollapseId")
      c.richMediaUri = ios.str("richMediaUri")
      c.interruptionLevel = ios.str("interruptionLevel")
      p.iOSConfig = c
    }
    if let and = o.dict("androidConfig") {
      let c = AndroidPushConfig()
      c.notificationId = and.str("notificationId")
      c.channelIdHW = and.str("channelIdHW")
      c.importanceHW = and.str("importanceHW")
      c.hwImageUrl = and.str("hwImageUrl")
      c.categoryHW = and.str("categoryHW")
      c.fcmChannelId = and.str("fcmChannelId")
      c.fcmCollapseKey = and.str("fcmCollapseKey")
      c.fcmImageUrl = and.str("fcmImageUrl")
      p.androidConfig = c
    }
    return p
  }

  private func filePath(_ raw: String?) -> String? {
    guard let raw = raw, !raw.isEmpty else { return nil }
    if raw.hasPrefix("file://"), let url = URL(string: raw) { return url.path }
    return raw
  }

  private func requirePath(_ o: Args) throws -> String {
    guard let path = filePath(o.str("localPath")) else { throw BridgeError.invalid("content.localPath is required") }
    return path
  }

  private func image(at raw: String?) -> UIImage? {
    guard let path = filePath(raw) else { return nil }
    return UIImage(contentsOfFile: path)
  }

  private func placeholderImage() -> UIImage {
    UIGraphicsImageRenderer(size: CGSize(width: 1, height: 1)).image { ctx in
      UIColor.lightGray.setFill()
      ctx.fill(CGRect(x: 0, y: 0, width: 1, height: 1))
    }
  }

  private func applyCommon(_ content: MessageContent, _ o: Args) throws {
    if let extra = o.str("extra") { content.extra = extra }
    if let m = o.dict("mentionedInfo") {
      content.mentionedInfo = MentionedInfo(
        type: try uintEnumValue(MentionedType.self, m.int("type"), "mentionedInfo.type"),
        userIdList: m.strings("userIdList"),
        mentionedContent: m.str("mentionedContent")
      )
    }
    if let u = o.dict("senderUserInfo") {
      let info = UserInfo()
      info.userId = u.str("userId")
      if let t = u.int("userType"), let type = UserType(rawValue: t) { info.userType = type }
      info.name = u.str("name")
      info.portraitUri = u.str("portraitUri")
      info.alias = u.str("alias")
      info.extra = u.str("extra")
      content.senderUserInfo = info
    }
  }

  private func applyMediaFields(_ content: MediaMessageContent, _ o: Args) {
    if let remote = o.str("remoteUrl") { content.remoteUrl = remote }
    if let name = o.str("name") { content.name = name }
  }

  private func buildContent(_ o: Args, resolved: [Message] = []) throws -> MessageContent {
    let type = try o.reqStr("type")
    let built: MessageContent
    switch type {
    case "text":
      built = TextMessage(text: o.str("text") ?? "")
    case "image":
      let m = ImageMessage(imageURI: try requirePath(o))
      if let original = o.bool("original") { m.original = original }
      applyMediaFields(m, o)
      built = m
    case "file":
      let m = FileMessage(localPath: try requirePath(o))
      applyMediaFields(m, o)
      built = m
    case "voice":
      let m = HDVoiceMessage(localPath: try requirePath(o), duration: try o.reqInt("duration"))
      applyMediaFields(m, o)
      built = m
    case "gif":
      let m = GIFMessage(gifURI: try requirePath(o), width: try o.reqInt("width"), height: try o.reqInt("height"))
      applyMediaFields(m, o)
      built = m
    case "video":
      guard let thumbnail = image(at: o.str("thumbnailPath")) else {
        throw BridgeError.invalid("video.thumbnailPath (a local image) is required on iOS")
      }
      let m = ShortVideoMessage(localPath: try requirePath(o), thumbnail: thumbnail, duration: try o.reqInt("duration"))
      applyMediaFields(m, o)
      built = m
    case "location":
      guard let lat = o.double("latitude"), let lng = o.double("longitude") else {
        throw BridgeError.invalid("latitude and longitude are required")
      }
      built = LocationMessage(
        thumbnailImage: image(at: o.str("thumbnailPath")) ?? placeholderImage(),
        latitude: lat,
        longitude: lng,
        poi: o.str("poi") ?? ""
      )
    case "reference":
      let m = ReferenceMessage()
      m.content = o.str("content") ?? ""
      m.referMsgId = try o.reqStr("referMsgId")
      m.referMsgSenderId = o.str("referMsgSenderId") ?? ""
      if let refer = o.dict("referMsg") { m.referMsg = try buildContent(refer) }
      built = m
    case "combine":
      guard !resolved.isEmpty else { throw BridgeError.invalid("combine.messages could not be resolved") }
      built = CombineMessage(
        summaryList: o.strings("summaryList") ?? [],
        nameList: o.strings("nameList") ?? [],
        channelType: try channelType(o.int("channelType")),
        messages: resolved
      )
    case "custom":
      let messageType = try o.reqStr("messageType")
      guard let custom = NexconnCustomRegistry.shared.create(messageType) else {
        throw BridgeError.invalid("Custom message type \(messageType) is not registered")
      }
      let fields = o.dict("fields") ?? [:]
      if let plain = custom as? NexconnCustomSlotBase { plain.fields = fields }
      if let media = custom as? NexconnCustomMediaSlotBase {
        media.fields = fields
        media.localPath = filePath(o.str("localPath"))
        applyMediaFields(media, o)
      }
      built = custom
    default:
      throw BridgeError.invalid("Unsupported content type \(type)")
    }
    try applyCommon(built, o)
    return built
  }

  private func withContent(_ o: Args, _ c: Call, _ block: @escaping (MessageContent) throws -> Void) throws {
    if o.str("type") == "combine" {
      withMessages(o.dicts("messages"), c) { list in
        self.guarded(c) { try block(try self.buildContent(o, resolved: list)) }
      }
    } else {
      try block(try buildContent(o))
    }
  }

  private func withMessage(_ ref: Args, _ c: Call, _ block: @escaping (Message) throws -> Void) {
    let clientId = ref.int64("clientId").flatMap { $0 > 0 ? $0 : nil }
    let messageId = ref.str("messageId").flatMap { $0.isEmpty ? nil : $0 }
    guard clientId != nil || messageId != nil else {
      return c.reject(BridgeError.invalid("message needs clientId or messageId"))
    }
    if let cached = cachedMessage(clientId: clientId, messageId: messageId) {
      return guarded(c) { try block(cached) }
    }
    let params = clientId.map { GetMessageByIdParams(messageClientId: $0) } ?? GetMessageByIdParams(messageId: messageId ?? "")
    BaseChannel.getMessageById(params: params) { message, error in
      if failed(error) { return c.native(error) }
      guard let message = message else { return c.reject(BridgeError(category: "not_found", message: "Message not found")) }
      self.remember(message)
      self.guarded(c) { try block(message) }
    }
  }

  private func withMessages(_ refs: [Args], _ c: Call, _ block: @escaping ([Message]) throws -> Void) {
    var out: [Message] = []
    func next(_ index: Int) {
      if index >= refs.count { return guarded(c) { try block(out) } }
      withMessage(refs[index], c) { m in
        out.append(m)
        next(index + 1)
      }
    }
    next(0)
  }

  // MARK: - engine.*

  private func registerHandlers() {
    let id = Self.handlerId
    NCEngine.addConnectionStatusHandler(identifier: id, handler: forwarder)
    NCEngine.addDatabaseStatusHandler(identifier: id, handler: forwarder)
    NCEngine.addMessageHandler(identifier: id, handler: forwarder)
    NCEngine.addChannelHandler(identifier: id, handler: forwarder)
    NCEngine.addGroupChannelHandler(identifier: id, handler: forwarder)
    NCEngine.addOpenChannelHandler(identifier: id, handler: forwarder)
    NCEngine.addTagHandler(identifier: id, handler: forwarder)
    NCEngine.addTranslateHandler(identifier: id, handler: forwarder)
    NCEngine.addUserHandler(identifier: id, handler: forwarder)
    NCEngine.addUserSettingsHandler(identifier: id, handler: forwarder)
  }

  private func registerEngine() {
    on("engine.getCapabilities") { [unowned self] _, c in
      c.resolve([
        "platform": "ios",
        "sdkVersion": NCEngine.getVersion(),
        "bridgeVersion": Self.bridgeVersion,
        "methods": self.methods.keys.sorted(),
      ])
    }
    on("engine.initialize") { [unowned self] a, c in
      let appKey = try a.reqStr("appKey")
      if let existing = self.currentAppKey() {
        guard existing == appKey else {
          throw BridgeError(category: "already_initialized", message: "SDK already initialized with a different App Key")
        }
        self.registerHandlers()
        return c.resolve(["alreadyInitialized": true, "platform": "ios", "sdkVersion": NCEngine.getVersion()])
      }
      let params = InitParams(appKey: appKey)
      if let raw = a.int("areaCode") { params.areaCode = try enumValue(AreaCode.self, raw, "areaCode") }
      if let navi = a.str("naviServer") { params.naviServer = navi }
      if let raw = a.int("logLevel") { params.logLevel = try enumValue(LogLevel.self, raw, "logLevel") }
      if let v = a.bool("enableSyncEmptyTopConversation") { params.enableSyncEmptyTopConversation = v }
      if let v = a.bool("forceKeepAlive") { params.forceKeepAlive = v }
      if let v = a.bool("crashMonitorEnabled") { params.crashMonitorEnabled = v }
      if let o = a.dict("compressOptions") { params.compressOptions = self.compressOptions(o) }
      // Deliver SDK callbacks off the main thread; serialization happens there.
      params.callbackQueue = self.callbackQueue
      NCEngine.initialize(params)
      // Handlers are registered before any connect so offline messages are not missed.
      self.registerHandlers()
      self.stateLock.lock()
      self.initializedAppKey = appKey
      self.stateLock.unlock()
      c.resolve(["alreadyInitialized": false, "platform": "ios", "sdkVersion": NCEngine.getVersion()])
    }
    on("engine.connect") { [unowned self] a, c in
      guard self.currentAppKey() != nil else {
        throw BridgeError(category: "not_initialized", message: "Call initialize() before connect()")
      }
      let token = try a.reqStr("token")
      self.stateLock.lock()
      if self.connecting {
        self.stateLock.unlock()
        throw BridgeError(category: "busy", message: "A connect() call is already in progress")
      }
      self.connecting = true
      self.generation += 1
      let gen = self.generation
      self.stateLock.unlock()
      self.resetSession()
      let params = ConnectParams(token: token)
      if let t = a.int("timeout") { params.timeout = Int32(t) }
      if let v = a.bool("reconnectKickEnable") { params.reconnectKickEnable = v }
      NCEngine.connect(
        params: params,
        databaseOpenedHandler: { isRecreated, error in
          self.emit("Engine.onDatabaseOpened", ["isRecreated": isRecreated, "error": error as Any], opId: nil)
        },
        completionHandler: { userId, error in
          self.stateLock.lock()
          self.connecting = false
          self.stateLock.unlock()
          if failed(error) { return c.native(error) }
          c.resolve(["userId": userId ?? "", "generation": gen])
        }
      )
    }
    on("engine.disconnect") { [unowned self] a, c in
      self.stateLock.lock()
      self.generation += 1
      let gen = self.generation
      self.stateLock.unlock()
      self.resetSession()
      NCEngine.disconnect(disablePush: a.bool("disablePush") ?? false)
      c.resolve(["generation": gen])
    }
    on("engine.getConnectionStatus") { _, c in c.resolve(NCEngine.getConnectionStatus().rawValue) }
    on("engine.getCurrentUserId") { _, c in c.resolve(NCEngine.getCurrentUserId()) }
    on("engine.getVersion") { _, c in c.resolve(NCEngine.getVersion()) }
    on("engine.getServerTimeDelta") { _, c in c.resolve(NCEngine.getServerTimeDelta()) }
    on("engine.getAppSettings") { _, c in c.resolve(NCEngine.getAppSettings()) }
    on("engine.getCompressOptions") { _, c in c.resolve(NCEngine.getCompressOptions()) }
    on("engine.registerCustomMessages") { [unowned self] a, c in
      guard self.currentAppKey() != nil else {
        throw BridgeError(category: "not_initialized", message: "Call initialize() first")
      }
      var classes: [AnyClass] = []
      for t in a.dicts("types") {
        let def = NexconnCustomRegistry.Definition(
          messageType: try t.reqStr("messageType"),
          persistentFlag: t.int("persistentFlag") ?? 0,
          searchableFields: t.strings("searchableFields") ?? [],
          isMedia: t.bool("isMedia") ?? false
        )
        if let cls = try NexconnCustomRegistry.shared.register(def) { classes.append(cls) }
      }
      if !classes.isEmpty { NCEngine.registerCustomMessages(classes) }
      c.resolve(nil)
    }
    on("engine.setNoDisturbTime") { [unowned self] a, c in
      let params = NoDisturbTimeParams(startTime: try a.reqStr("startTime"), spanMinutes: Int32(try a.reqInt("spanMinutes")))
      params.level = try enumValue(NoDisturbTimeLevel.self, a.int("level") ?? 5, "level")
      params.timezone = a.str("timezone")
      NCEngine.setNoDisturbTime(params: params, completion: self.errorHandler(c))
    }
    on("engine.getNoDisturbTime") { _, c in
      NCEngine.getNoDisturbTime { info, error in failed(error) ? c.native(error) : c.resolve(info) }
    }
    on("engine.removeNoDisturbTime") { [unowned self] _, c in NCEngine.removeNoDisturbTime(completion: self.errorHandler(c)) }
    on("engine.setDeviceToken") { a, c in
      let hex = try a.reqStr("hexToken")
      guard hex.count % 2 == 0 else { throw BridgeError.invalid("hexToken must have an even length") }
      var data = Data(capacity: hex.count / 2)
      var index = hex.startIndex
      while index < hex.endIndex {
        let next = hex.index(index, offsetBy: 2)
        guard let byte = UInt8(hex[index..<next], radix: 16) else { throw BridgeError.invalid("hexToken is not hexadecimal") }
        data.append(byte)
        index = next
      }
      NCEngine.setDeviceTokenData(data)
      c.resolve(nil)
    }
    // engine.setPushContentShowStatus / getPushContentShowStatus: Android only.
  }

  // MARK: - channel.*

  private func registerChannels() {
    on("channel.getChannels") { [unowned self] a, c in
      let ids = try a.dicts("channels").map { try self.identifier($0) }
      BaseChannel.getChannels(identifiers: ids, completion: self.result(c) as OperationHandler<[BaseChannel]>)
    }
    on("channel.reload") { [unowned self] a, c in
      try self.channel(a.reqDict("channel")).reload { channel, error in
        if let ncError = error as? NCError, failed(ncError) { return c.native(ncError) }
        if let error = error { return c.reject(BridgeError(category: "native", message: error.localizedDescription, code: (error as NSError).code)) }
        c.resolve(channel)
      }
    }
    on("channel.getUnreadChannels") { [unowned self] a, c in
      BaseChannel.getUnreadChannels(channelTypes: try self.channelTypeNumbers(a), completion: self.result(c) as OperationHandler<[BaseChannel]>)
    }
    on("channel.getPinnedChannels") { [unowned self] a, c in
      BaseChannel.getPinnedChannels(channelTypes: try self.channelTypeNumbers(a), completion: self.result(c) as OperationHandler<[BaseChannel]>)
    }
    on("channel.search") { [unowned self] a, c in
      let params = SearchChannelsParams()
      params.keyword = try a.reqStr("keyword")
      params.channelTypes = try self.channelTypeNumbers(a)
      params.messageTypes = a.strings("messageTypes") ?? []
      BaseChannel.searchChannels(params: params, completion: self.result(c) as OperationHandler<[SearchChannelResult]>)
    }
    on("channel.syncRemoteChannels") { [unowned self] _, c in BaseChannel.syncRemoteChannels(completion: self.errorHandler(c)) }
    on("channel.deleteChannels") { [unowned self] a, c in
      let ids = try a.dicts("channels").map { try self.identifier($0) }
      BaseChannel.deleteChannels(identifiers: ids, completion: self.errorHandler(c))
    }
    on("channel.delete") { [unowned self] a, c in try self.channel(a.reqDict("channel")).delete(completion: self.boolDone(c)) }
    on("channel.pin") { [unowned self] a, c in
      try self.channel(a.reqDict("channel"))
        .pin(params: PinParams(updateOperationTime: a.bool("updateOperationTime") ?? false), completion: self.errorHandler(c))
    }
    on("channel.unpin") { [unowned self] a, c in try self.channel(a.reqDict("channel")).unpin(completion: self.errorHandler(c)) }
    on("channel.setNoDisturbLevel") { [unowned self] a, c in
      let level = try enumValue(ChannelNoDisturbLevel.self, a.int("level"), "level")
      try self.channel(a.reqDict("channel")).setNoDisturbLevel(level, completion: self.errorHandler(c))
    }
    on("channel.setChannelTypeNoDisturbLevel") { [unowned self] a, c in
      let params = ChannelTypeNoDisturbLevelParams()
      params.channelType = try self.channelType(a.int("channelType"))
      params.level = try enumValue(ChannelNoDisturbLevel.self, a.int("level"), "level")
      BaseChannel.setChannelTypeNoDisturbLevel(params: params, completion: self.errorHandler(c))
    }
    on("channel.getChannelTypeNoDisturbLevel") { [unowned self] a, c in
      BaseChannel.getChannelTypeNoDisturbLevel(channelType: try self.channelType(a.int("channelType"))) { level, error in
        failed(error) ? c.native(error) : c.resolve(level.rawValue)
      }
    }
    on("channel.clearUnreadCount") { [unowned self] a, c in
      try self.channel(a.reqDict("channel")).clearUnreadCount(completion: self.boolDone(c))
    }
    on("channel.getTotalUnreadCount") { [unowned self] _, c in BaseChannel.getTotalUnreadCount(completion: self.count(c)) }
    on("channel.getUnreadCountByNoDisturbLevel") { [unowned self] a, c in
      let params = ChannelsUnreadCountParams()
      params.channelTypes = try self.channelTypeNumbers(a)
      params.levels = try (a.ints("levels") ?? []).map {
        NSNumber(value: try enumValue(ChannelNoDisturbLevel.self, $0, "level").rawValue)
      }
      BaseChannel.getChannelsUnreadCountByNoDisturbLevel(params: params, completion: self.count(c))
    }
    on("channel.getFirstUnreadMessage") { [unowned self] a, c in
      try self.channel(a.reqDict("channel")).getFirstUnreadMessage(completion: self.result(c) as OperationHandler<Message>)
    }
    on("channel.getUnreadMentionedMessages") { [unowned self] a, c in
      try self.channel(a.reqDict("channel")).getUnreadMentionedMessages(completion: self.result(c) as OperationHandler<[Message]>)
    }
    on("channel.getTags") { [unowned self] a, c in
      try self.channel(a.reqDict("channel")).getTags { tags, error in failed(error) ? c.native(error) : c.resolve(tags ?? []) }
    }
    on("channel.deleteTags") { [unowned self] a, c in
      try self.channel(a.reqDict("channel")).deleteTags(try a.reqStrings("tagIds"), completion: self.errorHandler(c))
    }
    on("channel.saveDraft") { [unowned self] a, c in
      try self.channel(a.reqDict("channel")).saveDraft(a.str("draft") ?? "", completion: self.boolDone(c))
    }
    on("channel.clearDraft") { [unowned self] a, c in try self.channel(a.reqDict("channel")).clearDraft(completion: self.boolDone(c)) }
    on("channel.saveEditedMessageDraft") { [unowned self] a, c in
      let draft = EditedMessageDraft(messageId: try a.reqStr("messageId"), content: a.str("content"))
      try self.channel(a.reqDict("channel")).saveEditedMessageDraft(draft, completion: self.boolDone(c))
    }
    on("channel.clearEditedMessageDraft") { [unowned self] a, c in
      try self.channel(a.reqDict("channel")).clearEditedMessageDraft(completion: self.boolDone(c))
    }
    on("channel.setAttributes") { [unowned self] a, c in
      try self.channel(a.reqDict("channel")).setAttributes(a.stringMap("attributes") ?? [:], completion: self.errorHandler(c))
    }
    on("channel.removeAttributes") { [unowned self] a, c in
      try self.channel(a.reqDict("channel")).removeAttributes(try a.reqStrings("keys"), completion: self.errorHandler(c))
    }
    on("channel.sendTypingStatus") { [unowned self] a, c in
      guard let direct = try self.channel(a.reqDict("channel")) as? DirectChannel else {
        throw BridgeError.invalid("Typing status is only supported for direct channels")
      }
      direct.sendTypingStatus(typingMessageType: try a.reqStr("typingMessageType"))
      c.resolve(nil)
    }
    // channel.syncReadStatus: Android only.
  }

  // MARK: - message.*

  private func applySend(_ p: SendMessageParams, _ o: Args?) {
    guard let o = o else { return }
    if let push = o.dict("pushConfig") { p.pushConfig = pushConfig(push) }
    if let ids = o.strings("directedUserIds") { p.directedUserIds = ids }
    if let v = o.bool("disableNotification") { p.disableNotification = v }
    if let v = o.bool("disableUpdateLastMessage") { p.disableUpdateLastMessage = v }
    if let m = o.stringMap("metadata") { p.metadata = m }
    if let v = o.bool("needReceipt") { p.needReceipt = v }
    if let v = o.int("expiry") { p.expiry = v }
  }

  private func applySendMedia(_ p: SendMediaMessageParams, _ o: Args?) {
    guard let o = o else { return }
    if let push = o.dict("pushConfig") { p.pushConfig = pushConfig(push) }
    if let ids = o.strings("directedUserIds") { p.directedUserIds = ids }
    if let v = o.bool("disableNotification") { p.disableNotification = v }
    if let v = o.bool("disableUpdateLastMessage") { p.disableUpdateLastMessage = v }
    if let m = o.stringMap("metadata") { p.metadata = m }
    if let v = o.bool("needReceipt") { p.needReceipt = v }
    if let v = o.int("expiry") { p.expiry = v }
  }

  private func registerMessages() {
    on("message.send") { [unowned self] a, c in
      let ch = try self.channel(a.reqDict("channel"))
      let opId = a.str("opId")
      let options = a.dict("options")
      try self.withContent(try a.reqDict("content"), c) { content in
        let params = SendMessageParams(content: content)
        self.applySend(params, options)
        ch.sendMessage(
          params: params,
          attachedHandler: { message in
            guard let message = message else { return }
            self.remember(message)
            self.emitOp(opId, "op.attached", ["message": message])
          },
          completionHandler: { message, error in
            failed(error) ? c.native(error, detail: message) : c.resolve(message)
          }
        )
      }
    }
    on("message.sendMedia") { [unowned self] a, c in
      let ch = try self.channel(a.reqDict("channel"))
      let opId = a.str("opId")
      let options = a.dict("options")
      try self.withContent(try a.reqDict("content"), c) { content in
        guard let media = content as? MediaMessageContent else {
          throw BridgeError.invalid("sendMedia requires media content")
        }
        let params = SendMediaMessageParams(content: media)
        self.applySendMedia(params, options)
        ch.sendMediaMessage(
          params: params,
          attachedHandler: { message in
            guard let message = message else { return }
            self.remember(message)
            self.emitOp(opId, "op.attached", ["message": message])
          },
          progressHandler: { progress, message in
            self.emitOp(opId, "op.progress", ["progress": progress, "message": message as Any])
          },
          completionHandler: { message, error in
            failed(error) ? c.native(error, detail: message) : c.resolve(message)
          },
          cancelHandler: { message in
            c.reject(BridgeError(category: "canceled", message: "Media message upload was canceled", detail: message))
          }
        )
      }
    }
    on("message.cancelSendMedia") { [unowned self] a, c in
      let ref = try a.reqDict("message")
      if let clientId = ref.int64("clientId"), clientId > 0 {
        BaseChannel.cancelSendMediaMessage(clientId: clientId, completion: self.errorHandler(c))
      } else {
        self.withMessage(ref, c) { m in BaseChannel.cancelSendMediaMessage(clientId: m.clientId, completion: self.errorHandler(c)) }
      }
    }
    on("message.insert") { [unowned self] a, c in
      let ch = try self.channel(a.reqDict("channel"))
      let items = try a.dicts("items").map { item -> InsertMessageParams in
        let p = InsertMessageParams(content: try self.buildContent(item.reqDict("content")))
        p.direction = try uintEnumValue(MessageDirection.self, item.int("direction"), "direction")
        p.senderUserId = item.str("senderUserId")
        p.sentTime = item.int64("sentTime") ?? Int64(Date().timeIntervalSince1970 * 1000)
        p.sentStatus = try uintEnumValue(SentStatus.self, item.int("sentStatus") ?? 30, "sentStatus")
        return p
      }
      ch.insertMessages(params: items, completion: self.boolDone(c))
    }
    on("message.update") { [unowned self] a, c in
      let params = UpdateMessageParams(messageId: try a.reqStr("messageId"), content: try self.buildContent(a.reqDict("content")))
      BaseChannel.updateMessage(params: params, completion: self.result(c) as OperationHandler<Message>)
    }
    on("message.deleteForMe") { [unowned self] a, c in
      let ch = try self.channel(a.reqDict("channel"))
      self.withMessages(a.dicts("messages"), c) { list in ch.deleteMessagesForMe(list, completion: self.errorHandler(c)) }
    }
    on("message.deleteForAll") { [unowned self] a, c in
      let ch = try self.channel(a.reqDict("channel"))
      self.withMessage(try a.reqDict("message"), c) { m in
        ch.deleteMessageForAll(m, completion: self.result(c) as OperationHandler<Message>)
      }
    }
    on("message.deleteForMeByTimestamp") { [unowned self] a, c in
      guard let ts = a.int64("timestamp") else { throw BridgeError.invalid("timestamp is required") }
      let params = DeleteMessagesForMeByTimestampParams(
        timestamp: ts,
        policy: try enumValue(MessageOperationPolicy.self, a.int("policy"), "policy")
      )
      try self.channel(a.reqDict("channel")).deleteMessagesForMeByTimestamp(params: params, completion: self.errorHandler(c))
    }
    on("message.deleteLocal") { [unowned self] a, c in
      self.withMessages(a.dicts("messages"), c) { list in
        BaseChannel.deleteLocalMessages(messageClientIds: list.map { NSNumber(value: $0.clientId) }) { _, error in
          failed(error) ? c.native(error) : c.resolve(nil)
        }
      }
    }
    on("message.getAroundTime") { [unowned self] a, c in
      guard let sentTime = a.int64("sentTime") else { throw BridgeError.invalid("sentTime is required") }
      let params = GetMessagesAroundTimeParams(sentTime: sentTime)
      params.beforeCount = a.int("beforeCount") ?? 10
      params.afterCount = a.int("afterCount") ?? 10
      try self.channel(a.reqDict("channel")).getMessagesAroundTime(params: params, completion: self.result(c) as OperationHandler<[Message]>)
    }
    on("message.getById") { [unowned self] a, c in self.withMessage(try a.reqDict("message"), c) { m in c.resolve(m) } }
    on("message.sendReadReceiptResponse") { [unowned self] a, c in
      try self.channel(a.reqDict("channel")).sendReadReceiptResponse(messageIds: try a.reqStrings("messageIds"), completion: self.errorHandler(c))
    }
    on("message.getReadReceiptInfo") { [unowned self] a, c in
      try self.channel(a.reqDict("channel"))
        .getMessageReadReceiptInfo(messageIds: try a.reqStrings("messageIds"), completion: self.result(c) as OperationHandler<[MessageReadReceiptInfo]>)
    }
    on("message.getReadReceiptInfoByIdentifiers") { [unowned self] a, c in
      let ids = try a.dicts("identifiers").map {
        MessageIdentifier(channelIdentifier: try self.identifier($0.reqDict("channel")), messageId: try $0.reqStr("messageId"))
      }
      BaseChannel.getMessageReadReceiptInfoByIdentifiers(ids, completion: self.result(c) as OperationHandler<[MessageReadReceiptInfo]>)
    }
    on("message.getReadReceiptByUsers") { [unowned self] a, c in
      let params = GetMessagesReadReceiptByUsersParams()
      params.messageId = try a.reqStr("messageId")
      params.userIds = try a.reqStrings("userIds")
      try self.channel(a.reqDict("channel"))
        .getMessagesReadReceiptByUsers(params: params, completion: self.result(c) as OperationHandler<[MessageReadReceiptUser]>)
    }
    on("message.setMetadata") { [unowned self] a, c in
      guard let metadata = a.stringMap("metadata") else { throw BridgeError.invalid("metadata is required") }
      self.withMessage(try a.reqDict("message"), c) { m in m.setMetadata(metadata, completion: self.errorHandler(c)) }
    }
    on("message.deleteMetadata") { [unowned self] a, c in
      let keys = try a.reqStrings("keys")
      self.withMessage(try a.reqDict("message"), c) { m in m.deleteMetadata(keys: keys, completion: self.errorHandler(c)) }
    }
    on("message.setReceivedStatus") { [unowned self] a, c in
      let info = MessageReceivedStatusInfo(
        isRead: a.bool("isRead") ?? false,
        isListened: a.bool("isListened") ?? false,
        isDownloaded: a.bool("isDownloaded") ?? false,
        isRetrieved: a.bool("isRetrieved") ?? false
      )
      self.withMessage(try a.reqDict("message"), c) { m in m.setReceivedStatusInfo(info, completion: self.boolDone(c)) }
    }
    on("message.requestSpeechToText") { [unowned self] a, c in
      self.withMessage(try a.reqDict("message"), c) { m in m.requestSpeechToText(completion: self.errorHandler(c)) }
    }
    on("message.setSpeechToTextVisible") { [unowned self] a, c in
      let visible = a.bool("visible") ?? true
      self.withMessage(try a.reqDict("message"), c) { m in m.setSpeechToTextVisible(visible, completion: self.errorHandler(c)) }
    }
    on("message.requestStream") { [unowned self] a, c in
      self.withMessage(try a.reqDict("message"), c) { m in m.requestStreamMessage(completion: self.errorHandler(c)) }
    }
    on("message.downloadMedia") { [unowned self] a, c in
      let opId = a.str("opId")
      self.withMessage(try a.reqDict("message"), c) { m in
        m.downloadMedia(
          progressHandler: { progress in self.emitOp(opId, "op.progress", ["progress": progress]) },
          successHandler: { path in c.resolve(["localPath": path, "message": m]) },
          errorHandler: { error in c.native(error, detail: m) },
          cancelHandler: { c.reject(BridgeError(category: "canceled", message: "Media download was canceled", detail: m)) }
        )
      }
    }
    on("message.pauseDownload") { [unowned self] a, c in
      self.withMessage(try a.reqDict("message"), c) { m in m.pauseDownloadingMedia(completion: self.errorHandler(c)) }
    }
    on("message.cancelDownload") { [unowned self] a, c in
      self.withMessage(try a.reqDict("message"), c) { m in m.cancelDownloadingMedia(completion: self.errorHandler(c)) }
    }
    on("message.getMediaDownloadInfo") { a, c in
      c.resolve(BaseChannel.getMediaDownloadInfo(mediaUrl: try a.reqStr("url")))
    }
    on("message.downloadMediaUrl") { [unowned self] a, c in
      let opId = a.str("opId")
      BaseChannel.downloadMediaUrl(
        try a.reqStr("url"),
        fileName: try a.reqStr("fileName"),
        progressHandler: { progress in self.emitOp(opId, "op.progress", ["progress": progress]) },
        completionHandler: { path, error in failed(error) ? c.native(error) : c.resolve(path) },
        cancelHandler: { c.reject(BridgeError(category: "canceled", message: "Media download was canceled")) }
      )
    }
    on("message.cancelDownloadMediaUrl") { [unowned self] a, c in
      BaseChannel.cancelDownloadMediaUrl(try a.reqStr("url"), completion: self.errorHandler(c))
    }
    on("message.refreshReference") { [unowned self] a, c in
      let params = RefreshReferenceMessageParams(channelIdentifier: try self.identifier(a.reqDict("channel")), messageIds: try a.reqStrings("messageIds"))
      var local: [MessageResult] = []
      BaseChannel.refreshReferenceMessage(
        params: params,
        localMessageHandler: { results in local = results },
        remoteMessageHandler: { results in c.resolve(["local": local, "remote": results]) },
        errorHandler: { error in c.native(error, detail: ["local": local]) }
      )
    }
  }

  // MARK: - group.*

  private func registerGroups() {
    on("group.create") { a, c in
      let params = CreateGroupParams(groupId: try a.reqStr("groupId"), groupName: try a.reqStr("groupName"))
      params.inviteeUserIds = a.strings("inviteeUserIds") ?? []
      params.avatarUrl = a.str("avatarUrl")
      params.introduction = a.str("introduction")
      params.notice = a.str("notice")
      params.extProfile = a.stringMap("extProfile")
      if let v = a.int("joinPermission") { params.joinPermission = try enumValue(GroupJoinPermission.self, v, "joinPermission") }
      if let v = a.int("removeMemberPermission") { params.removeMemberPermission = try enumValue(GroupOperationPermission.self, v, "removeMemberPermission") }
      if let v = a.int("invitePermission") { params.invitePermission = try enumValue(GroupOperationPermission.self, v, "invitePermission") }
      if let v = a.int("inviteHandlePermission") { params.inviteHandlePermission = try enumValue(GroupInviteHandlePermission.self, v, "inviteHandlePermission") }
      if let v = a.int("groupInfoEditPermission") { params.groupInfoEditPermission = try enumValue(GroupOperationPermission.self, v, "groupInfoEditPermission") }
      if let v = a.int("memberInfoEditPermission") { params.memberInfoEditPermission = try enumValue(GroupMemberInfoEditPermission.self, v, "memberInfoEditPermission") }
      GroupChannel.createGroup(params: params) { processCode, errorKeys, error in
        if failed(error) { return c.native(error, detail: ["errorKeys": errorKeys ?? []]) }
        c.resolve(["processCode": processCode, "errorKeys": errorKeys ?? []])
      }
    }
    on("group.getGroupsInfo") { [unowned self] a, c in
      GroupChannel.getGroupsInfo(groupIds: try a.reqStrings("groupIds"), completion: self.result(c) as OperationHandler<[GroupInfo]>)
    }
    on("group.getJoinedGroups") { [unowned self] a, c in
      GroupChannel.getJoinedGroups(groupIds: try a.reqStrings("groupIds"), completion: self.result(c) as OperationHandler<[GroupInfo]>)
    }
    on("group.updateInfo") { [unowned self] a, c in
      let params = UpdateGroupInfoParams()
      params.groupName = a.str("groupName")
      params.avatarUrl = a.str("avatarUrl")
      params.introduction = a.str("introduction")
      params.notice = a.str("notice")
      params.extProfile = a.stringMap("extProfile")
      params.joinPermissionValue = a.number("joinPermission")
      params.removeMemberPermissionValue = a.number("removeMemberPermission")
      params.invitePermissionValue = a.number("invitePermission")
      params.inviteHandlePermissionValue = a.number("inviteHandlePermission")
      params.groupInfoEditPermissionValue = a.number("groupInfoEditPermission")
      params.memberInfoEditPermissionValue = a.number("memberInfoEditPermission")
      try self.group(a).updateInfo(params: params, completion: self.detail(c))
    }
    on("group.join") { [unowned self] a, c in try self.group(a).join(completion: self.count(c)) }
    on("group.leave") { [unowned self] a, c in try self.group(a).leave(config: self.leaveConfig(a.dict("config")), completion: self.errorHandler(c)) }
    on("group.dismiss") { [unowned self] a, c in try self.group(a).dismiss(completion: self.errorHandler(c)) }
    on("group.transferOwner") { [unowned self] a, c in
      let params = TransferGroupOwnerParams()
      params.newOwnerId = try a.reqStr("newOwnerId")
      params.leaveAfterTransfer = a.bool("leaveAfterTransfer") ?? false
      if let config = a.dict("config") { params.config = self.leaveConfig(config) }
      try self.group(a).transferOwner(params: params, completion: self.errorHandler(c))
    }
    on("group.inviteUsers") { [unowned self] a, c in try self.group(a).inviteUsers(userIds: try a.reqStrings("userIds"), completion: self.count(c)) }
    on("group.kickMembers") { [unowned self] a, c in
      let params = KickGroupMembersParams()
      params.userIds = try a.reqStrings("userIds")
      if let config = a.dict("config") { params.config = self.leaveConfig(config) }
      try self.group(a).kickMembers(params: params, completion: self.errorHandler(c))
    }
    on("group.addAdmins") { [unowned self] a, c in try self.group(a).addAdmins(userIds: try a.reqStrings("userIds"), completion: self.errorHandler(c)) }
    on("group.removeAdmins") { [unowned self] a, c in try self.group(a).removeAdmins(userIds: try a.reqStrings("userIds"), completion: self.errorHandler(c)) }
    on("group.acceptInvite") { [unowned self] a, c in try self.group(a).acceptInvite(inviterId: try a.reqStr("inviterId"), completion: self.errorHandler(c)) }
    on("group.refuseInvite") { [unowned self] a, c in
      let params = RefuseGroupInviteParams()
      params.inviterId = try a.reqStr("inviterId")
      params.reason = a.str("reason")
      try self.group(a).refuseInvite(params: params, completion: self.errorHandler(c))
    }
    on("group.acceptApplication") { [unowned self] a, c in
      let params = AcceptGroupApplicationParams()
      params.applicantId = try a.reqStr("applicantId")
      params.inviterId = a.str("inviterId")
      try self.group(a).acceptApplication(params: params, completion: self.count(c))
    }
    on("group.refuseApplication") { [unowned self] a, c in
      let params = RefuseGroupApplicationParams()
      params.applicantId = try a.reqStr("applicantId")
      params.inviterId = a.str("inviterId")
      params.reason = a.str("reason")
      try self.group(a).refuseApplication(params: params, completion: self.errorHandler(c))
    }
    on("group.getMembers") { [unowned self] a, c in
      try self.group(a).getMembers(userIds: try a.reqStrings("userIds"), completion: self.result(c) as OperationHandler<[GroupMemberInfo]>)
    }
    on("group.setMemberInfo") { [unowned self] a, c in
      let params = SetGroupMemberInfoParams()
      params.userId = try a.reqStr("userId")
      params.nickname = a.str("nickname")
      params.extra = a.str("extra")
      try self.group(a).setMemberInfo(params: params, completion: self.detail(c))
    }
    on("group.addFavorites") { [unowned self] a, c in try self.group(a).addFavorites(userIds: try a.reqStrings("userIds"), completion: self.errorHandler(c)) }
    on("group.removeFavorites") { [unowned self] a, c in try self.group(a).removeFavorites(userIds: try a.reqStrings("userIds"), completion: self.errorHandler(c)) }
    on("group.getFavorites") { [unowned self] a, c in
      try self.group(a).getFavorites(completion: self.result(c) as OperationHandler<[GroupFavoriteInfo]>)
    }
    // group.addManagers / removeManagers: Android only.
  }

  // MARK: - open.* and community.*

  private func registerOpenAndCommunity() {
    on("open.enter") { [unowned self] a, c in
      let params = EnterOpenChannelParams()
      if let count = a.int("messageCount") { params.messageCount = count }
      params.extra = a.str("extra")
      try self.openChannel(a).enterChannel(params: params, completion: self.result(c) as OperationHandler<OpenChannelEnterResponseInfo>)
    }
    on("open.exit") { [unowned self] a, c in try self.openChannel(a).exitChannel(extra: a.str("extra"), completion: self.errorHandler(c)) }
    on("open.getMetadata") { [unowned self] a, c in
      try self.openChannel(a).getMetadata(key: try a.reqStr("key"), completion: self.result(c) as OperationHandler<[String: String]>)
    }
    on("open.setMetadata") { [unowned self] a, c in
      guard let metadata = a.stringMap("metadata") else { throw BridgeError.invalid("metadata is required") }
      let params = OpenChannelSetMetadataParams(
        metadata: metadata,
        overwrite: a.bool("overwrite") ?? false,
        deleteWhenLeft: a.bool("deleteWhenLeft") ?? false
      )
      try self.openChannel(a).setMetadata(params: params, completion: self.detail(c))
    }
    on("open.deleteMetadata") { [unowned self] a, c in
      let params = OpenChannelDeleteMetadataParams(keys: try a.reqStrings("keys"), isForce: a.bool("force") ?? false)
      try self.openChannel(a).deleteMetadata(params: params, completion: self.detail(c))
    }

    on("community.getSubChannels") { [unowned self] a, c in
      guard let community = CommunityChannel(channelId: try a.reqStr("channelId")) else { throw BridgeError.invalid("Invalid channelId") }
      community.getSubChannels(completion: self.result(c) as OperationHandler<[CommunitySubChannel]>)
    }
    on("community.getUnreadCount") { [unowned self] a, c in
      guard let community = CommunityChannel(channelId: try a.reqStr("channelId")) else { throw BridgeError.invalid("Invalid channelId") }
      community.getUnreadCount(completion: self.count(c))
    }
    on("community.getChannelsUnreadInfo") { [unowned self] a, c in
      CommunityChannel.getChannelsUnreadInfo(channelIds: try a.reqStrings("channelIds"), completion: self.result(c) as OperationHandler<[CommunityUnreadInfo]>)
    }
    on("community.getTotalUnreadCount") { [unowned self] _, c in CommunityChannel.getTotalUnreadCount(completion: self.count(c)) }
    on("community.getTotalUnreadMentionedCount") { [unowned self] _, c in
      CommunityChannel.getTotalUnreadMentionedCount(completion: self.count(c))
    }
    on("community.checkRemoteMessages") { [unowned self] a, c in
      self.withMessages(a.dicts("messages"), c) { list in
        CommunityChannel.checkRemoteMessages(list) { matched, unmatched, error in
          failed(error) ? c.native(error) : c.resolve(["matched": matched ?? [], "notMatched": unmatched ?? []])
        }
      }
    }
  }

  // MARK: - user.*

  private func subscribeType(_ a: Args) throws -> SubscribeType {
    try enumValue(SubscribeType.self, a.int("subscribeType"), "subscribeType")
  }

  private func registerUsers() {
    let users = { NCEngine.userModule }
    on("user.subscribeEvent") { [unowned self] a, c in
      let params = SubscribeEventParams(subscribeType: try self.subscribeType(a), userIds: try a.reqStrings("userIds"))
      if let expiry = a.int("expiry") { params.expiry = expiry }
      users().subscribeEvent(params: params) { failedIds, error in
        failed(error) ? c.native(error, detail: failedIds) : c.resolve(failedIds ?? [])
      }
    }
    on("user.unsubscribeEvent") { [unowned self] a, c in
      let params = UnsubscribeEventParams(subscribeType: try self.subscribeType(a), userIds: try a.reqStrings("userIds"))
      users().unsubscribeEvent(params: params) { failedIds, error in
        failed(error) ? c.native(error, detail: failedIds) : c.resolve(failedIds ?? [])
      }
    }
    on("user.getSubscribeEvent") { [unowned self] a, c in
      let params = GetSubscribeEventParams()
      params.subscribeType = try self.subscribeType(a)
      params.userIds = try a.reqStrings("userIds")
      users().getSubscribeEvent(params: params, completion: self.result(c) as OperationHandler<[SubscriptionStatusInfo]>)
    }
    on("user.getSubscribeUsersOnlineStatus") { [unowned self] a, c in
      users().getSubscribeUsersOnlineStatus(userIds: try a.reqStrings("userIds"), completion: self.result(c) as OperationHandler<[SubscribeUserOnlineStatus]>)
    }
    on("user.addToBlocklist") { [unowned self] a, c in users().addToBlocklist(userId: try a.reqStr("userId"), completion: self.errorHandler(c)) }
    on("user.removeFromBlocklist") { [unowned self] a, c in users().removeFromBlocklist(userId: try a.reqStr("userId"), completion: self.errorHandler(c)) }
    on("user.getBlocklist") { [unowned self] _, c in users().getBlocklist(completion: self.result(c) { (ids: [String]?) in ids ?? [] }) }
    on("user.checkBlocked") { a, c in
      users().checkBlocked(userId: try a.reqStr("userId")) { blocked, error in failed(error) ? c.native(error) : c.resolve(blocked) }
    }
    on("user.updateMyUserProfile") { [unowned self] a, c in
      let p = try a.reqDict("profile")
      let profile = UserProfile(userId: p.str("userId") ?? NCEngine.getCurrentUserId() ?? "", name: p.str("name") ?? "")
      profile.avatarUrl = p.str("avatarUrl")
      if let unique = p.str("uniqueId") { profile.uniqueId = unique }
      profile.email = p.str("email")
      profile.birthday = p.str("birthday")
      if let gender = p.int("gender") { profile.gender = gender }
      profile.location = p.str("location")
      if let role = p.int("role"), role >= 0 { profile.role = UInt(role) }
      if let level = p.int("level"), level >= 0 { profile.level = UInt(level) }
      profile.extProfile = p.stringMap("extProfile")
      users().updateMyUserProfile(profile, completion: self.detail(c))
    }
    on("user.getUserProfiles") { [unowned self] a, c in
      users().getUserProfiles(userIds: try a.reqStrings("userIds"), completion: self.result(c) as OperationHandler<[UserProfile]>)
    }
    on("user.getMyUserProfile") { [unowned self] _, c in users().getMyUserProfile(completion: self.result(c) as OperationHandler<UserProfile>) }
    on("user.updateMyUserProfileVisibility") { [unowned self] a, c in
      users().updateMyUserProfileVisibility(try enumValue(UserProfileVisibility.self, a.int("visibility"), "visibility"), completion: self.errorHandler(c))
    }
    on("user.getMyUserProfileVisibility") { _, c in
      users().getMyUserProfileVisibility { value, error in failed(error) ? c.native(error) : c.resolve(value.rawValue) }
    }
    on("user.setFriendAddPermission") { [unowned self] a, c in
      users().setFriendAddPermission(try enumValue(FriendAddPermission.self, a.int("permission"), "permission"), completion: self.errorHandler(c))
    }
    on("user.getFriendAddPermission") { _, c in
      users().getFriendAddPermission { value, error in failed(error) ? c.native(error) : c.resolve(value.rawValue) }
    }
    on("user.addFriend") { [unowned self] a, c in
      let params = AddFriendParams(userId: try a.reqStr("userId"))
      params.extra = a.str("extra")
      users().addFriend(params: params, completion: self.count(c))
    }
    on("user.removeFriends") { [unowned self] a, c in users().removeFriends(userIds: try a.reqStrings("userIds"), completion: self.errorHandler(c)) }
    on("user.acceptFriendApplication") { [unowned self] a, c in
      users().acceptFriendApplication(userId: try a.reqStr("userId"), completion: self.errorHandler(c))
    }
    on("user.refuseFriendApplication") { [unowned self] a, c in
      users().refuseFriendApplication(userId: try a.reqStr("userId"), completion: self.errorHandler(c))
    }
    on("user.setFriendInfo") { [unowned self] a, c in
      let params = SetFriendInfoParams(userId: try a.reqStr("userId"))
      params.remark = a.str("remark")
      params.extProfile = a.stringMap("extProfile")
      users().setFriendInfo(params: params, completion: self.detail(c))
    }
    on("user.checkFriends") { [unowned self] a, c in
      users().checkFriends(userIds: try a.reqStrings("userIds"), completion: self.result(c) as OperationHandler<[FriendRelationInfo]>)
    }
    on("user.getFriends") { [unowned self] _, c in users().getFriends(completion: self.result(c) as OperationHandler<[FriendInfo]>) }
    on("user.getFriendsInfo") { [unowned self] a, c in
      users().getFriendsInfo(userIds: try a.reqStrings("userIds"), completion: self.result(c) as OperationHandler<[FriendInfo]>)
    }
    on("user.searchFriendsInfo") { [unowned self] a, c in
      users().searchFriendsInfo(name: try a.reqStr("name"), completion: self.result(c) as OperationHandler<[FriendInfo]>)
    }
  }

  // MARK: - translate.* and tag.*

  private func withTag(_ a: Args, _ c: Call, _ block: @escaping (Tag) throws -> Void) throws {
    Tag.getTag(tagId: try a.reqStr("tagId")) { tag, error in
      if failed(error) { return c.native(error) }
      guard let tag = tag else { return c.reject(BridgeError(category: "not_found", message: "Tag not found")) }
      self.guarded(c) { try block(tag) }
    }
  }

  private func registerTranslateAndTags() {
    let translate = { NCEngine.translateModule }
    on("translate.translateMessages") { [unowned self] a, c in
      let list = try a.dicts("list").map { item -> TranslateMessageParam in
        let p = TranslateMessageParam(messageId: try item.reqStr("messageId"), targetLanguage: item.str("targetLanguage"))
        p.sourceLanguage = item.str("sourceLanguage")
        return p
      }
      let params = TranslateMessagesParams(
        list: list,
        force: a.bool("force") ?? false,
        mode: try enumValue(TranslateMode.self, a.int("mode") ?? 0, "mode")
      )
      translate().translateMessages(params: params, completion: self.errorHandler(c))
    }
    on("translate.translateTexts") { [unowned self] a, c in
      let list = try a.dicts("list").map { item -> TranslateTextParam in
        let p = TranslateTextParam(text: try item.reqStr("text"), targetLanguage: item.str("targetLanguage"))
        p.sourceLanguage = item.str("sourceLanguage")
        return p
      }
      let params = TranslateTextsParams(list: list, mode: try enumValue(TranslateMode.self, a.int("mode") ?? 0, "mode"))
      translate().translateTexts(params: params, completion: self.errorHandler(c))
    }
    on("translate.setLanguage") { [unowned self] a, c in translate().setTranslationLanguage(try a.reqStr("language"), completion: self.errorHandler(c)) }
    on("translate.getLanguage") { _, c in
      translate().getTranslationLanguage { language, error in failed(error) ? c.native(error) : c.resolve(language) }
    }
    on("translate.setAutoTranslateEnabled") { [unowned self] a, c in
      translate().setAutoTranslateEnabled(a.bool("enabled") ?? false, completion: self.errorHandler(c))
    }
    on("translate.getAutoTranslateEnabled") { _, c in
      translate().getAutoTranslateEnabled { enabled, error in failed(error) ? c.native(error) : c.resolve(enabled) }
    }
    on("translate.setStrategy") { [unowned self] a, c in
      let ids = try a.dicts("channels").map { try self.identifier($0) }
      translate().setTranslateStrategy(
        identifiers: ids,
        strategy: try enumValue(TranslateStrategy.self, a.int("strategy"), "strategy"),
        completion: self.errorHandler(c)
      )
    }

    on("tag.create") { [unowned self] a, c in
      Tag.createTag(params: CreateTagParams(tagId: try a.reqStr("tagId"), tagName: try a.reqStr("tagName")), completion: self.result(c) as OperationHandler<Tag>)
    }
    on("tag.getTags") { [unowned self] _, c in Tag.getTags(completion: self.result(c) as OperationHandler<[Tag]>) }
    on("tag.getTag") { [unowned self] a, c in Tag.getTag(tagId: try a.reqStr("tagId"), completion: self.result(c) as OperationHandler<Tag>) }
    on("tag.delete") { [unowned self] a, c in try self.withTag(a, c) { $0.delete(completion: self.errorHandler(c)) } }
    on("tag.update") { [unowned self] a, c in
      let name = try a.reqStr("tagName")
      try self.withTag(a, c) { $0.update(tagName: name, completion: self.errorHandler(c)) }
    }
    on("tag.addChannels") { [unowned self] a, c in
      let ids = try a.dicts("channels").map { try self.identifier($0) }
      try self.withTag(a, c) { $0.addChannels(identifiers: ids, completion: self.errorHandler(c)) }
    }
    on("tag.deleteChannels") { [unowned self] a, c in
      let ids = try a.dicts("channels").map { try self.identifier($0) }
      try self.withTag(a, c) { $0.deleteChannels(identifiers: ids, completion: self.errorHandler(c)) }
    }
    on("tag.getUnreadCount") { [unowned self] a, c in
      let contain = a.bool("containNoDisturb") ?? false
      try self.withTag(a, c) { $0.getUnreadCount(containNoDisturb: contain, completion: self.count(c)) }
    }
    on("tag.clearUnreadCount") { [unowned self] a, c in try self.withTag(a, c) { $0.clearUnreadCount(completion: self.boolDone(c)) } }
    on("tag.clearChannels") { [unowned self] a, c in
      let delete = a.bool("deleteMessages") ?? false
      try self.withTag(a, c) { $0.clearChannels(isDeleteMessage: delete, completion: self.errorHandler(c)) }
    }
  }

  // MARK: - query.*

  private func dataLoader<T>(_ load: @escaping (@escaping OperationHandler<PageData<T>>) -> Void, hasMore: (() -> Bool)? = nil, total: (() -> Int)? = nil) -> Loader {
    { done in
      load { page, error in done(page?.data ?? [], total?(), hasMore?(), error) }
    }
  }

  private func resultLoader<T: NSObject>(_ load: @escaping (@escaping OperationHandler<PageResult<T>>) -> Void) -> Loader {
    { done in
      load { page, error in done(page?.data ?? [], page?.totalCount, nil, error) }
    }
  }

  private func createQuery(_ kind: String, _ p: Args) throws -> Loader {
    switch kind {
    case "channels":
      let params = ChannelsQueryParams()
      params.channelTypes = try channelTypeNumbers(p)
      if let v = p.int("pageSize") { params.pageSize = Int32(v) }
      if let v = p.int64("startTime") { params.startTime = v }
      if let v = p.bool("topPriority") { params.topPriority = v }
      let q = BaseChannel.createChannelsQuery(params: params)
      return dataLoader { q.loadNextPage($0) }
    case "unreadMentionMeChannels":
      let params = UnreadMentionMeChannelsQueryParams()
      params.channelTypes = try channelTypeNumbers(p)
      if let v = p.int("pageSize"), v >= 0 { params.pageSize = UInt(v) }
      if let v = p.int64("startTime") { params.startTime = v }
      if let v = p.bool("topPriority") { params.topPriority = v }
      let q = BaseChannel.createUnreadMentionMeChannelsQuery(params: params)
      return dataLoader { q.loadNextPage($0) }
    case "messages":
      let params = MessagesQueryParams(channelIdentifier: try identifier(p.reqDict("channel")))
      if let v = p.int("pageSize") { params.pageSize = v }
      if let v = p.int64("startTime") { params.startTime = v }
      if let v = p.bool("isAscending") { params.isAscending = v }
      let q = BaseChannel.createMessagesQuery(params: params)
      return dataLoader({ q.loadNextPage($0) }, hasMore: { q.hasNextPage })
    case "localMessagesByTime":
      let params = LocalMessagesByTimeQueryParams()
      params.channelIdentifier = try identifier(p.reqDict("channel"))
      if let v = p.int("pageSize") { params.pageSize = v }
      if let v = p.int64("sentTime") { params.sentTime = v }
      if let v = p.bool("isAscending") { params.isAscending = v }
      if let v = p.strings("messageTypes") { params.messageTypes = v }
      let q = BaseChannel.createLocalMessagesByTimeQuery(params: params)
      return dataLoader { q.loadNextPage($0) }
    case "searchMessagesByUser":
      let params = SearchMessagesByUserQueryParams()
      params.channelType = try channelType(p.int("channelType"))
      params.channelId = try p.reqStr("channelId")
      params.userId = try p.reqStr("userId")
      params.startTime = p.int64("startTime") ?? 0
      params.pageSize = p.int("pageSize") ?? 20
      params.subChannelIds = p.strings("subChannelIds") ?? []
      let q = BaseChannel.createSearchMessagesByUserQuery(params: params)
      return dataLoader { q.loadNextPage($0) }
    case "searchMessagesByTimeRange":
      let params = SearchMessagesByTimeRangeQueryParams()
      params.channelIdentifier = try identifier(p.reqDict("channel"))
      params.keyword = try p.reqStr("keyword")
      params.startTime = p.int64("startTime") ?? 0
      params.endTime = p.int64("endTime") ?? Int64(Date().timeIntervalSince1970 * 1000)
      params.pageSize = p.int("pageSize") ?? 20
      let q = BaseChannel.createSearchMessagesByTimeRangeQuery(params: params)
      return dataLoader { q.loadNextPage($0) }
    case "searchMessages":
      let params = SearchMessagesQueryParams()
      params.keyword = try p.reqStr("keyword")
      params.pageSize = p.int("pageSize") ?? 20
      params.isAscending = p.bool("isAscending") ?? false
      params.startTime = p.int64("startTime") ?? 0
      params.endTime = p.int64("endTime") ?? 0
      if p.ints("channelTypes") != nil { params.channelTypes = try channelTypeNumbers(p) }
      params.channelIds = p.strings("channelIds") ?? []
      params.senderUserIds = p.strings("senderUserIds") ?? []
      params.messageTypes = p.strings("messageTypes") ?? []
      params.subChannelIds = p.strings("subChannelIds") ?? []
      let q = BaseChannel.createSearchMessagesQuery(params: params)
      return dataLoader({ q.loadNextPage($0) }, total: { q.totalCount })
    case "messagesReadReceiptUsers":
      let params = MessagesReadReceiptUsersQueryParams()
      params.channelIdentifier = try identifier(p.reqDict("channel"))
      params.messageId = try p.reqStr("messageId")
      if let v = p.int("pageSize") { params.pageSize = v }
      if let v = p.bool("isAscending") { params.isAscending = v }
      if let v = p.int("status") { params.status = try enumValue(MessageReadReceiptStatus.self, v, "status") }
      let q = BaseChannel.createMessagesReadReceiptUsersQuery(params: params)
      return resultLoader { q.loadNextPage($0) }
    case "openChannelMessages":
      let params = OpenChannelMessagesQueryParams()
      params.channelId = try p.reqStr("channelId")
      params.startTime = p.int64("startTime") ?? 0
      params.pageSize = p.int("pageSize") ?? 20
      params.isAscending = p.bool("isAscending") ?? false
      let q = OpenChannel.createOpenChannelMessagesQuery(params: params)
      return dataLoader { q.loadNextPage($0) }
    case "groupApplications":
      let params = GroupApplicationsQueryParams()
      if let v = p.int("pageSize"), v >= 0 { params.pageSize = UInt(v) }
      if let v = p.bool("isAscending") { params.isAscending = v }
      if let v = p.numbers("directions") { params.directions = v }
      if let v = p.numbers("status") { params.status = v }
      let q = GroupChannel.createGroupApplicationsQuery(params: params)
      return dataLoader({ q.loadNextPage($0) }, total: { q.totalCount })
    case "joinedGroupsByRole":
      let params = JoinedGroupsByRoleQueryParams()
      if let v = p.int("role") { params.role = try enumValue(GroupMemberRole.self, v, "role") }
      if let v = p.int("pageSize"), v >= 0 { params.pageSize = UInt(v) }
      if let v = p.bool("isAscending") { params.isAscending = v }
      let q = GroupChannel.createJoinedGroupsByRoleQuery(params: params)
      return resultLoader { q.loadNextPage($0) }
    case "searchJoinedGroups":
      let params = SearchJoinedGroupsQueryParams()
      params.groupName = try p.reqStr("groupName")
      if let v = p.int("pageSize"), v >= 0 { params.pageSize = UInt(v) }
      if let v = p.bool("isAscending") { params.isAscending = v }
      let q = GroupChannel.createSearchJoinedGroupsQuery(params: params)
      return dataLoader({ q.loadNextPage($0) }, total: { q.totalCount })
    case "searchGroupMembers":
      let params = SearchGroupMembersQueryParams()
      params.groupId = try p.reqStr("groupId")
      params.memberName = try p.reqStr("memberName")
      if let v = p.int("pageSize"), v >= 0 { params.pageSize = UInt(v) }
      if let v = p.bool("isAscending") { params.isAscending = v }
      let q = GroupChannel.createSearchGroupMembersQuery(params: params)
      return dataLoader({ q.loadNextPage($0) }, total: { q.totalCount })
    case "groupMembersByRole":
      let params = GroupMembersByRoleQueryParams()
      params.groupId = try p.reqStr("groupId")
      if let v = p.int("role") { params.role = try enumValue(GroupMemberRole.self, v, "role") }
      if let v = p.int("pageSize"), v >= 0 { params.pageSize = UInt(v) }
      if let v = p.bool("isAscending") { params.isAscending = v }
      if let v = p.int("filterRobotType") { params.filterRobotType = try enumValue(GroupMemberFilterRobotType.self, v, "filterRobotType") }
      let q = GroupChannel.createGroupMembersByRoleQuery(params: params)
      return resultLoader { q.loadNextPage($0) }
    case "friendApplications":
      let params = FriendApplicationsQueryParams()
      if let v = p.int("pageSize"), v >= 0 { params.pageSize = UInt(v) }
      if let v = p.bool("isAscending") { params.isAscending = v }
      if let v = p.numbers("applicationTypes") { params.applicationTypes = v }
      if let v = p.numbers("applicationStatuses") { params.applicationStatuses = v }
      let q = UserModule.createFriendApplicationsQuery(params: params)
      return dataLoader { q.loadNextPage($0) }
    case "subscribe":
      let params = SubscribeQueryParams()
      params.subscribeType = try subscribeType(p)
      params.pageSize = p.int("pageSize") ?? 20
      let q = UserModule.createSubscribeQuery(params: params)
      return dataLoader { q.loadNextPage($0) }
    case "taggedChannels":
      let params = TaggedChannelsQueryParams()
      params.tagId = try p.reqStr("tagId")
      if let v = p.int("pageSize") { params.pageSize = v }
      if let v = p.int64("startTime") { params.startTime = v }
      let q = Tag.createTaggedChannelsQuery(params: params)
      return dataLoader { q.loadNextPage($0) }
    case "untaggedChannels":
      let params = UntaggedChannelsQueryParams()
      if let v = p.int("pageSize") { params.pageSize = v }
      if let v = p.bool("topPriority") { params.topPriority = v }
      if let v = p.int64("startTime") { params.startTime = v }
      let q = Tag.createUntaggedChannelsQuery(params: params)
      return dataLoader { q.loadNextPage($0) }
    default:
      throw BridgeError.invalid("Unknown query kind \(kind)")
    }
  }

  private func registerQueries() {
    on("query.create") { [unowned self] a, c in
      self.stateLock.lock()
      let full = self.queries.count >= Self.maxQueries
      self.stateLock.unlock()
      if full {
        throw BridgeError(category: "limit_exceeded", message: "More than \(Self.maxQueries) live queries; release unused queries")
      }
      let loader = try self.createQuery(try a.reqStr("kind"), a.dict("params") ?? [:])
      self.stateLock.lock()
      self.queryCounter += 1
      let id = "q\(self.queryCounter)"
      self.queries[id] = QueryEntry(loader: loader, generation: self.generation)
      self.stateLock.unlock()
      c.resolve(["queryId": id])
    }
    on("query.loadNextPage") { [unowned self] a, c in
      let id = try a.reqStr("queryId")
      self.stateLock.lock()
      let entry = self.queries[id]
      let gen = self.generation
      self.stateLock.unlock()
      guard let query = entry else {
        throw BridgeError(category: "not_found", message: "Query \(id) does not exist (released or session ended)")
      }
      guard query.generation == gen else {
        throw BridgeError(category: "stale_session", message: "Query belongs to a previous session")
      }
      query.loader { items, total, hasMore, error in
        if failed(error) { return c.native(error) }
        var out: [String: Any] = ["items": items]
        if let total = total { out["totalCount"] = total }
        if let hasMore = hasMore { out["hasMore"] = hasMore }
        c.resolve(out)
      }
    }
    on("query.release") { [unowned self] a, c in
      let id = try a.reqStr("queryId")
      self.stateLock.lock()
      self.queries.removeValue(forKey: id)
      self.stateLock.unlock()
      c.resolve(nil)
    }
  }
}
