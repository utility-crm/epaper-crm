package com.epaperspace.publisher.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.epaperspace.publisher.ui.components.PrimaryButton
import org.koin.androidx.compose.koinViewModel

/**
 * Phone OTP sign-in. The send button needs a real Activity because Firebase attaches its reCAPTCHA
 * fallback to one, so the button stays disabled if we cannot find it.
 */
@Composable
fun PhoneAuthScreen(
  onSignedIn: () -> Unit,
  onBack: () -> Unit,
  viewModel: PhoneAuthViewModel = koinViewModel(),
) {
  val state by viewModel.state.collectAsStateWithLifecycle()
  val activity = LocalContext.current.findActivity()

  LaunchedEffect(state.signedIn) { if (state.signedIn) onSignedIn() }

  val title = if (state.step == OtpStep.ENTER_PHONE) "Sign in with phone" else "Enter your code"
  val subtitle = if (state.step == OtpStep.ENTER_PHONE) {
    "We will text you a six-digit code."
  } else {
    "Sent to ${state.phone}."
  }

  AuthScaffold(title = title, subtitle = subtitle) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
      ErrorBanner(state.error, viewModel::dismissError)

      if (!state.available) {
        // FirebaseAuthClient is inert without google-services.json; say so instead of failing
        // silently on a button that can never work.
        NoticeBanner("Phone sign-in is not available in this build.", {})
      }

      when (state.step) {
        OtpStep.ENTER_PHONE -> {
          AuthField(
            value = state.phone,
            onValueChange = viewModel::onPhoneChange,
            label = "Phone number",
            error = state.phoneError,
            keyboardType = KeyboardType.Phone,
            enabled = !state.busy && state.available,
          )
          PrimaryButton(
            text = if (state.busy) "Sending…" else "Send code",
            onClick = { activity?.let(viewModel::sendCode) },
            enabled = !state.busy && state.available && activity != null,
            modifier = Modifier.fillMaxWidth(),
          )
        }

        OtpStep.ENTER_CODE -> {
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
            onClick = viewModel::confirmCode,
            enabled = !state.busy,
            modifier = Modifier.fillMaxWidth(),
          )
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
          ) {
            // Resending goes back through the SMS audit, which is the point — each send is billed.
            AuthLink("Use a different number", viewModel::backToPhone)
          }
        }
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
