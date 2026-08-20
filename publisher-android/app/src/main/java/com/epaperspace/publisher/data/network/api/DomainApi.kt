package com.epaperspace.publisher.data.network.api

import com.epaperspace.publisher.data.model.DomainInfo
import com.epaperspace.publisher.data.model.DomainRequest
import com.epaperspace.publisher.data.network.ApiEnvelope
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST

/** Custom reader domain. Slug comes from the token, so these routes are not slug-scoped. */
interface DomainApi {

  @GET("api/domain")
  suspend fun domain(): Response<ApiEnvelope<DomainInfo>>

  @POST("api/domain")
  suspend fun setDomain(@Body body: DomainRequest): Response<ApiEnvelope<DomainInfo>>

  /** Re-checks CNAME and SSL issuance. */
  @POST("api/domain/verify")
  suspend fun verifyDomain(): Response<ApiEnvelope<DomainInfo>>

  @DELETE("api/domain")
  suspend fun removeDomain(): Response<ApiEnvelope<Unit>>
}
