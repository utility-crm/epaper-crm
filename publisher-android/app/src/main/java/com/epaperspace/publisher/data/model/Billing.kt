package com.epaperspace.publisher.data.model

import com.google.gson.annotations.SerializedName

/**
 * Billing shapes. Two independent systems share this file:
 *   - tenant lane  (`/api/billing/tenant/...`) — the publisher's own Razorpay account, selling to
 *     readers: tiers, plans, reader subscriptions, manual grants, refunds.
 *   - platform lane (`/api/billing/platform/...`) — the publisher paying the SaaS.
 * They are not interchangeable; keep the naming explicit at every call site.
 */

/** Reader-facing access tier. Features are stored comma-joined inside `description`. */
data class Tier(
  val id: String = "",
  val name: String = "",
  val description: String? = null,
) {
  val features: List<String>
    get() = description?.split(',')?.map(String::trim)?.filter(String::isNotEmpty) ?: emptyList()
}

data class TierRequest(val name: String, val description: String? = null)

/** A purchasable plan against a tier. Prices are in paise; never use a float for money. */
data class Plan(
  val id: String = "",
  @SerializedName("tier_id") val tierId: String = "",
  val name: String? = null,
  val interval: String = INTERVAL_MONTHLY,
  @SerializedName("price_paise") val pricePaise: Long = 0,
  @SerializedName("offer_pct") val offerPct: Int? = null,
  @SerializedName("offer_label") val offerLabel: String? = null,
  @SerializedName("tax_percentage") val taxPercentage: Double? = null,
) {
  companion object {
    const val INTERVAL_MONTHLY = "monthly"
    const val INTERVAL_6MONTH = "6month"
    const val INTERVAL_12MONTH = "12month"
  }
}

data class PlanRequest(
  @SerializedName("tier_id") val tierId: String,
  val name: String? = null,
  val interval: String,
  @SerializedName("price_paise") val pricePaise: Long,
  @SerializedName("offer_pct") val offerPct: Int? = null,
  @SerializedName("offer_label") val offerLabel: String? = null,
  @SerializedName("tax_percentage") val taxPercentage: Double? = null,
)

/**
 * The publisher's Razorpay credentials for selling to readers. `key_secret` and the webhook
 * secret are write-only — the worker stores them AES-256-GCM encrypted and never reads them back,
 * so a blank value on read means "already set", not "unset". Use [configured] to decide.
 */
data class RazorpayConfig(
  @SerializedName("key_id") val keyId: String? = null,
  @SerializedName("display_name") val displayName: String? = null,
  @SerializedName("support_email") val supportEmail: String? = null,
  @SerializedName("process_refunds") val processRefunds: Boolean = false,
  @SerializedName("refund_window_days") val refundWindowDays: Int = 0,
  val configured: Boolean = false,
)

data class RazorpayConfigRequest(
  @SerializedName("key_id") val keyId: String? = null,
  @SerializedName("key_secret") val keySecret: String? = null,
  @SerializedName("display_name") val displayName: String? = null,
  @SerializedName("support_email") val supportEmail: String? = null,
  @SerializedName("process_refunds") val processRefunds: Boolean? = null,
  @SerializedName("refund_window_days") val refundWindowDays: Int? = null,
)

data class WebhookSecret(@SerializedName("webhook_secret") val webhookSecret: String = "")

/** A reader of this publication. */
data class Reader(
  val id: String = "",
  val email: String = "",
  val name: String? = null,
  @SerializedName("email_verified") val emailVerified: Boolean = false,
  @SerializedName("created_at") val createdAt: String? = null,
  val subscription: ReaderSubscription? = null,
)

data class ReaderPage(
  val items: List<Reader> = emptyList(),
  val page: Int = 1,
  val total: Int = 0,
  @SerializedName("total_pages") val totalPages: Int = 1,
)

