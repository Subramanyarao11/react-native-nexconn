import Foundation
import NexconnChatSDK

/// JavaScript cannot declare Objective-C classes, but the SDK registers custom
/// messages by class and asks the class for `messageType` / `persistentFlag`.
/// The bridge ships a fixed pool of generic slot classes; registration binds
/// each JS-defined type to a free slot. Mirrors the Android implementation.
final class NexconnCustomRegistry {
  static let slotCount = 16
  static let shared = NexconnCustomRegistry()

  struct Definition {
    let messageType: String
    let persistentFlag: Int
    let searchableFields: [String]
    let isMedia: Bool
  }

  private let lock = NSLock()
  private var plain = [Definition?](repeating: nil, count: slotCount)
  private var media = [Definition?](repeating: nil, count: slotCount)

  /// Returns the class to register with the SDK, or nil if already registered.
  func register(_ def: Definition) throws -> AnyClass? {
    lock.lock()
    defer { lock.unlock() }
    if def.isMedia {
      if let i = media.firstIndex(where: { $0?.messageType == def.messageType }) {
        media[i] = def
        return nil
      }
      guard let free = media.firstIndex(where: { $0 == nil }) else {
        throw BridgeError(category: "limit_exceeded", message: "At most \(Self.slotCount) media custom message types are supported")
      }
      media[free] = def
      return Self.mediaClasses[free]
    }
    if let i = plain.firstIndex(where: { $0?.messageType == def.messageType }) {
      plain[i] = def
      return nil
    }
    guard let free = plain.firstIndex(where: { $0 == nil }) else {
      throw BridgeError(category: "limit_exceeded", message: "At most \(Self.slotCount) custom message types are supported")
    }
    plain[free] = def
    return Self.plainClasses[free]
  }

  func plainDefinition(_ slot: Int) -> Definition? {
    lock.lock()
    defer { lock.unlock() }
    return plain[slot]
  }

  func mediaDefinition(_ slot: Int) -> Definition? {
    lock.lock()
    defer { lock.unlock() }
    return media[slot]
  }

  func create(_ messageType: String) -> MessageContent? {
    lock.lock()
    let plainIndex = plain.firstIndex(where: { $0?.messageType == messageType })
    let mediaIndex = media.firstIndex(where: { $0?.messageType == messageType })
    lock.unlock()
    if let i = plainIndex { return Self.plainClasses[i].init() }
    if let i = mediaIndex { return Self.mediaClasses[i].init() }
    return nil
  }

  static let plainClasses: [NexconnCustomSlotBase.Type] = [
    NexconnCustomSlot0.self, NexconnCustomSlot1.self, NexconnCustomSlot2.self, NexconnCustomSlot3.self,
    NexconnCustomSlot4.self, NexconnCustomSlot5.self, NexconnCustomSlot6.self, NexconnCustomSlot7.self,
    NexconnCustomSlot8.self, NexconnCustomSlot9.self, NexconnCustomSlot10.self, NexconnCustomSlot11.self,
    NexconnCustomSlot12.self, NexconnCustomSlot13.self, NexconnCustomSlot14.self, NexconnCustomSlot15.self,
  ]

  static let mediaClasses: [NexconnCustomMediaSlotBase.Type] = [
    NexconnCustomMediaSlot0.self, NexconnCustomMediaSlot1.self, NexconnCustomMediaSlot2.self,
    NexconnCustomMediaSlot3.self, NexconnCustomMediaSlot4.self, NexconnCustomMediaSlot5.self,
    NexconnCustomMediaSlot6.self, NexconnCustomMediaSlot7.self, NexconnCustomMediaSlot8.self,
    NexconnCustomMediaSlot9.self, NexconnCustomMediaSlot10.self, NexconnCustomMediaSlot11.self,
    NexconnCustomMediaSlot12.self, NexconnCustomMediaSlot13.self, NexconnCustomMediaSlot14.self,
    NexconnCustomMediaSlot15.self,
  ]
}

private func persistent(_ raw: Int?) -> MessagePersistent {
  MessagePersistent(rawValue: UInt(max(raw ?? 0, 0))) ?? MessagePersistent.none
}

private func searchable(_ def: NexconnCustomRegistry.Definition?, _ fields: [String: Any]) -> [String] {
  (def?.searchableFields ?? []).compactMap { fields[$0] as? String }.filter { !$0.isEmpty }
}

class NexconnCustomSlotBase: CustomMessageContent {
  @objc var fields: [String: Any] = [:]

  class var slot: Int { 0 }

  required override init() {
    super.init()
  }

  override class func messageType() -> String {
    NexconnCustomRegistry.shared.plainDefinition(slot)?.messageType ?? "rnnexconn:unregistered\(slot)"
  }

  override class func persistentFlag() -> MessagePersistent {
    persistent(NexconnCustomRegistry.shared.plainDefinition(slot)?.persistentFlag)
  }

  override func encodeFields() -> [String: Any] { fields }

  override func decodeFields(_ fields: [String: Any]) { self.fields = fields }

  override func searchableWords() -> [String] {
    searchable(NexconnCustomRegistry.shared.plainDefinition(Self.slot), fields)
  }

