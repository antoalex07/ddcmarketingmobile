package com.antoalex07.ddcmarketingmobile

import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import java.io.File
import org.json.JSONObject

class DDCNativeDiagnosticsModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  companion object {
    private const val MODULE_NAME = "DDCNativeDiagnostics"
    private const val PREFS_NAME = "ddc_diagnostics"
    private const val LOCATION_DEBUG_ENABLED_KEY = "location_debug_enabled"
    private const val LOCATION_DEBUG_ENABLED_UNTIL_KEY = "location_debug_enabled_until"
    private const val LOCATION_DIAGNOSTICS_LOG_FILE_NAME = "location_diagnostics.jsonl"
    private const val MAX_LOCATION_LOG_ENTRIES = 300
  }

  override fun getName(): String = MODULE_NAME

  private fun prefs() = reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  private fun diagnosticsFile(): File = File(reactContext.filesDir, LOCATION_DIAGNOSTICS_LOG_FILE_NAME)

  private fun isEnabled(): Boolean {
    val preferences = prefs()
    val enabled = preferences.getBoolean(LOCATION_DEBUG_ENABLED_KEY, false)
    val enabledUntil = preferences.getLong(LOCATION_DEBUG_ENABLED_UNTIL_KEY, 0L)

    if (!enabled) {
      return false
    }

    if (enabledUntil > 0L && System.currentTimeMillis() > enabledUntil) {
      preferences
        .edit()
        .putBoolean(LOCATION_DEBUG_ENABLED_KEY, false)
        .putLong(LOCATION_DEBUG_ENABLED_UNTIL_KEY, 0L)
        .apply()
      return false
    }

    return true
  }

  private fun statusMap() = Arguments.createMap().apply {
    val enabledUntil = prefs().getLong(LOCATION_DEBUG_ENABLED_UNTIL_KEY, 0L)
    putBoolean("enabled", isEnabled())
    putDouble("enabledUntil", enabledUntil.toDouble())
    putString("path", diagnosticsFile().absolutePath)
  }

  private fun appendJsonLine(line: String) {
    val file = diagnosticsFile()
    val existingLines = if (file.exists()) file.readLines() else emptyList()
    val mergedLines = (existingLines + line).takeLast(MAX_LOCATION_LOG_ENTRIES)
    val output = if (mergedLines.isEmpty()) "" else mergedLines.joinToString("\n") + "\n"
    file.writeText(output)
  }

  @ReactMethod
  fun setLocationDiagnosticsEnabled(enabled: Boolean, ttlHours: Double, promise: Promise) {
    try {
      val enabledUntil = if (enabled) {
        System.currentTimeMillis() + ttlHours.coerceAtLeast(1.0).toLong() * 60L * 60L * 1000L
      } else {
        0L
      }

      prefs()
        .edit()
        .putBoolean(LOCATION_DEBUG_ENABLED_KEY, enabled)
        .putLong(LOCATION_DEBUG_ENABLED_UNTIL_KEY, enabledUntil)
        .apply()

      promise.resolve(statusMap())
    } catch (error: Exception) {
      promise.reject("DDC_DIAGNOSTICS_SET_FAILED", error)
    }
  }

  @ReactMethod
  fun getLocationDiagnosticsStatus(promise: Promise) {
    try {
      promise.resolve(statusMap())
    } catch (error: Exception) {
      promise.reject("DDC_DIAGNOSTICS_STATUS_FAILED", error)
    }
  }

  @ReactMethod
  fun appendLocationDiagnostic(event: String, details: ReadableMap?, promise: Promise) {
    try {
      if (!isEnabled()) {
        promise.resolve(false)
        return
      }

      val payload = JSONObject()
      payload.put("timestamp", System.currentTimeMillis())
      payload.put("source", "native_module")
      payload.put("event", event)
      payload.put("details", JSONObject(details?.toHashMap() ?: emptyMap<String, Any>()))

      appendJsonLine(payload.toString())
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("DDC_DIAGNOSTICS_APPEND_FAILED", error)
    }
  }

  @ReactMethod
  fun clearLocationDiagnostics(promise: Promise) {
    try {
      val file = diagnosticsFile()
      if (file.exists()) {
        file.delete()
      }

      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("DDC_DIAGNOSTICS_CLEAR_FAILED", error)
    }
  }
}
