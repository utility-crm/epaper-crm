package com.epaperspace.publisher.ui.readers

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.epaperspace.publisher.data.model.Reader
import com.epaperspace.publisher.data.network.ApiResult
import com.epaperspace.publisher.data.repository.BillingRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ReadersUiState(
  val readers: List<Reader> = emptyList(),
  val page: Int = 1,
  val totalPages: Int = 1,
  val loading: Boolean = false,
  val loadingMore: Boolean = false,
  val error: String? = null,
  /**
   * UI-only courtesy: the billing worker re-decides on every request, so this never gates
   * anything — it just hides the grant controls when the token cannot grant.
   */
  val canGrantSubscriptions: Boolean = false,
) {
  fun dismissError() = copy(error = null)
}

class ReadersViewModel(private val repository: BillingRepository) : ViewModel() {

  private val _state = MutableStateFlow(
    ReadersUiState(canGrantSubscriptions = repository.canGrantSubscriptions()),
  )
  val state: StateFlow<ReadersUiState> = _state.asStateFlow()

  init {
    refresh()
  }

  fun refresh() {
    if (_state.value.loading || _state.value.loadingMore) return
    _state.update { it.copy(loading = true, error = null) }
    viewModelScope.launch {
      when (val result = repository.readers()) {
        is ApiResult.Success -> _state.update {
          it.copy(
            loading = false,
            readers = result.data.items,
            page = result.data.page,
            totalPages = result.data.totalPages,
          )
        }

        is ApiResult.Failure -> _state.update { it.copy(loading = false, error = result.error.message) }
      }
    }
  }

  fun loadNextPage() {
    val current = _state.value
    if (current.loading || current.loadingMore || current.page >= current.totalPages) return
    _state.update { it.copy(loadingMore = true, error = null) }
    viewModelScope.launch {
      when (val result = repository.readers(current.page + 1)) {
        is ApiResult.Success -> _state.update {
          it.copy(
            loadingMore = false,
            readers = it.readers + result.data.items,
            page = result.data.page,
            totalPages = result.data.totalPages,
          )
        }

        is ApiResult.Failure -> _state.update { it.copy(loadingMore = false, error = result.error.message) }
      }
    }
  }
}