  func toJSON(depth: Int) -> [String: Any] {
    [
      "__type": "CustomMessageContent",
      "messageType": Self.messageType(),
      "fields": NexconnSerializer.toJSON(fields, depth: depth + 1),
      "extra": extra ?? NSNull(),
      "mentionedInfo": NexconnSerializer.toJSON(mentionedInfo, depth: depth + 1),
      "senderUserInfo": NexconnSerializer.toJSON(senderUserInfo, depth: depth + 1),
    ]
  }
}

class NexconnCustomMediaSlotBase: CustomMediaMessageContent {
  @objc var fields: [String: Any] = [:]

  class var slot: Int { 0 }

  required override init() {
    super.init()
  }

  override class func messageType() -> String {
    NexconnCustomRegistry.shared.mediaDefinition(slot)?.messageType ?? "rnnexconn:unregisteredmedia\(slot)"
  }

  override class func persistentFlag() -> MessagePersistent {
    persistent(NexconnCustomRegistry.shared.mediaDefinition(slot)?.persistentFlag)
  }

  override func encodeFields() -> [String: Any] { fields }

  override func decodeFields(_ fields: [String: Any]) { self.fields = fields }

  override func searchableWords() -> [String] {
    searchable(NexconnCustomRegistry.shared.mediaDefinition(Self.slot), fields)
  }

  func toJSON(depth: Int) -> [String: Any] {
    [
      "__type": "CustomMessageContent",
      "messageType": Self.messageType(),
      "fields": NexconnSerializer.toJSON(fields, depth: depth + 1),
      "localPath": localPath ?? NSNull(),
      "remoteUrl": remoteUrl ?? NSNull(),
      "name": name ?? NSNull(),
      "extra": extra ?? NSNull(),
    ]
  }
}

final class NexconnCustomSlot0: NexconnCustomSlotBase { override class var slot: Int { 0 } }
final class NexconnCustomSlot1: NexconnCustomSlotBase { override class var slot: Int { 1 } }
final class NexconnCustomSlot2: NexconnCustomSlotBase { override class var slot: Int { 2 } }
final class NexconnCustomSlot3: NexconnCustomSlotBase { override class var slot: Int { 3 } }
final class NexconnCustomSlot4: NexconnCustomSlotBase { override class var slot: Int { 4 } }
final class NexconnCustomSlot5: NexconnCustomSlotBase { override class var slot: Int { 5 } }
final class NexconnCustomSlot6: NexconnCustomSlotBase { override class var slot: Int { 6 } }
final class NexconnCustomSlot7: NexconnCustomSlotBase { override class var slot: Int { 7 } }
final class NexconnCustomSlot8: NexconnCustomSlotBase { override class var slot: Int { 8 } }
final class NexconnCustomSlot9: NexconnCustomSlotBase { override class var slot: Int { 9 } }
final class NexconnCustomSlot10: NexconnCustomSlotBase { override class var slot: Int { 10 } }
final class NexconnCustomSlot11: NexconnCustomSlotBase { override class var slot: Int { 11 } }
final class NexconnCustomSlot12: NexconnCustomSlotBase { override class var slot: Int { 12 } }
final class NexconnCustomSlot13: NexconnCustomSlotBase { override class var slot: Int { 13 } }
final class NexconnCustomSlot14: NexconnCustomSlotBase { override class var slot: Int { 14 } }
final class NexconnCustomSlot15: NexconnCustomSlotBase { override class var slot: Int { 15 } }

final class NexconnCustomMediaSlot0: NexconnCustomMediaSlotBase { override class var slot: Int { 0 } }
final class NexconnCustomMediaSlot1: NexconnCustomMediaSlotBase { override class var slot: Int { 1 } }
final class NexconnCustomMediaSlot2: NexconnCustomMediaSlotBase { override class var slot: Int { 2 } }
final class NexconnCustomMediaSlot3: NexconnCustomMediaSlotBase { override class var slot: Int { 3 } }
final class NexconnCustomMediaSlot4: NexconnCustomMediaSlotBase { override class var slot: Int { 4 } }
final class NexconnCustomMediaSlot5: NexconnCustomMediaSlotBase { override class var slot: Int { 5 } }
final class NexconnCustomMediaSlot6: NexconnCustomMediaSlotBase { override class var slot: Int { 6 } }
final class NexconnCustomMediaSlot7: NexconnCustomMediaSlotBase { override class var slot: Int { 7 } }
final class NexconnCustomMediaSlot8: NexconnCustomMediaSlotBase { override class var slot: Int { 8 } }
final class NexconnCustomMediaSlot9: NexconnCustomMediaSlotBase { override class var slot: Int { 9 } }
final class NexconnCustomMediaSlot10: NexconnCustomMediaSlotBase { override class var slot: Int { 10 } }
final class NexconnCustomMediaSlot11: NexconnCustomMediaSlotBase { override class var slot: Int { 11 } }
final class NexconnCustomMediaSlot12: NexconnCustomMediaSlotBase { override class var slot: Int { 12 } }
final class NexconnCustomMediaSlot13: NexconnCustomMediaSlotBase { override class var slot: Int { 13 } }
final class NexconnCustomMediaSlot14: NexconnCustomMediaSlotBase { override class var slot: Int { 14 } }
final class NexconnCustomMediaSlot15: NexconnCustomMediaSlotBase { override class var slot: Int { 15 } }
