package com.epaperspace.publisher.data.repository

import com.epaperspace.publisher.data.model.DomainInfo
import com.epaperspace.publisher.data.model.DomainRequest
import com.epaperspace.publisher.data.network.ApiCaller
import com.epaperspace.publisher.data.network.ApiResult
import com.epaperspace.publisher.data.network.api.DomainApi

/** Custom reader domain. Not slug-scoped — the worker reads the slug from the token. */
class DomainRepository(
  private val api: DomainApi,
  private val caller: ApiCaller,
) {

  suspend fun domain(): ApiResult<DomainInfo> = caller.call { api.domain() }

  suspend fun setDomain(hostname: String): ApiResult<DomainInfo> =
    caller.call { api.setDomain(DomainRequest(hostname.trim().lowercase())) }

  /** Re-checks the CNAME and SSL issuance. Certificates can take a few minutes to appear. */
  suspend fun verifyDomain(): ApiResult<DomainInfo> = caller.call { api.verifyDomain() }

  suspend fun removeDomain(): ApiResult<Unit> = caller.call { api.removeDomain() }
}
