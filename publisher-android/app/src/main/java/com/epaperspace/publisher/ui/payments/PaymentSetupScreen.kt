package com.epaperspace.publisher.ui.payments

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.epaperspace.publisher.data.model.RazorpayConfigRequest
import com.epaperspace.publisher.theme.DestructiveRed
import com.epaperspace.publisher.theme.MutedForegroundLight
import com.epaperspace.publisher.theme.SuccessGreen
import com.epaperspace.publisher.theme.WarningOrange
import com.epaperspace.publisher.ui.components.AppScaffold
import com.epaperspace.publisher.ui.components.PrimaryButton
import com.epaperspace.publisher.ui.components.PublisherCard
import com.epaperspace.publisher.ui.components.SecondaryButton
import com.epaperspace.publisher.ui.components.SectionLabel
import com.epaperspace.publisher.ui.components.WarningBanner
import org.koin.androidx.compose.koinViewModel

/**
 * The publisher's own Razorpay credentials. Everything here bills real readers, so both writes sit
 * behind a confirm step and no secret the server holds is ever rendered — the key secret is
 * write-only server-side and only [PaymentSetupUiState.keyIdLast4] identifies the live key.
 */
@Composable
fun PaymentSetupScreen(onBack: () -> Unit, viewModel: PaymentSetupViewModel = koinViewModel()) {
  val state by viewModel.state.collectAsStateWithLifecycle()

  var keyId by remember { mutableStateOf("") }
  var keySecret by remember { mutableStateOf("") }
  var confirmSave by remember { mutableStateOf(false) }
  var confirmRotate by remember { mutableStateOf(false) }

  // dismissError()/clearWebhookSecret() are UiState copies with no ViewModel setter to push them
  // back, so both dismissals are tracked here instead (same approach as RefundsScreen).
  var dismissedError by remember { mutableStateOf<String?>(null) }
  var acknowledgedSecret by remember { mutableStateOf<String?>(null) }

  // Non-secret fields are seeded from the server once loaded; re-keyed so a reload wins over stale
  // local edits, which a plain remember{} would keep showing.
  val loadedName = state.displayName.orEmpty()
  val loadedEmail = state.supportEmail.orEmpty()
  var displayName by remember(loadedName) { mutableStateOf(loadedName) }
  var supportEmail by remember(loadedEmail) { mutableStateOf(loadedEmail) }
  var processRefunds by remember(state.processRefunds) { mutableStateOf(state.processRefunds) }
  var refundWindow by remember(state.refundWindowDays) {
    mutableStateOf(state.refundWindowDays.takeIf { it > 0 }?.toString().orEmpty())
  }

  val busy = state.saving || state.loading
  val rotatedSecret = state.webhookSecret?.takeIf { it != acknowledgedSecret }

  AppScaffold(
    title = "Payment setup",
    onBack = onBack,
    error = state.error.takeIf { it != dismissedError },
    onDismissError = { dismissedError = state.error },
    loading = state.loading,
  ) {
    SectionLabel("Status")
    PublisherCard {
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Text(
          text = if (state.configured) "Keys configured" else "Not configured",
          color = if (state.configured) SuccessGreen else WarningOrange,
          fontSize = 15.sp,
          fontWeight = FontWeight.SemiBold,
        )
        state.keyIdLast4?.let {
          Text(
            text = "••••$it",
            color = MutedForegroundLight,
            fontFamily = FontFamily.Monospace,
            fontSize = 14.sp,
          )
        }
      }
      Text(
        text = if (state.configured) {
          "Reader payments go to this Razorpay account. Saving new keys replaces them immediately."
        } else {
          "Readers cannot be charged until you save a live key pair."
        },
        modifier = Modifier.padding(top = 8.dp),
        color = MutedForegroundLight,
        fontSize = 12.sp,
        lineHeight = 17.sp,
      )
    }

    SectionLabel(if (state.configured) "Replace API keys" else "API keys")
    // Masked on entry as well: these are live credentials and the screen may be shown in public.
    OutlinedTextField(
      value = keyId,
      onValueChange = { keyId = it },
      modifier = Modifier.fillMaxWidth(),
      label = { Text("Key ID") },
      enabled = !busy,
      singleLine = true,
      visualTransformation = PasswordVisualTransformation(),
      shape = RoundedCornerShape(8.dp),
    )
    OutlinedTextField(
      value = keySecret,
      onValueChange = { keySecret = it },
      modifier = Modifier.fillMaxWidth(),
      label = { Text("Key secret") },
      enabled = !busy,
      singleLine = true,
      visualTransformation = PasswordVisualTransformation(),
      shape = RoundedCornerShape(8.dp),
    )
    Text(
      text = "Both fields stay blank on load — a saved secret is never read back from the server.",
      color = MutedForegroundLight,
      fontSize = 12.sp,
      lineHeight = 17.sp,
    )

    SectionLabel("Checkout details")
    OutlinedTextField(
      value = displayName,
      onValueChange = { displayName = it },
      modifier = Modifier.fillMaxWidth(),
      label = { Text("Display name") },
      placeholder = { Text("Shown to readers at checkout") },
      enabled = !busy,
      singleLine = true,
      shape = RoundedCornerShape(8.dp),
    )
    OutlinedTextField(
      value = supportEmail,
      onValueChange = { supportEmail = it },
      modifier = Modifier.fillMaxWidth(),
      label = { Text("Support email") },
      enabled = !busy,
      singleLine = true,
      keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
      shape = RoundedCornerShape(8.dp),
    )

    SectionLabel("Refunds")
    PublisherCard {
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Column(modifier = Modifier.weight(1f)) {
          Text("Process reader refunds", fontSize = 15.sp, fontWeight = FontWeight.Medium)
          Text(
            text = "Refunds are paid out of your Razorpay balance.",
            color = MutedForegroundLight,
            fontSize = 12.sp,
            lineHeight = 17.sp,
          )
        }
        Switch(
          checked = processRefunds,
          onCheckedChange = { processRefunds = it },
          enabled = !busy,
        )
      }
    }
    OutlinedTextField(
      value = refundWindow,
      onValueChange = { input -> refundWindow = input.filter(Char::isDigit) },
      modifier = Modifier.fillMaxWidth(),
      label = { Text("Refund window (days)") },
      enabled = !busy && processRefunds,
      singleLine = true,
      keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
      shape = RoundedCornerShape(8.dp),
    )

    PrimaryButton(
      text = if (state.saving) "Saving…" else "Save payment settings",
      onClick = { confirmSave = true },
      enabled = !busy && keyId.isNotBlank() && keySecret.isNotBlank(),
      modifier = Modifier.fillMaxWidth(),
    )

    SectionLabel("Webhook secret")
    WarningBanner(
      "Rotating invalidates the current secret at once. Update it in your Razorpay dashboard " +
        "straight away or payment confirmations will start failing.",
    )
    SecondaryButton(
      text = if (state.saving) "Working…" else "Rotate webhook secret",
      onClick = { confirmRotate = true },
      enabled = !busy,
      modifier = Modifier.fillMaxWidth(),
    )
  }

  if (confirmSave) {
    ConfirmDialog(
      title = "Save these API keys?",
      body = "These keys take over reader payments for this publication immediately. A wrong or " +
        "test key pair means readers cannot be charged. Existing keys are overwritten and cannot " +
        "be recovered.",
      confirm = "Save keys",
      enabled = !state.saving,
      onConfirm = {
        confirmSave = false
        viewModel.save(
          RazorpayConfigRequest(
            keyId = keyId.trim(),
            keySecret = keySecret.trim(),
            displayName = displayName.trim().takeIf(String::isNotBlank),
            supportEmail = supportEmail.trim().takeIf(String::isNotBlank),
            processRefunds = processRefunds,
            refundWindowDays = refundWindow.toIntOrNull(),
          ),
        )
        // Cleared on submit so the live secret does not sit in composition after it is sent.
        keyId = ""
        keySecret = ""
      },
      onDismiss = { confirmSave = false },
    )
  }

  if (confirmRotate) {
    ConfirmDialog(
      title = "Rotate webhook secret?",
      body = "The current secret stops working the moment this completes. Razorpay callbacks " +
        "signed with it will be rejected until you paste the new secret into your dashboard.",
      confirm = "Rotate",
      enabled = !state.saving,
      onConfirm = {
        confirmRotate = false
        viewModel.rotateWebhookSecret()
      },
      onDismiss = { confirmRotate = false },
    )
  }

  rotatedSecret?.let { secret ->
    // The worker returns this once. Dismissing marks it acknowledged so it is never re-rendered.
    AlertDialog(
      onDismissRequest = { acknowledgedSecret = secret },
      title = { Text("New webhook secret", fontWeight = FontWeight.SemiBold) },
      text = {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
          Text(
            text = "Copy this into your Razorpay webhook settings now. It will not be shown " +
              "again — if you lose it, rotate once more.",
            fontSize = 13.sp,
            lineHeight = 18.sp,
          )
          Text(
            text = secret,
            modifier = Modifier
              .fillMaxWidth()
              .padding(vertical = 4.dp),
            color = MaterialTheme.colorScheme.onSurface,
            fontFamily = FontFamily.Monospace,
            fontSize = 14.sp,
          )
        }
      },
      confirmButton = {
        TextButton(onClick = { acknowledgedSecret = secret }) {
          Text("I have saved it", fontWeight = FontWeight.Medium)
        }
      },
    )
  }
}

@Composable
private fun ConfirmDialog(
  title: String,
  body: String,
  confirm: String,
  enabled: Boolean,
  onConfirm: () -> Unit,
  onDismiss: () -> Unit,
) {
  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text(title, fontWeight = FontWeight.SemiBold) },
    text = { Text(body, fontSize = 13.sp, lineHeight = 18.sp) },
    confirmButton = {
      TextButton(onClick = onConfirm, enabled = enabled) {
        Text(confirm, color = DestructiveRed, fontWeight = FontWeight.Medium)
      }
    },
    dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
  )
}
