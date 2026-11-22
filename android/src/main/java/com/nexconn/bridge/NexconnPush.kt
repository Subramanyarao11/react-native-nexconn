package com.nexconn.bridge

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.util.Log
import io.rong.push.PushEventListener
import io.rong.push.PushType
import io.rong.push.RongPushClient
import io.rong.push.TokenBean
import io.rong.push.notification.PushNotificationMessage
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/**
 * Push notification plumbing for the bundled RongPush client (part of the
 * Nexconn Android SDK; FCM delivery needs `ai.nexconn.chat:push-fcm`).
 *
 * `RongPushClient` holds one global [PushEventListener]. `NCEngine.initialize`
 * wraps whatever listener is installed in its own proxy (it intercepts
 * `onTokenReceived` to report the token, then forwards). This listener is
 * therefore installed exactly once per process, as early as possible
 * ([NexconnPushInitProvider]), and forwards every callback to the listener it
 * replaced, so app or SDK listeners keep working.
 *
 * A tapped notification is emitted as `Push.onNotificationOpened`. When no JS
 * runtime is attached (cold start: the tap arrives before React Native runs)
 * it is kept as the "initial notification" until JS reads it. Each record
 * carries a unique `id` so JS can de-duplicate.
 */
internal object NexconnPush {
  private const val TAG = "NexconnPush"
  private val installed = AtomicBoolean(false)
  private val counter = AtomicLong(0)

  @Volatile private var previous: PushEventListener? = null
  @Volatile private var initialOpen: Map<String, Any?>? = null
  @Volatile var lastToken: Map<String, Any?>? = null
    private set

  /** Installs the forwarding listener once per process. Safe to call repeatedly. */
  fun install() {
    if (!installed.compareAndSet(false, true)) return
    try {
      val current = RongPushClient.getPushEventListener()
      if (current !== listener) previous = current
      RongPushClient.setPushEventListener(listener)
    } catch (t: Throwable) {
      Log.w(TAG, "could not install push event listener", t)
    }
  }

  /** Returns and clears the notification tap recorded before JS read it. */
  fun takeInitialNotification(): Map<String, Any?>? {
    val value = initialOpen
    initialOpen = null
    return value
  }

  fun describe(message: PushNotificationMessage, type: PushType?): Map<String, Any?> = mapOf(
    "id" to "android-${System.currentTimeMillis()}-${counter.incrementAndGet()}",
    "platform" to "android",
    "pushType" to type?.getName(),
    "channelType" to message.conversationType?.getValue(),
    "channelId" to message.targetId,
    "senderId" to message.senderId,
    "senderName" to message.senderName,
    "pushId" to message.pushId,
    "objectName" to message.objectName,
    "title" to message.pushTitle,
    "body" to message.pushContent,
    "pushData" to message.pushData,
    "extra" to message.extra,
    "receivedTime" to message.receivedTime,
    "notificationId" to message.notificationId,
    "sourceType" to message.sourceType?.name,
    "raw" to mapOf(
      "conversationType" to message.conversationType?.getName(),
      "toId" to message.toId,
      "targetUserName" to message.targetUserName,
      "busChannel" to message.busChannel,
      "intent" to message.intent,
      "showDetail" to message.isShowDetail,
      "channelIdFCM" to message.channelIdFCM,
      "imageUrlFCM" to message.imageUrlFCM,
    ),
  )

  private val listener = object : PushEventListener {
    override fun preNotificationMessageArrived(
      context: Context?,
      type: PushType?,
      message: PushNotificationMessage?,
    ): Boolean = previous?.preNotificationMessageArrived(context, type, message) ?: false

    override fun afterNotificationMessageArrived(
      context: Context?,
      type: PushType?,
      message: PushNotificationMessage?,
    ) {
      if (message != null) safely { NexconnBridge.emitPush("Push.onNotificationReceived", describe(message, type)) }
      previous?.afterNotificationMessageArrived(context, type, message)
    }

    override fun onNotificationMessageClicked(
      context: Context?,
      type: PushType?,
      message: PushNotificationMessage?,
    ): Boolean {
      if (message != null) {
        safely {
          val payload = describe(message, type)
          // Cold start: no JS runtime yet, keep it for getInitialNotification.
          if (!NexconnBridge.emitPush("Push.onNotificationOpened", payload)) initialOpen = payload
        }
      }
      // false keeps the SDK default, which opens the app (launch intent with
      // rong://<package>/conversation/<type>?targetId=... as data).
      return previous?.onNotificationMessageClicked(context, type, message) ?: false
    }

    override fun onThirdPartyPushState(type: PushType?, action: String?, resultCode: Long) {
      previous?.onThirdPartyPushState(type, action, resultCode)
    }

    override fun onTokenReceived(type: PushType?, token: String?) {
      if (!token.isNullOrEmpty()) {
        safely {
          val payload = mapOf("pushType" to type?.getName(), "token" to token, "platform" to "android")
          lastToken = payload
          NexconnBridge.emitPush("Push.onTokenReceived", payload)
        }
      }
      previous?.onTokenReceived(type, token)
    }

    override fun onTokenReportResult(type: PushType?, code: Int, finalType: PushType?, finalToken: String?) {
      safely {
        NexconnBridge.emitPush(
          "Push.onTokenReportResult",
          mapOf("pushType" to type?.getName(), "code" to code, "finalPushType" to finalType?.getName()),
        )
      }
      previous?.onTokenReportResult(type, code, finalType, finalToken)
    }

    override fun onGetTokenError(type: PushType?, code: Long, message: String?) {
      safely {
        NexconnBridge.emitPush(
          "Push.onTokenError",
          mapOf("pushType" to type?.getName(), "code" to code, "message" to message, "platform" to "android"),
        )
      }
      previous?.onGetTokenError(type, code, message)
    }

    override fun onStartTokenReport(tokens: MutableList<TokenBean>?): MutableList<TokenBean>? =
      previous?.onStartTokenReport(tokens) ?: tokens
  }

  private inline fun safely(block: () -> Unit) {
    try {
      block()
    } catch (t: Throwable) {
      Log.w(TAG, "push callback failed", t)
    }
  }
}

/**
 * Installs [NexconnPush]'s listener at process start, before
 * `Application.onCreate`, so a notification tap that cold-starts the app is
 * captured. Declared in the library manifest; apps can remove it with
 * `tools:node="remove"` and call nothing else (the bridge installs the
 * listener when the React Native module loads, which misses cold-start taps).
 */
class NexconnPushInitProvider : ContentProvider() {
  override fun onCreate(): Boolean {
    NexconnPush.install()
    return true
  }

  override fun query(uri: Uri, p: Array<out String>?, s: String?, a: Array<out String>?, o: String?): Cursor? = null
  override fun getType(uri: Uri): String? = null
  override fun insert(uri: Uri, values: ContentValues?): Uri? = null
  override fun delete(uri: Uri, s: String?, a: Array<out String>?): Int = 0
  override fun update(uri: Uri, v: ContentValues?, s: String?, a: Array<out String>?): Int = 0
}
