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

data class ResetPasswordUiState(
  val code: String = "",
  val password: String = "",
  val confirmPassword: String = "",
  val codeError: String? = null,
  val passwordError: String? = null,
  val confirmError: String? = null,
  val error: String? = null,
  val busy: Boolean = false,
  /** Reset tokens are single-use and the worker signs us straight in on success. */
  val signedIn: Boolean = false,
)

class ResetPasswordViewModel(private val repository: AuthRepository) : ViewModel() {

  private val _state = MutableStateFlow(ResetPasswordUiState())
  val state: StateFlow<ResetPasswordUiState> = _state.asStateFlow()

  /** Prefills the token when the screen was opened from a reset link. */
  fun prefillCode(code: String?) {
    if (!code.isNullOrBlank() && _state.value.code.isBlank()) {
      _state.update { it.copy(code = code) }
    }
  }

  fun onCodeChange(value: String) =
    _state.update { it.copy(code = value, codeError = null, error = null) }

  fun onPasswordChange(value: String) =
    _state.update { it.copy(password = value, passwordError = null, error = null) }

  fun onConfirmPasswordChange(value: String) =
    _state.update { it.copy(confirmPassword = value, confirmError = null, error = null) }

  fun dismissError() = _state.update { it.copy(error = null) }

  fun submit() {
    val current = _state.value
    if (current.busy) return

    val codeError = if (current.code.isBlank()) "Paste the code from the email." else null
    val passwordError = PasswordPolicy.validate(current.password)
    val confirmError = if (current.password != current.confirmPassword) {
      "Passwords do not match."
    } else {
      null
    }
    if (codeError != null || passwordError != null || confirmError != null) {
      _state.update {
        it.copy(codeError = codeError, passwordError = passwordError, confirmError = confirmError)
      }
      return
    }

    _state.update { it.copy(busy = true, error = null) }
    viewModelScope.launch {
      when (val result = repository.confirmPasswordReset(current.code, current.password)) {
        is ApiResult.Success -> _state.update { it.copy(busy = false, signedIn = true) }
        is ApiResult.Failure ->
          _state.update { it.copy(busy = false, error = result.error.message) }
      }
    }
  }
}
