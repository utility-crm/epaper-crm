package com.epaperspace.publisher.data.upload

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.epaperspace.publisher.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import org.koin.android.ext.android.inject

/**
 * Keeps a running upload alive when the publisher leaves the app. A 200-page paper over mobile
 * data takes minutes; without a foreground service the process is a background-execution candidate
 * and the upload dies half-committed, which the worker then rejects at commit time.
 */
class UploadService : Service() {

  private val uploader: EpaperUploader by inject()
  private val scope = CoroutineScope(SupervisorJob())
  private var work: Job? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_CANCEL -> {
        work?.cancel()
        stop()
        return START_NOT_STICKY
      }
    }

    val epaperId = intent?.getStringExtra(EXTRA_EPAPER_ID)
    val uri = intent?.getStringExtra(EXTRA_URI)?.let(Uri::parse)
    val freePages = intent?.getIntExtra(EXTRA_FREE_PAGES, 0) ?: 0
    if (epaperId == null || uri == null) {
      stop()
      return START_NOT_STICKY
    }

    startForeground(NOTIFICATION_ID, buildNotification("Preparing upload", null))
    observeProgress()

    work = scope.launch {
      uploader.upload(epaperId, uri, freePages)
      stop()
    }

    // Re-delivering the intent would restart an upload the publisher may have abandoned, and
    // uploadBegin destroys the paper's existing pages. Never resurrect this automatically.
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    scope.cancel()
    super.onDestroy()
  }

  private fun observeProgress() {
    scope.launch {
      uploader.state.collectLatest { state ->
        val (text, progress) = when (state) {
          is UploadState.Idle, UploadState.Preparing -> "Preparing upload" to null
          is UploadState.Rendering -> "Rendering page ${state.done} of ${state.total}" to
            (state.done to state.total)
          is UploadState.Uploading -> "Uploading page ${state.done} of ${state.total}" to
            (state.done to state.total)
          UploadState.Committing -> "Finishing up" to null
          UploadState.Done -> "Upload complete" to null
          is UploadState.Failed -> "Upload failed: ${state.message}" to null
        }
        notify(buildNotification(text, progress))
      }
    }
  }

  private fun buildNotification(text: String, progress: Pair<Int, Int>?): Notification {
    val cancel = Intent(this, UploadService::class.java).setAction(ACTION_CANCEL)
    val cancelIntent = android.app.PendingIntent.getService(
      this,
      0,
      cancel,
      android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE,
    )

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Uploading paper")
      .setContentText(text)
      .setSmallIcon(R.drawable.ic_launcher_foreground)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .addAction(0, "Cancel", cancelIntent)
      .apply {
        if (progress != null) {
          setProgress(progress.second, progress.first, false)
        } else {
          setProgress(0, 0, true)
        }
      }
      .build()
  }

  /**
   * Posting is a no-op without the runtime permission on API 33+. The upload itself does not
   * depend on the notification, so a denied permission must not take the service down.
   */
  private fun notify(notification: Notification) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      val granted = ContextCompat.checkSelfPermission(
        this,
        android.Manifest.permission.POST_NOTIFICATIONS,
      ) == PackageManager.PERMISSION_GRANTED
      if (!granted) return
    }
    NotificationManagerCompat.from(this).notify(NOTIFICATION_ID, notification)
  }

  private fun stop() {
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  companion object {
    private const val CHANNEL_ID = "uploads"
    private const val NOTIFICATION_ID = 4201
    private const val ACTION_CANCEL = "com.epaperspace.publisher.CANCEL_UPLOAD"
    private const val EXTRA_EPAPER_ID = "epaper_id"
    private const val EXTRA_URI = "uri"
    private const val EXTRA_FREE_PAGES = "free_pages"

    fun start(context: Context, epaperId: String, uri: Uri, freePageCount: Int) {
      ensureChannel(context)
      val intent = Intent(context, UploadService::class.java)
        .putExtra(EXTRA_EPAPER_ID, epaperId)
        .putExtra(EXTRA_URI, uri.toString())
        .putExtra(EXTRA_FREE_PAGES, freePageCount)
      ContextCompat.startForegroundService(context, intent)
    }

    fun cancel(context: Context) {
      context.startService(
        Intent(context, UploadService::class.java).setAction(ACTION_CANCEL)
      )
    }

    private fun ensureChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Uploads",
        NotificationManager.IMPORTANCE_LOW,
      ).apply { description = "Progress while a paper is uploading" }
      context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
  }
}
