package com.antoalex07.ddcmarketingmobile

import android.content.Context
import android.content.Intent
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class LocationServiceModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  companion object {
    private const val MODULE_NAME = "DDCLocationService"
    private const val PREFS_NAME = "ddc_native"
    private const val SESSION_ID_KEY = "active_session_id"
  }

  override fun getName(): String = MODULE_NAME

  private fun prefs() = reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  @ReactMethod
  fun startLocationService(sessionId: Double, promise: Promise) {
    try {
      // persist session id natively
      prefs().edit().putLong(SESSION_ID_KEY, sessionId.toLong()).apply()

      val intent = Intent(reactContext, LocationForegroundService::class.java)
      intent.action = LocationForegroundService.ACTION_START
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
        reactContext.startForegroundService(intent)
      } else {
        reactContext.startService(intent)
      }

      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("START_SERVICE_FAILED", e)
    }
  }

  @ReactMethod
  fun stopLocationService(promise: Promise) {
    try {
      // clear session id
      prefs().edit().remove(SESSION_ID_KEY).apply()

      val intent = Intent(reactContext, LocationForegroundService::class.java)
      intent.action = LocationForegroundService.ACTION_STOP
      reactContext.startService(intent)

      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("STOP_SERVICE_FAILED", e)
    }
  }
}
