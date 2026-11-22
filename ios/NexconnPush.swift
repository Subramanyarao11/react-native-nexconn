import Foundation
import NexconnChatSDK
import UIKit
import UserNotifications

/// Push notification plumbing for iOS (APNs).
///
/// The Nexconn iOS SDK only takes the APNs device token
/// (`NCEngine.setDeviceTokenData`); presenting and routing notifications is the
/// app's job. This class connects the usual app-side hooks to JS:
///
/// - `NexconnBridge.registerDeviceToken(_:)` / `registerDeviceTokenFailed(_:)`
///   from the AppDelegate forward the token and emit `Push.onTokenReceived` /
///   `Push.onTokenError`.
/// - `NexconnBridge.installNotificationHandler()` (opt-in, call from
///   `application(_:didFinishLaunchingWithOptions:)`) becomes the
///   `UNUserNotificationCenter` delegate and forwards every callback to the
///   delegate it replaced. Apps with their own delegate call
///   `NexconnBridge.handleNotificationResponse(_:)` and
///   `handleNotificationWillPresent(_:)` instead.
///
/// Only notifications carrying the Nexconn `rc` payload are reported. A tap is
/// emitted as `Push.onNotificationOpened`; with no JS runtime attached (cold
/// start) it is kept as the "initial notification" until JS reads it. Each
/// record has a unique `id` so JS can de-duplicate.
@objc(NexconnPush) public final class NexconnPush: NSObject, UNUserNotificationCenterDelegate {
  @objc public static let shared = NexconnPush()

  /// Presentation options for Nexconn notifications arriving while the app is
  /// in the foreground, when no previous delegate decides. Default: none (the
  /// connected SDK delivers the message live).
  @objc public static var foregroundPresentationOptions: UNNotificationPresentationOptions = []

  private let lock = NSLock()
  private var initialOpen: [String: Any]?
  private var token: [String: Any]?
  private var counter = 0
  private var installed = false
  private weak var previousDelegate: UNUserNotificationCenterDelegate?

  private override init() { super.init() }

  // MARK: - Installation

  @objc public func install() {
    let center = UNUserNotificationCenter.current()
    lock.lock()
    if installed { lock.unlock(); return }
    installed = true
    if let current = center.delegate, current !== self { previousDelegate = current }
    lock.unlock()
    center.delegate = self
  }

  // MARK: - Token

  func didRegister(deviceToken: Data) {
    let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
    let payload: [String: Any] = ["token": hex, "pushType": "apns", "platform": "ios"]
    lock.lock(); token = payload; lock.unlock()
    _ = NexconnBridge.shared.emitPush("Push.onTokenReceived", payload)
  }

  func didFailToRegister(error: Error) {
    let ns = error as NSError
    _ = NexconnBridge.shared.emitPush(
      "Push.onTokenError",
      ["pushType": "apns", "code": ns.code, "message": ns.localizedDescription, "platform": "ios"]
    )
  }

  func recordToken(hex: String) {
    lock.lock(); token = ["token": hex, "pushType": "apns", "platform": "ios"]; lock.unlock()
  }

  func currentToken() -> [String: Any]? {
    lock.lock(); defer { lock.unlock() }
    return token
  }

  func takeInitialNotification() -> [String: Any]? {
    lock.lock(); defer { lock.unlock() }
    let value = initialOpen
    initialOpen = nil
    return value
  }

  // MARK: - Notifications

  func handleOpen(_ response: UNNotificationResponse) {
    let request = response.notification.request
    guard let payload = describe(request.content.userInfo, identifier: request.identifier, action: response.actionIdentifier)
    else { return }
    // Cold start: no JS runtime yet, keep it for getInitialNotification.
    if !NexconnBridge.shared.emitPush("Push.onNotificationOpened", payload) {
      lock.lock(); initialOpen = payload; lock.unlock()
    }
  }

  func handleWillPresent(_ notification: UNNotification) {
    let request = notification.request
    guard let payload = describe(request.content.userInfo, identifier: request.identifier, action: nil) else { return }
    _ = NexconnBridge.shared.emitPush("Push.onNotificationReceived", payload)
  }

  /// Maps a Nexconn APNs payload (`aps` + `rc` + optional `appData`) to the
  /// JS `PushNotification` shape. Returns nil for non-Nexconn notifications.
  func describe(_ userInfo: [AnyHashable: Any], identifier: String, action: String?) -> [String: Any]? {
    var rc: [String: Any]?
    if let dict = userInfo["rc"] as? [String: Any] {
      rc = dict
    } else if let text = userInfo["rc"] as? String, let data = text.data(using: .utf8) {
      rc = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }
    guard let rc else { return nil }
    let aps = userInfo["aps"] as? [String: Any]
    var title: String?
    var body: String?
    if let alert = aps?["alert"] as? [String: Any] {
      title = alert["title"] as? String
      body = alert["body"] as? String
    } else if let alert = aps?["alert"] as? String {
      body = alert
    }
    lock.lock(); counter += 1; let n = counter; lock.unlock()
    var out: [String: Any] = [
      "id": "ios-\(Int64(Date().timeIntervalSince1970 * 1000))-\(n)",
      "platform": "ios",
      "pushType": "apns",
      "notificationId": identifier,
      "raw": NexconnSerializer.encode(userInfo),
    ]
    if let cType = rc["cType"] as? String, let type = Self.channelTypes[cType] { out["channelType"] = type }
    out["channelId"] = rc["tId"] as? String
    out["senderId"] = rc["fId"] as? String
    out["objectName"] = rc["oName"] as? String
    out["pushId"] = rc["id"] as? String
    out["title"] = title
    out["body"] = body
    if let appData = userInfo["appData"] as? String { out["pushData"] = appData }
    if let action, action != UNNotificationDefaultActionIdentifier { out["actionIdentifier"] = action }
    return out
  }

  /// Nexconn/RongCloud APNs `rc.cType` codes to `ChannelType` raw values.
  private static let channelTypes: [String: Int] = ["PR": 1, "GRP": 3, "CR": 4, "SYS": 6, "UG": 10]

  // MARK: - UNUserNotificationCenterDelegate (forwarding)

  public func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    handleWillPresent(notification)
    if let previous = previousDelegate,
       previous.responds(to: #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:willPresent:withCompletionHandler:))) {
      previous.userNotificationCenter?(center, willPresent: notification, withCompletionHandler: completionHandler)
    } else {
      completionHandler(Self.foregroundPresentationOptions)
    }
  }

  public func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    handleOpen(response)
    if let previous = previousDelegate,
       previous.responds(to: #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:didReceive:withCompletionHandler:))) {
      previous.userNotificationCenter?(center, didReceive: response, withCompletionHandler: completionHandler)
    } else {
      completionHandler()
    }
  }

  public func userNotificationCenter(_ center: UNUserNotificationCenter, openSettingsFor notification: UNNotification?) {
    if let previous = previousDelegate,
       previous.responds(to: #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:openSettingsFor:))) {
      previous.userNotificationCenter?(center, openSettingsFor: notification)
    }
  }
}
