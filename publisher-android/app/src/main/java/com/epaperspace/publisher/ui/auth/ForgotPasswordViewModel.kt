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

data class ForgotPasswordUiState(
  val email: String = "",
  val emailError: String? = null,
  val error: String? = null,
  val busy: Boolean = false,
  val sent: Boolean = false,
)

class ForgotPasswordViewModel(private val repository: AuthRepository) : ViewModel() {

  private val _state = MutableStateFlow(ForgotPasswordUiState())
  val state: StateFlow<ForgotPasswordUiState> = _state.asStateFlow()

  fun onEmailChange(value: String) =
    _state.update { it.copy(email = value, emailError = null, error = null) }

  fun dismissError() = _state.update { it.copy(error = null) }

  fun submit() {
    val current = _state.value
    if (current.busy) return
    if (!current.email.trim().looksLikeEmail()) {
      _state.update { it.copy(emailError = "Enter a valid email address.") }
      return
    }

    _state.update { it.copy(busy = true, error = null) }
    viewModelScope.launch {
      when (val result = repository.requestPasswordReset(current.email)) {
        // The worker answers the same way whether or not the address exists, so the UI must not
        // imply anything about account existence either.
        is ApiResult.Success -> _state.update { it.copy(busy = false, sent = true) }
        is ApiResult.Failure ->
          _state.update { it.copy(busy = false, error = result.error.message) }
      }
    }
  }
}
