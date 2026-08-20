package com.epaperspace.publisher.data.repository

import com.epaperspace.publisher.data.SessionManager
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
import com.epaperspace.publisher.data.network.ApiCaller
import com.epaperspace.publisher.data.network.ApiResult
import com.epaperspace.publisher.data.network.api.ContentApi
import okhttp3.MultipartBody
import okhttp3.RequestBody

/**
 * Content-worker calls. Every route is slug-scoped; the session's own slug is the only one the
 * worker accepts, so there is no per-call slug parameter on the public surface.
 */
class ContentRepository(
  private val api: ContentApi,
  private val caller: ApiCaller,
  private val sessions: SessionManager,
) {

  private val slug: String? get() = sessions.current?.slug

  suspend fun editions(page: Int? = null): ApiResult<ItemsResponse<Edition>> =
    caller.call { api.editions(requireSlug(), page) }

  suspend fun createEdition(title: String, tierId: String?): ApiResult<Edition> =
    caller.call { api.createEdition(requireSlug(), CreateEditionRequest(title, tierId)) }

  suspend fun updateEdition(id: String, request: UpdateEditionRequest): ApiResult<Edition> =
    caller.call { api.updateEdition(requireSlug(), id, request) }

  suspend fun deleteEdition(id: String): ApiResult<Unit> =
    caller.call { api.deleteEdition(requireSlug(), id) }

  suspend fun epapers(editionId: String): ApiResult<ItemsResponse<Epaper>> =
    caller.call { api.epapers(requireSlug(), editionId) }

  suspend fun createEpaper(
    editionId: String,
    request: CreateEpaperRequest,
  ): ApiResult<Epaper> = caller.call { api.createEpaper(requireSlug(), editionId, request) }

  suspend fun updateEpaper(id: String, request: UpdateEpaperRequest): ApiResult<Epaper> =
    caller.call { api.updateEpaper(requireSlug(), id, request) }

  suspend fun deleteEpaper(id: String): ApiResult<Unit> =
    caller.call { api.deleteEpaper(requireSlug(), id) }

  suspend fun setDefaultPaper(id: String): ApiResult<Epaper> =
    caller.call { api.setDefaultPaper(requireSlug(), id) }

  suspend fun clickmasks(epaperId: String): ApiResult<ItemsResponse<ClickmaskPage>> =
    caller.call { api.clickmasks(requireSlug(), epaperId) }

  suspend fun saveClickmasks(
    epaperId: String,
    pageNo: Int,
    request: SaveClickmasksRequest,
  ): ApiResult<Unit> = caller.call { api.saveClickmasks(requireSlug(), epaperId, pageNo, request) }

  suspend fun tiers(): ApiResult<ItemsResponse<Tier>> =
    caller.call { api.tiers(requireSlug()) }

  suspend fun createTier(request: TierRequest): ApiResult<Tier> =
    caller.call { api.createTier(requireSlug(), request) }

  suspend fun updateTier(id: String, request: TierRequest): ApiResult<Tier> =
    caller.call { api.updateTier(requireSlug(), id, request) }

  suspend fun deleteTier(id: String): ApiResult<Unit> =
    caller.call { api.deleteTier(requireSlug(), id) }

  suspend fun plans(): ApiResult<ItemsResponse<Plan>> =
    caller.call { api.plans(requireSlug()) }

  suspend fun createPlan(request: PlanRequest): ApiResult<Plan> =
    caller.call { api.createPlan(requireSlug(), request) }

  suspend fun updatePlan(id: String, request: PlanRequest): ApiResult<Plan> =
    caller.call { api.updatePlan(requireSlug(), id, request) }

  suspend fun deletePlan(id: String): ApiResult<Unit> =
    caller.call { api.deletePlan(requireSlug(), id) }

  suspend fun stats(): ApiResult<TenantStats> = caller.call { api.stats(requireSlug()) }

  suspend fun recalculateStats(): ApiResult<TenantStats> =
    caller.call { api.recalculateStats(requireSlug()) }

  suspend fun settings(): ApiResult<OrgSettings> = caller.call { api.settings(requireSlug()) }

  suspend fun updateSettings(request: UpdateSettingsRequest): ApiResult<OrgSettings> =
    caller.call { api.updateSettings(requireSlug(), request) }

  /** Raw image bytes; Content-Type is the image's own MIME type, not multipart. */
  suspend fun uploadLogo(body: RequestBody): ApiResult<Unit> =
    caller.call { api.uploadLogo(requireSlug(), body) }

  suspend fun uploadFavicon(body: RequestBody): ApiResult<Unit> =
    caller.call { api.uploadFavicon(requireSlug(), body) }

  /** Cancels every subscription and tears the tenant down. Irreversible. */
  suspend fun deleteOrganization(): ApiResult<Unit> =
    caller.call { api.deleteOrganization(requireSlug()) }

  /** Upload protocol pieces; the uploader drives these in order (begin, page×N, commit). */
  suspend fun uploadBegin(epaperId: String): ApiResult<UploadBeginResult> =
    caller.call { api.uploadBegin(requireSlug(), epaperId) }

  suspend fun uploadPage(
    epaperId: String,
    pageNo: RequestBody,
    page: MultipartBody.Part,
    blurred: MultipartBody.Part?,
    cover: MultipartBody.Part?,
  ): ApiResult<UploadPageResult> =
    caller.call { api.uploadPage(requireSlug(), epaperId, pageNo, page, blurred, cover) }

  suspend fun uploadCommit(epaperId: String, pageCount: Int): ApiResult<UploadCommitResult> =
    caller.call { api.uploadCommit(requireSlug(), epaperId, UploadCommitRequest(pageCount)) }

  private fun requireSlug(): String = sessions.current?.slug
    ?: throw IllegalStateException("No active session while calling a slug-scoped route.")
}
