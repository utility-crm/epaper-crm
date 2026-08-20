package com.epaperspace.publisher.ui.domain

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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.epaperspace.publisher.theme.DestructiveRed
import com.epaperspace.publisher.theme.MutedForegroundLight
import com.epaperspace.publisher.theme.SuccessGreen
import com.epaperspace.publisher.theme.WarningOrange
import com.epaperspace.publisher.ui.components.AppScaffold
import com.epaperspace.publisher.ui.components.EmptyState
import com.epaperspace.publisher.ui.components.PrimaryButton
import com.epaperspace.publisher.ui.components.PublisherCard
import com.epaperspace.publisher.ui.components.SecondaryButton
import com.epaperspace.publisher.ui.components.SectionLabel
import com.epaperspace.publisher.ui.components.SuccessBanner
import org.koin.androidx.compose.koinViewModel

@Composable
fun CustomDomainScreen(onBack: () -> Unit, viewModel: CustomDomainViewModel = koinViewModel()) {
  val state by viewModel.state.collectAsStateWithLifecycle()
  val info = state.info
  var confirmRemove by remember { mutableStateOf(false) }

  LaunchedEffect(Unit) { viewModel.load() }

  AppScaffold(
    title = "Custom domain",
    onBack = onBack,
    error = state.error,
    onDismissError = viewModel::dismissError,
    loading = state.loading,
  ) {
    SuccessBanner(state.message)

    SectionLabel("Current domain")
    if (state.hasDomain && info != null) {
      PublisherCard {
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
          Text(
            text = info.domain.orEmpty(),
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
          )
          DetailRow(
            label = "Verification",
            value = if (info.verified) "Verified" else "Pending",
            valueColor = if (info.verified) SuccessGreen else WarningOrange,
          )
          info.status?.takeIf { it.isNotBlank() }?.let { DetailRow("Hostname status", it) }
          info.sslStatus?.takeIf { it.isNotBlank() }?.let { DetailRow("SSL certificate", it) }
        }
      }
    } else {
      EmptyState("No custom domain yet. Readers use your epaperspace link.")
    }

    SectionLabel(if (state.hasDomain) "Change domain" else "Add domain")
    OutlinedTextField(
      value = state.domain,
      onValueChange = viewModel::onDomainChange,
      modifier = Modifier.fillMaxWidth(),
      label = { Text("Hostname") },
      placeholder = { Text("paper.example.com") },
      enabled = !state.setting,
      singleLine = true,
      keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
      shape = RoundedCornerShape(8.dp),
    )
    PrimaryButton(
      text = if (state.setting) "Saving…" else "Save domain",
      onClick = viewModel::setDomain,
      enabled = !state.setting && state.domain.isNotBlank(),
      modifier = Modifier.fillMaxWidth(),
    )

    SectionLabel("DNS record")
    PublisherCard {
      Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        DetailRow("Type", "CNAME", monospace = true)
        DetailRow("Name", state.domain.ifBlank { info?.domain.orEmpty() }, monospace = true)
        DetailRow("Value", state.cnameTarget, monospace = true)
        Text(
          text = "Add this at your DNS provider, then verify. Propagation can take a few minutes.",
          color = MutedForegroundLight,
          fontSize = 12.sp,
          lineHeight = 17.sp,
          modifier = Modifier.padding(top = 6.dp),
        )
      }
    }

    if (state.hasDomain) {
      SecondaryButton(
        text = if (state.verifying) "Checking…" else "Verify now",
        onClick = viewModel::verify,
        enabled = !state.verifying && !state.setting,
        modifier = Modifier.fillMaxWidth(),
      )

      SectionLabel("Danger zone")
      SecondaryButton(
        text = "Remove domain",
        onClick = { confirmRemove = true },
        enabled = !state.setting,
        modifier = Modifier.fillMaxWidth(),
      )
    }
  }

  if (confirmRemove) {
    // Removal stops serving at the hostname immediately; any reader bookmark to it breaks.
    AlertDialog(
      onDismissRequest = { confirmRemove = false },
      title = { Text("Remove custom domain") },
      text = {
        Text(
          text = "Readers who visit ${info?.domain.orEmpty()} will stop reaching your " +
            "publication and fall back to your epaperspace link. You can add the domain again " +
            "later, but the certificate has to be reissued.",
          fontSize = 13.sp,
          lineHeight = 18.sp,
        )
      },
      confirmButton = {
        TextButton(
          onClick = {
            confirmRemove = false
            viewModel.removeDomain()
          },
          enabled = !state.setting,
        ) {
          Text("Remove", color = DestructiveRed, fontWeight = FontWeight.Medium)
        }
      },
      dismissButton = { TextButton(onClick = { confirmRemove = false }) { Text("Cancel") } },
    )
  }
}

@Composable
private fun DetailRow(
  label: String,
  value: String,
  valueColor: Color? = null,
  monospace: Boolean = false,
) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .padding(vertical = 5.dp),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Text(label, color = MutedForegroundLight, fontSize = 13.sp)
    Text(
      text = value.ifBlank { "—" },
      color = valueColor ?: MaterialTheme.colorScheme.onSurface,
      fontSize = 14.sp,
      fontWeight = FontWeight.Medium,
      fontFamily = if (monospace) FontFamily.Monospace else null,
    )
  }
}

@Composable
private fun MaterialThemeOnSurface() =
  androidx.compose.material3.MaterialTheme.colorScheme.onSurface
