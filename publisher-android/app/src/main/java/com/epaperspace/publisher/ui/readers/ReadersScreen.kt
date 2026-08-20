package com.epaperspace.publisher.ui.readers

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import com.epaperspace.publisher.data.model.Reader
import com.epaperspace.publisher.data.model.ReaderSubscription
import com.epaperspace.publisher.theme.MutedForegroundLight
import com.epaperspace.publisher.theme.SuccessGreen
import com.epaperspace.publisher.theme.WarningOrange
import com.epaperspace.publisher.ui.components.AppScaffold
import com.epaperspace.publisher.ui.components.EmptyState
import com.epaperspace.publisher.ui.components.PublisherCard
import com.epaperspace.publisher.ui.components.SecondaryButton
import com.epaperspace.publisher.ui.components.SectionLabel
import org.koin.androidx.compose.koinViewModel

@Composable
fun ReadersScreen(onBack: () -> Unit, viewModel: ReadersViewModel = koinViewModel()) {
  val state by viewModel.state.collectAsStateWithLifecycle()

  // ReadersUiState.dismissError() returns a state copy and the ViewModel exposes no way to push it
  // back, so dismissal is tracked here. The ViewModel clears error at the start of every request,
  // and clearing the record on that transition keeps a repeat of the same message visible.
  var dismissed by remember { mutableStateOf<String?>(null) }
  LaunchedEffect(state.error) { if (state.error == null) dismissed = null }

  AppScaffold(
    title = "Readers",
    onBack = onBack,
    error = state.error.takeIf { it != dismissed },
    onDismissError = { dismissed = state.error },
    loading = state.loading,
  ) {
    if (state.canGrantSubscriptions) {
      // Display-only: the billing worker re-decides on every request, so this claim is a hint.
      SectionLabel("Manual grants")
      Text(
        "Your role can grant manual subscriptions. Issue them from the web dashboard — the app " +
          "does not create grants yet.",
        color = MutedForegroundLight,
        fontSize = 13.sp,
        lineHeight = 18.sp,
      )
    }

    if (state.readers.isEmpty() && !state.loading) {
      EmptyState("No readers yet.")
      return@AppScaffold
    }

    state.readers.forEach { reader -> ReaderCard(reader) }

    if (state.page < state.totalPages) {
      SecondaryButton(
        text = if (state.loadingMore) "Loading…" else "Load more",
        onClick = viewModel::loadNextPage,
        enabled = !state.loadingMore && !state.loading,
        modifier = Modifier.fillMaxWidth(),
      )
    }
  }
}

@Composable
private fun ReaderCard(reader: Reader) {
  PublisherCard {
    Text(
      reader.name?.takeIf(String::isNotBlank) ?: reader.email,
      fontSize = 15.sp,
      fontWeight = FontWeight.SemiBold,
    )
    Text(reader.email, color = MutedForegroundLight, fontSize = 13.sp)

    Row(
      modifier = Modifier
        .fillMaxWidth()
        .padding(top = 10.dp),
      horizontalArrangement = Arrangement.SpaceBetween,
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Text(
        if (reader.emailVerified) "Email verified" else "Email unverified",
        color = if (reader.emailVerified) SuccessGreen else WarningOrange,
        fontSize = 12.sp,
        fontWeight = FontWeight.Medium,
      )
      reader.createdAt?.let {
        Text("Joined ${it.take(10)}", color = MutedForegroundLight, fontSize = 12.sp)
      }
    }

    Text(
      subscriptionLine(reader.subscription),
      modifier = Modifier.padding(top = 6.dp),
      fontSize = 13.sp,
    )
  }
}

private fun subscriptionLine(subscription: ReaderSubscription?): String {
  if (subscription == null) return "No subscription"
  val source = when (subscription.source) {
    "manual" -> "manual grant"
    "razorpay" -> "paid"
    else -> subscription.source
  }
  return listOfNotNull(
    subscription.status.takeIf(String::isNotBlank),
    source,
    subscription.endAt?.let { "until ${it.take(10)}" },
  ).joinToString(" · ").ifEmpty { "Subscription on file" }
}
