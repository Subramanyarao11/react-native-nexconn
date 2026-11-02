package com.nexconn

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext

class NexconnModule(reactContext: ReactApplicationContext) :
  NativeNexconnSpec(reactContext) {

  override fun getIntegrationStatus(promise: Promise) {
    promise.resolve("""{"platform":"android","nativeModuleLinked":true,"sdkIntegrated":false}""")
  }

  companion object {
    const val NAME = NativeNexconnSpec.NAME
  }
}
