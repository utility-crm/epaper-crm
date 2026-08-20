package com.epaperspace.publisher.ui.papers

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.epaperspace.publisher.data.model.CreateEpaperRequest
import com.epaperspace.publisher.data.model.Epaper
import com.epaperspace.publisher.data.model.UpdateEpaperRequest
import com.epaperspace.publisher.data.network.ApiResult
import com.epaperspace.publisher.data.repository.ContentRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class PapersUiState(
  val editionId: String? = null,
  val papers: List<Epaper> = emptyList(),
  val loading: Boolean = false,
  val error: String? = null,
)

class PapersViewModel(private val contentRepository: ContentRepository) : ViewModel() {

  private val _state = MutableStateFlow(PapersUiState())
  val state: StateFlow<PapersUiState> = _state.asStateFlow()

  /** Papers are always listed under one edition; the screen supplies it after navigation. */
  fun setEdition(editionId: String) {
    if (_state.value.editionId == editionId) return
    _state.update { it.copy(editionId = editionId, papers = emptyList()) }
    load()
  }

  fun load() {
    val editionId = _state.value.editionId ?: return
    if (_state.value.loading) return
    _state.update { it.copy(loading = true, error = null) }
    viewModelScope.launch {
      when (val result = contentRepository.epapers(editionId)) {
        is ApiResult.Success ->
          _state.update { it.copy(loading = false, papers = result.data.items) }

        is ApiResult.Failure ->
          _state.update { it.copy(loading = false, error = result.error.message) }
      }
    }
  }

  fun create(request: CreateEpaperRequest) {
    val editionId = _state.value.editionId ?: return
    if (request.publishDate.isBlank()) {
      _state.update { it.copy(error = "Pick a publish date.") }
      return
    }
    if (request.publishType == Epaper.PUBLISH_SCHEDULED && request.scheduledAt.isNullOrBlank()) {
      _state.update { it.copy(error = "Pick a date and time to schedule for.") }
      return
    }
    mutate { contentRepository.createEpaper(editionId, request) }
  }

  fun update(id: String, request: UpdateEpaperRequest) {
    mutate { contentRepository.updateEpaper(id, request) }
  }

  fun setStatus(id: String, status: String) {
    mutate { contentRepository.updateEpaper(id, UpdateEpaperRequest(status = status)) }
  }

  /** `is_free` and a free-page allowance are mutually exclusive server-side. */
  fun setAccess(id: String, isFree: Boolean, freePageCount: Int) {
    if (freePageCount < 0) {
      _state.update { it.copy(error = "Free page count cannot be negative.") }
      return
    }
    mutate {
      contentRepository.updateEpaper(
        id,
        UpdateEpaperRequest(isFree = isFree, freePageCount = if (isFree) 0 else freePageCount),
      )
    }
  }

  fun setDefault(id: String) {
    mutate { contentRepository.setDefaultPaper(id) }
  }

  fun delete(id: String) {
    mutate { contentRepository.deleteEpaper(id) }
  }

  fun dismissError() = _state.update { it.copy(error = null) }

  private fun mutate(block: suspend () -> ApiResult<*>) {
    if (_state.value.loading) return
    _state.update { it.copy(loading = true, error = null) }
    viewModelScope.launch {
      when (val result = block()) {
        is ApiResult.Success -> {
          _state.update { it.copy(loading = false) }
          load()
        }

        is ApiResult.Failure ->
          _state.update { it.copy(loading = false, error = result.error.message) }
      }
    }
  }
}
