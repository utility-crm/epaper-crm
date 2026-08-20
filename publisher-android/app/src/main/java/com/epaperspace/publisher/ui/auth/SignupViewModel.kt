package com.epaperspace.publisher.ui.auth

import android.app.Activity
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.epaperspace.publisher.data.TenantStatus
import com.epaperspace.publisher.data.auth.FirebaseAuthClient
import com.epaperspace.publisher.data.model.AuthSession
import com.epaperspace.publisher.data.model.SignupRequest
import com.epaperspace.publisher.data.network.ApiResult
import com.epaperspace.publisher.data.repository.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SignupUiState(
  val orgName: String = "",
  val name: String = "",
  val email: String = "",
  val password: String = "",
  val orgNameError: String? = null,
  val nameError: String? = null,
  val emailError: String? = null,
  val passwordError: String? = null,
  val error: String? = null,
  val busy: Boolean = false,
  val googleBusy: Boolean = false,
  val googleAvailable: Boolean = false,
  /** Account created. The tenant is now provisioning, or waiting on email confirmation. */
  val created: Boolean = false,
  val awaitingVerification: Boolean = false,
)

/**
 * Signup has two shapes on the same worker route: email+password, or a Firebase idToken from
 * Google. Both still require org name and contact name, which is why Google signup collects those
 * fields first and only then opens the credential sheet.
 */
class SignupViewModel(
  private val repository: AuthRepository,
  private val firebase: FirebaseAuthClient,
) : ViewModel() {

  private val _state = MutableStateFlow(SignupUiState(googleAvailable = firebase.isConfigured))
  val state: StateFlow<SignupUiState> = _state.asStateFlow()

  fun onOrgNameChange(value: String) =
    _state.update { it.copy(orgName = value, orgNameError = null, error = null) }

  fun onNameChange(value: String) =
    _state.update { it.copy(name = value, nameError = null, error = null) }

  fun onEmailChange(value: String) =
    _state.update { it.copy(email = value, emailError = null, error = null) }

  fun onPasswordChange(value: String) =
    _state.update { it.copy(password = value, passwordError = null, error = null) }

  fun dismissError() = _state.update { it.copy(error = null) }

  fun submit() {
    val current = _state.value
    if (current.busy || current.googleBusy) return
    if (!validateIdentity()) return

    val emailError = if (!current.email.trim().looksLikeEmail()) {
      "Enter a valid email address."
    } else {
      null
    }
    val passwordError = PasswordPolicy.validate(current.password)
    if (emailError != null || passwordError != null) {
      _state.update { it.copy(emailError = emailError, passwordError = passwordError) }
      return
    }

    _state.update { it.copy(busy = true, error = null) }
    viewModelScope.launch {
      val result = repository.signup(
        SignupRequest(
          orgName = current.orgName.trim(),
          name = current.name.trim(),
          email = current.email.trim(),
          password = current.password,
        )
      )
      _state.update { it.copy(busy = false) }
      finish(result)
    }
  }

  fun signUpWithGoogle(activity: Activity) {
    val current = _state.value
    if (current.busy || current.googleBusy) return
    // Org and contact name are required by the worker regardless of provider; collect before
    // sending the user through the Google sheet so a cancel does not lose the typed fields.
    if (!validateIdentity()) return

    _state.update { it.copy(googleBusy = true, error = null) }
    viewModelScope.launch {
      when (val token = firebase.signInWithGoogle(activity)) {
        is ApiResult.Failure -> _state.update {
          it.copy(
            googleBusy = false,
            error = token.error.message
              .takeIf { _ -> token.error.code != FirebaseAuthClient.CODE_CANCELLED },
          )
        }

        is ApiResult.Success -> {
          val result = repository.signup(
            SignupRequest(
              orgName = current.orgName.trim(),
              name = current.name.trim(),
              idToken = token.data,
            )
          )
          if (result is ApiResult.Failure) firebase.signOut()
          _state.update { it.copy(googleBusy = false) }
          finish(result)
        }
      }
    }
  }

  private fun validateIdentity(): Boolean {
    val current = _state.value
    val orgNameError = if (current.orgName.isBlank()) "Enter your publication's name." else null
    val nameError = if (current.name.isBlank()) "Enter your name." else null
    if (orgNameError != null || nameError != null) {
      _state.update { it.copy(orgNameError = orgNameError, nameError = nameError) }
      return false
    }
    return true
  }

  private fun finish(result: ApiResult<AuthSession>) {
    when (result) {
      is ApiResult.Success -> _state.update {
        it.copy(
          created = true,
          awaitingVerification = result.data.status == TenantStatus.AWAITING_VERIFICATION,
        )
      }

      is ApiResult.Failure -> _state.update { it.copy(error = result.error.message) }
    }
  }
}
