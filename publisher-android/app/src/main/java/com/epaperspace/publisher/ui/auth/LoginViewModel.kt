package com.epaperspace.publisher.ui.auth

import android.app.Activity
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.epaperspace.publisher.data.auth.FirebaseAuthClient
import com.epaperspace.publisher.data.network.ApiResult
import com.epaperspace.publisher.data.repository.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginUiState(
  val email: String = "",
  val password: String = "",
  val emailError: String? = null,
  val passwordError: String? = null,
  val error: String? = null,
  val busy: Boolean = false,
  val googleBusy: Boolean = false,
  /** Set once the worker has issued a session; the screen navigates on this. */
  val signedIn: Boolean = false,
  val googleAvailable: Boolean = false,
)

class LoginViewModel(
  private val repository: AuthRepository,
  private val firebase: FirebaseAuthClient,
) : ViewModel() {

  private val _state = MutableStateFlow(LoginUiState(googleAvailable = firebase.isConfigured))
  val state: StateFlow<LoginUiState> = _state.asStateFlow()

  fun onEmailChange(value: String) =
    _state.update { it.copy(email = value, emailError = null, error = null) }

  fun onPasswordChange(value: String) =
    _state.update { it.copy(password = value, passwordError = null, error = null) }

  fun dismissError() = _state.update { it.copy(error = null) }

  fun submit() {
    val current = _state.value
    if (current.busy || current.googleBusy) return

    val emailError = if (!current.email.trim().looksLikeEmail()) {
      "Enter a valid email address."
    } else {
      null
    }
    // Length only. The real policy applies at signup and reset; an existing account may predate it.
    val passwordError = if (current.password.isEmpty()) "Enter your password." else null

    if (emailError != null || passwordError != null) {
      _state.update { it.copy(emailError = emailError, passwordError = passwordError) }
      return
    }

    _state.update { it.copy(busy = true, error = null) }
    viewModelScope.launch {
      when (val result = repository.login(current.email, current.password)) {
        is ApiResult.Success -> _state.update { it.copy(busy = false, signedIn = true) }
        is ApiResult.Failure ->
          _state.update { it.copy(busy = false, error = result.error.message) }
      }
    }
  }

  fun signInWithGoogle(activity: Activity) {
    if (_state.value.busy || _state.value.googleBusy) return
    _state.update { it.copy(googleBusy = true, error = null) }

    viewModelScope.launch {
      when (val token = firebase.signInWithGoogle(activity)) {
        is ApiResult.Failure -> _state.update {
          it.copy(
            googleBusy = false,
            // Backing out of the Google sheet is not a failure worth a red banner.
            error = token.error.message
              .takeIf { _ -> token.error.code != FirebaseAuthClient.CODE_CANCELLED },
          )
        }

        is ApiResult.Success -> when (val session = repository.verifyOrg(token.data)) {
          is ApiResult.Success -> _state.update { it.copy(googleBusy = false, signedIn = true) }
          is ApiResult.Failure -> {
            // Our worker rejected the identity, so do not leave a half-open Firebase session
            // behind — the next attempt should start clean.
            firebase.signOut()
            _state.update { it.copy(googleBusy = false, error = session.error.message) }
          }
        }
      }
    }
  }
}
