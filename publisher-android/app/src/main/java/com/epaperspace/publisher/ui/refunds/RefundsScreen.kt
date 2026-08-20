package com.epaperspace.publisher.ui.refunds

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.epaperspace.publisher.data.model.ProcessRefundRequest
import com.epaperspace.publisher.data.model.RefundRequest
import com.epaperspace.publisher.theme.DestructiveRed
import com.epaperspace.publisher.theme.MutedForegroundLight
import com.epaperspace.publisher.theme.SuccessGreen
import com.epaperspace.publisher.theme.WarningOrange
import com.epaperspace.publisher.ui.components.AppScaffold
import com.epaperspace.publisher.ui.components.EmptyState
import com.epaperspace.publisher.ui.components.PublisherCard
import com.epaperspace.publisher.ui.components.SecondaryButton
import com.epaperspace.publisher.ui.components.SectionLabel
import java.util.Locale
import kotlin.math.abs
import org.koin.androidx.compose.koinViewModel

/** Only this status still has a server side effect; the worker 409s on anything else. */
private const val STATUS_REQUESTED = "requested"

/** Which terminal action a confirm dialog is currently holding. */
private data class PendingAction(val request: RefundRequest, val action: String)

/**
 * Reader-lane refunds only. The two lanes are separate APIs, not a field on one list: this screen
 * is wired to the tenant lane, which pays a reader out of the publisher's own Razorpay account.
 * The platform lane (the SaaS refunding the publisher) is processed by a superadmin elsewhere and
 * must never be actioned from here.
 */
@Composable
fun RefundsScreen(onBack: () -> Unit, viewModel: RefundsViewModel = koinViewModel()) {
  val state by viewModel.state.collectAsStateWithLifecycle()

  var pending by remember { mutableStateOf<PendingAction?>(null) }

  // RefundsUiState.dismissError() is a state copy, not a ViewModel setter, and the ViewModel
  // exposes no way to push it back — so dismissal is tracked here. The ViewModel clears error at
  // the start of every request, and resetting on that transition keeps a repeat message visible.
  var dismissed by remember { mutableStateOf<String?>(null) }
  LaunchedEffect(state.error) { if (state.error == null) dismissed = null }

  AppScaffold(
    title = "Reader refunds",
    onBack = onBack,
    error = state.error.takeIf { it != dismissed },
    onDismissError = { dismissed = state.error },
    loading = state.loading,
  ) {
    SectionLabel("Reader → publication")

    if (state.requests.isEmpty() && !state.loading) {
      EmptyState("No refund requests.")
      return@AppScaffold
    }

    state.requests.forEach { request ->
      RefundCard(
        request = request,
        processing = state.processingId == request.id,
        actionsEnabled = state.processingId == null,
        onAction = { action -> pending = PendingAction(request, action) },
      )
    }
  }

  pending?.let { (request, action) ->
    val reader = request.readerEmail ?: request.readerId ?: "this reader"
    val approving = action == ProcessRefundRequest.APPROVE
    // A null amount is the worker's "refund everything on file" sentinel, so it has to be spelled
    // out rather than shown as a blank.
    val amount = request.amountPaise?.let(::formatPaise) ?: "the full amount on file"

    ConfirmDialog(
      title = if (approving) "Approve refund?" else "Reject request?",
      text = if (approving) {
        "Refund $amount to $reader. This moves real money out of your Razorpay account and " +
          "cannot be undone."
      } else {
        "Reject the refund request from $reader. They will be emailed, and the request cannot be " +
          "reopened."
      },
      confirm = if (approving) "Refund $amount" else "Reject",
      onConfirm = {
        viewModel.process(request.id, action, request.amountPaise)
        pending = null
      },
      onDismiss = { pending = null },
    )
  }
}

@Composable
private fun RefundCard(
  request: RefundRequest,
  processing: Boolean,
  actionsEnabled: Boolean,
  onAction: (String) -> Unit,
) {
  PublisherCard {
    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.SpaceBetween,
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Text(
        request.readerEmail ?: request.readerId ?: "Unknown reader",
        modifier = Modifier.weight(1f),
        fontSize = 15.sp,
        fontWeight = FontWeight.SemiBold,
      )
      StatusPill(request.status)
    }

    Text(
      request.amountPaise?.let(::formatPaise) ?: "Full amount on file",
      modifier = Modifier.padding(top = 8.dp),
      fontSize = 15.sp,
      fontWeight = FontWeight.SemiBold,
    )

    request.reason?.takeIf(String::isNotBlank)?.let {
      Text(it, modifier = Modifier.padding(top = 6.dp), fontSize = 13.sp, lineHeight = 18.sp)
    }

    Row(
      modifier = Modifier
        .fillMaxWidth()
        .padding(top = 6.dp),
      horizontalArrangement = Arrangement.SpaceBetween,
      verticalAlignment = Alignment.CenterVertically,
    ) {
      request.withinPolicyWindow?.let {
        Text(
          if (it) "Within refund window" else "Outside refund window",
          color = if (it) SuccessGreen else WarningOrange,
          fontSize = 12.sp,
          fontWeight = FontWeight.Medium,
        )
      }
      request.createdAt?.let {
        Text(it.take(10), color = MutedForegroundLight, fontSize = 12.sp)
      }
    }

    if (request.status == STATUS_REQUESTED) {
      Row(
        modifier = Modifier
          .fillMaxWidth()
          .padding(top = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
      ) {
        SecondaryButton(
          text = if (processing) "Working…" else "Approve",
          onClick = { onAction(ProcessRefundRequest.APPROVE) },
          enabled = actionsEnabled,
          modifier = Modifier.weight(1f),
        )
        SecondaryButton(
          text = "Reject",
          onClick = { onAction(ProcessRefundRequest.REJECT) },
          enabled = actionsEnabled,
          modifier = Modifier.weight(1f),
        )
      }
    }
  }
}

@Composable
private fun StatusPill(status: String) {
  val (background, foreground) = when (status) {
    STATUS_REQUESTED -> Color(0x1FD97706) to WarningOrange
    "refunded" -> Color(0x1E16A34A) to SuccessGreen
    "rejected" -> Color(0x1AEF4444) to DestructiveRed
    else -> Color(0x1F64748B) to MutedForegroundLight
  }
  Surface(shape = RoundedCornerShape(50), color = background) {
    Text(
      text = status.uppercase(),
      modifier = Modifier.padding(horizontal = 10.dp, vertical = 3.dp),
      color = foreground,
      fontSize = 11.sp,
      fontWeight = FontWeight.SemiBold,
      letterSpacing = 0.5.sp,
    )
  }
}

@Composable
private fun ConfirmDialog(
  title: String,
  text: String,
  confirm: String,
  onConfirm: () -> Unit,
  onDismiss: () -> Unit,
) {
  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text(title, fontWeight = FontWeight.SemiBold) },
    text = { Text(text, fontSize = 14.sp, lineHeight = 20.sp) },
    confirmButton = {
      TextButton(onClick = onConfirm) { Text(confirm, color = DestructiveRed) }
    },
    dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
  )
}

/**
 * Rupees from integral paise — ₹1 = 100 paise exactly, and money never touches a float. Locale is
 * pinned so the digits cannot come back in a non-ASCII numbering system.
 */
private fun formatPaise(paise: Long): String =
  String.format(Locale.US, "₹%d.%02d", paise / 100, abs(paise % 100))
