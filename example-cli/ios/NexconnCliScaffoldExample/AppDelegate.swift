import UIKit
#if canImport(Nexconn)
import Nexconn
#endif

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    #if canImport(Nexconn)
    // Routes Nexconn notification taps (including the one that launches the
    // app) to JS: client.push.onNotificationOpened / useNotificationOpened.
    NexconnBridge.installNotificationHandler()
    #endif
    return true
  }

  // APNs token -> Nexconn SDK (and JS `pushTokenReceived`). Requires the Push
  // Notifications capability; without it iOS reports the failure below.
  func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    #if canImport(Nexconn)
    NexconnBridge.registerDeviceToken(deviceToken)
    #endif
  }

  func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
    #if canImport(Nexconn)
    NexconnBridge.registerDeviceTokenFailed(error)
    #endif
  }
}
