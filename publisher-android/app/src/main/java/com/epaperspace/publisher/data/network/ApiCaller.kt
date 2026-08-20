package com.epaperspace.publisher.data.network

import com.epaperspace.publisher.data.SessionEvent
import com.epaperspace.publisher.data.SessionEventBus
import retrofit2.Response
import java.io.IOException

/**
 * Unwraps the worker envelope into an [ApiResult] and raises the session-level events the web
 * client raises as window events (`epaper:unauthorized`, `epaper:tenant-suspended`,
 * `epaper:tenant-deleted`). Every repository funnels through this so those conditions are handled
 * once, not per call site.
 */
class ApiCaller(private val events: SessionEventBus) {

  suspend fun <T> call(block: suspend () -> Response<ApiEnvelope<T>>): ApiResult<T> {
    val response = try {
      block()
    } catch (e: IOException) {
      return ApiResult.Failure(
        ApiError(ApiErrorCodes.NETWORK_ERROR, "No connection. Check your network and try again.")
      )
    } catch (e: Exception) {
      return ApiResult.Failure(
        ApiError(ApiErrorCodes.INTERNAL_ERROR, e.message ?: "Something went wrong.")
      )
    }

    val body = response.body()
    if (response.isSuccessful && body?.ok == true) {
      // A 200 with `data: null` is legitimate for endpoints that only acknowledge (Unit calls).
      @Suppress("UNCHECKED_CAST")
      return ApiResult.Success((body.data ?: Unit) as T)
    }

    val raw = body?.error
    val code = raw?.code ?: httpFallbackCode(response.code())
    val message = raw?.message

    dispatchSessionEvents(response.code(), message)

    return ApiResult.Failure(
      ApiError(code, translate(code, message, response.code()), response.code())
    )
  }

  private fun dispatchSessionEvents(status: Int, message: String?) {
    when {
      status == 401 -> events.emit(SessionEvent.Unauthorized)
      message == ApiErrorCodes.TENANT_SUSPENDED -> events.emit(SessionEvent.TenantSuspended)
      message == ApiErrorCodes.TENANT_DELETED -> events.emit(SessionEvent.TenantDeleted)
    }
  }

  /**
   * The write gate answers with a bare sentinel in `message`, not prose. Translated here so no
   * screen ever renders `EMAIL_NOT_VERIFIED` at a publisher — same strings the web portal uses.
   */
  private fun translate(code: String, message: String?, status: Int): String = when {
    message == ApiErrorCodes.EMAIL_NOT_VERIFIED || code == ApiErrorCodes.EMAIL_NOT_VERIFIED ->
      "Verify your email address before publishing. Open Settings to resend the link."

    message == ApiErrorCodes.VERIFICATION_UNAVAILABLE ->
      "Could not check your account just now. Please try again in a moment."

    status == 401 -> "Your session has expired. Please sign in again."
    status == 429 -> message ?: "Too many attempts. Please wait a little and try again."
    message.isNullOrBlank() -> "Something went wrong. Please try again."
    else -> message
  }

  private fun httpFallbackCode(status: Int): String = when (status) {
    400 -> ApiErrorCodes.BAD_REQUEST
    401 -> ApiErrorCodes.UNAUTHORIZED
    403 -> ApiErrorCodes.FORBIDDEN
    404 -> ApiErrorCodes.NOT_FOUND
    409 -> ApiErrorCodes.CONFLICT
    429 -> ApiErrorCodes.RATE_LIMITED
    else -> ApiErrorCodes.INTERNAL_ERROR
  }
}
