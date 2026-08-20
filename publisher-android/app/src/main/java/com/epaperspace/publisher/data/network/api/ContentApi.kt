package com.epaperspace.publisher.data.network.api

import com.epaperspace.publisher.data.model.Clickmask
import com.epaperspace.publisher.data.model.ClickmaskPage
import com.epaperspace.publisher.data.model.CreateEditionRequest
import com.epaperspace.publisher.data.model.CreateEpaperRequest
import com.epaperspace.publisher.data.model.Edition
import com.epaperspace.publisher.data.model.Epaper
import com.epaperspace.publisher.data.model.ItemsResponse
import com.epaperspace.publisher.data.model.OrgSettings
import com.epaperspace.publisher.data.model.Plan
import com.epaperspace.publisher.data.model.PlanRequest
import com.epaperspace.publisher.data.model.SaveClickmasksRequest
import com.epaperspace.publisher.data.model.TenantStats
import com.epaperspace.publisher.data.model.Tier
import com.epaperspace.publisher.data.model.TierRequest
import com.epaperspace.publisher.data.model.UpdateEditionRequest
import com.epaperspace.publisher.data.model.UpdateEpaperRequest
import com.epaperspace.publisher.data.model.UpdateSettingsRequest
import com.epaperspace.publisher.data.model.UploadBeginResult
import com.epaperspace.publisher.data.model.UploadCommitRequest
import com.epaperspace.publisher.data.model.UploadCommitResult
import com.epaperspace.publisher.data.model.UploadPageResult
import com.epaperspace.publisher.data.network.ApiEnvelope
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * `epaper-content` worker. Every route is slug-scoped and the worker rejects a slug that does not
 * match the token's `tenantSlug` claim, so always pass the session's own slug.
 */
interface ContentApi {

  @GET("api/content/{slug}/editions")
  suspend fun editions(
    @Path("slug") slug: String,
    @Query("page") page: Int? = null,
  ): Response<ApiEnvelope<ItemsResponse<Edition>>>

  /** Blocked by the write gate while the publisher's email is unverified. */
  @POST("api/content/{slug}/editions")
  suspend fun createEdition(
    @Path("slug") slug: String,
    @Body body: CreateEditionRequest,
  ): Response<ApiEnvelope<Edition>>

  @PATCH("api/content/{slug}/editions/{id}")
  suspend fun updateEdition(
    @Path("slug") slug: String,
    @Path("id") id: String,
    @Body body: UpdateEditionRequest,
  ): Response<ApiEnvelope<Edition>>

  /** Cascades to every paper, page and R2 object under the edition. */
  @DELETE("api/content/{slug}/editions/{id}")
  suspend fun deleteEdition(
    @Path("slug") slug: String,
    @Path("id") id: String,
  ): Response<ApiEnvelope<Unit>>

  @GET("api/content/{slug}/editions/{editionId}/epapers")
  suspend fun epapers(
    @Path("slug") slug: String,
    @Path("editionId") editionId: String,
  ): Response<ApiEnvelope<ItemsResponse<Epaper>>>

  /** Blocked by the write gate while the publisher's email is unverified. */
  @POST("api/content/{slug}/editions/{editionId}/epapers")
  suspend fun createEpaper(
    @Path("slug") slug: String,
    @Path("editionId") editionId: String,
    @Body body: CreateEpaperRequest,
  ): Response<ApiEnvelope<Epaper>>

  @PATCH("api/content/{slug}/epapers/{id}")
  suspend fun updateEpaper(
    @Path("slug") slug: String,
    @Path("id") id: String,
    @Body body: UpdateEpaperRequest,
  ): Response<ApiEnvelope<Epaper>>

  @DELETE("api/content/{slug}/epapers/{id}")
  suspend fun deleteEpaper(
    @Path("slug") slug: String,
    @Path("id") id: String,
  ): Response<ApiEnvelope<Unit>>

  /** Marks this paper as the one the reader lands on for its publish date. */
  @PATCH("api/content/{slug}/epapers/{id}/default")
  suspend fun setDefaultPaper(
    @Path("slug") slug: String,
    @Path("id") id: String,
  ): Response<ApiEnvelope<Epaper>>

  @GET("api/content/{slug}/epapers/{id}/clickmasks")
  suspend fun clickmasks(
    @Path("slug") slug: String,
    @Path("id") id: String,
  ): Response<ApiEnvelope<ItemsResponse<ClickmaskPage>>>

  @PUT("api/content/{slug}/epapers/{id}/pages/{pageNo}/clickmasks")
  suspend fun saveClickmasks(
    @Path("slug") slug: String,
    @Path("id") id: String,
    @Path("pageNo") pageNo: Int,
    @Body body: SaveClickmasksRequest,
  ): Response<ApiEnvelope<Unit>>

