package com.epaperspace.publisher.ui.platform

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.epaperspace.publisher.data.model.PlatformTier
import com.epaperspace.publisher.theme.MutedForegroundLight
import com.epaperspace.publisher.theme.SuccessGreen
import com.epaperspace.publisher.ui.components.AppScaffold
import com.epaperspace.publisher.ui.components.EmptyState
import com.epaperspace.publisher.ui.components.PublisherCard
import com.epaperspace.publisher.ui.components.SectionLabel
import java.util.Locale
import kotlin.math.abs
import org.koin.androidx.compose.koinViewModel

/** The worker's "this subscription is live" status; anything else is not a paying state. */
private const val STATUS_ACTIVE = "active"

/**
 * Platform lane: what the publisher pays the SaaS. Distinct from the tenant lane the publisher runs
 * against its own Razorpay account — never action a reader's money from here.
 *
 * Read-only by design, not by omission. [PlatformBillingViewModel] exposes only `state` and
 * `refresh()`, so plan changes and cancellation have no method to call. BillingRepository already
 * has subscribeToPlatformPlan/verifyPlatformPayment/cancelPlatformSubscription; once those are
 * surfaced on the ViewModel the actions belong here, with cancel behind a confirm dialog.
 */
@Composable
fun PlatformBillingScreen(onBack: () -> Unit, viewModel: PlatformBillingViewModel = koinViewModel()) {
  val state by viewModel.state.collectAsStateWithLifecycle()

  // PlatformBillingUiState.dismissError() returns a state copy and the ViewModel exposes no setter
  // to push it back, so dismissal is tracked against the message itself.
  var dismissed by remember { mutableStateOf<String?>(null) }

  AppScaffold(
    title = "Platform billing",
    onBack = onBack,
    error = state.error.takeIf { it != dismissed },
    onDismissError = { dismissed = state.error },
    loading = state.loading,
    actions = {
      TextButton(onClick = viewModel::refresh, enabled = !state.loading) { Text("Refresh") }
    },
  ) {
    val status = state.status

    if (status == null && state.tiers.isEmpty() && !state.loading) {
      EmptyState("No subscription information available.")
      return@AppScaffold
    }

    if (status != null) {
      SectionLabel("Current subscription")

      // The status route reports a plan name, not a price, so the charge amount is read off the
      // matching tier. An unmatched name means the amount is genuinely unknown — better blank than
      // a confidently wrong number.
      val current = state.tiers.firstOrNull { it.name.equals(status.plan, ignoreCase = true) }

      PublisherCard {
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.SpaceBetween,
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Text(
            status.plan?.takeIf(String::isNotBlank) ?: "No plan",
            modifier = Modifier.weight(1f),
            fontSize = 18.sp,
            fontWeight = FontWeight.SemiBold,
          )
          status.status?.takeIf(String::isNotBlank)?.let {
            Text(
              it.uppercase(),
              color = if (it == STATUS_ACTIVE) SuccessGreen else MutedForegroundLight,
              fontSize = 11.sp,
              fontWeight = FontWeight.SemiBold,
              letterSpacing = 0.5.sp,
            )
          }
        }

        current?.let {
          DetailRow(
            label = if (status.status == STATUS_ACTIVE) "Next charge" else "Plan price",
            value = formatPaise(it.pricePaise),
          )
        }
        status.currentEnd?.takeIf(String::isNotBlank)?.let {
          DetailRow(
            label = if (status.status == STATUS_ACTIVE) "Renews on" else "Ends on",
            value = it.take(10),
          )
        }
        status.source?.takeIf(String::isNotBlank)?.let { DetailRow(label = "Billed via", value = it) }
      }
    }

    if (state.tiers.isNotEmpty()) {
      SectionLabel("Available plans")
      state.tiers.forEach { tier ->
        TierCard(tier = tier, isCurrent = tier.name.equals(status?.plan, ignoreCase = true))
      }
    }
  }
}

@Composable
private fun TierCard(tier: PlatformTier, isCurrent: Boolean) {
  PublisherCard {
    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.SpaceBetween,
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Text(
        tier.name.ifBlank { "Untitled plan" },
        modifier = Modifier.weight(1f),
        fontSize = 16.sp,
        fontWeight = FontWeight.SemiBold,
      )
      Text(
        "${formatPaise(tier.pricePaise)} / month",
        fontSize = 15.sp,
        fontWeight = FontWeight.SemiBold,
      )
    }

    if (isCurrent) {
      Text(
        "Current plan",
        modifier = Modifier.padding(top = 4.dp),
        color = SuccessGreen,
        fontSize = 12.sp,
        fontWeight = FontWeight.Medium,
      )
    }

    if (tier.features.isNotEmpty()) {
      Text(
        tier.features.joinToString(" · "),
        modifier = Modifier.padding(top = 8.dp),
        color = MutedForegroundLight,
        fontSize = 13.sp,
        lineHeight = 18.sp,
      )
    }

    tier.maxStorageMb?.let { DetailRow(label = "Storage", value = "$it MB") }
    tier.maxViewsPerDay?.let { DetailRow(label = "Views per day", value = "$it") }
    tier.maxPapersPerDay?.let { DetailRow(label = "Papers per day", value = "$it") }
    tier.maxSimultaneousEditions?.let { DetailRow(label = "Simultaneous editions", value = "$it") }
  }
}

@Composable
private fun DetailRow(label: String, value: String) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .padding(top = 8.dp),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Text(label, color = MutedForegroundLight, fontSize = 13.sp)
    Text(value, fontSize = 13.sp, fontWeight = FontWeight.Medium)
  }
}

/**
 * Rupees from integral paise — ₹1 = 100 paise exactly, and money never touches a float. Locale is
 * pinned so the digits cannot come back in a non-ASCII numbering system.
 */
private fun formatPaise(paise: Long): String =
  String.format(Locale.US, "₹%d.%02d", paise / 100, abs(paise % 100))
