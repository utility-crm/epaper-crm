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

@Composable
fun LoginScreen(
  onSignedIn: () -> Unit,
  onSignup: () -> Unit,
  onPhone: () -> Unit,
  onForgotPassword: () -> Unit,
  viewModel: LoginViewModel = koinViewModel(),
) {
  val state by viewModel.state.collectAsStateWithLifecycle()
  val activity = LocalContext.current.findActivity()

  LaunchedEffect(state.signedIn) { if (state.signedIn) onSignedIn() }

  AuthScaffold(title = "Sign in", subtitle = "Manage your publication and upload today's paper.") {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
      ErrorBanner(state.error, viewModel::dismissError)

      AuthField(
        value = state.email,
        onValueChange = viewModel::onEmailChange,
        label = "Email",
        error = state.emailError,
        keyboardType = KeyboardType.Email,
        enabled = !state.busy,
      )
      AuthField(
        value = state.password,
        onValueChange = viewModel::onPasswordChange,
        label = "Password",
        error = state.passwordError,
        keyboardType = KeyboardType.Password,
        isPassword = true,
        enabled = !state.busy,
      )

      Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
        AuthLink("Forgot password?", onForgotPassword)
      }

      PrimaryButton(
        text = if (state.busy) "Signing in…" else "Sign in",
        onClick = viewModel::submit,
        enabled = !state.busy && !state.googleBusy,
        modifier = Modifier.fillMaxWidth(),
      )

      if (state.googleAvailable) {
        OrDivider()
        GoogleButton(
          onClick = { activity?.let(viewModel::signInWithGoogle) },
          busy = state.googleBusy,
          enabled = !state.busy && activity != null,
        )
      }

      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
      ) {
        AuthLink("Sign in with a phone number", onPhone)
      }
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
      ) {
        AuthLink("New here? Create a publication", onSignup)
      }
    }
  }
}
