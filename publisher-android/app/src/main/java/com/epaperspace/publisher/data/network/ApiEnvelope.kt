package com.epaperspace.publisher.data.network

/**
 * Every ePaper worker answers with this envelope — including on 4xx and 5xx. API interfaces
 * therefore declare `Response<ApiEnvelope<T>>` rather than a bare body, so [ApiCaller] can read
 * the status line and the error payload together instead of losing the body to an HttpException.
 *
 * Gson runs with default (identity) field naming here on purpose: the backend mixes conventions —
 * auth takes camelCase (`orgName`, `idToken`, `newPassword`) while content takes snake_case
 * (`publish_date`, `free_page_count`). Annotate snake_case fields with `@SerializedName`
 * explicitly rather than flipping a global policy that would silently break the other half.
 */
data class ApiEnvelope<T>(
  val ok: Boolean = false,
  val data: T? = null,
  val error: ApiErrorBody? = null,
)

data class ApiErrorBody(
  val code: String? = null,
  val message: String? = null,
)

sealed interface ApiResult<out T> {
  data class Success<out T>(val data: T) : ApiResult<T>

  data class Failure(val error: ApiError) : ApiResult<Nothing>
}

data class ApiError(
  val code: String,
  val message: String,
  val httpStatus: Int? = null,
) {
  /** The content worker's write gate: publisher must confirm their address before publishing. */
  val isEmailNotVerified: Boolean get() = code == ApiErrorCodes.EMAIL_NOT_VERIFIED

  val isRateLimited: Boolean get() = code == ApiErrorCodes.RATE_LIMITED || httpStatus == 429
}

object ApiErrorCodes {
  const val UNAUTHORIZED = "UNAUTHORIZED"
  const val FORBIDDEN = "FORBIDDEN"
  const val NOT_FOUND = "NOT_FOUND"
  const val BAD_REQUEST = "BAD_REQUEST"
  const val CONFLICT = "CONFLICT"
  const val RATE_LIMITED = "RATE_LIMITED"
  const val INTERNAL_ERROR = "INTERNAL_ERROR"
  const val NETWORK_ERROR = "NETWORK_ERROR"
  const val SLUG_NOT_FOUND = "SLUG_NOT_FOUND"

  // Sentinels the workers return in `error.message` rather than as prose. The web client
  // translates these once in its api.ts; we do the same in ApiCaller.
  const val EMAIL_NOT_VERIFIED = "EMAIL_NOT_VERIFIED"
  const val VERIFICATION_UNAVAILABLE = "VERIFICATION_UNAVAILABLE"
  const val TENANT_SUSPENDED = "TENANT_SUSPENDED"
  const val TENANT_DELETED = "TENANT_DELETED"
}

inline fun <T> ApiResult<T>.onSuccess(block: (T) -> Unit): ApiResult<T> {
  if (this is ApiResult.Success) block(data)
  return this
}

inline fun <T> ApiResult<T>.onFailure(block: (ApiError) -> Unit): ApiResult<T> {
  if (this is ApiResult.Failure) block(error)
  return this
}

fun <T> ApiResult<T>.getOrNull(): T? = (this as? ApiResult.Success)?.data

fun <T> ApiResult<T>.errorOrNull(): ApiError? = (this as? ApiResult.Failure)?.error
