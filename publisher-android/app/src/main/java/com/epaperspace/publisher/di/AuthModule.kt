package com.epaperspace.publisher.di

import android.content.Context
import com.epaperspace.publisher.data.auth.FirebaseAuthClient
import com.epaperspace.publisher.data.repository.AuthRepository
import com.epaperspace.publisher.ui.auth.ForgotPasswordViewModel
import com.epaperspace.publisher.ui.auth.LoginViewModel
import com.epaperspace.publisher.ui.auth.PhoneAuthViewModel
import com.epaperspace.publisher.ui.auth.ProvisioningViewModel
import com.epaperspace.publisher.ui.auth.ResetPasswordViewModel
import com.epaperspace.publisher.ui.auth.SignupViewModel
import com.epaperspace.publisher.ui.auth.VerifyEmailViewModel
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import org.koin.android.ext.koin.androidContext
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

val authModule = module {
  single { AuthRepository(get(), get(), get()) }

  single {
    val context = androidContext()
    val configured = context.isFirebaseConfigured()
    FirebaseAuthClient(
      context = context,
      // Firebase throws if initialised without google-services.json, so stay null until it exists.
      auth = if (configured) FirebaseAuth.getInstance() else null,
      serverClientId = if (configured) context.webClientId() else "",
    )
  }

  viewModel { LoginViewModel(get(), get()) }
  viewModel { SignupViewModel(get(), get()) }
  viewModel { PhoneAuthViewModel(get(), get()) }
  viewModel { ForgotPasswordViewModel(get()) }
  viewModel { ResetPasswordViewModel(get()) }
  viewModel { VerifyEmailViewModel(get()) }
  viewModel { ProvisioningViewModel(get()) }
}

/** True once google-services.json has been dropped in and the plugin has generated its resources. */
fun Context.isFirebaseConfigured(): Boolean = FirebaseApp.getApps(this).isNotEmpty()

/**
 * The Google Services plugin generates `default_web_client_id` from google-services.json. Looking
 * it up by name rather than R.string keeps the project compiling before Firebase is provisioned;
 * a blank result switches [FirebaseAuthClient] into its "not configured" mode.
 */
private fun Context.webClientId(): String {
  val id = resources.getIdentifier("default_web_client_id", "string", packageName)
  return if (id == 0) "" else getString(id)
}
