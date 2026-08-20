package com.epaperspace.publisher

import androidx.navigation3.runtime.NavKey
import kotlinx.serialization.Serializable

/**
 * Every destination in the app. Declared centrally so feature screens stay unaware of each other
 * and Navigation.kt is the only place that knows how they connect.
 */

// --- Auth graph (shown while there is no usable session) ---
@Serializable data object Login : NavKey

@Serializable data object Signup : NavKey

@Serializable data object PhoneAuth : NavKey

@Serializable data object ForgotPassword : NavKey

@Serializable data class ResetPassword(val code: String? = null) : NavKey

@Serializable data class VerifyEmail(val email: String? = null) : NavKey

@Serializable data object Provisioning : NavKey

@Serializable data object Suspended : NavKey

// --- Main graph ---
@Serializable data object Dashboard : NavKey

@Serializable data object Editions : NavKey

@Serializable data class Papers(val editionId: String, val editionTitle: String) : NavKey

@Serializable data class Upload(val epaperId: String, val epaperTitle: String) : NavKey

@Serializable data class ClickmaskEditor(val epaperId: String, val pageCount: Int) : NavKey

// --- Readers + money ---
@Serializable data object Readers : NavKey

@Serializable data object Refunds : NavKey

@Serializable data object ReaderPlans : NavKey

@Serializable data object PaymentSetup : NavKey

@Serializable data object PlatformBilling : NavKey

// --- Settings ---
@Serializable data object Settings : NavKey

@Serializable data object CustomDomain : NavKey