  // ---- Three-step upload protocol (workers/content/src/upload.ts) ----

  /**
   * Clears any previous pages, their blurred variants and the cover from R2, drops the page rows
   * and zeroes page_count. Deliberately preserves free_page_count so a replacement upload keeps
   * its paywall setting.
   */
  @POST("api/content/{slug}/epapers/{id}/upload/begin")
  suspend fun uploadBegin(
    @Path("slug") slug: String,
    @Path("id") id: String,
  ): Response<ApiEnvelope<UploadBeginResult>>

  /** One page per call; the uploader runs these at most 4 in flight. */
  @Multipart
  @PUT("api/content/{slug}/epapers/{id}/upload/page")
  suspend fun uploadPage(
    @Path("slug") slug: String,
    @Path("id") id: String,
    @Part("page_no") pageNo: RequestBody,
    @Part page: MultipartBody.Part,
    @Part blurred: MultipartBody.Part? = null,
    @Part cover: MultipartBody.Part? = null,
  ): Response<ApiEnvelope<UploadPageResult>>

  /**
   * Probes R2 for a contiguous run of 1..page_count and fails the whole upload if any page is
   * missing. Byte totals are re-derived server-side, never trusted from the client.
   */
  @POST("api/content/{slug}/epapers/{id}/upload/commit")
  suspend fun uploadCommit(
    @Path("slug") slug: String,
    @Path("id") id: String,
    @Body body: UploadCommitRequest,
  ): Response<ApiEnvelope<UploadCommitResult>>

  // ---- Reader tiers + plans (sold through the publisher's own Razorpay account) ----

  @GET("api/content/{slug}/tiers")
  suspend fun tiers(@Path("slug") slug: String): Response<ApiEnvelope<ItemsResponse<Tier>>>

  @POST("api/content/{slug}/tiers")
  suspend fun createTier(
    @Path("slug") slug: String,
    @Body body: TierRequest,
  ): Response<ApiEnvelope<Tier>>

  @PATCH("api/content/{slug}/tiers/{id}")
  suspend fun updateTier(
    @Path("slug") slug: String,
    @Path("id") id: String,
    @Body body: TierRequest,
  ): Response<ApiEnvelope<Tier>>

  @DELETE("api/content/{slug}/tiers/{id}")
  suspend fun deleteTier(
    @Path("slug") slug: String,
    @Path("id") id: String,
  ): Response<ApiEnvelope<Unit>>

  @GET("api/content/{slug}/plans")
  suspend fun plans(@Path("slug") slug: String): Response<ApiEnvelope<ItemsResponse<Plan>>>

  @POST("api/content/{slug}/plans")
  suspend fun createPlan(
    @Path("slug") slug: String,
    @Body body: PlanRequest,
  ): Response<ApiEnvelope<Plan>>

  @PATCH("api/content/{slug}/plans/{id}")
  suspend fun updatePlan(
    @Path("slug") slug: String,
    @Path("id") id: String,
    @Body body: PlanRequest,
  ): Response<ApiEnvelope<Plan>>

  @DELETE("api/content/{slug}/plans/{id}")
  suspend fun deletePlan(
    @Path("slug") slug: String,
    @Path("id") id: String,
  ): Response<ApiEnvelope<Unit>>

  // ---- Stats, settings, branding ----

  @GET("api/content/{slug}/stats")
  suspend fun stats(@Path("slug") slug: String): Response<ApiEnvelope<TenantStats>>

  /** Walks the whole R2 bucket to rebuild disk_usage_bytes. Slow; user-triggered only. */
  @POST("api/content/{slug}/stats/recalculate")
  suspend fun recalculateStats(@Path("slug") slug: String): Response<ApiEnvelope<TenantStats>>

  @GET("api/content/{slug}/settings")
  suspend fun settings(@Path("slug") slug: String): Response<ApiEnvelope<OrgSettings>>

  @PATCH("api/content/{slug}/settings")
  suspend fun updateSettings(
    @Path("slug") slug: String,
    @Body body: UpdateSettingsRequest,
  ): Response<ApiEnvelope<OrgSettings>>

  /** Raw image body, not multipart — Content-Type must be the image's own MIME type. */
  @PUT("api/content/{slug}/settings/logo")
  suspend fun uploadLogo(
    @Path("slug") slug: String,
    @Body body: RequestBody,
  ): Response<ApiEnvelope<Unit>>

  @PUT("api/content/{slug}/settings/favicon")
  suspend fun uploadFavicon(
    @Path("slug") slug: String,
    @Body body: RequestBody,
  ): Response<ApiEnvelope<Unit>>

  /** Cancels every reader subscription and the platform subscription, then tears down the tenant. */
  @DELETE("api/content/{slug}/settings")
  suspend fun deleteOrganization(@Path("slug") slug: String): Response<ApiEnvelope<Unit>>
}
