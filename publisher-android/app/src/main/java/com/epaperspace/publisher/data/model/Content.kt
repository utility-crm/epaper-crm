package com.epaperspace.publisher.data.model

import com.google.gson.annotations.SerializedName

/**
 * Content-worker shapes. The content API is snake_case, so those fields carry explicit
 * @SerializedName rather than relying on a global Gson naming policy (auth is camelCase — see
 * ApiEnvelope's note).
 */

/** A masthead. Editions own dated papers. `archived` rows are filtered out of the portal list. */
data class Edition(
  val id: String = "",
  val title: String = "",
  val status: String = STATUS_DRAFT,
  @SerializedName("tier_id") val tierId: String? = null,
  @SerializedName("epaper_count") val epaperCount: Int? = null,
  @SerializedName("created_at") val createdAt: String? = null,
) {
  companion object {
    const val STATUS_DRAFT = "draft"
    const val STATUS_PUBLISHED = "published"
    const val STATUS_ARCHIVED = "archived"
  }
}

/** A dated issue of an edition. */
data class Epaper(
  val id: String = "",
  @SerializedName("edition_id") val editionId: String? = null,
  val title: String? = null,
  @SerializedName("publish_date") val publishDate: String = "",
  @SerializedName("publish_type") val publishType: String = PUBLISH_INSTANT,
  @SerializedName("scheduled_at") val scheduledAt: String? = null,
  val status: String = Edition.STATUS_DRAFT,
  @SerializedName("is_free") val isFree: Boolean = false,
  @SerializedName("free_page_count") val freePageCount: Int = 0,
  @SerializedName("page_count") val pageCount: Int = 0,
  @SerializedName("is_default") val isDefault: Boolean = false,
  @SerializedName("cover_key") val coverKey: String? = null,
  @SerializedName("updated_at") val updatedAt: String? = null,
) {
  val isPublished: Boolean get() = status == Edition.STATUS_PUBLISHED
  val hasPages: Boolean get() = pageCount > 0

  companion object {
    const val PUBLISH_INSTANT = "instant"
    const val PUBLISH_SCHEDULED = "scheduled"

    /** Server-side hard cap per paper (MAX_PAGE_COUNT in workers/content/src/upload.ts). */
    const val MAX_PAGE_COUNT = 500
  }
}

/** Request bodies. Field names must match the worker exactly. */
data class CreateEditionRequest(
  val title: String,
  @SerializedName("tier_id") val tierId: String? = null,
)

data class UpdateEditionRequest(
  val title: String? = null,
  val status: String? = null,
  @SerializedName("tier_id") val tierId: String? = null,
)

data class CreateEpaperRequest(
  val title: String? = null,
  @SerializedName("publish_date") val publishDate: String,
  @SerializedName("publish_type") val publishType: String = Epaper.PUBLISH_INSTANT,
  @SerializedName("scheduled_at") val scheduledAt: String? = null,
  @SerializedName("is_free") val isFree: Boolean = false,
  @SerializedName("free_page_count") val freePageCount: Int = 0,
)

data class UpdateEpaperRequest(
  val title: String? = null,
  val status: String? = null,
  @SerializedName("is_free") val isFree: Boolean? = null,
  @SerializedName("free_page_count") val freePageCount: Int? = null,
)

/**
 * A clickmask rectangle, stored as percentages of page width/height so it survives any render
 * scale. Persisted as a JSON array in `epaper_pages.clickmasks`.
 */
data class Clickmask(
  val x: Double = 0.0,
  val y: Double = 0.0,
  val width: Double = 0.0,
  val height: Double = 0.0,
  val href: String? = null,
  val label: String? = null,
)

data class ClickmaskPage(
  @SerializedName("page_no") val pageNo: Int = 0,
  val clickmasks: List<Clickmask> = emptyList(),
)

data class SaveClickmasksRequest(val clickmasks: List<Clickmask>)

/** Upload protocol payloads (workers/content/src/upload.ts). */
data class UploadPageResult(
  @SerializedName("page_no") val pageNo: Int = 0,
  @SerializedName("r2_key") val r2Key: String? = null,
  @SerializedName("blurred_key") val blurredKey: String? = null,
  @SerializedName("cover_key") val coverKey: String? = null,
  val bytes: Long = 0,
)

data class UploadCommitRequest(@SerializedName("page_count") val pageCount: Int)

data class UploadCommitResult(
  val committed: Boolean = false,
  @SerializedName("page_count") val pageCount: Int = 0,
)

data class UploadBeginResult(val cleared: Boolean = false)

/** `tenant_stats` — exactly two counters exist server-side. */
data class TenantStats(
  @SerializedName("disk_usage_bytes") val diskUsageBytes: Long = 0,
  val pageviews: Long = 0,
  @SerializedName("edition_count") val editionCount: Int? = null,
  @SerializedName("paper_count") val paperCount: Int? = null,
)
