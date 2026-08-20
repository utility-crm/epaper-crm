package com.epaperspace.publisher.data.model

import com.google.gson.annotations.SerializedName

/**
 * Auth-worker shapes. This surface is camelCase on the wire (`orgName`, `idToken`,
 * `newPassword`), so these need no @SerializedName — except responses that come from the
 * control DB, which are snake_case.
 */

data class SignupRequest(
  val orgName: String,
  val name: String,
  val email: String? = null,
  val password: String? = null,
  /** Firebase idToken. Present instead of email/password for Google and Phone signup. */
  val idToken: String? = null,
)

data class LoginRequest(val email: String, val password: String)

data class FirebaseTokenRequest(val idToken: String)

data class AuthSession(
  val token: String = "",
  val slug: String? = null,
  val status: String? = null,
)

/**
 * SMS pre-flight. Must be called and must succeed before Firebase sends an OTP — the worker
 * enforces a per-IP hourly limit and a per-tenant daily cap, and SMS is metered at ~$0.10.
 */
data class SmsAuditRequest(
  val phonePrefix: String,
  /** "system" for the publisher lane; a tenant slug for the reader lane. */
  val slug: String = "system",
  val stage: String = "publisher",
)

data class SmsAuditResult(val allowed: Boolean = false)

data class EmailRequest(val email: String)

data class ConfirmCodeRequest(val code: String)

data class PasswordResetConfirmRequest(val code: String, val newPassword: String)

data class GenericMessage(val message: String = "")

data class VerifyEmailConfirmResult(val slug: String? = null, val email: String? = null)

data class ResendVerifyResult(val sent: Boolean = false, val email: String? = null)

data class AddEmailResult(
  val email: String = "",
  @SerializedName("email_verified") val emailVerified: Boolean = false,
  val sent: Boolean = false,
)

data class AddPhoneResult(@SerializedName("phone_number") val phoneNumber: String? = null)

/** `GET /api/auth/profile` */
data class Profile(
  val email: String? = null,
  @SerializedName("phone_number") val phoneNumber: String? = null,
  @SerializedName("email_verified") val emailVerified: Boolean = false,
  @SerializedName("auth_provider") val authProvider: String? = null,
) {
  /**
   * The content worker's write gate blocks edition/paper creation and all uploads while an
   * account has an unverified email. Phone-only accounts (no email at all) pass.
   */
  val writesBlocked: Boolean get() = !email.isNullOrBlank() && !emailVerified
}

/**
 * `GET /api/auth/provision-status`. `awaitingVerification` is true only while a pending tenant is
 * held back by an unconfirmed owner address — provisioning has not started and will not until the
 * link is opened.
 */
data class ProvisionStatus(
  val status: String = "",
  @SerializedName("provision_run_id") val provisionRunId: String? = null,
  @SerializedName("awaiting_verification") val awaitingVerification: Boolean = false,
  val email: String? = null,
  val recovered: Boolean? = null,
)

data class ReprovisionResult(val reprovisioning: Boolean = false)
