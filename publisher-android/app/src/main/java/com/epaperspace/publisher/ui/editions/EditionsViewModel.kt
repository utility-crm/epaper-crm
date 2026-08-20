package com.epaperspace.publisher.ui.editions

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.epaperspace.publisher.data.model.Edition
import com.epaperspace.publisher.data.model.UpdateEditionRequest
import com.epaperspace.publisher.data.network.ApiResult
import com.epaperspace.publisher.data.repository.ContentRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class EditionsUiState(
  val editions: List<Edition> = emptyList(),
  val loading: Boolean = false,
  val error: String? = null,
)

class EditionsViewModel(private val contentRepository: ContentRepository) : ViewModel() {

  private val _state = MutableStateFlow(EditionsUiState())
  val state: StateFlow<EditionsUiState> = _state.asStateFlow()

  init {
    load()
  }

  fun load() {
    if (_state.value.loading) return
    _state.update { it.copy(loading = true, error = null) }
    viewModelScope.launch {
      when (val result = contentRepository.editions()) {
        is ApiResult.Success ->
          _state.update { it.copy(loading = false, editions = result.data.items) }

        is ApiResult.Failure ->
          _state.update { it.copy(loading = false, error = result.error.message) }
      }
    }
  }

  fun create(title: String, tierId: String? = null) {
    val trimmed = title.trim()
    if (trimmed.isEmpty()) {
      _state.update { it.copy(error = "Enter a title for the edition.") }
      return
    }
    mutate { contentRepository.createEdition(trimmed, tierId) }
  }

  fun rename(id: String, title: String) {
    val trimmed = title.trim()
    if (trimmed.isEmpty()) {
      _state.update { it.copy(error = "Enter a title for the edition.") }
      return
    }
    mutate { contentRepository.updateEdition(id, UpdateEditionRequest(title = trimmed)) }
  }

  fun setStatus(id: String, status: String) {
    mutate { contentRepository.updateEdition(id, UpdateEditionRequest(status = status)) }
  }

  fun setTier(id: String, tierId: String?) {
    mutate { contentRepository.updateEdition(id, UpdateEditionRequest(tierId = tierId)) }
  }

  fun delete(id: String) {
    mutate { contentRepository.deleteEdition(id) }
  }

  fun dismissError() = _state.update { it.copy(error = null) }

  /** Every write reloads: the worker owns epaper_count and status, so local patching would drift. */
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
