package com.epaperspace.publisher.ui.auth

import android.app.Activity
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.epaperspace.publisher.data.auth.FirebaseAuthClient
import com.epaperspace.publisher.data.auth.PhoneVerification
import com.epaperspace.publisher.data.network.ApiResult
import com.epaperspace.publisher.data.repository.AuthRepository
import com.google.firebase.auth.PhoneAuthCredential
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class OtpStep { ENTER_PHONE, ENTER_CODE }

data class PhoneAuthUiState(
  val step: OtpStep = OtpStep.ENTER_PHONE,
  val phone: String = "",
  val code: String = "",
  val phoneError: String? = null,
  val codeError: String? = null,
  val error: String? = null,
  val busy: Boolean = false,
  val signedIn: Boolean = false,
  val available: Boolean = false,
) {
  val canResend: Boolean get() = step == OtpStep.ENTER_CODE && !busy
}

/**
 * Phone sign-in. Two guards matter here and neither is cosmetic:
 *  - `auditSmsSend` must pass before Firebase is asked to send anything. SMS is billed per message
 *    and the worker enforces per-IP hourly and per-tenant daily caps.
 *  - the resulting Firebase idToken is only an identity claim; the worker still decides whether
 *    this phone belongs to a publisher account.
 */
class PhoneAuthViewModel(
  private val repository: AuthRepository,
  private val firebase: FirebaseAuthClient,
) : ViewModel() {

  private val _state = MutableStateFlow(PhoneAuthUiState(available = firebase.isConfigured))
  val state: StateFlow<PhoneAuthUiState> = _state.asStateFlow()

  private var verificationId: String? = null

  fun onPhoneChange(value: String) =
    _state.update { it.copy(phone = value, phoneError = null, error = null) }

  fun onCodeChange(value: String) =
    _state.update { it.copy(code = value.filter(Char::isDigit).take(OTP_LENGTH), codeError = null) }

  fun dismissError() = _state.update { it.copy(error = null) }

  fun backToPhone() {
    verificationId = null
    _state.update {
      it.copy(step = OtpStep.ENTER_PHONE, code = "", codeError = null, error = null)
    }
  }

  fun sendCode(activity: Activity) {
    val phone = _state.value.phone.filter { it.isDigit() || it == '+' }
    if (_state.value.busy) return

    // Firebase requires E.164. Anything else is rejected server-side with a vague message, so
    // catch it here where we can say something useful.
    if (!phone.startsWith("+") || phone.length < MIN_E164_LENGTH) {
      _state.update {
        it.copy(phoneError = "Include the country code, for example +919876543210.")
      }
      return
    }

    _state.update { it.copy(busy = true, error = null) }
    viewModelScope.launch {
      when (val audit = repository.auditSmsSend(phone)) {
        is ApiResult.Failure ->
          _state.update { it.copy(busy = false, error = audit.error.message) }

        is ApiResult.Success -> if (!audit.data.allowed) {
          _state.update {
            it.copy(
              busy = false,
              error = "Too many code requests. Wait a few minutes and try again.",
            )
          }
        } else {
          dispatchOtp(activity, phone)
        }
      }
    }
  }

  fun confirmCode() {
    val current = _state.value
    if (current.busy) return
    if (current.code.length != OTP_LENGTH) {
      _state.update { it.copy(codeError = "Enter the $OTP_LENGTH-digit code.") }
      return
    }
    val id = verificationId ?: run {
      _state.update { it.copy(error = "That code expired. Request a new one.") }
      return
    }

    _state.update { it.copy(busy = true, error = null) }
    viewModelScope.launch {
      when (val token = firebase.confirmOtp(id, current.code)) {
        is ApiResult.Failure ->
          _state.update { it.copy(busy = false, codeError = token.error.message) }

        is ApiResult.Success -> exchange(token.data)
      }
    }
  }

  private suspend fun dispatchOtp(activity: Activity, phone: String) {
    when (val verification = firebase.sendOtp(activity, phone)) {
      is PhoneVerification.Failed ->
        _state.update { it.copy(busy = false, error = verification.message) }

      is PhoneVerification.CodeSent -> {
        verificationId = verification.verificationId
        _state.update { it.copy(busy = false, step = OtpStep.ENTER_CODE) }
      }

      // Some devices read the SMS themselves; skip the code screen entirely.
      is PhoneVerification.AutoVerified -> signInWith(verification.credential)
    }
  }

  private suspend fun signInWith(credential: PhoneAuthCredential) {
    when (val token = firebase.exchange(credential)) {
      is ApiResult.Failure -> _state.update { it.copy(busy = false, error = token.error.message) }
      is ApiResult.Success -> exchange(token.data)
    }
  }

  private suspend fun exchange(idToken: String) {
    when (val session = repository.verifyOrg(idToken)) {
      is ApiResult.Success -> _state.update { it.copy(busy = false, signedIn = true) }
      is ApiResult.Failure -> {
        firebase.signOut()
        _state.update { it.copy(busy = false, error = session.error.message) }
      }
    }
  }

  private companion object {
    const val OTP_LENGTH = 6

    /** "+" plus a 1-3 digit country code plus a subscriber number. Shortest real numbers are ~8. */
    const val MIN_E164_LENGTH = 8
  }
}
