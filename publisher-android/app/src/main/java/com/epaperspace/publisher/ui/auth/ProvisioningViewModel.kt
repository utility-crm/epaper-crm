package com.epaperspace.publisher.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.epaperspace.publisher.data.TenantStatus
import com.epaperspace.publisher.data.network.ApiResult
import com.epaperspace.publisher.data.repository.AuthRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ProvisioningUiState(
  val status: String = TenantStatus.PROVISIONING,
  val awaitingVerification: Boolean = false,
  val email: String? = null,
  val error: String? = null,
  val busy: Boolean = false,
  val ready: Boolean = false,
) {
  val failed: Boolean get() = status == TenantStatus.PROVISION_FAILED
}

/**
 * Watches a new tenant come up. Provisioning runs as a queue job on the worker side, so the only
 * thing to do is poll until it lands — or until the owner is told their email is holding it up.
 */
class ProvisioningViewModel(private val repository: AuthRepository) : ViewModel() {

  private val _state = MutableStateFlow(ProvisioningUiState())
  val state: StateFlow<ProvisioningUiState> = _state.asStateFlow()

  init {
    poll()
  }

  fun retry() {
    if (_state.value.busy) return
    _state.update { it.copy(busy = true, error = null) }
    viewModelScope.launch {
      when (val result = repository.reprovision()) {
        is ApiResult.Success -> {
          _state.update { it.copy(busy = false, status = TenantStatus.PROVISIONING) }
          poll()
        }

        is ApiResult.Failure ->
          _state.update { it.copy(busy = false, error = result.error.message) }
      }
    }
  }

  /** Called when the user says they have opened the verification link. */
  fun recheck() {
    if (_state.value.busy) return
    _state.update { it.copy(busy = true, error = null) }
    viewModelScope.launch {
      val result = repository.verifyProvisioning()
      _state.update { it.copy(busy = false) }
      apply(result)
      if (result is ApiResult.Success && !result.data.awaitingVerification) poll()
    }
  }

  private fun poll() {
    viewModelScope.launch {
      var attempt = 0
      while (attempt < MAX_POLLS) {
        val result = repository.provisionStatus()
        apply(result)

        val status = (result as? ApiResult.Success)?.data
        // Nothing will change while the owner has not opened the link, and a hard failure is not
        // going to fix itself. Both need the user, so stop burning requests.
        if (status == null || status.awaitingVerification) return@launch
        if (status.status == TenantStatus.ACTIVE) return@launch
        if (status.status == TenantStatus.PROVISION_FAILED) return@launch

        delay(POLL_INTERVAL_MS)
        attempt++
      }
      _state.update {
        it.copy(error = "This is taking longer than expected. Pull to refresh in a moment.")
      }
    }
  }

  private fun apply(result: ApiResult<com.epaperspace.publisher.data.model.ProvisionStatus>) {
    when (result) {
      is ApiResult.Success -> _state.update {
        it.copy(
          status = result.data.status,
          awaitingVerification = result.data.awaitingVerification,
          email = result.data.email ?: it.email,
          ready = result.data.status == TenantStatus.ACTIVE,
        )
      }

      is ApiResult.Failure -> _state.update { it.copy(error = result.error.message) }
    }
  }

  private companion object {
    const val POLL_INTERVAL_MS = 3_000L

    /** ~2.5 minutes. Provisioning normally finishes in under 30 seconds. */
    const val MAX_POLLS = 50
  }
}
