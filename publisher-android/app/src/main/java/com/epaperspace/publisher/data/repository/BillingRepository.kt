package com.epaperspace.publisher.data.repository

import com.epaperspace.publisher.data.SessionManager
import com.epaperspace.publisher.data.model.CancelSubscriptionRequest
import com.epaperspace.publisher.data.model.CancelSubscriptionResult
import com.epaperspace.publisher.data.model.CreateReaderRequest
import com.epaperspace.publisher.data.model.ItemsResponse
import com.epaperspace.publisher.data.model.ManualGrantRequest
import com.epaperspace.publisher.data.model.PatchManualGrantRequest
import com.epaperspace.publisher.data.model.PlatformBillingStatus
import com.epaperspace.publisher.data.model.PlatformTier
import com.epaperspace.publisher.data.model.ProcessRefundRequest
import com.epaperspace.publisher.data.model.RazorpayConfig
import com.epaperspace.publisher.data.model.RazorpayConfigRequest
import com.epaperspace.publisher.data.model.Reader
import com.epaperspace.publisher.data.model.ReaderPage
import com.epaperspace.publisher.data.model.ReaderSubscription
import com.epaperspace.publisher.data.model.RefundReasonRequest
import com.epaperspace.publisher.data.model.RefundRequest
import com.epaperspace.publisher.data.model.SubscribeRequest
import com.epaperspace.publisher.data.model.SubscribeResult
import com.epaperspace.publisher.data.model.VerifyPaymentRequest
import com.epaperspace.publisher.data.model.VerifyPaymentResult
import com.epaperspace.publisher.data.model.WebhookSecret
import com.epaperspace.publisher.data.network.ApiCaller
import com.epaperspace.publisher.data.network.ApiResult
import com.epaperspace.publisher.data.network.api.BillingApi

/**
 * Both billing lanes behind one type. They are not interchangeable: the tenant lane moves money
 * through the publisher's own Razorpay account, the platform lane is the publisher paying us.
 * Method names keep the lane explicit so a call site cannot confuse them.
 */
class BillingRepository(
  private val api: BillingApi,
  private val caller: ApiCaller,
  private val sessions: SessionManager,
) {

  // ---- Tenant lane: payment configuration ----

  suspend fun razorpayConfig(): ApiResult<RazorpayConfig> =
    caller.call { api.razorpayConfig(requireSlug()) }

  suspend fun saveRazorpayConfig(request: RazorpayConfigRequest): ApiResult<RazorpayConfig> =
    caller.call { api.saveRazorpayConfig(requireSlug(), request) }

  /** The returned secret is shown once and is never readable again. */
  suspend fun rotateWebhookSecret(): ApiResult<WebhookSecret> =
    caller.call { api.rotateWebhookSecret(requireSlug()) }

  // ---- Tenant lane: readers ----

  suspend fun readers(page: Int = 1): ApiResult<ReaderPage> =
    caller.call { api.readers(requireSlug(), page) }

  suspend fun createReader(request: CreateReaderRequest): ApiResult<Reader> =
    caller.call { api.createReader(requireSlug(), request) }

  suspend fun cancelReaderSubscription(readerId: String): ApiResult<Unit> =
    caller.call { api.cancelReaderSubscription(requireSlug(), readerId) }

  suspend fun deleteReader(readerId: String): ApiResult<Unit> =
    caller.call { api.deleteReader(requireSlug(), readerId) }

  suspend fun readerSubscriptions(): ApiResult<ItemsResponse<ReaderSubscription>> =
    caller.call { api.readerSubscriptions(requireSlug()) }

  suspend fun subscriptionsForReader(
    readerId: String,
  ): ApiResult<ItemsResponse<ReaderSubscription>> =
    caller.call { api.subscriptionsForReader(requireSlug(), readerId) }

  suspend fun grantManualSubscription(
    request: ManualGrantRequest,
  ): ApiResult<ReaderSubscription> =
    caller.call { api.grantManualSubscription(requireSlug(), request) }

  suspend fun patchManualSubscription(
    id: String,
    request: PatchManualGrantRequest,
  ): ApiResult<ReaderSubscription> =
    caller.call { api.patchManualSubscription(requireSlug(), id, request) }

  /**
   * Whether to show manual-grant controls. The billing worker re-decides on every request, so
   * this only hides UI — it is not the gate.
   */
  fun canGrantSubscriptions(): Boolean = sessions.current?.canGrantSubscriptions() == true

  // ---- Tenant lane: refunds ----

  suspend fun refundRequests(status: String? = null): ApiResult<ItemsResponse<RefundRequest>> =
    caller.call { api.refundRequests(requireSlug(), status) }

  suspend fun processRefundRequest(
    id: String,
    request: ProcessRefundRequest,
  ): ApiResult<RefundRequest> = caller.call { api.processRefundRequest(requireSlug(), id, request) }

  // ---- Platform lane ----

  /** Public route — works before a session exists. */
  suspend fun platformTiers(): ApiResult<ItemsResponse<PlatformTier>> =
    caller.call { api.platformTiers() }

  suspend fun platformStatus(): ApiResult<PlatformBillingStatus> =
    caller.call { api.platformStatus(requireSlug()) }

  /** Yields a Razorpay subscription id — checkout must run in subscription mode, not order mode. */
  suspend fun subscribeToPlatformPlan(request: SubscribeRequest): ApiResult<SubscribeResult> =
    caller.call { api.subscribeToPlatformPlan(request) }

  /** Nothing counts as paid until this returns success; the signature is verified server-side. */
  suspend fun verifyPlatformPayment(request: VerifyPaymentRequest): ApiResult<VerifyPaymentResult> =
    caller.call { api.verifyPlatformPayment(request) }

  suspend fun cancelPlatformSubscription(
    request: CancelSubscriptionRequest,
  ): ApiResult<CancelSubscriptionResult> =
    caller.call { api.cancelPlatformSubscription(requireSlug(), request) }

  suspend fun requestPlatformRefund(request: RefundReasonRequest): ApiResult<RefundRequest> =
    caller.call { api.requestPlatformRefund(requireSlug(), request) }

  private fun requireSlug(): String = sessions.current?.slug
    ?: throw IllegalStateException("No active session while calling a slug-scoped route.")
}