data class ReaderSubscription(
  val id: String = "",
  val status: String = "",
  @SerializedName("tier_id") val tierId: String? = null,
  @SerializedName("plan_id") val planId: String? = null,
  /** "manual" for off-platform grants, "razorpay" for paid subscriptions. */
  val source: String? = null,
  @SerializedName("start_at") val startAt: String? = null,
  @SerializedName("end_at") val endAt: String? = null,
  val note: String? = null,
)

data class CreateReaderRequest(
  val email: String,
  val name: String,
  val password: String? = null,
)

data class ManualGrantRequest(
  @SerializedName("reader_id") val readerId: String,
  @SerializedName("start_at") val startAt: String? = null,
  @SerializedName("end_at") val endAt: String,
  @SerializedName("tier_id") val tierId: String? = null,
  val note: String? = null,
)

data class PatchManualGrantRequest(
  @SerializedName("end_at") val endAt: String? = null,
  val status: String? = null,
  val note: String? = null,
)

/** Reader-raised refund, processed by the publisher. */
data class RefundRequest(
  val id: String = "",
  @SerializedName("reader_id") val readerId: String? = null,
  @SerializedName("reader_email") val readerEmail: String? = null,
  val reason: String? = null,
  val status: String = "",
  @SerializedName("amount_paise") val amountPaise: Long? = null,
  @SerializedName("within_policy_window") val withinPolicyWindow: Boolean? = null,
  @SerializedName("created_at") val createdAt: String? = null,
)

data class ProcessRefundRequest(
  val action: String,
  @SerializedName("amount_paise") val amountPaise: Long? = null,
  val message: String? = null,
) {
  companion object {
    const val APPROVE = "approve"
    const val REJECT = "reject"
  }
}

/** Platform lane: what the publisher is paying the SaaS, and the caps that come with it. */
data class PlatformTier(
  val id: String = "",
  val name: String = "",
  @SerializedName("price_paise") val pricePaise: Long = 0,
  @SerializedName("max_storage_mb") val maxStorageMb: Long? = null,
  @SerializedName("max_views_per_day") val maxViewsPerDay: Long? = null,
  @SerializedName("max_papers_per_day") val maxPapersPerDay: Long? = null,
  @SerializedName("max_simultaneous_editions") val maxSimultaneousEditions: Long? = null,
  val features: List<String> = emptyList(),
)

data class PlatformLimits(
  @SerializedName("storage_mb") val storageMb: Long? = null,
  @SerializedName("views_per_day") val viewsPerDay: Long? = null,
  @SerializedName("papers_per_day") val papersPerDay: Long? = null,
)

data class PlatformBillingStatus(
  val plan: String? = null,
  val status: String? = null,
  val source: String? = null,
  @SerializedName("current_end") val currentEnd: String? = null,
  val limits: PlatformLimits? = null,
) {
  /**
   * Storage denominator for the dashboard gauge. Falls back to the same per-plan defaults the web
   * dashboard uses when the tier does not report a limit.
   */
  fun storageLimitMb(): Long = limits?.storageMb ?: when (plan?.lowercase()) {
    "enterprise" -> 2_000_000L
    "pro" -> 51_200L
    else -> 100L
  }
}

data class SubscribeRequest(val slug: String, @SerializedName("plan_id") val planId: String)

data class SubscribeResult(
  @SerializedName("subscription_id") val subscriptionId: String = "",
  @SerializedName("key_id") val keyId: String = "",
)

data class VerifyPaymentRequest(
  val slug: String,
  @SerializedName("razorpay_payment_id") val razorpayPaymentId: String,
  @SerializedName("razorpay_subscription_id") val razorpaySubscriptionId: String,
  @SerializedName("razorpay_signature") val razorpaySignature: String,
)

data class VerifyPaymentResult(val verified: Boolean = false, val plan: String? = null)

data class CancelSubscriptionRequest(@SerializedName("at_cycle_end") val atCycleEnd: Boolean = false)

data class CancelSubscriptionResult(
  val cancelled: Boolean = false,
  @SerializedName("at_cycle_end") val atCycleEnd: Boolean = false,
)

data class RefundReasonRequest(val reason: String)

data class ItemsResponse<T>(val items: List<T> = emptyList())
