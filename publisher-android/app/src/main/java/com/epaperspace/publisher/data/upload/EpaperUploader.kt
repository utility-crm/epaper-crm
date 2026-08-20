package com.epaperspace.publisher.data.upload

import android.net.Uri
import com.epaperspace.publisher.data.network.ApiResult
import com.epaperspace.publisher.data.repository.ContentRepository
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import okhttp3.MediaType
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody

/** One run of the upload pipeline, as the UI renders it. */
sealed interface UploadState {
  data object Idle : UploadState

  data object Preparing : UploadState

  data class Rendering(val done: Int, val total: Int) : UploadState

  data class Uploading(val done: Int, val total: Int) : UploadState

  data object Committing : UploadState

  data object Done : UploadState

  data class Failed(val message: String) : UploadState
}

/**
 * Drives the worker's three-phase protocol: `uploadBegin` wipes the previous pages from storage,
 * one `uploadPage` per page follows (at most [MAX_IN_FLIGHT] concurrently), then `uploadCommit`
 * makes the worker re-probe storage for a contiguous 1..page_count run. Commit fails the whole
 * upload if a page is missing, so a partial upload can never masquerade as a complete one.
 *
 * Rasterizing fully before uploading is deliberate: `uploadBegin` destroys the paper's existing
 * pages, so it must not run until the new document is known to be renderable end to end.
 */
class EpaperUploader(
  private val repository: ContentRepository,
  private val rasterizer: PdfRasterizer,
) {

  private val _state = MutableStateFlow<UploadState>(UploadState.Idle)
  val state: StateFlow<UploadState> = _state.asStateFlow()

  suspend fun upload(epaperId: String, uri: Uri, freePageCount: Int) {
    val pages = mutableListOf<RasterizedPage>()
    _state.value = UploadState.Preparing

    try {
      rasterizer.rasterize(uri, freePageCount, onProgress = { done, total ->
        _state.value = UploadState.Rendering(done, total)
      }) { page ->
        pages.add(page)
      }

      check(pages.isNotEmpty()) { "That PDF has no pages." }

      withContext(Dispatchers.IO) {
        _state.value = UploadState.Preparing
        when (val begun = repository.uploadBegin(epaperId)) {
          is ApiResult.Success -> Unit
          is ApiResult.Failure -> return@withContext fail(begun.error.message)
        }

        val total = pages.size
        val done = AtomicInteger()
        val inFlight = Semaphore(MAX_IN_FLIGHT)
        _state.value = UploadState.Uploading(0, total)

        val failure = coroutineScope {
          pages
            .map { page ->
              async {
                inFlight.withPermit {
                  val error = sendWithRetry(epaperId, page)
                  if (error == null) {
                    _state.value = UploadState.Uploading(done.incrementAndGet(), total)
                  }
                  error
                }
              }
            }
            .awaitAll()
            .firstOrNull { it != null }
        }

        if (failure != null) return@withContext fail(failure)

        _state.value = UploadState.Committing
        when (val committed = repository.uploadCommit(epaperId, total)) {
          is ApiResult.Success -> _state.value = UploadState.Done
          is ApiResult.Failure -> fail(committed.error.message)
        }
      }
    } catch (e: CancellationException) {
      _state.value = UploadState.Idle
      throw e
    } catch (e: Exception) {
      fail(e.message ?: "Upload failed unexpectedly.")
    } finally {
      // Rendered pages are multi-megabyte cache files; never leave them behind.
      rasterizer.discard(pages)
    }
  }

  fun reset() {
    _state.value = UploadState.Idle
  }

  /** Returns null on success, or the message to fail the whole run with. */
  private suspend fun sendWithRetry(epaperId: String, page: RasterizedPage): String? {
    var attempt = 0
    while (true) {
      when (val result = sendPage(epaperId, page)) {
        is ApiResult.Success -> return null
        is ApiResult.Failure -> {
          attempt++
          // A rejected page is usually transient (mobile network, cold worker), but retrying past
          // a few attempts just delays a failure the publisher needs to see.
          if (attempt >= MAX_ATTEMPTS) return result.error.message
          delay(RETRY_DELAY_MS * attempt)
        }
      }
    }
  }

  private suspend fun sendPage(epaperId: String, page: RasterizedPage) = repository.uploadPage(
    epaperId,
    page.pageNo.toString().toRequestBody(TEXT_PLAIN),
    MultipartBody.Part.createFormData("page", page.image.name, page.image.asRequestBody(WEBP)),
    page.blurred?.let {
      MultipartBody.Part.createFormData("blurred", it.name, it.asRequestBody(WEBP))
    },
    page.cover?.let {
      MultipartBody.Part.createFormData("cover", it.name, it.asRequestBody(WEBP))
    },
  )

  private fun fail(message: String) {
    _state.value = UploadState.Failed(message)
  }

  private companion object {
    /** Matches the web uploader; more parallelism just starves a mobile uplink. */
    const val MAX_IN_FLIGHT = 4
    const val MAX_ATTEMPTS = 3
    const val RETRY_DELAY_MS = 1_000L

    val WEBP: MediaType = "image/webp".toMediaType()
    val TEXT_PLAIN: MediaType = "text/plain".toMediaType()
  }
}
