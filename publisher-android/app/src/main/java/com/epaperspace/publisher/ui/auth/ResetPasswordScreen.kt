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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.epaperspace.publisher.ui.components.PrimaryButton
import org.koin.androidx.compose.koinViewModel

/**
 * New password + the single-use code from the email. The worker signs the user straight in when
 * the code checks out, so the whole reset ends with a login, not a detour back to the sign-in form.
 */
@Composable
fun ResetPasswordScreen(
  code: String?,
  onDone: () -> Unit,
  onBack: () -> Unit,
  viewModel: ResetPasswordViewModel = koinViewModel(),
) {
  val state by viewModel.state.collectAsStateWithLifecycle()

  LaunchedEffect(state.signedIn) { if (state.signedIn) onDone() }

  // A reset link may have carried the code; keep it only when the user has not typed one yet.
  LaunchedEffect(code) { viewModel.prefillCode(code) }

  AuthScaffold(title = "Choose a new password", subtitle = "Use the code we emailed you.") {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
      ErrorBanner(state.error, viewModel::dismissError)

      AuthField(
        value = state.code,
        onValueChange = viewModel::onCodeChange,
        label = "Reset code",
        error = state.codeError,
        keyboardType = KeyboardType.Text,
        enabled = !state.busy,
      )
      AuthField(
        value = state.password,
        onValueChange = viewModel::onPasswordChange,
        label = "New password",
        error = state.passwordError ?: PasswordPolicy.DESCRIPTION,
        keyboardType = KeyboardType.Password,
        isPassword = true,
        enabled = !state.busy,
      )
      AuthField(
        value = state.confirmPassword,
        onValueChange = viewModel::onConfirmPasswordChange,
        label = "Confirm password",
        error = state.confirmError,
        keyboardType = KeyboardType.Password,
        isPassword = true,
        enabled = !state.busy,
      )

      PrimaryButton(
        text = if (state.busy) "Resetting…" else "Reset password",
        onClick = viewModel::submit,
        enabled = !state.busy,
        modifier = Modifier.fillMaxWidth(),
      )

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
