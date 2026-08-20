package com.epaperspace.publisher.ui.plans

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.epaperspace.publisher.data.model.Plan
import com.epaperspace.publisher.data.model.Tier
import com.epaperspace.publisher.data.network.ApiResult
import com.epaperspace.publisher.data.repository.ContentRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ReaderPlansUiState(
  val tiers: List<Tier> = emptyList(),
  val plans: List<Plan> = emptyList(),
  val loading: Boolean = false,
  val error: String? = null,
) {
  fun dismissError() = copy(error = null)
}

/** Reader tiers and plans are content-worker routes even though they are a money concern. */
class ReaderPlansViewModel(private val repository: ContentRepository) : ViewModel() {

  private val _state = MutableStateFlow(ReaderPlansUiState())
  val state: StateFlow<ReaderPlansUiState> = _state.asStateFlow()

  init {
    refresh()
  }

  fun refresh() {
    if (_state.value.loading) return
    _state.update { it.copy(loading = true, error = null) }
    viewModelScope.launch {
      val tiers = repository.tiers()
      val plans = repository.plans()
      _state.update {
        it.copy(
          loading = false,
          tiers = (tiers as? ApiResult.Success)?.data?.items ?: it.tiers,
          plans = (plans as? ApiResult.Success)?.data?.items ?: it.plans,
          error = (tiers as? ApiResult.Failure)?.error?.message
            ?: (plans as? ApiResult.Failure)?.error?.message,
        )
      }
    }
  }
}
