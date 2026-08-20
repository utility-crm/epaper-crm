package com.epaperspace.publisher.data.network.api

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
import com.epaperspace.publisher.data.network.ApiEnvelope
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Both billing lanes. The `tenant` routes are the publisher selling to readers with their own
 * Razorpay keys; the `platform` routes are the publisher paying the SaaS. Do not mix them.
 */
interface BillingApi {

  // ---- Tenant lane: payment configuration ----

  @GET("api/billing/tenant/{slug}/config")
  suspend fun razorpayConfig(@Path("slug") slug: String): Response<ApiEnvelope<RazorpayConfig>>

  @POST("api/billing/tenant/{slug}/config")
  suspend fun saveRazorpayConfig(
    @Path("slug") slug: String,
    @Body body: RazorpayConfigRequest,
  ): Response<ApiEnvelope<RazorpayConfig>>

  /** Returns the new secret once. It is never readable again. */
  @POST("api/billing/tenant/{slug}/config/webhook-secret/rotate")
  suspend fun rotateWebhookSecret(
    @Path("slug") slug: String,
  ): Response<ApiEnvelope<WebhookSecret>>

  // ---- Tenant lane: readers ----

  @GET("api/billing/tenant/{slug}/users")
  suspend fun readers(
    @Path("slug") slug: String,
    @Query("page") page: Int = 1,
  ): Response<ApiEnvelope<ReaderPage>>

  /** Temp password comes back once in the response; surface it and never re-fetch. */
  @POST("api/billing/tenant/{slug}/users")
  suspend fun createReader(
    @Path("slug") slug: String,
    @Body body: CreateReaderRequest,
  ): Response<ApiEnvelope<Reader>>

  @POST("api/billing/tenant/{slug}/users/{id}/cancel")
  suspend fun cancelReaderSubscription(
    @Path("slug") slug: String,
    @Path("id") id: String,
  ): Response<ApiEnvelope<Unit>>

  @DELETE("api/billing/tenant/{slug}/users/{id}")
  suspend fun deleteReader(
    @Path("slug") slug: String,
    @Path("id") id: String,
  ): Response<ApiEnvelope<Unit>>

  @GET("api/billing/tenant/{slug}/subscriptions")
  suspend fun readerSubscriptions(
    @Path("slug") slug: String,
  ): Response<ApiEnvelope<ItemsResponse<ReaderSubscription>>>

  @GET("api/billing/tenant/{slug}/readers/{readerId}/subscriptions")
  suspend fun subscriptionsForReader(
    @Path("slug") slug: String,
    @Path("readerId") readerId: String,
  ): Response<ApiEnvelope<ItemsResponse<ReaderSubscription>>>

  /**
   * Off-platform access (cash, cheque, enterprise deal). The worker re-checks the caller's
   * permission — hiding the button client-side is a courtesy, not the gate.
   */
  @POST("api/billing/tenant/{slug}/manual-subscriptions")
  suspend fun grantManualSubscription(
    @Path("slug") slug: String,
    @Body body: ManualGrantRequest,
  ): Response<ApiEnvelope<ReaderSubscription>>

  @PATCH("api/billing/tenant/{slug}/manual-subscriptions/{id}")
  suspend fun patchManualSubscription(
    @Path("slug") slug: String,
    @Path("id") id: String,
    @Body body: PatchManualGrantRequest,
  ): Response<ApiEnvelope<ReaderSubscription>>

  // ---- Tenant lane: refunds raised by readers ----

  @GET("api/billing/tenant/{slug}/refund-requests")
  suspend fun refundRequests(
    @Path("slug") slug: String,
    @Query("status") status: String? = null,
  ): Response<ApiEnvelope<ItemsResponse<RefundRequest>>>

  @POST("api/billing/tenant/{slug}/refund-requests/{id}/process")
  suspend fun processRefundRequest(
    @Path("slug") slug: String,
    @Path("id") id: String,
    @Body body: ProcessRefundRequest,
  ): Response<ApiEnvelope<RefundRequest>>

  // ---- Platform lane: the publisher's own SaaS subscription ----

  /** Public — no token needed. Drives the plan grid. */
  @GET("api/tiers")
  suspend fun platformTiers(): Response<ApiEnvelope<ItemsResponse<PlatformTier>>>

  @GET("api/billing/platform/{slug}/status")
  suspend fun platformStatus(
    @Path("slug") slug: String,
  ): Response<ApiEnvelope<PlatformBillingStatus>>

  /**
   * Returns a Razorpay *subscription* id, not an order id — these run as e-mandate / UPI Autopay,
   * so the checkout must be opened in subscription mode.
   */
  @POST("api/billing/platform/subscribe")
  suspend fun subscribeToPlatformPlan(
    @Body body: SubscribeRequest,
  ): Response<ApiEnvelope<SubscribeResult>>

  /** The signature is verified server-side; nothing counts as paid until this succeeds. */
  @POST("api/billing/platform/verify-payment")
  suspend fun verifyPlatformPayment(
    @Body body: VerifyPaymentRequest,
  ): Response<ApiEnvelope<VerifyPaymentResult>>

  @POST("api/billing/platform/{slug}/subscription/cancel")
  suspend fun cancelPlatformSubscription(
    @Path("slug") slug: String,
    @Body body: CancelSubscriptionRequest,
  ): Response<ApiEnvelope<CancelSubscriptionResult>>

  @POST("api/billing/platform/{slug}/refund-request")
  suspend fun requestPlatformRefund(
    @Path("slug") slug: String,
    @Body body: RefundReasonRequest,
  ): Response<ApiEnvelope<RefundRequest>>
}
