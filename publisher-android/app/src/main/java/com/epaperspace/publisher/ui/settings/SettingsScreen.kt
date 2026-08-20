package com.epaperspace.publisher.ui.settings

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.epaperspace.publisher.data.model.OrgSettings
import com.epaperspace.publisher.data.model.UpdateSettingsRequest
import com.epaperspace.publisher.theme.DestructiveRed
import com.epaperspace.publisher.theme.MutedForegroundLight
import com.epaperspace.publisher.ui.components.AppScaffold
import com.epaperspace.publisher.ui.components.PrimaryButton
import com.epaperspace.publisher.ui.components.PublisherCard
import com.epaperspace.publisher.ui.components.SecondaryButton
import com.epaperspace.publisher.ui.components.SectionLabel
import org.koin.androidx.compose.koinViewModel

@Composable
fun SettingsScreen(
  onBack: () -> Unit,
  onCustomDomain: () -> Unit,
  viewModel: SettingsViewModel = koinViewModel(),
) {
  val state by viewModel.state.collectAsStateWithLifecycle()
  val settings = state.settings

  LaunchedEffect(Unit) { viewModel.load() }

  // Re-keyed on the loaded settings so the save response (which replaces state wholesale) also
  // replaces what is on screen, rather than leaving stale text in the fields.
  var orgName by remember(settings) { mutableStateOf(settings?.orgName.orEmpty()) }
  var readerTheme by remember(settings) { mutableStateOf(settings?.readerTheme.orEmpty()) }
  var footerLinks by remember(settings) { mutableStateOf(settings?.footerLinks.orEmpty()) }
  var facebook by remember(settings) { mutableStateOf(settings?.socialFacebook.orEmpty()) }
  var twitter by remember(settings) { mutableStateOf(settings?.socialTwitter.orEmpty()) }
  var instagram by remember(settings) { mutableStateOf(settings?.socialInstagram.orEmpty()) }
  var youtube by remember(settings) { mutableStateOf(settings?.socialYoutube.orEmpty()) }
  var linkedin by remember(settings) { mutableStateOf(settings?.socialLinkedin.orEmpty()) }
  var emailAuth by remember(settings) { mutableStateOf(settings?.readerAuthEmailEnabled ?: true) }
  var otpAuth by remember(settings) { mutableStateOf(settings?.readerAuthOtpEnabled ?: false) }
  var otpOnly by remember(settings) { mutableStateOf(settings?.readerAuthOtpOnly ?: false) }
  var confirmDelete by remember { mutableStateOf(false) }

  AppScaffold(
    title = "Settings",
    onBack = onBack,
    error = state.error,
    onDismissError = viewModel::dismissError,
    loading = state.loading,
  ) {
    SectionLabel("Publication")
    SettingsField(orgName, { orgName = it }, "Publication name", !state.saving)
    settings?.slug?.takeIf { it.isNotBlank() }?.let {
      // Assigned at provisioning and baked into every reader link, so it is shown, not edited.
      Text("Slug: $it", color = MutedForegroundLight, fontSize = 12.sp)
    }

    SectionLabel("Reader theme")
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .horizontalScroll(rememberScrollState()),
      horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      OrgSettings.READER_THEMES.forEach { theme ->
        if (theme == readerTheme) {
          PrimaryButton(theme, { readerTheme = theme }, enabled = !state.saving)
        } else {
          SecondaryButton(theme, { readerTheme = theme }, enabled = !state.saving)
        }
      }
    }

    SectionLabel("Reader sign-in")
    PublisherCard {
      Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        ToggleRow("Email sign-in", emailAuth, { emailAuth = it }, !state.saving)
        ToggleRow("Phone OTP sign-in", otpAuth, { otpAuth = it }, !state.saving)
        ToggleRow("Phone OTP only", otpOnly, { otpOnly = it }, !state.saving)
      }
    }

    SectionLabel("Footer and social")
    SettingsField(footerLinks, { footerLinks = it }, "Footer links", !state.saving)
    SettingsField(facebook, { facebook = it }, "Facebook", !state.saving)
    SettingsField(twitter, { twitter = it }, "Twitter", !state.saving)
    SettingsField(instagram, { instagram = it }, "Instagram", !state.saving)
    SettingsField(youtube, { youtube = it }, "YouTube", !state.saving)
    SettingsField(linkedin, { linkedin = it }, "LinkedIn", !state.saving)

    PrimaryButton(
      text = if (state.saving) "Saving…" else "Save changes",
      onClick = {
        viewModel.save(
          UpdateSettingsRequest(
            orgName = orgName,
            readerTheme = readerTheme.takeIf { it.isNotBlank() },
            readerAuthEmailEnabled = emailAuth,
            readerAuthOtpEnabled = otpAuth,
            readerAuthOtpOnly = otpOnly,
            footerLinks = footerLinks,
            socialFacebook = facebook,
            socialTwitter = twitter,
            socialInstagram = instagram,
            socialYoutube = youtube,
            socialLinkedin = linkedin,
          ),
        )
      },
      enabled = !state.saving && !state.loading,
      modifier = Modifier.fillMaxWidth(),
    )

    SectionLabel("Reader domain")
    SecondaryButton("Custom domain", onCustomDomain, Modifier.fillMaxWidth())

    SectionLabel("Danger zone")
    SecondaryButton(
      text = "Delete organisation",
      onClick = { confirmDelete = true },
      enabled = !state.deleting,
      modifier = Modifier.fillMaxWidth(),
    )
    TextButton(
      onClick = viewModel::signOut,
      modifier = Modifier.align(Alignment.CenterHorizontally),
    ) {
      Text("Sign out", color = DestructiveRed, fontWeight = FontWeight.Medium)
    }
  }

  if (confirmDelete) {
    DeleteDialog(
      publicationName = settings?.orgName.orEmpty(),
      warning = state.deleteWarning,
      deleting = state.deleting,
      onDismiss = { confirmDelete = false },
      onConfirm = {
        confirmDelete = false
        viewModel.setDeleteConfirmed(true)
        viewModel.deleteOrganization()
      },
    )
  }
}

