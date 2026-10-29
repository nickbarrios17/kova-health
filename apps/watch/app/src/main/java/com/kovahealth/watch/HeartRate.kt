package com.kovahealth.watch

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.health.services.client.HealthServices
import androidx.health.services.client.MeasureCallback
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataPointContainer
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.DeltaDataType

/**
 * Live heart rate during a workout via Wear OS Health Services (MeasureClient).
 * Only active while a session is on screen; the running average is sent as the session's avg_hr.
 * If the watch has no sensor or the user declines the permission, the app works without it.
 */
class HeartRate(private val context: Context) {
    private val client = HealthServices.getClient(context).measureClient
    private var callback: MeasureCallback? = null
    private var sum = 0.0
    private var count = 0

    val average: Int? get() = if (count > 0) (sum / count).toInt() else null

    /** Android 16+ uses the granular health permission; older versions use BODY_SENSORS. */
    val permission: String
        get() = if (Build.VERSION.SDK_INT >= 36) "android.permission.health.READ_HEART_RATE" else Manifest.permission.BODY_SENSORS

    fun hasPermission() = ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    fun start(onBpm: (Int) -> Unit) {
        if (callback != null || !hasPermission()) return
        val cb = object : MeasureCallback {
            override fun onAvailabilityChanged(dataType: DeltaDataType<*, *>, availability: Availability) {}
            override fun onDataReceived(data: DataPointContainer) {
                val latest = data.getData(DataType.HEART_RATE_BPM).lastOrNull()?.value ?: return
                if (latest in 30.0..230.0) {
                    sum += latest
                    count++
                    onBpm(latest.toInt())
                }
            }
        }
        runCatching { client.registerMeasureCallback(DataType.HEART_RATE_BPM, cb) }.onSuccess { callback = cb }
    }

    fun stop() {
        callback?.let { runCatching { client.unregisterMeasureCallbackAsync(DataType.HEART_RATE_BPM, it) } }
        callback = null
    }

    fun reset() { sum = 0.0; count = 0 }
}
