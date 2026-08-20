package com.epaperspace.publisher.data.network.api

import retrofit2.http.GET
import retrofit2.http.POST

interface PublisherApi {
    // We will add endpoints here for Auth, Papers, Profile etc.
    @GET("api/health")
    suspend fun checkHealth(): String
}