/**
 * Teardown is irreversible and takes every reader's access with it, so the confirm button stays
 * dead until the publisher retypes the publication name exactly.
 */
@Composable
private fun DeleteDialog(
  publicationName: String,
  warning: String,
  deleting: Boolean,
  onDismiss: () -> Unit,
  onConfirm: () -> Unit,
) {
  var typed by remember { mutableStateOf("") }

  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text("Delete organisation") },
    text = {
      Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(warning, fontSize = 13.sp, lineHeight = 18.sp)
        OutlinedTextField(
          value = typed,
          onValueChange = { typed = it },
          modifier = Modifier.fillMaxWidth(),
          label = { Text("Type \"$publicationName\" to confirm") },
          singleLine = true,
          shape = RoundedCornerShape(8.dp),
        )
      }
    },
    confirmButton = {
      TextButton(
        onClick = onConfirm,
        enabled = publicationName.isNotBlank() && typed == publicationName && !deleting,
      ) {
        Text("Delete forever", color = DestructiveRed, fontWeight = FontWeight.Medium)
      }
    },
    dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
  )
}

@Composable
private fun SettingsField(
  value: String,
  onValueChange: (String) -> Unit,
  label: String,
  enabled: Boolean,
) {
  OutlinedTextField(
    value = value,
    onValueChange = onValueChange,
    modifier = Modifier.fillMaxWidth(),
    label = { Text(label) },
    enabled = enabled,
    singleLine = true,
    shape = RoundedCornerShape(8.dp),
  )
}

@Composable
private fun ToggleRow(
  label: String,
  checked: Boolean,
  onCheckedChange: (Boolean) -> Unit,
  enabled: Boolean,
) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .padding(vertical = 4.dp),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Text(label, fontSize = 14.sp)
    Switch(checked = checked, onCheckedChange = onCheckedChange, enabled = enabled)
  }
}
