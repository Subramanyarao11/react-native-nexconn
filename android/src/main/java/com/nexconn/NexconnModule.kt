package com.nexconn

import com.facebook.react.bridge.ReactApplicationContext

class NexconnModule(reactContext: ReactApplicationContext) :
  NativeNexconnSpec(reactContext) {

  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }

  companion object {
    const val NAME = NativeNexconnSpec.NAME
  }
}
