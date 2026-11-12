package com.nexconn

import ai.nexconn.chat.NCEngine
import ai.nexconn.chat.channel.DirectChannel
import ai.nexconn.chat.error.NCError
import ai.nexconn.chat.handler.ConnectHandler
import ai.nexconn.chat.handler.ConnectionStatusHandler
import ai.nexconn.chat.handler.MessageHandler
import ai.nexconn.chat.handler.SendMessageHandler
import ai.nexconn.chat.message.Message
import ai.nexconn.chat.message.TextMessage
import ai.nexconn.chat.message.model.MessageReceivedEvent
import ai.nexconn.chat.model.ConnectionStatusChangedEvent
import ai.nexconn.chat.params.AreaCode
import ai.nexconn.chat.params.ConnectParams
import ai.nexconn.chat.params.InitParams
import ai.nexconn.chat.params.SendMessageParams
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UiThreadUtil
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONObject

class NexconnModule(reactContext: ReactApplicationContext) :
  NativeNexconnSpec(reactContext) {

  /** Session whose events may reach JavaScript; null when none is active. */
  @Volatile private var sessionId: String? = null
  @Volatile private var invalidated = false

  override fun getIntegrationStatus(promise: Promise) {
    promise.resolve(
      JSONObject()
        .put("platform", "android")
        .put("nativeModuleLinked", true)
        .put("sdkIntegrated", true)
        .put("sdkVersion", NCEngine.getVersion())
        .toString()
    )
  }

  override fun initialize(appKey: String, areaCode: String, promise: Promise) {
    val area = AreaCode.entries.firstOrNull { it.name == areaCode }
    if (appKey.isEmpty() || area == null) {
      promise.reject(INVALID_ARGUMENT, "appKey and a known areaCode are required")
      return
    }
    // Nexconn documents initialization during application startup; run it on
    // the main thread like Application.onCreate would.
    UiThreadUtil.runOnUiThread {
      synchronized(lock) {
        val existing = initializedConfig
        val requested = "$appKey|$areaCode"
        when {
          existing == null ->
            try {
              val params = InitParams(reactApplicationContext.applicationContext, appKey)
              params.areaCode = area
              NCEngine.initialize(params)
              initializedConfig = requested
              promise.resolve(null)
            } catch (error: Throwable) {
              promise.reject(NATIVE_PREFIX + "-1", error.message ?: "initialize failed", error)
            }
          existing == requested -> promise.resolve(null)
          else ->
            promise.reject(
              "nexconn/already_initialized",
              "The native SDK is already initialized with a different configuration " +
                "and cannot be re-initialized in this process"
            )
        }
      }
    }
  }

  override fun connect(token: String, timeoutSeconds: Double, sessionId: String, promise: Promise) {
    if (!requireInitialized(promise)) return
    if (token.isEmpty() || sessionId.isEmpty()) {
      promise.reject(INVALID_ARGUMENT, "token and sessionId are required")
      return
    }
    // Handlers are registered before connecting so offline messages arrive.
    this.sessionId = sessionId
    NCEngine.addConnectionStatusHandler(
      HANDLER_ID,
      object : ConnectionStatusHandler {
        override fun onConnectionStatusChanged(event: ConnectionStatusChangedEvent) {
          if (!isCurrent(sessionId)) return
          emitOnConnectionStatusChanged(
            JSONObject().put("sessionId", sessionId).put("status", event.status.value).toString()
          )
        }
      }
    )
    NCEngine.addMessageHandler(
      HANDLER_ID,
      object : MessageHandler {
        override fun onMessageReceived(event: MessageReceivedEvent) {
          if (!isCurrent(sessionId)) return
          emitOnMessageReceived(
            JSONObject()
              .put("sessionId", sessionId)
              .put("message", messageToJson(event.message))
              .put("offline", event.offline == true)
              .put("left", event.left ?: 0)
              .toString()
          )
        }
      }
    )

    val settled = AtomicBoolean(false)
    val params = ConnectParams(token)
    params.timeout = timeoutSeconds.toInt()
    NCEngine.connect(
      params,
      object : ConnectHandler {
        override fun onResult(userId: String?, error: NCError?) {
          if (!settled.compareAndSet(false, true)) return
          if (error != null || userId == null) {
            if (isCurrent(sessionId)) clearSession()
            reject(promise, error, "connect failed")
          } else {
            promise.resolve(JSONObject().put("userId", userId).toString())
          }
        }
      }
    )
  }

  override fun disconnect(disablePush: Boolean, promise: Promise) {
    if (!requireInitialized(promise)) return
    clearSession()
    NCEngine.disconnect(disablePush)
    promise.resolve(null)
  }

  override fun getConnectionStatus(promise: Promise) {
    if (!requireInitialized(promise)) return
    promise.resolve(NCEngine.getConnectionStatus().value)
  }

  override fun sendDirectText(targetUserId: String, text: String, promise: Promise) {
    if (!requireInitialized(promise)) return
    if (targetUserId.isEmpty() || text.isEmpty()) {
      promise.reject(INVALID_ARGUMENT, "targetUserId and text are required")
      return
    }
    val settled = AtomicBoolean(false)
    DirectChannel(targetUserId).sendMessage(
      SendMessageParams(TextMessage(text)),
      object : SendMessageHandler {
        override fun onAttached(message: Message) = Unit

        override fun onResult(message: Message?, error: NCError?) {
          if (!settled.compareAndSet(false, true)) return
          if (error != null || message == null) {
            reject(promise, error, "send failed")
          } else {
            promise.resolve(messageToJson(message).toString())
          }
        }
      }
    )
  }

  override fun invalidate() {
    invalidated = true
    clearSession()
    super.invalidate()
  }

  private fun isCurrent(session: String) = !invalidated && sessionId == session

  private fun clearSession() {
    sessionId = null
    NCEngine.removeConnectionStatusHandler(HANDLER_ID)
    NCEngine.removeMessageHandler(HANDLER_ID)
  }

  private fun requireInitialized(promise: Promise): Boolean {
    if (initializedConfig != null) return true
    promise.reject("nexconn/not_initialized", "Call initialize() before using Nexconn Chat")
    return false
  }

  private fun reject(promise: Promise, error: NCError?, fallback: String) {
    promise.reject(NATIVE_PREFIX + (error?.code ?: -1), error?.message ?: fallback)
  }

  private fun messageToJson(message: Message): JSONObject {
    val content = message.content
    val json =
      JSONObject()
        .put("messageId", message.messageId ?: JSONObject.NULL)
        .put("clientId", message.clientId)
        .put("channelType", message.channelIdentifier.channelType.name.lowercase(Locale.ROOT))
        .put("channelId", message.channelIdentifier.channelId)
        .put("direction", message.direction.name.lowercase(Locale.ROOT))
        .put("senderUserId", message.senderUserId ?: JSONObject.NULL)
        .put("sentTime", message.sentTime)
        .put("messageType", message.messageType ?: JSONObject.NULL)
    if (content is TextMessage) {
      json.put("contentType", "text").put("text", content.text)
    } else {
      json.put("contentType", "unsupported")
    }
    return json
  }

  companion object {
    const val NAME = NativeNexconnSpec.NAME

    private const val HANDLER_ID = "react-native-nexconn"
    private const val INVALID_ARGUMENT = "nexconn/invalid_argument"
    private const val NATIVE_PREFIX = "nexconn/native/"

    // The native engine is a process-wide singleton that outlives JS reloads.
    private val lock = Any()
    @Volatile private var initializedConfig: String? = null
  }
}
