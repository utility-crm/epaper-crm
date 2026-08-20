package com.epaperspace.publisher.ui.clickmask

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.epaperspace.publisher.data.model.Clickmask
import com.epaperspace.publisher.data.model.SaveClickmasksRequest
import com.epaperspace.publisher.data.network.ApiResult
import com.epaperspace.publisher.data.repository.ContentRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ClickmaskEditorUiState(
  val epaperId: String = "",
  val pageNo: Int = 1,
  /** page number -> rectangles on that page, coords normalised 0..1 of page width/height. */
  val pages: Map<Int, List<Clickmask>> = emptyMap(),
  /** Pages edited since the last load or save; a save touches only these. */
  val dirtyPages: Set<Int> = emptySet(),
  val loading: Boolean = false,
  val saving: Boolean = false,
  val error: String? = null,
) {
  val masks: List<Clickmask> get() = pages[pageNo] ?: emptyList()
  val dirty: Boolean get() = dirtyPages.isNotEmpty()
}

/**
 * Per-page clickmask rectangles and their link targets. The worker persists one page at a time, so
 * edits accumulate locally and [save] PUTs only the pages that actually changed.
 */
class ClickmaskEditorViewModel(private val contentRepository: ContentRepository) : ViewModel() {

  private val _state = MutableStateFlow(ClickmaskEditorUiState())
  val state: StateFlow<ClickmaskEditorUiState> = _state.asStateFlow()

  fun load(epaperId: String) {
    if (_state.value.loading) return
    _state.update { it.copy(epaperId = epaperId, loading = true, error = null) }
    viewModelScope.launch {
      when (val result = contentRepository.clickmasks(epaperId)) {
        is ApiResult.Success -> _state.update { current ->
          current.copy(
            loading = false,
            pages = result.data.items.associate { it.pageNo to it.clickmasks },
            dirtyPages = emptySet(),
          )
        }

        is ApiResult.Failure ->
          _state.update { it.copy(loading = false, error = result.error.message) }
      }
    }
  }

  fun selectPage(pageNo: Int) = _state.update { it.copy(pageNo = pageNo, error = null) }

  fun addMask(mask: Clickmask) = editPage { it + mask.clamped() }

  fun updateMask(index: Int, mask: Clickmask) = editPage { masks ->
    masks.mapIndexed { i, existing -> if (i == index) mask.clamped() else existing }
  }

  fun setLink(index: Int, href: String?, label: String? = null) = editPage { masks ->
    masks.mapIndexed { i, mask ->
      if (i == index) mask.copy(href = href?.trim()?.ifBlank { null }, label = label) else mask
    }
  }

  fun removeMask(index: Int) = editPage { masks -> masks.filterIndexed { i, _ -> i != index } }

  fun save() {
    val current = _state.value
    if (current.saving || !current.dirty) return

    _state.update { it.copy(saving = true, error = null) }
    viewModelScope.launch {
      val saved = mutableSetOf<Int>()
      for (pageNo in current.dirtyPages) {
        val request = SaveClickmasksRequest(current.pages[pageNo] ?: emptyList())
        val result = contentRepository.saveClickmasks(current.epaperId, pageNo, request)
        if (result is ApiResult.Failure) {
          // Keep the unsaved pages dirty so a retry re-sends exactly what did not land.
          _state.update {
            it.copy(saving = false, dirtyPages = it.dirtyPages - saved, error = result.error.message)
          }
          return@launch
        }
        saved += pageNo
      }
      _state.update { it.copy(saving = false, dirtyPages = it.dirtyPages - saved) }
    }
  }

  fun dismissError() = _state.update { it.copy(error = null) }

  private fun editPage(transform: (List<Clickmask>) -> List<Clickmask>) = _state.update { current ->
    val page = current.pageNo
    current.copy(
      pages = current.pages + (page to transform(current.masks)),
      dirtyPages = current.dirtyPages + page,
      error = null,
    )
  }

  /** A drag can run past the page edge; the worker stores fractions, so clamp before keeping it. */
  private fun Clickmask.clamped(): Clickmask {
    val cx = x.coerceIn(0.0, 1.0)
    val cy = y.coerceIn(0.0, 1.0)
    return copy(
      x = cx,
      y = cy,
      width = width.coerceIn(0.0, 1.0 - cx),
      height = height.coerceIn(0.0, 1.0 - cy),
    )
  }
}
