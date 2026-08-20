package com.epaperspace.publisher.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.epaperspace.publisher.data.model.Profile
import com.epaperspace.publisher.data.model.TenantStats
import com.epaperspace.publisher.data.network.ApiResult
import com.epaperspace.publisher.data.repository.AuthRepository
import com.epaperspace.publisher.data.repository.ContentRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class DashboardUiState(
  val stats: TenantStats? = null,
  val profile: Profile? = null,
  val loading: Boolean = false,
  val error: String? = null,
  val signedOut: Boolean = false,
) {
  /** The content worker refuses writes on an unverified address; the screen warns up front. */
  val writesBlocked: Boolean get() = profile?.writesBlocked == true
}

class DashboardViewModel(
  private val contentRepository: ContentRepository,
  private val authRepository: AuthRepository,
) : ViewModel() {

  private val _state = MutableStateFlow(DashboardUiState())
  val state: StateFlow<DashboardUiState> = _state.asStateFlow()

  init {
    load()
  }

  fun load() {
    if (_state.value.loading) return
    _state.update { it.copy(loading = true, error = null) }
    viewModelScope.launch {
      when (val result = contentRepository.stats()) {
        is ApiResult.Success -> _state.update { it.copy(loading = false, stats = result.data) }
        is ApiResult.Failure -> _state.update { it.copy(loading = false, error = result.error.message) }
      }
      // A failed profile fetch only costs the verification banner, so it must not raise an error.
      when (val result = authRepository.profile()) {
        is ApiResult.Success -> _state.update { it.copy(profile = result.data) }
        is ApiResult.Failure -> Unit
      }
    }
  }

  /** Forces the worker to recount storage and pageviews rather than serving the cached row. */
  fun recalculate() {
    if (_state.value.loading) return
    _state.update { it.copy(loading = true, error = null) }
    viewModelScope.launch {
      when (val result = contentRepository.recalculateStats()) {
        is ApiResult.Success -> _state.update { it.copy(loading = false, stats = result.data) }
        is ApiResult.Failure -> _state.update { it.copy(loading = false, error = result.error.message) }
      }
    }
  }

  fun dismissError() = _state.update { it.copy(error = null) }

  fun signOut() {
    authRepository.signOut()
    _state.update { it.copy(signedOut = true) }
  }
}
