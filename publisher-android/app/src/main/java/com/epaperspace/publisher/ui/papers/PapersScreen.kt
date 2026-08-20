package com.epaperspace.publisher.ui.papers

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.epaperspace.publisher.data.model.CreateEpaperRequest
import com.epaperspace.publisher.data.model.Edition
import com.epaperspace.publisher.data.model.Epaper
import com.epaperspace.publisher.theme.DestructiveRed
import com.epaperspace.publisher.theme.MutedForegroundLight
import com.epaperspace.publisher.theme.PrimaryRed
import com.epaperspace.publisher.ui.components.AppScaffold
import com.epaperspace.publisher.ui.components.EmptyState
import com.epaperspace.publisher.ui.components.PublisherCard
import com.epaperspace.publisher.ui.components.StatusBadge
import com.epaperspace.publisher.ui.components.StatusType
import org.koin.androidx.compose.koinViewModel

@Composable
fun PapersScreen(
  editionId: String,
  editionTitle: String,
  onBack: () -> Unit,
  onUpload: (epaperId: String, epaperTitle: String) -> Unit,
  onClickmask: (epaperId: String, pageCount: Int) -> Unit,
  viewModel: PapersViewModel = koinViewModel(),
) {
  val state by viewModel.state.collectAsStateWithLifecycle()
  var creating by remember { mutableStateOf(false) }
  var editingAccess by remember { mutableStateOf<Epaper?>(null) }
  var deleting by remember { mutableStateOf<Epaper?>(null) }

  LaunchedEffect(editionId) { viewModel.setEdition(editionId) }

  AppScaffold(
    title = editionTitle,
    onBack = onBack,
    error = state.error,
    onDismissError = viewModel::dismissError,
    loading = state.loading,
    actions = { TextButton(onClick = { creating = true }) { Text("New") } },
  ) {
    if (state.papers.isEmpty() && !state.loading) {
      EmptyState("No papers in this edition yet. Tap New to add one.")
    }

    state.papers.forEach { paper ->
      PaperCard(
        paper = paper,
        busy = state.loading,
        onUpload = { onUpload(paper.id, paper.title ?: paper.publishDate) },
        onClickmask = { onClickmask(paper.id, paper.pageCount) },
        onToggleStatus = {
          val next =
            if (paper.isPublished) Edition.STATUS_DRAFT else Edition.STATUS_PUBLISHED
          viewModel.setStatus(paper.id, next)
        },
        onAccess = { editingAccess = paper },
        onSetDefault = { viewModel.setDefault(paper.id) },
        onDelete = { deleting = paper },
      )
    }
  }

  if (creating) {
    CreatePaperDialog(
      onDismiss = { creating = false },
      onCreate = { request ->
        viewModel.create(request)
        creating = false
      },
    )
  }

  editingAccess?.let { paper ->
    AccessDialog(
      paper = paper,
      onDismiss = { editingAccess = null },
      onSave = { isFree, freePageCount ->
        viewModel.setAccess(paper.id, isFree, freePageCount)
        editingAccess = null
      },
    )
  }

  deleting?.let { paper ->
    DeletePaperDialog(
      paper = paper,
      onDismiss = { deleting = null },
      onConfirm = {
        viewModel.delete(paper.id)
        deleting = null
      },
    )
  }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PaperCard(
  paper: Epaper,
  busy: Boolean,
  onUpload: () -> Unit,
  onClickmask: () -> Unit,
  onToggleStatus: () -> Unit,
  onAccess: () -> Unit,
  onSetDefault: () -> Unit,
  onDelete: () -> Unit,
) {
  PublisherCard {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
          Text(paper.publishDate, color = MutedForegroundLight, fontSize = 12.sp)
          Text(
            text = paper.title ?: paper.publishDate,
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
          )
        }
        StatusBadge(paper.status.toStatusType())
      }

      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
      ) {
        Text(
          text = if (paper.hasPages) "${paper.pageCount} pages" else "No pages uploaded",
          color = MutedForegroundLight,
          fontSize = 12.sp,
        )
        if (paper.isDefault) {
          Text(
            text = "Default paper",
            color = PrimaryRed,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
          )
        }
      }

      FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        TextButton(onClick = onUpload, enabled = !busy) { Text("Upload pages") }
        // Nothing to mask before pages exist, so the editor is not offered at all.
        if (paper.hasPages) {
          TextButton(onClick = onClickmask, enabled = !busy) { Text("Clickmasks") }
        }
        TextButton(onClick = onToggleStatus, enabled = !busy) {
          Text(if (paper.isPublished) "Unpublish" else "Publish")
        }
        TextButton(onClick = onAccess, enabled = !busy) { Text("Access") }
        if (!paper.isDefault) {
          TextButton(onClick = onSetDefault, enabled = !busy) { Text("Make default") }
        }
        TextButton(onClick = onDelete, enabled = !busy) {
          Text("Delete", color = DestructiveRed)
        }
      }
    }
  }
}

