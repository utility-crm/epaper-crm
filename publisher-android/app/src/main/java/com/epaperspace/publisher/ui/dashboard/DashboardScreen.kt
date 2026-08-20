package com.epaperspace.publisher.ui.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.epaperspace.publisher.theme.DestructiveRed
import com.epaperspace.publisher.theme.MutedForegroundLight
import com.epaperspace.publisher.ui.components.AppScaffold
import com.epaperspace.publisher.ui.components.PublisherCard
import com.epaperspace.publisher.ui.components.SecondaryButton
import com.epaperspace.publisher.ui.components.SectionLabel
import com.epaperspace.publisher.ui.components.WarningBanner
import java.util.Locale
import org.koin.androidx.compose.koinViewModel

@Composable
fun DashboardScreen(
  onEditions: () -> Unit,
  onReaders: () -> Unit,
  onRefunds: () -> Unit,
  onPlans: () -> Unit,
  onPaymentSetup: () -> Unit,
  onPlatformBilling: () -> Unit,
  onSettings: () -> Unit,
  viewModel: DashboardViewModel = koinViewModel(),
) {
  val state by viewModel.state.collectAsStateWithLifecycle()

  AppScaffold(
    title = "Dashboard",
    error = state.error,
    onDismissError = viewModel::dismissError,
    loading = state.loading,
  ) {
    if (state.writesBlocked) {
      WarningBanner(
        "Publishing is blocked until you verify your email address. Open the link we sent you, " +
          "then reload this screen.",
      )
    }

    SectionLabel("Usage")
    PublisherCard {
      StatRow("Storage used", formatBytes(state.stats?.diskUsageBytes))
      StatRow("Pageviews", state.stats?.pageviews?.toString() ?: PLACEHOLDER)
      StatRow("Editions", state.stats?.editionCount?.toString() ?: PLACEHOLDER)
      StatRow("Papers", state.stats?.paperCount?.toString() ?: PLACEHOLDER)
    }

    SecondaryButton(
      text = "Recalculate stats",
      onClick = viewModel::recalculate,
      enabled = !state.loading,
      modifier = Modifier.fillMaxWidth(),
    )

    SectionLabel("Manage")
    SecondaryButton("Editions", onEditions, Modifier.fillMaxWidth())
    SecondaryButton("Readers", onReaders, Modifier.fillMaxWidth())
    SecondaryButton("Reader plans", onPlans, Modifier.fillMaxWidth())
    SecondaryButton("Refunds", onRefunds, Modifier.fillMaxWidth())

    SectionLabel("Billing")
    SecondaryButton("Payment setup", onPaymentSetup, Modifier.fillMaxWidth())
    SecondaryButton("Platform billing", onPlatformBilling, Modifier.fillMaxWidth())

    SectionLabel("Account")
    SecondaryButton("Settings", onSettings, Modifier.fillMaxWidth())
    TextButton(
      onClick = viewModel::signOut,
      modifier = Modifier.align(Alignment.CenterHorizontally),
    ) {
      Text("Sign out", color = DestructiveRed, fontWeight = FontWeight.Medium)
    }
  }
}

@Composable
private fun StatRow(label: String, value: String) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .padding(vertical = 6.dp),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Text(label, color = MutedForegroundLight, fontSize = 13.sp)
    Text(value, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
  }
}

private const val PLACEHOLDER = "—"

private fun formatBytes(bytes: Long?): String {
  if (bytes == null) return PLACEHOLDER
  val units = listOf("B", "KB", "MB", "GB", "TB")
  var value = bytes.toDouble()
  var unit = 0
  while (value >= 1024 && unit < units.lastIndex) {
    value /= 1024
    unit++
  }
  return if (unit == 0) "$bytes B" else String.format(Locale.US, "%.1f %s", value, units[unit])
}
