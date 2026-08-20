package com.epaperspace.publisher.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.epaperspace.publisher.data.model.OrgSettings
import com.epaperspace.publisher.data.model.UpdateSettingsRequest
import com.epaperspace.publisher.data.network.ApiResult
import com.epaperspace.publisher.data.repository.AuthRepository
import com.epaperspace.publisher.data.repository.ContentRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SettingsUiState(
  val settings: OrgSettings? = null,
  val loading: Boolean = false,
  val saving: Boolean = false,
  val error: String? = null,
  val signedOut: Boolean = false,
  /** Gate on [SettingsViewModel.deleteOrganization]; nothing destructive runs while false. */
  val deleteConfirmed: Boolean = false,
  val deleting: Boolean = false,
  val deleted: Boolean = false,
) {
  /** Spelled out because the worker's teardown is not recoverable from this app or the portal. */
  val deleteWarning: String =
    "Deleting the organisation cancels every active subscription and permanently removes this " +
      "publication: all editions, papers and uploaded pages, your custom domain, readers and " +
      "their access, tiers and plans, and all billing history. This cannot be undone."
}

/**
 * Org settings, sign-out and tenant teardown. Settings writes are PATCH-shaped, so callers pass
 * only the fields they changed and the response replaces local state wholesale.
 */
class SettingsViewModel(
  private val contentRepository: ContentRepository,
  private val authRepository: AuthRepository,
) : ViewModel() {

  private val _state = MutableStateFlow(SettingsUiState())
  val state: StateFlow<SettingsUiState> = _state.asStateFlow()

  fun load() {
    if (_state.value.loading) return
    _state.update { it.copy(loading = true, error = null) }
    viewModelScope.launch {
      when (val result = contentRepository.settings()) {
        is ApiResult.Success ->
          _state.update { it.copy(loading = false, settings = result.data) }

        is ApiResult.Failure ->
          _state.update { it.copy(loading = false, error = result.error.message) }
      }
    }
  }

  fun save(request: UpdateSettingsRequest) {
    if (_state.value.saving) return
    _state.update { it.copy(saving = true, error = null) }
    viewModelScope.launch {
      when (val result = contentRepository.updateSettings(request)) {
        is ApiResult.Success ->
          _state.update { it.copy(saving = false, settings = result.data) }

        is ApiResult.Failure ->
          _state.update { it.copy(saving = false, error = result.error.message) }
      }
    }
  }

  fun signOut() {
    authRepository.signOut()
    _state.update { it.copy(signedOut = true) }
  }

  fun setDeleteConfirmed(confirmed: Boolean) =
    _state.update { it.copy(deleteConfirmed = confirmed, error = null) }

  fun deleteOrganization() {
    val current = _state.value
    if (current.deleting) return
    if (!current.deleteConfirmed) {
      _state.update { it.copy(error = "Confirm the deletion warning first.") }
      return
    }

    _state.update { it.copy(deleting = true, error = null) }
    viewModelScope.launch {
      when (val result = contentRepository.deleteOrganization()) {
        // The token is worthless once the tenant is gone; drop it here so nothing retries with it.
        is ApiResult.Success -> {
          authRepository.signOut()
          _state.update { it.copy(deleting = false, deleted = true, signedOut = true) }
        }

        is ApiResult.Failure -> _state.update {
          it.copy(deleting = false, deleteConfirmed = false, error = result.error.message)
        }
      }
    }
  }

  fun dismissError() = _state.update { it.copy(error = null) }
}