@Composable
private fun CreatePaperDialog(
  onDismiss: () -> Unit,
  onCreate: (CreateEpaperRequest) -> Unit,
) {
  var publishDate by remember { mutableStateOf("") }
  var title by remember { mutableStateOf("") }

  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text("New paper") },
    text = {
      Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        OutlinedTextField(
          value = publishDate,
          onValueChange = { publishDate = it },
          label = { Text("Publish date") },
          placeholder = { Text("YYYY-MM-DD") },
          singleLine = true,
          modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
          value = title,
          onValueChange = { title = it },
          label = { Text("Title (optional)") },
          singleLine = true,
          modifier = Modifier.fillMaxWidth(),
        )
      }
    },
    confirmButton = {
      TextButton(
        onClick = {
          onCreate(
            CreateEpaperRequest(
              title = title.trim().ifBlank { null },
              publishDate = publishDate.trim(),
            ),
          )
        },
        enabled = publishDate.isNotBlank(),
      ) {
        Text("Create")
      }
    },
    dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
  )
}

@Composable
private fun AccessDialog(
  paper: Epaper,
  onDismiss: () -> Unit,
  onSave: (isFree: Boolean, freePageCount: Int) -> Unit,
) {
  var isFree by remember { mutableStateOf(paper.isFree) }
  var freePages by remember { mutableStateOf(paper.freePageCount.toString()) }

  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text("Access") },
    text = {
      Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.SpaceBetween,
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Text("Free for everyone")
          Switch(checked = isFree, onCheckedChange = { isFree = it })
        }
        OutlinedTextField(
          value = freePages,
          onValueChange = { freePages = it.filter(Char::isDigit) },
          label = { Text("Free pages before the paywall") },
          // A free paper has no paywall, so the allowance is meaningless (server zeroes it).
          enabled = !isFree,
          singleLine = true,
          keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
          modifier = Modifier.fillMaxWidth(),
        )
      }
    },
    confirmButton = {
      TextButton(onClick = { onSave(isFree, freePages.toIntOrNull() ?: 0) }) { Text("Save") }
    },
    dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
  )
}

@Composable
private fun DeletePaperDialog(
  paper: Epaper,
  onDismiss: () -> Unit,
  onConfirm: () -> Unit,
) {
  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text("Delete this paper?") },
    text = {
      Text(
        "${paper.title ?: paper.publishDate} and all ${paper.pageCount} uploaded pages will be " +
          "removed. This cannot be undone.",
      )
    },
    confirmButton = {
      TextButton(onClick = onConfirm) { Text("Delete", color = DestructiveRed) }
    },
    dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
  )
}

private fun String.toStatusType(): StatusType = when (this) {
  Edition.STATUS_PUBLISHED -> StatusType.PUBLISHED
  Edition.STATUS_ARCHIVED -> StatusType.ARCHIVED
  else -> StatusType.DRAFT
}
