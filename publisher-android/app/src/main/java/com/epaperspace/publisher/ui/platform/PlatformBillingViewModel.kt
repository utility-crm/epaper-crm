package com.epaperspace.publisher.ui.platform

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.epaperspace.publisher.data.model.PlatformBillingStatus
import com.epaperspace.publisher.data.model.PlatformTier
import com.epaperspace.publisher.data.network.ApiResult
import com.epaperspace.publisher.data.repository.BillingRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class PlatformBillingUiState(
  val tiers: List<PlatformTier> = emptyList(),
  val status: PlatformBillingStatus? = null,
  val loading: Boolean = false,
  val error: String? = null,
) {
  fun dismissError() = copy(error = null)
}

/** Platform lane: the publisher's own SaaS subscription (tiers are a public route, status is slug-scoped). */
class PlatformBillingViewModel(private val repository: BillingRepository) : ViewModel() {

  private val _state = MutableStateFlow(PlatformBillingUiState())
  val state: StateFlow<PlatformBillingUiState> = _state.asStateFlow()

  init {
    refresh()
  }

  fun refresh() {
    if (_state.value.loading) return
    _state.update { it.copy(loading = true, error = null) }
    viewModelScope.launch {
      val tiers = repository.platformTiers()
      val status = repository.platformStatus()
      _state.update {
        it.copy(
          loading = false,
          tiers = (tiers as? ApiResult.Success)?.data?.items ?: it.tiers,
          status = (status as? ApiResult.Success)?.data ?: it.status,
          error = (tiers as? ApiResult.Failure)?.error?.message
            ?: (status as? ApiResult.Failure)?.error?.message,
        )
      }
    }
  }
}
