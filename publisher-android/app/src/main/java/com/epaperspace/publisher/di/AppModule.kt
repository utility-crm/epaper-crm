package com.epaperspace.publisher.di

import coil3.ImageLoader
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import com.epaperspace.publisher.BuildConfig
import com.epaperspace.publisher.data.SessionEventBus
import com.epaperspace.publisher.data.SessionManager
import com.epaperspace.publisher.data.local.TokenManager
import com.epaperspace.publisher.data.network.ApiCaller
import com.epaperspace.publisher.data.network.AuthInterceptor
import com.epaperspace.publisher.data.network.api.AuthApi
import com.epaperspace.publisher.data.network.api.BillingApi
import com.epaperspace.publisher.data.network.api.ContentApi
import com.epaperspace.publisher.data.network.api.DomainApi
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import org.koin.android.ext.koin.androidContext
import org.koin.dsl.module
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * Core graph: storage, session, HTTP, API interfaces. Feature modules add their own repositories
 * and view models on top of this — see [appModules].
 */
val coreModule = module {

  single { TokenManager(androidContext()) }
  single { SessionEventBus() }
  single { SessionManager(get()) }
  single { ApiCaller(get()) }

  single { AuthInterceptor(get()) }

  single {
    HttpLoggingInterceptor().apply {
      // Bodies carry bearer tokens, passwords and Razorpay secrets. Debug builds only.
      level = if (BuildConfig.LOG_HTTP_BODIES) {
        HttpLoggingInterceptor.Level.BODY
      } else {
        HttpLoggingInterceptor.Level.NONE
      }
    }
  }

  single {
    OkHttpClient.Builder()
      .addInterceptor(get<AuthInterceptor>())
      .addInterceptor(get<HttpLoggingInterceptor>())
      // Page uploads are multi-megabyte webp bodies over mobile networks; the 10s default
      // times out a perfectly healthy upload.
      .connectTimeout(30, TimeUnit.SECONDS)
      .readTimeout(60, TimeUnit.SECONDS)
      .writeTimeout(120, TimeUnit.SECONDS)
      .build()
  }

  single {
    Retrofit.Builder()
      .baseUrl(BuildConfig.API_BASE_URL)
      .client(get())
      .addConverterFactory(GsonConverterFactory.create())
      .build()
  }

  single { get<Retrofit>().create(AuthApi::class.java) }
  single { get<Retrofit>().create(ContentApi::class.java) }
  single { get<Retrofit>().create(BillingApi::class.java) }
  single { get<Retrofit>().create(DomainApi::class.java) }

  // Page thumbnails sit behind the same bearer auth as the API, so Coil has to share the authed
  // client — the default loader would 401 on every image.
  single {
    ImageLoader.Builder(androidContext())
      .components { add(OkHttpNetworkFetcherFactory(callFactory = { get<OkHttpClient>() })) }
      .build()
  }
}

/** Everything Koin loads at startup. Feature modules are declared in their own files. */
val appModules = listOf(
  coreModule,
  authModule,
  contentModule,
  uploadModule,
  billingModule,
  settingsModule,
)
