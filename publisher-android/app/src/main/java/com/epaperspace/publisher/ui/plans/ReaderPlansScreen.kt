package com.epaperspace.publisher.ui.plans

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
import com.epaperspace.publisher.data.model.Plan
import com.epaperspace.publisher.data.model.Tier
import com.epaperspace.publisher.theme.MutedForegroundLight
import com.epaperspace.publisher.theme.SuccessGreen
import com.epaperspace.publisher.ui.components.AppScaffold
import com.epaperspace.publisher.ui.components.EmptyState
import com.epaperspace.publisher.ui.components.PublisherCard
import com.epaperspace.publisher.ui.components.SectionLabel
import java.util.Locale
import kotlin.math.abs
import org.koin.androidx.compose.koinViewModel

/**
 * The publisher's reader-facing catalogue: what a reader can buy and at what price.
 *
 * Read-only by design, not by omission. [ReaderPlansViewModel] exposes only `state` and `refresh()`,
 * so the create/edit/delete affordances have no method to call — a dialog here would either need
 * invented ViewModel API or would silently do nothing. Wire the mutations into the ViewModel
 * (ContentRepository already has createTier/updateTier/deleteTier and createPlan/updatePlan/
 * deletePlan) and the editor belongs here, behind a confirm dialog for anything destructive since
 * readers may hold live subscriptions against a plan.
 */
@Composable
fun ReaderPlansScreen(onBack: () -> Unit, viewModel: ReaderPlansViewModel = koinViewModel()) {
  val state by viewModel.state.collectAsStateWithLifecycle()

  // ReaderPlansUiState.dismissError() returns a state copy and the ViewModel exposes no setter to
  // push it back, so dismissal is tracked against the message itself.
  var dismissed by remember { mutableStateOf<String?>(null) }

  AppScaffold(
    title = "Reader plans",
    onBack = onBack,
    error = state.error.takeIf { it != dismissed },
    onDismissError = { dismissed = state.error },
    loading = state.loading,
    actions = {
      TextButton(onClick = viewModel::refresh, enabled = !state.loading) { Text("Refresh") }
    },
  ) {
    if (state.tiers.isEmpty() && state.plans.isEmpty() && !state.loading) {
      EmptyState("No tiers or plans yet.")
      return@AppScaffold
    }

    if (state.tiers.isNotEmpty()) {
      SectionLabel("Tiers")
      state.tiers.forEach { tier ->
        TierCard(tier = tier, plans = state.plans.filter { it.tierId == tier.id })
      }
    }

    // A plan whose tier is missing from the response would otherwise vanish from the screen while
    // still being purchasable, so it gets surfaced rather than filtered away.
    val tierIds = state.tiers.map(Tier::id).toSet()
    val orphaned = state.plans.filterNot { it.tierId in tierIds }
    if (orphaned.isNotEmpty()) {
      SectionLabel("Plans without a tier")
      PublisherCard {
        orphaned.forEachIndexed { index, plan ->
          PlanRow(plan = plan, modifier = Modifier.padding(top = if (index == 0) 0.dp else 12.dp))
        }
      }
    }
  }
}

@Composable
private fun TierCard(tier: Tier, plans: List<Plan>) {
  PublisherCard {
    Text(
      tier.name.ifBlank { "Untitled tier" },
      fontSize = 16.sp,
      fontWeight = FontWeight.SemiBold,
    )

    val features = tier.features
    if (features.isNotEmpty()) {
      Text(
        features.joinToString(" · "),
        modifier = Modifier.padding(top = 6.dp),
        color = MutedForegroundLight,
        fontSize = 13.sp,
        lineHeight = 18.sp,
      )
    }

    if (plans.isEmpty()) {
      Text(
        "No plans — readers cannot subscribe to this tier.",
        modifier = Modifier.padding(top = 12.dp),
        color = MutedForegroundLight,
        fontSize = 13.sp,
      )
      return@PublisherCard
    }

    plans.forEach { plan ->
      PlanRow(plan = plan, modifier = Modifier.padding(top = 12.dp))
    }
  }
}

@Composable
private fun PlanRow(plan: Plan, modifier: Modifier = Modifier) {
  Row(
    modifier = modifier.fillMaxWidth(),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Text(
      plan.name?.takeIf(String::isNotBlank) ?: intervalLabel(plan.interval),
      modifier = Modifier.weight(1f),
      fontSize = 14.sp,
      fontWeight = FontWeight.Medium,
    )
    Text(
      "${formatPaise(plan.pricePaise)} / ${intervalLabel(plan.interval)}",
      fontSize = 14.sp,
      fontWeight = FontWeight.SemiBold,
    )
  }

  plan.offerLabel?.takeIf(String::isNotBlank)?.let {
    Text(it, modifier = Modifier.padding(top = 2.dp), color = SuccessGreen, fontSize = 12.sp)
  }
}

private fun intervalLabel(interval: String): String = when (interval) {
  Plan.INTERVAL_MONTHLY -> "month"
  Plan.INTERVAL_6MONTH -> "6 months"
  Plan.INTERVAL_12MONTH -> "12 months"
  else -> interval
}

/**
 * Rupees from integral paise — ₹1 = 100 paise exactly, and money never touches a float. Locale is
 * pinned so the digits cannot come back in a non-ASCII numbering system.
 */
private fun formatPaise(paise: Long): String =
  String.format(Locale.US, "₹%d.%02d", paise / 100, abs(paise % 100))
