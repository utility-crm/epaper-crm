package com.epaperspace.publisher.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.epaperspace.publisher.ui.components.SecondaryButton

/**
 * Terminal state for a suspended tenant. Nothing here can lift the suspension — that is a platform
 * decision — so the only action offered is signing out.
 */
@Composable
fun SuspendedScreen(onSignOut: () -> Unit) {
  AuthScaffold(
    title = "Publication suspended",
    subtitle = "Your account is on hold, so publishing is paused. Contact support to restore it.",
  ) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
      SecondaryButton(
        text = "Sign out",
        onClick = onSignOut,
        modifier = Modifier.fillMaxWidth(),
      )
    }
  }
}
