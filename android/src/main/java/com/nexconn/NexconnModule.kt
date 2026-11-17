package com.nexconn

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.nexconn.bridge.NexconnBridge

/**
 * TurboModule entry point. All SDK work is delegated to [NexconnBridge], a
 * process-wide object (the Nexconn SDK is a singleton). This module only
 * attaches the event emitter for the lifetime of the React instance.
 */
class NexconnModule(reactContext: ReactApplicationContext) :
  NativeNexconnSpec(reactContext) {

  private val emitter: (String) -> Unit = { json ->
    try {
      emitOnNativeEvent(json)
    } catch (_: Throwable) {
      // The JS event emitter callback is not installed (yet / anymore).
    }
  }

  init {
    NexconnBridge.attach(reactContext, emitter)
  }

  override fun getIntegrationStatus(promise: Promise) {
    promise.resolve(
      """{"platform":"android","nativeModuleLinked":true,"sdkIntegrated":${NexconnBridge.isSdkIntegrated()}}""",
    )
  }

  override fun invoke(method: String, argsJson: String, promise: Promise) {
    NexconnBridge.invoke(
      method,
      argsJson,
      { json -> promise.resolve(json) },
      { json -> promise.reject("NEXCONN_ERROR", json) },
    )
  }

  override fun invalidate() {
    // Stop delivering events into a torn-down JS runtime. SDK handlers stay
    // registered (they are process-wide) and reattach on the next instance.
    NexconnBridge.detach(emitter)
    super.invalidate()
  }

  companion object {
    const val NAME = NativeNexconnSpec.NAME
  }
}
