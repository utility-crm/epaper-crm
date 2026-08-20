package com.epaperspace.publisher.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.epaperspace.publisher.ui.components.PrimaryButton
import org.koin.androidx.compose.koinViewModel

/**
 * Confirms the owner's email. The worker refuses every content write until this passes, so this
 * gate is not cosmetic — it is the only thing between a signed-up tenant and uploads.
 */
@Composable
fun VerifyEmailScreen(
  email: String?,
  viewModel: VerifyEmailViewModel = koinViewModel(),
) {
  val state by viewModel.state.collectAsStateWithLifecycle()

  // Once verification lands the session gate in Navigation.kt swaps the graph; no callback needed.
  LaunchedEffect(email) { viewModel.start(email) }

  AuthScaffold(
    title = "Verify your email",
    subtitle = "Confirm your address to unlock publishing.",
  ) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
      ErrorBanner(state.error, viewModel::dismissError)
      NoticeBanner(state.notice, viewModel::dismissNotice)

      AuthField(
        value = state.code,
        onValueChange = viewModel::onCodeChange,
        label = "Six-digit code",
        error = state.codeError,
        keyboardType = KeyboardType.NumberPassword,
        enabled = !state.busy,
      )
      PrimaryButton(
        text = if (state.busy) "Verifying…" else "Verify",
        onClick = viewModel::confirm,
        enabled = !state.busy,
        modifier = Modifier.fillMaxWidth(),
      )

      AuthLink(
        text = if (state.resending) "Sending…" else "Resend email",
        onClick = viewModel::resend,
      )
    }
  }
}
