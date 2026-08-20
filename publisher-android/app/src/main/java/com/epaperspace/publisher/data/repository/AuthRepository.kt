package com.epaperspace.publisher.data.repository

import com.epaperspace.publisher.data.SessionManager
import com.epaperspace.publisher.data.model.AddEmailResult
import com.epaperspace.publisher.data.model.AddPhoneResult
import com.epaperspace.publisher.data.model.AuthSession
import com.epaperspace.publisher.data.model.ConfirmCodeRequest
import com.epaperspace.publisher.data.model.EmailRequest
import com.epaperspace.publisher.data.model.FirebaseTokenRequest
import com.epaperspace.publisher.data.model.GenericMessage
import com.epaperspace.publisher.data.model.LoginRequest
import com.epaperspace.publisher.data.model.PasswordResetConfirmRequest
import com.epaperspace.publisher.data.model.Profile
import com.epaperspace.publisher.data.model.ProvisionStatus
import com.epaperspace.publisher.data.model.ReprovisionResult
import com.epaperspace.publisher.data.model.ResendVerifyResult
import com.epaperspace.publisher.data.model.SignupRequest
import com.epaperspace.publisher.data.model.SmsAuditRequest
import com.epaperspace.publisher.data.model.SmsAuditResult
import com.epaperspace.publisher.data.model.VerifyEmailConfirmResult
import com.epaperspace.publisher.data.network.ApiCaller
import com.epaperspace.publisher.data.network.ApiError
import com.epaperspace.publisher.data.network.ApiErrorCodes
import com.epaperspace.publisher.data.network.ApiResult
import com.epaperspace.publisher.data.network.api.AuthApi

/**
 * Everything that mints or repairs a session. The three sign-in paths (password, Google, phone)
 * all converge on [adopt], so the session is written in exactly one place.
 */
class AuthRepository(
  private val api: AuthApi,
  private val caller: ApiCaller,
  private val sessions: SessionManager,
) {

  suspend fun signup(request: SignupRequest): ApiResult<AuthSession> =
    caller.call { api.signup(request) }.adopt()

  suspend fun login(email: String, password: String): ApiResult<AuthSession> =
    caller.call { api.orgLogin(LoginRequest(email.trim(), password)) }.adopt()

  /**
   * Google and phone both land here. The Firebase idToken proves the identity; the worker answers
   * with the platform JWT that actually authorises this app.
   */
  suspend fun verifyOrg(idToken: String): ApiResult<AuthSession> =
    caller.call { api.verifyOrg(FirebaseTokenRequest(idToken)) }.adopt()

  /**
   * SMS pre-flight. Must succeed before Firebase is asked to send anything: the worker enforces a
   * per-IP hourly limit plus a per-tenant daily cap, and every message is billable.
   */
  suspend fun auditSmsSend(phoneNumber: String): ApiResult<SmsAuditResult> =
    caller.call { api.auditSmsSend(SmsAuditRequest(phonePrefix = phoneNumber.take(5))) }

  suspend fun profile(): ApiResult<Profile> = caller.call { api.profile() }

  suspend fun addPhone(idToken: String): ApiResult<AddPhoneResult> =
    caller.call { api.addPhone(FirebaseTokenRequest(idToken)) }

  suspend fun addEmail(email: String): ApiResult<AddEmailResult> =
    caller.call { api.addEmail(EmailRequest(email.trim())) }

  suspend fun sendVerifyEmail(email: String): ApiResult<GenericMessage> =
    caller.call { api.sendVerifyEmail(EmailRequest(email.trim())) }

  suspend fun resendVerifyEmail(): ApiResult<ResendVerifyResult> =
    caller.call { api.resendVerifyEmail() }

  suspend fun confirmVerifyEmail(code: String): ApiResult<VerifyEmailConfirmResult> =
    caller.call { api.confirmVerifyEmail(ConfirmCodeRequest(code.trim())) }

  suspend fun requestPasswordReset(email: String): ApiResult<GenericMessage> =
    caller.call { api.requestPasswordReset(EmailRequest(email.trim())) }

  suspend fun confirmPasswordReset(code: String, newPassword: String): ApiResult<AuthSession> =
    caller.call { api.confirmPasswordReset(PasswordResetConfirmRequest(code.trim(), newPassword)) }

  suspend fun provisionStatus(): ApiResult<ProvisionStatus> =
    caller.call { api.provisionStatus() }.also { result ->
      if (result is ApiResult.Success) sessions.updateStatus(result.data.status)
    }

  suspend fun verifyProvisioning(): ApiResult<ProvisionStatus> =
    caller.call { api.verifyProvisioning() }.also { result ->
      if (result is ApiResult.Success) sessions.updateStatus(result.data.status)
    }

  suspend fun reprovision(): ApiResult<ReprovisionResult> = caller.call { api.reprovision() }

  fun signOut() = sessions.signOut()

  /**
   * Stores a freshly minted token. [SessionManager.sign] refuses a token issued for another
   * audience, which surfaces here as a explicit failure rather than a half-signed-in app.
   */
  private fun ApiResult<AuthSession>.adopt(): ApiResult<AuthSession> {
    if (this !is ApiResult.Success) return this
    if (data.token.isBlank()) {
      return ApiResult.Failure(
        ApiError(ApiErrorCodes.INTERNAL_ERROR, "Sign-in did not return a session. Try again.")
      )
    }
    val session = sessions.sign(data.token, data.slug, data.status)
      ?: return ApiResult.Failure(
        ApiError(ApiErrorCodes.FORBIDDEN, "That account cannot sign in to the publisher app.")
      )
    return ApiResult.Success(data.copy(slug = session.slug, status = session.status))
  }
}
