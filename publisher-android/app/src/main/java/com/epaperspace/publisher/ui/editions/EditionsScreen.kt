package com.epaperspace.publisher.ui.editions

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
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
import com.epaperspace.publisher.data.model.Edition
import com.epaperspace.publisher.theme.DestructiveRed
import com.epaperspace.publisher.theme.MutedForegroundLight
import com.epaperspace.publisher.ui.auth.AuthField
import com.epaperspace.publisher.ui.components.AppScaffold
import com.epaperspace.publisher.ui.components.EmptyState
import com.epaperspace.publisher.ui.components.PrimaryButton
import com.epaperspace.publisher.ui.components.PublisherCard
import com.epaperspace.publisher.ui.components.StatusBadge
import com.epaperspace.publisher.ui.components.StatusType
import org.koin.androidx.compose.koinViewModel

@Composable
fun EditionsScreen(
  onBack: () -> Unit,
  onOpenEdition: (editionId: String, editionTitle: String) -> Unit,
  viewModel: EditionsViewModel = koinViewModel(),
) {
  val state by viewModel.state.collectAsStateWithLifecycle()

  var creating by remember { mutableStateOf(false) }
  var renaming by remember { mutableStateOf<Edition?>(null) }
  var deleting by remember { mutableStateOf<Edition?>(null) }

  AppScaffold(
    title = "Editions",
    onBack = onBack,
    error = state.error,
    onDismissError = viewModel::dismissError,
    loading = state.loading,
  ) {
    PrimaryButton(
      text = "New edition",
      onClick = { creating = true },
      enabled = !state.loading,
      modifier = Modifier.fillMaxWidth(),
    )

    if (state.editions.isEmpty() && !state.loading) {
      EmptyState("No editions yet. Create one to start publishing papers.")
    }

    state.editions.forEach { edition ->
      EditionRow(
        edition = edition,
        enabled = !state.loading,
        onOpen = { onOpenEdition(edition.id, edition.title) },
        onRename = { renaming = edition },
        onToggleStatus = {
          val next = if (edition.status == Edition.STATUS_PUBLISHED) {
            Edition.STATUS_DRAFT
          } else {
            Edition.STATUS_PUBLISHED
          }
          viewModel.setStatus(edition.id, next)
        },
        onDelete = { deleting = edition },
      )
    }
  }

  if (creating) {
    TitleDialog(
      title = "New edition",
      confirmText = "Create",
      initial = "",
      onConfirm = { viewModel.create(it) },
      onDismiss = { creating = false },
    )
  }

  renaming?.let { edition ->
    TitleDialog(
      title = "Rename edition",
      confirmText = "Save",
      initial = edition.title,
      onConfirm = { viewModel.rename(edition.id, it) },
      onDismiss = { renaming = null },
    )
  }

  deleting?.let { edition ->
    AlertDialog(
      onDismissRequest = { deleting = null },
      title = { Text("Delete ${edition.title}?") },
      text = {
        Text(
          "This removes the edition and every paper inside it. It cannot be undone.",
          fontSize = 14.sp,
        )
      },
      confirmButton = {
        TextButton(
          onClick = {
            viewModel.delete(edition.id)
            deleting = null
          },
        ) {
          Text("Delete", color = DestructiveRed, fontWeight = FontWeight.Medium)
        }
      },
      dismissButton = {
        TextButton(onClick = { deleting = null }) { Text("Cancel") }
      },
    )
  }
}

@Composable
private fun EditionRow(
  edition: Edition,
  enabled: Boolean,
  onOpen: () -> Unit,
  onRename: () -> Unit,
  onToggleStatus: () -> Unit,
  onDelete: () -> Unit,
) {
  PublisherCard {
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .clickable(enabled = enabled, onClick = onOpen),
      horizontalArrangement = Arrangement.SpaceBetween,
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Text(
        text = edition.title,
        fontSize = 16.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(end = 12.dp),
      )
      StatusBadge(edition.status.toStatusType())
    }

    edition.epaperCount?.let {
      Text(
        text = if (it == 1) "1 paper" else "$it papers",
        color = MutedForegroundLight,
        fontSize = 13.sp,
        modifier = Modifier.padding(top = 6.dp),
      )
    }

    Row(
      modifier = Modifier.padding(top = 12.dp),
      horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
      TextButton(onClick = onRename, enabled = enabled) {
        Text("Rename", color = MaterialTheme.colorScheme.onSurface, fontSize = 13.sp)
      }
      TextButton(onClick = onToggleStatus, enabled = enabled) {
        Text(
          text = if (edition.status == Edition.STATUS_PUBLISHED) "Unpublish" else "Publish",
          color = MaterialTheme.colorScheme.primary,
          fontSize = 13.sp,
        )
      }
      TextButton(onClick = onDelete, enabled = enabled) {
        Text("Delete", color = DestructiveRed, fontSize = 13.sp)
      }
    }
  }
}

@Composable
private fun TitleDialog(
  title: String,
  confirmText: String,
  initial: String,
  onConfirm: (String) -> Unit,
  onDismiss: () -> Unit,
) {
  var value by remember { mutableStateOf(initial) }

  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text(title) },
    text = {
      AuthField(value = value, onValueChange = { value = it }, label = "Title")
    },
    confirmButton = {
      TextButton(
        onClick = {
          onConfirm(value)
          onDismiss()
        },
      ) {
        Text(confirmText, fontWeight = FontWeight.Medium)
      }
    },
    dismissButton = {
      TextButton(onClick = onDismiss) { Text("Cancel") }
    },
  )
}

private fun String.toStatusType(): StatusType = when (this) {
  Edition.STATUS_PUBLISHED -> StatusType.PUBLISHED
  Edition.STATUS_ARCHIVED -> StatusType.ARCHIVED
  else -> StatusType.DRAFT
}
