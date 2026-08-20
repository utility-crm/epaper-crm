package com.epaperspace.publisher.ui.upload

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.epaperspace.publisher.data.model.Epaper
import com.epaperspace.publisher.data.upload.EpaperUploader
import com.epaperspace.publisher.data.upload.UploadState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class UploadUiState(
  val epaperId: String? = null,
  val uri: Uri? = null,
  val freePageCount: Int = 0,
  val invalidPdf: Boolean = false,
  val error: String? = null,
)

/**
 * Wraps the paper-scoped upload pipeline. The [EpaperUploader] owns progress (it is already a
 * StateFlow), so the screen renders [uploadState] directly; this ViewModel only remembers the
 * picks that drive a run.
 */
class UploadViewModel(
  private val uploader: EpaperUploader,
) : ViewModel() {

  private val _state = MutableStateFlow(UploadUiState())
  val state: StateFlow<UploadUiState> = _state.asStateFlow()

  /** Progress of the current run, hoisted here so the screen subscribes to one source. */
  val uploadState: StateFlow<UploadState> = uploader.state

  /** The paper is created before this screen opens; navigation carries only its id. */
  fun setEpaper(epaperId: String) {
    _state.update { it.copy(epaperId = epaperId) }
  }

  fun setPdf(uri: Uri?, freePageCount: Int) {
    _state.update {
      it.copy(
        uri = uri,
        freePageCount = freePageCount.coerceAtLeast(0),
        // The free-page allowance cannot exceed the server's hard page cap.
        invalidPdf = uri == null || freePageCount > Epaper.MAX_PAGE_COUNT,
      )
    }
  }

  fun dismissError() = _state.update { it.copy(error = null) }

  fun start() {
    val current = _state.value
    val epaperId = current.epaperId ?: return
    val uri = current.uri ?: run {
      _state.update { it.copy(error = "Pick a PDF to upload.") }
      return
    }
    if (current.invalidPdf) {
      _state.update { it.copy(error = "That PDF cannot be uploaded. Pick a valid PDF.") }
      return
    }
    // No-op while a run is in progress; retry happens from the Failed state.
    if (uploader.state.value is UploadState.Idle ||
      uploader.state.value is UploadState.Failed
    ) {
      viewModelScope.launch { uploader.upload(epaperId, uri, current.freePageCount) }
    }
  }

  fun retry() = start()

  fun reset() {
    uploader.reset()
    _state.update { it.copy(uri = null, error = null) }
  }
}
