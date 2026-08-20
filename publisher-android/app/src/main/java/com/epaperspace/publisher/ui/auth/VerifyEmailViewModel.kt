package com.epaperspace.publisher.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.epaperspace.publisher.data.network.ApiResult
import com.epaperspace.publisher.data.repository.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class VerifyEmailUiState(
  val email: String? = null,
  val code: String = "",
  val codeError: String? = null,
  val error: String? = null,
  val notice: String? = null,
  val busy: Boolean = false,
  val resending: Boolean = false,
  val verified: Boolean = false,
)

/**
 * Confirms the owner's address. Until this passes, the content worker refuses every write — it
 * re-reads the verification flag from D1 on each request, so an old token cannot slip past it.
 */
class VerifyEmailViewModel(private val repository: AuthRepository) : ViewModel() {

  private val _state = MutableStateFlow(VerifyEmailUiState())
  val state: StateFlow<VerifyEmailUiState> = _state.asStateFlow()

  fun start(email: String?) {
    if (email != null && _state.value.email == null) _state.update { it.copy(email = email) }
  }

  fun onCodeChange(value: String) =
    _state.update { it.copy(code = value, codeError = null, error = null) }

  fun dismissError() = _state.update { it.copy(error = null) }

  fun dismissNotice() = _state.update { it.copy(notice = null) }

  fun confirm() {
    val current = _state.value
    if (current.busy) return
    if (current.code.isBlank()) {
      _state.update { it.copy(codeError = "Paste the code from the email.") }
      return
    }

    _state.update { it.copy(busy = true, error = null) }
    viewModelScope.launch {
      when (val result = repository.confirmVerifyEmail(current.code)) {
        is ApiResult.Success -> {
          // Confirming does not itself refresh the stored session, and the navigation gate reads
          // the session's status. Without this the tenant stays AWAITING_VERIFICATION locally and
          // the user is stuck on this screen after a successful verify.
          repository.provisionStatus()
          _state.update { it.copy(busy = false, verified = true) }
        }

        is ApiResult.Failure ->
          _state.update { it.copy(busy = false, error = result.error.message) }
      }
    }
  }

  fun resend() {
    if (_state.value.resending) return
    _state.update { it.copy(resending = true, error = null, notice = null) }
    viewModelScope.launch {
      when (val result = repository.resendVerifyEmail()) {
        is ApiResult.Success -> _state.update {
          it.copy(
            resending = false,
            email = result.data.email ?: it.email,
            notice = if (result.data.sent) {
              "Verification email sent."
            } else {
              "That address is already verified."
            },
          )
        }

        is ApiResult.Failure ->
          _state.update { it.copy(resending = false, error = result.error.message) }
      }
    }
  }
}
