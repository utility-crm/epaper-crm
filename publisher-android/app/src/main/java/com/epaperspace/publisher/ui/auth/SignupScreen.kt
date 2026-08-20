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
fun SignupScreen(
  onSignedIn: () -> Unit,
  onLogin: () -> Unit,
  onPhone: () -> Unit,
  viewModel: SignupViewModel = koinViewModel(),
) {
  val state by viewModel.state.collectAsStateWithLifecycle()
  val activity = LocalContext.current.findActivity()

  // The root gate reads the session and swaps graphs on its own; this only tells the caller.
  LaunchedEffect(state.created) { if (state.created) onSignedIn() }

  AuthScaffold(
    title = "Create your publication",
    subtitle = "You will confirm your email before publishing.",
  ) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
      ErrorBanner(state.error, viewModel::dismissError)

      AuthField(
        value = state.orgName,
        onValueChange = viewModel::onOrgNameChange,
        label = "Publication name",
        error = state.orgNameError,
        enabled = !state.busy,
      )
      AuthField(
        value = state.name,
        onValueChange = viewModel::onNameChange,
        label = "Your name",
        error = state.nameError,
        enabled = !state.busy,
      )
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
        error = state.passwordError ?: PasswordPolicy.DESCRIPTION,
        keyboardType = KeyboardType.Password,
        isPassword = true,
        enabled = !state.busy,
      )

      PrimaryButton(
        text = if (state.busy) "Creating…" else "Create publication",
        onClick = viewModel::submit,
        enabled = !state.busy && !state.googleBusy,
        modifier = Modifier.fillMaxWidth(),
      )

      if (state.googleAvailable) {
        OrDivider()
        GoogleButton(
          onClick = { activity?.let(viewModel::signUpWithGoogle) },
          busy = state.googleBusy,
          enabled = !state.busy && activity != null,
        )
      }

      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
      ) {
        AuthLink("Sign up with a phone number", onPhone)
      }
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
      ) {
        AuthLink("Already have an account? Sign in", onLogin)
      }
    }
  }
}
