import Foundation
import NexconnChatSDK
import ObjectiveC
import UIKit

/// Stable wrapper error surfaced to JavaScript as a JSON rejection message.
struct BridgeError: Error {
  let category: String
  let message: String
  var code: Int?
  var detail: Any?

  static func invalid(_ message: String) -> BridgeError {
    BridgeError(category: "invalid_argument", message: message)
  }

  static func unsupported(_ method: String) -> BridgeError {
    BridgeError(category: "unsupported", message: "\(method) is not available in the iOS Nexconn SDK")
  }
}

/// Generic Objective-C runtime serializer for Nexconn SDK objects.
///
/// The iOS SDK exposes its models as `@objcMembers` classes, so every public
/// property is visible to the runtime. Each property becomes a JSON field,
/// enums arrive as their raw integer value (identical to the Android raw
/// values) and every object carries `__type`.
enum NexconnSerializer {
  private static let maxDepth = 12
  private static let lock = NSLock()
  private static var propertyCache: [ObjectIdentifier: [String]] = [:]
  private static let skippedNames: Set<String> = ["hash", "description", "debugDescription", "superclass"]
  /// Property types that are never serialized (images, raw data, blocks, queues).
  private static let skippedTypePrefixes = ["T@\"UIImage\"", "T@\"NSData\"", "T@?", "T@\"OS_dispatch_queue\"", "T^", "T{", "T@\"NSObject<OS_dispatch_queue>\""]

  static var onMessage: ((Message) -> Void)?

  static func encode(_ value: Any?) -> Any { toJSON(value, depth: 0) }

  static func toJSON(_ value: Any?, depth: Int) -> Any {
    guard let value = value, depth <= maxDepth else { return NSNull() }
    if value is NSNull { return NSNull() }
    switch value {
    case let v as String:
      return v
    case let v as NCError:
      return ["__type": "NCError", "code": v.code, "message": v.message]
    case let v as NSError:
      return ["__type": "Error", "code": v.code, "message": v.localizedDescription]
    case let v as NSNumber:
      if CFGetTypeID(v) == CFBooleanGetTypeID() { return v.boolValue }
      let d = v.doubleValue
      return d.isFinite ? v : NSNull()
    case let v as Date:
      return Int64(v.timeIntervalSince1970 * 1000)
    case let v as URL:
      return v.absoluteString
    case is Data, is UIImage:
      return NSNull()
    case let v as [String: Any]:
      var out: [String: Any] = [:]
      for (k, item) in v { out[k] = toJSON(item, depth: depth + 1) }
      return out
    case let v as [AnyHashable: Any]:
      var out: [String: Any] = [:]
      for (k, item) in v { out[String(describing: k)] = toJSON(item, depth: depth + 1) }
      return out
    case let v as [Any]:
      return v.map { toJSON($0, depth: depth + 1) }
    case let v as NexconnCustomSlotBase:
      return v.toJSON(depth: depth)
    case let v as NexconnCustomMediaSlotBase:
      return v.toJSON(depth: depth)
    case let v as NSObject:
      if let message = v as? Message { onMessage?(message) }
      return reflect(v, depth: depth)
    default:
      return NSNull()
    }
  }

  private static func reflect(_ object: NSObject, depth: Int) -> [String: Any] {
    var out: [String: Any] = ["__type": String(describing: type(of: object))]
    for name in propertyNames(of: type(of: object)) {
      out[name] = toJSON(object.value(forKey: name), depth: depth + 1)
    }
    return out
  }

  private static func propertyNames(of cls: AnyClass) -> [String] {
    let key = ObjectIdentifier(cls)
    lock.lock()
    if let cached = propertyCache[key] {
      lock.unlock()
      return cached
    }
    lock.unlock()
    var names: [String] = []
    var seen = Set<String>()
    var current: AnyClass? = cls
    while let c = current, c != NSObject.self {
      var count: UInt32 = 0
      if let list = class_copyPropertyList(c, &count) {
        for i in 0..<Int(count) {
          let property = list[i]
          let name = String(cString: property_getName(property))
          guard !skippedNames.contains(name), !seen.contains(name) else { continue }
          if let attrs = property_getAttributes(property) {
            let attributes = String(cString: attrs)
            if skippedTypePrefixes.contains(where: { attributes.hasPrefix($0) }) { continue }
          }
          seen.insert(name)
          names.append(name)
        }
        free(list)
      }
      current = class_getSuperclass(c)
    }
    names.sort()
    lock.lock()
    propertyCache[key] = names
    lock.unlock()
    return names
  }
}

// MARK: - Argument helpers

typealias Args = [String: Any]

extension Dictionary where Key == String, Value == Any {
  func str(_ key: String) -> String? { self[key] as? String }

  func reqStr(_ key: String) throws -> String {
    guard let v = self[key] as? String, !v.isEmpty else { throw BridgeError.invalid("\(key) is required") }
    return v
  }

  func number(_ key: String) -> NSNumber? {
    guard let n = self[key] as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID() else { return nil }
    return n
  }

  func int(_ key: String) -> Int? { number(key)?.intValue }

  func reqInt(_ key: String) throws -> Int {
    guard let v = int(key) else { throw BridgeError.invalid("\(key) is required") }
    return v
  }

  func int64(_ key: String) -> Int64? { number(key)?.int64Value }

  func double(_ key: String) -> Double? { number(key)?.doubleValue }

  func bool(_ key: String) -> Bool? { (self[key] as? NSNumber)?.boolValue }

  func dict(_ key: String) -> Args? { self[key] as? Args }

  func reqDict(_ key: String) throws -> Args {
    guard let v = dict(key) else { throw BridgeError.invalid("\(key) is required") }
    return v
  }

  func strings(_ key: String) -> [String]? { (self[key] as? [Any])?.compactMap { $0 as? String } }

  func reqStrings(_ key: String) throws -> [String] {
    guard let v = strings(key) else { throw BridgeError.invalid("\(key) is required") }
    return v
  }

  func ints(_ key: String) -> [Int]? { (self[key] as? [Any])?.compactMap { ($0 as? NSNumber)?.intValue } }

  func numbers(_ key: String) -> [NSNumber]? { (self[key] as? [Any])?.compactMap { $0 as? NSNumber } }

  func dicts(_ key: String) -> [Args] { (self[key] as? [Any])?.compactMap { $0 as? Args } ?? [] }

  func stringMap(_ key: String) -> [String: String]? {
    guard let o = self[key] as? [String: Any] else { return nil }
    var out: [String: String] = [:]
    for (k, v) in o { if let s = v as? String { out[k] = s } }
    return out
  }
}

/// Converts a raw value into an `@objc` Int-backed enum, or throws.
func enumValue<E: RawRepresentable>(_ type: E.Type, _ raw: Int?, _ label: String) throws -> E where E.RawValue == Int {
  guard let raw = raw, let value = E(rawValue: raw) else {
    throw BridgeError.invalid("Invalid \(label): \(raw.map(String.init) ?? "missing")")
  }
  return value
}

func uintEnumValue<E: RawRepresentable>(_ type: E.Type, _ raw: Int?, _ label: String) throws -> E where E.RawValue == UInt {
  guard let raw = raw, raw >= 0, let value = E(rawValue: UInt(raw)) else {
    throw BridgeError.invalid("Invalid \(label): \(raw.map(String.init) ?? "missing")")
  }
  return value
}
