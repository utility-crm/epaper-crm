package com.epaperspace.publisher.data.auth

import android.app.Activity
import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.epaperspace.publisher.data.network.ApiError
import com.epaperspace.publisher.data.network.ApiErrorCodes
import com.epaperspace.publisher.data.network.ApiResult
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.FirebaseException
import com.google.firebase.FirebaseTooManyRequestsException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthInvalidCredentialsException
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.auth.PhoneAuthCredential
import com.google.firebase.auth.PhoneAuthOptions
import com.google.firebase.auth.PhoneAuthProvider
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.tasks.await

/**
 * Thin wrapper over Firebase Auth. Its only job is to produce a Firebase idToken; the platform JWT
 * that actually authorises this app comes from our auth worker, which verifies that idToken
 * server-side. Nothing here is a trust decision.
 */
class FirebaseAuthClient(
  private val context: Context,
  /** Null until google-services.json is present — Firebase cannot initialise without it. */
  private val auth: FirebaseAuth?,
  /** Web OAuth client ID from the Firebase console — not the Android client ID. */
  private val serverClientId: String,
) {

  val isConfigured: Boolean get() = auth != null && serverClientId.isNotBlank()

  /**
   * Google sign-in through Credential Manager. Needs an Activity context: the bottom sheet is
   * hosted by the caller's window.
   */
  suspend fun signInWithGoogle(activity: Activity): ApiResult<String> {
    val auth = auth
    if (auth == null || !isConfigured) return misconfigured()

    val option = GetSignInWithGoogleOption.Builder(serverClientId).build()
    val request = GetCredentialRequest.Builder().addCredentialOption(option).build()

    return try {
      val response = CredentialManager.create(context).getCredential(activity, request)
      val googleIdToken =
        GoogleIdTokenCredential.createFrom(response.credential.data).idToken

      val result = auth.signInWithCredential(
        GoogleAuthProvider.getCredential(googleIdToken, null)
      ).await()

      val firebaseIdToken = result.user?.getIdToken(true)?.await()?.token
        ?: return failure(ApiErrorCodes.INTERNAL_ERROR, "Google sign-in did not return a token.")

      ApiResult.Success(firebaseIdToken)
    } catch (e: GetCredentialCancellationException) {
      failure(CODE_CANCELLED, "Sign-in cancelled.")
    } catch (e: NoCredentialException) {
      failure(
        ApiErrorCodes.NOT_FOUND,
        "No Google account is available on this device. Add one in Settings and try again.",
      )
    } catch (e: GetCredentialException) {
      failure(ApiErrorCodes.INTERNAL_ERROR, e.message ?: "Google sign-in failed.")
    } catch (e: Exception) {
      failure(ApiErrorCodes.INTERNAL_ERROR, e.message ?: "Google sign-in failed.")
    }
  }

  /**
   * Sends an OTP. Callers MUST have a successful `auditSmsSend` first — every message is billed
   * and rate-limited server-side.
   *
   * Firebase may auto-retrieve the code on devices that can read the SMS, in which case
   * [PhoneVerification.AutoVerified] arrives and no code entry is needed.
   */
  suspend fun sendOtp(activity: Activity, phoneNumber: String): PhoneVerification {
    val auth = auth ?: return PhoneVerification.Failed(NOT_CONFIGURED)
    return suspendCancellableCoroutine { continuation ->
      val callbacks = object : PhoneAuthProvider.OnVerificationStateChangedCallbacks() {
        override fun onVerificationCompleted(credential: PhoneAuthCredential) {
          if (continuation.isActive) {
            continuation.resume(PhoneVerification.AutoVerified(credential))
          }
        }

        override fun onVerificationFailed(e: FirebaseException) {
          if (!continuation.isActive) return
          val message = when (e) {
            is FirebaseTooManyRequestsException ->
              "Too many attempts from this device. Try again later."
            is FirebaseAuthInvalidCredentialsException ->
              "That phone number is not valid. Include the country code."
            else -> e.message ?: "Could not send the code."
          }
          continuation.resume(PhoneVerification.Failed(message))
        }

        override fun onCodeSent(
          verificationId: String,
          token: PhoneAuthProvider.ForceResendingToken,
        ) {
          if (continuation.isActive) {
            continuation.resume(PhoneVerification.CodeSent(verificationId, token))
          }
        }
      }

      val options = PhoneAuthOptions.newBuilder(auth)
        .setPhoneNumber(phoneNumber)
        .setTimeout(OTP_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .setActivity(activity)
        .setCallbacks(callbacks)
        .build()

      PhoneAuthProvider.verifyPhoneNumber(options)
    }
  }

  suspend fun confirmOtp(verificationId: String, code: String): ApiResult<String> =
    exchange(PhoneAuthProvider.getCredential(verificationId, code))

  /** Completes an auto-retrieved verification, which already carries the credential. */
  suspend fun exchange(credential: PhoneAuthCredential): ApiResult<String> {
    val auth = auth ?: return misconfigured()
    return try {
      val result = auth.signInWithCredential(credential).await()
      val token = result.user?.getIdToken(true)?.await()?.token
      if (token == null) {
        failure(ApiErrorCodes.INTERNAL_ERROR, "Phone sign-in did not return a token.")
      } else {
        ApiResult.Success(token)
      }
    } catch (e: FirebaseAuthInvalidCredentialsException) {
      failure(ApiErrorCodes.BAD_REQUEST, "That code is incorrect or has expired.")
    } catch (e: Exception) {
      failure(ApiErrorCodes.INTERNAL_ERROR, e.message ?: "Could not verify the code.")
    }
  }

  /** Firebase keeps its own session; ours is the one that matters, so drop theirs on sign-out. */
  fun signOut() {
    auth?.signOut()
  }

  private fun misconfigured() = failure(ApiErrorCodes.INTERNAL_ERROR, NOT_CONFIGURED)

  private fun failure(code: String, message: String): ApiResult<String> =
    ApiResult.Failure(ApiError(code, message))

  companion object {
    const val OTP_TIMEOUT_SECONDS = 60L

    /** Not an error worth showing as one — the user pressed back. */
    const val CODE_CANCELLED = "CANCELLED"

    const val NOT_CONFIGURED = "Google and phone sign-in are not configured in this build."
  }
}

sealed interface PhoneVerification {
  data class CodeSent(
    val verificationId: String,
    val resendToken: PhoneAuthProvider.ForceResendingToken,
  ) : PhoneVerification

  data class AutoVerified(val credential: PhoneAuthCredential) : PhoneVerification

  data class Failed(val message: String) : PhoneVerification
}
