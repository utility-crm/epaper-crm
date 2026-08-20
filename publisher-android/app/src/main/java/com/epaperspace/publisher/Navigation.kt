package com.epaperspace.publisher

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import com.epaperspace.publisher.data.Session
import com.epaperspace.publisher.data.SessionEvent
import com.epaperspace.publisher.data.SessionEventBus
import com.epaperspace.publisher.data.SessionManager
import com.epaperspace.publisher.data.TenantStatus
import com.epaperspace.publisher.ui.auth.ForgotPasswordScreen
import com.epaperspace.publisher.ui.auth.LoginScreen
import com.epaperspace.publisher.ui.auth.PhoneAuthScreen
import com.epaperspace.publisher.ui.auth.ProvisioningScreen
import com.epaperspace.publisher.ui.auth.ResetPasswordScreen
import com.epaperspace.publisher.ui.auth.SignupScreen
import com.epaperspace.publisher.ui.auth.SuspendedScreen
import com.epaperspace.publisher.ui.auth.VerifyEmailScreen
import com.epaperspace.publisher.ui.clickmask.ClickmaskEditorScreen
import com.epaperspace.publisher.ui.dashboard.DashboardScreen
import com.epaperspace.publisher.ui.domain.CustomDomainScreen
import com.epaperspace.publisher.ui.editions.EditionsScreen
import com.epaperspace.publisher.ui.papers.PapersScreen
import com.epaperspace.publisher.ui.payments.PaymentSetupScreen
import com.epaperspace.publisher.ui.platform.PlatformBillingScreen
import com.epaperspace.publisher.ui.plans.ReaderPlansScreen
import com.epaperspace.publisher.ui.readers.ReadersScreen
import com.epaperspace.publisher.ui.refunds.RefundsScreen
import com.epaperspace.publisher.ui.settings.SettingsScreen
import com.epaperspace.publisher.ui.upload.UploadScreen
import org.koin.compose.koinInject

/**
 * Which graph the app is allowed to show. Derived from the session rather than navigated to, so a
 * token expiring mid-session cannot leave a main-graph screen on top of a signed-out app.
 */
internal enum class Gate { AUTH, VERIFY, PROVISIONING, SUSPENDED, MAIN }

internal fun Session?.gate(): Gate = when {
  this == null -> Gate.AUTH
  status == TenantStatus.AWAITING_VERIFICATION -> Gate.VERIFY
  status == TenantStatus.PENDING ||
    status == TenantStatus.PROVISIONING ||
    status == TenantStatus.PROVISION_FAILED -> Gate.PROVISIONING
  status == TenantStatus.SUSPENDED -> Gate.SUSPENDED
  // DELETING/DELETED tenants have nothing left to administer; treat them as signed out.
  status == TenantStatus.DELETING || status == TenantStatus.DELETED -> Gate.AUTH
  else -> Gate.MAIN
}

@Composable
fun PublisherApp(
  sessions: SessionManager = koinInject(),
  events: SessionEventBus = koinInject(),
) {
  val session by sessions.session.collectAsStateWithLifecycle()

  // The worker is the authority on 401 and on suspension; ApiCaller emits here so one collector
  // reacts for the whole app instead of every screen guessing.
  LaunchedEffect(events) {
    events.events.collect { event ->
      when (event) {
        SessionEvent.Unauthorized, SessionEvent.TenantDeleted -> sessions.signOut()
        SessionEvent.TenantSuspended -> sessions.updateStatus(TenantStatus.SUSPENDED)
      }
    }
  }

  when (session.gate()) {
    Gate.AUTH -> AuthNavigation()
    Gate.VERIFY -> VerifyEmailScreen(email = session?.email)
    Gate.PROVISIONING -> ProvisioningScreen()
    Gate.SUSPENDED -> SuspendedScreen(onSignOut = sessions::signOut)
    Gate.MAIN -> MainNavigation()
  }
}

/** Pre-session graph. Kept separate so a signed-out app cannot hold main-graph screens alive. */
@Composable
private fun AuthNavigation() {
  val backStack = rememberNavBackStack(Login)

  NavDisplay(
    backStack = backStack,
    onBack = { backStack.removeLastOrNull() },
    entryProvider = entryProvider {
      entry<Login> {
        LoginScreen(
          onSignedIn = { /* the session gate swaps the graph; nothing to navigate */ },
          onSignup = { backStack.add(Signup) },
          onPhone = { backStack.add(PhoneAuth) },
          onForgotPassword = { backStack.add(ForgotPassword) },
        )
      }
      entry<Signup> {
        SignupScreen(
          onSignedIn = {},
          onLogin = { backStack.removeLastOrNull() },
          onPhone = { backStack.add(PhoneAuth) },
        )
      }
      entry<PhoneAuth> {
        PhoneAuthScreen(onSignedIn = {}, onBack = { backStack.removeLastOrNull() })
      }
      entry<ForgotPassword> {
        ForgotPasswordScreen(
          onBack = { backStack.removeLastOrNull() },
          onHasCode = { backStack.add(ResetPassword()) },
        )
      }
      entry<ResetPassword> { key ->
        ResetPasswordScreen(code = key.code, onDone = {}, onBack = { backStack.removeLastOrNull() })
      }
    },
  )
}

/** Signed-in graph. Only reachable once the tenant is active — see [Gate]. */
@Composable
private fun MainNavigation() {
  val backStack = rememberNavBackStack(Dashboard)
  val back: () -> Unit = { backStack.removeLastOrNull() }

  NavDisplay(
    backStack = backStack,
    onBack = back,
    entryProvider = entryProvider {
      entry<Dashboard> {
        DashboardScreen(
          onEditions = { backStack.add(Editions) },
          onReaders = { backStack.add(Readers) },
          onRefunds = { backStack.add(Refunds) },
          onPlans = { backStack.add(ReaderPlans) },
          onPaymentSetup = { backStack.add(PaymentSetup) },
          onPlatformBilling = { backStack.add(PlatformBilling) },
          onSettings = { backStack.add(Settings) },
        )
      }
      entry<Editions> {
        EditionsScreen(
          onBack = back,
          onOpenEdition = { id, title -> backStack.add(Papers(id, title)) },
        )
      }
      entry<Papers> { key ->
        PapersScreen(
          editionId = key.editionId,
          editionTitle = key.editionTitle,
          onBack = back,
          onUpload = { id, title -> backStack.add(Upload(id, title)) },
          onClickmask = { id, pages -> backStack.add(ClickmaskEditor(id, pages)) },
        )
      }
      entry<Upload> { key ->
        UploadScreen(epaperId = key.epaperId, epaperTitle = key.epaperTitle, onBack = back)
      }
      entry<ClickmaskEditor> { key ->
        ClickmaskEditorScreen(epaperId = key.epaperId, pageCount = key.pageCount, onBack = back)
      }
      entry<Readers> { ReadersScreen(onBack = back) }
      entry<Refunds> { RefundsScreen(onBack = back) }
      entry<ReaderPlans> { ReaderPlansScreen(onBack = back) }
      entry<PaymentSetup> { PaymentSetupScreen(onBack = back) }
      entry<PlatformBilling> { PlatformBillingScreen(onBack = back) }
      entry<Settings> {
        SettingsScreen(onBack = back, onCustomDomain = { backStack.add(CustomDomain) })
      }
      entry<CustomDomain> { CustomDomainScreen(onBack = back) }
    },
  )
}
