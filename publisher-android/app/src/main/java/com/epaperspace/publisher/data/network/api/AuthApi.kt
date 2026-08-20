package com.epaperspace.publisher.data.network.api

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
import com.epaperspace.publisher.data.network.ApiEnvelope
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

/**
 * `epaper-auth` worker. The Authorization header is attached by AuthInterceptor for every
 * authenticated call, so no @Header parameters here.
 */
interface AuthApi {

  @POST("api/auth/signup")
  suspend fun signup(@Body body: SignupRequest): Response<ApiEnvelope<AuthSession>>

  @POST("api/auth/org-login")
  suspend fun orgLogin(@Body body: LoginRequest): Response<ApiEnvelope<AuthSession>>

  /** Google and Phone both land here: exchange a Firebase idToken for a platform JWT. */
  @POST("api/auth/verify-org")
  suspend fun verifyOrg(@Body body: FirebaseTokenRequest): Response<ApiEnvelope<AuthSession>>

  @GET("api/auth/profile")
  suspend fun profile(): Response<ApiEnvelope<Profile>>

  @POST("api/auth/add-phone")
  suspend fun addPhone(@Body body: FirebaseTokenRequest): Response<ApiEnvelope<AddPhoneResult>>

  @POST("api/auth/add-email")
  suspend fun addEmail(@Body body: EmailRequest): Response<ApiEnvelope<AddEmailResult>>

  /**
   * SMS quota pre-flight. Call this and require success *before* asking Firebase to send an OTP —
   * a 429 here means stop, not retry.
   */
  @POST("api/auth/audit/sms-send")
  suspend fun auditSmsSend(@Body body: SmsAuditRequest): Response<ApiEnvelope<SmsAuditResult>>

  // Email verification. The public send endpoint answers generically whether or not the address
  // exists — show its `message` verbatim so the UI never reveals who has an account.
  @POST("api/auth/verify-email/send")
  suspend fun sendVerifyEmail(@Body body: EmailRequest): Response<ApiEnvelope<GenericMessage>>

  @POST("api/auth/verify-email/resend")
  suspend fun resendVerifyEmail(): Response<ApiEnvelope<ResendVerifyResult>>

  @POST("api/auth/verify-email/confirm")
  suspend fun confirmVerifyEmail(
    @Body body: ConfirmCodeRequest,
  ): Response<ApiEnvelope<VerifyEmailConfirmResult>>

  @POST("api/auth/password-reset/request")
  suspend fun requestPasswordReset(@Body body: EmailRequest): Response<ApiEnvelope<GenericMessage>>

  @POST("api/auth/password-reset/confirm")
  suspend fun confirmPasswordReset(
    @Body body: PasswordResetConfirmRequest,
  ): Response<ApiEnvelope<AuthSession>>

  // Provisioning lifecycle (served by epaper-admin, same /api/auth prefix).
  @GET("api/auth/provision-status")
  suspend fun provisionStatus(): Response<ApiEnvelope<ProvisionStatus>>

  @POST("api/auth/verify-provisioning")
  suspend fun verifyProvisioning(): Response<ApiEnvelope<ProvisionStatus>>

  @POST("api/auth/reprovision")
  suspend fun reprovision(): Response<ApiEnvelope<ReprovisionResult>>
}
