package com.antoalex07.ddcmarketingmobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.location.Location
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.*
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.*
import kotlin.collections.ArrayList

class LocationForegroundService : Service() {
  companion object {
    private const val CHANNEL_ID = "ddc_location_channel"
    private const val CHANNEL_NAME = "Location Tracking"
    private const val NOTIFICATION_ID = 4567
    private const val LOCATION_DEBUG_ENABLED_KEY = "location_debug_enabled"
    private const val LOCATION_DEBUG_ENABLED_UNTIL_KEY = "location_debug_enabled_until"
    private const val LOCATION_DIAGNOSTICS_LOG_FILE_NAME = "location_diagnostics.jsonl"
    const val ACTION_START = "com.antoalex07.ddcmarketingmobile.ACTION_START_LOCATION_SERVICE"
    const val ACTION_STOP = "com.antoalex07.ddcmarketingmobile.ACTION_STOP_LOCATION_SERVICE"
  }

  private lateinit var fusedClient: FusedLocationProviderClient
  private lateinit var locationCallback: LocationCallback
  private var isRunning = false

  override fun onCreate() {
    super.onCreate()
    fusedClient = LocationServices.getFusedLocationProviderClient(this)

    locationCallback = object : LocationCallback() {
      override fun onLocationResult(result: LocationResult) {
        try {
          val locations = result.locations
          if (locations != null && locations.isNotEmpty()) {
            persistLocations(locations)
          }
        } catch (e: Exception) {
          persistDiagnostic("native_location_callback_error", mapOf("error" to (e.message ?: "")))
        }
      }
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    intent?.action?.let { action ->
      when (action) {
        ACTION_START -> startForegroundServiceInternal()
        ACTION_STOP -> stopSelf()
      }
    }
    return START_STICKY
  }

  private fun startForegroundServiceInternal() {
    if (isRunning) return

    createNotificationChannel()
    val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("DDC Marketing: Tracking")
      .setContentText("Background location tracking is active")
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setOngoing(true)
      .build()

    startForeground(NOTIFICATION_ID, notification)

    try {
      val request = LocationRequest.create().apply {
        interval = 5 * 60 * 1000L // 5 minutes
        fastestInterval = 60 * 1000L // 1 minute
        priority = Priority.PRIORITY_HIGH_ACCURACY
      }

      fusedClient.requestLocationUpdates(request, locationCallback, mainLooper)
      isRunning = true
      persistDiagnostic("native_service_started", null)
    } catch (e: Exception) {
      persistDiagnostic("native_service_start_failed", mapOf("error" to (e.message ?: "")))
    }
  }

  private fun persistLocations(locations: List<Location>) {
    try {
      val file = File(filesDir, LOCATION_DIAGNOSTICS_LOG_FILE_NAME)
      val entries = ArrayList<String>()

      locations.forEach { loc ->
        val obj = JSONObject()
        obj.put("timestamp", SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).format(Date()))
        obj.put("source", "native_foreground_service")
        obj.put("event", "location_update")
        val details = JSONObject()
        details.put("latitude", loc.latitude)
        details.put("longitude", loc.longitude)
        details.put("accuracy", loc.accuracy)
        details.put("speed", if (loc.hasSpeed()) loc.speed else JSONObject.NULL)
        details.put("bearing", if (loc.hasBearing()) loc.bearing else JSONObject.NULL)
        details.put("provider", loc.provider)
        obj.put("details", details)
        entries.add(obj.toString())
      }

      val existing = if (file.exists()) file.readLines() else emptyList()
      val merged = (existing + entries).takeLast(300)
      val out = if (merged.isEmpty()) "" else merged.joinToString("\n") + "\n"
      file.writeText(out)

      persistDiagnostic("native_locations_persisted", mapOf("count" to locations.size))
    } catch (e: Exception) {
      persistDiagnostic("native_persist_locations_error", mapOf("error" to (e.message ?: "")))
    }
  }

  private fun persistDiagnostic(event: String, details: Map<String, Any?>?) {
    try {
      val file = File(filesDir, LOCATION_DIAGNOSTICS_LOG_FILE_NAME)
      val obj = JSONObject()
      obj.put("timestamp", SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).format(Date()))
      obj.put("source", "native_foreground_service")
      obj.put("event", event)
      obj.put("details", JSONObject(details ?: emptyMap<String, Any?>()))

      val existing = if (file.exists()) file.readLines() else emptyList()
      val merged = (existing + obj.toString()).takeLast(300)
      val out = if (merged.isEmpty()) "" else merged.joinToString("\n") + "\n"
      file.writeText(out)
    } catch (_: Exception) {
      // best-effort
    }
  }

  override fun onDestroy() {
    try {
      fusedClient.removeLocationUpdates(locationCallback)
    } catch (_: Exception) {
    }
    isRunning = false
    persistDiagnostic("native_service_stopped", null)
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW)
      nm.createNotificationChannel(channel)
    }
  }
}
