package com.antoalex07.ddcmarketingmobile

import android.app.Application
import android.content.res.Configuration
import android.os.Build
import android.os.Process
import android.util.Log
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import kotlin.concurrent.thread
import kotlin.random.Random
import org.json.JSONArray
import org.json.JSONObject

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactNativeHost

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper

class MainApplication : Application(), ReactApplication {
  companion object {
    private const val CRASH_LOG_FILE_NAME = "native_crash_logs.jsonl"
    private const val LOCATION_DIAGNOSTICS_LOG_FILE_NAME = "location_diagnostics.jsonl"
    private const val MAX_CRASH_LOG_ENTRIES = 100
    private const val MAX_RECENT_LOCATION_DIAGNOSTICS = 25
    private const val NATIVE_CRASH_UPLOAD_URL = "http://ddcpharmacy.com/api/logs/mobile-native-crash/bulk"
    private const val NATIVE_CRASH_UPLOAD_CONNECT_TIMEOUT_MS = 10000
    private const val NATIVE_CRASH_UPLOAD_READ_TIMEOUT_MS = 10000
    private const val DEVICE_INSTALLATION_ID_PREFS = "native_crash_logger"
    private const val DEVICE_INSTALLATION_ID_KEY = "device_installation_id"
  }

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
      this,
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // Packages that cannot be autolinked yet can be added manually here, for example:
              // add(MyReactNativePackage())
              add(DDCNativeDiagnosticsPackage())
            }

          override fun getJSMainModuleName(): String = ".expo/.virtual-metro-entry"

          override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

          override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
      }
  )

  override val reactHost: ReactHost
    get() = ReactNativeHostWrapper.createReactHost(applicationContext, reactNativeHost)

  private fun isoNow(): String {
    val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    formatter.timeZone = TimeZone.getTimeZone("UTC")
    return formatter.format(Date())
  }

  private fun appendCrashLogLine(line: String) {
    try {
      val crashFile = File(filesDir, CRASH_LOG_FILE_NAME)
      val existingLines = if (crashFile.exists()) crashFile.readLines() else emptyList()
      val mergedLines = (existingLines + line).takeLast(MAX_CRASH_LOG_ENTRIES)
      val output = if (mergedLines.isEmpty()) "" else mergedLines.joinToString("\n") + "\n"
      crashFile.writeText(output)
    } catch (error: Exception) {
      Log.e("MainApplication", "Failed to append native crash log", error)
    }
  }

  private fun persistNativeCrash(thread: Thread, throwable: Throwable) {
    val payload = JSONObject()
    payload.put("timestamp", isoNow())
    payload.put("platform", "android")
    payload.put("type", "uncaught_exception")
    payload.put("is_fatal", true)
    payload.put("thread", thread.name)
    payload.put("name", throwable.javaClass.name)
    payload.put("message", throwable.message ?: "Unknown native crash")
    payload.put("stack", Log.getStackTraceString(throwable))
    payload.put("app_version", BuildConfig.VERSION_NAME)
    payload.put("app_build", BuildConfig.VERSION_CODE)
    payload.put("device_model", Build.MODEL ?: "unknown")
    payload.put("device_manufacturer", Build.MANUFACTURER ?: "unknown")
    payload.put("os_version", Build.VERSION.RELEASE ?: "unknown")
    payload.put("sdk_int", Build.VERSION.SDK_INT)

    appendCrashLogLine(payload.toString())
  }

  private fun getOrCreateDeviceInstallationId(): String {
    val prefs = getSharedPreferences(DEVICE_INSTALLATION_ID_PREFS, MODE_PRIVATE)
    val existingId = prefs.getString(DEVICE_INSTALLATION_ID_KEY, null)

    if (!existingId.isNullOrBlank()) {
      return existingId
    }

    val generatedId = "android-${System.currentTimeMillis()}-${Random.nextInt(100000, 999999)}"
    prefs.edit().putString(DEVICE_INSTALLATION_ID_KEY, generatedId).apply()
    return generatedId
  }

  private fun buildNativeCrashUploadPayload(lines: List<String>): String {
    val logs = JSONArray()

    for (line in lines) {
      if (line.isBlank()) {
        continue
      }

      try {
        logs.put(JSONObject(line))
      } catch (_: Exception) {
        val fallback = JSONObject()
        fallback.put("timestamp", isoNow())
        fallback.put("platform", "android")
        fallback.put("type", "raw_line")
        fallback.put("is_fatal", true)
        fallback.put("message", line)
        logs.put(fallback)
      }
    }

    val payload = JSONObject()
    payload.put("platform", "android")
    payload.put("package_name", packageName)
    payload.put("app_version", BuildConfig.VERSION_NAME)
    payload.put("app_build", BuildConfig.VERSION_CODE)
    payload.put("device_installation_id", getOrCreateDeviceInstallationId())
    payload.put("device_model", Build.MODEL ?: "unknown")
    payload.put("device_manufacturer", Build.MANUFACTURER ?: "unknown")
    payload.put("os_version", Build.VERSION.RELEASE ?: "unknown")
    payload.put("sdk_int", Build.VERSION.SDK_INT)
    payload.put("recent_location_diagnostics", readRecentJsonLines(LOCATION_DIAGNOSTICS_LOG_FILE_NAME, MAX_RECENT_LOCATION_DIAGNOSTICS))
    payload.put("logs", logs)

    return payload.toString()
  }

  private fun readRecentJsonLines(fileName: String, maxLines: Int): JSONArray {
    val entries = JSONArray()

    try {
      val file = File(filesDir, fileName)
      if (!file.exists()) {
        return entries
      }

      val lines = file
        .readLines()
        .map { it.trim() }
        .filter { it.isNotEmpty() }
        .takeLast(maxLines)

      for (line in lines) {
        try {
          entries.put(JSONObject(line))
        } catch (_: Exception) {
          val fallback = JSONObject()
          fallback.put("timestamp", isoNow())
          fallback.put("source", "native_file_reader")
          fallback.put("event", "raw_location_diagnostic")
          fallback.put("message", line)
          entries.put(fallback)
        }
      }
    } catch (error: Exception) {
      Log.w("MainApplication", "Failed to read recent location diagnostics", error)
    }

    return entries
  }

  private fun uploadCrashPayload(payload: String): Boolean {
    var connection: HttpURLConnection? = null

    return try {
      connection = (URL(NATIVE_CRASH_UPLOAD_URL).openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = NATIVE_CRASH_UPLOAD_CONNECT_TIMEOUT_MS
        readTimeout = NATIVE_CRASH_UPLOAD_READ_TIMEOUT_MS
        doOutput = true
        setRequestProperty("Content-Type", "application/json")
        setRequestProperty("Accept", "application/json")
      }

      connection.outputStream.use { outputStream ->
        outputStream.write(payload.toByteArray(StandardCharsets.UTF_8))
        outputStream.flush()
      }

      val statusCode = connection.responseCode
      if (statusCode !in 200..299) {
        false
      } else {
        val responseBody = connection.inputStream.bufferedReader().use { it.readText() }
        if (responseBody.isBlank()) {
          true
        } else {
          try {
            JSONObject(responseBody).optBoolean("success", true)
          } catch (_: Exception) {
            true
          }
        }
      }
    } catch (error: Exception) {
      Log.w("MainApplication", "Failed to upload native crash logs", error)
      false
    } finally {
      connection?.disconnect()
    }
  }

  private fun uploadPendingNativeCrashLogs() {
    try {
      val crashFile = File(filesDir, CRASH_LOG_FILE_NAME)
      if (!crashFile.exists()) {
        return
      }

      val lines = crashFile
        .readLines()
        .map { it.trim() }
        .filter { it.isNotEmpty() }

      if (lines.isEmpty()) {
        return
      }

      val payload = buildNativeCrashUploadPayload(lines)
      val uploaded = uploadCrashPayload(payload)

      if (uploaded) {
        crashFile.delete()
      }
    } catch (error: Exception) {
      Log.w("MainApplication", "Native crash log upload cycle failed", error)
    }
  }

  private fun uploadPendingNativeCrashLogsAsync() {
    thread(start = true, name = "native-crash-upload") {
      uploadPendingNativeCrashLogs()
    }
  }

  private fun installNativeCrashLogging() {
    val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()

    Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
      try {
        persistNativeCrash(thread, throwable)
      } catch (_: Exception) {
      }

      if (defaultHandler != null) {
        defaultHandler.uncaughtException(thread, throwable)
      } else {
        Process.killProcess(Process.myPid())
        kotlin.system.exitProcess(10)
      }
    }
  }

  override fun onCreate() {
    super.onCreate()
    installNativeCrashLogging()
    uploadPendingNativeCrashLogsAsync()
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
