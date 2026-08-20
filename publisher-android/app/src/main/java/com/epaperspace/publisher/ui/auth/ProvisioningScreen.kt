package com.epaperspace.publisher.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.epaperspace.publisher.theme.MutedForegroundLight
import com.epaperspace.publisher.ui.components.PrimaryButton
import com.epaperspace.publisher.ui.components.SecondaryButton
import org.koin.androidx.compose.koinViewModel

/**
 * Shown while a new tenant is being created. Provisioning is a queue job on the worker, so this
 * polls; the ViewModel stops polling when only the user can move things forward.
 */
@Composable
fun ProvisioningScreen(viewModel: ProvisioningViewModel = koinViewModel()) {
  val state by viewModel.state.collectAsStateWithLifecycle()

  val title = when {
    state.awaitingVerification -> "Confirm your email"
    state.failed -> "Setup did not finish"
    else -> "Setting up your publication"
  }
  val subtitle = when {
    state.awaitingVerification ->
      "We sent a link to ${state.email ?: "your email"}. Open it, then tap below."

    state.failed -> "Something went wrong on our side. You can try again."
    else -> "This usually takes under a minute."
  }

  AuthScaffold(title = title, subtitle = subtitle) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
      ErrorBanner(state.error, {})

      when {
        state.awaitingVerification -> PrimaryButton(
          text = if (state.busy) "Checking…" else "I have confirmed my email",
          onClick = viewModel::recheck,
          enabled = !state.busy,
          modifier = Modifier.fillMaxWidth(),
        )

        state.failed -> PrimaryButton(
          text = if (state.busy) "Retrying…" else "Try again",
          onClick = viewModel::retry,
          enabled = !state.busy,
          modifier = Modifier.fillMaxWidth(),
        )

        else -> {
          Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(modifier = Modifier.size(32.dp), strokeWidth = 3.dp)
          }
          Text(
            text = "Status: ${state.status}",
            color = MutedForegroundLight,
            fontSize = 12.sp,
            modifier = Modifier.fillMaxWidth(),
          )
          // Polling gives up after ~2.5 minutes rather than hammering the worker forever; this is
          // the manual nudge for that case.
          SecondaryButton(
            text = "Check again",
            onClick = viewModel::recheck,
            enabled = !state.busy,
            modifier = Modifier.fillMaxWidth(),
          )
        }
      }
    }
  }
}
