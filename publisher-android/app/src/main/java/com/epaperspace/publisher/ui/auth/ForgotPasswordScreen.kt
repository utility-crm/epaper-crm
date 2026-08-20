package com.epaperspace.publisher.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.epaperspace.publisher.ui.components.PrimaryButton
import org.koin.androidx.compose.koinViewModel

/**
 * Asks for the address, then either parks on a "check your inbox" screen (the worker answers the
 * same for known and unknown addresses, and so must we) or shows a box to paste the code when the
 * user came from a reset link that already carried it.
 */
@Composable
fun ForgotPasswordScreen(
  onBack: () -> Unit,
  onHasCode: () -> Unit,
  viewModel: ForgotPasswordViewModel = koinViewModel(),
) {
  val state by viewModel.state.collectAsStateWithLifecycle()

  AuthScaffold(title = "Reset your password", subtitle = "We will email you a reset code.") {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
      ErrorBanner(state.error, viewModel::dismissError)

      if (state.sent) {
        NoticeBanner(
          "If an account exists for that address, a reset code is on its way.",
          viewModel::dismissError,
        )
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.Center,
          verticalAlignment = Alignment.CenterVertically,
        ) {
          AuthLink("I have a code", onHasCode)
        }
      } else {
        AuthField(
          value = state.email,
          onValueChange = viewModel::onEmailChange,
          label = "Email",
          error = state.emailError,
          keyboardType = KeyboardType.Email,
          enabled = !state.busy,
        )
        PrimaryButton(
          text = if (state.busy) "Sending…" else "Send reset code",
          onClick = viewModel::submit,
          enabled = !state.busy,
          modifier = Modifier.fillMaxWidth(),
        )
      }

      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
      ) {
        AuthLink("Back to sign in", onBack)
      }
    }
  }
}
